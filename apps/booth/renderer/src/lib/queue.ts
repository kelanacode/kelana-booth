import { useEffect, useState } from 'react';
import { requireSupabase } from './supabase';

/**
 * Guest queue (antrian), booth side. See the 20261106000000_queue migration.
 *
 * Guests take numbers on their phone (gallery Worker /q). The booth only
 * reads whose turn it is and reports the numbered guest's session: started
 * (tells the next guest to come over, does not advance the line), completed
 * (the only thing that advances it) or skipped (no-show). Walk-in sessions
 * carry no ticket and never call any of this.
 */

export interface QueueHead {
  id: string;
  number: number;
  status: 'waiting' | 'serving';
  /** Frame the guest picked on their phone while waiting (null = pick at the booth). */
  frameId: string | null;
}

export interface QueueBoothState {
  enabled: boolean;
  head: QueueHead | null;
  waiting: number;
}

const DISABLED: QueueBoothState = { enabled: false, head: null, waiting: 0 };

export const fetchQueueState = async (): Promise<QueueBoothState> => {
  try {
    const { data, error } = await requireSupabase().rpc('queue_booth_state');
    if (error || !data) return DISABLED;
    const raw = data as {
      enabled?: boolean;
      waiting?: number;
      head?: { id?: unknown; number?: unknown; status?: unknown; frame_id?: unknown } | null;
    };
    if (!raw.enabled) return DISABLED;
    const head =
      raw.head && typeof raw.head.id === 'string' && typeof raw.head.number === 'number'
        ? {
            id: raw.head.id,
            number: raw.head.number,
            status: raw.head.status === 'serving' ? 'serving' : 'waiting',
            frameId: typeof raw.head.frame_id === 'string' ? raw.head.frame_id : null,
          } as QueueHead
        : null;
    return { enabled: true, head, waiting: Number(raw.waiting ?? 0) };
  } catch {
    return DISABLED;
  }
};

const call = async (fn: 'queue_start' | 'queue_complete' | 'queue_skip', ticketId: string, retries = 2) => {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const { error } = await requireSupabase().rpc(fn, { p_ticket: ticketId });
      if (!error) return true;
    } catch {
      // network blip: retry below
    }
    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
  }
  return false;
};

/** Numbered guest's session started: marks them "serving"; the line does not move. */
export const markQueueStarted = (ticketId: string) => call('queue_start', ticketId);
/** Numbered guest's whole booth run finished: advances the line. */
export const markQueueDone = (ticketId: string) => call('queue_complete', ticketId, 4);
/** Head guest did not show up: skip them (they can rejoin from their phone). */
export const skipQueueTicket = (ticketId: string) => call('queue_skip', ticketId);

const POLL_MS = 4000;

/** Live queue state for the start screen (polled while mounted). */
export const useQueueState = (): [QueueBoothState, () => Promise<void>] => {
  const [state, setState] = useState<QueueBoothState>(DISABLED);
  const refresh = async () => setState(await fetchQueueState());

  useEffect(() => {
    let alive = true;
    let timer = 0;
    const tick = async () => {
      const next = await fetchQueueState();
      if (!alive) return;
      setState(next);
      timer = window.setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, []);

  return [state, refresh];
};
