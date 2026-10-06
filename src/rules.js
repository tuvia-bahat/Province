/* Province – לוגיקת המשחק (ללא תלות בתצוגה).
 * עובד גם בדפדפן (window.Rules) וגם ב-Node (module.exports).
 * מקור האמת לחוקים: RULES.md
 *
 * מבנה המצב:
 *   cells[36]      { o: בעלים (0/1/null), n: מספר חיילים }, אינדקס = y*6 + x (y=0 בצד של שחקן 0)
 *   bridges        { "a-b": בעלים }  (a<b)
 *   bridgesLeft    [גשרים שנותרו לכל שחקן]
 *   graveyard      [חיילים שנהרגו לכל שחקן]
 *   turn           0/1
 *   roll           null | { w, b, cells:[שתי המשבצות] }
 *   winner         null | 0/1
 */
(function (root) {
  'use strict';

  const SIZE = 6, CELLS = 36, SOLDIERS = 36, BRIDGES = 6, WIN_PROVINCES = 5;
  const NAMES = ['אדום', 'כחול'];
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  const idx = (x, y) => y * SIZE + x;
  const xy = (i) => [i % SIZE, Math.floor(i / SIZE)];
  const provinceOf = (i) => { const [x, y] = xy(i); return Math.floor(y / 2) * 3 + Math.floor(x / 2); };
  const crossesRiver = (a, b) => provinceOf(a) !== provinceOf(b);
  const bridgeKey = (a, b) => (a < b ? a + '-' + b : b + '-' + a);
  const clone = (s) => JSON.parse(JSON.stringify(s));

  function neighbors(i) {
    const [x, y] = xy(i), out = [];
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < SIZE && ny >= 0 && ny < SIZE) out.push(idx(nx, ny));
    }
    return out;
  }

  // שם משבצת מנקודת המבט של שחקן (כמו הקואורדינטות שהוא רואה בקוביות)
  function cellLabel(i, p) {
    const [x, y] = xy(i);
    const t = p === 0 ? `(${x + 1},${y + 1})` : `(${SIZE - x},${SIZE - y})`;
    return '⁦' + t + '⁩';   // בידוד כיווניות, כדי שיוצג נכון בתוך טקסט עברי
  }

  function newGame() {
    return {
      cells: Array.from({ length: CELLS }, () => ({ o: null, n: 0 })),
      bridges: {},
      bridgesLeft: [BRIDGES, BRIDGES],
      graveyard: [0, 0],
      turn: 0,
      roll: null,
      winner: null,
      log: [],
    };
  }

  function onBoard(s, p) {
    let t = 0;
    for (const c of s.cells) if (c.o === p) t += c.n;
    return t;
  }
  const camp = (s, p) => SOLDIERS - onBoard(s, p) - s.graveyard[p];

  // מי שולט בכל אחת מ-9 הפרובינציות (null אם אף אחד)
  function provinceControl(s) {
    const owners = Array.from({ length: 9 }, () => new Set());
    s.cells.forEach((c, i) => { if (c.o !== null) owners[provinceOf(i)].add(c.o); });
    return owners.map((set) => (set.size === 1 ? [...set][0] : null));
  }
  const provincesHeld = (s, p) => provinceControl(s).filter((o) => o === p).length;

  // הטלת קוביות: לבנה = X, חומה = Y. המשבצת השנייה היא ההשתקפות (הצירים של היריב הפוכים)
  function roll(s, w, b) {
    const ns = clone(s);
    ns.roll = { w, b, cells: [idx(w - 1, b - 1), idx(SIZE - w, SIZE - b)] };
    return ns;
  }

  // האם אפשר לעבור מ-a ל-b עבור שחקן p, ואיזה גשר נדרש.
  function crossing(s, p, a, b) {
    if (!crossesRiver(a, b)) return { kind: 'none' };
    const br = s.bridges[bridgeKey(a, b)];
    if (br === p) return { kind: 'none' };
    if (br === undefined) return s.bridgesLeft[p] > 0 ? { kind: 'place' } : null;
    // גשר של היריב: אפשר להחליף רק אם משני הצדדים יש חיילים שלי
    if (s.cells[a].o === p && s.cells[b].o === p && s.bridgesLeft[p] > 0) return { kind: 'replace' };
    return null;
  }

  // טריטוריה: שרשרת בסיסים צמודים (מעבר לנהר – רק דרך גשר שלי)
  function territory(s, start) {
    const p = s.cells[start].o;
    const seen = new Set([start]), q = [start];
    while (q.length) {
      const cur = q.pop();
      for (const n of neighbors(cur)) {
        if (seen.has(n) || s.cells[n].o !== p) continue;
        if (crossesRiver(cur, n) && s.bridges[bridgeKey(cur, n)] !== p) continue;
        seen.add(n); q.push(n);
      }
    }
    return [...seen];
  }

  // יעדים אפשריים לפעולה מבסיס מקור
  function targets(s, type, R, from) {
    const p = s.turn, out = [];
    if (type === 'move') {
      // בסיס מהטריטוריה של המשבצת שהוטלה יכול לפעול לכל יעד; בסיס צמוד אליה שמחוץ לטריטוריה (למשל מעבר לנהר ללא גשר) – רק אל R
      const inTerritory = s.cells[R].o === p && territory(s, R).includes(from);
      const cand = inTerritory ? neighbors(from) : (neighbors(from).includes(R) ? [R] : []);
      for (const n of cand) {
        const cr = crossing(s, p, from, n);
        if (!cr) continue;
        const o = s.cells[n].o;
        out.push({ to: n, kind: o === null || o === p ? 'move' : 'attack', cross: cr.kind });
      }
    } else if (type === 'transport') {
      const [fx, fy] = xy(from);
      for (const [dx, dy] of DIRS) {
        let cx = fx, cy = fy;
        for (;;) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) break;
          const prev = idx(cx, cy), nxt = idx(nx, ny);
          if (s.cells[nxt].o !== p) break;
          if (crossesRiver(prev, nxt) && s.bridges[bridgeKey(prev, nxt)] !== p) break;
          out.push({ to: nxt, kind: 'transport', cross: 'none' });
          cx = nx; cy = ny;
        }
      }
    } else if (type === 'bridge') {
      for (const n of neighbors(from)) {
        if (!crossesRiver(from, n)) continue;
        const cr = crossing(s, p, from, n);
        if (cr && cr.kind !== 'none') out.push({ to: n, kind: 'bridge', cross: cr.kind });
      }
    }
    return out;
  }

  // בסיסים שמהם מותר לפעול, בהינתן המשבצת שנבחרה R
  function sources(s, type, R) {
    const p = s.turn, c = s.cells[R];
    if (type === 'land') return [];
    let base;
    if (c.o === p) {
      base = territory(s, R);
      if (type === 'move') for (const n of neighbors(R)) if (s.cells[n].o === p && !base.includes(n)) base.push(n);
    } else if (type === 'move') base = neighbors(R).filter((n) => s.cells[n].o === p);
    else return [];
    if (type === 'withdraw') return base;
    return base.filter((b) => targets(s, type, R, b).length > 0);
  }

  function actionTypes(s, R) {
    const p = s.turn, c = s.cells[R], out = [];
    if ((c.o === null || c.o === p) && camp(s, p) > 0) out.push('land');
    for (const t of ['move', 'transport', 'withdraw', 'bridge']) {
      if (sources(s, t, R).length) out.push(t);
    }
    return out;
  }

  const hasAnyMove = (s) => !!s.roll && s.roll.cells.some((R) => actionTypes(s, R).length > 0);

  function maxCount(s, type, from) {
    if (type === 'land') return camp(s, s.turn);
    if (type === 'bridge') return 0;
    return s.cells[from].n;
  }

  function endTurn(s) {
    const p = s.turn;
    if (provincesHeld(s, p) >= WIN_PROVINCES) {
      s.winner = p;
      s.log.push(`${NAMES[p]} שולט ב-${provincesHeld(s, p)} פרובינציות וניצח!`);
    } else {
      s.turn = 1 - p;
    }
    s.roll = null;
  }

  function skipTurn(s) {
    const ns = clone(s);
    ns.log.push(`${NAMES[ns.turn]}: אין מהלך אפשרי, התור עובר`);
    endTurn(ns);
    return ns;
  }

  // דילוג מרצון על התור (תמיד מותר, גם כשיש מהלכים חוקיים)
  function passTurn(s) {
    const ns = clone(s);
    ns.log.push(`${NAMES[ns.turn]}: דילג על התור`);
    endTurn(ns);
    return ns;
  }

  // ביצוע פעולה: { type, R, from, to, count }. זורק שגיאה אם הפעולה לא חוקית.
  function apply(s, a) {
    const p = s.turn, q = 1 - p;
    if (s.winner !== null) throw new Error('המשחק הסתיים');
    if (!s.roll || !s.roll.cells.includes(a.R)) throw new Error('המשבצת לא הוטלה');
    if (!actionTypes(s, a.R).includes(a.type)) throw new Error('פעולה לא אפשרית: ' + a.type);

    const ns = clone(s), cells = ns.cells;
    const count = a.count | 0;
    let msg;

    if (a.type === 'land') {
      if (count < 1 || count > camp(s, p)) throw new Error('מספר חיילים לא חוקי');
      cells[a.R].o = p; cells[a.R].n += count;
      msg = `הנחית ${count} חיילים ב-${cellLabel(a.R, p)}`;
    } else {
      if (!sources(s, a.type, a.R).includes(a.from)) throw new Error('בסיס מקור לא חוקי');
      const src = cells[a.from];
      if (a.type === 'withdraw') {
        if (count < 1 || count > src.n) throw new Error('מספר חיילים לא חוקי');
        src.n -= count;
        msg = `משך ${count} חיילים מ-${cellLabel(a.from, p)} למחנה`;
      } else {
        const t = targets(s, a.type, a.R, a.from).find((x) => x.to === a.to);
        if (!t) throw new Error('יעד לא חוקי');
        if (a.type !== 'bridge' && (count < 1 || count > src.n)) throw new Error('מספר חיילים לא חוקי');

        if (t.cross === 'place' || t.cross === 'replace') {
          ns.bridges[bridgeKey(a.from, a.to)] = p;
          ns.bridgesLeft[p] -= 1;
        }
        const bridgeNote = t.cross === 'place' ? ' + גשר חדש' : t.cross === 'replace' ? ' + החלפת גשר יריב' : '';
        const dst = cells[a.to];

        if (a.type === 'bridge') {
          msg = t.cross === 'replace'
            ? `החלפת גשר יריב בין ${cellLabel(a.from, p)} ל-${cellLabel(a.to, p)}`
            : `הנחת גשר בין ${cellLabel(a.from, p)} ל-${cellLabel(a.to, p)}`;
        } else if (t.kind === 'attack') {
          const def = dst.n, killed = Math.min(count, def);
          src.n -= count;
          ns.graveyard[q] += killed;
          if (count > def) { dst.o = p; dst.n = count - def; }
          else if (count === def) { dst.o = null; dst.n = 0; }
          else dst.n = def - count;
          msg = `תקף מ-${cellLabel(a.from, p)} ל-${cellLabel(a.to, p)} עם ${count} חיילים: ${killed} נהרגו`
            + (count > def ? `, ${count - def} כבשו את המשבצת` : count === def ? ', המשבצת התרוקנה' : '') + bridgeNote;
        } else {
          src.n -= count;
          dst.o = p; dst.n += count;
          msg = `${a.type === 'transport' ? 'שינע' : 'הזיז'} ${count} חיילים מ-${cellLabel(a.from, p)} ל-${cellLabel(a.to, p)}${bridgeNote}`;
        }
      }
      if (src.n === 0) src.o = null;
    }

    ns.log.push(`${NAMES[p]}: ${msg}`);
    endTurn(ns);
    return ns;
  }

  const Rules = {
    SIZE, CELLS, SOLDIERS, BRIDGES, WIN_PROVINCES, NAMES,
    idx, xy, provinceOf, crossesRiver, bridgeKey, neighbors, cellLabel,
    newGame, camp, onBoard, provinceControl, provincesHeld,
    roll, crossing, territory, targets, sources, actionTypes, hasAnyMove, maxCount,
    apply, skipTurn, passTurn, clone,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Rules;
  else root.Rules = Rules;
})(typeof window !== 'undefined' ? window : globalThis);
