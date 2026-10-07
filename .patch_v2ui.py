def edit(p, pairs):
    s = open(p, encoding='utf-8').read()
    for a, b in pairs:
        assert a in s, (p, a[:90])
        s = s.replace(a, b, 1)
    open(p, 'w', encoding='utf-8').write(s)


s = open('src/app.js', encoding='utf-8').read()

# 1. flat cells with a sharper shadow (no 3D)
a = s.index("    // עיגולים: משבצות פעילות")
b = s.index("    // טבעות: משבצות שהוטלו")
cells = r'''    // עיגולים: משבצות פעילות מודגשות בצל חד וברור
    for (let i = 0; i < R.CELLS; i++) {
      const c = state.cells[i], x = cellX(i), y = cellY(i);
      let lit = false;
      if (sheet) lit = i === sheet.from || i === sheet.cell || i === sheet.to;
      else if (opts) lit = i === ui.sel || opts.has(i);
      else lit = play.has(i);
      const fa = lit ? ' filter="url(#sh)"' : '';
      if (c.o === null) {
        const ctl = control[R.provinceOf(i)];
        h += `<circle class="cell${ctl !== null ? ' c' + ctl : ''}" cx="${x}" cy="${y}" r="${CR}"${fa}/>`;
      } else {
        h += `<circle class="base p${c.o}" cx="${x}" cy="${y}" r="${CR}"${fa}/><text class="cnt" x="${x}" y="${y + 1}">${c.n}</text>`;
      }
    }
'''
s = s[:a] + cells + s[b:]

a = s.index("  const grad = (id, c0, c1)")
b = s.index("</defs>`;", a) + len("</defs>`;")
defs = r'''  // צל חד, סימטרי מכל הצדדים
  const DEFS = `<defs>
      <filter id="sh" x="-70%" y="-70%" width="240%" height="240%"><feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#0b0f1a" flood-opacity=".95"/></filter>
    </defs>`;'''
s = s[:a] + defs + s[b:]

# 2. geometry: wider rivers
s = s.replace("const P = 64, G = 26, M = 22, CR = 26,", "const P = 64, G = 36, M = 22, CR = 26,", 1)

# 3. rules by mode
old = "  load(); render();"
assert old in s
s = s.replace(old, "  load(); applyRules(); render();", 1)
old = "  function save() {"
assert old in s
s = s.replace(old, """  // משחק שני שחקנים: כללי גרסה 2 (פרובינציה בשליטה = טריטוריה). מול המחשב: כללי גרסה 1, שעליהם הוא אומן.
  function applyRules() { R.OPTIONS.provinceTerritory = settings.mode === 'pvp'; }
  function save() {""", 1)
old = "    settings = Object.assign({}, pending); settings.human = +settings.human;"
assert old in s
s = s.replace(old, old + "\n    applyRules();", 1)

# 4. panels: progress toward the win
old = "const held = R.provincesHeld(state, p);"
assert old in s
s = s.replace(old, "const held = R.winProgress(state, p);", 1)

# 5. new-game modal note
old = "    $('grpWatchWrap').hidden = pending.mode !== 'watch';"
assert old in s
s = s.replace(old, old + "\n    $('ruleNote').textContent = pending.mode === 'pvp' ? 'כללי טריטוריה חדשים: פרובינציה בשליטתך היא חלק מהטריטוריה, והניצחון הוא 5 פרובינציות מחוברות.' : 'המחשב משחק לפי הכללים הקודמים (טריטוריה = בסיסים מחוברים, ניצחון ב-5 פרובינציות).';", 1)
open('src/app.js', 'w', encoding='utf-8').write(s)

edit('index.html', [
("""    <div id="grpSideWrap">""", """    <div id="ruleNote" class="rule-note"></div>
    <div id="grpSideWrap">"""),
])
edit('style.css', [
(".river { stroke: var(--river); stroke-width: 7; stroke-linecap: round; }", ".river { stroke: var(--river); stroke-width: 18; stroke-linecap: round; }"),
(".bridge { stroke-width: 11; stroke-linecap: round; }", ".bridge { stroke-width: 13; stroke-linecap: round; }"),
(".lift { transition: transform .12s; }\n", ""),
("#grpWatchWrap, #grpSideWrap", ".rule-note { font-size: 12px; color: var(--muted); line-height: 1.4; margin-top: -4px; }\n#grpWatchWrap, #grpSideWrap"),
])
print('ui ok')
