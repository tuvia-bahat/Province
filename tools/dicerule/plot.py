"""Plots the dice-rule experiment: python tools/dicerule/plot.py   (reads results/board6.json, board8.json from sim.js)
One PNG per board: every game is a dot (turns until the game was decided), blue = current rules, orange = auto re-roll when there is no legal move."""
import json, random, statistics
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
FD = 'C:/Windows/Fonts/'
def font(sz, bold=False): return ImageFont.truetype(FD + ('segoeuib.ttf' if bold else 'segoeui.ttf'), sz)
BLUE, ORANGE, INK, MUTED, GRID = (47, 128, 237), (242, 140, 40), (27, 30, 36), (106, 112, 124), (228, 231, 236)
LAB = {'old': 'Current rules', 'reroll': 'Auto re-roll if no legal move'}
COL = {'old': BLUE, 'reroll': ORANGE}


def stats(allrows):
    rows = [r for r in allrows if r['finished']]; fin = rows           # averages are over decided games only
    t = [r['turns'] for r in rows]; a = [r['acts'] for r in rows]
    q = statistics.quantiles(t, n=4) if len(t) > 3 else [0, 0, 0]
    return dict(n=len(allrows), finished=len(fin), turns_mean=statistics.mean(t), turns_med=statistics.median(t), q1=q[0], q3=q[2], acts_mean=statistics.mean(a),
                skips_mean=statistics.mean(r['skips'] for r in rows), rerolls_mean=statistics.mean(r['rerolls'] for r in rows), tmax=max(t), tmin=min(t))


def plot(board):
    rows = json.load(open(HERE / 'results' / f'board{board}.json'))
    W, H = 1500, 900; ml, mr, mt, mb = 120, 60, 150, 110
    im = Image.new('RGB', (W, H), (255, 255, 255)); d = ImageDraw.Draw(im)
    ymax = max(r['turns'] for r in rows if r['finished']); step = 10 if ymax <= 150 else 20 if ymax <= 300 else 50
    top = (ymax // step + 1) * step
    band = top + step * 1.5                                              # undecided games are drawn in a band above the axis
    Y = lambda v: H - mb - (H - mb - mt) * v / band
    d.text((ml, 40), f'{board}×{board} board: how long a game takes', font=font(40, True), fill=INK)
    d.text((ml, 92), 'Each dot is one game (computer vs computer). Turns until the game was decided; a re-roll of the dice does not count as a turn.', font=font(22), fill=MUTED)
    d.line([ml, Y(top + step * .5), W - mr, Y(top + step * .5)], fill=(200, 204, 212), width=2)
    d.text((ml + 6, Y(top + step * .5) + 6), 'above the line: no winner after the turn limit', font=font(20), fill=MUTED, anchor='la')
    for v in range(0, top + 1, step):
        d.line([ml, Y(v), W - mr, Y(v)], fill=GRID, width=2); d.text((ml - 14, Y(v)), str(v), font=font(22), fill=MUTED, anchor='rm')
    d.text((34, (mt + H - mb) / 2), 'turns', font=font(24), fill=MUTED, anchor='mm')
    random.seed(7); cw = (W - ml - mr) / 2; res = {}
    for i, rule in enumerate(('old', 'reroll')):
        rs = [r for r in rows if r['rule'] == rule]; st = stats(rs); res[rule] = st; cx = ml + cw * (i + .5)
        for r in rs:
            x = cx + random.uniform(-cw * .36, cw * .36); y = Y(r['turns'] if r['finished'] else top + step); R = 9
            c = COL[rule]
            if r['finished']: d.ellipse([x - R, y - R, x + R, y + R], fill=c, outline=(255, 255, 255), width=2)
            else: d.ellipse([x - R, y - R, x + R, y + R], outline=c, width=4)         # hollow = not decided within the turn limit
        d.line([cx - cw * .42, Y(st['turns_med']), cx + cw * .42, Y(st['turns_med'])], fill=INK, width=5)
        d.text((cx, H - mb + 30), LAB[rule], font=font(26, True), fill=COL[rule], anchor='mm')
        d.text((cx, H - mb + 62), f"average {st['turns_mean']:.0f} · median {st['turns_med']:.0f} turns · {st['finished']}/{st['n']} decided", font=font(22), fill=MUTED, anchor='mm')
    d.text((W - mr, 40), 'black line = median of decided games', font=font(20), fill=MUTED, anchor='ra')
    im.save(HERE / f'dice_rule_{board}x{board}.png')
    return res


if __name__ == '__main__':
    out = {}
    for b in (6, 8):
        if (HERE / 'results' / f'board{b}.json').exists(): out[b] = plot(b)
    json.dump(out, open(HERE / 'results' / 'summary.json', 'w'), indent=1)
    for b, r in out.items():
        for k, v in r.items(): print(b, k, {a: round(x, 1) for a, x in v.items()})
