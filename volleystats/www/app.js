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
  b.onclick = () => { location.hash = back; };
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

function route() {
  if (cleanup) { cleanup(); cleanup = null; }
  const parts = (location.hash.replace(/^#\/?/, '') || 'matches').split('/');
  const [p0, p1, p2] = parts;
  window.scrollTo(0, 0);
  try {
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
      return `<div class="list-item">
        <div class="grow">
          <a class="title" href="#/match/${m.id}/tag">${esc(t ? t.name : 'Team')} vs ${esc(m.opponent || 'Opponent')}</a>
          <div class="small muted">${fmtDate(m.date)}${m.competition ? ' · ' + esc(m.competition) : ''} · ${nR} receives · ${nS} serves</div>
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
    right: `<a class="nav-action text" href="#/match/${m.id}/stats">Stats</a>`
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

  return `
    <div class="tiles">
      <div class="tile"><div class="k">Pass average</div><div class="v ${recQuality(avg(R.sum, R.n))}">${f2(avg(R.sum, R.n))}</div><div class="s">${R.n} serve receives</div></div>
      <div class="tile"><div class="k">Perfect passes</div><div class="v">${pct(R.c[3], R.n)}</div><div class="s">${R.c[3]} graded 3</div></div>
      <div class="tile"><div class="k">Aced</div><div class="v">${pct(R.c[0], R.n)}</div><div class="s">${R.c[0]} graded 0</div></div>
      <div class="tile"><div class="k">Serve average</div><div class="v ${srvQuality(avg(V.sum, V.n))}">${f2(avg(V.sum, V.n))}</div><div class="s">${V.n} serves</div></div>
      <div class="tile"><div class="k">Aces</div><div class="v">${V.c[3]}</div><div class="s">${pct(V.c[3], V.n)} of serves</div></div>
      <div class="tile"><div class="k">Serve errors</div><div class="v">${V.c[0]}</div><div class="s">${pct(V.c[0], V.n)} of serves</div></div>
    </div>

    <div class="card">
      <h3 style="margin-top:0">Serve receive (0–3)</h3>
      ${rIds.length ? `<div class="table-wrap"><table>
        <thead>${RECV_HEAD}</thead>
        <tbody>${rIds.map(id => `<tr>${receiveRow(esc(playerName(pl(id))), esc(mainPos(S.byPlayer[id].pos)), S.byPlayer[id].receive)}</tr>`).join('')}
        <tr class="total">${receiveRow('Team', '', R)}</tr></tbody></table></div>
        ${legendHTML(['3 Perfect', '2 Good', '1 Poor', '0 Aced/error'])}` : '<p class="muted small">No serve receives tagged.</p>'}
    </div>

    <div class="card">
      <h3 style="margin-top:0">Serving</h3>
      ${sIds.length ? `<div class="table-wrap"><table>
        <thead>${SERV_HEAD}</thead>
        <tbody>${sIds.map(id => `<tr>${serveRow(esc(playerName(pl(id))), esc(mainPos(S.byPlayer[id].pos)), S.byPlayer[id].serve)}</tr>`).join('')}
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
    app.innerHTML = `
      <div class="row spread" style="margin-bottom:10px">
        <div class="small muted">${esc(t.name)} vs ${esc(m.opponent)} · ${fmtDate(m.date)}${m.competition ? ' · ' + esc(m.competition) : ''}</div>
        <button class="btn sm" id="csv">Export CSV</button>
      </div>
      <div id="segWrap">${setsSeg(m.events, matchStatsSet, '')}</div>
      ${statsHTML(evs, t.players)}`;
    $$('#segWrap [data-href]').forEach(b => b.onclick = () => { matchStatsSet = b.dataset.href ? +b.dataset.href.slice(1) : null; render(); });
    $('#csv').onclick = () => exportCSV(`${t.name} vs ${m.opponent} ${m.date}${matchStatsSet ? ' set ' + matchStatsSet : ''}`, evs, t.players);
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
  app.innerHTML = `
    <div class="card row">
      <label class="field grow"><span>Team</span>
        <select id="teamSel">${db.teams.map(x => `<option value="${x.id}" ${x.id === t.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
      <button class="btn sm" id="csv" style="align-self:flex-end">Export CSV</button>
    </div>
    <p class="small muted">${ms.length} match${ms.length === 1 ? '' : 'es'} · all tagged actions combined</p>
    ${statsHTML(evs, t.players)}
    ${ms.length > 1 ? trendHTML(ms) : ''}`;
  $('#teamSel').onchange = e => { location.hash = '#/season/' + e.target.value; };
  $('#csv').onclick = () => exportCSV(`${t.name} season`, evs, t.players);
}

function trendHTML(ms) {
  return `<div class="card"><h3 style="margin-top:0">Match by match</h3>
    <div class="table-wrap"><table>
      <thead><tr><th>Match</th><th>Date</th><th>Receives</th><th>Pass avg</th><th>Aced %</th><th>Serves</th><th>Serve avg</th><th>Aces</th><th>Errors</th></tr></thead>
      <tbody>${ms.map(m => {
        const S = computeStats(m.events), r = S.total.receive, s = S.total.serve, ra = avg(r.sum, r.n), sa = avg(s.sum, s.n);
        return `<tr><td><a href="#/match/${m.id}/stats">vs ${esc(m.opponent)}</a></td><td>${fmtDate(m.date)}</td>
          <td>${r.n}</td><td class="${recQuality(ra)}">${f2(ra)}</td><td>${pct(r.c[0], r.n)}</td>
          <td>${s.n}</td><td class="${srvQuality(sa)}">${f2(sa)}</td><td>${s.c[3]}</td><td>${s.c[0]}</td></tr>`;
      }).join('')}</tbody></table></div></div>`;
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

async function saveFile(filename, text, mime) {
  // Running inside the Expo app (mobile/): hand the file to the iPhone share sheet
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'saveFile', filename, text, mime }));
    return;
  }
  const cap = window.Capacitor;
  if (cap && cap.isNativePlatform && cap.isNativePlatform() && cap.Plugins.Filesystem && cap.Plugins.Share) {
    try {
      const r = await cap.Plugins.Filesystem.writeFile({ path: filename, data: text, directory: 'CACHE', encoding: 'utf8' });
      await cap.Plugins.Share.share({ title: filename, files: [r.uri] });
      return;
    } catch (e) { if (!/cancel/i.test(String(e && e.message))) toast('Could not share file'); return; }
  }
  const blob = new Blob([text], { type: mime });
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
      </ol>
      Laptop shortcuts: Space play/pause, &larr; / &rarr; skip 3 seconds.
      <p>VolleyStats v1.0</p>
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
if ('serviceWorker' in navigator && !window.ReactNativeWebView && (location.protocol === 'https:' || location.hostname === 'localhost') && !(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
