import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { BoothCopywriting, BoothTheme, FrameConfig } from '@photo-booth/types';
import FrameCanvas from '../FrameCanvas';
import { resolveFrameTemplate } from '../../utils/frameConfig';
import { withAlpha } from '../../lib/appearance';

export interface FrameSelectionViewProps {
  copy: BoothCopywriting;
  theme: BoothTheme;
  frames: FrameConfig[];
  isLoading: boolean;
  /** Currently chosen frame, which opens the confirm modal. `null` closes it. */
  selected: FrameConfig | null;
  onSelect: (frame: FrameConfig) => void;
  onClose: () => void;
  onConfirm: () => void;
  /**
   * Booth: the preview modal covers the whole window (position: fixed). The
   * admin appearance preview leaves it off so the modal stays in its stage.
   */
  fullscreenModal?: boolean;
}

/**
 * Presentational core of the frame selection screen: a responsive grid of frame
 * previews (two-up on phones, three-up on booth displays) plus the full-screen
 * confirm modal. Shared with the admin appearance preview; the screen owns the
 * frame fetch.
 */
export const FrameSelectionView: React.FC<FrameSelectionViewProps> = ({
  copy,
  theme,
  frames,
  isLoading,
  selected,
  onSelect,
  onClose,
  onConfirm,
  fullscreenModal = false,
}) => {
  const selectedPreviewRatio = selected
    ? (() => {
        const template = resolveFrameTemplate(selected, selected.photoSlots ?? 3);
        return template.width / template.height;
      })()
    : 0.75;

  // Carousel: previous / next frame from the modal (arrows, swipe, keys).
  const selectedIndex = selected ? frames.findIndex((frame) => frame.id === selected.id) : -1;
  const [direction, setDirection] = useState<'next' | 'prev' | null>(null);
  const canStep = frames.length > 1 && selectedIndex >= 0;
  const step = (delta: 1 | -1) => {
    if (!canStep) return;
    setDirection(delta > 0 ? 'next' : 'prev');
    onSelect(frames[(selectedIndex + delta + frames.length) % frames.length]);
  };
  const stepRef = useRef(step);
  stepRef.current = step;

  useEffect(() => {
    if (!selected) {
      setDirection(null);
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') stepRef.current(1);
      else if (event.key === 'ArrowLeft') stepRef.current(-1);
      else if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, onClose]);

  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  const onSwipeStart = (event: React.PointerEvent) => {
    swipeRef.current = { x: event.clientX, y: event.clientY };
  };
  const onSwipeEnd = (event: React.PointerEvent) => {
    const start = swipeRef.current;
    swipeRef.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.2) step(dx < 0 ? 1 : -1);
  };

  // Rendered into <body> on the booth (fullscreen), so no transformed parent
  // can shrink a position:fixed overlay; inside the view in the admin preview.
  // Screen orientation decides the layout of the preview. A portrait frame on a
  // landscape screen gets the full height: the controls move into the empty
  // space at its sides instead of taking rows above and below it.
  const [viewport, setViewport] = useState(() =>
    typeof window === 'undefined' ? { w: 1280, h: 800 } : { w: window.innerWidth, h: window.innerHeight },
  );
  useEffect(() => {
    const update = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  const landscapeScreen = viewport.w >= viewport.h;
  // Empty space on each side of a full-height frame (minus margins). The side
  // layout is used only when the controls fit there without touching it.
  const sideSpace = (viewport.w - (viewport.h - 32) * selectedPreviewRatio) / 2 - 40;
  const sideLayout = landscapeScreen && selectedPreviewRatio < 1 && sideSpace >= 200;
  const sideWidth = Math.min(384, Math.max(0, sideSpace));

  const closeButton = (
    <button
      onClick={onClose}
      onPointerDown={(e) => e.stopPropagation()}
      className="absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full text-[1.1rem] font-black shadow-[0_4px_12px_rgba(0,0,0,0.45)] transition-transform hover:scale-110 active:scale-95 sm:right-6 sm:top-6 sm:h-11 sm:w-11"
      style={{ backgroundColor: theme.primary, color: theme.primaryForeground }}
      aria-label="Close"
    >
      &#10005;
    </button>
  );

  // Bottom bar like the admin frame viewer: name + position left, action right.
  const infoBlock = selected ? (
    <div className="min-w-0">
      <p className="truncate text-[0.9rem] font-black uppercase tracking-[0.08em] sm:text-[1.05rem]" style={{ color: theme.card }}>
        {selected.name}
      </p>
      {canStep && (
        <p className="mt-0.5 text-xs font-bold tracking-[0.12em]" style={{ color: withAlpha(theme.card, 0.6) }}>
          {selectedIndex + 1} / {frames.length}
        </p>
      )}
    </div>
  ) : null;

  const confirmButton = (
    <button
      onClick={onConfirm}
      onPointerDown={(e) => e.stopPropagation()}
      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full px-8 py-3.5 text-[0.95rem] font-black uppercase tracking-[0.12em] shadow-[0_4px_0_rgba(0,0,0,0.25)] transition-all hover:-translate-y-0.5 active:translate-y-0 sm:px-10 sm:text-[1.05rem]"
      style={
        {
          backgroundColor: theme.action,
          color: theme.actionForeground,
          '--glow': withAlpha(theme.action, 0.55),
          animation: 'pb-cta-breathe 2.2s ease-in-out 0.6s infinite',
        } as React.CSSProperties
      }
    >
      {copy.frameConfirmButton}
    </button>
  );

  const arrowClass =
    'absolute top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-[1.6rem] font-black shadow-[0_4px_12px_rgba(0,0,0,0.45)] transition-transform hover:scale-110 active:scale-95 sm:h-12 sm:w-12';

  const stage = selected ? (
    <div
      className={`relative flex min-h-0 items-center justify-center ${
        sideLayout ? 'h-full px-24 py-4' : landscapeScreen ? 'px-3 pb-2 pt-16 sm:px-20' : 'px-2 pb-1 pt-16'
      }`}
      style={{ containerType: 'size' }}
    >
      <div
        key={selected.id}
        className="flex items-center justify-center"
        style={{
          animation:
            direction === 'next'
              ? 'pb-slide-from-right 0.32s cubic-bezier(0.2, 0.9, 0.3, 1) both'
              : direction === 'prev'
                ? 'pb-slide-from-left 0.32s cubic-bezier(0.2, 0.9, 0.3, 1) both'
                : 'pb-modal-zoom 0.35s cubic-bezier(0.2, 0.9, 0.3, 1.2) both',
        }}
      >
        <FrameCanvas
          frame={selected}
          photoSlotCount={selected.photoSlots ?? 3}
          className="rounded-[14px] border-[3px] shadow-[0_12px_40px_rgba(0,0,0,0.55)]"
          style={{
            borderColor: theme.accent,
            // As large as the stage allows, keeping the frame's proportions.
            width: `min(100cqh * ${selectedPreviewRatio}, 100cqw)`,
            aspectRatio: `${selectedPreviewRatio}`,
          }}
        />
      </div>

      {canStep && (
        <>
          <button
            type="button"
            onClick={() => step(-1)}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label="Frame sebelumnya"
            className={`${arrowClass} ${sideLayout ? 'left-6' : landscapeScreen ? 'left-1 sm:left-4' : 'left-1'}`}
            style={{ backgroundColor: theme.card, color: theme.cardForeground }}
          >
            &#8249;
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label="Frame berikutnya"
            className={`${arrowClass} ${sideLayout ? 'right-6' : landscapeScreen ? 'right-1 sm:right-4' : 'right-1'}`}
            style={{ backgroundColor: theme.card, color: theme.cardForeground }}
          >
            &#8250;
          </button>
        </>
      )}
    </div>
  ) : null;

  const previewModal = selected ? (
    <div
      className={`${fullscreenModal ? 'fixed' : 'absolute'} inset-0 z-[300] overflow-hidden ${
        sideLayout ? '' : 'grid grid-rows-[minmax(0,1fr)_auto]'
      }`}
      style={{
        background: withAlpha(theme.deep, 0.96),
        animation: 'pb-modal-fade 0.25s ease-out both',
        touchAction: 'pan-y',
      }}
      role="dialog"
      aria-modal="true"
      aria-label={selected.name}
      onPointerDown={onSwipeStart}
      onPointerUp={onSwipeEnd}
      onPointerCancel={() => (swipeRef.current = null)}
    >
      {stage}
      {closeButton}
      {sideLayout ? (
        // Portrait frame on a landscape screen: name and button sit in the
        // bottom corners, beside the full-height frame.
        <>
          <div className="absolute bottom-8 left-6" style={{ maxWidth: sideWidth }}>
            {infoBlock}
          </div>
          <div className="absolute bottom-8 right-6">{confirmButton}</div>
        </>
      ) : (
        <div className="flex items-center gap-4 px-4 pb-6 pt-3 sm:px-6 sm:pb-8">
          <div className="mr-auto min-w-0">{infoBlock}</div>
          {confirmButton}
        </div>
      )}
    </div>
  ) : null;

  return (
    <div
      className="pb-flow-anim relative flex h-full w-full items-center justify-center select-none overflow-hidden p-2 sm:p-4 md:p-6"
      // Container query context so the modal preview below can size itself
      // against this view (cqh/cqw) instead of the window. The admin preview
      // stage reuses this component, so viewport units would be wrong there.
      style={{ containerType: 'size' }}
    >
      <div
        className="flex h-full w-full max-w-[95vw] flex-col overflow-hidden rounded-[18px] border-[4px] p-1.5 shadow-[0_0_0_6px_rgba(255,255,255,0.08)] sm:p-2 md:p-2.5"
        style={{
          borderColor: theme.primary,
          backgroundColor: theme.surface,
          animation: 'pb-modal-zoom 0.45s cubic-bezier(0.2, 0.9, 0.3, 1.2) both',
        }}
      >
        <div
          className="pb-scroll flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden rounded-[14px] p-1.5 sm:p-2 md:p-2.5"
          style={{
            backgroundColor: theme.surface,
            backgroundImage: `radial-gradient(${withAlpha(theme.surfaceForeground, 0.08)} 1.5px, transparent 1.8px)`,
            backgroundSize: '22px 22px',
          }}
        >
          <div className="mb-1 shrink-0 text-center md:mb-3">
            <p
              className="inline-block -rotate-2 rounded-full px-3 py-0.5 text-[0.65rem] font-black uppercase tracking-[0.24em] sm:text-[0.75rem]"
              style={{ backgroundColor: theme.secondary, color: theme.secondaryForeground }}
            >
              {copy.frameEyebrow}
            </p>
            <h1
              className="mt-0.5 text-[1.25rem] font-black uppercase tracking-[-0.08em] sm:text-[1.75rem] md:text-[2.25rem]"
              style={{ color: theme.surfaceForeground }}
            >
              {copy.frameTitle}
            </h1>
          </div>

          {/* Two columns on narrow screens so each frame stays legible; three
              from `sm` up (booth displays and the admin preview). */}
          {/* Bento grid: landscape frames span two columns, portrait frames
              one; dense flow fills the gaps so the rows stay closed. */}
          <div className="grid grid-flow-dense grid-cols-2 place-items-stretch gap-2 sm:grid-cols-3 sm:gap-3">
            {isLoading
              ? Array.from({ length: 9 }, (_, index) => (
                  <div
                    key={`skeleton-${index}`}
                    className="flex h-full w-full select-none flex-col rounded-[16px] border-[4px] p-2 sm:p-2.5"
                    style={{ borderColor: theme.secondary, backgroundColor: theme.card }}
                  >
                    <div
                      className="mb-2 aspect-[3/4] w-full animate-pulse rounded-[12px] border-[3px] sm:mb-3"
                      style={{ borderColor: theme.secondary, backgroundColor: theme.card }}
                    />
                    <div
                      className="mx-auto mb-2 h-[1rem] w-3/4 animate-pulse rounded-full"
                      style={{ backgroundColor: theme.secondary, opacity: 0.25 }}
                    />
                  </div>
                ))
              : frames.map((frame, index) => {
                  const tpl = resolveFrameTemplate(frame, frame.photoSlots ?? 3);
                  const landscape = tpl.width > tpl.height;
                  return (
                  // Outer wrapper owns the entrance animation; the card itself
                  // owns the hover lift (both animate transform).
                  <div
                    key={frame.id}
                    className={`h-full w-full ${landscape ? 'col-span-2' : ''}`}
                    style={
                      {
                        '--pr': `${index % 2 === 0 ? -1 : 1}deg`,
                        animation: `pb-rise-pop 0.55s cubic-bezier(0.2, 0.9, 0.3, 1.2) ${0.15 + Math.min(index, 8) * 0.07}s both`,
                      } as React.CSSProperties
                    }
                  >
                    <div
                      onClick={() => onSelect(frame)}
                      className="flex h-full w-full cursor-pointer flex-col rounded-[16px] border-[4px] p-2 transition-all duration-200 hover:-translate-y-1.5 hover:rotate-[-1deg] sm:p-2.5"
                      style={{
                        borderColor: theme.deep,
                        backgroundColor: theme.card,
                        color: theme.cardForeground,
                        boxShadow: `0 5px 0 ${theme.deep}`,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = theme.primary;
                        e.currentTarget.style.boxShadow = `0 9px 0 ${theme.primary}`;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = theme.deep;
                        e.currentTarget.style.boxShadow = `0 5px 0 ${theme.deep}`;
                      }}
                    >
                      <FrameCanvas
                        frame={frame}
                        photoSlotCount={frame.photoSlots ?? 3}
                        className="mb-2 w-full rounded-[12px] border-[3px] sm:mb-3"
                        style={{ borderColor: theme.secondary, backgroundColor: theme.card }}
                      />
                      <h3 className="line-clamp-2 shrink-0 px-1 text-center text-xs font-black uppercase tracking-[0.08em] sm:text-sm md:text-base">
                        {frame.name}
                      </h3>
                    </div>
                  </div>
                  );
                })}
          </div>
        </div>
      </div>

      {selected &&
        (fullscreenModal && typeof document !== 'undefined'
          ? createPortal(previewModal, document.body)
          : previewModal)}
    </div>
  );
};

export default FrameSelectionView;
