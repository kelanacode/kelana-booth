/**
 * Guest queue over WhatsApp (official Cloud API), see the
 * 20261107000000_queue_whatsapp migration.
 *
 * Guests scan a QR that opens WhatsApp with "ANTRI" typed in and press Send.
 * Meta posts the message to /api/wa/webhook; we reply with their number and
 * a /q?t=<ticket> link. When the line moves, the database pings
 * /api/wa/tick (and a one-minute cron does the same) and we send whatever
 * "almost there" / "you're next" / "your turn" / "skipped" messages are due.
 * Every message goes out inside the 24h window the guest opened by writing
 * first, so they are free-form and free, and nobody is messaged unprompted.
 *
 * Commands: ANTRI (take / show number), CEK (position), ULANG (rejoin after a
 * skip). Anything else gets the help text.
 */

export interface WaEnv {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  /** Cloud API access token (permanent system-user token). Secret. */
  WA_TOKEN?: string;
  /** The booth number's Phone Number ID from Meta (not the phone number). */
  WA_PHONE_NUMBER_ID?: string;
  /** Any string; must match the one entered in Meta's webhook settings. Secret. */
  WA_VERIFY_TOKEN?: string;
  /** Meta app secret, to check webhook signatures. Secret. */
  WA_APP_SECRET?: string;
  /** Same value as queue_settings.wa_secret in the database. Secret. */
  QUEUE_WA_SECRET?: string;
  /** Public base URL for the /q links, e.g. https://gallery.ruangkelana.com */
  GALLERY_PUBLIC_URL?: string;
}

const GRAPH_VERSION = 'v21.0';

const configured = (env: WaEnv): boolean =>
  Boolean(env.WA_TOKEN && env.WA_PHONE_NUMBER_ID && env.QUEUE_WA_SECRET);

async function rpc(env: WaEnv, fn: string, args: Record<string, unknown>): Promise<unknown> {
  const url = `${env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/rpc/${fn}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_PUBLISHABLE_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  if (!response.ok) throw new Error(`${fn} failed: HTTP ${response.status}`);
  return response.json();
}

async function sendText(env: WaEnv, to: string, body: string): Promise<void> {
  const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${env.WA_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.WA_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: true, body },
    }),
  });
  if (!response.ok) {
    console.error('WhatsApp send failed', response.status, await response.text().catch(() => ''));
  }
}

interface QueueStatus {
  ok?: boolean;
  reason?: string;
  enabled?: boolean;
  number?: number;
  status?: 'waiting' | 'serving' | 'done' | 'skipped';
  ahead?: number;
  now_number?: number | null;
  avg_seconds?: number | null;
  can_rejoin?: boolean;
  ticket_id?: string;
  existing?: boolean;
}

const publicUrl = (env: WaEnv, fallbackOrigin?: string) =>
  (env.GALLERY_PUBLIC_URL || fallbackOrigin || 'https://gallery.ruangkelana.com').replace(/\/+$/, '');

const eta = (s: QueueStatus) => {
  if (!s.avg_seconds || !s.ahead) return '';
  return ` (±${Math.max(1, Math.round((s.avg_seconds * s.ahead) / 60))} menit)`;
};

const HELP =
  'Halo! Ini layanan antrian photobooth Kelana 📸\n\n' +
  'Ketik *ANTRI* untuk ambil nomor antrian\n' +
  'Ketik *CEK* untuk cek posisi antrianmu\n' +
  'Ketik *ULANG* untuk masuk antrian lagi kalau nomormu terlewat';

const DISABLED = 'Antrian photobooth sedang tidak aktif. Langsung saja ke booth ya! 📸';

function positionLine(s: QueueStatus): string {
  if (s.status === 'serving') return 'Kamu sedang dilayani di booth sekarang 📸';
  if (s.ahead === 0) return '📸 *Giliranmu sekarang!* Silakan ke photobooth.';
  return `Sekarang dilayani No. ${s.now_number ?? '-'}, masih *${s.ahead} antrian lagi*${eta(s)}.`;
}

function statusReply(s: QueueStatus, link: string): string {
  if (s.status === 'done') return `Sesi foto nomor *${s.number}* sudah selesai. Terima kasih! 🎉\nKetik *ANTRI* kalau mau foto lagi.`;
  if (s.status === 'skipped') {
    return s.can_rejoin
      ? `Nomor *${s.number}* terlewat. Balas *ULANG* untuk masuk antrian lagi (1x kesempatan).`
      : `Nomor *${s.number}* terlewat lagi. Ketik *ANTRI* untuk ambil nomor baru.`;
  }
  return `Nomor antrianmu *${s.number}*.\n${positionLine(s)}\n\nPantau & pilih frame: ${link}`;
}

async function handleCommand(env: WaEnv, wa: string, text: string, origin: string): Promise<void> {
  const cmd = text.trim().toUpperCase().replace(/[^A-Z]/g, '');
  const secret = env.QUEUE_WA_SECRET;
  const base = publicUrl(env, origin);
  const link = (s: QueueStatus) => `${base}/q?t=${s.ticket_id}`;

  if (cmd === 'ANTRI' || cmd === 'ANTRE' || cmd === 'DAFTAR') {
    const s = (await rpc(env, 'queue_wa_take', { p_secret: secret, p_wa: wa })) as QueueStatus;
    if (!s.ok) {
      await sendText(env, wa, s.reason === 'disabled' ? DISABLED : 'Maaf, nomor antrian belum bisa diambil. Coba lagi sebentar ya.');
      return;
    }
    if (s.existing && s.status !== 'done') {
      await sendText(env, wa, `Kamu sudah punya nomor antrian.\n\n${statusReply(s, link(s))}`);
      return;
    }
    await sendText(
      env,
      wa,
      `Nomor antrian photobooth kamu: *${s.number}*\n${positionLine(s)}\n\n` +
        `Pilih frame sambil menunggu: ${link(s)}\n\n` +
        'Kami kabari di sini saat giliranmu dekat. Ketik *CEK* untuk cek antrian.',
    );
    return;
  }

  if (cmd === 'CEK' || cmd === 'STATUS') {
    const s = (await rpc(env, 'queue_wa_status', { p_secret: secret, p_wa: wa })) as QueueStatus;
    if (!s.ok) {
      await sendText(env, wa, s.reason === 'disabled' ? DISABLED : 'Kamu belum punya nomor antrian. Ketik *ANTRI* untuk ambil nomor.');
      return;
    }
    await sendText(env, wa, statusReply(s, link(s)));
    return;
  }

  if (cmd === 'ULANG') {
    const s = (await rpc(env, 'queue_wa_rejoin', { p_secret: secret, p_wa: wa })) as QueueStatus;
    if (!s.ok) {
      const msg =
        s.reason === 'rejoin_limit'
          ? 'Kesempatan masuk antrian lagi hanya 1 kali. Ketik *ANTRI* untuk ambil nomor baru.'
          : s.reason === 'disabled'
            ? DISABLED
            : 'Kamu belum punya nomor antrian. Ketik *ANTRI* untuk ambil nomor.';
      await sendText(env, wa, msg);
      return;
    }
    await sendText(env, wa, `Kamu masuk antrian lagi ✅\n\n${statusReply(s, link(s))}`);
    return;
  }

  await sendText(env, wa, HELP);
}

interface ClaimedMessage {
  ticket_id: string;
  number: number;
  wa: string;
  ahead: number | null;
  kind: 'soon' | 'next' | 'now' | 'skip';
  can_rejoin: boolean;
}

/** Sends every turn message that is due (claimed atomically in the database). */
export async function processQueueTick(env: WaEnv): Promise<number> {
  if (!configured(env)) return 0;
  const due = (await rpc(env, 'queue_wa_claim', { p_secret: env.QUEUE_WA_SECRET })) as ClaimedMessage[];
  if (!Array.isArray(due)) return 0;
  const base = publicUrl(env);
  await Promise.all(
    due.map((m) => {
      const text =
        m.kind === 'now'
          ? `📸 Nomor *${m.number}*: *GILIRANMU SEKARANG!* Silakan ke photobooth.`
          : m.kind === 'next'
            ? `🚶 Nomor *${m.number}*: kamu berikutnya! Silakan menuju photobooth sekarang.`
            : m.kind === 'soon'
              ? `⏳ Nomor *${m.number}*: giliranmu sebentar lagi (tinggal ${m.ahead} antrian). Mulai bersiap ke booth ya.\n${base}/q?t=${m.ticket_id}`
              : m.can_rejoin
                ? `Nomor *${m.number}* terlewat karena belum datang saat dipanggil. Balas *ULANG* untuk masuk antrian lagi (1x kesempatan).`
                : `Nomor *${m.number}* terlewat lagi. Ketik *ANTRI* untuk ambil nomor baru.`;
      return sendText(env, m.wa, text);
    }),
  );
  return due.length;
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function validSignature(env: WaEnv, raw: string, header: string | null): Promise<boolean> {
  if (!env.WA_APP_SECRET) return true; // not configured: accept (set it in production)
  if (!header?.startsWith('sha256=')) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.WA_APP_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)));
  const given = header.slice('sha256='.length);
  if (given.length !== mac.length) return false;
  let diff = 0;
  for (let i = 0; i < mac.length; i++) diff |= mac.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

interface WebhookBody {
  entry?: Array<{
    changes?: Array<{
      value?: { messages?: Array<{ from?: string; type?: string; text?: { body?: string }; button?: { text?: string } }> };
    }>;
  }>;
}

/** GET (Meta's verification handshake) and POST (incoming messages) for /api/wa/webhook. */
export async function handleWaWebhook(request: Request, env: WaEnv, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === 'GET') {
    const ok =
      url.searchParams.get('hub.mode') === 'subscribe' &&
      Boolean(env.WA_VERIFY_TOKEN) &&
      url.searchParams.get('hub.verify_token') === env.WA_VERIFY_TOKEN;
    return ok ? new Response(url.searchParams.get('hub.challenge') ?? '', { status: 200 }) : new Response('Forbidden', { status: 403 });
  }
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const raw = await request.text();
  if (!(await validSignature(env, raw, request.headers.get('x-hub-signature-256')))) {
    return new Response('Bad signature', { status: 401 });
  }
  if (!configured(env)) return new Response('ok');

  let body: WebhookBody;
  try {
    body = JSON.parse(raw) as WebhookBody;
  } catch {
    return new Response('ok');
  }
  const messages = (body.entry ?? []).flatMap((e) => (e.changes ?? []).flatMap((c) => c.value?.messages ?? []));
  // Answer Meta right away; replies are sent in the background.
  ctx.waitUntil(
    Promise.all(
      messages.map(async (m) => {
        if (!m.from) return;
        const text = m.text?.body ?? m.button?.text ?? '';
        try {
          await handleCommand(env, m.from, text, url.origin);
        } catch (error) {
          console.error('WhatsApp command failed', error);
        }
      }),
    ),
  );
  return new Response('ok');
}

/** POST /api/wa/tick from the database trigger (x-queue-secret header). */
export async function handleWaTick(request: Request, env: WaEnv, ctx: ExecutionContext): Promise<Response> {
  if (!env.QUEUE_WA_SECRET || request.headers.get('x-queue-secret') !== env.QUEUE_WA_SECRET) {
    return new Response('Forbidden', { status: 403 });
  }
  ctx.waitUntil(processQueueTick(env).catch((error) => console.error('Queue tick failed', error)));
  return new Response('ok');
}
