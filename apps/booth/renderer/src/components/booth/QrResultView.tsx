import React from 'react';
import type { BoothCopywriting, BoothTheme, FrameConfig } from '@photo-booth/types';
import FrameCanvas from '../FrameCanvas';
import { withAlpha } from '../../lib/appearance';
import { resolveFrameTemplate } from '../../utils/frameConfig';

export type ResultsPrintState = 'off' | 'printing' | 'queued' | 'ready' | 'error';
export type ResultsUploadState = 'uploading' | 'done' | 'error';

export interface QrResultViewProps {
  copy: BoothCopywriting;
  theme: BoothTheme;
  /** Timed flow: the QR leads to the arrange page, there is no print yet. */
  isTimedFlow: boolean;
  frame: FrameConfig | null;
  photoUrls: Array<string | undefined>;
  photoSlotCount: number;
  filterStyle: string;
  qrDataUrl: string | null;
  printState: ResultsPrintState;
  uploadState: ResultsUploadState;
  isDone: boolean;
  canFinish: boolean;
  surfaceStyle?: React.CSSProperties;
  onFinish?: () => void;
  onOpenQr?: () => void;
}

const STATUS_COLORS = {
  busy: { bg: '#fff4d6', fg: '#8a5a00', dot: '#f0a020' },
  ok: { bg: '#e3f6e9', fg: '#1f7a3b', dot: '#2e9e4f' },
  err: { bg: '#fde4e4', fg: '#a12a2a', dot: '#d64545' },
} as const;

const StatusChip: React.FC<{ tone: keyof typeof STATUS_COLORS; label: string; pulse?: boolean }> = ({ tone, label, pulse }) => {
  const c = STATUS_COLORS[tone];
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-black sm:text-sm"
      style={{ backgroundColor: c.bg, color: c.fg }}
    >
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: c.dot, animation: pulse ? 'pb-slot-glow 1s ease-in-out infinite' : undefined }}
      />
      {label}
    </span>
  );
};

/**
 * The last booth screen: scan to download. Outputs were already previewed on
 * the effects screen, so this stays focused on the QR, the print / cloud
 * status and a small copy of the final print.
 */
export const QrResultView: React.FC<QrResultViewProps> = ({
  copy,
  theme,
  isTimedFlow,
  frame,
  photoUrls,
  photoSlotCount,
  filterStyle,
  qrDataUrl,
  printState,
  uploadState,
  isDone,
  canFinish,
  surfaceStyle,
  onFinish,
  onOpenQr,
}) => {
  const print =
    printState === 'off'
      ? null
      : printState === 'ready'
        ? { tone: 'ok' as const, label: copy.resultsPrintReady }
        : printState === 'error'
          ? { tone: 'err' as const, label: copy.resultsPrintError }
          : printState === 'queued'
            ? { tone: 'ok' as const, label: copy.resultsPrintQueued }
            : { tone: 'busy' as const, label: copy.resultsPrinting, pulse: true };
  const upload =
    uploadState === 'done'
      ? { tone: 'ok' as const, label: copy.resultsUploaded }
      : uploadState === 'error'
        ? { tone: 'err' as const, label: copy.resultsUploadError }
        : { tone: 'busy' as const, label: copy.resultsUploading, pulse: true };

  // Everything is sized from the screen (container query units), so the print
  // is as large as the screen allows and the whole page always fits on one
  // screen: side by side on landscape screens, stacked on portrait ones.
  const printTemplate = frame ? resolveFrameTemplate(frame, photoSlotCount) : null;
  const printRatio = printTemplate ? printTemplate.width / printTemplate.height : 2 / 3;
  const hasPrint = !isTimedFlow && Boolean(frame);

  return (
    <div
      className="pb-flow-anim relative flex h-full w-full items-center justify-center overflow-hidden"
      style={{ ...surfaceStyle, color: theme.foreground, containerType: 'size' }}
    >
      <div
        className="flex h-full w-full items-center justify-center landscape:flex-row landscape:gap-[5cqw] landscape:px-[4cqw] landscape:py-[4cqh] portrait:flex-col portrait:gap-[2.2cqh] portrait:px-[4cqw] portrait:py-[2.5cqh]"
        style={{ '--r': String(printRatio) } as React.CSSProperties}
      >
        {/* Copy of the final print, as large as the screen allows */}
        {hasPrint && frame && (
          <div
            className={`shrink-0 bg-white p-[0.6cqmin] ${
              hasPrint
                ? 'landscape:w-[min(50cqw,calc(84cqh*var(--r)))] portrait:w-[min(88cqw,calc(42cqh*var(--r)))]'
                : ''
            }`}
            style={
              {
                '--pr': '-3deg',
                boxShadow: `0 14px 34px ${withAlpha(theme.deep, 0.35)}`,
                animation: 'pb-print-toss 1.3s linear 0.1s both',
              } as React.CSSProperties
            }
          >
            <FrameCanvas frame={frame} photos={photoUrls} photoSlotCount={photoSlotCount} filter={filterStyle} className="!border-0 w-full !shadow-none" />
          </div>
        )}

        <div className="flex flex-col items-center text-center landscape:w-[min(38cqw,34rem)] landscape:gap-[2.6cqh] portrait:w-[min(88cqw,34rem)] portrait:gap-[1.6cqh]">
          <div style={{ animation: 'pb-rise-pop 0.6s cubic-bezier(0.2, 0.9, 0.3, 1.2) 0.2s both' }}>
            <h1 className="font-black uppercase leading-none tracking-[-0.03em] landscape:text-[clamp(1.4rem,6.5cqh,4rem)] portrait:text-[clamp(1.3rem,3.6cqh,3.5rem)]">{copy.resultsTitle}</h1>
            <p className="mt-[1cqh] font-semibold opacity-80 landscape:text-[clamp(0.85rem,2.4cqh,1.5rem)] portrait:text-[clamp(0.8rem,1.7cqh,1.4rem)]">
              {isTimedFlow ? copy.resultsQrArrange : copy.resultsSubtitle}
            </p>
          </div>

          <button
            type="button"
            onClick={onOpenQr}
            disabled={!qrDataUrl}
            className="relative rounded-[22px] border-[4px] bg-white p-3 transition-transform enabled:hover:-translate-y-0.5"
            style={{
              borderColor: theme.deep,
              boxShadow: `0 8px 0 ${theme.deep}`,
              animation: 'pb-rise-pop 0.6s cubic-bezier(0.2, 0.9, 0.3, 1.2) 0.35s both',
            }}
            aria-label={copy.resultsQrModalTitle}
          >
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="QR" className={QR_SIZE} />
            ) : (
              <span className={`grid place-items-center text-sm font-bold opacity-60 ${QR_SIZE}`} style={{ color: theme.deep }}>
                {copy.resultsGeneratingQr}
              </span>
            )}
            <span
              className="absolute -right-5 -top-5 grid h-16 w-16 place-items-center rounded-full border-[3px] text-center text-[0.65rem] font-black uppercase leading-tight"
              style={{
                borderColor: theme.deep,
                backgroundColor: theme.tertiary,
                color: theme.tertiaryForeground,
                animation: 'pb-icon-wiggle 3s ease-in-out 1.2s infinite',
              }}
            >
              {copy.resultsScanMe}
            </span>
          </button>

          <div className="flex flex-wrap justify-center gap-2" style={{ animation: 'pb-rise-pop 0.5s ease-out 0.5s both' }}>
            {print && <StatusChip tone={print.tone} label={print.label} pulse={'pulse' in print} />}
            <StatusChip tone={upload.tone} label={upload.label} pulse={upload.tone === 'busy'} />
          </div>

          <button
            type="button"
            onClick={onFinish}
            disabled={!canFinish || !onFinish}
            className="mt-1 min-h-12 w-full rounded-xl border-2 px-6 py-3 font-black uppercase tracking-[0.12em] landscape:text-[clamp(0.85rem,2.2cqh,1.4rem)] portrait:text-[clamp(0.85rem,1.6cqh,1.3rem)] shadow-[0_4px_0_rgba(0,0,0,0.18)] transition-transform enabled:hover:-translate-y-0.5 enabled:active:translate-y-0 disabled:opacity-50"
            style={
              {
                borderColor: theme.deep,
                backgroundColor: theme.action,
                color: theme.actionForeground,
                '--glow': withAlpha(theme.action, 0.55),
                animation: isDone ? 'pb-cta-breathe 2.4s ease-in-out infinite' : undefined,
              } as React.CSSProperties
            }
          >
            {isDone ? copy.resultsFinishDone : copy.resultsFinishButton}
          </button>
        </div>
      </div>
    </div>
  );
};

/** QR size from the screen: big on landscape, leaves room for the print on portrait. */
const QR_SIZE =
  'landscape:h-[min(42cqh,30cqw)] landscape:w-[min(42cqh,30cqw)] portrait:h-[min(22cqh,62cqw)] portrait:w-[min(22cqh,62cqw)]';

export default QrResultView;
