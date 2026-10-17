"""Generates the social share image icons/og-image.png (1200x630). Run: python tools/make_og.py"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SS = 2
W, H = 1200, 630
GREEN, BLUE, INK, GRAY, MUTED = (52, 201, 138), (58, 156, 245), (27, 30, 36), (168, 174, 185), (106, 112, 124)
F = 'C:/Windows/Fonts/'
font = lambda sz, bold=True: ImageFont.truetype(F + ('segoeuib.ttf' if bold else 'segoeui.ttf'), int(sz * SS))

im = Image.new('RGB', (W * SS, H * SS), (255, 255, 255))
d = ImageDraw.Draw(im)
# soft background tint on the right half
d.rectangle([W * SS * 0.56, 0, W * SS, H * SS], fill=(246, 247, 250))


def circ(x, y, r, fill):
    d.ellipse([(x - r) * SS, (y - r) * SS, (x + r) * SS, (y + r) * SS], fill=fill)


def line(x1, y1, x2, y2, w, fill):
    d.line([x1 * SS, y1 * SS, x2 * SS, y2 * SS], fill=fill, width=int(w * SS))
    circ(x1, y1, w / 2, fill); circ(x2, y2, w / 2, fill)


# board motif (right side): 6x6 dots, two rivers, a few bases and a bridge
ox, oy, step, gap = 735, 90, 68, 34
def cell(x, y): return ox + x * step + (x // 2) * gap, oy + (5 - y) * step + ((5 - y) // 2) * gap
for k in (1, 2):
    p = ox + 2 * k * step + (k - 1) * gap - step / 2 + gap / 2 + step / 2 - 0
    xr = ox + (2 * k - 1) * step + (k - 1) * gap + step / 2 + gap / 2 - step / 2 + 0
for k in (1, 2):
    xr = cell(2 * k - 1, 0)[0] + (step + gap) / 2
    line(xr, oy - 30, xr, oy + 5 * step + 2 * gap + 30, 10, GRAY)
    yr = cell(0, 5 - (2 * k - 1))[1] + (step + gap) / 2
    line(ox - 30, yr, ox + 5 * step + 2 * gap + 30, yr, 10, GRAY)
for x in range(6):
    for y in range(6):
        cx, cy = cell(x, y); circ(cx, cy, 9, GRAY)
greens = [(1, 1), (2, 1), (3, 1), (1, 2), (3, 2)]
blues = [(4, 4), (1, 4)]
for (a, b) in [((1, 1), (2, 1)), ((3, 1), (3, 2)), ((1, 1), (1, 2))]:
    (x1, y1), (x2, y2) = cell(*a), cell(*b); line(x1, y1, x2, y2, 10, GREEN)
for (x, y), n in zip(greens, [8, 4, 5, 3, 2]):
    cx, cy = cell(x, y); circ(cx, cy, 27, GREEN)
    d.text((cx * SS, cy * SS), str(n), font=font(24), fill=(255, 255, 255), anchor='mm')
for (x, y), n in zip(blues, [4, 3]):
    cx, cy = cell(x, y); circ(cx, cy, 27, BLUE)
    d.text((cx * SS, cy * SS), str(n), font=font(24), fill=(255, 255, 255), anchor='mm')

# icon + title (left side)
icon = Image.open(ROOT / 'icons' / 'icon-512.png').convert('RGBA').resize((190 * SS, 190 * SS), Image.LANCZOS)
mask = Image.new('L', icon.size, 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, icon.width - 1, icon.height - 1], int(icon.width * .22), fill=255)
icon.putalpha(mask)
im.paste(icon, (80 * SS, 105 * SS), icon)
d.text((80 * SS, 395 * SS), 'PROVINCE', font=font(104), fill=INK, anchor='ls')
d.text((84 * SS, 465 * SS), 'The strategy game of bridges and borders', font=font(29, False), fill=MUTED, anchor='ls')
d.rounded_rectangle([80 * SS, 510 * SS, 420 * SS, 580 * SS], 35 * SS, fill=INK)
d.text((250 * SS, 545 * SS), 'PLAY FREE · province-game.com', font=font(21), fill=(255, 255, 255), anchor='mm')

out = ROOT / 'icons' / 'og-image.png'
im.resize((W, H), Image.LANCZOS).save(out)
print('wrote', out)
