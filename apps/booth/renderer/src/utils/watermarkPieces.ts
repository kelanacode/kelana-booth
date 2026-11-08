import type { FrameTemplateConfig, WatermarkPiece, WatermarkPieceKind } from '@photo-booth/types';
import { P } from '../components/brand/KelanaLogo';

/**
 * Watermark pieces (logo mark, full logo, Instagram, website, WhatsApp, free
 * text). Each piece becomes one SVG image that is fitted (no stretching) into
 * the piece's box and rotated around its centre, identically in the booth
 * preview, the frame editor and the printed / exported result.
 */

export const PIECE_KIND_LABELS: Record<WatermarkPieceKind, string> = {
  mark: 'Logo mark',
  logo: 'Logo + tulisan',
  instagram: 'Instagram',
  website: 'Website',
  whatsapp: 'WhatsApp',
  text: 'Teks bebas',
};

const DEFAULT_TEXT: Record<WatermarkPieceKind, string> = {
  mark: '',
  logo: '',
  instagram: '@kelanacirebon_',
  website: 'ruangkelana.com',
  whatsapp: '0852-8756-0280',
  text: 'Kelana Photobooth',
};

const isLogo = (kind: WatermarkPieceKind) => kind === 'mark' || kind === 'logo';
export const isContactKind = (kind: WatermarkPieceKind) =>
  kind === 'instagram' || kind === 'website' || kind === 'whatsapp';

const PALETTES = {
  brand: { blue: '#537796', olive: '#515543', gold: '#CFAD63', highlight: '#FFFFFF', word: '#5E4D42' },
  'brand-light': { blue: '#7FA2C2', olive: '#C3C8AE', gold: '#D9B96F', highlight: '#FFFFFF', word: '#F3EADF' },
};

const MARK_VIEW = { x: 37, y: 27, w: 954, h: 711 };
const LOGO_VIEW = { x: 37, y: 27, w: 2532, h: 711 };

const FONT_STACK = 'Helvetica Neue, Helvetica, Arial, sans-serif';
const FS = 100; // font size of the SVG text, the image is scaled to the box anyway

// Simple 24x24 line icons (stroke = currentColor).
const ICONS: Partial<Record<WatermarkPieceKind, string>> = {
  instagram:
    '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.4" cy="6.6" r="0.9" fill="currentColor" stroke="none"/>',
  website:
    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 3.9 5.6 3.9 9s-1.3 6.4-3.9 9M12 3c-2.6 2.6-3.9 5.6-3.9 9s1.3 6.4 3.9 9"/>',
  whatsapp:
    '<path d="M4.2 19.8l1.1-3.9A8.5 8.5 0 1 1 8.4 19z"/><path d="M9.2 8.6c.3-.6.6-.6.9-.6h.6c.2 0 .4.1.5.4l.8 1.9c.1.2 0 .5-.1.7l-.5.6c-.1.2-.1.4 0 .5.6 1 1.4 1.8 2.4 2.4.2.1.4.1.5 0l.6-.5c.2-.2.5-.2.7-.1l1.9.8c.3.1.4.3.4.5v.6c0 .3 0 .6-.6.9-.6.3-1.8.6-3.6-.4-1.4-.8-2.6-2-3.4-3.4-1-1.8-.7-3-.4-3.6z" fill="currentColor" stroke="none"/>',
};

const escapeXml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);

let measureCtx: CanvasRenderingContext2D | null = null;
const measureText = (text: string, bold: boolean): number => {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  if (!measureCtx) return text.length * FS * 0.55;
  measureCtx.font = `${bold ? 700 : 500} ${FS}px ${FONT_STACK}`;
  return measureCtx.measureText(text).width;
};

export interface PieceImage {
  url: string;
  /** width / height of the artwork, for fitting it into the box. */
  aspect: number;
}

const cache = new Map<string, PieceImage>();

/** The piece's artwork as an SVG data URL (cached). */
export const pieceImage = (piece: WatermarkPiece): PieceImage => {
  const key = JSON.stringify([piece.kind, piece.text, piece.color, piece.logoStyle, piece.showIcon, piece.bold, piece.opacity]);
  const hit = cache.get(key);
  if (hit) return hit;

  const opacity = Math.min(1, Math.max(0, piece.opacity ?? 1));
  let svg: string;
  let aspect: number;

  if (isLogo(piece.kind)) {
    const view = piece.kind === 'mark' ? MARK_VIEW : LOGO_VIEW;
    const style = piece.logoStyle ?? 'brand';
    const c =
      style === 'solid'
        ? { blue: piece.color, olive: piece.color, gold: piece.color, highlight: 'none', word: piece.color }
        : PALETTES[style] ?? PALETTES.brand;
    aspect = view.w / view.h;
    svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${view.w}" height="${view.h}" viewBox="${view.x} ${view.y} ${view.w} ${view.h}">` +
      `<g opacity="${opacity}">` +
      `<path fill="${c.olive}" d="${P.olive}"/>` +
      `<path fill="${c.blue}" fill-rule="evenodd" d="${P.blue}"/>` +
      (c.highlight === 'none' ? '' : `<path fill="${c.highlight}" d="${P.highlight}"/>`) +
      `<path fill="${c.gold}" d="${P.gold}"/>` +
      (piece.kind === 'logo' ? `<path fill="${c.word}" d="${P.elana}"/>` : '') +
      `</g></svg>`;
  } else {
    const text = piece.text || ' ';
    const bold = Boolean(piece.bold);
    const icon = piece.showIcon && ICONS[piece.kind] ? ICONS[piece.kind]! : '';
    const iconSize = icon ? FS * 0.95 : 0;
    const gap = icon ? FS * 0.3 : 0;
    const textW = Math.ceil(measureText(text, bold));
    const h = Math.ceil(FS * 1.25);
    const w = Math.ceil(iconSize + gap + textW + FS * 0.05);
    aspect = w / h;
    svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
      `<g opacity="${opacity}" style="color:${piece.color}">` +
      (icon
        ? `<svg x="0" y="${((h - iconSize) / 2).toFixed(1)}" width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" ` +
          `fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>`
        : '') +
      `<text x="${(iconSize + gap).toFixed(1)}" y="${(FS * 0.93).toFixed(1)}" font-family="${FONT_STACK}" ` +
      `font-weight="${bold ? 700 : 500}" font-size="${FS}" fill="${piece.color}">${escapeXml(text)}</text>` +
      `</g></svg>`;
  }

  const image = { url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, aspect };
  if (cache.size > 200) cache.clear();
  cache.set(key, image);
  return image;
};

/** Where the artwork lands inside the piece box (fitted, centred), in frame px. */
export const fitInBox = (piece: Pick<WatermarkPiece, 'x' | 'y' | 'width' | 'height'>, aspect: number) => {
  let w = piece.width;
  let h = w / aspect;
  if (h > piece.height) {
    h = piece.height;
    w = h * aspect;
  }
  return { x: piece.x + (piece.width - w) / 2, y: piece.y + (piece.height - h) / 2, width: w, height: h };
};

let idCounter = 0;
const newId = () => `wm-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

/** A new piece of the given kind, sized for the frame and placed near the bottom centre. */
export const createWatermarkPiece = (
  kind: WatermarkPieceKind,
  template: Pick<FrameTemplateConfig, 'width' | 'height'>,
  existingCount = 0,
): WatermarkPiece => {
  const base: WatermarkPiece = {
    id: newId(),
    kind,
    text: DEFAULT_TEXT[kind],
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    rotation: 0,
    color: '#F5EBDD',
    logoStyle: 'brand-light',
    showIcon: isContactKind(kind),
    bold: false,
    opacity: 0.95,
  };
  const { aspect } = pieceImage(base);
  const width = Math.round(template.width * (kind === 'mark' ? 0.1 : kind === 'logo' ? 0.28 : 0.4));
  const height = Math.max(8, Math.round(width / aspect));
  const offset = (existingCount % 5) * Math.round(height * 1.2);
  return {
    ...base,
    width,
    height,
    x: Math.round((template.width - width) / 2),
    y: Math.max(0, Math.round(template.height * 0.93 - height - offset)),
  };
};
