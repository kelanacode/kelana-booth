import { useRef, type PointerEvent } from 'react';
import type { WatermarkPiece } from '@photo-booth/types';

interface WatermarkPiecesOverlayProps {
  pieces: WatermarkPiece[];
  templateWidth: number;
  templateHeight: number;
  activeId: string | null;
  onSelect: (id: string | null) => void;
  /** Called once when a drag starts (history snapshot). */
  onBegin: () => void;
  /** Live geometry updates while dragging. */
  onChange: (id: string, patch: Partial<WatermarkPiece>) => void;
}

type Corner = 'nw' | 'ne' | 'sw' | 'se';
type Drag =
  | { mode: 'move'; id: string; startX: number; startY: number; origin: WatermarkPiece }
  | { mode: 'resize'; id: string; corner: Corner; startX: number; startY: number; origin: WatermarkPiece }
  | { mode: 'rotate'; id: string; cx: number; cy: number; origin: WatermarkPiece };

const MIN_SIZE = 12;
const CORNERS: Array<{ corner: Corner; className: string; cursor: string }> = [
  { corner: 'nw', className: '-left-1.5 -top-1.5', cursor: 'cursor-nwse-resize' },
  { corner: 'ne', className: '-right-1.5 -top-1.5', cursor: 'cursor-nesw-resize' },
  { corner: 'sw', className: '-bottom-1.5 -left-1.5', cursor: 'cursor-nesw-resize' },
  { corner: 'se', className: '-bottom-1.5 -right-1.5', cursor: 'cursor-nwse-resize' },
];

/**
 * Interactive boxes for the watermark pieces on the frame editor canvas:
 * drag to move, corner handles to resize (keeping the piece's proportions),
 * the top handle to rotate. The artwork itself is drawn by FrameCanvas below.
 */
export const WatermarkPiecesOverlay = ({
  pieces,
  templateWidth,
  templateHeight,
  activeId,
  onSelect,
  onBegin,
  onChange,
}: WatermarkPiecesOverlayProps) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);

  const units = () => {
    const rect = rootRef.current?.getBoundingClientRect();
    return rect && rect.width > 0 ? { rect, kx: templateWidth / rect.width, ky: templateHeight / rect.height } : null;
  };

  const start = (event: PointerEvent<HTMLElement>, drag: Drag) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    onSelect(drag.id);
    onBegin();
    dragRef.current = drag;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const move = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    const u = units();
    if (!drag || !u) return;
    const o = drag.origin;
    if (drag.mode === 'move') {
      const dx = (event.clientX - drag.startX) * u.kx;
      const dy = (event.clientY - drag.startY) * u.ky;
      onChange(drag.id, {
        x: Math.round(Math.min(Math.max(o.x + dx, -o.width / 2), templateWidth - o.width / 2)),
        y: Math.round(Math.min(Math.max(o.y + dy, -o.height / 2), templateHeight - o.height / 2)),
      });
    } else if (drag.mode === 'resize') {
      const dx = (event.clientX - drag.startX) * u.kx;
      const ratio = o.width / Math.max(1, o.height);
      const grow = drag.corner === 'ne' || drag.corner === 'se' ? dx : -dx;
      const width = Math.max(MIN_SIZE, o.width + grow);
      const height = Math.max(MIN_SIZE / ratio, width / ratio);
      // Keep the opposite corner fixed.
      const x = drag.corner === 'nw' || drag.corner === 'sw' ? o.x + o.width - width : o.x;
      const y = drag.corner === 'nw' || drag.corner === 'ne' ? o.y + o.height - height : o.y;
      onChange(drag.id, { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) });
    } else {
      const angle = (Math.atan2(event.clientY - drag.cy, event.clientX - drag.cx) * 180) / Math.PI + 90;
      // Snap to 0 / 90 / 180 / 270 when within 4 degrees.
      const snapped = Math.round(angle / 90) * 90;
      const rotation = Math.abs(angle - snapped) < 4 ? snapped : Math.round(angle);
      onChange(drag.id, { rotation: ((rotation % 360) + 360) % 360 });
    }
  };

  const end = (event: PointerEvent<HTMLElement>) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const pct = (v: number, total: number) => `${(v / total) * 100}%`;

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 z-[60]">
      {pieces.map((piece) => {
        const active = piece.id === activeId;
        return (
          <div
            key={piece.id}
            role="button"
            tabIndex={-1}
            aria-label={`Watermark ${piece.kind}`}
            className={`pointer-events-auto absolute cursor-move touch-none ${
              active ? 'outline outline-2 outline-[#a855f7]' : 'outline-dashed outline-1 outline-[#a855f7]/70 hover:outline-2'
            }`}
            style={{
              left: pct(piece.x, templateWidth),
              top: pct(piece.y, templateHeight),
              width: pct(piece.width, templateWidth),
              height: pct(piece.height, templateHeight),
              transform: piece.rotation ? `rotate(${piece.rotation}deg)` : undefined,
            }}
            onPointerDown={(event) => start(event, { mode: 'move', id: piece.id, startX: event.clientX, startY: event.clientY, origin: piece })}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
          >
            {active && (
              <>
                {CORNERS.map(({ corner, className, cursor }) => (
                  <div
                    key={corner}
                    role="presentation"
                    className={`absolute h-3 w-3 rounded-sm border border-white bg-[#a855f7] shadow-md ${className} ${cursor}`}
                    onPointerDown={(event) =>
                      start(event, { mode: 'resize', id: piece.id, corner, startX: event.clientX, startY: event.clientY, origin: piece })
                    }
                    onPointerMove={move}
                    onPointerUp={end}
                    onPointerCancel={end}
                  />
                ))}
                <div
                  role="presentation"
                  title="Putar"
                  className="absolute -top-6 left-1/2 h-3.5 w-3.5 -translate-x-1/2 cursor-grab rounded-full border-2 border-white bg-[#a855f7] shadow-md"
                  onPointerDown={(event) => {
                    const box = event.currentTarget.parentElement!.getBoundingClientRect();
                    start(event, {
                      mode: 'rotate',
                      id: piece.id,
                      cx: box.left + box.width / 2,
                      cy: box.top + box.height / 2,
                      origin: piece,
                    });
                  }}
                  onPointerMove={move}
                  onPointerUp={end}
                  onPointerCancel={end}
                />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default WatermarkPiecesOverlay;
