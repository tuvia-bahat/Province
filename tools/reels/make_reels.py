"""Renders meme-style Reels (1080x1920, 30 fps) from REAL games: net-vs-net games played on the actual engine (gen_games.js),
re-drawn move by move, with a camera that zooms into the key moment, a setup caption at the top and a punchline at the bottom.
  node tools/reels/gen_games.js --games 120 --procs 16        # plays the games, finds highlights
  python tools/reels/make_reels.py [--preview] [name ...]     # writes promo/reels/<name>.mp4   (--preview: still frames only)
Requires: pip install numpy imageio imageio-ffmpeg pillow
"""
import json, math, sys, glob
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent.parent
GAMES = Path(__file__).resolve().parent / 'games'
OUT = ROOT / 'promo' / 'reels'; OUT.mkdir(parents=True, exist_ok=True)
W, H, FPS = 1080, 1920, 30
SS = 1.5
GREEN, BLUE, INK = (52, 201, 138), (58, 156, 245), (27, 30, 36)
GRAY, MUTED, LIGHT, WHITE = (168, 174, 185), (106, 112, 124), (243, 244, 247), (255, 255, 255)
RED = (232, 83, 83)
COL = {0: GREEN, 1: BLUE}
P_, G_, M_, CR_ = 64, 34, -11, 21
BW = 2 * M_ + 6 * P_ + 2 * G_
S = 2.1
OX, OY = (W - BW * S) / 2, 540
WIN_Y, WIN_H = 520, 960            # the board window on the final frame
FD = 'C:/Windows/Fonts/'
_f = {}


def font(sz, black=False):
    k = (sz, black)
    if k not in _f: _f[k] = ImageFont.truetype(FD + ('seguibl.ttf' if black else 'segoeuib.ttf'), int(sz * SS))
    return _f[k]
def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def eo3(x): return 1 - (1 - x) ** 3
def eio(x): return 3 * x * x - 2 * x ** 3
def ob(x):
    c1 = 1.9; c3 = c1 + 1
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2
def mix(c, a, bg=WHITE): return tuple(int(bg[i] + (c[i] - bg[i]) * a) for i in range(3))
def lerp(a, b, t): return a + (b - a) * t


def cell(x, y):
    X = M_ + x * P_ + (x // 2) * G_ + P_ / 2
    r = 5 - y
    Y = M_ + r * P_ + (r // 2) * G_ + P_ / 2
    return OX + X * S, OY + Y * S
def cxy(i): return cell(i % 6, i // 6)
def prov_rect(px, py):
    rv = lambda j: M_ + 2 * j * P_ + (j - 1) * G_ + G_ / 2
    e = [0, rv(1), rv(2), BW]
    top = 2 - py
    return OX + e[px] * S, OY + e[top] * S, OX + e[px + 1] * S, OY + e[top + 1] * S


class Cv:
    def __init__(self, bg=WHITE):
        self.im = Image.new('RGB', (int(W * SS), int(H * SS)), bg)
        self.d = ImageDraw.Draw(self.im)
    def circ(self, x, y, r, fill=None, outline=None, width=0):
        self.d.ellipse([(x - r) * SS, (y - r) * SS, (x + r) * SS, (y + r) * SS], fill=fill, outline=outline, width=int(width * SS))
    def line(self, x1, y1, x2, y2, w, fill):
        self.d.line([x1 * SS, y1 * SS, x2 * SS, y2 * SS], fill=fill, width=int(w * SS)); self.circ(x1, y1, w / 2, fill); self.circ(x2, y2, w / 2, fill)
    def rrect(self, x1, y1, x2, y2, r, fill=None, outline=None, width=0):
        self.d.rounded_rectangle([x1 * SS, y1 * SS, x2 * SS, y2 * SS], r * SS, fill=fill, outline=outline, width=int(width * SS))
    def text(self, x, y, s, sz, fill=INK, black=True, anchor='mm'):
        self.d.text((x * SS, y * SS), s, font=font(sz, black), fill=fill, anchor=anchor)
    def tw(self, s, sz, black=True): return self.d.textlength(s, font=font(sz, black)) / SS
    def wrap(self, cx, y, s, sz, maxw, fill=INK, lh=1.12, black=True):
        words, lines, cur = s.split(' '), [], ''
        for w_ in words:
            t = (cur + ' ' + w_).strip()
            if self.tw(t, sz, black) <= maxw or not cur: cur = t
            else: lines.append(cur); cur = w_
        lines.append(cur)
        for i, ln in enumerate(lines): self.text(cx, y + i * sz * lh, ln, sz, fill, black)
        return len(lines)
    def arc(self, x, y, r, a0, a1, fill, w):
        self.d.arc([(x - r) * SS, (y - r) * SS, (x + r) * SS, (y + r) * SS], a0, a1, fill=fill, width=int(w * SS))


def die(cv, x, y, n, s=92, pop=1.0):
    s *= pop
    cv.rrect(x - s / 2, y - s / 2, x + s / 2, y + s / 2, s * .22, fill=INK)
    pips = {1: [(.5, .5)], 2: [(.28, .28), (.72, .72)], 3: [(.28, .28), (.5, .5), (.72, .72)], 4: [(.28, .28), (.72, .28), (.28, .72), (.72, .72)],
            5: [(.28, .28), (.72, .28), (.5, .5), (.28, .72), (.72, .72)], 6: [(.28, .26), (.72, .26), (.28, .5), (.72, .5), (.28, .74), (.72, .74)]}[n]
    for px, py in pips: cv.circ(x - s / 2 + px * s, y - s / 2 + py * s, s * .085, WHITE)


def dashed_ring(cv, x, y, r, col, off=0.0, n=16, w=5):
    for i in range(n):
        a0 = (i * 360 / n + off) % 360
        cv.arc(x, y, r, a0, a0 + 360 / n * .55, col, w)


def draw_board(cv, A, B, ev, t, now):
    """A = snapshot before, B = snapshot after the event; t in [0,1] progress of the event."""
    is_act = ev is not None and ev['kind'] == 'act'
    tt = eio(clamp((t - .5) / .4)) if is_act else (1.0 if ev is None and A is B else 0.0)
    if ev is not None and ev['kind'] != 'act': tt = 0.0
    for k in range(9):
        a0, a1 = A['ctl'][k], B['ctl'][k]
        x1, y1, x2, y2 = prov_rect(k % 3, k // 3)
        for who in (0, 1):
            al = lerp(1.0 if a0 == who else 0.0, 1.0 if a1 == who else 0.0, tt)
            if al > 0.01: cv.rrect(x1 + 6, y1 + 6, x2 - 6, y2 - 6, 15, fill=mix(COL[who], .17 * al))
    for k in (1, 2):
        pos = M_ + 2 * k * P_ + (k - 1) * G_ + G_ / 2
        cv.line(OX + pos * S, OY - 30, OX + pos * S, OY + BW * S + 30, 7.5 * S, GRAY)
        cv.line(OX - 30, OY + pos * S, OX + BW * S + 30, OY + pos * S, 7.5 * S, GRAY)
    for i in range(36):
        x, y = cxy(i); cv.circ(x, y, 5.2 * S, GRAY)
    for key in set(A['bridges']) | set(B['bridges']):
        a, b = map(int, key.split('-')); inA, inB = key in A['bridges'], key in B['bridges']
        own = B['bridges'].get(key, A['bridges'].get(key))
        grow = 1.0 if (inA and inB) else clamp((t - .15) / .4) if inB else 1 - clamp((t - .5) / .3)
        if is_act is False and ev is not None and not (inA and inB): grow = 1.0 if inA else 0.0
        if grow <= 0: continue
        (x1, y1), (x2, y2) = cxy(a), cxy(b)
        h = .5 * grow
        cv.line(lerp(x1, x2, .5 - h), lerp(y1, y2, .5 - h), lerp(x1, x2, .5 + h), lerp(y1, y2, .5 + h), 7 * S, COL[own])
    disp = {i: list(c) for i, c in enumerate(A['cells'] if (ev is not None and ev['kind'] != 'act') else (B if tt >= 1 or ev is None else A)['cells'])}
    chip = None; flash = None; shake = 0
    d = ev['data'] if is_act else None
    if d:
        typ = d['type']; src = d.get('from'); dst = d.get('to', d.get('R')); actor = ev['actor']
        if typ == 'land':
            f = clamp(t / .45); g = clamp((t - .45) / .3)
            n0, n1 = A['cells'][dst][1], B['cells'][dst][1]
            if f < 1: chip = (cxy(dst)[0], cxy(dst)[1] - 380 * (1 - eo3(f)), d['count'], COL[actor]); disp[dst] = list(A['cells'][dst])
            else: disp[dst] = [actor, int(round(lerp(n0, n1, eio(g))))]
        elif src is not None and dst is not None and typ in ('move', 'transport'):
            f = clamp(t / .5); (sx, sy), (dx, dy) = cxy(src), cxy(dst)
            rest = A['cells'][src][1] - d['count']
            disp[src] = [A['cells'][src][0], rest] if rest > 0 else [-1, 0]
            if f < 1: chip = (lerp(sx, dx, eio(f)), lerp(sy, dy, eio(f)), d['count'], COL[actor])
            else:
                g = clamp((t - .5) / .35); a_o = A['cells'][dst][0]
                disp[dst] = [B['cells'][dst][0] if g > .6 else a_o, int(round(lerp(A['cells'][dst][1], B['cells'][dst][1], eio(g))))]
                if a_o not in (-1, actor):
                    flash = (dx, dy, clamp(1 - abs(g - .2) * 2.2))
                    if g < .55: shake = math.sin(g * 70) * 7 * (1 - g * 1.8)
                if B['cells'][dst][0] == -1 and g > .8: disp[dst] = [-1, 0]
    for i in range(36):
        o, n = disp[i]
        if o < 0 or n <= 0: continue
        x, y = cxy(i)
        if flash and abs(x - flash[0]) < 1 and abs(y - flash[1]) < 1: x += shake
        cv.circ(x, y, CR_ * S, COL[o]); cv.text(x, y + 1, str(n), 22 * S, WHITE)
    if flash: cv.circ(flash[0], flash[1], (CR_ + 10 + 26 * (1 - flash[2])) * S, None, RED, 6 * flash[2] + 1)
    if flash and ev.get('killed'):
        g = clamp((t - .5) / .35)
        cv.text(flash[0], flash[1] - (60 + 90 * g) * S / 2.1, f"-{ev['killed']}", 46 * (0.6 + 0.6 * min(1, g * 3)), mix(RED, clamp(1.6 - g * 0.9)))
    if chip:
        cx_, cy_, n, col = chip
        cv.circ(cx_, cy_, CR_ * S * 1.1, col, WHITE, 3); cv.text(cx_, cy_ + 1, str(n), 22 * S, WHITE)
    # lit squares of the current roll
    show = None
    if ev is not None and ev['kind'] == 'roll': show = (B['roll'], B['turn'], clamp(t / .4))
    elif ev is not None and ev['kind'] != 'roll' and t < .5 and A['roll']: show = (A['roll'], A['turn'], 1.0)
    elif ev is None and A is B and B['roll']: show = (B['roll'], B['turn'], 1.0)
    if show and show[0]:
        for c in show[0]['cells']:
            x, y = cxy(c); dashed_ring(cv, x, y, (CR_ + 6) * S * (1 + .04 * math.sin(now * 6)), mix(COL[show[1]], max(.3, show[2])), now * 60)
    return flash


def scoreboard(cv, S_, flashes):
    for who, y in ((1, 497), (0, 1503)):
        cv.circ(OX + 14, y, 13, COL[who])
        n = S_['prog'][who]
        for k in range(5):
            cv.rrect(OX + 44 + k * 38, y - 12, OX + 44 + k * 38 + 31, y + 12, 6, fill=COL[who] if k < n else LIGHT)
        lost = S_['grave'][who]
        col = RED if flashes.get(who, 0) > 0 else MUTED
        cv.text(OX + BW * S - 4, y, f"{lost} lost", 26 + 6 * flashes.get(who, 0), col, True, 'rm')


def render_clip(name, game, start, end, key_idx, top, bottom, zoom=1.7, slow=2.4, preview=False, cap_t=1.8, end_t=3.0):
    E, Sn = game['events'][start:end + 1], game['snaps'][start:end + 2]
    segs = []
    for i, ev in enumerate(E):
        key = (start + i) == key_idx
        dur = 1.0 if ev['kind'] == 'roll' else (slow if key else 1.2)
        segs.append(dict(ev=ev, A=Sn[i], B=Sn[i + 1], dur=dur, key=key, t0=0))
    acc = cap_t
    for s in segs: s['t0'] = acc; acc += s['dur'] + .1
    total = acc + end_t
    key = next((s for s in segs if s['key']), None)
    # camera keyframes (time, zoom, focus x, focus y)
    cam = [(0, 1.0, W / 2, WIN_Y + WIN_H / 2)]
    if key:
        d = key['ev']['data']
        if d.get('type') is None: fx, fy, zoom = W / 2, WIN_Y + WIN_H / 2, 1.0   # a skipped turn: no zoom
        else:
            a = cxy(d.get('from', d.get('R'))); b = cxy(d.get('to', d.get('R')))
            fx, fy = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
        cam += [(max(0.1, key['t0'] - .7), 1.0, W / 2, WIN_Y + WIN_H / 2), (key['t0'] - .15, zoom, fx, fy), (key['t0'] + key['dur'] + .5, zoom, fx, fy), (key['t0'] + key['dur'] + 1.2, 1.0, W / 2, WIN_Y + WIN_H / 2)]
    cam.append((total, 1.0, W / 2, WIN_Y + WIN_H / 2))
    def camera(now):
        for (t0, z0, x0, y0), (t1, z1, x1, y1) in zip(cam, cam[1:]):
            if t0 <= now <= t1:
                u = eio(clamp((now - t0) / max(1e-6, t1 - t0)))
                return lerp(z0, z1, u), lerp(x0, x1, u), lerp(y0, y1, u)
        return 1.0, W / 2, WIN_Y + WIN_H / 2
    nfr = int(total * FPS)
    pick = set(int(total * FPS * f) for f in (0.02, 0.14, 0.26, .38, .5, .62, .74, .86, .97)) if preview else None
    frames, shots = [], []
    for fi in range(nfr):
        if pick is not None and fi not in pick: continue
        now = fi / FPS
        cur = (Sn[0], Sn[0], None, 0)
        if now >= cap_t:
            cur = (Sn[-1], Sn[-1], None, 1)
            for s in segs:
                if now < s['t0'] + s['dur']: cur = (s['A'], s['B'], s['ev'], (now - s['t0']) / s['dur']); break
                if now < s['t0'] + s['dur'] + .1: cur = (s['B'], s['B'], None, 1); break
        A, B, ev, t = cur
        # board layer (zoomable)
        lay = Cv(); flash = draw_board(lay, A, B, ev, t, now)
        z, fx, fy = camera(now)
        cw, ch = W / z, WIN_H / z
        x0 = clamp(fx - cw / 2, 0, W - cw); y0 = clamp(fy - ch / 2, WIN_Y - 40, WIN_Y + WIN_H + 40 - ch)
        crop = lay.im.crop((int(x0 * SS), int(y0 * SS), int((x0 + cw) * SS), int((y0 + ch) * SS))).resize((int(W * SS), int(WIN_H * SS)), Image.LANCZOS)
        cv = Cv(); cv.im.paste(crop, (0, int(WIN_Y * SS))); cv.d = ImageDraw.Draw(cv.im)
        # cover the zoomed board's overflow above/below the window
        cv.d.rectangle([0, 0, int(W * SS), int((WIN_Y) * SS) - 1], fill=WHITE); cv.d.rectangle([0, int((WIN_Y + WIN_H) * SS), int(W * SS), int(H * SS)], fill=WHITE)
        flashes = {}
        if key and key['t0'] <= now <= key['t0'] + key['dur']:
            u = (now - key['t0']) / key['dur']
            if .5 < u < .95:
                d = key['ev']['data']; victim = 1 - key['ev']['actor']; flashes[victim] = 1.0
        scoreboard(cv, B if (ev is None or t > .6) else A, flashes)
        if ev is not None and ev['kind'] == 'skip' and not ev['data'].get('pass'):
            pp = ob(clamp(t / .35)); wd = 560 * min(pp, 1.08)
            cv.rrect(W / 2 - wd / 2, 975, W / 2 + wd / 2, 1075, 28, fill=INK); cv.text(W / 2, 1026, 'NO LEGAL MOVE', max(6, 44 * min(pp, 1.05)), WHITE, True)
        if ev is not None and ev['kind'] == 'roll':
            w, b = ev['data']['w'], ev['data']['b']
            die(cv, W / 2 - 70, 430, w, pop=ob(clamp(t / .35))); die(cv, W / 2 + 70, 430, b, pop=ob(clamp((t - .08) / .35)))
        cv.wrap(W / 2, 170, top, 60 * (0.94 + .06 * clamp(now / .4)), W - 150, mix(INK, clamp(now / .35)))
        if bottom and key:
            kt = key['t0'] + key['dur'] * .55
            if now >= kt:
                pop = ob(clamp((now - kt) / .45)); sz = 66 * (0.8 + 0.2 * min(pop, 1.1))
                cv.wrap(W / 2, 1585, bottom, sz, W - 130, mix(INK, clamp(pop * 1.5)))
        et = now - (total - end_t) - .8
        if et > 0:
            a = clamp(et / .5); cv.rrect(W / 2 - 270, 1760, W / 2 + 270, 1830, 35, fill=mix(INK, a)); cv.text(W / 2, 1795, 'Province · play free', 34, mix(WHITE, 1), True)
        frames.append(cv.im.resize((W, H), Image.LANCZOS))
    if preview:
        for k, fr in zip(sorted(pick), frames): fr.resize((540, 960)).save(OUT / f'{name}_p{k:03d}.png')
        print(name, 'preview', len(frames), 'frames, total', round(total, 1), 's'); return
    import imageio
    w = imageio.get_writer(str(OUT / f'{name}.mp4'), fps=FPS, codec='libx264', quality=8, macro_block_size=1, ffmpeg_params=['-pix_fmt', 'yuv420p'])
    for fr in frames: w.append_data(np.asarray(fr))
    w.close(); print('wrote', name, round(total, 1), 's')


def best(type_, actor=None, minscore=0, prefer_at=30):
    cand = []
    for f in sorted(glob.glob(str(GAMES / 'g*.json'))):
        g = json.load(open(f))
        for h in g['highlights']:
            if h['type'] != type_ or h['score'] < minscore: continue
            if actor is not None and g['events'][h['at']]['actor'] != actor: continue
            cand.append((h['score'], -abs(h['at'] - prefer_at), g, h))
    cand.sort(key=lambda x: (x[0], x[1]), reverse=True)
    return cand
