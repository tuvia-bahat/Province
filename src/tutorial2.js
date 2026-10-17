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
    { title: 'The goal', body: 'Rivers split the board into <b>9 provinces</b>. You are <b>Green</b>: build one <b>territory</b> that controls <b>5 provinces</b> before Blue does.' },
  ];

  const L = (x, y) => [x, y];   // קיצור לקריאות
  const steps = [
    // 1. הטלה והנחתה בפרובינציה
    { who: 0, kind: 'land', dice: [2, 2], act: { type: 'land', R: L(1, 1), to: L(1, 1), count: 8 },
      title: 'Roll and land', intro: 'Each turn you roll the dice. They point to <b>two squares</b>, read on the axes from each player\'s side. Tap <b>Roll dice</b>.', instr: 'Pick one square. Tap the glowing one and land <b>8</b> soldiers.' },
    { who: 1, dice: [5, 5], act: { type: 'land', R: L(4, 4), to: L(4, 4), count: 4 } },

    // 2. שליטה בפרובינציה (הנחתה בפרובינציה צמודה)
    { who: 0, kind: 'land', dice: [3, 2], act: { type: 'land', R: L(2, 1), to: L(2, 1), count: 4 },
      title: 'Control a province', intro: 'You control a province when you are the <b>only player</b> with soldiers in it. Then <b>every square</b> in it becomes your territory.', instr: 'Land <b>4</b> in the next province, on the glowing square.' },
    { who: 1, dice: [4, 5], act: { type: 'land', R: L(3, 4), to: L(3, 4), count: 3 } },

    // 3. מנדט מכל בסיס + גשר והעברת חיילים לפרובינציה הצמודה
    { who: 0, kind: 'move', dice: [1, 1], act: { type: 'move', R: L(0, 0), from: L(1, 1), to: L(2, 1), count: 1 },
      title: 'Play from any base', intro: 'A lit square inside your territory lets you play from <i>any</i> of your bases in it.', instr: 'Drag from your base to the <b>right</b>, across the river, and move <b>1</b>. A bridge builds itself and joins your two provinces.' },
    { who: 1, dice: [1, 5], act: { type: 'land', R: L(0, 4), to: L(0, 4), count: 4 } },

    // 4. טריטוריה מאוחדת דרך גשר: כיבוש פרובינציה נוספת
    { who: 0, kind: 'move', dice: [4, 1], act: { type: 'move', R: L(3, 0), from: L(1, 1), to: L(1, 2), count: 4 },
      title: 'One territory', intro: 'Provinces joined by a bridge share one territory.', instr: 'The lit square is in your right province, but you may move from any base in the whole territory. Drag from the glowing base <b>up</b> and move <b>4</b> to claim a new province.' },
    // 5. (המחשב חודר לפרובינציה השלישית)
    { who: 1, dice: [1, 5], act: { type: 'move', R: L(0, 4), from: L(0, 4), to: L(0, 3), count: 2 } },

    // 6. משבצת מחוץ לטריטוריה אבל צמודה לבסיס
    { who: 0, kind: 'move', dice: [2, 4], act: { type: 'move', R: L(1, 3), from: L(1, 2), to: L(1, 3), count: 3 },
      title: 'Get close', intro: 'Blue invaded your new province. With soldiers of both colors in it, <b>nobody controls it</b>, and it is no longer your territory.', instr: 'The lit square is outside your territory but next to your base: you may move from that base, only to that square. Move <b>3</b> up, next to Blue.' },
    { who: 1, dice: [5, 2], act: { type: 'land', R: L(4, 1), to: L(4, 1), count: 4 } },

    // 7. התקפה והחזרת השליטה
    { who: 0, kind: 'attack', dice: [3, 1], act: { type: 'move', R: L(2, 0), from: L(1, 3), to: L(0, 3), count: 3 },
      title: 'Attack', intro: 'When you attack, your soldiers who kill <b>go back to camp</b>, and the defenders <b>die for good</b>. The survivors take the square.', instr: 'The lit square is in your territory, so any base may play. Drag from the glowing base to Blue\'s base on the <b>left</b> and attack with <b>3</b>.' },
    { who: 1, dice: [4, 5], act: { type: 'bridge', R: L(3, 4), from: L(4, 4), to: L(3, 4), count: 0 } },

    // 8. הנחתה רק במשבצת שהוטלה
    { who: 0, kind: 'land', dice: [2, 3], act: { type: 'land', R: L(1, 2), to: L(1, 2), count: 5 },
      title: 'Landing rule', intro: 'You may move from any base in your territory, but new soldiers land <i>only</i> on the lit square.', instr: 'Tap the lit base and add <b>5</b>. No other base could receive them this turn.' },
    { who: 1, dice: [5, 5], act: { type: 'land', R: L(4, 4), to: L(4, 4), count: 3 } },

    // 9. תור בלי מהלך
    { who: 0, kind: 'skip', dice: [5, 1], act: { type: 'skip' },
      title: 'No move?', intro: 'Sometimes you cannot play: both squares are in enemy territory, with no base of yours next to them.', instr: 'Both squares are Blue\'s, far from your bases. Tap <b>Pass</b>.' },
    { who: 1, dice: [5, 2], act: { type: 'land', R: L(4, 1), to: L(4, 1), count: 2 } },

    // 10. אי אפשר לחצות בגשר של היריב: זזים למשבצת פנויה
    { who: 0, kind: 'move', dice: [1, 1], act: { type: 'move', R: L(0, 0), from: L(1, 2), to: L(1, 3), count: 5 },
      title: 'Enemy bridges', intro: 'A bridge belongs to its builder: you cannot cross Blue\'s bridge. Move to a free square, then build your own bridge there.', instr: 'Drag from your base <b>up</b> to the free square beside the river and move <b>5</b>. Next turn you cross there.' },
    { who: 1, dice: [5, 2], act: { type: 'move', R: L(4, 1), from: L(4, 1), to: L(4, 2), count: 3 } },

    // 11. פלישה לטריטוריה הנוספת של המחשב
    { who: 0, kind: 'move', dice: [2, 2], act: { type: 'move', R: L(1, 1), from: L(1, 3), to: L(1, 4), count: 4 },
      title: 'Invade', intro: 'Crossing a river where there is no bridge builds yours.', instr: 'Drag <b>up</b> across the river into Blue\'s province and move <b>4</b>.' },
    { who: 1, dice: [5, 5], act: { type: 'move', R: L(4, 4), from: L(4, 4), to: L(4, 3), count: 3 } },

    // 12. מגיעים למשבצת שממול הגשר של היריב
    { who: 0, kind: 'attack', dice: [1, 5], act: { type: 'move', R: L(0, 4), from: L(1, 4), to: L(0, 4), count: 3 },
      title: 'Take the far end', intro: 'To replace Blue\'s bridge you must hold <b>both of its ends</b>. You hold one. Attackers who kill go back to camp; defenders die for good.', instr: 'The lit square is Blue\'s base, next to yours. Drag <b>left</b> and attack with <b>3</b>.' },
    { who: 1, dice: [5, 3], act: { type: 'land', R: L(4, 2), to: L(4, 2), count: 2 } },

    // 13. החלפת הגשר של היריב
    { who: 0, kind: 'bridge', dice: [1, 1], act: { type: 'bridge', R: L(0, 0), from: L(0, 3), to: L(0, 4), count: 0 },
      title: 'Replace a bridge', intro: 'You now hold both ends of Blue\'s bridge. Replace it with yours!', instr: 'Drag from the base to the one above and set <b>0</b>. The bridge turns green.' },
    { who: 1, dice: [4, 5], act: { type: 'land', R: L(3, 4), to: L(3, 4), count: 2 } },

    // 14. שינוע בקו ישר בתוך הטריטוריה
    { who: 0, kind: 'transport', dice: [1, 1], act: { type: 'transport', R: L(0, 0), from: L(1, 1), to: L(1, 3), count: 2 },
      title: 'Transport', intro: 'Inside your territory you can transport soldiers along a straight line, even over your bridges, from <i>any</i> base.', instr: 'The lit square is elsewhere in your territory, so any base can send. Drag from the glowing base <b>up</b> to the base two squares above and send <b>2</b>.' },
    { who: 1, dice: [5, 4], act: { type: 'land', R: L(4, 3), to: L(4, 3), count: 2 } },

    // 15. הפלישה האחרונה והניצחון
    { who: 0, kind: 'move', dice: [2, 2], act: { type: 'move', R: L(1, 1), from: L(1, 3), to: L(2, 3), count: 1 },
      title: 'The final move', intro: 'You control <b>4 connected provinces</b>, and so does Blue! Whoever takes the fifth wins.', instr: 'Drag across the river into the empty province on the <b>right</b> and move <b>1</b>. Five connected provinces win!' },
  ];

  const recap = [
    'Win by connecting 5 provinces in your control.',
    'Attackers return to camp, defenders die for good: strike first.',
    'A lit square in your territory lets you move from any of your bases. New soldiers land only on the lit square.',
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

  root.TUTORIAL_NEW = T;
  if (typeof module !== 'undefined' && module.exports) module.exports = T;
})(typeof window !== 'undefined' ? window : globalThis);
