"""Stamps the build id of the site: a hash of every file the browser downloads (index.html, style.css, sw.js, manifest, src/, icons/).
Writes version.json ({"v": id}, what the running page compares against) and src/version.js (window.BUILD = id, what the page was loaded with).
The id changes only when a served file changes, so commits that touch only tools/tests/docs do not trigger an update in users' browsers.
Run by the git pre-commit hook (tools/pre-commit.sh); can also be run by hand:  python tools/stamp.py"""
import hashlib, json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKIP = {'version.json', 'src/version.js'}
VPARAM = re.compile(rb'\?v=[0-9a-f]{12}')   # index.html carries the build id in its asset URLs; it must not change the hash


def site_files():
    out = [p for p in [ROOT / 'index.html', ROOT / 'style.css', ROOT / 'sw.js', ROOT / 'manifest.webmanifest', ROOT / 'admin.html'] if p.exists()]
    for sub in ('src', 'icons'):
        out += [p for p in sorted((ROOT / sub).rglob('*')) if p.is_file()]
    return [p for p in out if p.relative_to(ROOT).as_posix() not in SKIP]


def main():
    h = hashlib.sha1()
    for p in sorted(site_files(), key=lambda p: p.relative_to(ROOT).as_posix()):
        h.update(p.relative_to(ROOT).as_posix().encode()); h.update(b'\0'); h.update(VPARAM.sub(b'', p.read_bytes().replace(b'\r\n', b'\n'))); h.update(b'\0')
    v = h.hexdigest()[:12]
    (ROOT / 'version.json').write_text(json.dumps({'v': v}) + '\n', encoding='utf-8', newline='\n')
    (ROOT / 'src' / 'version.js').write_text(f"window.BUILD = '{v}';\n", encoding='utf-8', newline='\n')
    # every stylesheet/script URL in index.html gets ?v=<id>: a browser can never combine files of two different versions
    idx = ROOT / 'index.html'; t = idx.read_text(encoding='utf-8')
    t2 = re.sub(r'((?:href|src)="(?:style\.css|src/[A-Za-z0-9_.]+\.js))(?:\?v=[0-9a-f]{12})?"', lambda m: m.group(1) + '?v=' + v + '"', t)
    if t2 != t: idx.write_text(t2, encoding='utf-8', newline='')
    print('build', v)


if __name__ == '__main__':
    main()
