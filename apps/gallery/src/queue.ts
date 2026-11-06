import { themeTokenCssVars, type BoothTheme } from '@photo-booth/types';

/**
 * Guest queue page served at GET /q. One fixed QR near the booth points here;
 * it always serves the active event (see the 20261106000000_queue migration).
 *
 * The guest taps "Ambil nomor" and the page polls their place in line. The
 * phone vibrates (and shows a notification when allowed) as their turn gets
 * close, when they are next (the guest before them started their session) and
 * when it is their turn. A skipped guest can rejoin right after the next guest.
 * The ticket lives in localStorage, so re-scanning shows the same number.
 */
export const renderQueuePage = (params: { theme: BoothTheme }): string => {
  const themeVars = Object.entries(themeTokenCssVars(params.theme))
    .map(([name, value]) => `${name}:${value};`)
    .join('');
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex"/>
<title>Antrian Photobooth · Kelana</title>
<style>
  :root { ${themeVars} }
  * { box-sizing:border-box; }
  html, body { margin:0; }
  body {
    min-height:100vh; color:#fff; display:flex; align-items:center; justify-content:center;
    font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
    background:
      radial-gradient(900px 480px at 50% -10%, rgb(var(--pbx-ui-secondary-rgb) / .3), transparent 60%),
      linear-gradient(180deg,var(--pbx-ui-bg) 0%, var(--pbx-ui-panel) 60%, var(--pbx-ui-raised-2) 100%);
  }
  .card { width:min(92vw,420px); text-align:center; padding:28px 22px 24px; border-radius:24px;
    background:rgb(255 255 255 / .06); border:1px solid rgb(255 255 255 / .12); }
  h1 { margin:0 0 4px; font-size:1rem; letter-spacing:.18em; text-transform:uppercase; opacity:.75; }
  .num { font-size:5.5rem; font-weight:900; line-height:1; margin:14px 0 6px; color:var(--pbx-ui-hi); }
  .label { font-size:.8rem; letter-spacing:.14em; text-transform:uppercase; opacity:.6; }
  .msg { margin:18px 0 0; font-size:1.15rem; font-weight:700; line-height:1.4; }
  .msg.hot { color:var(--pbx-ui-hi); }
  .row { display:flex; gap:10px; margin-top:20px; }
  .stat { flex:1; padding:12px 8px; border-radius:16px; background:rgb(255 255 255 / .06); }
  .stat b { display:block; font-size:1.6rem; }
  .stat span { font-size:.72rem; opacity:.6; text-transform:uppercase; letter-spacing:.08em; }
  .btn { display:inline-block; margin-top:22px; padding:14px 26px; border:0; border-radius:999px; cursor:pointer;
    font-weight:800; font-size:1rem; background:var(--pbx-ui-hi); color:var(--pbx-ui-hi-fg); }
  .btn.ghost { background:transparent; color:#fff; border:1px solid rgb(255 255 255 / .3); font-size:.85rem; padding:10px 18px; }
  .hint { margin-top:16px; font-size:.78rem; opacity:.55; line-height:1.5; }
  .hidden { display:none !important; }
  .fsec { margin-top:20px; padding:14px; border-radius:18px; background:rgb(255 255 255 / .06); display:flex; align-items:center; gap:12px; text-align:left; }
  .fsec img { width:56px; height:84px; object-fit:contain; border-radius:8px; background:rgb(0 0 0 / .25); flex-shrink:0; }
  .fsec .ft { flex:1; min-width:0; }
  .fsec .ft b { display:block; font-size:.95rem; }
  .fsec .ft span { font-size:.75rem; opacity:.6; }
  .fsec .btn { margin:0; padding:9px 14px; font-size:.8rem; }
  .sheet { position:fixed; inset:0; z-index:10; background:rgb(0 0 0 / .7); display:flex; align-items:flex-end; justify-content:center; }
  .sheet-box { width:min(100vw,560px); max-height:88vh; overflow:auto; padding:20px 16px 28px; border-radius:24px 24px 0 0;
    background:var(--pbx-ui-panel); }
  .sheet-box h2 { margin:0 0 4px; font-size:1.1rem; }
  .sheet-box p { margin:0 0 14px; font-size:.8rem; opacity:.6; }
  .fgrid { display:grid; grid-template-columns:repeat(auto-fill,minmax(130px,1fr)); gap:12px; }
  .fopt { border:2px solid transparent; border-radius:16px; padding:8px; background:rgb(255 255 255 / .06); color:#fff; cursor:pointer; font:inherit; }
  .fopt.sel { border-color:var(--pbx-ui-hi); }
  .fopt img { width:100%; aspect-ratio:2/3; object-fit:contain; border-radius:10px; background:rgb(0 0 0 / .25); }
  .fopt span { display:block; margin-top:6px; font-size:.78rem; font-weight:700; }
  @keyframes pulse { 0%,100% { transform:scale(1) } 50% { transform:scale(1.06) } }
  .pulse { animation:pulse 1.2s ease-in-out infinite; }
</style>
</head>
<body>
<main class="card">
  <h1>Antrian Photobooth</h1>
  <div id="view"><p class="msg">Memuat&hellip;</p></div>
</main>
<div class="sheet hidden" id="sheet">
  <div class="sheet-box">
    <h2>Pilih frame</h2>
    <p>Frame ini langsung dipakai saat giliranmu di booth.</p>
    <div class="fgrid" id="fgrid"></div>
    <button class="btn ghost" id="sheetClose" type="button">Tutup</button>
  </div>
</div>
<script>
var DEVICE_KEY = 'kq_device';
var TICKET_KEY = 'kq_ticket';
var POLL_MS = 5000;
var lastStage = '';
var timer = 0;
function schedule() { clearTimeout(timer); timer = setTimeout(poll, POLL_MS); }

// Saved twice (localStorage + a 1-year cookie) so the phone keeps its number
// even if one of the two is cleared or unavailable.
function setCookie(key, value) {
  try {
    document.cookie = key + '=' + (value === null ? '' : encodeURIComponent(value)) +
      '; path=/; SameSite=Lax; max-age=' + (value === null ? 0 : 31536000) +
      (location.protocol === 'https:' ? '; Secure' : '');
  } catch (e) {}
}
function getCookie(key) {
  try {
    var m = document.cookie.match(new RegExp('(?:^|; )' + key + '=([^;]*)'));
    return m && m[1] ? decodeURIComponent(m[1]) : null;
  } catch (e) { return null; }
}
function store(key, value) {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch (e) {}
  setCookie(key, value);
}
function load(key) {
  var v = null;
  try { v = localStorage.getItem(key); } catch (e) {}
  if (!v) {
    v = getCookie(key);
    if (v) { try { localStorage.setItem(key, v); } catch (e) {} }
  }
  return v;
}

function deviceId() {
  var id = load(DEVICE_KEY);
  if (!id) {
    var bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    id = Array.prototype.map.call(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    store(DEVICE_KEY, id);
  }
  return id;
}

function api(path, method) {
  return fetch(path, { method: method || 'GET', headers: { 'content-type': 'application/json' },
    body: method === 'POST' ? JSON.stringify({ device: deviceId() }) : undefined })
    .then(function (r) { return r.json(); });
}

var frames = null;
var current = null;

function loadFrames() {
  if (frames) return Promise.resolve(frames);
  return fetch('/api/queue/frames').then(function (r) { return r.json(); })
    .then(function (list) { frames = Array.isArray(list) ? list : []; return frames; })
    .catch(function () { return []; });
}

function esc(text) {
  return String(text).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function frameById(id) {
  if (!frames || !id) return null;
  for (var i = 0; i < frames.length; i++) if (frames[i].id === id) return frames[i];
  return null;
}

function frameSection(s) {
  if (!frames || frames.length === 0) return '';
  var canPick = s.status === 'waiting' || s.status === 'skipped';
  var f = frameById(s.frame_id);
  if (!f && !canPick) return '';
  return '<div class="fsec">' +
    (f ? '<img src="' + esc(f.preview_url) + '" alt=""/>' : '') +
    '<div class="ft"><b>' + (f ? esc(f.name) : 'Belum pilih frame') + '</b><span>' +
    (f ? 'Frame pilihanmu' : 'Pilih sambil menunggu, biar di booth langsung foto') + '</span></div>' +
    (canPick ? '<button class="btn" id="pickFrame" type="button">' + (f ? 'Ganti' : 'Pilih frame') + '</button>' : '') +
    '</div>';
}

function wireFrameButton() {
  var b = document.getElementById('pickFrame');
  if (b) b.onclick = openSheet;
}

function openSheet() {
  var grid = document.getElementById('fgrid');
  grid.innerHTML = frames.map(function (f) {
    return '<button class="fopt' + (current && current.frame_id === f.id ? ' sel' : '') + '" type="button" data-id="' + esc(f.id) + '">' +
      '<img src="' + esc(f.preview_url) + '" alt="" loading="lazy"/><span>' + esc(f.name) + '</span></button>';
  }).join('');
  grid.querySelectorAll('.fopt').forEach(function (btn) {
    btn.onclick = function () { chooseFrame(btn.getAttribute('data-id')); };
  });
  document.getElementById('sheet').classList.remove('hidden');
}

function closeSheet() { document.getElementById('sheet').classList.add('hidden'); }

function chooseFrame(id) {
  var ticket = load(TICKET_KEY);
  if (!ticket) return;
  fetch('/api/queue/frame/' + encodeURIComponent(ticket), {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ frame: id }),
  }).then(function (r) { return r.json(); }).then(function (res) {
    closeSheet();
    if (res && res.ok) { if (current) current.frame_id = id; poll(); }
    else alert('Frame tidak bisa dipilih lagi (sesi sudah dimulai).');
  }).catch(function () { alert('Gagal menyimpan frame, coba lagi.'); });
}

function view(html) { document.getElementById('view').innerHTML = html; }

// Browsers only allow sound and vibration after the guest has touched the
// page (and again after every reload), so the page shows an "Aktifkan" button
// until it has been tapped in this page load.
var audioCtx = null;
var alertsUnlocked = false;
var swReg = null;
var nowRepeats = 0;
var CAN_VIBRATE = typeof navigator.vibrate === 'function';

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/q-sw.js').then(function (reg) { swReg = reg; }).catch(function () {});
}

function beep(times) {
  if (!audioCtx) return;
  try {
    var t = audioCtx.currentTime;
    for (var i = 0; i < times; i++) {
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = i % 2 ? 1175 : 880;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.6, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.3);
      t += 0.38;
    }
  } catch (e) {}
}

function unlockAlerts() {
  try {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx && !audioCtx) audioCtx = new Ctx();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) {}
  alertsUnlocked = true;
  try {
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  } catch (e) {}
}

function notify(text) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    var opts = { body: text, tag: 'kelana-queue', renotify: true, vibrate: [300, 120, 300] };
    // Android Chrome only shows notifications through the service worker.
    if (swReg && swReg.showNotification) swReg.showNotification('Antrian Photobooth', opts);
    else new Notification('Antrian Photobooth', opts);
  } catch (e) {}
}

function fireAlert(stage, text) {
  if (CAN_VIBRATE) navigator.vibrate(stage === 'now' ? [500, 150, 500, 150, 500] : [300, 120, 300]);
  beep(stage === 'now' ? 4 : 2);
  notify(text);
}

function alertGuest(stage, text) {
  if (stage === lastStage) {
    // Keep nudging (up to 3 more times, every ~20s) while it is their turn.
    if (stage === 'now' && nowRepeats < 3 && Date.now() - (alertGuest.at || 0) > 20000) {
      nowRepeats += 1;
      alertGuest.at = Date.now();
      fireAlert(stage, text);
    }
    return;
  }
  lastStage = stage;
  nowRepeats = 0;
  alertGuest.at = Date.now();
  fireAlert(stage, text);
}

// Auto-activate on the guest's first touch anywhere (tapping "Ambil Nomor"
// or a frame counts). Browsers refuse sound/vibration before any touch.
function autoUnlock() {
  if (alertsUnlocked) return;
  unlockAlerts();
  var hint = document.getElementById('touchHint');
  if (hint) hint.remove();
}
['pointerdown', 'touchstart', 'keydown'].forEach(function (type) {
  document.addEventListener(type, autoUnlock, { capture: true, passive: true });
});

function alertsCard() {
  if (alertsUnlocked) return '';
  return '<p class="hint" id="touchHint">🔔 Sentuh layar sekali agar HP bisa berbunyi' +
    (CAN_VIBRATE ? ' &amp; bergetar' : '') + '.</p>';
}

function wireAlertsButton() {}

function askNotify() {
  unlockAlerts();
}

function showTake(reason) {
  var msg = reason === 'disabled'
    ? '<p class="msg">Antrian sedang tidak aktif.<br/>Langsung saja ke booth!</p>'
    : '<p class="msg">Ambil nomor antrian, lalu santai saja. Kami kabari lewat HP ini saat giliranmu dekat.</p>' +
      '<button class="btn" id="take" type="button">Ambil Nomor</button>' +
      (reason === 'error' ? '<p class="hint">Gagal mengambil nomor, coba lagi.</p>' : '');
  view(msg);
  var btn = document.getElementById('take');
  if (btn) btn.onclick = function () {
    btn.disabled = true;
    askNotify();
    api('/api/queue/take', 'POST').then(function (res) {
      if (res && res.ok) { store(TICKET_KEY, res.ticket_id); lastStage = ''; poll(); }
      else showTake(res && res.reason === 'disabled' ? 'disabled' : 'error');
    }).catch(function () { showTake('error'); });
  };
}

function minutes(seconds, ahead) {
  if (!seconds || ahead < 1) return null;
  var m = Math.max(1, Math.round((seconds * ahead) / 60));
  return '\\u00b1' + m + ' menit';
}

function render(s) {
  var html = '<p class="label">Nomor kamu</p><div class="num">' + s.number + '</div>';
  if (s.status === 'done') {
    view(html + '<p class="msg">Terima kasih! Sesi fotomu sudah selesai. 🎉</p>' +
      '<button class="btn ghost" id="again" type="button">Ambil nomor baru</button>');
    document.getElementById('again').onclick = function () { store(TICKET_KEY, null); lastStage = ''; showTake(); };
    return false;
  }
  if (s.status === 'skipped') {
    view(html + '<p class="msg">Nomormu terlewat karena belum datang saat dipanggil.</p>' +
      '<button class="btn" id="rejoin" type="button">Masuk antrian lagi</button>' +
      '<p class="hint">Kamu akan ditempatkan tepat setelah antrian berikutnya.</p>' + frameSection(s));
    wireFrameButton();
    document.getElementById('rejoin').onclick = function () {
      this.disabled = true;
      api('/api/queue/rejoin/' + encodeURIComponent(load(TICKET_KEY)), 'POST').then(function () { lastStage = ''; poll(); });
    };
    return true;
  }
  var stage, msg;
  if (s.ahead === 0) {
    stage = 'now';
    msg = '<p class="msg hot pulse">Giliranmu sekarang!<br/>Silakan ke booth 📸</p>';
  } else if (s.ahead === 1 && s.now_status === 'serving') {
    stage = 'next';
    msg = '<p class="msg hot">Kamu berikutnya!<br/>Ke booth sekarang ya.</p>';
  } else if (s.ahead <= 3) {
    stage = 'soon';
    msg = '<p class="msg hot">Giliranmu sebentar lagi, bersiap ke booth.</p>';
  } else {
    stage = 'wait';
    msg = '<p class="msg">Santai dulu, kami kabari saat giliranmu dekat.</p>';
  }
  var eta = minutes(s.avg_seconds, s.ahead);
  html += '<div class="row">' +
    '<div class="stat"><b>' + (s.now_number != null ? s.now_number : '-') + '</b><span>Sekarang</span></div>' +
    '<div class="stat"><b>' + s.ahead + '</b><span>Antrian lagi</span></div>' +
    (eta ? '<div class="stat"><b style="font-size:1.1rem;line-height:1.9rem">' + eta + '</b><span>Estimasi</span></div>' : '') +
    '</div>' + (s.enabled ? msg : '<p class="msg">Antrian sedang dijeda oleh petugas. Nomormu tetap aman.</p>') +
    frameSection(s) + alertsCard() +
    '<p class="hint">Biarkan halaman ini terbuka agar HP berbunyi' + (CAN_VIBRATE ? ' dan bergetar' : '') +
    ' saat giliranmu dekat.</p>';
  view(html);
  wireFrameButton();
  wireAlertsButton();
  if (!s.enabled) {
    lastStage = 'paused';
  } else if (stage !== 'wait') {
    alertGuest(stage, stage === 'now' ? 'Giliranmu sekarang! Silakan ke booth.' :
      stage === 'next' ? 'Kamu berikutnya, ke booth sekarang.' : 'Giliranmu sebentar lagi.');
  } else {
    lastStage = 'wait';
  }
  return true;
}

function poll() {
  clearTimeout(timer);
  var ticket = load(TICKET_KEY);
  if (!ticket) {
    api('/api/queue/active').then(function (r) { showTake(r && r.enabled ? null : 'disabled'); })
      .catch(function () { showTake(); });
    return;
  }
  Promise.all([api('/api/queue/status/' + encodeURIComponent(ticket)), loadFrames()]).then(function (res) {
    var s = res[0];
    // Only forget the ticket when the server says it no longer exists; a
    // network blip or a busy server must never cost the guest their number.
    if (s && !s.ok && s.reason === 'not_found') { store(TICKET_KEY, null); showTake(); return; }
    if (!s || !s.ok) { schedule(); return; }
    current = s;
    if (render(s)) schedule();
  }).catch(function () { schedule(); });
}

document.getElementById('sheetClose').onclick = closeSheet;
document.getElementById('sheet').addEventListener('click', function (e) { if (e.target.id === 'sheet') closeSheet(); });
document.addEventListener('visibilitychange', function () { if (!document.hidden && load(TICKET_KEY)) poll(); });
poll();
</script>
</body>
</html>`;
};
