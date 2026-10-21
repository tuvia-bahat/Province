"""Generates Instagram posts (1080x1350, 4:5) into promo/instagram/. Run: python tools/make_instagram.py"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'promo' / 'instagram'
OUT.mkdir(parents=True, exist_ok=True)
SS = 2
W, H = 1080, 1350
GREEN, BLUE, INK, GRAY, MUTED = (52, 201, 138), (58, 156, 245), (27, 30, 36), (168, 174, 185), (106, 112, 124)
GREEN_T, BLUE_T, SOFT = (221, 246, 235), (222, 237, 253), (246, 247, 250)
F = 'C:/Windows/Fonts/'
font = lambda sz, bold=True: ImageFont.truetype(F + ('segoeuib.ttf' if bold else 'segoeui.ttf'), int(sz * SS))


class Canvas:
    def __init__(self, bg=(255, 255, 255)):
        self.im = Image.new('RGB', (W * SS, H * SS), bg)
        self.d = ImageDraw.Draw(self.im)

    def circ(self, x, y, r, fill=None, outline=None, width=0):
        self.d.ellipse([(x - r) * SS, (y - r) * SS, (x + r) * SS, (y + r) * SS], fill=fill, outline=outline, width=int(width * SS))

    def line(self, x1, y1, x2, y2, w, fill):
        self.d.line([x1 * SS, y1 * SS, x2 * SS, y2 * SS], fill=fill, width=int(w * SS))
        self.circ(x1, y1, w / 2, fill); self.circ(x2, y2, w / 2, fill)

    def rrect(self, x1, y1, x2, y2, r, fill=None, outline=None, width=0):
        self.d.rounded_rectangle([x1 * SS, y1 * SS, x2 * SS, y2 * SS], r * SS, fill=fill, outline=outline, width=int(width * SS))

    def text(self, x, y, s, sz, fill=INK, bold=True, anchor='la'):
        self.d.text((x * SS, y * SS), s, font=font(sz, bold), fill=fill, anchor=anchor)

    def wrap(self, x, y, s, sz, maxw, fill=INK, bold=True, lh=1.18, anchor='l'):
        words, lines, cur = s.split(' '), [], ''
        for w_ in words:
            t = (cur + ' ' + w_).strip()
            if self.d.textlength(t, font=font(sz, bold)) / SS <= maxw or not cur:
                cur = t
            else:
                lines.append(cur); cur = w_
        lines.append(cur)
        for i, ln in enumerate(lines):
            xx = x if anchor == 'l' else (x + maxw / 2 if anchor == 'm' else x + maxw)
            self.d.text((xx * SS, (y + i * sz * lh) * SS), ln, font=font(sz, bold), fill=fill, anchor={'l': 'la', 'm': 'ma', 'r': 'ra'}[anchor])
        return y + len(lines) * sz * lh

    def save(self, name):
        self.im.resize((W, H), Image.LANCZOS).save(OUT / name)
        print('wrote', name)


class Board:
    """6x6 board; cell (x, y) with y=0 at the bottom (Green's side)."""

    def __init__(self, c, ox, oy, step=92, gap=46):
        self.c, self.ox, self.oy, self.step, self.gap = c, ox, oy, step, gap

    def xy(self, x, y):
        s, g = self.step, self.gap
        return self.ox + x * s + (x // 2) * g, self.oy + (5 - y) * s + ((5 - y) // 2) * g

    def province(self, px, py, fill):   # tint of a 2x2 province
        (x1, y2), (x2, y1) = self.xy(px * 2, py * 2), self.xy(px * 2 + 1, py * 2 + 1)
        p = self.step * .62
        self.c.rrect(x1 - p, y1 - p, x2 + p, y2 + p, 34, fill=fill)

    def rivers(self, col=GRAY):
        s, g = self.step, self.gap
        for k in (1, 2):
            xr = self.xy(2 * k - 1, 0)[0] + (s + g) / 2
            self.c.line(xr, self.oy - self.step * .55, xr, self.oy + 5 * s + 2 * g + self.step * .55, 10, col)
            yr = self.xy(0, 5 - (2 * k - 1))[1] + (s + g) / 2
            self.c.line(self.ox - self.step * .55, yr, self.ox + 5 * s + 2 * g + self.step * .55, yr, 10, col)

    def dots(self, col=GRAY):
        for x in range(6):
            for y in range(6):
                cx, cy = self.xy(x, y); self.c.circ(cx, cy, 9, col)

    def bridge(self, a, b, col=GREEN):
        (x1, y1), (x2, y2) = self.xy(*a), self.xy(*b); self.c.line(x1, y1, x2, y2, 14, col)

    def base(self, x, y, n, col=GREEN, r=33):
        cx, cy = self.xy(x, y); self.c.circ(cx, cy, r, col)
        self.c.text(cx, cy + 1, str(n), 34, (255, 255, 255), anchor='mm')

    def ring(self, x, y, col=GREEN, r=50, dashed=True):
        cx, cy = self.xy(x, y)
        if not dashed:
            self.c.circ(cx, cy, r, outline=col, width=5); return
        import math
        for i in range(18):
            a0, a1 = i * 20, i * 20 + 11
            self.c.d.arc([(cx - r) * SS, (cy - r) * SS, (cx + r) * SS, (cy + r) * SS], a0, a1, fill=col, width=int(5 * SS))

    def full(self, tints=(), bases=(), bridges=(), rings=(), rivers=True):
        for px, py, col in tints: self.province(px, py, col)
        if rivers: self.rivers()
        self.dots()
        for a, b, col in bridges: self.bridge(a, b, col)
        for x, y, n, col in bases: self.base(x, y, n, col)
        for x, y, col in rings: self.ring(x, y, col)


def icon_badge(c, x, y, size):
    icon = Image.open(ROOT / 'icons' / 'icon-512.png').convert('RGBA').resize((size * SS, size * SS), Image.LANCZOS)
    mask = Image.new('L', icon.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, icon.width - 1, icon.height - 1], int(icon.width * .22), fill=255)
    icon.putalpha(mask)
    c.im.paste(icon, (int(x * SS), int(y * SS)), icon)


def die(c, x, y, n, s=120, bg=INK, pip=(255, 255, 255)):
    c.rrect(x, y, x + s, y + s, 26, fill=bg)
    pips = {1: [(.5, .5)], 2: [(.28, .28), (.72, .72)], 3: [(.28, .28), (.5, .5), (.72, .72)], 4: [(.28, .28), (.72, .28), (.28, .72), (.72, .72)],
            5: [(.28, .28), (.72, .28), (.5, .5), (.28, .72), (.72, .72)], 6: [(.28, .26), (.72, .26), (.28, .5), (.72, .5), (.28, .74), (.72, .74)]}[n]
    for px, py in pips: c.circ(x + px * s, y + py * s, s * .085, pip)


def header(c, tag, n=None, total=None):
    c.text(70, 70, 'PROVINCE', 34, INK)
    if n: c.text(W - 70, 74, f'{n} / {total}', 30, MUTED, False, 'ra')
    if tag: c.text(70, 125, tag, 26, MUTED, False)


def footer(c, swipe=False):
    c.text(70, H - 70, 'province-game.com', 28, MUTED, False, 'ls')
    if swipe: c.text(W - 70, H - 70, 'Swipe  →', 28, MUTED, True, 'rs')


def title(c, s, y=190, sz=76, w=W - 140):
    return c.wrap(70, y, s, sz, w, INK, True, 1.1)


def sub(c, s, y, sz=40, w=W - 140):
    return c.wrap(70, y + 14, s, sz, w, MUTED, False, 1.25)


BX, BY = 264, 600   # board origin for slides with a title above it (board 600 wide)


# ============ Carousel A: how to win in 5 steps ============
def carousel_a():
    total = 7
    # 1 cover
    c = Canvas(SOFT)
    icon_badge(c, 70, 70, 120)
    c.text(70, 250, 'How to win', 120, INK)
    c.text(70, 385, 'PROVINCE', 120, GREEN)
    c.text(70, 530, 'in 5 steps', 70, MUTED)
    b = Board(c, 300, 690, 80, 40)
    b.full([(0, 0, GREEN_T), (1, 0, GREEN_T)], [(1, 1, 8, GREEN), (2, 1, 4, GREEN), (4, 4, 3, BLUE), (1, 4, 2, BLUE)], [((1, 1), (2, 1), GREEN)])
    footer(c, True); c.save('A1_cover.png')

    steps = [
        ('1', 'Rivers split the board into 9 provinces.', 'Each province is a 2×2 block of squares.',
         lambda b: b.full([(i % 3, i // 3, (232, 235, 241) if (i + i // 3) % 2 == 0 else (244, 245, 248)) for i in range(9)])),
        ('2', 'Roll the dice. Two squares light up.', 'Land new soldiers on a lit square, or move from your bases.',
         lambda b: b.full([], [(1, 1, 6, GREEN), (4, 4, 3, BLUE)], [], [(2, 1, GREEN), (3, 4, GREEN)])),
        ('3', 'Be the only one in a province to control it.', 'Every square in it becomes your territory.',
         lambda b: b.full([(0, 0, GREEN_T)], [(1, 1, 5, GREEN), (0, 0, 3, GREEN), (4, 4, 3, BLUE)])),
        ('4', 'Bridges join provinces into one territory.', 'Move soldiers across a river to build one.',
         lambda b: b.full([(0, 0, GREEN_T), (1, 0, GREEN_T)], [(1, 1, 5, GREEN), (2, 1, 3, GREEN), (4, 4, 3, BLUE)], [((1, 1), (2, 1), GREEN)])),
        ('5', 'Control 5 connected provinces to win.', 'Loose provinces do not count.',
         lambda b: b.full([(0, 0, GREEN_T), (1, 0, GREEN_T), (2, 0, GREEN_T), (0, 1, GREEN_T), (1, 1, GREEN_T)],
                          [(1, 1, 5, GREEN), (2, 1, 3, GREEN), (3, 1, 2, GREEN), (4, 1, 4, GREEN), (1, 2, 3, GREEN), (5, 5, 4, BLUE)],
                          [((1, 1), (2, 1), GREEN), ((3, 1), (4, 1), GREEN), ((1, 1), (1, 2), GREEN)])),
    ]
    for i, (num, t, s, draw) in enumerate(steps):
        c = Canvas()
        header(c, 'HOW TO WIN', i + 2, total)
        c.circ(105, 262, 38, GREEN); c.text(105, 264, num, 46, (255, 255, 255), anchor='mm')
        y = c.wrap(170, 215, t, 64, W - 240, INK, True, 1.08)
        sub(c, s, max(y + 10, 410), 36)
        draw(Board(c, BX, BY, 92, 46))
        footer(c, i < len(steps) - 1 or True)
        c.save(f'A{i + 2}_step{num}.png')

    # last: CTA
    c = Canvas(INK)
    icon_badge(c, 70, 70, 120)
    c.text(70, 300, 'Your turn.', 130, (255, 255, 255))
    c.text(70, 440, 'Play free.', 130, GREEN)
    c.wrap(70, 620, 'Learn the game in a few minutes, then play the computer or a friend, online.', 46, W - 140, (200, 204, 212), False, 1.3)
    c.rrect(70, 930, 1010, 1070, 70, fill=GREEN)
    c.text(540, 1000, 'province-game.com', 56, (255, 255, 255), anchor='mm')
    c.text(70, H - 90, 'Link in bio', 34, (150, 156, 168), False)
    c.save('A7_cta.png')


# ============ Carousel B: battle rules ============
def duel(c, y, ln, rn, lcol, rcol, arrow=True):
    c.circ(300, y, 90, lcol); c.text(300, y + 2, str(ln), 84, (255, 255, 255), anchor='mm')
    c.circ(780, y, 90, rcol); c.text(780, y + 2, str(rn), 84, (255, 255, 255), anchor='mm')
    if arrow:
        c.line(400, y, 660, y, 16, INK)
        c.d.polygon([(690 * SS, y * SS), (640 * SS, (y - 34) * SS), (640 * SS, (y + 34) * SS)], fill=INK)


def carousel_b():
    total = 5
    c = Canvas(SOFT)
    icon_badge(c, 70, 70, 120)
    c.text(70, 260, 'Attack!', 150, INK)
    c.text(70, 430, 'The rules', 110, GREEN)
    c.text(70, 570, 'that decide every battle', 54, MUTED, False)
    duel(c, 900, 5, 3, GREEN, BLUE)
    footer(c, True); c.save('B1_cover.png')

    c = Canvas(); header(c, 'BATTLE RULES', 2, total)
    y = title(c, 'Attackers who kill go back to camp.', 190, 76)
    sub(c, 'Your soldiers do their job, then return. Plan for a long game.', y + 10, 38)
    duel(c, 800, 5, 3, GREEN, BLUE)
    c.text(300, 930, 'Attack with 5', 34, MUTED, False, 'ma'); c.text(780, 930, 'Defend with 3', 34, MUTED, False, 'ma')
    c.text(540, 1030, '3 defenders die', 50, INK, anchor='ma')
    c.text(540, 1100, '3 attackers return to camp', 50, INK, anchor='ma')
    c.text(540, 1170, '2 take the square', 50, GREEN, anchor='ma')
    footer(c, True); c.save('B2_return.png')

    c = Canvas(); header(c, 'BATTLE RULES', 3, total)
    y = title(c, 'Defenders die for good.', 190, 80)
    sub(c, 'Fallen soldiers never come back. The graveyard fills up.', y + 10, 38)
    c.circ(540, 760, 120, (232, 235, 241))
    c.line(540, 690, 540, 830, 18, MUTED); c.line(490, 725, 590, 725, 18, MUTED); c.line(470, 860, 610, 860, 18, MUTED)
    c.text(540, 1010, 'Every soldier counts.', 56, INK, anchor='ma')
    c.text(540, 1090, 'Strike first, strike smart.', 40, MUTED, False, 'ma')
    footer(c, True); c.save('B3_die.png')

    c = Canvas(); header(c, 'BATTLE RULES', 4, total)
    y = title(c, 'Attack from any base in your territory.', 190, 70)
    sub(c, 'When the lit square is inside your territory, any of your bases can play.', y + 10, 38)
    b = Board(c, 290, BY + 30, 80, 40)
    b.full([(0, 0, GREEN_T), (1, 0, GREEN_T)], [(1, 1, 6, GREEN), (2, 1, 4, GREEN), (0, 0, 3, GREEN), (0, 3, 2, BLUE)], [((1, 1), (2, 1), GREEN)], [(0, 0, GREEN)])
    footer(c, True); c.save('B4_any_base.png')

    c = Canvas(INK)
    icon_badge(c, 70, 70, 120)
    c.text(70, 300, 'Ready to', 130, (255, 255, 255)); c.text(70, 440, 'attack?', 130, GREEN)
    c.wrap(70, 620, 'Play free in your browser. No download, no signup.', 46, W - 140, (200, 204, 212), False, 1.3)
    c.rrect(70, 930, 1010, 1070, 70, fill=GREEN)
    c.text(540, 1000, 'province-game.com', 56, (255, 255, 255), anchor='mm')
    c.text(70, H - 90, 'Link in bio', 34, (150, 156, 168), False)
    c.save('B5_cta.png')


# ============ Single posts ============
def singles():
    # S1 hero
    c = Canvas(SOFT)
    icon_badge(c, 70, 70, 150)
    c.text(70, 300, 'PROVINCE', 150, INK)
    c.text(74, 500, 'The strategy game of', 54, MUTED, False)
    c.text(74, 565, 'bridges and borders.', 54, MUTED, False)
    b = Board(c, 290, 725, 76, 38)
    b.full([(0, 0, GREEN_T), (1, 0, GREEN_T), (0, 1, GREEN_T)], [(1, 1, 8, GREEN), (2, 1, 4, GREEN), (1, 3, 3, GREEN), (4, 4, 4, BLUE), (1, 4, 2, BLUE)],
           [((1, 1), (2, 1), GREEN), ((1, 1), (1, 2), GREEN)])
    c.text(70, H - 70, 'Play free · province-game.com', 30, MUTED, True, 'ls')
    c.save('S1_hero.png')

    # S2 connected
    c = Canvas()
    header(c, '')
    y = title(c, 'Loose provinces do not count.', 160, 82)
    sub(c, 'You need 5 provinces, all connected by bridges.', y + 10, 40)
    b = Board(c, BX, BY + 50, 92, 46)
    b.full([(0, 0, GREEN_T), (1, 0, GREEN_T), (0, 1, GREEN_T), (2, 2, (236, 237, 241))],
           [(1, 1, 5, GREEN), (2, 1, 3, GREEN), (1, 3, 3, GREEN), (4, 4, 4, GREEN)],
           [((1, 1), (2, 1), GREEN), ((1, 1), (1, 3), GREEN)])
    c.text(b.xy(5, 4)[0] + 47, b.xy(5, 4)[1] + 58, 'not connected', 30, MUTED, True, 'ra')
    footer(c); c.save('S2_connected.png')

    # S3 pass
    c = Canvas(INK)
    c.text(70, 90, 'PROVINCE', 34, (255, 255, 255))
    c.text(70, 340, 'No legal', 130, (255, 255, 255)); c.text(70, 480, 'move?', 130, GREEN)
    c.wrap(70, 680, 'Both lit squares are deep in enemy land. Sometimes the best move is to pass.', 52, W - 140, (200, 204, 212), False, 1.3)
    die(c, 70, 1000, 5, bg=(255, 255, 255), pip=INK); die(c, 220, 1000, 1, bg=(255, 255, 255), pip=INK)
    c.text(400, 1060, 'Tap Pass.', 60, GREEN, True, 'la')
    c.text(70, H - 70, 'province-game.com', 28, (150, 156, 168), False, 'ls')
    c.save('S3_pass.png')

    # S4 challenge
    c = Canvas(SOFT)
    icon_badge(c, 70, 70, 120)
    c.text(70, 280, 'Can you beat', 110, INK); c.text(70, 410, 'the computer?', 110, GREEN)
    c.wrap(70, 590, 'Learn in minutes. Master for a lifetime.', 50, W - 140, MUTED, False, 1.3)
    b = Board(c, 290, 745, 76, 38)
    b.full([(2, 2, BLUE_T), (1, 2, BLUE_T)], [(4, 4, 6, BLUE), (3, 4, 3, BLUE), (1, 1, 8, GREEN), (2, 1, 4, GREEN)], [((4, 4), (3, 4), BLUE), ((1, 1), (2, 1), GREEN)])
    c.text(70, H - 70, 'Play free · province-game.com', 30, MUTED, True, 'ls')
    c.save('S4_challenge.png')


CAPTIONS = """PROVINCE - INSTAGRAM CAPTIONS
=================================

A) Carousel "How to win Province in 5 steps"  (A1 ... A7)
----------------------------------------------------------
EN:
Rivers split the board into 9 provinces. Control 5 of them, all connected by bridges, and you win.
Swipe to learn the whole game in 60 seconds. Then try it for free. Link in bio.
#province #boardgame #strategygame #browsergame #freetoplay #indiegame #indiedev #gamedev #puzzlegame #tabletop

HE:
נהרות מחלקים את הלוח ל-9 פרובינציות. שולטים ב-5 מהן, מחוברות בגשרים, ומנצחים.
תעברו על הקרוסלה ותלמדו את כל המשחק בדקה. אחר כך אפשר לשחק בחינם. הקישור בביו.
#משחקי_חשיבה #משחק_אסטרטגיה #משחקי_קופסה #פרובינס

B) Carousel "Attack! The rules"  (B1 ... B5)
----------------------------------------------------------
EN:
Attackers who kill go back to camp. Defenders die for good. Know the rules before you strike.
Play free: link in bio.
#province #strategygame #boardgames #browsergame #indiegame #gamedev

HE:
התוקפים שהורגים חוזרים למחנה. המגנים מתים לתמיד. תכירו את החוקים לפני שתתקפו.
משחקים בחינם: הקישור בביו.

C) Single "PROVINCE hero"  (S1_hero)
----------------------------------------------------------
EN: Province - the strategy game of bridges and borders. Free, in your browser, no download. Link in bio.
HE: Province - משחק האסטרטגיה של גשרים וגבולות. בחינם, בדפדפן, בלי להוריד כלום. הקישור בביו.

D) Single "Loose provinces do not count"  (S2_connected)
----------------------------------------------------------
EN: The rule people forget: your 5 provinces must be connected by bridges. Which one is loose here? Tell us in the comments.
HE: החוק ששוכחים: 5 הפרובינציות שלכם חייבות להיות מחוברות בגשרים. איזו פרובינציה כאן לא מחוברת? כתבו בתגובות.

E) Single "No legal move?"  (S3_pass)
----------------------------------------------------------
EN: Sometimes the best move is no move. Have you ever had to pass? Link in bio to play.
HE: לפעמים המהלך הכי טוב הוא לא לזוז. קרה לכם שהייתם חייבים לעשות Pass? הקישור בביו.

F) Single "Can you beat the computer?"  (S4_challenge)
----------------------------------------------------------
EN: Can you beat the computer? Play free: link in bio. Tell us your result.
HE: אפשר לנצח את המחשב? משחקים בחינם: הקישור בביו. ספרו לנו מה יצא לכם.

Posting tips
- Post order for a fresh account: C (hero) first, then A (carousel), then D, B, E, F, one every 2 days.
- Put province-game.com in your bio link (and a WhatsApp community link via a link-in-bio tool).
- Share each carousel to Stories too, with a link sticker.
"""

if __name__ == '__main__':
    carousel_a(); carousel_b(); singles()
    (OUT / 'captions.txt').write_text(CAPTIONS, encoding='utf-8')
    print('wrote captions.txt')
