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
    { title: 'The goal', body: `Rivers split the board into <b>9 provinces</b>.` },
    { title: 'You are Green', body: `Control <b>5 provinces</b> to win.` },
    { title: 'Stay connected', body: `Your 5 provinces must be <b>connected</b> by bridges. Loose ones don't count.`, hl: true },
    { title: 'Bridges are limited', body: `You have only <b>8 bridges</b> for the whole game. Each one you build is gone for good.`, hl: 'bridges', beta: true },
  ];

  const L = (x, y) => [x, y];   // קיצור לקריאות
  const steps = [
    // 1. הטלה והנחתה בפרובינציה
    { who: 0, kind: 'land', dice: [2, 2], act: { type: 'land', R: L(1, 1), to: L(1, 1), count: 8 },
      title: `Roll and land`, intro: [`Each turn, you roll the dice.`, `They light up <b>two squares</b>, using the numbers on the edges.`], instr: `Choose one. Land <b>8</b> soldiers.` },
    { who: 1, dice: [6, 6], act: { type: 'land', R: L(5, 5), to: L(5, 5), count: 5 } },

    // 2. שליטה בפרובינציה (הנחתה בפרובינציה צמודה)
    { who: 0, kind: 'land', dice: [3, 2], act: { type: 'land', R: L(2, 1), to: L(2, 1), count: 4 },
      title: `Control a province`, intro: [`A province is yours when <b>only you</b> have soldiers in it.`, `Then <b>every square</b> in it is your territory.`], instr: `Land <b>4</b> soldiers in the next province.` },
    { who: 1, dice: [3, 5], act: { type: 'land', R: L(2, 4), to: L(2, 4), count: 4 } },

    // 3. מנדט מכל בסיס + גשר והעברת חיילים לפרובינציה הצמודה
    { who: 0, kind: 'move', dice: [1, 1], act: { type: 'move', R: L(0, 0), from: L(1, 1), to: L(2, 1), count: 1 },
      title: `Any base`, intro: [`A lit square in your territory lets you play from <b>any</b> of your bases.`, `Moving across a river builds a <b>bridge</b>.`], introBeta: [`Each bridge uses one of your <b>8</b> bridges.`], hlb: true, instr: `Move <b>1</b> soldier across the river.` },
    { who: 1, dice: [1, 5], act: { type: 'land', R: L(0, 4), to: L(0, 4), count: 4 } },

    // 4. טריטוריה מאוחדת דרך גשר: כיבוש פרובינציה נוספת
    { who: 0, kind: 'move', dice0: [6, 6], rrTitle: `Re-roll`, rrInstr: `These squares are far from the action. Tap <b>Re-roll</b>. You can do it <b>once per turn</b>.`, dice: [4, 1], act: { type: 'move', R: L(3, 0), from: L(1, 1), to: L(1, 2), count: 4 },
      title: `One territory`, intro: [`Provinces joined by a bridge are <b>one territory</b>.`, `Watch the <b>meter</b>: it counts only connected provinces.`], instr: `Move <b>4</b> soldiers to claim a new province.`, hl: true },
    // 5. (המחשב חודר לפרובינציה השלישית)
    { who: 1, dice: [1, 5], act: { type: 'move', R: L(0, 4), from: L(0, 4), to: L(0, 3), count: 2 } },

    // 6. משבצת מחוץ לטריטוריה אבל צמודה לבסיס
    { who: 0, kind: 'move', dice: [2, 4], act: { type: 'move', R: L(1, 3), from: L(1, 2), to: L(1, 3), count: 3 },
      title: `Get close`, intro: [`Blue invaded your new province!`, `With both colors inside, <b>nobody controls it</b>. Your meter drops.`], instr: `Move <b>3</b> soldiers next to Blue.`, hl: true },
    { who: 1, dice: [6, 2], act: { type: 'land', R: L(5, 1), to: L(5, 1), count: 4 } },

    // 7. התקפה והחזרת השליטה
    { who: 0, kind: 'attack', dice: [3, 1], act: { type: 'move', R: L(2, 0), from: L(1, 3), to: L(0, 3), count: 3 },
      title: `Attack`, intro: [`Attackers who kill <b>return to camp</b>.`, `Defenders <b>die for good</b>. Survivors take the square.`], instr: `Attack Blue with <b>3</b>.`, hl: true },
    { who: 1, dice: [6, 3], act: { type: 'land', R: L(5, 2), to: L(5, 2), count: 3 } },

    // 8. הנחתה רק במשבצת שהוטלה
    { who: 0, kind: 'land', dice: [2, 3], act: { type: 'land', R: L(1, 2), to: L(1, 2), count: 5 },
      title: `Landing rule`, intro: [`You can move from any base in your territory.`, `But new soldiers land <b>only on the lit square</b>.`], instr: `Add <b>5</b> soldiers here.` },
    { who: 1, dice: [6, 3], act: { type: 'move', R: L(5, 2), from: L(5, 2), to: L(5, 3), count: 2 } },

    // 9. תור בלי מהלך
    { who: 0, kind: 'skip', dice0: [5, 1], rrInstr: `No move here. Tap <b>Re-roll</b>.`, dice: [1, 5], act: { type: 'skip' },
      title: `No move?`, intro: [`Sometimes you cannot play.`, `Both squares are in enemy territory, far from your bases.`], instr: `Still nothing. Tap <b>Pass</b>.` },
    { who: 1, dice: [3, 5], act: { type: 'move', R: L(2, 4), from: L(2, 4), to: L(3, 4), count: 2 } },

    // 10. אי אפשר לחצות בגשר של היריב: זזים למשבצת פנויה
    { who: 0, kind: 'move', dice: [1, 1], act: { type: 'move', R: L(0, 0), from: L(1, 2), to: L(1, 3), count: 5 },
      title: `Enemy bridges`, intro: [`You cannot cross Blue’s bridge.`, `Move to a free square, then build your own.`], instr: `Move <b>5</b> soldiers to the free square.` },
    { who: 1, dice: [6, 2], act: { type: 'bridge', R: L(5, 1), from: L(5, 1), to: L(5, 2), count: 0 } },

    // 11. פלישה לטריטוריה הנוספת של המחשב
    { who: 0, kind: 'move', dice: [2, 2], act: { type: 'move', R: L(1, 1), from: L(1, 3), to: L(1, 4), count: 4 },
      title: `Invade`, intro: [`Crossing a river with no bridge builds <b>your</b> bridge.`], instr: `Invade Blue’s province with <b>4</b> soldiers.` },
    { who: 1, dice: [6, 6], act: { type: 'move', R: L(5, 5), from: L(5, 5), to: L(5, 4), count: 2 } },

    // 12. מגיעים למשבצת שממול הגשר של היריב
    { who: 0, kind: 'attack', dice: [1, 5], act: { type: 'move', R: L(0, 4), from: L(1, 4), to: L(0, 4), count: 3 },
      title: `Take the far end`, intro: [`To replace Blue’s bridge, you must hold <b>both ends</b>.`, `You hold one.`], instr: `Attack the other end with <b>3</b>.` },
    { who: 1, dice: [6, 4], act: { type: 'bridge', R: L(5, 3), from: L(5, 4), to: L(5, 3), count: 0 } },

    // 13. החלפת הגשר של היריב
    { who: 0, kind: 'bridge', dice: [1, 1], act: { type: 'bridge', R: L(0, 0), from: L(0, 3), to: L(0, 4), count: 0 },
      title: `Replace a bridge`, intro: [`You hold both ends now.`, `Replace Blue’s bridge with yours!`], instr: `Build the bridge. Keep <b>0</b> soldiers moving.` },
    { who: 1, dice: [5, 5], act: { type: 'land', R: L(4, 4), to: L(4, 4), count: 2 } },

    // 14. שינוע בקו ישר בתוך הטריטוריה
    { who: 0, kind: 'transport', dice: [1, 1], act: { type: 'transport', R: L(0, 0), from: L(1, 1), to: L(1, 3), count: 2 },
      title: `Transport`, intro: [`In your territory, you can <b>transport</b> soldiers in a straight line.`, `Even over your bridges, from <i>any</i> base.`], instr: `Send <b>2</b> soldiers to the front.` },
    { who: 1, dice: [5, 5], act: { type: 'bridge', R: L(4, 4), from: L(3, 4), to: L(4, 4), count: 0 } },

    // 15. הפלישה האחרונה והניצחון
    { who: 0, kind: 'move', dice: [2, 2], act: { type: 'move', R: L(1, 1), from: L(1, 3), to: L(2, 3), count: 1 },
      title: `The final move`, intro: [`You have <b>4 connected provinces</b>. So does Blue!`, `One more connected province wins.`], instr: `Take the fifth province with <b>1</b> soldier.`, hl: true },
  ];

  const recap = [
    'Win with <b>5 connected provinces</b>. Loose ones do not count.',
    'Attackers return to camp, defenders die for good. Strike first.',
    'A lit square in your territory lets you move from any of your bases. New soldiers land only on the lit square.',
  ];

  const recapBeta = [
    'Once per turn you may <b>re-roll</b> the dice. The new roll replaces the old one.',
    'You have only <b>8 bridges</b> in the whole game.',
  ];
  const T = { pages, steps, recap, recapBeta };

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
      if (st.dice0) {
        const s0 = R.roll(s, st.dice0[0], st.dice0[1]);
        if (st.act.type === 'skip' && R.hasAnyMove(s0)) return { ok: false, error: `step ${i + 1}: first roll should have no move`, log };
      }
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

  root.TUTORIAL_V3 = T;
  if (typeof module !== 'undefined' && module.exports) module.exports = T;
})(typeof window !== 'undefined' ? window : globalThis);
