/*
 * npm start → packs the web app, keeps re-packing it when you save files in www/,
 * and starts Expo. Scan the QR code with your iPhone camera to open it in Expo Go.
 * Extra arguments are passed to Expo, e.g.  npm start -- --tunnel
 */
const { spawn } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const watcher = spawn(process.execPath, [path.join(__dirname, 'bundle-web.js'), '--watch'], { cwd: root, stdio: 'inherit' });

setTimeout(() => {
  const expo = spawn('npx', ['expo', 'start', ...process.argv.slice(2)], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  const stop = code => { watcher.kill(); process.exit(code ?? 0); };
  expo.on('exit', stop);
  process.on('SIGINT', () => { expo.kill('SIGINT'); stop(0); });
}, 800);
