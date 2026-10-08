"""מחליף את משקלי ההערכה של המחשב ב-src/ai.js (WEIGHTS) במשקלים מקובץ JSON, למשל תוצאת tests/train.html.

שימוש:  python tools/adopt_weights.py <קובץ-json> [מפתח] [--size 6|8] [--blend]
  מפתח: אם נתון, לוקחים את JSON[מפתח]; אחרת את כל הקובץ.
  --size: איזה גודל לוח לעדכן (ברירת מחדל 6).
  --blend: מערבבים חצי-חצי עם המשקלים הנוכחיים.
"""
import json
import re
import sys
from pathlib import Path

ai = Path(__file__).resolve().parent.parent / 'src' / 'ai.js'
args = sys.argv[1:]
size = 6
if '--size' in args:
    i = args.index('--size')
    size = int(args[i + 1])
    del args[i:i + 2]
blend = '--blend' in args
args = [a for a in args if a != '--blend']

data = json.loads(Path(args[0]).read_text(encoding='utf-8'))
if len(args) > 1:
    data = data[args[1]]

s = ai.read_text(encoding='utf-8')
m = re.search(r'^(\s*)%d: \{ (.*) \},$' % size, s, re.M)
if not m:
    sys.exit('לא נמצאה שורת משקלים לגודל %d' % size)
cur = {k: float(v) for k, v in re.findall(r'(\w+): (-?[\d.]+)', m.group(2))}
names = list(cur.keys())
if blend:
    for k in names:
        data[k] = round(0.5 * data.get(k, 0) + 0.5 * cur[k], 2)
items = ', '.join(f'{k}: {data.get(k, cur[k])}' for k in names)
s = s[:m.start()] + f'{m.group(1)}{size}: {{ {items} }},' + s[m.end():]
ai.write_text(s, encoding='utf-8')
print(items)
