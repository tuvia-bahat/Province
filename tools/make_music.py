"""Synthesizes an original driving electronic soundtrack (120 BPM, A minor) for the Province teaser and muxes it into the video.
The arrangement is locked to tools/make_trailer.py: 10 bars of 2s; drums enter at 2s, full groove at 6s, snare build 10-12s, DROP at 12s,
breakdown on the end card at 16s.  Requires: numpy, imageio-ffmpeg.
Run: python tools/make_music.py   ->  promo/province-trailer-music.mp4 (+ .wav)
Nothing is sampled or copyrighted: every sound is generated from waves and noise, with sidechain pumping, delay and reverb.
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
BEAT = 60 / BPM          # 0.5s
BAR = 4 * BEAT           # 2.0s
rng = np.random.default_rng(5)
T = np.arange(N) / SR

# buses (stereo): drums/fx are dry, music buses get sidechain ducking; WET = reverb send, DLY = delay send
def bus(): return [np.zeros(N), np.zeros(N)]
DRUM, BASS, PAD, ARP, FX, WET, DLY = bus(), bus(), bus(), bus(), bus(), bus(), bus()


def mtof(m): return 440.0 * 2 ** ((m - 69) / 12)
def tarr(d): return np.arange(int(d * SR)) / SR
def noise(d): return rng.uniform(-1, 1, int(d * SR))


def lowpass(x, n):
    return x if n <= 1 else np.convolve(x, np.ones(n) / n, mode='same')


def highpass(x, n): return x - lowpass(x, n)


def put(b, t0, sig, g=1.0, pan=0.0, wet=0.0, dly=0.0):
    i0 = int(t0 * SR)
    if i0 >= N or i0 + len(sig) <= 0: return
    a = max(0, -i0); sig = sig[a:]; i0 = max(0, i0)
    k = min(len(sig), N - i0); s = sig[:k]
    l = g * (1 - max(0, pan)); r = g * (1 + min(0, pan))
    b[0][i0:i0 + k] += s * l; b[1][i0:i0 + k] += s * r
    if wet: WET[0][i0:i0 + k] += s * l * wet; WET[1][i0:i0 + k] += s * r * wet
    if dly: DLY[0][i0:i0 + k] += s * l * dly; DLY[1][i0:i0 + k] += s * r * dly


def adsr(d, a, dcy, s, r):
    t = tarr(d)
    e = np.where(t < a, t / max(a, 1e-6), 1.0)
    e = np.where((t >= a) & (t < a + dcy), 1 - (1 - s) * (t - a) / max(dcy, 1e-6), e)
    e = np.where(t >= a + dcy, s, e)
    return e * np.clip((d - t) / max(r, 1e-6), 0, 1)


def saw(f, d, harm=10, det=0.0):
    t = tarr(d); s = 0
    for k in range(1, harm + 1):
        if f * k > 9000: break
        s = s + np.sin(2 * np.pi * f * (1 + det) * k * t) / k
    return s * 0.6


# ---------- drums ----------
def kick(t0, g=1.0):
    d = 0.4; t = tarr(d)
    f = 42 + 130 * np.exp(-t * 32)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9.5)
    click = highpass(noise(0.012), 3) * np.exp(-tarr(0.012) * 400)
    s = np.tanh(1.6 * body)
    s[: len(click)] += click * 0.5
    put(DRUM, t0, s, 0.62 * g)


def clap(t0, g=1.0):
    d = 0.28; t = tarr(d)
    n = highpass(lowpass(noise(d), 3), 12) * 0
    n = lowpass(highpass(noise(d), 10), 2)
    env = np.exp(-t * 17)
    for off in (0.0, 0.011, 0.022):   # layered claps
        env = env + np.where(t >= off, np.exp(-(t - off) * 60), 0) * 0.8
    put(DRUM, t0, n * env * 0.5, 0.9 * g, wet=0.25)


def hat(t0, g=1.0, open_=False):
    d = 0.28 if open_ else 0.05
    n = highpass(noise(d), 4)
    put(DRUM, t0, n * np.exp(-tarr(d) * (13 if open_ else 80)), 0.24 * g, pan=0.3)


def snare(t0, g=1.0):
    d = 0.2; t = tarr(d)
    n = highpass(noise(d), 5)
    put(DRUM, t0, (n * 0.7 + np.sin(2 * np.pi * 185 * t) * 0.3) * np.exp(-t * 20), 0.4 * g, wet=0.2)


# ---------- music ----------
def bass_note(t0, m, d, g=1.0):
    f = mtof(m)
    s = (lowpass(saw(f, d, 14), 9) * 0.55 + np.sin(2 * np.pi * f * tarr(d)) * 0.9)
    s = np.tanh(1.5 * s) * adsr(d, 0.004, 0.08, 0.75, 0.05)
    put(BASS, t0, s, 0.3 * g)


def pad_chord(t0, notes, d, g=1.0):
    s = 0
    for m in notes:
        for det in (-0.006, -0.002, 0.0, 0.002, 0.006):
            s = s + saw(mtof(m), d, 7, det) * 0.07
    s = lowpass(s, 4) * adsr(d, 0.35, 0.3, 0.85, 0.5)
    put(PAD, t0, s, 1.0 * g, wet=0.25)


def pluck(t0, m, g=1.0, pan=0.0, d=0.45):
    f = mtof(m); t = tarr(d)
    s = saw(f, d, 9) * np.exp(-t * 9)
    s = lowpass(s, 3)
    put(ARP, t0, s, 0.62 * g, pan, wet=0.15, dly=0.55)


def stab(t0, notes, d=0.5, g=1.0):
    s = 0
    for m in notes:
        for det in (-0.005, 0.0, 0.005):
            s = s + saw(mtof(m), d, 8, det) * 0.1
    s = lowpass(s, 3) * adsr(d, 0.004, 0.12, 0.45, 0.2)
    put(PAD, t0, s, 1.1 * g, wet=0.3)


def riser(t0, d, g=1.0):
    t = tarr(d); x = (t / d)
    n = highpass(noise(d), 6) * x ** 2.2
    sw = np.sin(2 * np.pi * np.cumsum(220 * 2 ** (3.2 * x)) / SR) * x ** 2
    put(FX, t0, n * 0.4 + sw * 0.12, g, wet=0.4)


def impact(t0, g=1.0, d=2.4):
    t = tarr(d)
    f = 30 + 70 * np.exp(-t * 6)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.6)
    n = lowpass(noise(d), 24) * np.exp(-t * 4)
    put(FX, t0, s * 0.9 + n * 0.4, 0.55 * g, wet=0.35)


def crash(t0, g=1.0, d=2.2):
    t = tarr(d)
    put(FX, t0, highpass(noise(d), 6) * np.exp(-t * 2.4), 0.2 * g, wet=0.5)


def zap(t0, f0, f1, d=0.18, g=1.0, wet=0.3):
    t = tarr(d); f = f0 * (f1 / f0) ** (t / d)
    put(FX, t0, np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 14), 0.3 * g, wet=wet)


def whoosh(t0, d=0.6, g=1.0, up=True):
    t = tarr(d)
    s = lowpass(noise(d), 30) * ((t / d) ** 1.5 if up else (1 - t / d) ** 1.5)
    put(FX, t0, s, 0.7 * g, wet=0.4)


def bell(t0, m, g=1.0, pan=0.0, d=2.0):
    f = mtof(m); t = tarr(d)
    s = (np.sin(2 * np.pi * f * t) + 0.45 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 4)) * np.exp(-t * 2.4)
    put(FX, t0, s * np.minimum(1, t / 0.003), 0.26 * g, pan, wet=0.8, dly=0.3)


# ---------- arrangement ----------
# chords per bar (A minor): Am F C G, repeated; triad (octave 3/4) + bass root
CH = {'Am': ([57, 60, 64], 33), 'F': ([53, 57, 60], 29), 'C': ([55, 60, 64], 36), 'G': ([55, 59, 62], 31)}
SEQ = ['Am', 'F', 'C', 'G', 'Am', 'F', 'C', 'G', 'Am', 'F']
for b, name in enumerate(SEQ):
    t0 = b * BAR
    triad, root = CH[name]
    d = BAR + 0.25
    pad_chord(t0, [m + 12 for m in triad] + [triad[0]], d + (1.5 if b == len(SEQ) - 1 else 0), 0.7 if b < 1 else 1.0)
    # bass: off-beat eighths (the "and" of each beat) from bar 3 (6s); sparse before the drop
    if 6.0 <= t0 < 16.0 and not (10.0 <= t0 < 12.0 and False):
        for beat in range(4):
            tt = t0 + beat * BEAT + BEAT / 2
            if tt < 11.75 or tt >= 12.0:
                bass_note(tt, root + (12 if beat == 3 else 0), BEAT * 0.45, 1.0)
    elif 2.0 <= t0 < 6.0 and b >= 1:
        bass_note(t0 + 0.0, root, BAR * 0.9, 0.7)      # long sub notes under the intro groove
    # arpeggio: 16th notes
    if 6.0 <= t0 < 16.0:
        pat = [0, 1, 2, 1, 2, 1, 0, 1, 2, 1, 2, 1, 0, 1, 2, 0]
        for i in range(16):
            tt = t0 + i * BEAT / 4
            if 11.75 <= tt < 12.0: continue
            m = triad[pat[i] % 3] + 24 + (12 if (i % 4 == 3 and b % 2) else 0)
            gain = (0.55 if tt < 12.0 else 1.0)
            pluck(tt, m, gain, pan=-0.3 if i % 2 else 0.3)
    # drum groove
    for beat in range(4):
        tt = t0 + beat * BEAT
        if 2.0 <= tt < 16.0 and not (11.75 <= tt < 12.0):
            kick(tt, 0.7 if tt < 6.0 else 1.0)
        if 6.0 <= tt < 16.0 and beat in (1, 3) and not (10.0 <= tt < 12.0):
            clap(tt, 1.0)
        if 6.0 <= tt < 16.0:
            hat(tt + BEAT / 2, 0.9, open_=True)
        if 8.0 <= tt < 16.0 and not (11.75 <= tt < 12.0):
            hat(tt + BEAT / 4, 0.6); hat(tt + 3 * BEAT / 4, 0.6)
# build 10-12s: snare roll accelerating, riser, kick drops out in the last beat (impact silence)
t = 10.0; step = 0.25
while t < 11.75:
    snare(t, 0.35 + 0.65 * (t - 10.0) / 1.75)
    if t >= 11.0: step = 0.125
    if t >= 11.5: step = 0.0625
    t += step
riser(10.0, 2.0, 1.0)
# the drop (12.0): impact, crash, bright chord stab, fuller arp
impact(12.0, 1.0); crash(12.0, 1.0)
stab(12.0, [69, 72, 76, 81], 1.4, 1.1)
stab(13.0, [67, 72, 76, 79], 0.6, 0.9)
stab(14.0, [65, 69, 72, 77], 1.4, 1.0)           # 'Play online' bar lifts to F
zap(14.0, 400, 2000, 0.3, 0.8)
# end card (16-20s): drums out, a calm pulse, bells
impact(16.0, 0.5, 1.8)
for i, m in enumerate([69, 72, 76, 81, 84]):
    bell(16.1 + i * 0.25, m, 0.8, pan=(i - 2) / 4)
for k in range(8):
    kick(16.0 + k * 1.0, 0.5)
bell(17.5, 93, 0.7); bell(17.6, 88, 0.5)
bell(19.0, 81, 0.6, d=1.5)

# ---------- sound design synced with the picture ----------
whoosh(0.1, 0.4, 0.5); bell(0.5, 81, 0.9); bell(1.0, 88, 0.55); bell(1.5, 93, 0.4)   # intro: logo / title / tagline
whoosh(1.7, 0.3, 0.5)                                                                # board cut-in at 2.0
zap(2.5, 800, 300, 0.12, 0.6); zap(2.55, 700, 280, 0.12, 0.5)
for i in range(7): zap(2.7 + i * 0.12, 1400, 600, 0.05, 0.3, wet=0.1)                # dice tumble
zap(3.5, 300, 110, 0.14, 0.9); zap(3.56, 260, 100, 0.14, 0.8)
zap(4.5, 500, 140, 0.18, 1.0); bell(4.6, 98, 0.35)                                   # green lands
for k in range(8): bell(4.7 + k * 0.1, 93 + k * 0.5, 0.05, d=0.4)
zap(5.5, 460, 130, 0.16, 0.9)                                                         # blue lands
whoosh(6.0, 0.4, 0.5); zap(6.8, 300, 110, 0.14, 0.9)
zap(7.0, 520, 140, 0.18, 1.0); whoosh(7.45, 0.4, 0.8); bell(7.75, 91, 0.4)           # base + bridge + tint
zap(8.0, 440, 130, 0.14, 0.8); zap(8.5, 520, 140, 0.16, 0.9); zap(9.0, 520, 140, 0.16, 0.9)
whoosh(9.45, 0.35, 0.7); bell(9.75, 91, 0.35)
zap(10.0, 520, 140, 0.16, 0.9); whoosh(10.45, 0.35, 0.7); bell(10.75, 93, 0.35)
whoosh(11.0, 0.5, 0.9); zap(11.5, 140, 45, 0.5, 1.0, wet=0.4)                         # attack + clash
zap(12.0, 600, 150, 0.2, 1.0); bell(12.25, 96, 0.5)                                   # conquered square
for i in range(5): bell(12.5 + i * 0.5, 84 + (0, 3, 7, 12, 15)[i] % 12 + 12, 0.3, pan=(i - 2) / 4)
bell(17.5, 98, 0.4)

# ---------- sidechain: pads / bass / arp duck on every kick ----------
def duck_curve(t_start, t_end, depth, rel=0.32):
    ph = (T % BEAT)
    d = 1 - depth * np.exp(-ph / (rel * BEAT * 0.55))
    on = (T >= t_start) & (T < t_end)
    return np.where(on, d, 1.0)


duck_pad = duck_curve(2.0, 16.0, 0.6)
duck_bass = duck_curve(2.0, 16.0, 0.8)
duck_arp = duck_curve(6.0, 16.0, 0.35)

# ---------- reverb + delay ----------
def make_ir(seed, d=2.2):
    r = np.random.default_rng(seed); t = tarr(d)
    ir = lowpass(r.uniform(-1, 1, len(t)) * np.exp(-t * 2.6), 4) * (1 - np.exp(-t * 70))
    ir[: int(0.015 * SR)] *= 0.2
    return ir / np.sqrt((ir ** 2).sum())


def fftconv(x, h):
    n = 1
    while n < len(x) + len(h): n *= 2
    return np.fft.irfft(np.fft.rfft(x, n) * np.fft.rfft(h, n), n)[:len(x)]


def pingpong(l, r, delay=0.375, fb=0.38, taps=5):
    out_l = np.zeros(N); out_r = np.zeros(N)
    di = int(delay * SR)
    cl, cr = l.copy(), r.copy()
    for k in range(1, taps + 1):
        sh = k * di
        if sh >= N: break
        g = fb ** k * 1.6
        if k % 2:   # alternate sides
            out_r[sh:] += cl[:N - sh] * g; out_l[sh:] += cr[:N - sh] * g * 0.3
        else:
            out_l[sh:] += cl[:N - sh] * g; out_r[sh:] += cr[:N - sh] * g * 0.3
    return out_l, out_r


# duck the music buses, then build the reverb send from post-duck signals (pads/arp) + the explicit sends
for ch in (0, 1):
    PAD[ch] *= duck_pad; BASS[ch] *= duck_bass; ARP[ch] *= duck_arp
wl = fftconv(WET[0], make_ir(1)); wr = fftconv(WET[1], make_ir(2))
dl, dr = pingpong(DLY[0], DLY[1])
dl = fftconv(dl, make_ir(3, 0.8)); dr = fftconv(dr, make_ir(4, 0.8))

L = DRUM[0] + BASS[0] + PAD[0] + ARP[0] + FX[0] + 0.85 * wl + 0.8 * dl
Rr = DRUM[1] + BASS[1] + PAD[1] + ARP[1] + FX[1] + 0.85 * wr + 0.8 * dr
mixd = np.stack([L, Rr], axis=1)

# ---------- master: dynamics curve, tone, soft clip ----------
curve = np.interp(T, [0, 2.0, 6.0, 10.0, 12.0, 16.0, 17.5, 20.0], [0.7, 0.8, 0.95, 1.0, 1.1, 0.9, 0.7, 0.55])
mixd *= curve[:, None]
mixd *= (np.clip(T / 0.05, 0, 1) * np.clip((DUR - T) / 1.2, 0, 1))[:, None]
mixd = np.tanh(mixd * 1.2)
mixd = mixd / np.max(np.abs(mixd)) * 0.89
pcm = (mixd * 32767).astype(np.int16)

OUT.mkdir(exist_ok=True)
wav = OUT / 'province-trailer-music.wav'
with wave.open(str(wav), 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('wrote', wav, f'rms={np.sqrt((mixd ** 2).mean()):.3f}')

import imageio_ffmpeg
ff = imageio_ffmpeg.get_ffmpeg_exe()
src = OUT / 'province-trailer.mp4'
dst = OUT / 'province-trailer-music.mp4'
subprocess.run([ff, '-y', '-loglevel', 'error', '-i', str(src), '-i', str(wav), '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', str(dst)], check=True)
print('wrote', dst)
