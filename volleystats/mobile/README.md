# VolleyStats in Expo Go

This small Expo app shows the VolleyStats web app (`../www`) full screen, so you can try it on
your iPhone like a real app. You never edit files in here: edit `../www` as usual.

## Run it
1. Install **Expo Go** from the App Store on your iPhone.
2. On your laptop (VS Code terminal):
   ```bash
   cd volleystats/mobile
   npm install        # first time only
   npm start
   ```
3. Scan the QR code with the iPhone **Camera** app and tap the banner → opens in Expo Go.
   Laptop and iPhone must be on the same Wi-Fi. If it won't connect: `npm run tunnel`.

Saving any file in `../www` re-packs the app and Expo Go reloads by itself.
Press `r` in the terminal to force a reload. `Ctrl+C` stops it.

## How it works
`scripts/bundle-web.js` inlines `www/index.html` + `styles.css` + `app.js` into `web-bundle.js`
(generated, not committed). `App.js` shows it in a WebView with a fixed base URL so saved data
persists, and turns Export CSV / Back up into the iPhone share sheet.
Use only packages that Expo Go already includes (no custom native code).
