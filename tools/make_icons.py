"""Generates the app icons (icons/*.png). Run: python tools/make_icons.py"""
from pathlib import Path
from PIL import Image, ImageDraw

BG = (27, 30, 36)
GREEN = (52, 201, 138)
BLUE = (58, 156, 245)
GREY = (168, 174, 185)


def make(size):
    s = size * 4   # supersampling for smooth edges
    im = Image.new('RGB', (s, s), BG)
    d = ImageDraw.Draw(im)
    c = s / 2
    off = s * 0.17          # dot centers at +-off from the middle (inside the maskable safe zone)
    big = s * 0.135
    small = s * 0.075
    dots = [(-off, -off, GREY, small), (off, -off, BLUE, big), (-off, off, GREEN, big), (off, off, GREY, small)]
    for dx, dy, col, r in dots:
        d.ellipse([c + dx - r, c + dy - r, c + dx + r, c + dy + r], fill=col)
    return im.resize((size, size), Image.LANCZOS)


out = Path(__file__).resolve().parent.parent / 'icons'
out.mkdir(exist_ok=True)
for name, size in [('icon-192.png', 192), ('icon-512.png', 512), ('apple-touch-icon.png', 180)]:
    make(size).save(out / name)
print('ok')
