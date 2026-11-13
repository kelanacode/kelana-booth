/**
 * The booth's print layout for the Canon SELPHY CP1000 postcard (100 × 148 mm).
 *
 * The SELPHY prints borderless by printing past the card's edges, and Canon's
 * driver enlarges the page for it (it lays a 100 mm wide page out 1248 px
 * wide, the printer's own print width: about 5.7% bigger). So every print is
 * a white 100 × 150 mm sheet at 300 dpi with the framed photo resized into a
 * 97 × 140 mm box, 1.5 mm from the left and 4.5 mm from the top.
 *
 * Tuned with test prints on the booth's CP1000 (Nov 2026): the frame then
 * fills the card with no white edge; about 1 mm of its left and right edges
 * runs past the card. (Easy-PhotoPrint test prints fitted at 5.5 mm from the
 * top; the booth's own prints came out ~1 mm lower — cut at the bottom, white
 * at the top — hence 4.5 mm.) Frames fit best at the box's own shape and size,
 * 97 × 140 mm = 1146 × 1654 px.
 */

const DPI = 300;
const MM_PER_INCH = 25.4;
const mmToPx = (mm: number) => Math.round((mm / MM_PER_INCH) * DPI);

/** The whole print sheet: 100 × 150 mm at 300 dpi (1181 × 1772 px). */
export const PRINT_SHEET = { width: mmToPx(100), height: mmToPx(150) };

/** The frame's place on the sheet: 97 × 140 mm (1146 × 1654 px) at 1.5 / 4.5 mm. */
export const PRINT_FRAME_BOX = {
  left: mmToPx(1.5),
  top: mmToPx(4.5),
  width: mmToPx(97),
  height: mmToPx(140),
  widthMm: 97,
  heightMm: 140,
};

/**
 * Composes `artwork` (the framed photo) into the print sheet: resized to the
 * frame box on a white sheet. A landscape frame is turned a quarter turn
 * counter-clockwise onto the portrait sheet first.
 */
export const composePrintSheet = (artwork: HTMLCanvasElement | ImageBitmap): HTMLCanvasElement => {
  const sheet = document.createElement('canvas');
  sheet.width = PRINT_SHEET.width;
  sheet.height = PRINT_SHEET.height;
  const ctx = sheet.getContext('2d');
  if (!ctx) {
    throw new Error('2D canvas context unavailable');
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  ctx.imageSmoothingQuality = 'high';

  const { left, top, width, height } = PRINT_FRAME_BOX;
  ctx.translate(left + width / 2, top + height / 2);
  if (artwork.width > artwork.height) {
    ctx.rotate(-Math.PI / 2);
    ctx.drawImage(artwork, -height / 2, -width / 2, height, width);
  } else {
    ctx.drawImage(artwork, -width / 2, -height / 2, width, height);
  }
  return sheet;
};

/** JPEG 0.95: visually lossless at 300 dpi and a fraction of a PNG's size. */
export const printSheetDataUrl = (sheet: HTMLCanvasElement): string =>
  sheet.toDataURL('image/jpeg', 0.95);

/** The print sheet (JPEG data URL) for a session's framed photo. */
export const framedToPrintSheet = async (framed: Blob): Promise<string> => {
  const artwork = await createImageBitmap(framed);
  try {
    return printSheetDataUrl(composePrintSheet(artwork));
  } finally {
    artwork.close();
  }
};

export interface ArtworkPrintFit {
  /** The frame box, turned to the artwork's orientation, in mm. */
  boxMm: { width: number; height: number };
  /** Artwork size that fills the box exactly at 300 dpi. */
  idealPx: { width: number; height: number };
  /** Resolution the artwork prints at (its lower axis). */
  dpi: number;
  /** How much printing stretches one axis against the other, in percent. */
  stretchPct: number;
  /** The axis printing squeezes when the shape differs from the box. */
  squeezed: 'height' | 'width';
}

/** How `width`×`height` artwork (a frame canvas) lands in the print's frame box. */
export const artworkPrintFit = (width: number, height: number): ArtworkPrintFit => {
  const turn = width > height;
  const box = PRINT_FRAME_BOX;
  const boxW = turn ? box.height : box.width;
  const boxH = turn ? box.width : box.height;
  const sx = boxW / width;
  const sy = boxH / height;
  return {
    boxMm: turn
      ? { width: box.heightMm, height: box.widthMm }
      : { width: box.widthMm, height: box.heightMm },
    idealPx: { width: boxW, height: boxH },
    dpi: DPI / Math.max(sx, sy),
    stretchPct: (Math.max(sx, sy) / Math.min(sx, sy) - 1) * 100,
    squeezed: sy < sx ? 'height' : 'width',
  };
};
