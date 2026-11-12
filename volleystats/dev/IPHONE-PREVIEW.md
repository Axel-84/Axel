# See your app on an iPhone while you code

## 1. iPhone frame beside your code (works on any computer)
```bash
npm run preview
```
Opens `dev/phone-preview.html`: your app inside an iPhone frame. Every time you save a file it reloads by itself.
Pick a different iPhone size in the top bar.

**Reuse in a new app:** copy `dev/phone-preview.html` into the new project and open
`phone-preview.html?src=<path or URL of your app>`, e.g. `?src=http://localhost:3000`.
Put the browser window next to your code editor (Windows: Win + ←/→, Mac: drag to the side).

## 2. On your real iPhone, live (same Wi-Fi)
1. `npm run preview` on your computer.
2. Find the computer's local IP (Windows: `ipconfig`, Mac: System Settings → Wi-Fi → Details), e.g. 192.168.1.20.
3. On the iPhone open Safari → `http://192.168.1.20:8080/www/`.
4. Share → **Add to Home Screen**: it gets its own icon and opens full screen like an app.
Saving code reloads the phone automatically too.

## 3. The real iPhone Simulator (Mac only)
Install Xcode from the Mac App Store, then:
```bash
npm install @capacitor/ios
npx cap add ios
npx cap run ios        # pick an iPhone simulator
```
The Simulator window can sit beside your editor. Running on your own iPhone from Xcode is free;
publishing on the App Store needs the Apple Developer Program ($99/year).
