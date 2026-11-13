'use strict';

/* ============================================================
   VolleyStats: tag serve receive and serving, get stats.
   All data is stored on the device (localStorage).
   ============================================================ */

const POSITIONS = [
  { code: 'OH', name: 'Outside Hitter' },
  { code: 'OPP', name: 'Opposite' },
  { code: 'MB', name: 'Middle Blocker' },
  { code: 'S', name: 'Setter' },
  { code: 'L', name: 'Libero' },
  { code: 'DS', name: 'Defensive Specialist' },
];
const POS_NAME = Object.fromEntries(POSITIONS.map(p => [p.code, p.name]));

const RECEIVE_GRADES = [
  { g: 3, label: '3', desc: 'Perfect' },
  { g: 2, label: '2', desc: 'Good' },
  { g: 1, label: '1', desc: 'Poor' },
  { g: 0, label: '0', desc: 'Aced / error' },
];
const SERVE_GRADES = [
  { g: 3, label: 'Ace', desc: 'Point' },
  { g: 2, label: '2', desc: 'Tough' },
  { g: 1, label: '1', desc: 'Easy' },
  { g: 0, label: 'Err', desc: 'Error' },
];
const TYPE_LABEL = { receive: 'Receive', serve: 'Serve' };

/* ---------- storage ---------- */
const KEY = 'volleystats.v1';
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.teams) && Array.isArray(s.matches)) return s;
  } catch (e) { /* ignore */ }
  return { teams: [], matches: [] };
}
let db = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch (e) { toast('Could not save – device storage may be full'); }
}
try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { /* ignore */ }

/* ---------- appearance (Automatic / Light / Dark) ---------- */
const THEME_KEY = 'volleystats.theme';
function getTheme() { try { return localStorage.getItem(THEME_KEY) || 'auto'; } catch (e) { return 'auto'; } }
const PALETTE_KEY = 'volleystats.palette';
const PALETTES = {
  navy: { name: 'Navy & Sand', light: '#ece4d4', dark: '#121722', dots: ['#2f4466', '#ece4d4', '#a5622f'] },
  green: { name: 'Forest Green', light: '#f3f1ed', dark: '#151617', dots: ['#3b5745', '#f3f1ed', '#9c6838'] },
};
function getPalette() { try { const c = localStorage.getItem(PALETTE_KEY); return PALETTES[c] ? c : 'navy'; } catch (e) { return 'navy'; } }
function applyPalette(c) {
  document.documentElement.dataset.palette = c;
  try { localStorage.setItem(PALETTE_KEY, c); } catch (e) { /* ignore */ }
  applyTheme(getTheme());
}
function applyTheme(t) {
  const root = document.documentElement;
  if (t === 'light' || t === 'dark') root.dataset.theme = t; else delete root.dataset.theme;
  try { t === 'auto' ? localStorage.removeItem(THEME_KEY) : localStorage.setItem(THEME_KEY, t); } catch (e) { /* ignore */ }
  // status bar / browser chrome colour
  const pal = PALETTES[getPalette()];
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => {
    const isDark = m.media.includes('dark');
    if (t === 'auto') m.content = isDark ? pal.dark : pal.light;
    else m.content = t === 'dark' ? pal.dark : pal.light;
  });
}
document.documentElement.dataset.palette = getPalette();
applyTheme(getTheme());

/* ---------- helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-5);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = d => { try { return new Date(d + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return d; } };
const fmtTime = t => { if (t == null || isNaN(t)) return '–'; t = Math.max(0, Math.floor(t)); const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); };
const avg = (sum, n) => n ? sum / n : null;
const f2 = v => v == null ? '–' : v.toFixed(2);
const pct = (a, n) => n ? Math.round(a / n * 100) + '%' : '–';
const team = id => db.teams.find(t => t.id === id);
const match = id => db.matches.find(m => m.id === id);
const playerName = p => p ? (p.number !== '' && p.number != null ? '#' + p.number + ' ' : '') + p.name : 'Removed player';

let toastTimer;
function toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 1600);
}
function confirmDo(msg) { return window.confirm(msg); }

/* ---------- router ---------- */
const app = $('#app');
let cleanup = null;

function setChrome({ title, back, tab, tabs = true, right = '', large = false }) {
  $('#title').textContent = large ? '' : title;
  $('#largeTitle').textContent = large ? title : '';
  $('#largeTitle').hidden = !large;
  const b = $('#backBtn');
  b.style.visibility = back ? 'visible' : 'hidden';
  b.onclick = () => {
    // '@back:#/fallback' = go back to wherever the user came from (screens reachable from several places)
    if (String(back).startsWith('@back:')) { if (navCount > 1) history.back(); else location.hash = back.slice(6); }
    else location.hash = back;
  };
  $('#topRight').innerHTML = right;
  document.body.classList.toggle('no-tabs', !tabs);
  updateTabbar(tab);
}

// iPhone Safari only shows :active (pressed) styles when the page listens for touches.
document.addEventListener('touchstart', () => {}, { passive: true });

/* Bottom tab bar: highlight the current tab, slide the glow to it, pop its icon. */
let lastTab = null;
function updateTabbar(tab) {
  const nav = $('#tabbar');
  const links = $$('#tabbar a');
  const idx = links.findIndex(a => a.dataset.tab === tab);
  links.forEach(a => a.classList.toggle('active', a.dataset.tab === tab));
  nav.classList.toggle('has-active', idx >= 0);
  if (idx >= 0) nav.style.setProperty('--i', idx);
  if (idx >= 0 && lastTab !== null && tab !== lastTab) {
    const icon = $('.ti', links[idx]);
    icon.classList.remove('pop');
    void icon.getBoundingClientRect();   // restart the animation
    icon.classList.add('pop');
  }
  lastTab = tab;
  if (!nav.classList.contains('ready')) requestAnimationFrame(() => requestAnimationFrame(() => nav.classList.add('ready')));
}

let navCount = 0;
function route() {
  if (cleanup) { cleanup(); cleanup = null; }
  $$('.sheet').forEach(s => s.remove());
  navCount++;
  const parts = (location.hash.replace(/^#\/?/, '') || 'matches').split('/');
  const [p0, p1, p2, p3] = parts;
  window.scrollTo(0, 0);
  try {
    if (p0 === 'match' && p1 && p2 === 'clips') return viewClips(p1, p3);
    if (p0 === 'player' && p1) return viewPlayer(p1);
    if (p0 === 'matches') return viewMatches();
    if (p0 === 'teams') return viewTeams();
    if (p0 === 'team' && p1) return viewTeam(p1);
    if (p0 === 'new-match') return viewNewMatch(p1);
    if (p0 === 'match' && p1 && p2 === 'tag') return viewTag(p1);
    if (p0 === 'match' && p1 && p2 === 'stats') return viewMatchStats(p1);
    if (p0 === 'match' && p1 && p2 === 'edit') return viewEditMatch(p1);
    if (p0 === 'season') return viewSeason(p1);
    if (p0 === 'settings') return viewSettings();
  } catch (e) { console.error(e); }
  location.hash = '#/matches';
}
window.addEventListener('hashchange', route);

/* ============================================================
   MATCHES
   ============================================================ */
function viewMatches() {
  setChrome({ title: 'Matches', tab: 'matches', large: true, right: db.teams.length ? '<a class="nav-action" href="#/new-match" aria-label="New match">+</a>' : '' });
  if (!db.teams.length) {
    app.innerHTML = `
      <div class="card empty">
        <div class="big">&#127952;</div>
        <h2>Welcome to VolleyStats</h2>
        <p>Start by adding your team and players with their positions. Then create a match, load your video and tag every serve and serve receive.</p>
        <a class="btn primary" href="#/teams">Add your team</a>
      </div>
      ${scaleGuideHTML()}`;
    return;
  }
  const ms = [...db.matches].sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.created - a.created);
  app.innerHTML = `
    <a class="btn primary block" href="#/new-match">+ New match</a>
    <h2>Matches</h2>
    ${ms.length ? `<div class="card">${ms.map(m => {
      const t = team(m.teamId);
      const nR = m.events.filter(e => e.type === 'receive').length, nS = m.events.filter(e => e.type === 'serve').length;
      const tg = targetsSummary(evalTargets(t, m.events));
      const tgText = tg.total ? ` · <span class="${tg.met === tg.total ? 'q-good' : 'q-bad'}">targets ${tg.met}/${tg.total}${tg.met === tg.total ? ' ✓' : ''}</span>` : '';
      return `<div class="list-item">
        <div class="grow">
          <a class="title" href="#/match/${m.id}/tag">${esc(t ? t.name : 'Team')} vs ${esc(m.opponent || 'Opponent')}</a>
          <div class="small muted">${fmtDate(m.date)}${m.competition ? ' · ' + esc(m.competition) : ''} · ${nR} receives · ${nS} serves${tgText}</div>
        </div>
        <a class="btn sm" href="#/match/${m.id}/tag">Tag</a>
        <a class="btn sm" href="#/match/${m.id}/stats">Stats</a>
      </div>`;
    }).join('')}</div>` : `<div class="card empty"><p>No matches yet. Tap <b>New match</b> to start tagging.</p></div>`}`;
}

/* ============================================================
   TEAMS
   ============================================================ */
function viewTeams() {
  setChrome({ title: 'Teams', tab: 'teams', large: true });
  app.innerHTML = `
    <div class="card">
      <form id="newTeam" class="row">
        <input class="grow" name="name" placeholder="Team name, e.g. Leeds Women 1" required maxlength="60">
        <button class="btn primary">Add team</button>
      </form>
    </div>
    ${db.teams.length ? `<div class="card">${db.teams.map(t => `
      <div class="list-item">
        <div class="grow"><a class="title" href="#/team/${t.id}">${esc(t.name)}</a>
          <div class="small muted">${t.players.length} players</div></div>
        <a class="btn sm" href="#/team/${t.id}">Edit</a>
      </div>`).join('')}</div>` : `<div class="card empty"><p>No teams yet. Add your first team above.</p></div>`}`;
  $('#newTeam').onsubmit = e => {
    e.preventDefault();
    const name = e.target.name.value.trim(); if (!name) return;
    const t = { id: uid(), name, players: [] };
    db.teams.push(t); save();
    location.hash = '#/team/' + t.id;
  };
}

function posOptions(sel) {
  return POSITIONS.map(p => `<option value="${p.code}" ${p.code === sel ? 'selected' : ''}>${p.code}</option>`).join('');
}

function viewTeam(id) {
  const t = team(id); if (!t) { location.hash = '#/teams'; return; }
  setChrome({ title: t.name, back: '#/teams', tab: 'teams' });
  const render = () => {
    const players = [...t.players].sort((a, b) => (+a.number || 999) - (+b.number || 999));
    app.innerHTML = `
      <div class="card">
        <label class="field"><span>Team name</span><input id="tname" value="${esc(t.name)}" maxlength="60"></label>
      </div>
      <h2>Players</h2>
      <div class="card">
        <div class="prow small muted"><span>No.</span><span>Name</span><span>Position</span><span></span></div>
        ${players.map(p => `
          <div class="prow" data-id="${p.id}">
            <input data-f="number" inputmode="numeric" value="${esc(p.number)}" maxlength="3">
            <input data-f="name" value="${esc(p.name)}" maxlength="40">
            <select data-f="pos">${posOptions(p.pos)}</select>
            <button class="xbtn" data-del title="Remove player">&times;</button>
          </div>`).join('') || '<p class="muted small">No players yet.</p>'}
        <form id="addP" class="prow" style="margin-top:8px">
          <input name="number" inputmode="numeric" placeholder="No." maxlength="3">
          <input name="name" placeholder="Player name" required maxlength="40">
          <select name="pos">${posOptions('OH')}</select>
          <button class="btn primary sm" title="Add player">+</button>
        </form>
      </div>
      <details class="card small"><summary><b>Position codes</b></summary>
        <p>${POSITIONS.map(p => `<b>${p.code}</b> ${p.name}`).join(' · ')}</p></details>
      ${players.length ? `<h2>Player stats</h2>
      <div class="card">${players.map(p => `
        <a class="list-item link-row" href="#/player/${p.id}">
          <span class="grow">${esc(playerName(p))} <span class="pill">${esc(p.pos)}</span></span><span class="chev">&#8250;</span>
        </a>`).join('')}</div>` : ''}
      <h2>Team targets</h2>
      <div class="card">
        <p class="small muted" style="margin-top:0">Set the goals you want each match to hit. Leave a box empty for no target. Matches then show &#10003; or &#10007; for every target.</p>
        <div class="grid2">${TARGETS.map(d => `
          <label class="field"><span>${d.label} ${d.dir === 'min' ? 'at least' : 'at most'}${d.kind === 'pct' ? ' (%)' : ''}</span>
            <input data-target="${d.key}" inputmode="decimal" placeholder="e.g. ${d.ph}" value="${esc(t.targets?.[d.key] ?? '')}"></label>`).join('')}
        </div>
      </div>
      <button class="btn danger" id="delTeam">Delete team</button>`;

    $('#tname').onchange = e => { t.name = e.target.value.trim() || t.name; save(); setChrome({ title: t.name, back: '#/teams', tab: 'teams' }); };
    $$('.prow[data-id]').forEach(row => {
      const p = t.players.find(x => x.id === row.dataset.id);
      $$('[data-f]', row).forEach(inp => inp.onchange = () => { p[inp.dataset.f] = inp.value.trim(); save(); });
      $('[data-del]', row).onclick = () => {
        if (!confirmDo(`Remove ${playerName(p)}? Their tagged stats stay in old matches.`)) return;
        t.players = t.players.filter(x => x !== p); save(); render();
      };
    });
    $$('[data-target]').forEach(inp => inp.onchange = () => {
      const v = parseFloat(inp.value.replace(',', '.'));
      t.targets ??= {};
      if (isNaN(v)) { delete t.targets[inp.dataset.target]; inp.value = ''; }
      else { t.targets[inp.dataset.target] = v; inp.value = v; }
      save(); toast(isNaN(v) ? 'Target removed' : 'Target saved');
    });
    $('#addP').onsubmit = e => {
      e.preventDefault();
      const f = e.target;
      t.players.push({ id: uid(), number: f.number.value.trim(), name: f.name.value.trim(), pos: f.pos.value });
      save(); render();
      $('#addP [name=number]').focus();
    };
    $('#delTeam').onclick = () => {
      const n = db.matches.filter(m => m.teamId === t.id).length;
      if (!confirmDo(`Delete ${t.name}${n ? ` and its ${n} match(es)` : ''}? This cannot be undone.`)) return;
      db.teams = db.teams.filter(x => x !== t);
      db.matches = db.matches.filter(m => m.teamId !== t.id);
      save(); location.hash = '#/teams';
    };
  };
  render();
}

/* ============================================================
   NEW / EDIT MATCH
   ============================================================ */
function squadForm(t, m) {
  const players = [...t.players].sort((a, b) => (+a.number || 999) - (+b.number || 999));
  return players.map(p => {
    const inSquad = m ? (p.id in m.squad) : true;
    const pos = m && m.squad[p.id] ? m.squad[p.id] : p.pos;
    return `<div class="squad-row" data-id="${p.id}">
      <input type="checkbox" ${inSquad ? 'checked' : ''} aria-label="In squad">
      <span>${esc(playerName(p))}</span>
      <select>${posOptions(pos)}</select>
    </div>`;
  }).join('');
}
function readSquad() {
  const squad = {};
  $$('.squad-row').forEach(r => { if ($('input', r).checked) squad[r.dataset.id] = $('select', r).value; });
  return squad;
}

function viewNewMatch(teamId) {
  if (!db.teams.length) { location.hash = '#/teams'; return; }
  const t = team(teamId) || db.teams[0];
  setChrome({ title: 'New match', back: '#/matches', tab: 'matches' });
  app.innerHTML = `
    <form id="mf" class="stack">
      <div class="card stack">
        <label class="field"><span>Your team</span>
          <select name="team">${db.teams.map(x => `<option value="${x.id}" ${x.id === t.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
        <div class="grid2">
          <label class="field"><span>Opponent</span><input name="opp" placeholder="e.g. Sheffield" required maxlength="60"></label>
          <label class="field"><span>Date</span><input name="date" type="date" value="${today()}" required></label>
        </div>
        <label class="field"><span>Competition (optional)</span><input name="comp" placeholder="e.g. NVL Division 2" maxlength="60"></label>
      </div>
      <h2>Squad &amp; positions for this match</h2>
      <div class="card">
        ${t.players.length ? `<p class="small muted" style="margin-top:0">Untick anyone not playing. Change a position if someone plays a different role today.</p>${squadForm(t)}`
          : `<p>This team has no players yet. <a href="#/team/${t.id}">Add players first</a>.</p>`}
      </div>
      <button class="btn primary block" ${t.players.length ? '' : 'disabled'}>Create match &amp; start tagging</button>
    </form>`;
  $('[name=team]').onchange = e => { location.hash = '#/new-match/' + e.target.value; };
  $('#mf').onsubmit = e => {
    e.preventDefault();
    const f = e.target;
    const squad = readSquad();
    if (!Object.keys(squad).length) { toast('Pick at least one player'); return; }
    const m = { id: uid(), teamId: t.id, opponent: f.opp.value.trim(), date: f.date.value, competition: f.comp.value.trim(), squad, events: [], created: Date.now() };
    db.matches.push(m); save();
    location.hash = '#/match/' + m.id + '/tag';
  };
}

function viewEditMatch(id) {
  const m = match(id); if (!m) { location.hash = '#/matches'; return; }
  const t = team(m.teamId);
  setChrome({ title: 'Edit match', back: '#/match/' + id + '/tag', tab: 'matches', tabs: false });
  app.innerHTML = `
    <form id="mf" class="stack">
      <div class="card stack">
        <div class="grid2">
          <label class="field"><span>Opponent</span><input name="opp" value="${esc(m.opponent)}" required maxlength="60"></label>
          <label class="field"><span>Date</span><input name="date" type="date" value="${esc(m.date)}" required></label>
        </div>
        <label class="field"><span>Competition (optional)</span><input name="comp" value="${esc(m.competition)}" maxlength="60"></label>
      </div>
      <h2>Squad &amp; positions</h2>
      <div class="card">${t ? squadForm(t, m) : ''}
        <p class="small muted">Changing a position here also updates it on events you've already tagged in this match.</p></div>
      <button class="btn primary block">Save</button>
      <button type="button" class="btn danger block" id="delM">Delete match</button>
    </form>`;
  $('#mf').onsubmit = e => {
    e.preventDefault();
    const f = e.target;
    m.opponent = f.opp.value.trim(); m.date = f.date.value; m.competition = f.comp.value.trim();
    const squad = readSquad();
    // keep players who already have events, even if unticked
    m.events.forEach(ev => { if (!(ev.playerId in squad) && m.squad[ev.playerId]) squad[ev.playerId] = m.squad[ev.playerId]; });
    m.squad = squad;
    m.events.forEach(ev => { if (squad[ev.playerId]) ev.pos = squad[ev.playerId]; });
    save(); toast('Saved'); location.hash = '#/match/' + m.id + '/tag';
  };
  $('#delM').onclick = () => {
    if (!confirmDo('Delete this match and all its tagged stats?')) return;
    db.matches = db.matches.filter(x => x !== m); save(); location.hash = '#/matches';
  };
}

/* ============================================================
   TAGGING
   ============================================================ */
const videoUrls = {}; // matchId -> object URL (kept while the app is open)

function viewTag(id) {
  const m = match(id); if (!m) { location.hash = '#/matches'; return; }
  const t = team(m.teamId) || { name: 'Team', players: [] };
  setChrome({
    title: `vs ${m.opponent || 'Opponent'}`, back: '#/matches', tab: 'matches', tabs: false,
    right: `<a class="nav-action text" href="#/match/${m.id}/clips">Clips</a><a class="nav-action text" href="#/match/${m.id}/stats">Stats</a>`
  });
  let curSet = m.lastSet || 1;
  let selected = null;
  const squadPlayers = () => Object.keys(m.squad)
    .map(pid => ({ p: t.players.find(x => x.id === pid), pid, pos: m.squad[pid] }))
    .filter(x => x.p)
    .sort((a, b) => (+a.p.number || 999) - (+b.p.number || 999));

  app.innerHTML = `
    <div class="tag-layout">
      <div>
        <div id="videoBox"></div>
        <div class="card" style="margin-top:12px">
          <div class="row spread" style="margin-bottom:10px">
            <div class="setbar" id="setbar"></div>
            <a class="btn sm" href="#/match/${m.id}/edit">Squad</a>
          </div>
          <div class="players" id="players"></div>
        </div>
      </div>
      <div class="tag-side">
        <div id="gradePanel"></div>
        <div class="card">
          <div class="row spread"><h3 style="margin:0">Tagged actions <span class="pill" id="evCount"></span></h3>
            <button class="btn sm" id="undo">Undo last</button></div>
          <div class="events" id="events"></div>
        </div>
      </div>
    </div>`;

  /* --- video --- */
  const vbox = $('#videoBox');
  let video = null;
  function renderVideo() {
    const url = videoUrls[m.id];
    if (!url) {
      vbox.innerHTML = `
        <label class="video-pick card" style="display:block;cursor:pointer">
          <div style="font-size:32px">&#127909;</div>
          <b>Load match video</b>
          <div class="small muted">${m.videoName ? `Last used: ${esc(m.videoName)}. Pick it again to watch along.` : 'Optional. Each tag is linked to the moment in the video so you can jump back to it.'}</div>
          <input type="file" accept="video/*" id="vfile" hidden>
        </label>`;
      $('#vfile').onchange = e => {
        const file = e.target.files[0]; if (!file) return;
        videoUrls[m.id] = URL.createObjectURL(file);
        m.videoName = file.name; save();
        renderVideo();
      };
      video = null;
      return;
    }
    vbox.innerHTML = `
      <div class="video-wrap">
        <video id="vid" src="${url}" playsinline preload="metadata"></video>
        <div class="vctrl">
          <button class="btn" data-skip="-10">&#8634; 10</button>
          <button class="btn" data-skip="-3">&#8634; 3</button>
          <button class="btn" id="pp">&#9654; Play</button>
          <button class="btn" data-skip="3">3 &#8635;</button>
          <button class="btn" data-skip="10">10 &#8635;</button>
          <button class="btn" id="spd">1x</button>
          <span class="time" id="vtime">0:00</span>
        </div>
      </div>
      <div class="row small muted" style="margin-top:6px"><span class="grow">${esc(m.videoName || '')}</span>
        <button class="btn sm" id="vchange">Change video</button></div>`;
    video = $('#vid');
    if (m.videoPos) video.currentTime = m.videoPos;
    const pp = $('#pp');
    const upd = () => { pp.innerHTML = video.paused ? '&#9654; Play' : '&#10074;&#10074; Pause'; };
    video.addEventListener('play', upd); video.addEventListener('pause', upd);
    video.addEventListener('timeupdate', () => { $('#vtime').textContent = fmtTime(video.currentTime) + ' / ' + fmtTime(video.duration); });
    video.addEventListener('pause', () => { m.videoPos = video.currentTime; save(); });
    video.addEventListener('click', () => video.paused ? video.play() : video.pause());
    pp.onclick = () => video.paused ? video.play() : video.pause();
    $$('[data-skip]', vbox).forEach(b => b.onclick = () => { video.currentTime = Math.max(0, video.currentTime + +b.dataset.skip); });
    const speeds = [1, 1.5, 2, 0.5];
    $('#spd').onclick = e => { const i = (speeds.indexOf(video.playbackRate) + 1) % speeds.length; video.playbackRate = speeds[i]; e.target.textContent = speeds[i] + 'x'; };
    $('#vchange').onclick = () => { URL.revokeObjectURL(videoUrls[m.id]); delete videoUrls[m.id]; renderVideo(); };
  }
  renderVideo();

  /* --- sets --- */
  function renderSets() {
    $('#setbar').innerHTML = '<span class="small muted">Set</span>' + [1, 2, 3, 4, 5].map(s => `<button data-s="${s}" class="${s === curSet ? 'on' : ''}">${s}</button>`).join('');
    $$('#setbar button').forEach(b => b.onclick = () => { curSet = +b.dataset.s; m.lastSet = curSet; save(); renderSets(); });
  }
  renderSets();

  /* --- players --- */
  function renderPlayers() {
    const list = squadPlayers();
    $('#players').innerHTML = list.length ? list.map(({ p, pid, pos }) => {
      const r = m.events.filter(e => e.playerId === pid && e.type === 'receive').length;
      const s = m.events.filter(e => e.playerId === pid && e.type === 'serve').length;
      return `<button class="pbtn ${selected === pid ? 'sel' : ''}" data-pid="${pid}">
        <span class="pill ps">${esc(pos)}</span>
        <span class="n">${esc(p.number || '–')}</span>
        <span class="nm">${esc(p.name)}</span>
        <span class="cnt">R ${r} · S ${s}</span>
      </button>`;
    }).join('') : `<p class="muted">No players in the squad. <a href="#/match/${m.id}/edit">Edit squad</a>.</p>`;
    $$('#players .pbtn').forEach(b => b.onclick = () => {
      selected = selected === b.dataset.pid ? null : b.dataset.pid;
      renderPlayers(); renderGrades();
      if (selected && window.innerWidth < 900) $('#gradePanel').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  /* --- grade panel --- */
  function gradeButtons(type, grades) {
    return `<div class="grades">${grades.map(g => `<button class="gbtn g${g.g}" data-type="${type}" data-g="${g.g}"><b>${g.label}</b><small>${g.desc}</small></button>`).join('')}</div>`;
  }
  function renderGrades() {
    const gp = $('#gradePanel');
    if (!selected) {
      gp.innerHTML = `<div class="card small muted">Tap a player, then tap the grade for their <b>serve receive</b> or <b>serve</b>.${video ? ' The current video time is saved with every tag.' : ''}</div>`;
      return;
    }
    const p = t.players.find(x => x.id === selected);
    gp.innerHTML = `<div class="card grade-panel">
      <div class="row spread"><h3>${esc(playerName(p))} <span class="pill">${esc(m.squad[selected])}</span></h3>
        <button class="btn sm" id="cancelSel">Cancel</button></div>
      <div class="small muted" style="margin-bottom:6px">Serve receive</div>
      ${gradeButtons('receive', RECEIVE_GRADES)}
      <div class="small muted" style="margin-bottom:6px">Serve</div>
      ${gradeButtons('serve', SERVE_GRADES)}
    </div>`;
    $('#cancelSel').onclick = () => { selected = null; renderPlayers(); renderGrades(); };
    $$('.gbtn', gp).forEach(b => b.onclick = () => addEvent(b.dataset.type, +b.dataset.g));
  }

  function addEvent(type, g) {
    const ev = { id: uid(), playerId: selected, pos: m.squad[selected], type, grade: g, set: curSet, t: video ? +video.currentTime.toFixed(1) : null, ts: Date.now() };
    m.events.push(ev); save();
    const p = t.players.find(x => x.id === selected);
    const gl = (type === 'serve' ? SERVE_GRADES : RECEIVE_GRADES).find(x => x.g === g).label;
    toast(`${playerName(p)} · ${TYPE_LABEL[type]} ${gl}`);
    if (navigator.vibrate) navigator.vibrate(15);
    selected = null;
    renderPlayers(); renderGrades(); renderEvents();
  }

  /* --- events --- */
  function renderEvents() {
    const evs = [...m.events].sort((a, b) => b.ts - a.ts);
    $('#evCount').textContent = evs.length;
    $('#events').innerHTML = evs.length ? evs.map(e => {
      const p = t.players.find(x => x.id === e.playerId);
      const gl = (e.type === 'serve' ? SERVE_GRADES : RECEIVE_GRADES).find(x => x.g === e.grade)?.label ?? e.grade;
      return `<div class="ev">
        <button class="btn sm tbtn" data-seek="${e.t ?? ''}" ${e.t == null || !video ? 'disabled' : ''} title="Jump to this moment">S${e.set} · ${fmtTime(e.t)}</button>
        <span>${esc(playerName(p))} <span class="muted small">${TYPE_LABEL[e.type]}</span></span>
        <span class="gchip g${e.grade}">${esc(gl)}</span>
        <button class="xbtn" data-del="${e.id}" title="Delete">&times;</button>
      </div>`;
    }).join('') : '<p class="muted small">Nothing tagged yet.</p>';
    $$('#events [data-seek]').forEach(b => b.onclick = () => { if (!video) return; video.currentTime = Math.max(0, +b.dataset.seek - 4); video.play(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    $$('#events [data-del]').forEach(b => b.onclick = () => {
      m.events = m.events.filter(e => e.id !== b.dataset.del); save(); renderEvents(); renderPlayers();
    });
  }
  $('#undo').onclick = () => {
    if (!m.events.length) return;
    const last = m.events.reduce((a, b) => (b.ts > a.ts ? b : a));
    m.events = m.events.filter(e => e !== last); save();
    toast('Removed last tag'); renderEvents(); renderPlayers();
  };

  /* --- keyboard shortcuts (laptop) --- */
  const onKey = e => {
    if (!video || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (e.code === 'Space') { e.preventDefault(); video.paused ? video.play() : video.pause(); }
    else if (e.code === 'ArrowLeft') { video.currentTime = Math.max(0, video.currentTime - 3); }
    else if (e.code === 'ArrowRight') { video.currentTime += 3; }
  };
  document.addEventListener('keydown', onKey);
  cleanup = () => {
    document.removeEventListener('keydown', onKey);
    if (video) { m.videoPos = video.currentTime; video.pause(); save(); }
  };

  renderPlayers(); renderGrades(); renderEvents();
}

/* ============================================================
   STATS
   ============================================================ */
function emptyLine() { return { n: 0, sum: 0, c: [0, 0, 0, 0] }; }
function addTo(line, g) { line.n++; line.sum += g; line.c[g]++; }

function computeStats(events) {
  const byPlayer = {}, byPos = {}, total = { receive: emptyLine(), serve: emptyLine() };
  for (const e of events) {
    byPlayer[e.playerId] ??= { receive: emptyLine(), serve: emptyLine(), pos: {} };
    byPlayer[e.playerId].pos[e.pos] = (byPlayer[e.playerId].pos[e.pos] || 0) + 1;
    addTo(byPlayer[e.playerId][e.type], e.grade);
    byPos[e.pos] ??= { receive: emptyLine(), serve: emptyLine() };
    addTo(byPos[e.pos][e.type], e.grade);
    addTo(total[e.type], e.grade);
  }
  return { byPlayer, byPos, total };
}
const mainPos = posCounts => Object.entries(posCounts).sort((a, b) => b[1] - a[1]).map(x => x[0]).join('/');

function recQuality(v) { return v == null ? '' : v >= 2.2 ? 'q-good' : v >= 1.8 ? 'q-ok' : 'q-bad'; }
function srvQuality(v) { return v == null ? '' : v >= 1.6 ? 'q-good' : v >= 1.2 ? 'q-ok' : 'q-bad'; }

function distBar(c, n) {
  if (!n) return '<div class="dist"></div>';
  return `<div class="dist" title="3: ${c[3]} · 2: ${c[2]} · 1: ${c[1]} · 0: ${c[0]}">${[3, 2, 1, 0].map(g => c[g] ? `<span style="width:${c[g] / n * 100}%;background:var(--g${g})"></span>` : '').join('')}</div>`;
}
const legendHTML = (labels) => `<div class="legend">${[3, 2, 1, 0].map((g, i) => `<span><i style="background:var(--g${g})"></i>${labels[i]}</span>`).join('')}</div>`;

function receiveRow(label, pos, L) {
  const a = avg(L.sum, L.n);
  return `<td>${label}</td><td>${pos}</td><td>${L.n}</td><td class="${recQuality(a)}">${f2(a)}</td>
    <td>${pct(L.c[3], L.n)}</td><td>${pct(L.c[3] + L.c[2], L.n)}</td><td>${pct(L.c[0], L.n)}</td>
    <td>${L.c[3]}</td><td>${L.c[2]}</td><td>${L.c[1]}</td><td>${L.c[0]}</td><td>${distBar(L.c, L.n)}</td>`;
}
function serveRow(label, pos, L) {
  const a = avg(L.sum, L.n);
  return `<td>${label}</td><td>${pos}</td><td>${L.n}</td><td class="${srvQuality(a)}">${f2(a)}</td>
    <td>${L.c[3]}</td><td>${L.c[0]}</td><td>${pct(L.c[3], L.n)}</td><td>${pct(L.c[0], L.n)}</td><td>${pct(L.n - L.c[0], L.n)}</td>
    <td>${L.c[2]}</td><td>${L.c[1]}</td><td>${distBar(L.c, L.n)}</td>`;
}
const RECV_HEAD = '<tr><th>Player</th><th>Pos</th><th>Att</th><th>Avg</th><th>Perfect %</th><th>Good+ %</th><th>Error %</th><th>3s</th><th>2s</th><th>1s</th><th>0s</th><th>Spread</th></tr>';
const SERV_HEAD = '<tr><th>Player</th><th>Pos</th><th>Att</th><th>Avg</th><th>Aces</th><th>Errors</th><th>Ace %</th><th>Error %</th><th>In %</th><th>2s</th><th>1s</th><th>Spread</th></tr>';

function statsHTML(events, players) {
  if (!events.length) return '<div class="card empty"><p>No tagged actions here yet.</p></div>';
  const S = computeStats(events);
  const pl = id => players.find(p => p.id === id);
  const ids = Object.keys(S.byPlayer).sort((a, b) => (+pl(a)?.number || 999) - (+pl(b)?.number || 999));
  const rIds = ids.filter(id => S.byPlayer[id].receive.n), sIds = ids.filter(id => S.byPlayer[id].serve.n);
  const R = S.total.receive, V = S.total.serve;
  const posOrder = POSITIONS.map(p => p.code).filter(c => S.byPos[c]);
  // player name links to their profile page
  const nameCell = id => pl(id) ? `<a href="#/player/${id}">${esc(playerName(pl(id)))}</a>` : esc(playerName(null));

  return `
    ${tilesHTML(events)}

    <div class="card">
      <h3 style="margin-top:0">Serve receive (0–3)</h3>
      ${rIds.length ? `<div class="table-wrap"><table>
        <thead>${RECV_HEAD}</thead>
        <tbody>${rIds.map(id => `<tr>${receiveRow(nameCell(id), esc(mainPos(S.byPlayer[id].pos)), S.byPlayer[id].receive)}</tr>`).join('')}
        <tr class="total">${receiveRow('Team', '', R)}</tr></tbody></table></div>
        ${legendHTML(['3 Perfect', '2 Good', '1 Poor', '0 Aced/error'])}` : '<p class="muted small">No serve receives tagged.</p>'}
    </div>

    <div class="card">
      <h3 style="margin-top:0">Serving</h3>
      ${sIds.length ? `<div class="table-wrap"><table>
        <thead>${SERV_HEAD}</thead>
        <tbody>${sIds.map(id => `<tr>${serveRow(nameCell(id), esc(mainPos(S.byPlayer[id].pos)), S.byPlayer[id].serve)}</tr>`).join('')}
        <tr class="total">${serveRow('Team', '', V)}</tr></tbody></table></div>
        ${legendHTML(['Ace', '2 Tough', '1 Easy', 'Error'])}` : '<p class="muted small">No serves tagged.</p>'}
    </div>

    <div class="card">
      <h3 style="margin-top:0">By position</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>Position</th><th>Receive att</th><th>Pass avg</th><th>Perfect %</th><th>Aced %</th><th>Serve att</th><th>Serve avg</th><th>Aces</th><th>Errors</th></tr></thead>
        <tbody>${posOrder.map(c => {
          const r = S.byPos[c].receive, s = S.byPos[c].serve, ra = avg(r.sum, r.n), sa = avg(s.sum, s.n);
          return `<tr><td><b>${c}</b> <span class="muted small">${esc(POS_NAME[c] || '')}</span></td>
            <td>${r.n}</td><td class="${recQuality(ra)}">${f2(ra)}</td><td>${pct(r.c[3], r.n)}</td><td>${pct(r.c[0], r.n)}</td>
            <td>${s.n}</td><td class="${srvQuality(sa)}">${f2(sa)}</td><td>${s.c[3]}</td><td>${s.c[0]}</td></tr>`;
        }).join('')}</tbody></table></div>
    </div>`;
}

function setsSeg(evs, cur, base) {
  const sets = [...new Set(evs.map(e => e.set))].sort();
  if (sets.length < 2) return '';
  return `<div class="seg" style="margin-bottom:12px">
    <button class="${cur ? '' : 'on'}" data-href="${base}">All sets</button>
    ${sets.map(s => `<button class="${cur === s ? 'on' : ''}" data-href="${base}/${s}">Set ${s}</button>`).join('')}</div>`;
}

let matchStatsSet = null;
function viewMatchStats(id) {
  const m = match(id); if (!m) { location.hash = '#/matches'; return; }
  const t = team(m.teamId) || { name: 'Team', players: [] };
  setChrome({ title: `Stats vs ${m.opponent || 'Opponent'}`, back: '#/match/' + id + '/tag', tab: 'matches', tabs: false });
  const render = () => {
    const evs = matchStatsSet ? m.events.filter(e => e.set === matchStatsSet) : m.events;
    const sub = `${fmtDate(m.date)}${m.competition ? ' · ' + m.competition : ''}${matchStatsSet ? ' · Set ' + matchStatsSet : ''}`;
    app.innerHTML = `
      <div class="small muted" style="margin:0 4px 10px">${esc(t.name)} vs ${esc(m.opponent)} · ${esc(sub)}</div>
      <div class="row" style="margin-bottom:14px">
        <a class="btn sm" href="#/match/${m.id}/clips">&#9654; Watch clips</a>
        <button class="btn sm" id="share" ${evs.length ? '' : 'disabled'}>Share report</button>
        <button class="btn sm" id="csv">Export CSV</button>
      </div>
      <div id="segWrap">${setsSeg(m.events, matchStatsSet, '')}</div>
      ${evs.length ? targetsHTML(team(m.teamId), evs) : ''}
      ${statsHTML(evs, t.players)}`;
    $$('#segWrap [data-href]').forEach(b => b.onclick = () => { matchStatsSet = b.dataset.href ? +b.dataset.href.slice(1) : null; render(); });
    $('#csv').onclick = () => exportCSV(`${t.name} vs ${m.opponent} ${m.date}${matchStatsSet ? ' set ' + matchStatsSet : ''}`, evs, t.players);
    $('#share').onclick = () => showReport(`${t.name} vs ${m.opponent} ${m.date}`, drawReport({
      title: `${t.name} vs ${m.opponent || 'Opponent'}`, subtitle: sub,
      tiles: tileData(evs), targets: evalTargets(team(m.teamId), evs),
      tables: [{ title: 'Players', head: PLAYER_REPORT_HEAD, rows: playerReportRows(evs, t.players) }],
    }));
  };
  matchStatsSet = null;
  render();
}

function viewSeason(teamId) {
  setChrome({ title: 'Season', tab: 'season', large: true });
  if (!db.teams.length) { app.innerHTML = '<div class="card empty"><p>Add a team and tag a match to see season stats.</p><a class="btn primary" href="#/teams">Add team</a></div>'; return; }
  const t = team(teamId) || db.teams[0];
  const ms = db.matches.filter(m => m.teamId === t.id).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const evs = ms.flatMap(m => m.events);
  const sub = `${ms.length} match${ms.length === 1 ? '' : 'es'}${ms.length ? ' · ' + fmtDate(ms[0].date) + (ms.length > 1 ? ' – ' + fmtDate(ms[ms.length - 1].date) : '') : ''}`;
  app.innerHTML = `
    <div class="card stack">
      <label class="field"><span>Team</span>
        <select id="teamSel">${db.teams.map(x => `<option value="${x.id}" ${x.id === t.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
      <div class="row">
        <button class="btn sm" id="share" ${evs.length ? '' : 'disabled'}>Share report</button>
        <button class="btn sm" id="csv">Export CSV</button>
      </div>
    </div>
    <p class="small muted">${ms.length} match${ms.length === 1 ? '' : 'es'} · all tagged actions combined</p>
    ${evs.length ? targetsHTML(t, evs, 'Season targets') : ''}
    ${statsHTML(evs, t.players)}
    ${ms.length > 1 ? trendHTML(ms, t) : ''}`;
  $('#teamSel').onchange = e => { location.hash = '#/season/' + e.target.value; };
  $('#csv').onclick = () => exportCSV(`${t.name} season`, evs, t.players);
  $('#share').onclick = () => showReport(`${t.name} season`, drawReport({
    title: `${t.name} · Season`, subtitle: sub,
    tiles: tileData(evs), targets: evalTargets(t, evs),
    tables: [
      { title: 'Players', head: PLAYER_REPORT_HEAD, rows: playerReportRows(evs, t.players) },
      ...(ms.length > 1 ? [{ title: 'Match by match', head: MATCH_REPORT_HEAD, rows: ms.map(m => matchReportRow(m, m.events)) }] : []),
    ],
  }));
}

function trendHTML(ms, t) {
  const hasTargets = TARGETS.some(d => t && t.targets && t.targets[d.key] != null);
  return `<div class="card"><h3 style="margin-top:0">Match by match</h3>
    <div class="table-wrap"><table>
      <thead><tr><th>Match</th><th>Date</th>${hasTargets ? '<th>Targets</th>' : ''}<th>Receives</th><th>Pass avg</th><th>Aced %</th><th>Serves</th><th>Serve avg</th><th>Aces</th><th>Errors</th></tr></thead>
      <tbody>${ms.map(m => {
        const S = computeStats(m.events), r = S.total.receive, s = S.total.serve, ra = avg(r.sum, r.n), sa = avg(s.sum, s.n);
        const tg = targetsSummary(evalTargets(t, m.events));
        const tgCell = hasTargets ? `<td class="${tg.total ? (tg.met === tg.total ? 'q-good' : 'q-bad') : ''}">${tg.total ? `${tg.met}/${tg.total}${tg.met === tg.total ? ' ✓' : ''}` : '–'}</td>` : '';
        return `<tr><td><a href="#/match/${m.id}/stats">vs ${esc(m.opponent)}</a></td><td>${fmtDate(m.date)}</td>${tgCell}
          <td>${r.n}</td><td class="${recQuality(ra)}">${f2(ra)}</td><td>${pct(r.c[0], r.n)}</td>
          <td>${s.n}</td><td class="${srvQuality(sa)}">${f2(sa)}</td><td>${s.c[3]}</td><td>${s.c[0]}</td></tr>`;
      }).join('')}</tbody></table></div></div>`;
}

/* ============================================================
   SHARED STAT PIECES (tiles, targets, trends)
   ============================================================ */
const qName = cls => cls === 'q-good' ? 'good' : cls === 'q-ok' ? 'ok' : cls === 'q-bad' ? 'bad' : '';
const sharePct = (L, g) => L.n ? L.c[g] / L.n * 100 : null;

// The six summary numbers, used on screen and in the shared report image.
function tileData(events) {
  const S = computeStats(events), R = S.total.receive, V = S.total.serve;
  const ra = avg(R.sum, R.n), sa = avg(V.sum, V.n);
  return [
    { k: 'Pass average', v: f2(ra), s: `${R.n} serve receives`, q: qName(recQuality(ra)) },
    { k: 'Perfect passes', v: pct(R.c[3], R.n), s: `${R.c[3]} graded 3` },
    { k: 'Aced', v: pct(R.c[0], R.n), s: `${R.c[0]} graded 0` },
    { k: 'Serve average', v: f2(sa), s: `${V.n} serves`, q: qName(srvQuality(sa)) },
    { k: 'Aces', v: String(V.c[3]), s: `${pct(V.c[3], V.n)} of serves` },
    { k: 'Serve errors', v: String(V.c[0]), s: `${pct(V.c[0], V.n)} of serves` },
  ];
}
function tilesHTML(events) {
  return `<div class="tiles">${tileData(events).map(x => `
    <div class="tile"><div class="k">${x.k}</div><div class="v ${x.q ? 'q-' + x.q : ''}">${x.v}</div><div class="s">${x.s}</div></div>`).join('')}</div>`;
}

// Team targets: saved per team as team.targets = { passAvg: 2.2, serveErrPct: 10, ... } (all optional).
const TARGETS = [
  { key: 'passAvg', label: 'Pass average', dir: 'min', kind: 'avg', ph: '2.20', calc: S => avg(S.total.receive.sum, S.total.receive.n) },
  { key: 'perfectPct', label: 'Perfect passes', dir: 'min', kind: 'pct', ph: '40', calc: S => sharePct(S.total.receive, 3) },
  { key: 'acedPct', label: 'Aced', dir: 'max', kind: 'pct', ph: '10', calc: S => sharePct(S.total.receive, 0) },
  { key: 'serveAvg', label: 'Serve average', dir: 'min', kind: 'avg', ph: '1.60', calc: S => avg(S.total.serve.sum, S.total.serve.n) },
  { key: 'acePct', label: 'Aces', dir: 'min', kind: 'pct', ph: '8', calc: S => sharePct(S.total.serve, 3) },
  { key: 'serveErrPct', label: 'Serve errors', dir: 'max', kind: 'pct', ph: '10', calc: S => sharePct(S.total.serve, 0) },
];
const fmtTarget = (d, v) => v == null ? '–' : d.kind === 'avg' ? (+v).toFixed(2) : Math.round(v) + '%';
function evalTargets(t, events) {
  const goals = (t && t.targets) || {};
  const set = TARGETS.filter(d => goals[d.key] != null);
  if (!set.length) return [];
  const S = computeStats(events);
  return set.map(d => {
    const raw = d.calc(S), goal = goals[d.key];
    // compare the numbers as shown on screen, so "10%" vs a 10% goal never looks wrong
    const v = raw == null ? null : d.kind === 'avg' ? Math.round(raw * 100) / 100 : Math.round(raw);
    return { d, goal, v, ok: v == null ? null : d.dir === 'min' ? v >= goal : v <= goal };
  });
}
function targetsSummary(rows) {
  const judged = rows.filter(r => r.ok != null);
  return { met: judged.filter(r => r.ok).length, total: judged.length };
}
function targetsHTML(t, events, title = 'Targets') {
  const rows = evalTargets(t, events);
  if (!rows.length) return t ? `<div class="card small muted">No team targets yet. <a href="#/team/${t.id}">Set targets</a> to get a &#10003; or &#10007; for every match.</div>` : '';
  const { met, total } = targetsSummary(rows);
  return `<div class="card">
    <div class="row spread" style="margin-bottom:4px"><h3 style="margin:0">${title}</h3>
      <span class="pill">${met} of ${total} met</span></div>
    ${rows.map(r => `<div class="target-row">
      <span>${esc(r.d.label)}</span>
      <span class="muted small">goal ${r.d.dir === 'min' ? '&ge;' : '&le;'} ${fmtTarget(r.d, r.goal)}</span>
      <span class="num">${fmtTarget(r.d, r.v)}</span>
      <span class="tmark ${r.ok == null ? '' : r.ok ? 'yes' : 'no'}">${r.ok == null ? '–' : r.ok ? '&#10003;' : '&#10007;'}</span>
    </div>`).join('')}
  </div>`;
}

// Is a player's passing/serving going up or down? Recent matches vs the earlier ones.
function trendFor(ms, pid, type) {
  const lines = ms.map(m => { const L = emptyLine(); m.events.forEach(e => { if (e.playerId === pid && e.type === type) addTo(L, e.grade); }); return L; }).filter(L => L.n);
  if (lines.length < 2) return null;
  const k = Math.min(3, Math.floor(lines.length / 2));
  const pool = arr => arr.reduce((a, L) => ({ sum: a.sum + L.sum, n: a.n + L.n }), { sum: 0, n: 0 });
  const r = pool(lines.slice(-k)), b = pool(lines.slice(0, -k));
  const recent = r.sum / r.n, before = b.sum / b.n, d = recent - before;
  const dir = Math.abs(d) < 0.1 ? 0 : d > 0 ? 1 : -1;
  return {
    recent, before, k, dir,
    word: dir > 0 ? '↑ Going up' : dir < 0 ? '↓ Going down' : '→ About the same',
    q: dir > 0 ? 'good' : dir < 0 ? 'bad' : '',
    detail: `last ${k === 1 ? 'match' : k + ' matches'} ${recent.toFixed(2)} · before ${before.toFixed(2)}`,
  };
}

/* ============================================================
   PLAYER PROFILE
   ============================================================ */
function viewPlayer(pid) {
  const t = db.teams.find(x => x.players.some(p => p.id === pid));
  if (!t) { location.hash = '#/teams'; return; }
  const p = t.players.find(x => x.id === pid);
  setChrome({ title: p.name, back: '@back:#/team/' + t.id, tab: 'season' });
  const ms = db.matches.filter(m => m.teamId === t.id && m.events.some(e => e.playerId === pid))
    .sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.created - b.created);
  const mine = m => m.events.filter(e => e.playerId === pid);
  const evs = ms.flatMap(mine);
  const trends = [['Passing', trendFor(ms, pid, 'receive')], ['Serving', trendFor(ms, pid, 'serve')]];

  app.innerHTML = `
    <div class="card player-head">
      <div class="pnum">${esc(p.number || '–')}</div>
      <div class="grow"><div class="pname">${esc(p.name)}</div>
        <div class="small muted">${esc(POS_NAME[p.pos] || p.pos)} · ${esc(t.name)} · ${ms.length} match${ms.length === 1 ? '' : 'es'}</div></div>
      <button class="btn sm" id="share" ${evs.length ? '' : 'disabled'}>Share</button>
    </div>
    ${!evs.length ? `<div class="card empty"><p>No tagged actions for ${esc(p.name)} yet. Tag a match and their stats will show up here.</p></div>` : `
    <h2>Trend</h2>
    <div class="card">${trends.map(([label, tr]) => `
      <div class="trend-row"><b>${label}</b>
        ${tr ? `<span><span class="q-${tr.q || 'none'}">${tr.word}</span> <span class="small muted">${tr.detail}</span></span>`
             : '<span class="small muted">Needs 2 matches to show a trend</span>'}
      </div>`).join('')}
    </div>
    <h2>Season</h2>
    ${tilesHTML(evs)}
    <h2>Match by match</h2>
    <div class="card"><div class="table-wrap"><table>
      <thead><tr><th>Match</th><th>Receives</th><th>Pass avg</th><th>Serves</th><th>Serve avg</th><th>Aces</th><th>Errors</th><th></th></tr></thead>
      <tbody>${ms.map(m => {
        const S = computeStats(mine(m)), r = S.total.receive, s = S.total.serve, ra = avg(r.sum, r.n), sa = avg(s.sum, s.n);
        return `<tr><td><a href="#/match/${m.id}/stats">vs ${esc(m.opponent)}</a> <span class="small muted">${fmtDate(m.date)}</span></td>
          <td>${r.n}</td><td class="${recQuality(ra)}">${f2(ra)}</td><td>${s.n}</td><td class="${srvQuality(sa)}">${f2(sa)}</td><td>${s.c[3]}</td><td>${s.c[0]}</td>
          <td><a href="#/match/${m.id}/clips/${pid}">Clips</a></td></tr>`;
      }).join('')}</tbody></table></div></div>`}`;

  if (!evs.length) return;
  $('#share').onclick = () => showReport(`${p.name} report`, drawReport({
    title: playerName(p), subtitle: `${POS_NAME[p.pos] || p.pos} · ${t.name} · ${ms.length} match${ms.length === 1 ? '' : 'es'}`,
    tiles: tileData(evs),
    notes: trends.filter(([, tr]) => tr).map(([label, tr]) => ({ label, text: tr.word, q: tr.q, detail: tr.detail })),
    tables: [{ title: 'Match by match', head: MATCH_REPORT_HEAD, rows: ms.map(m => matchReportRow(m, mine(m))) }],
  }));
}

/* ============================================================
   CLIPS: play tagged moments back to back
   ============================================================ */
const CLIP_LEN = { short: [3, 2], normal: [5, 3], long: [8, 4] }; // seconds before / after the tag
const clipFilters = {}; // remembered per match while the app is open

function viewClips(id, presetPid) {
  const m = match(id); if (!m) { location.hash = '#/matches'; return; }
  const t = team(m.teamId) || { name: 'Team', players: [] };
  setChrome({ title: `Clips vs ${m.opponent || 'Opponent'}`, back: '@back:#/match/' + id + '/tag', tab: 'matches', tabs: false });
  const pl = pid => t.players.find(x => x.id === pid);
  const timed = m.events.filter(e => e.t != null);
  const pids = [...new Set(timed.map(e => e.playerId))].sort((a, b) => (+pl(a)?.number || 999) - (+pl(b)?.number || 999));
  const f = clipFilters[id] ??= { player: 'all', type: 'all', grades: [0, 1, 2, 3], set: 'all', len: 'normal' };
  if (presetPid) f.player = presetPid;
  const gradeLabel = g => f.type === 'serve' ? SERVE_GRADES.find(x => x.g === g).label : String(g);
  const evLabel = e => (e.type === 'serve' ? SERVE_GRADES : RECEIVE_GRADES).find(x => x.g === e.grade)?.label ?? e.grade;

  let video = null, queue = [], qi = -1, auto = false;

  app.innerHTML = `
    <div class="tag-layout">
      <div>
        <div id="cvideo"></div>
        <div class="card clip-now" id="cnow"></div>
      </div>
      <div class="tag-side">
        <div class="card stack" id="cfilters"></div>
        <div class="card"><div class="row spread"><h3 style="margin:0">Clips <span class="pill" id="ccount"></span></h3></div>
          <div class="clips-list" id="clist"></div></div>
      </div>
    </div>`;

  /* --- video --- */
  function renderVideo() {
    const url = videoUrls[m.id], box = $('#cvideo');
    if (!url) {
      box.innerHTML = `
        <label class="video-pick card" style="display:block;cursor:pointer">
          <div style="font-size:32px">&#127909;</div>
          <b>Load match video</b>
          <div class="small muted">${m.videoName ? `Pick <b>${esc(m.videoName)}</b> again to watch the clips.` : 'Pick the video you tagged this match from.'} The video stays on your phone.</div>
          <input type="file" accept="video/*" id="vfile" hidden>
        </label>`;
      $('#vfile').onchange = e => {
        const file = e.target.files[0]; if (!file) return;
        videoUrls[m.id] = URL.createObjectURL(file);
        m.videoName = file.name; save();
        renderVideo(); renderNow();
      };
      video = null;
      return;
    }
    box.innerHTML = `
      <div class="video-wrap">
        <video id="cvid" src="${url}" playsinline preload="metadata"></video>
        <div class="vctrl">
          <button class="btn" id="cprev" aria-label="Previous clip">&#8249; Prev</button>
          <button class="btn" id="cplay">&#9654; Play all</button>
          <button class="btn" id="cnext" aria-label="Next clip">Next &#8250;</button>
          <button class="btn" id="cspd">1x</button>
          <span class="time" id="ctime">0:00</span>
        </div>
      </div>`;
    video = $('#cvid');
    const upd = () => { $('#cplay').innerHTML = !video.paused ? '&#10074;&#10074; Pause' : auto ? '&#9654; Resume' : '&#9654; Play all'; };
    video.addEventListener('play', upd); video.addEventListener('pause', upd);
    video.addEventListener('timeupdate', () => {
      $('#ctime').textContent = fmtTime(video.currentTime) + ' / ' + fmtTime(video.duration);
      if (!auto || qi < 0 || !queue[qi]) return;
      if (video.currentTime >= queue[qi].t + CLIP_LEN[f.len][1]) {
        if (qi < queue.length - 1) playClip(qi + 1);
        else { auto = false; video.pause(); toast('End of playlist'); renderNow(); upd(); }
      }
    });
    video.addEventListener('click', () => video.paused ? video.play() : video.pause());
    $('#cplay').onclick = () => {
      if (!video.paused) video.pause();
      else if (auto && qi >= 0) video.play();
      else playClip(qi >= 0 ? qi : 0);
    };
    $('#cprev').onclick = () => playClip(qi > 0 ? qi - 1 : 0);
    $('#cnext').onclick = () => playClip(qi < queue.length - 1 ? qi + 1 : qi);
    const speeds = [1, 1.5, 2, 0.5];
    $('#cspd').onclick = e => { const i = (speeds.indexOf(video.playbackRate) + 1) % speeds.length; video.playbackRate = speeds[i]; e.target.textContent = speeds[i] + 'x'; };
  }

  function playClip(i) {
    if (!video) { toast('Load the match video first'); return; }
    if (!queue.length) { toast('No clips match these filters'); return; }
    qi = Math.max(0, Math.min(i, queue.length - 1));
    auto = true;
    video.currentTime = Math.max(0, queue[qi].t - CLIP_LEN[f.len][0]);
    video.play();
    renderNow(); markRow();
  }

  /* --- now playing --- */
  function renderNow() {
    const el = $('#cnow');
    if (!timed.length) { el.innerHTML = '<span class="small muted">No tags in this match have a video time yet. Tags only get a time when the video is loaded while you tag.</span>'; return; }
    if (qi < 0 || !queue[qi]) {
      el.innerHTML = `<span class="small muted">${queue.length ? `Tap <b>Play all</b> to watch ${queue.length} clip${queue.length === 1 ? '' : 's'} back to back, or tap any clip below.` : 'No clips match these filters.'}</span>`;
      return;
    }
    const e = queue[qi];
    el.innerHTML = `<div class="row spread"><span><b>Clip ${qi + 1} of ${queue.length}</b> · ${esc(playerName(pl(e.playerId)))}</span>
      <span>${TYPE_LABEL[e.type]} <span class="gchip g${e.grade}">${esc(evLabel(e))}</span></span></div>`;
  }

  /* --- filters --- */
  function renderFilters() {
    const sets = [...new Set(timed.map(e => e.set))].sort();
    $('#cfilters').innerHTML = `
      <label class="field"><span>Player</span>
        <select id="fPlayer"><option value="all">All players</option>
          ${pids.map(pid => `<option value="${pid}" ${f.player === pid ? 'selected' : ''}>${esc(playerName(pl(pid)))}</option>`).join('')}</select></label>
      <div><div class="flabel">Skill</div>
        <div class="seg" id="fType">${[['all', 'All'], ['receive', 'Receive'], ['serve', 'Serve']].map(([v, l]) => `<button data-v="${v}" class="${f.type === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div><div class="flabel">Grades</div>
        <div class="gfilter" id="fGrades">${[3, 2, 1, 0].map(g => `<button class="gchip g${g} ${f.grades.includes(g) ? '' : 'off'}" data-g="${g}" aria-pressed="${f.grades.includes(g)}">${gradeLabel(g)}</button>`).join('')}</div></div>
      <div class="row" style="align-items:flex-end">
        <label class="field grow"><span>Set</span>
          <select id="fSet"><option value="all">All sets</option>${sets.map(s => `<option value="${s}" ${String(f.set) === String(s) ? 'selected' : ''}>Set ${s}</option>`).join('')}</select></label>
        <div><div class="flabel">Clip length</div>
          <div class="seg" id="fLen">${[['short', 'Short'], ['normal', 'Normal'], ['long', 'Long']].map(([v, l]) => `<button data-v="${v}" class="${f.len === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      </div>`;
    $('#fPlayer').onchange = e => { f.player = e.target.value; refresh(); };
    $('#fSet').onchange = e => { f.set = e.target.value; refresh(); };
    $$('#fType button').forEach(b => b.onclick = () => { f.type = b.dataset.v; refresh(true); });
    $$('#fLen button').forEach(b => b.onclick = () => { f.len = b.dataset.v; renderFilters(); });
    $$('#fGrades button').forEach(b => b.onclick = () => {
      const g = +b.dataset.g;
      f.grades = f.grades.includes(g) ? f.grades.filter(x => x !== g) : [...f.grades, g];
      refresh(true);
    });
  }

  /* --- clip list --- */
  function buildQueue() {
    queue = timed.filter(e =>
      (f.player === 'all' || e.playerId === f.player) &&
      (f.type === 'all' || e.type === f.type) &&
      f.grades.includes(e.grade) &&
      (f.set === 'all' || String(e.set) === String(f.set))
    ).sort((a, b) => a.t - b.t);
  }
  function renderList() {
    $('#ccount').textContent = queue.length;
    const missing = m.events.length - timed.length;
    $('#clist').innerHTML = (queue.length ? queue.map((e, i) => `
      <button class="clip-row ${i === qi ? 'on' : ''}" data-i="${i}">
        <span class="ctime">S${e.set} · ${fmtTime(e.t)}</span>
        <span>${esc(playerName(pl(e.playerId)))} <span class="muted small">${TYPE_LABEL[e.type]}</span></span>
        <span class="gchip g${e.grade}">${esc(evLabel(e))}</span>
      </button>`).join('') : `<p class="muted small">${timed.length ? 'No clips match these filters.' : 'Nothing to play yet.'}</p>`)
      + (missing ? `<p class="small muted">${missing} tag${missing === 1 ? ' has' : 's have'} no video time, so ${missing === 1 ? "it isn't" : "they aren't"} in the list.</p>` : '');
    $$('#clist .clip-row').forEach(b => b.onclick = () => playClip(+b.dataset.i));
  }
  function markRow() { $$('#clist .clip-row').forEach(b => b.classList.toggle('on', +b.dataset.i === qi)); }
  function refresh(filtersToo) {
    auto = false; qi = -1;
    if (video) video.pause();
    buildQueue();
    if (filtersToo) renderFilters();
    renderList(); renderNow();
  }

  cleanup = () => { if (video) video.pause(); };
  renderVideo(); buildQueue(); renderFilters(); renderList(); renderNow();
}

/* ============================================================
   SHAREABLE REPORT IMAGE (drawn on a canvas, no libraries)
   ============================================================ */
const PLAYER_REPORT_HEAD = ['Player', 'Rec', 'Pass avg', 'Perfect', 'Serves', 'Srv avg', 'Aces', 'Errors'];
const MATCH_REPORT_HEAD = ['Match', 'Rec', 'Pass avg', 'Perfect', 'Serves', 'Srv avg', 'Aces', 'Errors'];
function statCells(r, s, bold) {
  const ra = avg(r.sum, r.n), sa = avg(s.sum, s.n);
  return [r.n, { t: f2(ra), q: qName(recQuality(ra)), b: bold }, pct(r.c[3], r.n), s.n, { t: f2(sa), q: qName(srvQuality(sa)), b: bold }, s.c[3], s.c[0]];
}
function playerReportRows(events, players) {
  const S = computeStats(events), pl = id => players.find(p => p.id === id);
  const ids = Object.keys(S.byPlayer).sort((a, b) => (+pl(a)?.number || 999) - (+pl(b)?.number || 999));
  return [
    ...ids.map(id => [playerName(pl(id)), ...statCells(S.byPlayer[id].receive, S.byPlayer[id].serve)]),
    [{ t: 'Team', b: true }, ...statCells(S.total.receive, S.total.serve, true)],
  ];
}
function matchReportRow(m, events) {
  const S = computeStats(events);
  return [`vs ${m.opponent || 'Opponent'} · ${fmtDate(m.date)}`, ...statCells(S.total.receive, S.total.serve)];
}

// Read the app's LIGHT colours (reports are always light so they print and share cleanly).
function lightColours(names) {
  const root = document.documentElement, prev = root.dataset.theme;
  root.dataset.theme = 'light';
  const cs = getComputedStyle(root), out = {};
  names.forEach(n => { out[n] = cs.getPropertyValue('--' + n).trim(); });
  if (prev) root.dataset.theme = prev; else delete root.dataset.theme;
  return out;
}

// spec: { title, subtitle, tiles:[{k,v,s,q}], targets?:evalTargets(), notes?:[{label,text,q,detail}], tables:[{title, head, rows}] }
function drawReport(spec) {
  const C = lightColours(['bg', 'card', 'text', 'muted', 'line', 'blue', 'good', 'ok', 'bad']);
  const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, Roboto, sans-serif';
  const font = (w, s) => `${w} ${s}px ${FONT}`;
  const W = 1080, P = 56, IW = W - 2 * P, GAP = 20, TILE_H = 168, ROW = 54, SEC = 60, AFTER = 36;
  const targets = (spec.targets || []), notes = spec.notes || [];

  // work out the height first
  let H = P + 130 + Math.ceil(spec.tiles.length / 3) * (TILE_H + GAP) + 10;
  if (notes.length) H += SEC + notes.length * 64 + 20 + AFTER;
  if (targets.length) H += SEC + targets.length * 58 + 20 + AFTER;
  spec.tables.forEach(tb => { H += SEC + ROW + tb.rows.length * ROW + 16 + AFTER; });
  H += 40 + P;

  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const x = cv.getContext('2d');
  const rr = (X, Y, w, h, r) => { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); };
  const card = (X, Y, w, h) => { x.fillStyle = C.card; rr(X, Y, w, h, 24); x.fill(); };
  const fit = (s, maxW, f) => { s = String(s); x.font = f; if (x.measureText(s).width <= maxW) return s; while (s.length > 1 && x.measureText(s + '…').width > maxW) s = s.slice(0, -1); return s + '…'; };
  const text = (s, X, Y, f, col, align = 'left', maxW) => { x.font = f; x.fillStyle = col; x.textAlign = align; x.fillText(maxW ? fit(s, maxW, f) : String(s), X, Y); };
  const qc = q => q === 'good' ? C.good : q === 'ok' ? C.ok : q === 'bad' ? C.bad : C.text;
  const heading = (s, y) => text(s.toUpperCase(), P + 8, y + 40, font(500, 22), C.muted);

  x.fillStyle = C.bg; x.fillRect(0, 0, W, H);
  let y = P;
  text('VOLLEYSTATS', W - P, y + 22, font(600, 20), C.muted, 'right');
  text(spec.title, P, y + 52, font(700, 52), C.text, 'left', IW - 170);
  text(spec.subtitle, P, y + 98, font(400, 28), C.muted, 'left', IW);
  y += 130;

  // summary tiles, 3 per row
  const TW = (IW - 2 * GAP) / 3;
  spec.tiles.forEach((tl, i) => {
    const cx = P + (i % 3) * (TW + GAP), cy = y + Math.floor(i / 3) * (TILE_H + GAP);
    card(cx, cy, TW, TILE_H);
    text(tl.k, cx + 24, cy + 44, font(500, 24), C.muted, 'left', TW - 48);
    text(tl.v, cx + 24, cy + 110, font(700, 56), qc(tl.q));
    text(tl.s, cx + 24, cy + 146, font(400, 22), C.muted, 'left', TW - 48);
  });
  y += Math.ceil(spec.tiles.length / 3) * (TILE_H + GAP) + 10;

  if (notes.length) {
    heading('Trend', y); y += SEC;
    card(P, y, IW, notes.length * 64 + 20);
    notes.forEach((n, i) => {
      const ry = y + 10 + i * 64;
      if (i) { x.fillStyle = C.line; x.fillRect(P + 24, ry, IW - 48, 1); }
      text(n.label, P + 24, ry + 42, font(600, 28), C.text);
      text(n.text, P + 220, ry + 42, font(700, 28), qc(n.q));
      text(n.detail, W - P - 24, ry + 42, font(400, 24), C.muted, 'right');
    });
    y += notes.length * 64 + 20 + AFTER;
  }

  if (targets.length) {
    const { met, total } = targetsSummary(targets);
    heading(`Targets · ${met} of ${total} met`, y); y += SEC;
    card(P, y, IW, targets.length * 58 + 20);
    targets.forEach((r, i) => {
      const ry = y + 10 + i * 58;
      if (i) { x.fillStyle = C.line; x.fillRect(P + 24, ry, IW - 48, 1); }
      text(r.d.label, P + 24, ry + 40, font(500, 28), C.text);
      text(`goal ${r.d.dir === 'min' ? '≥' : '≤'} ${fmtTarget(r.d, r.goal)}`, P + IW * 0.52, ry + 40, font(400, 24), C.muted, 'right');
      text(fmtTarget(r.d, r.v), P + IW * 0.76, ry + 40, font(700, 28), C.text, 'right');
      text(r.ok == null ? '–' : r.ok ? '✓' : '✗', W - P - 40, ry + 40, font(700, 32), r.ok == null ? C.muted : r.ok ? C.good : C.bad, 'center');
    });
    y += targets.length * 58 + 20 + AFTER;
  }

  spec.tables.forEach(tb => {
    heading(tb.title, y); y += SEC;
    const h = ROW + tb.rows.length * ROW + 16;
    card(P, y, IW, h);
    const n = tb.head.length, firstW = IW * 0.27, colW = (IW - 48 - firstW) / (n - 1);
    const colX = i => i === 0 ? P + 24 : P + 24 + firstW + colW * i;   // right edge for number columns
    tb.head.forEach((hd, i) => text(hd.toUpperCase(), colX(i), y + 38, font(500, 18), C.muted, i ? 'right' : 'left'));
    tb.rows.forEach((row, r) => {
      const ry = y + ROW + r * ROW;
      x.fillStyle = C.line; x.fillRect(P + 24, ry, IW - 48, 1);
      row.forEach((cell, i) => {
        const c = cell && typeof cell === 'object' ? cell : { t: cell };
        const f = font(c.b ? 700 : i === 0 ? 500 : 400, 25);
        text(c.t ?? '', colX(i), ry + 36, f, qc(c.q), i ? 'right' : 'left', i ? undefined : firstW - 12);
      });
    });
    y += h + AFTER;
  });

  text(`Made with VolleyStats · ${fmtDate(today())}`, P, H - P, font(400, 22), C.muted);
  return cv.toDataURL('image/png');
}

// Preview sheet with a Share button (sharing must start from a tap on iPhone).
function showReport(name, dataUrl) {
  $$('.sheet').forEach(s => s.remove());
  const el = document.createElement('div');
  el.className = 'sheet';
  el.innerHTML = `<div class="sheet-card" role="dialog" aria-label="Report preview">
      <div class="row spread"><h3 style="margin:0">Report</h3><button class="btn sm" data-close>Close</button></div>
      <img src="${dataUrl}" alt="Report preview">
      <button class="btn primary block" data-share>Share image</button>
      <p class="small muted" style="margin:0;text-align:center">Send it to players, parents or your team chat.</p>
    </div>`;
  document.body.appendChild(el);
  el.onclick = e => { if (e.target === el || e.target.closest('[data-close]')) el.remove(); };
  $('[data-share]', el).onclick = () => saveFile(name.replace(/[^\w\- ]+/g, '').trim() + '.png', null, 'image/png', dataUrl.split(',')[1]);
}

/* ---------- CSV / files ---------- */
function csvCell(v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function exportCSV(name, events, players) {
  const S = computeStats(events);
  const pl = id => players.find(p => p.id === id);
  const rows = [['Player', 'Number', 'Position',
    'Receive attempts', 'Pass average', 'Perfect %', 'Good+ %', 'Aced %', 'R3', 'R2', 'R1', 'R0',
    'Serve attempts', 'Serve average', 'Aces', 'Serve errors', 'Ace %', 'Serve error %', 'S2', 'S1']];
  const line = (label, num, pos, r, s) => [label, num, pos,
    r.n, avg(r.sum, r.n)?.toFixed(2) ?? '', pct(r.c[3], r.n), pct(r.c[3] + r.c[2], r.n), pct(r.c[0], r.n), r.c[3], r.c[2], r.c[1], r.c[0],
    s.n, avg(s.sum, s.n)?.toFixed(2) ?? '', s.c[3], s.c[0], pct(s.c[3], s.n), pct(s.c[0], s.n), s.c[2], s.c[1]];
  Object.keys(S.byPlayer).forEach(id => {
    const p = pl(id), b = S.byPlayer[id];
    rows.push(line(p ? p.name : 'Removed player', p ? p.number : '', mainPos(b.pos), b.receive, b.serve));
  });
  rows.push(line('TEAM', '', '', S.total.receive, S.total.serve));
  const csv = rows.map(r => r.map(csvCell).join(',')).join('\n');
  saveFile(name.replace(/[^\w\- ]+/g, '').trim() + '.csv', csv, 'text/csv');
}

// Share or download a file. Pass `text` for text files, or `base64` (and text = null) for images.
async function saveFile(filename, text, mime, base64) {
  const cap = window.Capacitor;
  if (cap && cap.isNativePlatform && cap.isNativePlatform() && cap.Plugins.Filesystem && cap.Plugins.Share) {
    try {
      const r = await cap.Plugins.Filesystem.writeFile(base64
        ? { path: filename, data: base64, directory: 'CACHE' }
        : { path: filename, data: text, directory: 'CACHE', encoding: 'utf8' });
      await cap.Plugins.Share.share({ title: filename, files: [r.uri] });
      return;
    } catch (e) { if (!/cancel/i.test(String(e && e.message))) toast('Could not share file'); return; }
  }
  let blob;
  if (base64) {
    const bin = atob(base64), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    blob = new Blob([bytes], { type: mime });
  } else blob = new Blob([text], { type: mime });
  try {
    const file = new File([blob], filename, { type: mime });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
      await navigator.share({ files: [file], title: filename }); return;
    }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('Saved ' + filename);
}

/* ============================================================
   SETTINGS / MORE
   ============================================================ */
function scaleGuideHTML() {
  return `<div class="card"><h3 style="margin-top:0">Grading scales</h3>
    <div class="table-wrap"><table class="scale">
      <thead><tr><th>Grade</th><th>Serve receive</th><th>Serve</th></tr></thead>
      <tbody>
        <tr><td><span class="gchip g3">3</span></td><td><b>Perfect.</b> Setter doesn't move; every attack option is available.</td><td><b>Ace.</b> Direct point.</td></tr>
        <tr><td><span class="gchip g2">2</span></td><td><b>Good.</b> Setter moves a little; still has 2+ hitters.</td><td><b>Tough.</b> Opponent out of system, limited attack.</td></tr>
        <tr><td><span class="gchip g1">1</span></td><td><b>Poor.</b> Only a high ball or free ball is possible.</td><td><b>Easy.</b> Opponent passes well and can run their offence.</td></tr>
        <tr><td><span class="gchip g0">0</span></td><td><b>Aced / error.</b> Point to the server.</td><td><b>Error.</b> Net, out, or foot fault.</td></tr>
      </tbody></table></div>
    <p class="small muted">Pass average colours: green 2.20+, amber 1.80–2.19, red below 1.80. Serve average: green 1.60+, amber 1.20–1.59, red below 1.20.</p>
  </div>`;
}

function viewSettings() {
  setChrome({ title: 'More', tab: 'settings', large: true });
  const nEv = db.matches.reduce((a, m) => a + m.events.length, 0);
  const theme = getTheme();
  const opt = (v, label) => `<button data-theme-opt="${v}" class="${theme === v ? 'on' : ''}" aria-pressed="${theme === v}">
      <span class="sw ${v}"><span></span><i></i></span><span>${label}</span><span class="tick"></span></button>`;
  app.innerHTML = `
    <h2>Appearance</h2>
    <div class="card"><div class="appearance">${opt('light', 'Light')}${opt('dark', 'Dark')}${opt('auto', 'Automatic')}</div>
      <p class="small muted" style="margin:12px 0 0">Automatic follows your phone's light/dark setting.</p></div>
    <h2>Colour theme</h2>
    <div class="card"><div class="palettes">${Object.entries(PALETTES).map(([k, v]) => `
      <button data-palette-opt="${k}" class="${getPalette() === k ? 'on' : ''}" aria-pressed="${getPalette() === k}">
        <span class="dots">${v.dots.map(c => `<i style="background:${c}"></i>`).join('')}</span>
        <span class="pname">${v.name}<span class="tick"></span></span>
      </button>`).join('')}</div></div>
    ${scaleGuideHTML()}
    <div class="card stack">
      <h3 style="margin-top:0">Your data</h3>
      <p class="small muted" style="margin:0">Everything is stored on this device: ${db.teams.length} team(s), ${db.matches.length} match(es), ${nEv} tagged actions. Make a backup now and then, or to move to another device.</p>
      <div class="row">
        <button class="btn" id="backup">Back up data</button>
        <label class="btn">Restore backup<input type="file" accept=".json,application/json" id="restore" hidden></label>
      </div>
      <button class="btn" id="demo">Load demo data</button>
      <button class="btn danger" id="wipe">Delete all data</button>
    </div>
    <div class="card small muted">
      <b>How to tag a match</b>
      <ol>
        <li>Add your team and players under <b>Teams</b>.</li>
        <li>Create a <b>New match</b>, choose who's playing and their positions.</li>
        <li>Load your match video (optional), press play.</li>
        <li>Every serve receive or serve: tap the player, then the grade.</li>
        <li>Switch the <b>Set</b> number at the start of each set.</li>
        <li>Open <b>Stats</b> for the match, or <b>Season</b> for all matches.</li>
        <li>Tap <b>Clips</b> to replay tagged moments back to back, for example all of one player's 0 passes.</li>
        <li>Tap a player's name to see their profile and trend. Set <b>Team targets</b> on the team page.</li>
        <li>Tap <b>Share report</b> to send a one-page summary picture.</li>
      </ol>
      Laptop shortcuts: Space play/pause, &larr; / &rarr; skip 3 seconds.
      <p>VolleyStats v1.1</p>
    </div>`;
  $$('[data-palette-opt]').forEach(b => b.onclick = () => {
    applyPalette(b.dataset.paletteOpt);
    $$('[data-palette-opt]').forEach(x => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
  });
  $$('[data-theme-opt]').forEach(b => b.onclick = () => {
    applyTheme(b.dataset.themeOpt);
    $$('[data-theme-opt]').forEach(x => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
  });
  $('#backup').onclick = () => saveFile(`volleystats-backup-${today()}.json`, JSON.stringify(db, null, 1), 'application/json');
  $('#restore').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then(txt => {
      const d = JSON.parse(txt);
      if (!d || !Array.isArray(d.teams) || !Array.isArray(d.matches)) throw new Error('bad');
      if (!confirmDo('Replace all data on this device with this backup?')) return;
      db = d; save(); toast('Backup restored'); viewSettings();
    }).catch(() => toast('That file is not a VolleyStats backup'));
  };
  $('#demo').onclick = () => {
    if (db.teams.length && !confirmDo('Add a demo team and match alongside your data?')) return;
    addDemo(); toast('Demo data added'); location.hash = '#/season/' + addDemo.lastId;
  };
  $('#wipe').onclick = () => {
    if (!confirmDo('Delete ALL teams, matches and stats on this device?')) return;
    if (!confirmDo('Are you sure? This cannot be undone.')) return;
    db = { teams: [], matches: [] }; save(); toast('All data deleted'); viewSettings();
  };
}

function addDemo() {
  const roster = [['1', 'Amira', 'S'], ['4', 'Beth', 'OH'], ['7', 'Chloe', 'OH'], ['9', 'Dani', 'MB'], ['12', 'Ella', 'MB'], ['14', 'Freya', 'OPP'], ['3', 'Grace', 'L'], ['16', 'Hana', 'DS']];
  const t = { id: uid(), name: 'Demo Volleyball Club', players: roster.map(([number, name, pos]) => ({ id: uid(), number, name, pos })) };
  db.teams.push(t);
  addDemo.lastId = t.id;
  const rnd = w => { let r = Math.random() * w.reduce((a, b) => a + b); for (let i = 0; i < w.length; i++) { if ((r -= w[i]) < 0) return i; } return 0; };
  ['Sheffield', 'Bristol'].forEach((opp, mi) => {
    const m = { id: uid(), teamId: t.id, opponent: opp, date: new Date(Date.now() - (14 - mi * 7) * 864e5).toISOString().slice(0, 10), competition: 'Demo League', squad: {}, events: [], created: Date.now() + mi };
    t.players.forEach(p => { m.squad[p.id] = p.pos; });
    const passers = t.players.filter(p => ['OH', 'L', 'DS'].includes(p.pos));
    const servers = t.players.filter(p => p.pos !== 'L');
    let clock = 30;
    for (let set = 1; set <= 4; set++) {
      for (let i = 0; i < 22; i++) {
        clock += 25 + Math.random() * 20;
        const p = passers[Math.floor(Math.random() * passers.length)];
        const w = p.pos === 'L' ? [1, 2, 5, 6] : [1.5, 3, 5, 3.5];
        m.events.push({ id: uid(), playerId: p.id, pos: p.pos, type: 'receive', grade: rnd(w), set, t: Math.round(clock), ts: Date.now() + set * 1000 + i * 2 });
        clock += 25 + Math.random() * 20;
        const s = servers[Math.floor(Math.random() * servers.length)];
        m.events.push({ id: uid(), playerId: s.id, pos: s.pos, type: 'serve', grade: rnd([1.6, 4, 3, 1]), set, t: Math.round(clock), ts: Date.now() + set * 1000 + i * 2 + 1 });
      }
    }
    db.matches.push(m);
  });
  save();
}

/* ---------- boot ---------- */
route();
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost') && !(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
