"""Python side of the C# self-play server (tools/sim). Binary protocol: see tools/sim/Server.cs."""
import subprocess
import struct
import numpy as np
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
DLL = ROOT / 'tools' / 'sim' / 'bin' / 'Release' / 'net8.0' / 'ProvinceSim.dll'
DLL_PACKED = ROOT / 'tools' / 'sim' / 'bin2' / 'ProvinceSim.dll'
DLL_RR = ROOT / 'tools' / 'sim' / 'bin3' / 'ProvinceSim.dll'   # server with the re-roll protocol (see tools/sim/Server.cs)
PLANES, SCALARS = 12, 10


def packed_len(size):
    C = size * size
    return 2 * C + (10 * C + 7) // 8 + SCALARS


class Sim:
    def __init__(self, size=6, slots=64, seed=1, max_turns=300, packed=False, reroll=False):
        self.size, self.G, self.packed, self.reroll = size, slots, packed, reroll
        self.cells = size * size
        self.F = packed_len(size) if packed else PLANES * self.cells + SCALARS
        self.p = subprocess.Popen(['dotnet', str(DLL_RR if reroll else DLL_PACKED if packed else DLL), 'serve', str(size), str(slots), str(seed), str(max_turns)] + (['packed'] if packed else []) + (['reroll'] if reroll else []),
                                  stdin=subprocess.PIPE, stdout=subprocess.PIPE, bufsize=0)

    def _read(self, n):
        buf = bytearray(n); mv = memoryview(buf); got = 0
        while got < n:
            r = self.p.stdout.readinto(mv[got:])
            if not r:
                raise EOFError('simulator closed')
            got += r
        return buf

    def frame(self):
        """-> dict(nc[G], mover[G], finished[G], prog[G,2], held[G,2], feats[total,F] uint8, term[total] uint8, offs[G+1])"""
        G = struct.unpack('<i', self._read(4))[0]
        k = 8 if self.reroll else 7
        h = np.frombuffer(self._read(4 * k * G), dtype='<i4').reshape(G, k)
        total = int(h[:, 0].sum())
        feats = np.frombuffer(self._read(total * self.F), dtype=np.uint8).reshape(total, self.F)
        term = np.frombuffer(self._read(total), dtype=np.uint8)
        offs = np.concatenate([[0], np.cumsum(h[:, 0])])
        out = dict(nc=h[:, 0], mover=h[:, 1], finished=h[:, 2], prog=h[:, 3:5], held=h[:, 5:7], feats=feats, term=term, offs=offs)
        if self.reroll:   # can_rr: this is the first roll of the turn (the player may answer -2 = re-roll); pre: the position before the roll, as the opponent's afterstate
            out['can_rr'] = h[:, 7]
            out['pre'] = np.frombuffer(self._read(G * self.F), dtype=np.uint8).reshape(G, self.F)
        return out

    def choose(self, idx):
        """idx: per-slot chosen candidate index (relative to that slot's candidates); -2 = re-roll (re-roll mode only)"""
        self.p.stdin.write(np.asarray(idx, dtype='<i4').tobytes())

    def close(self):
        try:
            self.p.stdin.write(np.full(self.G, -1, dtype='<i4').tobytes())
            self.p.stdin.close()
        except Exception:
            pass
        self.p.terminate()


if __name__ == '__main__':   # speed test with random choices
    import time, sys
    size = int(sys.argv[1]) if len(sys.argv) > 1 else 6
    sim = Sim(size, 64)
    rng = np.random.default_rng(0)
    t0 = time.time(); steps = 0; cands = 0; games = 0; wins = [0, 0, 0]
    while time.time() - t0 < 20:
        f = sim.frame(); steps += 1; cands += int(f['nc'].sum())
        for fin in f['finished']:
            if fin >= -1 and fin != -2:
                games += 1; wins[fin if fin >= 0 else 2] += 1
        sim.choose((rng.random(sim.G) * f['nc']).astype(np.int32))
    dt = time.time() - t0
    print(f'{steps} steps, {steps*sim.G/dt:.0f} decisions/s, avg candidates {cands/(steps*sim.G):.0f}, games {games}, wins {wins}, F={sim.F}')
    sim.close()
