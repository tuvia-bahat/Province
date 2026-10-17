"""Synthesizes an original soundtrack + sound effects for the teaser (20s, synced to tools/make_trailer.py) and muxes it into the video.
Requires: numpy, imageio-ffmpeg.  Run: python tools/make_music.py   -> promo/province-trailer-music.mp4 (and promo/province-trailer-music.wav)
Nothing here is sampled or copyrighted: every sound is generated from sine/triangle waves and noise.
"""
import subprocess
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'promo'
SR = 44100
DUR = 20.0
N = int(SR * DUR)
BPM = 120
BEAT = 60 / BPM
rng = np.random.default_rng(7)

L = np.zeros(N); R = np.zeros(N)


def mtof(m): return 440.0 * 2 ** ((m - 69) / 12)


def add(buf_pair, t0, sig, gain=1.0, pan=0.0):
    i0 = int(t0 * SR)
    if i0 >= N or i0 + len(sig) <= 0: return
    a = max(0, -i0); sig = sig[a:]; i0 = max(0, i0)
    k = min(len(sig), N - i0)
    l = gain * (1 - max(0, pan)) ; r = gain * (1 + min(0, pan))
    buf_pair[0][i0:i0 + k] += sig[:k] * l
    buf_pair[1][i0:i0 + k] += sig[:k] * r


def tarr(d): return np.arange(int(d * SR)) / SR


def env_adsr(d, a=0.01, dcy=0.1, s=0.7, r=0.1):
    t = tarr(d); e = np.ones_like(t)
    e = np.where(t < a, t / max(a, 1e-6), e)
    e = np.where((t >= a) & (t < a + dcy), 1 - (1 - s) * (t - a) / max(dcy, 1e-6), e)
    e = np.where(t >= a + dcy, s, e)
    e = e * np.clip((d - t) / max(r, 1e-6), 0, 1)
    return e


def lowpass(x, n):   # moving-average lowpass
    if n <= 1: return x
    k = np.ones(n) / n
    return np.convolve(x, k, mode='same')


def sine(f, d): return np.sin(2 * np.pi * f * tarr(d))
def tri(f, d): return 2 / np.pi * np.arcsin(np.sin(2 * np.pi * f * tarr(d)))
def noise(d): return rng.uniform(-1, 1, int(d * SR))


# ---------- instruments ----------
def kick(t0, g=1.0):
    d = 0.35; t = tarr(d)
    f = 45 + 95 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    sig = np.sin(ph) * np.exp(-t * 11)
    add((L, R), t0, sig, 0.9 * g)


def hat(t0, g=1.0, d=0.06):
    n = noise(d); n = n - lowpass(n, 6)   # crude highpass
    add((L, R), t0, n * np.exp(-tarr(d) * 70), 0.12 * g, pan=0.25)


def snare(t0, g=1.0):
    d = 0.18; t = tarr(d)
    n = noise(d); n = n - lowpass(n, 4)
    add((L, R), t0, (n * 0.8 + np.sin(2 * np.pi * 190 * t) * 0.3) * np.exp(-t * 22), 0.32 * g)


def bass(t0, m, d, g=1.0):
    f = mtof(m)
    sig = (sine(f, d) + 0.25 * sine(2 * f, d)) * env_adsr(d, 0.01, 0.1, 0.8, 0.08)
    add((L, R), t0, sig, 0.5 * g)


def pad(t0, notes, d, g=1.0):
    sig = 0
    for m in notes:
        f = mtof(m)
        for det in (-0.004, 0.0, 0.004):
            sig = sig + tri(f * (1 + det), d) * 0.14
    sig = lowpass(sig, 6) * env_adsr(d, 0.5, 0.2, 0.85, 0.7)
    add((L, R), t0, sig, 0.55 * g)


def pluck(t0, m, g=1.0, pan=0.0, d=0.5):
    f = mtof(m); t = tarr(d)
    sig = (tri(f, d) * 0.7 + sine(2 * f, d) * 0.25) * np.exp(-t * 7.5)
    add((L, R), t0, lowpass(sig, 3), 0.32 * g, pan)


def bell(t0, m, g=1.0, pan=0.0, d=1.4):
    f = mtof(m); t = tarr(d)
    sig = (sine(f, d) + 0.5 * sine(f * 2.01, d) * np.exp(-t * 3) + 0.25 * sine(f * 3.99, d) * np.exp(-t * 6)) * np.exp(-t * 2.6)
    add((L, R), t0, sig, 0.3 * g, pan)


def whoosh(t0, d=0.6, up=True, g=1.0):
    n = noise(d); t = tarr(d)
    sig = lowpass(n, 28) * (t / d if up else 1 - t / d) ** 1.5
    add((L, R), t0, sig, 0.8 * g)


def pop(t0, g=1.0, f0=720):
    d = 0.18; t = tarr(d)
    f = f0 * np.exp(-t * 9) + 260
    sig = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 18)
    add((L, R), t0, sig, 0.55 * g)


def tick(t0, g=1.0):
    d = 0.03; n = noise(d); n = lowpass(n, 3)
    add((L, R), t0, n * np.exp(-tarr(d) * 160), 0.5 * g, pan=rng.uniform(-.3, .3))


def clash(t0):
    d = 0.9; t = tarr(d)
    n = noise(d); n = n - lowpass(n, 5)
    add((L, R), t0, n * np.exp(-t * 9) * 0.7, 0.6)
    add((L, R), t0, np.sin(2 * np.pi * (60 + 50 * np.exp(-t * 20)) * t) * np.exp(-t * 6), 0.9)


def crash(t0, g=1.0):
    d = 1.6; t = tarr(d)
    n = noise(d); n = n - lowpass(n, 5)
    add((L, R), t0, n * np.exp(-t * 2.6), 0.25 * g)


# ---------- arrangement ----------
CH = [([48, 52, 55], 36), ([43, 47, 50], 31), ([45, 48, 52], 33), ([41, 45, 48], 29)]   # (triad, bass root)
bars = int(DUR / (4 * BEAT))   # 10 bars of 2s
for b in range(bars):
    t0 = b * 4 * BEAT
    tri_, root = CH[b % 4]
    last = b == bars - 1
    d = 4 * BEAT + (1.0 if last else 0.15)
    if t0 >= 0.4: pad(t0, [m + 12 for m in tri_], d, 1.0)
    # arpeggio (8th notes) from 2.6s
    if t0 + 4 * BEAT > 2.6 and not last:
        pat = [0, 1, 2, 1, 2, 1, 0, 1]
        for i in range(8):
            tt = t0 + i * BEAT / 2
            if tt >= 2.6 and tt < 17.0:
                m = tri_[pat[i] % 3] + 24 + (12 if i == 7 and b % 2 else 0)
                pluck(tt, m, 1.0 if tt < 5.4 else 0.85, pan=-0.2 if i % 2 else 0.2)
    # bass from 5.4s, drums
    for beat in range(4):
        tt = t0 + beat * BEAT
        if 5.4 <= tt < 17.0:
            bass(tt, root + (12 if beat == 3 else 0), BEAT * 0.9, 1.0)
            kick(tt, 1.0)
        if 8.1 <= tt < 17.0:
            hat(tt + BEAT / 2, 1.0)
            if beat in (1, 3): snare(tt, 0.7)
# build-up 11.0-14.4: faster hats and a snare roll into the win
for i in range(int((13.9 - 12.4) / 0.125)):
    tt = 12.4 + i * 0.125
    snare(tt, 0.35 + 0.65 * (tt - 12.4) / 1.5)
crash(14.4, 1.0); kick(14.4, 1.2)
# end card: soft chord + resolve
for m in (60, 64, 67, 72):
    bell(17.2, m, 0.8, pan=(m - 66) / 14)
bell(18.4, 79, 0.9)
bell(18.45, 84, 0.7)

# ---------- sound effects (synced with the video timeline) ----------
for i in range(14): tick(3.0 + i * 0.05 + 0.0006 * i * i, 0.8)       # dice tumble
for i in range(8): tick(3.55 + i * 0.07, 0.6)
pop(3.85, 0.8, 520); pop(3.9, 0.7, 640)                               # dice land
whoosh(2.55, 0.5, True, 0.5)                                         # board appears
pop(5.5, 1.0); [pop(5.7 + k * 0.1, 0.3, 500 + 40 * k) for k in range(7)]   # green lands + count
pop(6.3, 0.9, 480)                                                   # blue lands
pop(8.8, 1.0); [pop(8.9 + k * 0.12, 0.3, 520 + 40 * k) for k in range(3)]
whoosh(9.5, 0.5, True, 0.9)                                           # bridge
pop(11.0, 0.8, 460); pop(11.3, 0.9); pop(11.8, 0.8); pop(12.4, 0.8)
whoosh(12.1, 0.4, True, 0.7); whoosh(12.7, 0.4, True, 0.7)
whoosh(12.95, 0.55, True, 0.9)                                       # attack token flies
clash(13.45)                                                         # clash
pop(14.0, 1.0, 600)                                                  # conquered square
whoosh(14.0, 0.5, True, 0.8)
for k, m in enumerate([72, 76, 79, 84, 88]):                         # win sparkle
    bell(14.4 + k * 0.12, m, 0.85, pan=(k - 2) / 4)
for k in range(5):                                                   # HUD squares filling
    pass
pop(18.4, 0.9, 700)                                                   # button pops in
pop(0.45, 0.8, 620); bell(0.55, 76, 0.9); bell(1.0, 83, 0.6); bell(1.5, 88, 0.4)   # logo pop in the opening

# ---------- master ----------
mix = np.stack([L, R], axis=1)
# gentle fade in/out
fade_in = np.clip(np.arange(N) / (0.25 * SR), 0, 1)
fade_out = np.clip((N - np.arange(N)) / (1.4 * SR), 0, 1)
mix *= (fade_in * fade_out)[:, None]
mix = np.tanh(mix * 1.15)
peak = np.max(np.abs(mix)); mix = mix / peak * 0.89   # about -1 dBFS
pcm = (mix * 32767).astype(np.int16)

OUT.mkdir(exist_ok=True)
wav = OUT / 'province-trailer-music.wav'
with wave.open(str(wav), 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('wrote', wav, f'peak={peak:.2f} rms={np.sqrt((mix ** 2).mean()):.3f}')

import imageio_ffmpeg
ff = imageio_ffmpeg.get_ffmpeg_exe()
src = OUT / 'province-trailer.mp4'
dst = OUT / 'province-trailer-music.mp4'
subprocess.run([ff, '-y', '-loglevel', 'error', '-i', str(src), '-i', str(wav), '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', str(dst)], check=True)
print('wrote', dst)
