"""Synthesizes an original cinematic soundtrack + restrained sound design for the teaser (20s, synced to tools/make_trailer.py)
and muxes it into the video.   Requires: numpy, imageio-ffmpeg.
Run: python tools/make_music.py   ->  promo/province-trailer-music.mp4 (+ .wav)
Nothing is sampled or copyrighted: every sound is generated from sine waves and noise, then put through a synthetic reverb.
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
BPM = 100
BEAT = 60 / BPM            # 0.6s  -> a bar is 2.4s, so the "win" hit at 14.4s lands exactly on a bar line
BAR = 4 * BEAT
rng = np.random.default_rng(11)

DL = np.zeros(N); DR = np.zeros(N)     # dry bus
WL = np.zeros(N); WR = np.zeros(N)     # reverb send


def mtof(m): return 440.0 * 2 ** ((m - 69) / 12)
def tarr(d): return np.arange(int(d * SR)) / SR


def put(t0, sig, gain=1.0, wet=0.0, pan=0.0):
    i0 = int(t0 * SR)
    if i0 >= N or i0 + len(sig) <= 0: return
    a = max(0, -i0); sig = sig[a:]; i0 = max(0, i0)
    k = min(len(sig), N - i0)
    l = gain * (1 - max(0, pan)); r = gain * (1 + min(0, pan))
    s = sig[:k]
    DL[i0:i0 + k] += s * l; DR[i0:i0 + k] += s * r
    if wet:
        WL[i0:i0 + k] += s * l * wet; WR[i0:i0 + k] += s * r * wet


def lowpass(x, n):
    if n <= 1: return x
    return np.convolve(x, np.ones(n) / n, mode='same')


def highpass(x, n): return x - lowpass(x, n)
def noise(d): return rng.uniform(-1, 1, int(d * SR))


def adsr(d, a, dcy, s, r):
    t = tarr(d)
    e = np.where(t < a, t / max(a, 1e-6), 1.0)
    e = np.where((t >= a) & (t < a + dcy), 1 - (1 - s) * (t - a) / max(dcy, 1e-6), e)
    e = np.where(t >= a + dcy, s, e)
    return e * np.clip((d - t) / max(r, 1e-6), 0, 1)


def additive(f, d, harm, vib=0.0):
    t = tarr(d)
    ph = 2 * np.pi * f * t + (vib * np.sin(2 * np.pi * 4.7 * t) if vib else 0)
    return sum(w * np.sin(h * ph) for h, w in harm)


# ---------- instruments ----------
def pad(t0, notes, d, g=1.0, bright=1.0):
    sig = 0
    for m in notes:
        f = mtof(m)
        for det in (-0.0035, 0.0, 0.0035):
            sig = sig + additive(f * (1 + det), d, [(1, 1.0), (2, 0.45 * bright), (3, 0.25 * bright), (4, 0.12 * bright)], vib=0.25) * 0.09
    sig = lowpass(sig, 3) * adsr(d, 1.1, 0.4, 0.85, 1.2)
    put(t0, sig, 0.5 * g, wet=0.55)


def sub(t0, m, d, g=1.0):
    f = mtof(m); t = tarr(d)
    sig = np.tanh(1.4 * (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t))) * adsr(d, 0.03, 0.15, 0.8, 0.25)
    put(t0, sig, 0.2 * g)


def felt(t0, m, g=1.0, pan=0.0, d=2.8):
    """soft felt-piano note"""
    f = mtof(m); t = tarr(d)
    sig = 0
    for k, w in enumerate([1.0, 0.55, 0.3, 0.16, 0.09], start=1):
        sig = sig + w * np.sin(2 * np.pi * f * k * t) * np.exp(-t * (1.1 + 1.3 * k))
    sig = sig + 0.05 * highpass(noise(d), 8) * np.exp(-t * 90)
    sig = lowpass(sig, 3) * np.minimum(1, t / 0.004)
    put(t0, sig, 0.62 * g, wet=0.7, pan=pan)


def heart(t0, g=1.0):
    d = 0.5; t = tarr(d)
    f = 48 + 70 * np.exp(-t * 26)
    sig = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)
    put(t0, sig, 0.75 * g, wet=0.08)


def shaker(t0, g=1.0):
    d = 0.07
    put(t0, highpass(noise(d), 5) * np.exp(-tarr(d) * 60) * np.minimum(1, tarr(d) / 0.004), 0.08 * g, wet=0.15, pan=0.3)


def glass(t0, m, g=1.0, pan=0.0, d=2.4):
    f = mtof(m); t = tarr(d)
    sig = (np.sin(2 * np.pi * f * t) + 0.45 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 4) + 0.2 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t * 9)) * np.exp(-t * 2.1)
    put(t0, sig * np.minimum(1, t / 0.003), 0.38 * g, wet=0.9, pan=pan)


def whoosh(t0, d=0.7, g=1.0, up=True):
    t = tarr(d); n = noise(d)
    sig = lowpass(n, 36) * ((t / d) ** 1.6 if up else (1 - t / d) ** 1.6)
    put(t0, sig, 0.9 * g, wet=0.5)


def boom(t0, g=1.0, d=2.6):
    t = tarr(d)
    f = 28 + 60 * np.exp(-t * 7)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.5)
    n = lowpass(noise(d), 30) * np.exp(-t * 5)
    put(t0, s * 0.9 + n * 0.5, 0.85 * g, wet=0.35)


def cymbal_swell(t0, d=2.4, g=1.0, rise=0.9):
    t = tarr(d)
    n = highpass(noise(d), 7)
    e = np.where(t < rise, (t / rise) ** 2, np.exp(-(t - rise) * 1.8))
    put(t0, n * e, 0.2 * g, wet=0.6)


def thock(t0, g=1.0):
    d = 0.2; t = tarr(d)
    f = 120 + 160 * np.exp(-t * 40)
    put(t0, np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 20), 0.5 * g, wet=0.15)


def click(t0, g=1.0):
    d = 0.02
    put(t0, lowpass(noise(d), 2) * np.exp(-tarr(d) * 220), 0.28 * g, wet=0.1, pan=rng.uniform(-.25, .25))


# ---------- score: D minor, slow and spacious ----------
# bar:   0   1    2   3   4   5    6    7   8
PROG = [([50, 53, 57], 38), ([46, 50, 53], 34), ([48, 53, 57], 33), ([48, 52, 55], 36), ([50, 53, 57], 38),
        ([46, 50, 53], 34), ([53, 57, 60], 41), ([48, 52, 55], 36), ([50, 54, 57], 38)]    # Dm Bb F C Dm Bb F C D(major lift at the end)
for b, (triad, root) in enumerate(PROG):
    t0 = b * BAR
    last = b == len(PROG) - 1
    d = BAR + (3.2 if last else 1.4)
    pad(t0 if b else 0.1, [m + 12 for m in triad] + [triad[0]], d, 1.0, 1.0 if b < 6 else 1.35)
    if b >= 2:
        sub(t0, root, BAR * (1.0 if not last else 1.6), 0.9 if b < 6 else 1.0)
    # sparse piano motif: one note every two beats, rising as the story builds
    if 2.6 <= t0 + BAR and not last:
        motif = [triad[2] + 12, triad[1] + 12, triad[2] + 24, triad[0] + 24]
        for i, m in enumerate(motif):
            tt = t0 + i * BEAT * 1.0
            if 2.6 <= tt < 17.0:
                felt(tt + 0.02 * (i % 2), m, 0.8 if tt < 11 else 1.0, pan=-0.25 if i % 2 else 0.25)

# heartbeat from 4.8s, shaker from 7.2s
t = 4.8
while t < 14.3:
    heart(t, 0.9); heart(t + 2 * BEAT, 0.8)
    t += 4 * BEAT
t = 7.2
while t < 14.3:
    for k in range(8): shaker(t + k * BEAT / 2, 0.8 if k % 2 == 0 else 0.5)
    t += BAR
# airy shimmer that swells with the story
dsh = 17.0; tsh = tarr(dsh)
put(0.0, highpass(noise(dsh), 3) * 0.05 * np.sin(np.pi * np.clip(tsh / dsh, 0, 1)) ** 2, 1.0, wet=0.6)
# riser into the win
d = 14.4 - 10.8
tt = tarr(d)
ns = highpass(noise(d), 6) * (tt / d) ** 2.2
sw = np.sin(2 * np.pi * np.cumsum(180 * 2 ** (3 * tt / d)) / SR) * (tt / d) ** 2
put(10.8, ns * 0.35 + sw * 0.12, 0.8, wet=0.5)
# the win: sub boom + swell + a bright D major lift
boom(14.4); cymbal_swell(14.4, 2.6, 1.0, 0.05)
for i, m in enumerate([74, 78, 81, 86]):
    glass(14.55 + i * 0.28, m, 0.9, pan=(i - 1.5) / 3)
# end card
for i, m in enumerate([62, 66, 69, 74, 78]):
    glass(17.0 + i * 0.16, m, 0.55, pan=(i - 2) / 4)
glass(18.45, 86, 0.8); glass(18.55, 90, 0.45)

# ---------- sound design (synced with the video) ----------
whoosh(0.15, 0.7, 0.5); glass(0.5, 74, 0.9); glass(0.95, 81, 0.55)          # logo
whoosh(2.5, 0.5, 0.5)                                                         # board appears
for i in range(10): click(3.0 + i * 0.07 + 0.002 * i * i, 0.9)               # dice tumble
thock(3.85, 0.9); thock(3.93, 0.8)
thock(5.5, 1.0); glass(5.55, 98, 0.18)                                        # green lands
for k in range(7): glass(5.7 + k * 0.1, 96 + k, 0.05)
thock(6.3, 0.85)                                                              # blue lands
thock(8.8, 0.9); glass(8.85, 98, 0.16)                                        # second base
whoosh(9.4, 0.55, 0.8); glass(9.9, 91, 0.35)                                  # bridge + tint
thock(11.0, 0.7); thock(11.3, 0.8); thock(11.8, 0.7); thock(12.4, 0.7)
whoosh(12.0, 0.4, 0.5); whoosh(12.6, 0.4, 0.5)
whoosh(12.95, 0.55, 0.9)
boom(13.45, 0.6, 1.4)                                                         # clash
thock(14.0, 0.9)
glass(18.4, 98, 0.35)                                                         # CTA pop

# ---------- reverb (synthetic impulse response) ----------
def make_ir(seed, d=2.6):
    r = np.random.default_rng(seed)
    t = tarr(d)
    ir = r.uniform(-1, 1, len(t)) * np.exp(-t * 2.3)
    ir = lowpass(ir, 4) * (1 - np.exp(-t * 60))    # soft onset, darker tail
    ir[: int(0.02 * SR)] *= 0.2
    return ir / np.sqrt((ir ** 2).sum())


def fftconv(x, h):
    n = 1
    while n < len(x) + len(h): n *= 2
    return np.fft.irfft(np.fft.rfft(x, n) * np.fft.rfft(h, n), n)[: len(x)]


wl = fftconv(WL, make_ir(1)); wr = fftconv(WR, make_ir(2))
mix = np.stack([DL + 0.9 * wl, DR + 0.9 * wr], axis=1)

# ---------- master ----------
idx = np.arange(N)
# dynamics: hushed opening, building through the story, full at the win, soft resolve
curve = np.interp(idx / SR, [0, 2.5, 5.4, 11.0, 14.4, 17.0, 20.0], [0.55, 0.6, 0.78, 0.95, 1.0, 0.75, 0.6])
mix *= curve[:, None]
mix *= (np.clip(idx / (0.15 * SR), 0, 1) * np.clip((N - idx) / (1.6 * SR), 0, 1))[:, None]
mix = np.tanh(mix * 1.05)
peak = np.max(np.abs(mix)); mix = mix / peak * 0.85
pcm = (mix * 32767).astype(np.int16)

OUT.mkdir(exist_ok=True)
wav = OUT / 'province-trailer-music.wav'
with wave.open(str(wav), 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('wrote', wav, f'rms={np.sqrt((mix ** 2).mean()):.3f}')

import imageio_ffmpeg
ff = imageio_ffmpeg.get_ffmpeg_exe()
src = OUT / 'province-trailer.mp4'
dst = OUT / 'province-trailer-music.mp4'
subprocess.run([ff, '-y', '-loglevel', 'error', '-i', str(src), '-i', str(wav), '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', str(dst)], check=True)
print('wrote', dst)
