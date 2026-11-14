import React, { useEffect } from 'react';
import { sessionFileUrl, SessionRecord } from '../../lib/sessions';
import { FRAME_TOP_MAX_MM } from '../../lib/printSheet';
import { DEFAULT_PRINTER, useBoothConfig } from '../../store/boothConfigStore';
import { IconPrinter } from './AdminIcons';
import { Modal } from './Modal';
import { formatTimestamp } from './StatusBadge';

const FRAME_TOP_STEP_MM = 0.5;
const clampFrameTop = (mm: number) =>
  Number.isFinite(mm)
    ? Math.min(FRAME_TOP_MAX_MM, Math.max(0, Math.round(mm * 10) / 10))
    : DEFAULT_PRINTER.frameTopMm;

const Detail: React.FC<{ label: string; value: React.ReactNode; mono?: boolean }> = ({ label, value, mono }) => (
  <div className="flex justify-between gap-3">
    <dt className="text-white/45">{label}</dt>
    <dd className={`truncate text-right text-white ${mono ? 'font-mono' : ''}`}>{value}</dd>
  </div>
);

interface PrintSessionModalProps {
  /** The session to print; null keeps the modal closed. */
  session: SessionRecord | null;
  eventName?: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirms a manual print of one session from Sessions. Shows the framed photo
 * and the printer it goes to, warns before a reprint, and carries the Frame
 * top setting (lib/printSheet.ts) so a print that came out cut can be moved
 * and printed again from here. Frame top is the booth's own setting: a change
 * here applies to every print after it.
 */
export const PrintSessionModal: React.FC<PrintSessionModalProps> = ({
  session,
  eventName,
  busy,
  onConfirm,
  onCancel,
}) => {
  const printer = useBoothConfig((state) => state.printer);
  const updatePrinter = useBoothConfig((state) => state.updatePrinter);
  const open = session !== null;

  // Show (and edit) the latest saved settings: the dev admin window keeps its
  // own copy of the store, and editing a stale copy would overwrite newer ones.
  useEffect(() => {
    if (open) void useBoothConfig.persist.rehydrate();
  }, [open]);

  if (!session) return null;

  const preview = sessionFileUrl(session.token, 'framed.png');
  const alreadyPrinted = session.print_status === 'success';
  const noQueue = !printer.queueName;
  const frameTop = clampFrameTop(printer.frameTopMm);
  const moveFrame = (delta: number) => updatePrinter({ frameTopMm: clampFrameTop(frameTop + delta) });

  return (
    <Modal open={open} title="Print this session?" onClose={busy ? () => undefined : onCancel} width="480px">
      <div className="flex gap-4">
        {preview && (
          <img
            src={preview}
            alt=""
            className="h-36 w-24 shrink-0 rounded-md bg-black/30 object-contain ring-1 ring-white/10"
          />
        )}
        <dl className="min-w-0 flex-1 space-y-1.5 text-sm">
          <Detail label="Session" value={session.token.slice(0, 8)} mono />
          <Detail label="Event" value={eventName ?? 'Unassigned'} />
          <Detail label="Taken" value={formatTimestamp(session.created_at)} />
          <Detail label="Printer" value={printer.queueName || '—'} />
          <Detail label="Copies" value={printer.copies} />
        </dl>
      </div>

      {alreadyPrinted && (
        <p className="mt-4 rounded-lg border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-xs text-amber-200">
          This session was already printed. Printing it again uses another sheet.
        </p>
      )}
      {noQueue && (
        <p className="mt-4 rounded-lg border border-[#ff5e87]/40 bg-[#ff5e87]/10 px-3 py-2 text-xs text-[#ff8aa8]">
          No printer queue is set. Choose one in Booth Setup → Printer first.
        </p>
      )}

      <div className="mt-4 flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">Frame top</p>
          <p className="text-xs leading-snug text-white/50">
            Top cut off, white at the bottom: raise it. White at the top: lower it. Applies to every print from now on.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => moveFrame(-FRAME_TOP_STEP_MM)}
            disabled={busy || frameTop <= 0}
            aria-label="Lower the frame top value"
            className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-lg font-semibold text-white transition hover:bg-white/20 disabled:opacity-40"
          >
            −
          </button>
          <span className="w-16 text-center font-mono text-sm text-white">{frameTop.toFixed(1)} mm</span>
          <button
            type="button"
            onClick={() => moveFrame(FRAME_TOP_STEP_MM)}
            disabled={busy || frameTop >= FRAME_TOP_MAX_MM}
            aria-label="Raise the frame top value"
            className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-lg font-semibold text-white transition hover:bg-white/20 disabled:opacity-40"
          >
            +
          </button>
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <button
          className="rounded-full bg-white/10 px-5 py-2 text-sm font-medium text-white/80 transition hover:bg-white/20"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
        <button
          className="inline-flex items-center gap-2 rounded-full bg-pbx-ui-hi px-5 py-2 text-sm font-semibold text-pbx-ui-hi-fg transition hover:bg-pbx-ui-hi-strong disabled:opacity-60"
          onClick={onConfirm}
          disabled={busy || noQueue}
        >
          <IconPrinter className="h-4 w-4" />
          {busy ? 'Sending…' : 'Print'}
        </button>
      </div>
    </Modal>
  );
};
