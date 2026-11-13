/*
 * Packs the VolleyStats web app (../www) into ONE file the Expo app can load:
 * styles.css and app.js are inlined into index.html, and the result is written
 * to web-bundle.js. Run with --watch to rebuild every time you save a file in www/.
 */
const fs = require('fs');
const path = require('path');

const WWW = path.join(__dirname, '..', '..', 'www');
const OUT = path.join(__dirname, '..', 'web-bundle.js');

function build() {
  let html = fs.readFileSync(path.join(WWW, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(WWW, 'styles.css'), 'utf8');
  const js = fs.readFileSync(path.join(WWW, 'app.js'), 'utf8');
  const icon = fs.readFileSync(path.join(WWW, 'icons', 'icon.svg'), 'utf8');

  // Never let file contents close the tag they're inlined into
  const safeJs = js.replace(/<\/script/gi, '<\\/script');
  const safeCss = css.replace(/<\/style/gi, '<\\/style');

  html = html
    .replace(/<link rel="stylesheet" href="styles\.css">/, () => `<style>\n${safeCss}\n</style>`)
    .replace(/<script src="app\.js"><\/script>/, () => `<script>\n${safeJs}\n</script>`)
    .replace(/<link rel="(manifest|apple-touch-icon)"[^>]*>\s*/g, '')
    .replace(/<link rel="icon"[^>]*>/, () => `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(icon)}">`);

  if (!html.includes('<style>') || !html.includes('<script>\n')) {
    throw new Error('Could not inline styles.css / app.js – did index.html change how it links them?');
  }
  fs.writeFileSync(OUT, '// AUTO-GENERATED from ../www by scripts/bundle-web.js. Do not edit.\n' +
    'export default ' + JSON.stringify(html) + ';\n');
  console.log(`[volleystats] web app packed (${Math.round(html.length / 1024)} KB)`);
}

build();

if (process.argv.includes('--watch')) {
  let timer = null;
  fs.watch(WWW, { recursive: true }, (_event, file) => {
    if (!file || !/\.(html|css|js|svg)$/.test(file) || file.endsWith('sw.js')) return;
    clearTimeout(timer);
    timer = setTimeout(() => { try { build(); } catch (e) { console.error('[volleystats]', e.message); } }, 150);
  });
  console.log('[volleystats] watching ../www for changes…');
}
