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
  .fsec .fprev { width:64px; flex-shrink:0; }
  .fprev { position:relative; width:100%; container-type:inline-size; border-radius:10px; overflow:hidden; background:rgb(0 0 0 / .25); }
  .fprev .fart { position:absolute; inset:0; width:100%; height:100%; object-fit:contain; }
  .fprev .farea { position:absolute; display:flex; align-items:center; justify-content:center; text-align:center;
    background:#d9d3cc; color:#3a3530; font-weight:900; letter-spacing:.06em; font-size:max(6px, 7cqw); line-height:1.1; }
  .fprev.plain { aspect-ratio:2/3; }
  .fsec .ft { flex:1; min-width:0; }
  .fsec .ft b { display:block; font-size:.95rem; }
  .fsec .ft span { font-size:.75rem; opacity:.6; }
  .fsec .btn { margin:0; padding:9px 14px; font-size:.8rem; }
  .pager { position:fixed; inset:0; z-index:30; display:flex; flex-direction:column; align-items:center; justify-content:center;
    gap:14px; padding:24px; text-align:center; background:var(--pbx-ui-hi); color:var(--pbx-ui-hi-fg); animation:flash .7s steps(1) infinite; }
  .pager .big { font-size:2.2rem; font-weight:900; line-height:1.15; }
  .pager .pnum { font-size:7rem; font-weight:900; line-height:1; }
  .pager button { margin-top:10px; padding:16px 30px; border:0; border-radius:999px; font:inherit; font-size:1.1rem; font-weight:800;
    background:#111; color:#fff; cursor:pointer; }
  @keyframes flash { 0% { background:var(--pbx-ui-hi); color:var(--pbx-ui-hi-fg); } 50% { background:#111; color:var(--pbx-ui-hi); } }
  .modal { position:fixed; inset:0; z-index:20; background:rgb(0 0 0 / .72); display:flex; align-items:center; justify-content:center; padding:20px; }
  .modal-box { width:min(100%,360px); text-align:center; padding:26px 22px 20px; border-radius:24px; background:var(--pbx-ui-panel);
    border:1px solid rgb(255 255 255 / .14); box-shadow:0 20px 60px rgb(0 0 0 / .5); }
  .modal-box .bell { font-size:3rem; line-height:1; }
  .modal-box h2 { margin:12px 0 6px; font-size:1.25rem; }
  .modal-box p { margin:0; font-size:.9rem; line-height:1.5; opacity:.75; }
  .modal-box .btn { display:block; width:100%; margin-top:20px; }
  .modal-box .later { margin-top:10px; background:none; border:0; color:#fff; opacity:.6; font:inherit; font-size:.85rem; cursor:pointer; padding:8px; }
  .sheet { position:fixed; inset:0; z-index:10; background:rgb(0 0 0 / .7); display:flex; align-items:flex-end; justify-content:center; }
  .sheet-box { width:min(100vw,560px); max-height:88vh; overflow:auto; padding:20px 16px 28px; border-radius:24px 24px 0 0;
    background:var(--pbx-ui-panel); }
  .sheet-box h2 { margin:0 0 4px; font-size:1.1rem; }
  .sheet-box p { margin:0 0 14px; font-size:.8rem; opacity:.6; }
  .fgrid { display:grid; grid-template-columns:repeat(auto-fill,minmax(130px,1fr)); gap:12px; }
  .fopt { border:2px solid transparent; border-radius:16px; padding:8px; background:rgb(255 255 255 / .06); color:#fff; cursor:pointer; font:inherit; }
  .fopt.sel { border-color:var(--pbx-ui-hi); }
  .fopt .fprev { margin:0 auto; }
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
<div class="pager hidden" id="pager" role="alertdialog" aria-live="assertive">
  <div class="big">GILIRANMU!</div>
  <div class="pnum" id="pagerNum"></div>
  <div>Silakan ke booth sekarang 📸</div>
  <button type="button" id="pagerOk">Oke, saya ke booth</button>
</div>
<div class="modal hidden" id="alertModal" role="dialog" aria-modal="true" aria-labelledby="alertModalTitle">
  <div class="modal-box">
    <div class="bell">🔔</div>
    <h2 id="alertModalTitle">Aktifkan notifikasi</h2>
    <p id="alertModalText">Biar HP-mu berbunyi saat giliranmu dekat, jadi kamu bisa santai dulu tanpa takut terlewat.</p>
    <button class="btn" id="alertModalOk" type="button">🔔 Aktifkan notifikasi</button>
    <button class="later" id="alertModalLater" type="button">Nanti saja</button>
  </div>
</div>
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

// Frame preview with the photo areas labelled PHOTO 1, PHOTO 2, ... (from the
// same template the booth uses for this frame's photo count), so guests see
// which shot lands where. Falls back to the plain preview image.
function frameTemplate(f) {
  var byCount = f.templates_by_photo_slots || {};
  var t = byCount[String(f.photo_slots)] || f.template;
  if (!t) {
    for (var k in byCount) { t = byCount[k]; break; }
  }
  return t && t.width && t.height && t.photoSlots && t.photoSlots.length ? t : null;
}

function framePreview(f) {
  var t = frameTemplate(f);
  if (!t) {
    return '<div class="fprev plain"><img class="fart" src="' + esc(f.preview_url) + '" alt="" loading="lazy"/></div>';
  }
  var pct = function (v, total) { return (v / total * 100).toFixed(3) + '%'; };
  var areas = t.photoSlots.map(function (a) {
    var n = a.sourcePhotoSlot || a.slotNumber;
    return '<div class="farea" style="left:' + pct(a.x, t.width) + ';top:' + pct(a.y, t.height) +
      ';width:' + pct(a.width, t.width) + ';height:' + pct(a.height, t.height) +
      ';z-index:' + (a.zIndex != null ? a.zIndex : 10) +
      (a.rotation ? ';transform:rotate(' + a.rotation + 'deg)' : '') +
      (a.borderRadius ? ';border-radius:' + pct(a.borderRadius, t.width) : '') + '">PHOTO ' + n + '</div>';
  }).join('');
  var art = t.assetUrl || f.preview_url;
  return '<div class="fprev" style="aspect-ratio:' + t.width + '/' + t.height +
    (t.backgroundColor ? ';background:' + esc(t.backgroundColor) : '') + '">' + areas +
    '<img class="fart" src="' + esc(art) + '" alt="" loading="lazy" style="z-index:' +
    (t.frameLayerZIndex != null ? t.frameLayerZIndex : 20) + '"/></div>';
}

function frameSection(s) {
  if (!frames || frames.length === 0) return '';
  var canPick = s.status === 'waiting' || s.status === 'skipped';
  var f = frameById(s.frame_id);
  if (!f && !canPick) return '';
  return '<div class="fsec">' +
    (f ? framePreview(f) : '') +
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
      framePreview(f) + '<span>' + esc(f.name) + '</span></button>';
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
var CAN_VIBRATE = typeof navigator.vibrate === 'function';

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/q-sw.js').then(function (reg) { swReg = reg; }).catch(function () {});
}

// Loud, pager-like tones: square waves at 2.6-3.1 kHz (where the ear is most
// sensitive) through a compressor at full gain. A page can never play louder
// than the phone's own volume setting.
var master = null;
var pagerNodes = [];
function out() {
  if (!audioCtx) return null;
  if (!master) {
    var comp = audioCtx.createDynamicsCompressor();
    comp.threshold.value = -6;
    comp.knee.value = 0;
    comp.ratio.value = 20;
    comp.attack.value = 0.001;
    comp.release.value = 0.05;
    master = audioCtx.createGain();
    master.gain.value = 1;
    master.connect(comp).connect(audioCtx.destination);
  }
  return master;
}

function tone(t, freq, dur, keep) {
  var dest = out();
  if (!dest) return;
  var osc = audioCtx.createOscillator();
  var gain = audioCtx.createGain();
  osc.type = 'square';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(1, t + 0.005);
  gain.gain.setValueAtTime(1, t + dur - 0.01);
  gain.gain.linearRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(dest);
  osc.start(t);
  osc.stop(t + dur + 0.02);
  if (keep) pagerNodes.push(osc);
}

function beep(times) {
  if (!audioCtx) return;
  try {
    var t = audioCtx.currentTime + 0.02;
    for (var i = 0; i < times; i++) {
      tone(t, i % 2 ? 3100 : 2600, 0.18);
      t += 0.26;
    }
  } catch (e) {}
}

// iPhone Safari suspends Web Audio after the screen locks or the guest
// switches apps, and only a touch can wake it again. So the alarm is a plain
// <audio> element (a generated pager-trill WAV, looping) started muted on the
// guest's first touch: once playing it needs no further touch, and turning
// the sound on is just un-muting it. Media audio also ignores the iPhone
// silent switch, unlike Web Audio.
var alarm = null;

// The WAV starts with a short silent lead-in, so the instant it plays while
// being unlocked (see primeAlarm) is inaudible.
var ALARM_LEAD = 0.3;

function pagerWavUrl() {
  var rate = 22050, seconds = ALARM_LEAD + PAGER_CYCLE;
  var n = Math.floor(rate * seconds);
  var buf = new ArrayBuffer(44 + n * 2);
  var v = new DataView(buf);
  var w = function (o, str) { for (var i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, n * 2, true);
  for (var i = 0; i < n; i++) {
    var t = i / rate - ALARM_LEAD;
    var sample = 0;
    if (t >= 0) {
      var k = Math.floor(t / 0.09);
      if (k < 6 && t - k * 0.09 < 0.07) {
        var f = k % 2 ? 3100 : 2600;
        sample = Math.sin(2 * Math.PI * f * t) >= 0 ? 0.95 : -0.95;
      }
    }
    v.setInt16(44 + i * 2, sample * 32767, true);
  }
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

// Browsers only let a page start sound later, without a touch, if that same
// audio element was really (unmuted) played during a touch. Muted playback
// does not count, which is why an earlier version stayed silent. So on every
// touch the alarm is played for an instant (inside the silent lead-in) and
// paused again; ringing later is then just play().
var ringing = false;

// Diagnostics: open /q?debug=1 to see what the audio is doing on the phone.
var DEBUG = /[?&]debug=1/.test(location.search);
var dbgLines = [];
function dbg(msg) {
  if (!DEBUG) return;
  dbgLines.push(new Date().toLocaleTimeString() + ' ' + msg);
  dbgLines = dbgLines.slice(-12);
  renderDbg();
}
function renderDbg() {
  if (!DEBUG) return;
  var box = document.getElementById('dbg');
  if (!box) {
    box = document.createElement('pre');
    box.id = 'dbg';
    box.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99;margin:0;max-height:40vh;overflow:auto;' +
      'background:rgba(0,0,0,.85);color:#0f0;font:11px/1.35 monospace;padding:8px;white-space:pre-wrap;';
    document.body.appendChild(box);
    var test = document.createElement('button');
    test.textContent = 'Tes pager (bunyi 5 detik lagi)';
    test.style.cssText = 'position:fixed;right:8px;bottom:calc(40vh + 8px);z-index:100;padding:10px 14px;border:0;border-radius:999px;' +
      'background:#0f0;color:#000;font:bold 13px system-ui;';
    test.onclick = function () {
      dbg('test armed: rings in 5s with no touch');
      setTimeout(function () { pagerAckNumber = null; startPager(0, 'Tes pager'); }, 5000);
    };
    document.body.appendChild(test);
  }
  var a = alarm;
  box.textContent = 'stage=' + lastStage + ' unlocked=' + alertsUnlocked + ' ringing=' + ringing + ' pager=' + pagerOn +
    '\\nalarm=' + (a ? 'paused=' + a.paused + ' muted=' + a.muted + ' ready=' + a.readyState + ' t=' + a.currentTime.toFixed(2) +
      (a.error ? ' err=' + a.error.code : '') : 'none') +
    ' audioCtx=' + (audioCtx ? audioCtx.state : 'none') + ' notif=' + notifPermission() + ' visible=' + !document.hidden +
    '\\n' + dbgLines.join('\\n');
}
if (DEBUG) setInterval(renderDbg, 1000);
function primeAlarm() {
  try {
    if (!alarm) {
      alarm = new Audio(pagerWavUrl());
      alarm.loop = true;
      alarm.preload = 'auto';
      alarm.setAttribute('playsinline', '');
    }
    if (ringing) return;
    alarm.muted = false;
    seek(0);
    var p = alarm.play();
    var stop = function () { dbg('prime ok'); if (!ringing) { alarm.pause(); seek(0); } };
    if (p && p.then) p.then(stop, function (err) { dbg('prime blocked: ' + (err && err.name)); });
    else stop();
  } catch (e) { dbg('prime error: ' + e.name); }
}

// Setting the position on audio that has not loaded yet throws in Safari
// (iPhone never preloads). Never let that stop play() from being called.
function seek(t) {
  try { alarm.currentTime = t; } catch (e) {}
}

var alarmOffTimer = 0;
// Sound the alarm for ms milliseconds (0 = until silenced); false if it cannot.
function soundAlarm(ms) {
  if (!alarm) return false;
  clearTimeout(alarmOffTimer);
  ringing = true;
  try {
    alarm.muted = false;
    seek(ALARM_LEAD);
    var p = alarm.play();
    if (p && p.then) p.then(function () { dbg('ring ok'); }, function (err) { ringing = false; dbg('ring blocked: ' + (err && err.name)); });
  } catch (e) { ringing = false; dbg('ring error: ' + e.name); return false; }
  if (ms) alarmOffTimer = setTimeout(silenceAlarm, ms);
  return true;
}

function silenceAlarm() {
  clearTimeout(alarmOffTimer);
  ringing = false;
  if (alarm) { try { alarm.pause(); } catch (e) {} seek(0); }
}

function unlockAlerts() {
  try {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx && !audioCtx) audioCtx = new Ctx();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) {}
  primeAlarm();
  alertsUnlocked = true;
}

// Re-prime on every touch so the permission stays fresh.
document.addEventListener('pointerdown', function () {
  if (alertsUnlocked) primeAlarm();
}, { capture: true, passive: true });

var NOTIF_SUPPORTED = 'Notification' in window;
function notifPermission() {
  try { return NOTIF_SUPPORTED ? Notification.permission : 'unsupported'; } catch (e) { return 'unsupported'; }
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
  // Two trills via the always-on <audio> alarm; Web Audio beep as a fallback.
  if (!soundAlarm(PAGER_CYCLE * 2000)) beep(stage === 'now' ? 4 : 2);
  notify(text);
}

// Restaurant-pager mode for "it's your turn": a trill every 1.5s plus
// vibration and a flashing full-screen card, until the guest taps "Oke" or the
// turn passes (session started, skipped, paused). The trills are scheduled up
// to 60s ahead on the audio clock so they keep sounding even if the browser
// slows this page's timers down.
var pagerOn = false;
var pagerAckNumber = null;
var pagerScheduledTo = 0;
var pagerTimer = 0;
var PAGER_CYCLE = 1.5;

function schedulePager() {
  if (!audioCtx) return;
  var now = audioCtx.currentTime;
  if (pagerScheduledTo < now) pagerScheduledTo = now + 0.05;
  while (pagerScheduledTo < now + 60) {
    for (var i = 0; i < 6; i++) tone(pagerScheduledTo + i * 0.09, i % 2 ? 3100 : 2600, 0.07, true);
    pagerScheduledTo += PAGER_CYCLE;
  }
}

function pagerTick() {
  if (!pagerOn) return;
  // Primary: the looping <audio> alarm. Fallback: scheduled Web Audio trills.
  if (ringing && alarm && !alarm.paused) {
    // already ringing
  } else if (!soundAlarm(0)) {
    try { if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); } catch (e) {}
    schedulePager();
  }
  if (CAN_VIBRATE) navigator.vibrate([600, 200, 600]);
}

function startPager(number, text) {
  if (pagerOn || pagerAckNumber === number) return;
  pagerOn = true;
  document.getElementById('pagerNum').textContent = number;
  document.getElementById('pager').classList.remove('hidden');
  notify(text);
  pagerTick();
  pagerTimer = setInterval(pagerTick, 2000);
}

function stopPager() {
  if (!pagerOn) return;
  pagerOn = false;
  clearInterval(pagerTimer);
  silenceAlarm();
  pagerNodes.forEach(function (osc) { try { osc.stop(); } catch (e) {} });
  pagerNodes = [];
  pagerScheduledTo = 0;
  if (CAN_VIBRATE) navigator.vibrate(0);
  document.getElementById('pager').classList.add('hidden');
}

function alertGuest(stage, text, number) {
  if (stage === 'now') {
    lastStage = stage;
    startPager(number, text);
    return;
  }
  stopPager();
  if (stage === lastStage) return;
  lastStage = stage;
  fireAlert(stage, text);
}

// Auto-activate on the guest's first touch anywhere (tapping "Ambil Nomor"
// or a frame counts). Browsers refuse sound/vibration before any touch.
// Any touch unlocks sound/vibration silently; the notification permission is
// only asked from the button, so no popup appears out of nowhere.
function autoUnlock() {
  if (alertsUnlocked) return;
  unlockAlerts();
}
['pointerdown', 'touchstart', 'keydown'].forEach(function (type) {
  document.addEventListener(type, autoUnlock, { capture: true, passive: true });
});

function alertsCard() {
  var perm = notifPermission();
  if (perm === 'default' || (perm === 'unsupported' && !alertsUnlocked)) {
    return '<button class="btn" id="enableAlerts" type="button">🔔 Aktifkan ' +
      (perm === 'unsupported' ? 'bunyi' : 'notifikasi') + '</button>' +
      (perm === 'unsupported' && !CAN_VIBRATE
        ? '<p class="hint">Di iPhone, pemberitahuan berupa bunyi selama halaman ini terbuka.</p>' : '');
  }
  if (perm === 'denied') {
    return '<p class="hint">🔕 Notifikasi diblokir. Izinkan notifikasi untuk situs ini di pengaturan browser.</p>';
  }
  return '<p class="hint">✓ ' + (perm === 'granted' ? 'Notifikasi aktif' : 'Bunyi aktif') + '</p>';
}

// First visit: ask in a modal so the guest notices it. Shown once per page
// load; "Nanti saja" leaves the inline button as a fallback.
var modalShown = false;
function needsAlertPrompt() {
  var perm = notifPermission();
  return perm === 'default' || (perm === 'unsupported' && !alertsUnlocked);
}
function maybeShowAlertModal() {
  if (modalShown || !needsAlertPrompt()) return;
  modalShown = true;
  var unsupported = notifPermission() === 'unsupported';
  document.getElementById('alertModalTitle').textContent = unsupported ? 'Aktifkan bunyi' : 'Aktifkan notifikasi';
  document.getElementById('alertModalOk').textContent = unsupported ? '🔔 Aktifkan bunyi' : '🔔 Aktifkan notifikasi';
  if (unsupported) {
    document.getElementById('alertModalText').textContent =
      'Biar HP-mu berbunyi saat giliranmu dekat. Biarkan halaman ini tetap terbuka ya.';
  }
  document.getElementById('alertModal').classList.remove('hidden');
}
function closeAlertModal() { document.getElementById('alertModal').classList.add('hidden'); }

function enableAlerts() {
  closeAlertModal();
  unlockAlerts();
  beep(1);
  if (CAN_VIBRATE) navigator.vibrate(150);
  var done = function () { poll(); };
  try {
    if (NOTIF_SUPPORTED && Notification.permission === 'default') {
      var res = Notification.requestPermission(done);
      if (res && res.then) res.then(done, done);
      return;
    }
  } catch (e) {}
  done();
}

function wireAlertsButton() {
  var b = document.getElementById('enableAlerts');
  if (b) b.onclick = enableAlerts;
  maybeShowAlertModal();
}

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
  if (s.status !== 'waiting') stopPager();
  if (s.status === 'done') {
    view(html + '<p class="msg">Terima kasih! Sesi fotomu sudah selesai. 🎉</p>' +
      '<button class="btn ghost" id="again" type="button">Ambil nomor baru</button>');
    document.getElementById('again').onclick = function () { store(TICKET_KEY, null); lastStage = ''; showTake(); };
    return false;
  }
  if (s.status === 'skipped') {
    if (s.can_rejoin === false) {
      // Rejoined once already and skipped again: back of the line.
      view(html + '<p class="msg">Nomormu terlewat lagi.</p>' +
        '<p class="hint">Kesempatan masuk antrian lagi hanya 1 kali. Silakan ambil nomor baru.</p>' +
        '<button class="btn" id="fresh" type="button">Ambil nomor baru</button>');
      document.getElementById('fresh').onclick = function () {
        this.disabled = true;
        api('/api/queue/take', 'POST').then(function (res) {
          if (res && res.ok) { store(TICKET_KEY, res.ticket_id); lastStage = ''; }
          poll();
        }).catch(function () { poll(); });
      };
      return false;
    }
    view(html + '<p class="msg">Nomormu terlewat karena belum datang saat dipanggil.</p>' +
      '<button class="btn" id="rejoin" type="button">Masuk antrian lagi</button>' +
      '<p class="hint">Kamu akan ditempatkan tepat setelah antrian berikutnya. Kesempatan ini hanya 1 kali.</p>' + frameSection(s));
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
    alertsCard() + frameSection(s) +
    '<p class="hint">Biarkan halaman ini terbuka agar HP berbunyi' + (CAN_VIBRATE ? ' dan bergetar' : '') +
    ' saat giliranmu dekat.</p>';
  view(html);
  wireFrameButton();
  wireAlertsButton();
  if (!s.enabled) {
    stopPager();
    lastStage = 'paused';
  } else if (stage !== 'wait') {
    alertGuest(stage, stage === 'now' ? 'Giliranmu sekarang! Silakan ke booth.' :
      stage === 'next' ? 'Kamu berikutnya, ke booth sekarang.' : 'Giliranmu sebentar lagi.', s.number);
  } else {
    stopPager();
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

document.getElementById('alertModalOk').onclick = enableAlerts;
document.getElementById('pagerOk').onclick = function () {
  pagerAckNumber = Number(document.getElementById('pagerNum').textContent);
  stopPager();
};
document.getElementById('alertModalLater').onclick = closeAlertModal;
document.getElementById('sheetClose').onclick = closeSheet;
document.getElementById('sheet').addEventListener('click', function (e) { if (e.target.id === 'sheet') closeSheet(); });
document.addEventListener('visibilitychange', function () { if (!document.hidden && load(TICKET_KEY)) poll(); });
poll();
</script>
</body>
</html>`;
};
