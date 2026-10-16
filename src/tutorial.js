/* Province – טוטוריאל: משחק מתוסרט שלם על לוח 6×6 שהשחקן (אדום) מנצח בו.
 * כל תור הוא צעד: who=0 האדם (עם הסברים והדגשות), who=1 המחשב (מתוסרט, בלי הסברים).
 * dice=[X,Y] מגדיר את המשבצות שהוטלו (המשבצת הנגדית מחושבת אוטומטית); act הוא הפעולה בפורמט Rules.apply
 * (קואורדינטות [x,y], y=0 בצד האדום). act.type='skip' = אין מהלך חוקי והשחקן לוחץ Pass.
 * הקובץ מכיל גם בדיקה שהתסריט חוקי ושהשחקן מנצח בסופו.
 *
 * סדר הלימוד: 1) הנחתה  2) הזזה לעיגול צמוד  3) נהרות וגשרים  4) התקפה  5) טריטוריה ומנדט  6) הובלה ונסיגה
 *             7) החלפת גשר יריב  8) ניצחון. כל צעד מוסיף רעיון אחד.
 */
(function (root) {
  'use strict';

  // כרטיס פתיחה יחיד
  const pages = [
    { title: 'Learn Province', body: 'You are <b>Red</b>. Win by controlling <b>5 connected provinces</b>. Roll the dice, play the glowing circles, and learn as you go.' },
  ];

  const L = (x, y) => [x, y];   // קיצור לקריאות
  const steps = [
    // ───────── 1. הנחתה ─────────
    { who: 0, kind: 'land', dice: [2, 2], act: { type: 'land', R: L(1, 1), to: L(1, 1), count: 5 },
      title: 'Land soldiers',
      intro: 'Tap <b>Roll dice</b>. The dice light two circles on opposite sides of the board.',
      instr: 'Tap the glowing circle and land <b>5</b> soldiers from your camp. Alone in a province, you control it.' },
    { who: 1, dice: [5, 5], act: { type: 'land', R: L(4, 4), to: L(4, 4), count: 4 } },

    { who: 0, kind: 'land', dice: [3, 2], act: { type: 'land', R: L(2, 1), to: L(2, 1), count: 3 },
      title: 'Choose a circle',
      intro: 'Each turn you pick one of the two lit circles.',
      instr: 'Both are empty, so both work. Land <b>3</b> on the glowing one to claim a second province.' },
    { who: 1, dice: [4, 4], act: { type: 'land', R: L(3, 3), to: L(3, 3), count: 3 } },

    { who: 0, kind: 'skip', dice: [3, 4], act: { type: 'skip' },
      title: 'No move',
      intro: 'Roll again.',
      instr: 'Neither circle is playable: both lie in enemy territory, away from your bases. Tap <b>Pass</b>. (You can pass any time.)' },
    { who: 1, dice: [4, 5], act: { type: 'land', R: L(3, 4), to: L(3, 4), count: 3 } },

    { who: 0, kind: 'reinforce', dice: [3, 2], act: { type: 'land', R: L(2, 1), to: L(2, 1), count: 6 },
      title: 'Reinforce',
      intro: 'Landing on your own base adds soldiers to it.',
      instr: 'One lit circle is an enemy base, out of reach. Tap your base and add <b>6</b>.' },
    { who: 1, dice: [2, 5], act: { type: 'land', R: L(1, 4), to: L(1, 4), count: 2 } },

    // ───────── 2. הזזה ─────────
    { who: 0, kind: 'move', dice: [4, 2], act: { type: 'move', R: L(3, 1), from: L(2, 1), to: L(3, 1), count: 5 },
      title: 'Move soldiers',
      intro: 'Soldiers can step onto a lit circle next to one of your bases.',
      instr: 'Drag from <b>1</b> to <b>2</b> and move <b>5</b>. The circle becomes a new base.' },
    { who: 1, dice: [3, 6], act: { type: 'land', R: L(2, 5), to: L(2, 5), count: 2 } },

    // ───────── 3. נהרות וגשרים ─────────
    { who: 0, kind: 'bridge', dice: [3, 2], act: { type: 'bridge', R: L(2, 1), from: L(1, 1), to: L(2, 1), count: 0 },
      title: 'Rivers and bridges',
      intro: 'Soldiers can\'t cross a river without a <b>bridge</b>. You own 8, and only you can use yours.',
      instr: 'Drag from <b>1</b> to <b>2</b> and set <b>0</b>: a bridge, no soldiers. (Moving across a river builds one for you.)' },
    { who: 1, dice: [6, 5], act: { type: 'land', R: L(5, 4), to: L(5, 4), count: 2 } },

    // ───────── 4. התקפה ─────────
    { who: 0, kind: 'move', dice: [4, 3], act: { type: 'move', R: L(3, 2), from: L(3, 1), to: L(3, 2), count: 5 },
      title: 'Invade',
      intro: 'You can\'t <i>land</i> in a province the enemy controls, but you can march in from a base beside it.',
      instr: 'Drag from <b>1</b> across the river to <b>2</b> and move <b>5</b>. The bridge is built for you.' },
    { who: 1, dice: [1, 6], act: { type: 'land', R: L(0, 5), to: L(0, 5), count: 2 } },

    { who: 0, kind: 'attack', dice: [4, 4], act: { type: 'move', R: L(3, 3), from: L(3, 2), to: L(3, 3), count: 4 },
      title: 'Attack',
      intro: 'The province is now shared, so nobody controls it. Attack: each attacker kills a defender for good.',
      instr: 'Drag <b>1</b> onto the enemy base <b>2</b> and send <b>4</b> against 3. Attackers who killed return to camp; the extra one takes the cell.' },
    { who: 1, dice: [5, 3], act: { type: 'land', R: L(4, 2), to: L(4, 2), count: 3 } },

    // ───────── 5. טריטוריה ומנדט ─────────
    { who: 0, kind: 'move', dice: [1, 1], act: { type: 'move', R: L(0, 0), from: L(2, 1), to: L(2, 2), count: 3 },
      title: 'Territory',
      intro: 'Linked bases plus the provinces you control are your <b>territory</b> (tinted).',
      instr: 'A lit circle in your territory lets you act from <i>any</i> of your bases, not just the lit one. Drag from <b>1</b> to <b>2</b> and move <b>3</b>.' },
    { who: 1, dice: [4, 3], act: { type: 'move', R: L(3, 2), from: L(4, 2), to: L(3, 2), count: 3 } },

    { who: 0, kind: 'attack', dice: [4, 3], act: { type: 'move', R: L(3, 2), from: L(2, 2), to: L(3, 2), count: 2 },
      title: 'Counter-attack',
      intro: 'Blue hit back: your soldier died for good. Only <b>defenders</b> pay. Strike first!',
      instr: 'Drag <b>1</b> onto <b>2</b> and send <b>2</b> against 2. Equal numbers wipe out the defenders and leave the cell empty.' },
    { who: 1, dice: [4, 6], act: { type: 'land', R: L(3, 5), to: L(3, 5), count: 2 } },

    { who: 0, kind: 'land', dice: [4, 3], act: { type: 'land', R: L(3, 2), to: L(3, 2), count: 2 },
      title: 'Landing rule',
      intro: 'You may move from any base, but new soldiers land <i>only</i> on the lit circle.',
      instr: 'The lit circle is empty and in your territory. Land <b>2</b> on it.' },
    { who: 1, dice: [6, 6], act: { type: 'land', R: L(5, 5), to: L(5, 5), count: 2 } },

    // ───────── 6. החלפת גשר יריב ─────────
    { who: 0, kind: 'land', dice: [5, 3], act: { type: 'land', R: L(4, 2), to: L(4, 2), count: 2 },
      title: 'Both sides',
      intro: 'Blue\'s bridge still links the two circles it attacked across.',
      instr: 'Land <b>2</b> on the far side. Now you stand on both ends of that bridge.' },
    { who: 1, dice: [1, 5], act: { type: 'land', R: L(0, 4), to: L(0, 4), count: 2 } },

    { who: 0, kind: 'bridge', dice: [4, 3], act: { type: 'bridge', R: L(3, 2), from: L(3, 2), to: L(4, 2), count: 0 },
      title: 'Replace a bridge',
      intro: 'With your soldiers on both ends, you can replace an enemy bridge with your own.',
      instr: 'Drag from <b>1</b> to <b>2</b> and set <b>0</b>. The bridge turns red.' },
    { who: 1, dice: [2, 6], act: { type: 'land', R: L(1, 5), to: L(1, 5), count: 2 } },

    // ───────── 7. הובלה ונסיגה ─────────
    { who: 0, kind: 'transport', dice: [1, 1], act: { type: 'transport', R: L(0, 0), from: L(1, 1), to: L(3, 1), count: 3 },
      title: 'Transport',
      intro: 'Transport slides soldiers any distance in a straight line through your territory, over bridges.',
      instr: 'Drag from <b>1</b> to <b>2</b> and send <b>3</b>. They all arrive at one place.' },
    { who: 1, dice: [3, 6], act: { type: 'land', R: L(2, 5), to: L(2, 5), count: 2 } },

    { who: 0, kind: 'withdraw', dice: [1, 1], act: { type: 'withdraw', R: L(0, 0), from: L(3, 3), count: 1 },
      title: 'Retreat',
      intro: 'A lone base beside an enemy base is a free kill. Pull its soldiers back to camp.',
      instr: 'Tap the glowing base and withdraw <b>1</b>. A lit circle in your territory works for any base.' },
    { who: 1, dice: [2, 5], act: { type: 'land', R: L(1, 4), to: L(1, 4), count: 2 } },

    // ───────── 8. הניצחון ─────────
    { who: 0, kind: 'move', dice: [2, 3], act: { type: 'move', R: L(1, 2), from: L(1, 1), to: L(1, 2), count: 1 },
      title: 'Final move',
      intro: 'Four provinces are linked; a fifth completes the chain.',
      instr: 'Drag from <b>1</b> to <b>2</b> and move <b>1</b> soldier. Five connected provinces win.' },
  ];

  const recap = [
    'Claim provinces early and link them with bridges.',
    'Attackers go home, only defenders die: strike first.',
    'Outnumber before you invade; retreat exposed lone bases.',
    'Land only on lit circles; act from any base in your territory.',
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
    return { ok: s.winner === 0, error: s.winner === 0 ? null : 'Red does not win at the end', log, final: s };
  };

  root.TUTORIAL = T;
  if (typeof module !== 'undefined' && module.exports) module.exports = T;
})(typeof window !== 'undefined' ? window : globalThis);
