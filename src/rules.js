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

  // תצורות לוח: 6×6 (9 פרובינציות) ו-8×8 (16 פרובינציות, בלי שינוי בכללים)
  const CONFIGS = { 6: { SOLDIERS: 36, BRIDGES: 8, WIN: 5 }, 8: { SOLDIERS: 64, BRIDGES: 16, WIN: 9 } };
  const NAMES = ['אדום', 'כחול'];
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  // אפשרויות חוקים (לניסויים בלבד; ברירת המחדל = החוקים המקוריים ב-RULES.md)
  //   reinforceAnywhere – תגבור בכל בסיס בטריטוריה (גרסה 1, ברירת מחדל; משחק מול המחשב)
  //   provinceTerritory – גרסה 2: פרובינציה בשליטתך (כולל משבצות ריקות) היא חלק מהטריטוריה שלך; ניצחון = 5 פרובינציות מחוברות
  //   winConnected – בגרסה 2: האם הניצחון דורש 5 פרובינציות מחוברות בטריטוריה אחת (כבוי = מספיק לשלוט ב-5)
  const OPTIONS = { reinforceAnywhere: true, provinceTerritory: false, winConnected: true };

  function build(SIZE) {
  const CELLS = SIZE * SIZE, SOLDIERS = CONFIGS[SIZE].SOLDIERS, BRIDGES = CONFIGS[SIZE].BRIDGES, WIN_PROVINCES = CONFIGS[SIZE].WIN;
  const PR = SIZE / 2, NPROV = PR * PR;   // פרובינציות בשורה, ובסך הכל
  const idx = (x, y) => y * SIZE + x;
  const xy = (i) => [i % SIZE, Math.floor(i / SIZE)];
  const provinceOf = (i) => { const [x, y] = xy(i); return Math.floor(y / 2) * PR + Math.floor(x / 2); };
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
      size: SIZE,
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
  // מטמונים לפי "חתימת בעלים" של הלוח (מי מחזיק כל משבצת; הכמויות לא משפיעות על שליטה וטריטוריה).
  // המבנים המוחזרים משותפים ולקריאה בלבד.
  const caches = { ctl: new Map(), nodes: new Map(), comp: new Map() };
  function memo(map, key, fn) {
    let v = map.get(key);
    if (v === undefined) { v = fn(); if (map.size > 30000) map.clear(); map.set(key, v); }
    return v;
  }
  function ownerSig(s) {
    let k = '';
    for (let i = 0; i < CELLS; i++) { const o = s.cells[i].o; k += o === null ? '.' : o; }
    return k;
  }
  function provinceControl(s) {
    return memo(caches.ctl, ownerSig(s), () => {
      const owners = Array.from({ length: NPROV }, () => new Set());
      s.cells.forEach((c, i) => { if (c.o !== null) owners[provinceOf(i)].add(c.o); });
      return owners.map((set) => (set.size === 1 ? [...set][0] : null));
    });
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

  // צמתי הטריטוריה של שחקן p: הבסיסים שלו, ובגרסה 2 גם כל משבצות הפרובינציות שבשליטתו (כולל ריקות)
  function territoryNodes(s, p) {
    return memo(caches.nodes, ownerSig(s) + p + (OPTIONS.provinceTerritory ? 'T' : 'B'), () => {
      const nodes = new Uint8Array(CELLS);
      for (let i = 0; i < CELLS; i++) if (s.cells[i].o === p) nodes[i] = 1;
      if (OPTIONS.provinceTerritory) {
        const ctl = provinceControl(s);
        for (let i = 0; i < CELLS; i++) if (ctl[provinceOf(i)] === p) nodes[i] = 1;
      }
      return nodes;
    });
  }

  // רכיבי הטריטוריה של שחקן p: id לכל צומת (או -1), ורשימות המשבצות בכל רכיב
  function components(s, p) {
    const own = Object.keys(s.bridges).filter((k) => s.bridges[k] === p).sort().join(',');
    return memo(caches.comp, ownerSig(s) + p + (OPTIONS.provinceTerritory ? 'T' : 'B') + '|' + own, () => {
      const nodes = territoryNodes(s, p), id = new Int8Array(CELLS).fill(-1), lists = [];
      for (let i = 0; i < CELLS; i++) {
        if (id[i] >= 0 || !nodes[i]) continue;
        const k = lists.length, list = [i]; id[i] = k;
        for (let h = 0; h < list.length; h++) {
          const cur = list[h];
          for (const n of neighbors(cur)) {
            if (id[n] >= 0 || !nodes[n]) continue;
            if (crossesRiver(cur, n) && s.bridges[bridgeKey(cur, n)] !== p) continue;
            id[n] = k; list.push(n);
          }
        }
        lists.push(list);
      }
      return { id, lists };
    });
  }

  // טריטוריה: רכיב מחובר של צמתים צמודים (מעבר לנהר – רק דרך גשר שלי). מחזיר את כל המשבצות בטריטוריה, כולל ריקות בגרסה 2.
  function territory(s, start, p) {
    if (p === undefined) p = s.cells[start].o !== null ? s.cells[start].o : s.turn;
    const comp = components(s, p), k = comp.id[start];
    return k >= 0 ? comp.lists[k].slice() : [start];
  }

  // התקדמות לקראת ניצחון: גרסה 1 – מספר פרובינציות בשליטה; גרסה 2 – הכי הרבה פרובינציות בשליטה שמחוברות בטריטוריה אחת
  function winProgress(s, p) {
    if (!OPTIONS.provinceTerritory || !OPTIONS.winConnected) return provincesHeld(s, p);
    const ctl = provinceControl(s), nodes = territoryNodes(s, p), done = new Set();
    let best = 0;
    for (let k = 0; k < NPROV; k++) {
      if (ctl[k] !== p || done.has(k)) continue;
      const comp = territory(s, firstCellOf(k), p, nodes);
      let n = 0;
      for (let j = 0; j < NPROV; j++) if (ctl[j] === p && comp.includes(firstCellOf(j))) { n++; done.add(j); }
      if (n > best) best = n;
    }
    return best;
  }
  const firstCellOf = (k) => idx((k % PR) * 2, Math.floor(k / PR) * 2);

  // יעדים אפשריים לפעולה מבסיס מקור
  function targets(s, type, R, from) {
    const p = s.turn, out = [];
    if (type === 'move') {
      // בסיס מהטריטוריה של המשבצת שהוטלה יכול לפעול לכל יעד; בסיס צמוד אליה שמחוץ לטריטוריה (למשל מעבר לנהר ללא גשר) – רק אל R
      const nodes = territoryNodes(s, p);
      const inTerritory = nodes[R] === 1 && territory(s, R, p, nodes).includes(from);
      const cand = inTerritory ? neighbors(from) : (neighbors(from).includes(R) ? [R] : []);
      for (const n of cand) {
        const cr = crossing(s, p, from, n);
        if (!cr) continue;
        const o = s.cells[n].o;
        out.push({ to: n, kind: o === null || o === p ? 'move' : 'attack', cross: cr.kind });
      }
    } else if (type === 'transport') {
      const nodes = territoryNodes(s, p);
      const [fx, fy] = xy(from);
      for (const [dx, dy] of DIRS) {
        let cx = fx, cy = fy;
        for (;;) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) break;
          const prev = idx(cx, cy), nxt = idx(nx, ny);
          if (!nodes[nxt]) break;   // רק דרך בסיסים שלי (ובגרסה 2 גם משבצות ריקות בפרובינציות שבשליטתי)
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
    const p = s.turn;
    if (type === 'land') return [];
    const nodes = territoryNodes(s, p);
    let base;
    if (nodes[R]) {   // המשבצת שהוטלה בטריטוריה שלי: מנדט לפעול מכל בסיס בטריטוריה
      base = territory(s, R, p, nodes).filter((i) => s.cells[i].o === p);
      if (type === 'move') for (const n of neighbors(R)) if (s.cells[n].o === p && !base.includes(n)) base.push(n);
    } else if (type === 'move') base = neighbors(R).filter((n) => s.cells[n].o === p);
    else return [];
    if (type === 'withdraw') return base;
    return base.filter((b) => targets(s, type, R, b).length > 0);
  }

  // משבצות שאפשר להנחית בהן חיילים בהינתן המשבצת שהוטלה: משבצת ריקה – רק היא; בסיס שלי – כל בסיס בטריטוריה שלו
  //   בגרסה 2: אי אפשר להנחית בטריטוריה של היריב (גם לא במשבצת ריקה בפרובינציה שבשליטתו), ורק במשבצת שהוטלה.
  function landTargets(s, R) {
    const p = s.turn, c = s.cells[R];
    if (territoryNodes(s, 1 - p)[R]) return [];
    if (c.o === null) return [R];
    if (c.o === p) return OPTIONS.reinforceAnywhere && !OPTIONS.provinceTerritory ? territory(s, R, p).filter((i) => s.cells[i].o === p) : [R];
    return [];
  }

  function actionTypes(s, R) {
    const p = s.turn, c = s.cells[R], out = [];
    if (camp(s, p) > 0 && landTargets(s, R).length > 0) out.push('land');
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

  function endTurn(s, fast) {
    const p = s.turn;
    if (winProgress(s, p) >= WIN_PROVINCES) {
      s.winner = p;
      if (!fast) s.log.push(`${NAMES[p]} שולט ב-${winProgress(s, p)} פרובינציות${OPTIONS.provinceTerritory && OPTIONS.winConnected ? ' מחוברות' : ''} וניצח!`);
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

  // שכפול מהיר למנוע החיפוש של המחשב (היומן משותף, ולכן אסור לכתוב אליו במצב מהיר)
  function fastClone(s) {
    return {
      size: s.size,
      cells: s.cells.map((c) => ({ o: c.o, n: c.n })),
      bridges: Object.assign({}, s.bridges),
      bridgesLeft: s.bridgesLeft.slice(),
      graveyard: s.graveyard.slice(),
      turn: s.turn, roll: s.roll, winner: s.winner, log: s.log,
    };
  }
  function passFast(s) { const ns = fastClone(s); endTurn(ns, true); return ns; }

  // ביצוע פעולה: { type, R, from, to, count }. זורק שגיאה אם הפעולה לא חוקית.
  // fast=true: ללא בדיקות חוקיות (לפעולות שנוצרו ע"י מחולל המהלכים של המחשב) וללא יומן.
  function apply(s, a, fast) {
    const p = s.turn, q = 1 - p;
    if (!fast) {
      if (s.winner !== null) throw new Error('המשחק הסתיים');
      if (!s.roll || !s.roll.cells.includes(a.R)) throw new Error('המשבצת לא הוטלה');
      if (!actionTypes(s, a.R).includes(a.type)) throw new Error('פעולה לא אפשרית: ' + a.type);
    }

    const ns = fast ? fastClone(s) : clone(s), cells = ns.cells;
    const count = a.count | 0;
    let msg;

    if (a.type === 'land') {
      const to = a.to === undefined || a.to === null ? a.R : a.to;
      if (!fast && !landTargets(s, a.R).includes(to)) throw new Error('אי אפשר להנחית חיילים במשבצת הזו');
      if (count < 1 || count > camp(s, p)) throw new Error('מספר חיילים לא חוקי');
      cells[to].o = p; cells[to].n += count;
      msg = `הנחית ${count} חיילים ב-${cellLabel(to, p)}`;
    } else {
      if (!fast && !sources(s, a.type, a.R).includes(a.from)) throw new Error('בסיס מקור לא חוקי');
      const src = cells[a.from];
      if (a.type === 'withdraw') {
        if (count < 1 || count > src.n) throw new Error('מספר חיילים לא חוקי');
        src.n -= count;
        msg = `משך ${count} חיילים מ-${cellLabel(a.from, p)} למחנה`;
      } else {
        const t = (fast && a.tgt) || targets(s, a.type, a.R, a.from).find((x) => x.to === a.to);
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

    if (!fast) ns.log.push(`${NAMES[p]}: ${msg}`);
    endTurn(ns, fast);
    return ns;
  }

  const Rules = {
    SIZE, CELLS, NPROV, PR, SOLDIERS, BRIDGES, WIN_PROVINCES, NAMES, OPTIONS,
    idx, xy, provinceOf, crossesRiver, bridgeKey, neighbors, cellLabel,
    newGame, camp, onBoard, provinceControl, provincesHeld,
    roll, crossing, territory, territoryNodes, components, winProgress, landTargets, targets, sources, actionTypes, hasAnyMove, maxCount,
    apply, skipTurn, passTurn, passFast, fastClone, clone,
  };
  return Rules;
  }

  const cache = {};
  const base = build(6); cache[6] = base;
  base.forSize = (n) => cache[n] || (cache[n] = build(n));
  if (typeof module !== 'undefined' && module.exports) module.exports = base;
  else root.Rules = base;
})(typeof window !== 'undefined' ? window : globalThis);
