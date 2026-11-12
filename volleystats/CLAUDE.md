# VolleyStats

Volleyball stats app: coaches tag **serve receive (0–3)** and **serving** (3 Ace, 2 Tough, 1 Easy, 0 Error)
per player from match video, and get stats by player, position, set and season.
The owner is a beginner: explain changes in plain language, keep steps simple.

## Layout
- `www/`: the whole app. Plain HTML/CSS/JS, no build step, no framework.
  - `app.js`: hash router (`#/matches`, `#/teams`, `#/team/:id`, `#/new-match`, `#/match/:id/tag|stats|edit`, `#/season`, `#/settings`), views, stats maths, CSV export.
  - `styles.css`: colour tokens on `:root`, dark mode via `prefers-color-scheme`.
  - Data lives in `localStorage` key `volleystats.v1`: `{ teams:[{id,name,players:[{id,number,name,pos}]}], matches:[{id,teamId,opponent,date,competition,squad:{playerId:pos},events:[{id,playerId,pos,type:'receive'|'serve',grade:0-3,set,t,ts}]}] }`.
    Keep old saved data working when changing this shape.
- `dev/phone-preview.html`: iPhone frame used with VS Code **Live Preview** (`Ctrl+Shift+P` → Live Preview: Start Server).
- `android/`: Capacitor Android project. After changing `www/`, `npx cap sync android`. GitHub Actions builds the APK.

## Rules
- The owner uses an iPhone: design mobile-first, test at 393px wide, big tap targets.
- Bump `CACHE` in `www/sw.js` when shipping changes, so installed copies update.
- No new libraries or build tools unless asked.
