# Province

משחק אסטרטגיה אבסטרקטי לשני שחקנים. גרסה ראשונה: שני שחקנים על אותו מכשיר (hot-seat).

- חוקי המשחק (מקור האמת, כולל יומן שינויים): [RULES.md](RULES.md)
- `src/rules.js` – לוגיקת המשחק, ללא תלות בתצוגה
- `src/ai.js` – יריב מחשב (הערכת מצב + חיפוש expectimax)
- `tools/bundle.py` – בונה קובץ HTML בודד לפרסום כ-Artifact
- `tests/bench2.html` – טורניר משחק מול עצמו לכוונון המחשב
- `src/app.js`, `index.html`, `style.css` – הממשק
- `tests/tests.html` – בדיקות לוגיקה (לפתוח בדפדפן)

## הרצה

אפשר לפתוח את `index.html` ישירות בדפדפן, או להריץ שרת מקומי:

```
python -m http.server 8765
```

ואז לפתוח `http://localhost:8765`. בטלפון באותה רשת: `http://<כתובת-המחשב>:8765`.

המשחק נשמר אוטומטית בדפדפן (localStorage).
