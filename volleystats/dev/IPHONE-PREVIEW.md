# Code on the left, iPhone on the right (Windows + VS Code)

## One-time setup (about 10 minutes)
1. Install **VS Code**: https://code.visualstudio.com
2. Install **Git for Windows**: https://git-scm.com/download/win (click Next through the installer).
3. Open VS Code → `Ctrl+Shift+P` → type **Git: Clone** → paste
   `https://github.com/Axel-84/Axel.git` → choose a folder (e.g. Documents) → sign in to GitHub if asked.
4. Bottom-left corner of VS Code: click the branch name (`main`) → pick
   **origin/claude/friendly-tesla-e8odwu**.
5. **File → Open Folder** → open the **volleystats** folder inside it.
6. VS Code asks "install recommended extensions?" → **Install** (it's Microsoft's *Live Preview*).
   If it doesn't ask: Extensions (`Ctrl+Shift+X`) → search **Live Preview** → Install.

## Every time you code
1. Open any file, e.g. `www/app.js`.
2. `Ctrl+Shift+P` → **Live Preview: Start Server**.
3. The iPhone appears in a panel on the right. Drag the divider to resize it.
4. Edit and **save** (`Ctrl+S`): the iPhone refreshes by itself.

Tips
- Change the iPhone model in the bar above the phone.
- Want the code bigger? `Ctrl+B` hides the file list.
- Got changes from Claude? Click **Source Control** (left bar) → **Sync Changes** (or the ⟳ at the bottom-left).

## Use it in a new app
Copy `dev/phone-preview.html` and the `.vscode` folder into the new project.
If the new app's start page isn't `www/index.html`, type its path in the box above the phone
(e.g. `../index.html` or `http://localhost:5173`) and press **Load**. It remembers it.

## On your real iPhone (same Wi-Fi)
Needs Node.js (https://nodejs.org, LTS). In VS Code: **Terminal → New Terminal**, then
`npm install` once and `npm run preview`. Find your laptop's IP with `ipconfig`
(IPv4 Address, e.g. 192.168.1.20), then on the iPhone open Safari →
`http://192.168.1.20:8080/www/` → Share → **Add to Home Screen**.
If it doesn't load, allow Node.js through the Windows Firewall (Private networks) when Windows asks.
