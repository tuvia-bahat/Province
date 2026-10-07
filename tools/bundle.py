"""בונה קובץ HTML בודד (CSS ו-JS מוטמעים) לפרסום כ-Artifact.

שימוש:  python tools/bundle.py <נתיב-פלט>
"""
import re
import sys
from pathlib import Path

FONTS = """<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700&display=swap">
"""
root = Path(__file__).resolve().parent.parent
html = (root / 'index.html').read_text(encoding='utf-8')
css = (root / 'style.css').read_text(encoding='utf-8')

body = re.search(r'<body>(.*)</body>', html, re.S).group(1)
scripts = re.findall(r'<script src="([^"]+)"></script>', body)
body = re.sub(r'\s*<script src="[^"]+"></script>', '', body)

out = '<title>Province</title>\n<style>\n:root{color-scheme:dark}\n' + css + '\n</style>\n' + body + '\n'
for src in scripts:
    out += '<script>\n' + (root / src).read_text(encoding='utf-8') + '\n</script>\n'

dest = Path(sys.argv[1])
dest.parent.mkdir(parents=True, exist_ok=True)
dest.write_text(out, encoding='utf-8')
print(f'{dest} ({len(out)} bytes, scripts: {", ".join(scripts)})')
