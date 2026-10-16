/* Province – טוטוריאל: משחק מתוסרט שלם על לוח 6×6 שהשחקן (אדום) מנצח בו, עם עלילה: כחול תוקף, ומתקרב לניצחון בעצמו.
 * כל תור הוא צעד: who=0 האדם (עם הסברים והדגשות), who=1 המחשב (מתוסרט, בלי הסברים).
 * dice=[X,Y] מגדיר את המשבצות שהוטלו (המשבצת הנגדית מחושבת אוטומטית); act הוא הפעולה בפורמט Rules.apply
 * (קואורדינטות [x,y], y=0 בצד האדום). act.type='skip' = אין מהלך חוקי והשחקן לוחץ Pass.
 * הקובץ מכיל גם בדיקה שהתסריט חוקי ושהשחקן מנצח בסופו.
 *
 * העלילה: 1) בונים בסיס  2) כחול נוחת לידך ותוקף (כואב)  3) מתפזרים ותוקפים ראשונים  4) כחול מכה חזרה
 *         5) מתרחבים בטריטוריה  6) כחול בונה שרשרת ומגיע ל-4 מתוך 5  7) מקדימים אותו ב-5 הפרובינציות שלך.
 * סדר הלימוד: הנחתה, בחירה, דילוג, תגבור, הזזה, התקפה, טריטוריה ומנדט, גשר בלבד, הובלה, נסיגה, חוק ההנחתה, החלפת גשר, ניצחון.
 */
(function (root) {
  'use strict';

  // כרטיס פתיחה יחיד
  const pages = [
    { title: 'Learn Province', body: 'You are <b>Green</b>. Win by controlling <b>5 connected provinces</b>, before Blue does. Roll, and learn as you go.' },
  ];

  const L = (x, y) => [x, y];   // קיצור לקריאות
  const steps = [
    // ───────── 1. בונים בסיס ─────────
    { who: 0, kind: 'land', dice: [2, 2], act: { type: 'land', R: L(1, 1), to: L(1, 1), count: 8 },
      title: 'Land soldiers', intro: 'The dice are <b>coordinates</b>: column, then row. Each player counts from their own side, so one roll lights <b>two opposite squares</b>. Tap <b>Roll dice</b>.', instr: 'Tap your glowing square and land <b>8</b>.' },
    { who: 1, dice: [5, 5], act: { type: 'land', R: L(4, 4), to: L(4, 4), count: 4 } },

    { who: 0, kind: 'land', dice: [3, 2], act: { type: 'land', R: L(2, 1), to: L(2, 1), count: 4 },
      title: 'Choose a square', intro: 'Every roll lights two squares. You pick one.', instr: 'Both are empty, so both work. Land <b>4</b> on the glowing one to control a second province.' },
    { who: 1, dice: [4, 4], act: { type: 'land', R: L(3, 3), to: L(3, 3), count: 3 } },

    { who: 0, kind: 'skip', dice: [3, 4], act: { type: 'skip' },
      title: 'No move?', intro: 'Sometimes a roll gives you nothing to play. Tap <b>Roll dice</b> to see.', instr: 'Bad luck: both squares lie in enemy territory, far from your bases, so nothing can be played. Tap <b>Pass</b>. (You may also pass any time.)' },

    // ───────── 2. כחול נוחת לידך ותוקף ─────────
    { who: 1, dice: [3, 3], act: { type: 'land', R: L(2, 2), to: L(2, 2), count: 4 } },
    { who: 0, kind: 'reinforce', dice: [3, 2], act: { type: 'land', R: L(2, 1), to: L(2, 1), count: 8 },
      title: 'Reinforce', intro: 'Blue just landed beside your base! Landing on your own base adds soldiers to it.', instr: 'Tap your base and add <b>8</b>.' },
    { who: 1, dice: [3, 2], act: { type: 'move', R: L(2, 1), from: L(2, 2), to: L(2, 1), count: 4 } },

    // ───────── 3. מתפזרים ותוקפים ראשונים ─────────
    { who: 0, kind: 'move', dice: [4, 2], act: { type: 'move', R: L(3, 1), from: L(2, 1), to: L(3, 1), count: 6 },
      title: 'Spread out', intro: 'Ouch! Blue struck across the river. A bridge can only be used by its owner.', instr: 'Drag from the glowing base one square to the <b>right</b> and move <b>6</b> soldiers.' },
    { who: 1, dice: [4, 3], act: { type: 'land', R: L(3, 2), to: L(3, 2), count: 2 } },

    { who: 0, kind: 'attack', dice: [4, 3], act: { type: 'move', R: L(3, 2), from: L(3, 1), to: L(3, 2), count: 5 },
      title: 'Attack', intro: 'Blue landed beside your new base. Strike first: each attacker kills a defender for good, and attackers return to camp.', instr: 'Drag from the glowing base <b>up</b> onto the enemy base: send <b>5</b> soldiers. (Crossing a river builds a bridge for you.)' },
    { who: 1, dice: [4, 3], act: { type: 'move', R: L(3, 2), from: L(3, 3), to: L(3, 2), count: 3 } },

    // ───────── 4. טריטוריה ומנדט ─────────
    { who: 0, kind: 'move', dice: [1, 1], act: { type: 'move', R: L(0, 0), from: L(1, 1), to: L(1, 2), count: 3 },
      title: 'Territory', intro: 'Blue hit back and wiped out your base, and its own. Your linked bases plus the provinces you control are your <b>territory</b> (tinted).', instr: 'A square in your territory lets you act from <i>any</i> base. Drag from the glowing base <b>up</b> across the river and move <b>3</b> to claim a new province.' },
    { who: 1, dice: [4, 5], act: { type: 'land', R: L(3, 4), to: L(3, 4), count: 3 } },

    { who: 0, kind: 'bridge', dice: [3, 2], act: { type: 'bridge', R: L(2, 1), from: L(1, 1), to: L(2, 1), count: 0 },
      title: 'Bridge only', intro: 'Two of your provinces are split by a river. A <b>bridge</b> links them.', instr: 'Drag from the glowing base to the base on its <b>right</b> and set <b>0</b>: a bridge, no soldiers.' },
    { who: 1, dice: [4, 3], act: { type: 'land', R: L(3, 2), to: L(3, 2), count: 3 } },

    // ───────── 5. הובלה והתקפה מעל הגשר שלך ─────────
    { who: 0, kind: 'transport', dice: [1, 1], act: { type: 'transport', R: L(0, 0), from: L(1, 1), to: L(3, 1), count: 4 },
      title: 'Transport', intro: 'Blue landed beside your front base, but it can\'t cross your bridge. Transport soldiers along a straight line through your territory.', instr: 'Drag from the glowing base to the <b>right</b>, over the bridge, to the far square and send <b>4</b> to the front.' },
    { who: 1, dice: [5, 4], act: { type: 'land', R: L(4, 3), to: L(4, 3), count: 2 } },

    { who: 0, kind: 'attack', dice: [4, 3], act: { type: 'move', R: L(3, 2), from: L(3, 1), to: L(3, 2), count: 4 },
      title: 'Your bridge', intro: 'Your bridge is a one-way door: you can attack across it, Blue can\'t.', instr: 'Drag from the glowing base <b>up</b> onto the enemy base and send <b>4</b> against 3.' },
    { who: 1, dice: [2, 5], act: { type: 'land', R: L(1, 4), to: L(1, 4), count: 3 } },

    // ───────── 6. נסיגה, חוק ההנחתה, החלפת גשר ─────────
    { who: 0, kind: 'withdraw', dice: [1, 1], act: { type: 'withdraw', R: L(0, 0), from: L(1, 2), count: 2 },
      title: 'Withdraw', intro: 'Extra soldiers resting in a rear base are wasted. Pull some back to camp to reuse them.', instr: 'Tap the glowing base and withdraw <b>2</b>. The lit square is in your territory, so any base works.' },
    { who: 1, dice: [2, 5], act: { type: 'move', R: L(1, 4), from: L(1, 4), to: L(2, 4), count: 2 } },

    { who: 0, kind: 'land', dice: [3, 3], act: { type: 'land', R: L(2, 2), to: L(2, 2), count: 2 },
      title: 'Landing rule', intro: 'You may move from any base, but new soldiers land <i>only</i> on the lit square.', instr: 'The lit square is empty and in your territory. Land <b>2</b> on it.' },
    { who: 1, dice: [5, 4], act: { type: 'land', R: L(4, 3), to: L(4, 3), count: 3 } },

    { who: 0, kind: 'bridge', dice: [3, 2], act: { type: 'bridge', R: L(2, 1), from: L(2, 1), to: L(2, 2), count: 0 },
      title: 'Replace a bridge', intro: 'You now stand on both ends of the bridge Blue used to strike you. Replace it with your own!', instr: 'Drag from the glowing base <b>up</b> to the other base and set <b>0</b>. The bridge turns green.' },
    { who: 1, dice: [5, 4], act: { type: 'bridge', R: L(4, 3), from: L(4, 4), to: L(4, 3), count: 0 } },

    // ───────── 7. הניצחון ─────────
    { who: 0, kind: 'move', dice: [5, 2], act: { type: 'move', R: L(4, 1), from: L(3, 1), to: L(4, 1), count: 1 },
      title: 'The final move', intro: 'Blue is at <b>4 of 5</b>! You need one more province, now.', instr: 'Drag from the glowing base to the <b>right</b>, across the river, and move <b>1</b> soldier. Five connected provinces win!' },
  ];

  const recap = [
    'Claim provinces early and link them with bridges.',
    'Attackers return to camp, defenders die for good: strike first.',
    'In your territory you can act from any base, but new soldiers land only on the lit square.',
  ];

  const T = { pages, steps, recap };

  // בדיקת התסריט מול מנוע החוקים: כל פעולה חוקית, המשבצות שהוטלו תואמות, והאדם מנצח בצעד האחרון בלבד.
  // verbose: מחזיר גם תקציר לוח אחרי כל צעד (לניפוי).
  T.verify = function (Rules, verbose) {
    const R = Rules.forSize(6);
    R.OPTIONS.provinceTerritory = true; R.OPTIONS.winConnected = true;
    const ix = (c) => R.idx(c[0], c[1]);
    const toAct = (a) => {
      const o = { type: a.type, count: a.count };
      if (a.R) o.R = ix(a.R);
      if (a.from) o.from = ix(a.from);
      if (a.to) o.to = ix(a.to);
      return o;
    };
    const brief = (s) => {
      const b = [];
      s.cells.forEach((c, i) => { if (c.o !== null) b.push(`${'RB'[c.o]}(${R.xy(i)})=${c.n}`); });
      return b.join(' ') + ' | bridges ' + Object.entries(s.bridges).map(([k, v]) => 'RB'[v] + k).join(',') + ' | camp ' + [R.camp(s, 0), R.camp(s, 1)] + ' | grave ' + s.graveyard;
    };
    let s = R.newGame();
    const log = [];
    for (let i = 0; i < T.steps.length; i++) {
      const st = T.steps[i];
      if (s.turn !== st.who) return { ok: false, error: `step ${i + 1}: expected turn ${st.who}, got ${s.turn}`, log };
      s = R.roll(s, st.dice[0], st.dice[1]);
      if (st.act.type === 'skip') {
        if (R.hasAnyMove(s)) return { ok: false, error: `step ${i + 1}: skip expected but a move exists`, log };
        s = R.skipTurn(s);
      } else {
        const a = toAct(st.act);
        if (!s.roll.cells.includes(a.R)) return { ok: false, error: `step ${i + 1}: R not among rolled cells ${s.roll.cells}`, log };
        try { s = R.apply(s, a); } catch (e) { return { ok: false, error: `step ${i + 1} (${st.act.type}): ${e.message}`, log }; }
      }
      log.push(`${i + 1} ${st.who ? 'B' : 'R'} ${st.act.type} -> prov ${R.provincesHeld(s, 0)}/${R.provincesHeld(s, 1)} win ${R.winProgress(s, 0)}/${R.winProgress(s, 1)} winner ${s.winner}` + (verbose ? ' :: ' + brief(s) : ''));
      if (s.winner !== null && i !== T.steps.length - 1) return { ok: false, error: `early winner at step ${i + 1}`, log };
    }
    return { ok: s.winner === 0, error: s.winner === 0 ? null : 'Green does not win at the end', log, final: s };
  };

  root.TUTORIAL = T;
  if (typeof module !== 'undefined' && module.exports) module.exports = T;
})(typeof window !== 'undefined' ? window : globalThis);
