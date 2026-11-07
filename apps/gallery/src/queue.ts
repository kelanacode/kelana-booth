import { themeTokenCssVars, type BoothTheme } from '@photo-booth/types';

/**
 * Guest queue page served at GET /q. One fixed QR near the booth points here;
 * it always serves the active event (see the 20261106000000_queue migration).
 *
 * The guest taps "Ambil nomor" (or opens /q?t=<ticket> from the WhatsApp
 * reply) and the page polls their place in line. No sound: WhatsApp does the
 * alerting. When it is their turn the page flashes, and Android vibrates.
 * A skipped guest can rejoin right after the next guest. The ticket lives in
 * localStorage, so re-scanning shows the same number.
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
  /* isolation keeps the preview's own z-indexes inside it, so the selected
     frame card never paints over the frame picker sheet. */
  .fprev { position:relative; isolation:isolate; width:100%; container-type:inline-size; border-radius:10px; overflow:hidden; background:rgb(0 0 0 / .25); }
  .fprev .fart { position:absolute; inset:0; width:100%; height:100%; object-fit:contain; }
  .fprev .farea { position:absolute; display:flex; align-items:center; justify-content:center; text-align:center;
    color:#fff; font-weight:900; letter-spacing:.06em; font-size:max(6px, 7cqw); line-height:1.1; text-shadow:0 1px 3px rgb(0 0 0 / .45); }
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

// Same per-source colors as the booth and admin frame canvas
// (SLOT_PLACEHOLDER_COLORS in the booth's FrameCanvas).
var SOURCE_COLORS = ['#c24b9a', '#7d4fd1', '#9a7b1f', '#1e9fd8', '#c96a26', '#3fa463', '#d45454', '#5a6fb0', '#b7588f'];

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
      ';background:' + SOURCE_COLORS[(n - 1) % SOURCE_COLORS.length] +
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

// No sound here: guests get the WhatsApp messages (or watch this page). When
// it is their turn the page shows a flashing full-screen card, and Android
// phones vibrate (iPhone browsers cannot).
var CAN_VIBRATE = typeof navigator.vibrate === 'function';
var pagerOn = false;
var pagerAckNumber = null;

function buzz(pattern) {
  try { if (CAN_VIBRATE) navigator.vibrate(pattern); } catch (e) {}
}

function startPager(number) {
  if (pagerOn || pagerAckNumber === number) return;
  pagerOn = true;
  document.getElementById('pagerNum').textContent = number;
  document.getElementById('pager').classList.remove('hidden');
  buzz([500, 150, 500, 150, 500]);
}

function stopPager() {
  if (!pagerOn) return;
  pagerOn = false;
  document.getElementById('pager').classList.add('hidden');
}

function alertGuest(stage, number) {
  if (stage === 'now') {
    lastStage = stage;
    startPager(number);
    return;
  }
  stopPager();
  if (stage === lastStage) return;
  lastStage = stage;
  buzz([300, 120, 300]);
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
    frameSection(s) +
    '<p class="hint">Halaman ini ter-update otomatis. Buka lagi kapan saja untuk cek antrianmu.</p>';
  view(html);
  wireFrameButton();
  if (!s.enabled) {
    stopPager();
    lastStage = 'paused';
  } else if (stage !== 'wait') {
    alertGuest(stage, s.number);
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

document.getElementById('pagerOk').onclick = function () {
  pagerAckNumber = Number(document.getElementById('pagerNum').textContent);
  stopPager();
};
// /q?t=<ticket> (the link in the WhatsApp reply) opens that guest's ticket in
// any browser; it is saved like a ticket taken on this page.
(function () {
  var m = location.search.match(/[?&]t=([0-9a-fA-F-]{36})/);
  if (m) store(TICKET_KEY, m[1]);
})();
document.getElementById('sheetClose').onclick = closeSheet;
document.getElementById('sheet').addEventListener('click', function (e) { if (e.target.id === 'sheet') closeSheet(); });
document.addEventListener('visibilitychange', function () { if (!document.hidden && load(TICKET_KEY)) poll(); });
poll();
</script>
</body>
</html>`;
};
