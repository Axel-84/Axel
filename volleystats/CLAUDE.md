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

## Colour themes
The app has two colour themes the user picks under **More → Colour theme**: **Navy & Sand** (default) and **Forest Green**.
Each has a light and a dark block at the top of `www/styles.css` (`:root[data-palette="..."]`).
Colour requests from the owner mean: edit the blocks of the theme they name, both light and dark, and keep the other theme unchanged.
To add a theme: add its 4 blocks (light, dark in the media query, forced dark) and an entry in `PALETTES` in `app.js`.

## Design: Apple style (iOS Human Interface Guidelines)
The app must look and feel like a native iPhone app. Always follow these when adding or changing UI:
- **Matte palette** (owner's choice): soft, muted, low-saturation colours. Use only the tokens at the top of `styles.css` (`--blue` slate accent, `--green` sage, `--teal` steel, `--orange` clay, `--red` brick, `--gray`); never hard-code new colours and never use bright/neon iOS system colours. No glossy gradients or heavy shadows.
- Warm off-white background `--bg` with soft inset grouped cells (`.card`, radius 12, no borders, hairline `.5px` separators).
- Root tabs use a **large title** (`setChrome({ large: true })`); pushed screens use the small centred nav-bar title and a blue "‹ Back".
- Frosted translucent nav bar and tab bar (backdrop blur). Tab bar: outline icons, blue when active.
- Font is the system font (SF Pro on iPhone): 17px body, 13px uppercase grey section headers (`h2`), 34px bold large titles.
- Buttons: filled blue (`.btn.primary`) for the main action, tinted (`.btn`) for secondary, plain blue text in the nav bar.
- Pickers with 2–5 options use the iOS segmented control (`.seg`); checkboxes look like iOS round checkmarks.
- Tap targets at least 44×44 pt. Support light and dark mode for every new screen.
- Don't copy Apple's own icons/SF Symbols or app screens; draw simple outline SVG icons instead.

## Rules
- The owner uses an iPhone: design mobile-first, test at 393px wide, big tap targets.
- Bump `CACHE` in `www/sw.js` when shipping changes, so installed copies update.
- No new libraries or build tools unless asked.
