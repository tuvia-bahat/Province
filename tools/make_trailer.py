"""Renders the Province teaser (1080x1920 vertical, 30fps, ~20s) as promo/province-trailer.mp4.
Requires: pip install numpy imageio imageio-ffmpeg pillow.   Run: python tools/make_trailer.py [--preview]
--preview writes a few still frames to promo/frames/ instead of the video.
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
SS = 2                                    # supersampling for smooth edges
GREEN, BLUE, INK = (52, 201, 138), (58, 156, 245), (27, 30, 36)
GRAY, MUTED, LIGHT = (168, 174, 185), (106, 112, 124), (243, 244, 247)
WHITE = (255, 255, 255)

# board geometry (same proportions as the game, 6x6)
P_, G_, M_, CR_, RIVER_ = 64, 34, -11, 21, 8
BW = 2 * M_ + 6 * P_ + 2 * G_             # 430
S = 2.2
OX, OY = (W - BW * S) / 2, 470

FD = 'C:/Windows/Fonts/'
def font(sz, bold=True):
    return ImageFont.truetype(FD + ('segoeuib.ttf' if bold else 'segoeui.ttf'), int(sz * SS))


def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def prog(t, t0, d): return clamp((t - t0) / d)
def eo3(x): return 1 - (1 - x) ** 3
def eio(x): return 3 * x * x - 2 * x ** 3
def ob(x):
    c1 = 1.9; c3 = c1 + 1
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2
def mix(c, a, bg=WHITE): return tuple(int(bg[i] + (c[i] - bg[i]) * a) for i in range(3))


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
            cx = x * SS - total / 2 if anchor == 'mm' else x * SS
            for ch, wd in zip(s, widths):
                self.d.text((cx, y * SS), ch, font=f, fill=col, anchor='lm')
                cx += wd + spacing * SS
        else:
            self.d.text((x * SS, y * SS), s, font=f, fill=col, anchor=anchor)

    def paste_rot(self, img, x, y, ang, scale=1.0):
        im = img.rotate(ang, resample=Image.BICUBIC, expand=True)
        if scale != 1.0: im = im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)
        self.im.paste(im, (int(x * SS - im.width / 2), int(y * SS - im.height / 2)), im)

    def out(self):
        return self.im.resize((W, H), Image.LANCZOS)


ICON = Image.open(ROOT / 'icons' / 'icon-512.png').convert('RGB')


def rounded_icon(size):
    im = ICON.resize((int(size * SS), int(size * SS)), Image.LANCZOS).convert('RGBA')
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


# ---------------- scene data ----------------
# bases: (x, y, color, appear_t, count_schedule [(t, value)...], final)
GREEN_BASES = [
    ((1, 1), 5.5, [(5.7, 1), (6.4, 8)]),
    ((2, 1), 8.8, [(8.9, 1), (9.4, 4)]),
    ((3, 1), 11.3, [(11.4, 1), (11.8, 5)]),
    ((4, 1), 11.8, [(11.9, 1)]),
    ((1, 2), 12.4, [(12.5, 1)]),
]
BLUE_BASES = [((4, 4), 6.3, [(6.4, 1), (6.9, 4)]), ((3, 2), 11.0, [(11.1, 1), (11.5, 3)])]
BRIDGES = [((1, 1), (2, 1), 9.5), ((3, 1), (4, 1), 12.1), ((1, 1), (1, 2), 12.7), ((3, 1), (3, 2), 14.0)]
TINTS = [((0, 0), 9.9), ((1, 0), 9.9), ((2, 0), 12.3), ((0, 1), 12.8), ((1, 1), 14.3)]
HUD_FILL = [9.9, 9.9, 12.3, 12.8, 14.3]
ROLLS = [  # (t_start, dice, lit cells, color)
    (3.0, (2, 2), [(1, 1), (4, 4)], GREEN),
    (8.1, (3, 2), [(2, 1), (3, 4)], GREEN),
]
CAPTIONS = [
    (2.8, 5.4, 'Roll the dice', 'Two opposite squares light up'),
    (5.4, 8.1, 'Claim your ground', 'Land soldiers on a lit square'),
    (8.1, 11.0, 'Build bridges', 'Link provinces into one territory'),
    (11.0, 14.4, 'Strike first', 'Attackers go home. Defenders do not.'),
    (14.4, 17.2, 'Connect 5 provinces', 'Before your opponent does'),
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


def draw_base(cv, x, y, col, t_in, t, count, extra_scale=1.0, fade=1.0):
    p = prog(t, t_in, 0.45)
    if p <= 0: return
    sc = ob(p) * extra_scale
    cx, cy = cell(x, y)
    r = CR_ * S * sc
    cv.circle(cx, cy, r, mix(col, fade))
    if count > 0 and sc > 0.6:
        cv.text(cx, cy - 1, str(count), 19 * S * sc * 0.95, WHITE if fade > .5 else mix(col, fade))


def frame(t):
    cv = Canvas()

    # ---- opening: logo ----
    if t < 2.9:
        a_out = 1 - eio(prog(t, 2.35, 0.5))
        sc = ob(prog(t, 0.15, 0.7))
        icon = rounded_icon(360 * sc if sc > 0 else 1)
        if sc > 0.02 and a_out > 0:
            ox = 0 if a_out >= 1 else -(1 - a_out) * 80
            cv.im.paste(icon, (int((W / 2 - 180 * sc) * SS), int((780 - 180 * sc - (1 - a_out) * 60) * SS)), icon)
        ta = eo3(prog(t, 0.7, 0.6)) * a_out
        cv.text(W / 2, 1050 - (1 - a_out) * 60, 'PROVINCE', 120, mix(INK, ta), spacing=16)
        tb = eo3(prog(t, 1.4, 0.6)) * a_out
        cv.text(W / 2, 1160 - (1 - a_out) * 60, 'Roll. Connect. Conquer.', 52, mix(MUTED, tb), bold=False)
        if t < 2.35: return cv.out()

    # ---- end card ----
    if t >= 17.0:
        e = prog(t, 17.0, 0.5)
        board_a = 1 - e
    else:
        board_a = 1.0

    # ---- board ----
    if board_a > 0 and t >= 2.55:
        bp = prog(t, 2.6, 0.9)
        # territory tints (under everything)
        for (px, py), tt in TINTS:
            a = prog(t, tt, 0.4)
            pulse = 0
            if t >= 14.9 and t < 17.0:
                pulse = 0.35 * (0.5 + 0.5 * math.sin((t - 14.9) * 2 * math.pi / 0.9 - math.pi / 2)) if (t - 14.9) < 2.7 else 0
            if a > 0:
                x1, y1, x2, y2 = prov_rect(px, py)
                cv.rect(x1, y1, x2, y2, mix(GREEN, (0.14 + pulse) * a * board_a), r=int(14 * S / 2.2))
        # rivers
        rv = lambda k: M_ + 2 * k * P_ + (k - 1) * G_ + G_ / 2
        for k in (1, 2):
            pos = rv(k)
            e = eo3(prog(t, 2.7 + 0.15 * k, 0.7))
            col = mix(GRAY, board_a)
            cv.line(OX + pos * S, OY, OX + pos * S, OY + BW * S * e, RIVER_ * S, col)
            cv.line(OX, OY + pos * S, OX + BW * S * e, OY + pos * S, RIVER_ * S, col)
        # lit squares: roll fill + dashed rings
        for (t0, dice, lit, col) in ROLLS:
            t_end = 5.4 if t0 < 5 else 8.9
            if t0 + 0.9 <= t < t_end + 0.3:
                a = eo3(prog(t, t0 + 0.9, 0.3)) * (1 - prog(t, t_end, 0.3))
                for (x, y) in lit:
                    cx, cy = cell(x, y)
                    cv.circle(cx, cy, (CR_ + 4) * S, mix(col, 0.2 * a))
        # dots
        for x in range(6):
            for y in range(6):
                cx, cy = cell(x, y)
                dist = abs(x - 2.5) + abs(y - 2.5)
                p = prog(t, 2.6 + dist * 0.035, 0.4)
                if p > 0:
                    cv.circle(cx, cy, 7 * S * ob(p) * board_a if board_a < 1 else 7 * S * ob(p), mix(GRAY, 1))
        # bridges
        for (a, b, tt) in BRIDGES:
            p = eo3(prog(t, tt, 0.5))
            if p > 0:
                (x1, y1), (x2, y2) = cell(*a), cell(*b)
                dx, dy = x2 - x1, y2 - y1
                L = math.hypot(dx, dy); ux, uy = dx / L, dy / L
                gap = CR_ * S * 0.55
                sx, sy = x1 + ux * gap, y1 + uy * gap
                ex, ey = x2 - ux * gap, y2 - uy * gap
                cv.line(sx, sy, sx + (ex - sx) * p, sy + (ey - sy) * p, 8 * S, mix(GREEN, board_a))
        # lit rings
        for (t0, dice, lit, col) in ROLLS:
            t_end = 5.4 if t0 < 5 else 8.9
            if t0 + 0.9 <= t < t_end + 0.3:
                a = eo3(prog(t, t0 + 0.9, 0.3)) * (1 - prog(t, t_end, 0.3))
                for (x, y) in lit:
                    cx, cy = cell(x, y)
                    r = (CR_ + 4) * S
                    rot = (t - t0) * 70
                    for i in range(14):
                        st = rot + i * (360 / 14)
                        cv.d.arc([(cx - r) * SS, (cy - r) * SS, (cx + r) * SS, (cy + r) * SS], st, st + 16, fill=mix(col, a), width=int(4 * SS))
        # bases
        for (pos, tin, sched) in GREEN_BASES:
            draw_base(cv, pos[0], pos[1], GREEN, tin, t, count_at(sched, t))
        for i, (pos, tin, sched) in enumerate(BLUE_BASES):
            cnt = count_at(sched, t)
            extra, fade = 1.0, 1.0
            if i == 1:   # the attacked blue base: numbers fall to 0, then it shrinks away
                cnt = max(0, cnt - int(round(3 * eio(prog(t, 13.45, 0.5)))))
                k = prog(t, 13.95, 0.3)
                extra, fade = 1 - eo3(k), 1.0
                if k >= 1: continue
            draw_base(cv, pos[0], pos[1], BLUE, tin, t, cnt, extra, fade)
        # the conquered square becomes green
        draw_base(cv, 3, 2, GREEN, 14.0, t, 2 if t > 14.0 else 0)
        # attack token + clash
        if 12.95 <= t < 13.6:
            p = eio(prog(t, 12.95, 0.5))
            (x1, y1), (x2, y2) = cell(3, 1), cell(3, 2)
            tx, ty = x1 + (x2 - x1) * p, y1 + (y2 - y1) * p
            cv.line(x1, y1, tx, ty, 6 * S, mix(GREEN, 0.45))
            cv.circle(tx, ty, CR_ * S * 0.8, GREEN)
            cv.text(tx, ty - 1, '5', 19 * S * 0.8, WHITE)
        if 13.45 <= t < 14.1:
            p = prog(t, 13.45, 0.65)
            cx, cy = cell(3, 2)
            r0 = CR_ * S * (0.8 + 2.0 * eo3(p))
            cv.circle(cx, cy, r0, None, mix(INK, (1 - p) * 0.9), 6 * (1 - p))
            for i in range(10):
                ang = i * math.pi / 5
                r1, r2 = CR_ * S * (1.1 + 1.6 * eo3(p)), CR_ * S * (1.5 + 2.2 * eo3(p))
                if p < .85:
                    cv.line(cx + math.cos(ang) * r1, cy + math.sin(ang) * r1, cx + math.cos(ang) * r2, cy + math.sin(ang) * r2, 6, mix(INK, 1 - p))

        # ---- dice & HUD ----
        for (t0, dice, lit, col) in ROLLS:
            if t0 <= t < t0 + 2.2 + (0 if t0 < 5 else -0.4):
                a = eo3(prog(t, t0, 0.25)) * (1 - prog(t, t0 + 1.9, 0.3)) * board_a
                land = prog(t, t0, 0.8)
                for i, n in enumerate(dice):
                    shown = n if land >= 1 else (int(t * 14 + i * 3) % 6) + 1
                    ang = (1 - eo3(land)) * (-540 if i == 0 else 480)
                    yy = 1555 - (1 - eo3(prog(t, t0, 0.4))) * 120
                    im = die_img(shown, 150)
                    if a < 1:
                        im.putalpha(im.getchannel('A').point(lambda v: int(v * max(a, 0))))
                    cv.paste_rot(im, W / 2 + (-95 if i == 0 else 95), yy, ang)
        # rapid roll montage during the "strike first" build-up
        if 11.0 <= t < 12.9:
            a = eo3(prog(t, 11.0, 0.2)) * (1 - prog(t, 12.6, 0.3)) * board_a
            for i in range(2):
                shown = (int(t * 9 + i * 2) % 6) + 1
                im = die_img(shown, 150)
                im.putalpha(im.getchannel('A').point(lambda v: int(v * max(a, 0))))
                cv.paste_rot(im, W / 2 + (-95 if i == 0 else 95), 1555, math.sin(t * 9 + i) * 12)
        # provinces HUD
        if t >= 5.4:
            ha = eo3(prog(t, 5.4, 0.4)) * board_a
            cv.text(W / 2, 1715, 'PROVINCES CONTROLLED', 28, mix(MUTED, ha), spacing=4)
            for i in range(5):
                sx = W / 2 + (i - 2) * 76
                filled = i < sum(1 for tt in HUD_FILL if t >= tt)
                if filled:
                    pp = ob(prog(t, sorted(HUD_FILL)[i], 0.4))
                    col = GREEN
                    size = 25 * pp
                    cv.rect(sx - size, 1790 - size, sx + size, 1790 + size, mix(col, ha), r=8)
                else:
                    cv.rect(sx - 25, 1765, sx + 25, 1815, mix((226, 229, 235), ha), r=8)

        # ---- captions ----
        for (t0, t1, big, small) in CAPTIONS:
            if t0 <= t < t1 + 0.35:
                ain = eo3(prog(t, t0, 0.4)); aout = 1 - eio(prog(t, t1, 0.3))
                a = ain * aout * board_a
                dy = (1 - ain) * 40 - (1 - aout) * 30
                cv.text(W / 2, 250 + dy, big, 92, mix(INK, a))
                cv.text(W / 2, 350 + dy, small, 42, mix(MUTED, a), bold=False)

    # ---- win flash ----
    if 14.4 <= t < 15.1:
        f = 1 - prog(t, 14.4, 0.7)
        # soft white flash is skipped on purpose (white bg); small sparkle ring instead
    # ---- end card ----
    if t >= 17.0:
        e = eo3(prog(t, 17.3, 0.6))
        icon = rounded_icon(300)
        sc = ob(prog(t, 17.3, 0.7))
        ic = rounded_icon(300 * max(sc, 0.01))
        cv.im.paste(ic, (int((W / 2 - 150 * sc) * SS), int((640 - 150 * sc) * SS)), ic)
        cv.text(W / 2, 900, 'PROVINCE', 120, mix(INK, e), spacing=16)
        e2 = eo3(prog(t, 17.9, 0.5))
        cv.text(W / 2, 1010, 'The strategy game of bridges and borders', 44, mix(MUTED, e2), bold=False)
        e3 = ob(prog(t, 18.4, 0.5))
        if e3 > 0.02:
            w, h = 760 * e3, 150 * e3
            cv.rect(W / 2 - w / 2, 1220 - h / 2, W / 2 + w / 2, 1220 + h / 2, INK, r=int(h / 2))
            if e3 > .7:
                cv.text(W / 2, 1182, 'PLAY FREE', 54, WHITE, spacing=6)
                cv.text(W / 2, 1246, 'province-game.com', 44, (225, 228, 235), bold=False)
        e4 = eo3(prog(t, 19.0, 0.5))
        cv.text(W / 2, 1430, 'Plays in your browser · No download', 36, mix(MUTED, e4), bold=False)
    return cv.out()


def main():
    if '--preview' in sys.argv:
        d = OUT / 'frames'; d.mkdir(exist_ok=True)
        for t in [0.9, 2.2, 3.6, 4.6, 6.8, 9.2, 10.2, 12.4, 13.6, 15.6, 18.2, 19.6]:
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
