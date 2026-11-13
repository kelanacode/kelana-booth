import React from 'react';
import { artworkPrintFit } from '../../lib/printSheet';

/** Below this the print looks soft (the SELPHY prints at 300 dpi). */
const LOW_DPI = 250;
/** Smaller stretches are rounding, not a different shape. */
const VISIBLE_STRETCH_PCT = 1;

const num = (value: number) => String(Number(value.toFixed(1)));

/**
 * The frame canvas against the print layout (lib/printSheet.ts): every frame
 * is printed into a 97 × 140 mm box. Shows the pixel size and print
 * resolution, and warns when printing will stretch the frame (its shape
 * differs from the box) or print it soft (low resolution).
 */
export const CanvasSizeInfo: React.FC<{ width: number; height: number }> = ({ width, height }) => {
  if (!(width > 0 && height > 0)) {
    return null;
  }

  const fit = artworkPrintFit(width, height);
  const box = `${num(fit.boxMm.width)} × ${num(fit.boxMm.height)} mm`;
  const dpi = Math.round(fit.dpi);
  const warnings: string[] = [];
  if (fit.stretchPct >= VISIBLE_STRETCH_PCT) {
    warnings.push(
      `Shape isn't ${box}, so printing squeezes its ${fit.squeezed} by ${num(fit.stretchPct)}%.`
    );
  }
  if (dpi < LOW_DPI) {
    warnings.push(`Low resolution (${dpi} dpi), so the print will look soft.`);
  }

  return (
    <div className="mt-1.5">
      <div className="flex flex-wrap gap-x-1.5 font-mono text-xs font-bold text-pbx-secondary-strong">
        <span>
          {width} × {height} px
        </span>
        <span>
          prints {box} at {dpi} dpi
        </span>
      </div>
      {warnings.length > 0 && (
        <div className="mt-2 space-y-0.5 rounded-[8px] border-2 border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[0.7rem] font-bold leading-snug text-amber-800">
          {warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
          <p className="font-semibold">
            Best: {fit.idealPx.width} × {fit.idealPx.height} px ({box} at 300 dpi).
          </p>
        </div>
      )}
    </div>
  );
};
