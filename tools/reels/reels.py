"""The reel definitions. python tools/reels/reels.py [--preview] [name ...]   (scenes come from gen_scenes.js)"""
import json, sys
sys.path.insert(0, str(__import__('pathlib').Path(__file__).parent))
from make_reels import *

SCENES = Path(__file__).resolve().parent / 'scenes'
REELS = {
    'lone': dict(top='Me: finally 4 connected provinces. One more and I win.', bottom='Blue: sends ONE soldier.', key=None, zoom=1.8),
    'wipe': dict(top='Attacking in Province:', bottom='Attackers go home safe. Defenders do not.', key=None, zoom=1.7),
    'nomove': dict(top='Me: 3 provinces connected. Perfect plan.', bottom="The dice: lights up two squares in Blue's territory.", key=None, zoom=1.0),
    'luck': dict(top='Beginner: "It\'s just luck. You can\'t plan anything."', bottom='Me: lands 24 soldiers next to your base.', key=1, zoom=1.6),
}
if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')] or list(REELS)
    preview = '--preview' in sys.argv
    for n in args:
        r = REELS[n]; sc = json.load(open(SCENES / f'{n}.json'))
        render_clip(n, sc, 0, len(sc['events']) - 1, r['key'] if r['key'] is not None else sc['keyIdx'], r['top'], r['bottom'], zoom=r['zoom'], preview=preview)
