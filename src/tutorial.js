/* Province – טוטוריאל: משחק מתוסרט שלם על לוח 6×6 שהשחקן (אדום) מנצח בו.
 * כל תור הוא צעד: who=0 האדם (עם הסברים והדגשות), who=1 המחשב (מתוסרט, בלי הסברים).
 * dice=[X,Y] מגדיר את המשבצות שהוטלו (המשבצת הנגדית מחושבת אוטומטית); act הוא הפעולה בפורמט Rules.apply
 * (קואורדינטות [x,y], y=0 בצד האדום). הקובץ מכיל גם בדיקה שהתסריט חוקי ושהשחקן מנצח בסופו.
 * הטקסטים קצרים בכוונה: כרטיס אחד לפני ההטלה (הרעיון) וכרטיס אחד אחריה (מה לעשות).
 */
(function (root) {
  'use strict';

  // כרטיס פתיחה יחיד
  const pages = [
    { title: 'Learn Province', body: 'You are <b>Red</b>. Win by controlling <b>5 connected provinces</b>. Roll the dice, play the glowing circles, and learn as you go.' },
  ];

  const steps = [
    { who: 0, kind: 'land', dice: [2, 2], act: { type: 'land', R: [1, 1], to: [1, 1], count: 5 },
      title: 'Land soldiers',
      intro: 'Tap <b>Roll dice</b>.',
      instr: 'Tap the glowing circle and land <b>5</b> soldiers. Alone in a province means you control it.' },
    { who: 1, dice: [4, 5], act: { type: 'land', R: [3, 4], to: [3, 4], count: 4 } },

    { who: 0, kind: 'land', dice: [3, 2], act: { type: 'land', R: [2, 1], to: [2, 1], count: 4 },
      title: 'Expand',
      intro: 'Claim provinces early.',
      instr: 'Land <b>4</b> here. The other lit circle is an enemy base you can\'t reach.' },
    { who: 1, dice: [5, 5], act: { type: 'land', R: [4, 4], to: [4, 4], count: 3 } },

    { who: 0, kind: 'bridge', dice: [2, 2], act: { type: 'bridge', R: [1, 1], from: [1, 1], to: [2, 1], count: 0 },
      title: 'Build a bridge',
      intro: 'Rivers block soldiers. A <b>bridge</b> links two circles across one. You own just 8.',
      instr: 'Drag ① to ② and set <b>0</b>: bridge only.' },
    { who: 1, dice: [4, 4], act: { type: 'land', R: [3, 3], to: [3, 3], count: 3 } },

    { who: 0, kind: 'transport', dice: [1, 1], act: { type: 'transport', R: [0, 0], from: [1, 1], to: [3, 1], count: 4 },
      title: 'Territory',
      intro: 'Linked bases plus the provinces you control form your <b>territory</b> (tinted).',
      instr: 'A lit circle in your territory lets you act from <i>any</i> base. <b>Transport</b> 4 in a straight line: ① to ②.' },
    { who: 1, dice: [3, 6], act: { type: 'land', R: [2, 5], to: [2, 5], count: 3 } },

    { who: 0, kind: 'move', dice: [4, 3], act: { type: 'move', R: [3, 2], from: [3, 1], to: [3, 2], count: 4 },
      title: 'Invade',
      intro: 'You can\'t land in a province the enemy controls, but you can march in. Bring more soldiers than they have.',
      instr: 'Drag ① to ② and move <b>4</b> across the river. The bridge is built for you.' },
    { who: 1, dice: [4, 3], act: { type: 'move', R: [3, 2], from: [3, 3], to: [3, 2], count: 3 } },

    { who: 0, kind: 'reinforce', dice: [4, 3], act: { type: 'land', R: [3, 2], to: [3, 2], count: 4 },
      title: 'Reinforce',
      intro: 'Ouch! Blue attacked: 3 of yours died for good (✝). Attackers go home, only <b>defenders</b> pay. Strike first!',
      instr: 'Tap your base and <b>Reinforce</b> it with <b>4</b>.' },
    { who: 1, dice: [4, 4], act: { type: 'move', R: [3, 3], from: [3, 4], to: [3, 3], count: 3 } },

    { who: 0, kind: 'attack', dice: [4, 4], act: { type: 'move', R: [3, 3], from: [3, 2], to: [3, 3], count: 4 },
      title: 'Attack',
      intro: 'Attacking is free: your attackers return to camp, only defenders die.',
      instr: 'Drag ① onto the enemy base ② and send <b>4</b>. Extra attackers take the cell.' },
    { who: 1, dice: [5, 4], act: { type: 'land', R: [4, 3], to: [4, 3], count: 4 } },

    { who: 0, kind: 'withdraw', dice: [1, 1], act: { type: 'withdraw', R: [0, 0], from: [3, 3], count: 1 },
      title: 'Retreat',
      intro: 'A lone base beside the enemy is a free kill. Pull it back!',
      instr: 'Tap the base and <b>Withdraw</b> its soldier.' },
    { who: 1, dice: [1, 6], act: { type: 'land', R: [0, 5], to: [0, 5], count: 3 } },

    { who: 0, kind: 'move', dice: [2, 2], act: { type: 'move', R: [1, 1], from: [2, 1], to: [1, 1], count: 3 },
      title: 'Shift forces',
      intro: 'Keep your front strong and your rear thin.',
      instr: 'Drag ① to ② and bring <b>3</b> over the bridge.' },
    { who: 1, dice: [6, 6], act: { type: 'land', R: [5, 5], to: [5, 5], count: 2 } },

    { who: 0, kind: 'move', dice: [2, 3], act: { type: 'move', R: [1, 2], from: [1, 1], to: [1, 2], count: 3 },
      title: 'Fourth province',
      intro: 'Spread out, but keep every province linked.',
      instr: 'Drag ① to ② and move <b>3</b> across. The bridge is built for you.' },
    { who: 1, dice: [2, 5], act: { type: 'land', R: [1, 4], to: [1, 4], count: 3 } },

    { who: 0, kind: 'land', dice: [4, 2], act: { type: 'land', R: [3, 1], to: [3, 1], count: 3 },
      title: 'Prepare',
      intro: 'One province left: first a base next to it.',
      instr: 'Land <b>3</b> on this empty circle in your territory.' },
    { who: 1, dice: [3, 6], act: { type: 'land', R: [2, 5], to: [2, 5], count: 2 } },

    { who: 0, kind: 'move', dice: [5, 2], act: { type: 'move', R: [4, 1], from: [3, 1], to: [4, 1], count: 2 },
      title: 'Final move',
      intro: 'Four linked, one to go!',
      instr: 'Drag ① to ② and move <b>2</b>. Five connected provinces win.' },
  ];

  const recap = [
    'Claim provinces early and link them with bridges.',
    'Attackers go home, only defenders die: strike first.',
    'Outnumber before you invade; retreat exposed lone bases.',
    'An enemy bridge can be replaced if you stand on both ends.',
  ];

  const T = { pages, steps, recap };

  // בדיקת התסריט מול מנוע החוקים: כל פעולה חוקית, המשבצות שהוטלו תואמות, והאדם מנצח בצעד האחרון בלבד
  T.verify = function (Rules) {
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
    let s = R.newGame();
    const log = [];
    for (let i = 0; i < T.steps.length; i++) {
      const st = T.steps[i];
      if (s.turn !== st.who) return { ok: false, error: `step ${i + 1}: expected turn ${st.who}, got ${s.turn}`, log };
      s = R.roll(s, st.dice[0], st.dice[1]);
      const a = toAct(st.act);
      if (!s.roll.cells.includes(a.R)) return { ok: false, error: `step ${i + 1}: R not among rolled cells ${s.roll.cells}`, log };
      try { s = R.apply(s, a); } catch (e) { return { ok: false, error: `step ${i + 1} (${st.act.type}): ${e.message}`, log }; }
      log.push(`${i + 1} ${st.who ? 'B' : 'R'} ${st.act.type} -> prov ${R.provincesHeld(s, 0)}/${R.provincesHeld(s, 1)} win ${R.winProgress(s, 0)}/${R.winProgress(s, 1)} grave ${s.graveyard} winner ${s.winner}`);
      if (s.winner !== null && i !== T.steps.length - 1) return { ok: false, error: `early winner at step ${i + 1}`, log };
    }
    return { ok: s.winner === 0, error: s.winner === 0 ? null : 'Red does not win at the end', log, final: s };
  };

  root.TUTORIAL = T;
  if (typeof module !== 'undefined' && module.exports) module.exports = T;
})(typeof window !== 'undefined' ? window : globalThis);
