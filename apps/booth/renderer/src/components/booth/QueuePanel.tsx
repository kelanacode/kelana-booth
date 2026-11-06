import React, { useState } from 'react';
import type { BoothTheme } from '@photo-booth/types';
import type { QueueHead } from '../../lib/queue';
import { withAlpha } from '../../lib/appearance';

interface QueuePanelProps {
  theme: BoothTheme;
  head: QueueHead;
  onSkip: () => Promise<void> | void;
  onWalkIn: () => void;
}

/**
 * Start-screen card while the guest queue has someone in line: whose turn it
 * is, plus the two operator buttons. Tapping the start screen itself serves
 * this number; Walk-in starts a session that leaves the queue untouched.
 */
export const QueuePanel: React.FC<QueuePanelProps> = ({ theme, head, onSkip, onWalkIn }) => {
  const [busy, setBusy] = useState(false);
  // The start presets advance on any tap, so keep our taps to ourselves.
  const stop = (event: React.SyntheticEvent) => event.stopPropagation();

  const skip = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onSkip();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed left-3 top-3 z-[150] flex items-center gap-3 rounded-2xl border-2 px-3 py-2 shadow-xl backdrop-blur sm:left-5 sm:top-5 sm:gap-4 sm:px-4 sm:py-3"
      style={{ borderColor: theme.primary, backgroundColor: withAlpha(theme.card, 0.9), color: theme.cardForeground }}
      onClick={stop}
      onPointerDown={stop}
      onTouchStart={stop}
      role="region"
      aria-label="Antrian"
    >
      <div className="text-center leading-none">
        <p className="text-[0.6rem] font-black uppercase tracking-[0.16em] opacity-70 sm:text-xs">Giliran</p>
        <p className="mt-1 text-3xl font-black sm:text-4xl" style={{ color: theme.primary }}>
          {head.number}
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => void skip()}
          disabled={busy}
          className="rounded-full border-2 px-3 py-1 text-xs font-black uppercase tracking-[0.08em] disabled:opacity-50 sm:text-sm"
          style={{ borderColor: theme.destructive, color: theme.destructive }}
        >
          {busy ? '…' : 'Lewati'}
        </button>
        <button
          type="button"
          onClick={onWalkIn}
          className="rounded-full border-2 px-3 py-1 text-xs font-black uppercase tracking-[0.08em] sm:text-sm"
          style={{ borderColor: theme.secondary, color: theme.secondary }}
        >
          Walk-in
        </button>
      </div>
    </div>
  );
};

export default QueuePanel;
