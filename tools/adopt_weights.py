"""מחליף את DEFAULT_W ב-src/ai.js במשקלים מקובץ JSON (למשל תוצאת tests/train.html).

שימוש:  python tools/adopt_weights.py <קובץ-json> [מפתח]
  אם נתון מפתח, לוקחים את JSON[מפתח]; אחרת את כל הקובץ.
  אפשר גם --blend <קובץ-json-נוסף> לערבב חצי-חצי עם המשקלים הנוכחיים.
"""
import json
import re
import sys
from pathlib import Path

ai = Path(__file__).resolve().parent.parent / 'src' / 'ai.js'
args = sys.argv[1:]
data = json.loads(Path(args[0]).read_text(encoding='utf-8'))
if len(args) > 1 and not args[1].startswith('--'):
    data = data[args[1]]

s = ai.read_text(encoding='utf-8')
a = s.index('const DEFAULT_W = {')
b = s.index('};', a)
cur = {k: float(v) for k, v in re.findall(r'(\w+): (-?[\d.]+)', s[a:b])}
names = list(cur.keys())
if '--blend' in args:
    for k in names:
        data[k] = round(0.5 * data.get(k, 0) + 0.5 * cur[k], 2)
items = ', '.join(f'{k}: {data.get(k, cur[k])}' for k in names)
s = s[:a] + 'const DEFAULT_W = {\n    ' + items + ',\n  ' + s[b:]
ai.write_text(s, encoding='utf-8')
print(items)
