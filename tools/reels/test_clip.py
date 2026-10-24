import sys; sys.path.insert(0, 'tools/reels')
from make_reels import *
c = best('lone', actor=1)
print(len(c), [(x[0], x[3]['at']) for x in c[:5]])
sc, _, g, h = c[0]
render_clip('test_lone', g, max(0, h['at'] - 5), h['at'] + 2, h['at'], 'Me: finally built a 4-province empire', 'Blue: one (1) soldier', preview=True)
