"""Renders the Province teaser (1080x1920 vertical, 30fps, 20s, 120 BPM) as promo/province-trailer.mp4.
Every event is placed on the 120-BPM grid (a beat is 0.5s, a bar is 2s) so it locks to the soundtrack from tools/make_music.py.
Requires: pip install numpy imageio imageio-ffmpeg pillow.   Run: python tools/make_trailer.py [--preview]
--preview writes still frames to promo/frames/ instead of the video.
"""
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'promo'
OUT.mkdir(exist_ok=True)

W, H, FPS, DUR = 1080, 1920, 30, 20.0
BEAT = 0.5
SS = 2
GREEN, BLUE, INK = (52, 201, 138), (58, 156, 245), (27, 30, 36)
GRAY, MUTED = (168, 174, 185), (106, 112, 124)
WHITE = (255, 255, 255)

P_, G_, M_, CR_, RIVER_ = 64, 34, -11, 21, 8
BW = 2 * M_ + 6 * P_ + 2 * G_
S = 2.2
OX, OY = (W - BW * S) / 2, 470

FD = 'C:/Windows/Fonts/'
def font(sz, bold=True):
    return ImageFont.truetype(FD + ('segoeuib.ttf' if bold else 'segoeui.ttf'), max(8, int(sz * SS)))


def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def prog(t, t0, d): return clamp((t - t0) / d)
def eo3(x): return 1 - (1 - x) ** 3
def eio(x): return 3 * x * x - 2 * x ** 3
def ob(x):
    c1 = 1.9; c3 = c1 + 1
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2
def mix(c, a, bg=WHITE): return tuple(int(bg[i] + (c[i] - bg[i]) * a) for i in range(3))


def kp(t):
    """kick pulse: 1 on every beat, decaying fast (active while the kick plays)"""
    if t < 2.0 or t >= 16.0: return 0.0
    return math.exp(-((t % BEAT)) * 9.0)


def cell(x, y):
    X = M_ + x * P_ + (x // 2) * G_ + P_ / 2
    r = 5 - y
    Y = M_ + r * P_ + (r // 2) * G_ + P_ / 2
    return OX + X * S, OY + Y * S


def prov_rect(px, py):
    rv = lambda j: M_ + 2 * j * P_ + (j - 1) * G_ + G_ / 2
    e = [0, rv(1), rv(2), BW]
    top = 2 - py
    return OX + e[px] * S, OY + e[top] * S, OX + e[px + 1] * S, OY + e[top + 1] * S


class Canvas:
    def __init__(self):
        self.im = Image.new('RGB', (W * SS, H * SS), WHITE)
        self.d = ImageDraw.Draw(self.im)

    def circle(self, x, y, r, fill=None, outline=None, width=0):
        if r <= 0: return
        k = SS
        self.d.ellipse([(x - r) * k, (y - r) * k, (x + r) * k, (y + r) * k], fill=fill, outline=outline, width=int(width * k))

    def line(self, x1, y1, x2, y2, w, col):
        k = SS
        self.d.line([x1 * k, y1 * k, x2 * k, y2 * k], fill=col, width=int(w * k))
        self.circle(x1, y1, w / 2, col); self.circle(x2, y2, w / 2, col)

    def rect(self, x1, y1, x2, y2, fill, r=0):
        k = SS
        if r: self.d.rounded_rectangle([x1 * k, y1 * k, x2 * k, y2 * k], r * k, fill=fill)
        else: self.d.rectangle([x1 * k, y1 * k, x2 * k, y2 * k], fill=fill)

    def text(self, x, y, s, sz, col, bold=True, anchor='mm', spacing=0):
        f = font(sz, bold)
        if spacing:
            widths = [self.d.textlength(ch, font=f) for ch in s]
            total = sum(widths) + spacing * SS * (len(s) - 1)
            cx = x * SS - total / 2
            for ch, wd in zip(s, widths):
                self.d.text((cx, y * SS), ch, font=f, fill=col, anchor='lm')
                cx += wd + spacing * SS
        else:
            self.d.text((x * SS, y * SS), s, font=f, fill=col, anchor=anchor)

    def paste_rot(self, img, x, y, ang):
        im = img.rotate(ang, resample=Image.BICUBIC, expand=True)
        self.im.paste(im, (int(x * SS - im.width / 2), int(y * SS - im.height / 2)), im)

    def out(self, zoom=1.0):
        im = self.im
        if zoom > 1.0005:
            w, h = im.size
            cw, ch = w / zoom, h / zoom
            im = im.crop((int((w - cw) / 2), int((h - ch) / 2), int((w + cw) / 2), int((h + ch) / 2)))
        return im.resize((W, H), Image.LANCZOS)


ICON = Image.open(ROOT / 'icons' / 'icon-512.png').convert('RGB')


def rounded_icon(size):
    s = max(2, int(size * SS))
    im = ICON.resize((s, s), Image.LANCZOS).convert('RGBA')
    m = Image.new('L', im.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, im.width - 1, im.height - 1], int(im.width * .22), fill=255)
    im.putalpha(m)
    return im


def die_img(n, size=150):
    k = SS
    im = Image.new('RGBA', (int(size * k * 1.5), int(size * k * 1.5)), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c = im.width / 2
    d.rounded_rectangle([c - size * k / 2, c - size * k / 2, c + size * k / 2, c + size * k / 2], size * k * .22, fill=(90, 96, 108, 255))
    d.text((c, c), str(n), font=font(size * .6), fill=(255, 255, 255, 255), anchor='mm')
    return im


# ---------------- timeline (all on the 0.5s grid) ----------------
GREEN_BASES = [
    ((1, 1), 4.5, [(4.6, 1), (5.4, 8)]),
    ((2, 1), 7.0, [(7.1, 1), (7.5, 4)]),
    ((3, 1), 8.5, [(8.6, 1), (9.0, 5)]),
    ((4, 1), 9.0, [(9.1, 1)]),
    ((1, 2), 10.0, [(10.1, 1)]),
]
BLUE_BASES = [((4, 4), 5.5, [(5.6, 1), (5.9, 4)]), ((3, 2), 8.0, [(8.1, 1), (8.4, 3)])]
BRIDGES = [((1, 1), (2, 1), 7.5), ((3, 1), (4, 1), 9.5), ((1, 1), (1, 2), 10.5), ((3, 1), (3, 2), 12.0)]
TINTS = [((0, 0), 7.75), ((1, 0), 7.75), ((2, 0), 9.75), ((0, 1), 10.75), ((1, 1), 12.25)]
HUD_FILL = [7.75, 7.75, 9.75, 10.75, 12.25]
ROLLS = [(2.5, (2, 2), [(1, 1), (4, 4)], 4.0, 6.0, GREEN), (6.0, (3, 2), [(2, 1), (3, 4)], 6.8, 7.5, GREEN)]
T_TOKEN, T_CLASH, T_CONQUER = 11.0, 11.5, 12.0
CAPTIONS = [
    (2.0, 4.0, 'Roll the dice', 'Two opposite squares light up'),
    (4.0, 6.0, 'Claim your ground', 'Land soldiers on a lit square'),
    (6.0, 8.0, 'Build bridges', 'Link provinces into one territory'),
    (8.0, 12.0, 'Strike first', 'Attackers go home. Defenders do not.'),
    (12.0, 14.0, 'Connect 5 provinces', 'Before your opponent does'),
    (14.0, 16.0, 'Play online', 'Challenge friends in real time'),
]


def count_at(sched, t):
    v = 0
    for i, (ts, val) in enumerate(sched):
        if t >= ts:
            if i + 1 < len(sched):
                nt, nv = sched[i + 1]
                v = val + (nv - val) * eio(prog(t, ts, nt - ts)) if t < nt else nv
            else:
                v = val
    return int(round(v))


def draw_base(cv, x, y, col, t_in, t, count, extra=1.0, pulse=0.0):
    p = prog(t, t_in, 0.4)
    if p <= 0: return
    sc = ob(p) * extra * (1 + 0.05 * pulse)
    cx, cy = cell(x, y)
    cv.circle(cx, cy, CR_ * S * sc, col)
    if count > 0 and sc > 0.6:
        cv.text(cx, cy - 1, str(count), 19 * S * sc * 0.95, WHITE)


def caption(cv, t, t0, t1, big, small):
    if not (t0 <= t < t1 + 0.12): return
    a_in = prog(t, t0, 0.14)
    a_out = 1 - prog(t, t1 - 0.08, 0.2)
    a = a_in * a_out
    k = 1 + 0.35 * (1 - eo3(prog(t, t0, 0.22)))
    cv.text(W / 2, 250, big, 92 * k, mix(INK, a))
    sa = prog(t, t0 + 0.12, 0.25) * a_out
    cv.text(W / 2, 350 + (1 - eo3(prog(t, t0 + 0.12, 0.3))) * 18, small, 42, mix(MUTED, sa), bold=False)


def kp_end(t):   # soft pulse on the end card (every 2 beats)
    return math.exp(-(((t - 16.0) % 1.0)) * 7.0) if 16.0 <= t < 20.0 else 0.0


def end_card(cv, t):
    sc = ob(prog(t, 16.0, 0.5))
    ic = rounded_icon(300 * max(sc, 0.01) * (1 + 0.025 * kp_end(t)))
    cv.im.paste(ic, (int((W / 2) * SS - ic.width / 2), int(640 * SS - ic.height / 2)), ic)
    ta = eo3(prog(t, 16.5, 0.35))
    cv.text(W / 2, 900 + (1 - ta) * 30, 'PROVINCE', 120, mix(INK, ta), spacing=16)
    tb = eo3(prog(t, 17.0, 0.4))
    cv.text(W / 2, 1010, 'The strategy game of bridges and borders', 44, mix(MUTED, tb), bold=False)
    e3 = ob(prog(t, 17.5, 0.45))
    if e3 > 0.02:
        w, h = 760 * e3, 150 * e3
        cv.rect(W / 2 - w / 2, 1220 - h / 2, W / 2 + w / 2, 1220 + h / 2, INK, r=int(h / 2))
        if e3 > .7:
            cv.text(W / 2, 1182, 'PLAY FREE', 54, WHITE, spacing=6)
            cv.text(W / 2, 1246, 'province-game.com', 44, (225, 228, 235), bold=False)
    e4 = eo3(prog(t, 18.5, 0.4))
    cv.text(W / 2, 1430, 'Plays in your browser · No download', 36, mix(MUTED, e4), bold=False)


def zoom_at(t):
    z = 1.0 + 0.010 * kp(t)
    for hit, amt in ((2.0, 0.045), (12.0, 0.07), (16.0, 0.05), (14.0, 0.03)):
        if t >= hit: z += amt * math.exp(-(t - hit) * 7.0)
    return z


def frame(t):
    cv = Canvas()
    pulse = kp(t)

    # ---- opening ----
    if t < 2.0:
        sc = ob(prog(t, 0.5, 0.45))
        ic = rounded_icon(360 * max(sc, 0.01))
        cv.im.paste(ic, (int((W / 2) * SS - ic.width / 2), int(780 * SS - ic.height / 2)), ic)
        ta = eo3(prog(t, 1.0, 0.3))
        cv.text(W / 2, 1050 + (1 - ta) * 40, 'PROVINCE', 120 * (1 + 0.18 * (1 - ta)), mix(INK, ta), spacing=16)
        tb = eo3(prog(t, 1.5, 0.3))
        cv.text(W / 2, 1160, 'Roll. Connect. Conquer.', 52, mix(MUTED, tb), bold=False)
        return cv.out(1.0)

    if t >= 16.0:
        end_card(cv, t)
        fade = prog(t, 19.55, 0.45)
        im = cv.out(zoom_at(t))
        if fade > 0: im = Image.blend(im, Image.new('RGB', im.size, WHITE), fade)
        return im

    # ---- board ----
    rv = lambda k: M_ + 2 * k * P_ + (k - 1) * G_ + G_ / 2
    for (px, py), tt in TINTS:
        a = prog(t, tt, 0.35)
        pl = 0.0
        if 12.25 <= t < 16.0:
            pl = 0.3 * math.exp(-((t - 12.25) % BEAT) * 6.0)
        if a > 0:
            x1, y1, x2, y2 = prov_rect(px, py)
            cv.rect(x1, y1, x2, y2, mix(GREEN, (0.14 + pl) * a), r=14)
    for k in (1, 2):
        pos = rv(k)
        e = eo3(prog(t, 2.0 + 0.2 * k, 0.5))
        cv.line(OX + pos * S, OY, OX + pos * S, OY + BW * S * e, RIVER_ * S, GRAY)
        cv.line(OX, OY + pos * S, OX + BW * S * e, OY + pos * S, RIVER_ * S, GRAY)
    for (t0, dice, lit, ts, te, col) in ROLLS:
        if ts <= t < te + 0.25:
            a = eo3(prog(t, ts, 0.25)) * (1 - prog(t, te, 0.25))
            for (x, y) in lit:
                cx, cy = cell(x, y)
                cv.circle(cx, cy, (CR_ + 4) * S, mix(col, 0.2 * a))
    for x in range(6):
        for y in range(6):
            cx, cy = cell(x, y)
            dist = abs(x - 2.5) + abs(y - 2.5)
            p = prog(t, 2.0 + dist * 0.08, 0.3)
            if p > 0:
                cv.circle(cx, cy, 7 * S * ob(p) * (1 + 0.10 * pulse), GRAY)
    for (a, b, tt) in BRIDGES:
        p = eo3(prog(t, tt, 0.4))
        if p > 0:
            (x1, y1), (x2, y2) = cell(*a), cell(*b)
            dx, dy = x2 - x1, y2 - y1
            L = math.hypot(dx, dy); ux, uy = dx / L, dy / L
            gap = CR_ * S * 0.55
            sx, sy = x1 + ux * gap, y1 + uy * gap
            ex, ey = x2 - ux * gap, y2 - uy * gap
            cv.line(sx, sy, sx + (ex - sx) * p, sy + (ey - sy) * p, 8 * S, GREEN)
    for (t0, dice, lit, ts, te, col) in ROLLS:
        if ts <= t < te + 0.25:
            a = eo3(prog(t, ts, 0.25)) * (1 - prog(t, te, 0.25))
            for (x, y) in lit:
                cx, cy = cell(x, y)
                r = (CR_ + 4) * S
                rot = (t - ts) * 90
                for i in range(14):
                    st = rot + i * (360 / 14)
                    cv.d.arc([(cx - r) * SS, (cy - r) * SS, (cx + r) * SS, (cy + r) * SS], st, st + 16, fill=mix(col, a), width=int(4 * SS))
    for (pos, tin, sched) in GREEN_BASES:
        draw_base(cv, pos[0], pos[1], GREEN, tin, t, count_at(sched, t), pulse=pulse)
    for i, (pos, tin, sched) in enumerate(BLUE_BASES):
        cnt = count_at(sched, t); extra = 1.0
        if i == 1:
            cnt = max(0, cnt - int(round(3 * eio(prog(t, T_CLASH, 0.4)))))
            k = prog(t, T_CLASH + 0.4, 0.1)
            extra = 1 - eo3(k)
            if k >= 1: continue
        draw_base(cv, pos[0], pos[1], BLUE, tin, t, cnt, extra, pulse)
    draw_base(cv, 3, 2, GREEN, T_CONQUER, t, 2 if t >= T_CONQUER else 0, pulse=pulse)
    if T_TOKEN <= t < T_CLASH + 0.1:
        p = eio(prog(t, T_TOKEN, T_CLASH - T_TOKEN))
        (x1, y1), (x2, y2) = cell(3, 1), cell(3, 2)
        tx, ty = x1 + (x2 - x1) * p, y1 + (y2 - y1) * p
        cv.line(x1, y1, tx, ty, 6 * S, mix(GREEN, 0.45))
        cv.circle(tx, ty, CR_ * S * 0.8, GREEN)
        cv.text(tx, ty - 1, '5', 19 * S * 0.8, WHITE)
    if T_CLASH <= t < T_CLASH + 0.65:
        p = prog(t, T_CLASH, 0.65)
        cx, cy = cell(3, 2)
        cv.circle(cx, cy, CR_ * S * (0.8 + 2.0 * eo3(p)), None, mix(INK, (1 - p) * 0.9), 6 * (1 - p))
        for i in range(10):
            ang = i * math.pi / 5
            r1, r2 = CR_ * S * (1.1 + 1.6 * eo3(p)), CR_ * S * (1.5 + 2.2 * eo3(p))
            if p < .85:
                cv.line(cx + math.cos(ang) * r1, cy + math.sin(ang) * r1, cx + math.cos(ang) * r2, cy + math.sin(ang) * r2, 6, mix(INK, 1 - p))

    # ---- dice ----
    def dice_row(ta, tb, dice, land_at):
        if not (ta <= t < tb): return
        a = eo3(prog(t, ta, 0.2)) * (1 - prog(t, tb - 0.2, 0.2))
        land = prog(t, ta, land_at - ta)
        for i, n in enumerate(dice):
            shown = n if land >= 1 else (int(t * 16 + i * 3) % 6) + 1
            ang = (1 - eo3(land)) * (-540 if i == 0 else 480)
            yy = 1555 - (1 - eo3(prog(t, ta, 0.3))) * 100 - 14 * (kp(t) if land >= 1 else 0)
            im = die_img(shown, 150)
            im.putalpha(im.getchannel('A').point(lambda v: int(v * max(a, 0))))
            cv.paste_rot(im, W / 2 + (-95 if i == 0 else 95), yy, ang)
    dice_row(2.5, 4.5, (2, 2), 3.5)
    dice_row(6.0, 8.0, (3, 2), 6.8)
    if 8.0 <= t < 10.5:   # rapid montage while the territory grows
        a = eo3(prog(t, 8.0, 0.2)) * (1 - prog(t, 10.2, 0.3))
        for i in range(2):
            shown = (int(t * 12 + i * 2) % 6) + 1
            im = die_img(shown, 150)
            im.putalpha(im.getchannel('A').point(lambda v: int(v * max(a, 0))))
            cv.paste_rot(im, W / 2 + (-95 if i == 0 else 95), 1555, math.sin(t * 11 + i) * 10)

    # ---- HUD ----
    if t >= 4.0:
        ha = eo3(prog(t, 4.0, 0.4))
        cv.text(W / 2, 1715, 'PROVINCES CONTROLLED', 28, mix(MUTED, ha), spacing=4)
        order = sorted(HUD_FILL)
        for i in range(5):
            sx = W / 2 + (i - 2) * 76
            if i < sum(1 for tt in HUD_FILL if t >= tt):
                pp = ob(prog(t, order[i], 0.35))
                size = 25 * pp * (1 + 0.06 * pulse)
                cv.rect(sx - size, 1790 - size, sx + size, 1790 + size, GREEN, r=8)
            else:
                cv.rect(sx - 25, 1765, sx + 25, 1815, (226, 229, 235), r=8)

    for (t0, t1, big, small) in CAPTIONS:
        caption(cv, t, t0, t1, big, small)
    return cv.out(zoom_at(t))


def main():
    if '--preview' in sys.argv:
        d = OUT / 'frames'; d.mkdir(exist_ok=True)
        for t in [0.7, 1.7, 2.2, 3.6, 4.7, 6.3, 7.8, 9.2, 10.8, 11.6, 12.1, 13.0, 14.3, 16.2, 17.8, 19.0]:
            frame(t).save(d / f'f_{t:05.2f}.png')
        print('preview frames written to', d)
        return
    import imageio
    out = OUT / 'province-trailer.mp4'
    wr = imageio.get_writer(str(out), fps=FPS, codec='libx264', quality=8, macro_block_size=None,
                            ffmpeg_params=['-pix_fmt', 'yuv420p', '-movflags', '+faststart'])
    n = int(DUR * FPS)
    for i in range(n):
        wr.append_data(np.asarray(frame(i / FPS)))
        if i % 60 == 0: print(f'{i}/{n}', flush=True)
    wr.close()
    print('wrote', out)


if __name__ == '__main__':
    main()
