/* Province – טוטוריאל: משחק מתוסרט שלם על לוח 6×6 שהשחקן (אדום) מנצח בו.
 * כל תור הוא צעד: who=0 האדם (עם הסברים והדגשות), who=1 המחשב (מתוסרט, בלי הסברים).
 * dice=[X,Y] מגדיר את המשבצות שהוטלו (המשבצת הנגדית מחושבת אוטומטית); act הוא הפעולה בפורמט Rules.apply
 * (קואורדינטות [x,y], y=0 בצד האדום). הקובץ מכיל גם בדיקה שהתסריט חוקי ושהשחקן מנצח בסופו.
 */
(function (root) {
  'use strict';

  const pages = [
    { title: 'Welcome to Province', body: 'The board is nine <b>provinces</b>: blocks of four circles split by rivers. You are <b>Red</b>, at the bottom. Blue is the computer, at the top.' },
    { title: 'How to win', body: 'Control <b>5 connected provinces</b> at the end of your turn. You control a province when only <i>your</i> soldiers stand in it, and provinces are connected through <b>bridges</b>.' },
    { title: 'Your turn', body: 'Roll the two dice. They light <b>two circles</b>, opposite each other: pick one and make <b>one move</b>. Glowing rings will always show you exactly where to play.' },
    { title: 'Your numbers', body: 'Under the board: <b>sword</b> = soldiers in your camp, <b>trophy</b> = connected provinces you control, <b>arch</b> = bridges left, <b>cross</b> = soldiers lost for good.' },
    { title: 'Good to know', body: 'You may <b>Pass</b> any time. If neither lit circle can be played, your turn is skipped automatically. Soldiers that die never come back; the rest wait in your camp.' },
  ];

  const steps = [
    // 1 — land
    { who: 0, kind: 'land', dice: [2, 2], act: { type: 'land', R: [1, 1], to: [1, 1], count: 5 },
      title: 'Land soldiers',
      intro: 'Tap <b>Roll dice</b>. The dice light up two circles on opposite sides of the board.',
      instr: 'Tap the glowing circle, set <b>5</b> and press ✓. Soldiers come from your <b>camp</b> (the sword counter) and form a <b>base</b>. Alone in the province means you <b>control</b> it.' },
    { who: 1, dice: [4, 5], act: { type: 'land', R: [3, 4], to: [3, 4], count: 4 } },

    // 2 — land again
    { who: 0, kind: 'land', dice: [3, 2], act: { type: 'land', R: [2, 1], to: [2, 1], count: 4 },
      title: 'Expand',
      intro: 'More provinces, closer to victory. Claim them early, while landing is cheap. Roll again!',
      instr: 'Only one lit circle is playable: the other holds an enemy base too far from yours. Land <b>4</b> on the glowing one for your second province.' },
    { who: 1, dice: [5, 5], act: { type: 'land', R: [4, 4], to: [4, 4], count: 3 } },

    // 3 — bridge
    { who: 0, kind: 'bridge', dice: [2, 2], act: { type: 'bridge', R: [1, 1], from: [1, 1], to: [2, 1], count: 0 },
      title: 'Build a bridge',
      intro: 'A <b>river</b> splits your two bases and soldiers cannot cross it. A <b>bridge</b> links two circles over a river. You own just <b>8</b>, and only you can cross yours.',
      instr: 'Drag from <b>①</b> to <b>②</b>, set <b>0</b> and press ✓. Zero soldiers means you only build the bridge. (Moving soldiers over a river builds one automatically.)' },
    { who: 1, dice: [4, 4], act: { type: 'land', R: [3, 3], to: [3, 3], count: 3 } },

    // 4 — territory + transport
    { who: 0, kind: 'transport', dice: [1, 1], act: { type: 'transport', R: [0, 0], from: [1, 1], to: [3, 1], count: 4 },
      title: 'Territory and transport',
      intro: 'Your linked bases, plus every circle of a province you control, form your <b>territory</b>: the tinted area.',
      instr: 'The lit circle is inside your territory, which gives you a <b>mandate</b>: act from <i>any</i> of your bases. Drag <b>①</b> to <b>②</b> to <b>transport</b> 4 soldiers in a straight line over your bridge.' },
    { who: 1, dice: [3, 6], act: { type: 'land', R: [2, 5], to: [2, 5], count: 3 } },

    // 5 — invade
    { who: 0, kind: 'move', dice: [4, 3], act: { type: 'move', R: [3, 2], from: [3, 1], to: [3, 2], count: 4 },
      title: 'Invade',
      intro: 'Blue holds the middle province. You cannot <i>land</i> soldiers in territory the enemy controls... Rule of thumb: arrive with more soldiers than they have.',
      instr: '...but you can march in. Drag <b>①</b> to <b>②</b> and move <b>4</b> soldiers across the river (the bridge is built for you). Now both colors share the province, so nobody controls it.' },
    { who: 1, dice: [4, 3], act: { type: 'move', R: [3, 2], from: [3, 3], to: [3, 2], count: 3 } },

    // 6 — reinforce
    { who: 0, kind: 'reinforce', dice: [4, 3], act: { type: 'land', R: [3, 2], to: [3, 2], count: 4 },
      title: 'Reinforce',
      intro: 'Ouch! Blue rolled the circle next to your base and attacked: 3 of your soldiers died for good (grave counter). Attackers return to camp, so only <b>defenders</b> pay. Strike first!',
      instr: 'One soldier survived and holds the province alone. Reinforce it: tap the glowing base, set <b>4</b> and press ✓. Landing is only allowed on a lit circle.' },
    { who: 1, dice: [4, 4], act: { type: 'move', R: [3, 3], from: [3, 4], to: [3, 3], count: 3 } },

    // 7 — attack
    { who: 0, kind: 'attack', dice: [4, 4], act: { type: 'move', R: [3, 3], from: [3, 2], to: [3, 3], count: 4 },
      title: 'Attack',
      intro: 'Blue stepped into your province. Time to hit back! Attacking costs you nothing: your attackers go back to camp, only defenders die.',
      instr: 'Drag <b>①</b> onto the enemy base <b>②</b> and send <b>4</b>. Each attacker kills one defender for good. The extra attacker takes the cell, and attackers who killed return to camp.' },
    { who: 1, dice: [5, 4], act: { type: 'land', R: [4, 3], to: [4, 3], count: 4 } },

    // 8 — withdraw
    { who: 0, kind: 'withdraw', dice: [1, 1], act: { type: 'withdraw', R: [0, 0], from: [3, 3], count: 1 },
      title: 'Retreat',
      intro: 'Blue just landed 4 soldiers right beside your lone base. If the dice favor them, it is gone.',
      instr: 'Pull it back: tap the glowing base ①, take its <b>1</b> soldier back to your camp and press ✓. The lit circle is in your territory, so you may withdraw from any base.' },
    { who: 1, dice: [1, 6], act: { type: 'land', R: [0, 5], to: [0, 5], count: 3 } },

    // 9 — shift forces
    { who: 0, kind: 'move', dice: [2, 2], act: { type: 'move', R: [1, 1], from: [2, 1], to: [1, 1], count: 3 },
      title: 'Shift your forces',
      intro: 'Moving soldiers where they are needed matters as much as landing new ones. Keep your front strong and your rear thin.',
      instr: 'Your home base is thin. The lit circle is in your territory, so drag <b>①</b> to <b>②</b> over the bridge and bring <b>3</b> soldiers across.' },
    { who: 1, dice: [6, 6], act: { type: 'land', R: [5, 5], to: [5, 5], count: 2 } },

    // 10 — expand west
    { who: 0, kind: 'move', dice: [2, 3], act: { type: 'move', R: [1, 2], from: [1, 1], to: [1, 2], count: 3 },
      title: 'Claim a fourth province',
      intro: 'Three provinces are yours and linked. Two more to go: head north-west. Spread out, but keep every province linked.',
      instr: 'The glowing circle is empty. Drag <b>①</b> to <b>②</b> and move <b>3</b> across the river: you claim the province and a new bridge links it to your territory in a single move.' },
    { who: 1, dice: [2, 5], act: { type: 'land', R: [1, 4], to: [1, 4], count: 3 } },

    // 11 — land in own territory
    { who: 0, kind: 'land', dice: [4, 2], act: { type: 'land', R: [3, 1], to: [3, 1], count: 3 },
      title: 'Prepare the last step',
      intro: 'One province left: the one in the south-east. First you need a base next to it.',
      instr: 'The lit circle is empty but lies in your tinted territory, and you can land there too. Land <b>3</b> soldiers: this base will launch the final move.' },
    { who: 1, dice: [3, 6], act: { type: 'land', R: [2, 5], to: [2, 5], count: 2 } },

    // 12 — win
    { who: 0, kind: 'move', dice: [5, 2], act: { type: 'move', R: [4, 1], from: [3, 1], to: [4, 1], count: 2 },
      title: 'The final move',
      intro: 'Four provinces are linked; the fifth completes the chain.',
      instr: 'Drag <b>①</b> to <b>②</b> and move <b>2</b> soldiers east across the river. That makes <b>5 connected provinces</b>, so you win!' },
  ];

  const recap = [
    'Claim provinces early; you control one when only your soldiers are in it.',
    'Plan a connected chain: 5 provinces linked by bridges (you own 8).',
    'Your territory lets you act from any base: use transport to shift forces.',
    'Attackers return to camp, only defenders die: strike first and never leave soldiers within the enemy\'s reach.',
    'Outnumber before you invade, and retreat lone bases that are exposed.',
    'You can replace an enemy bridge if you stand on both ends of it.',
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
