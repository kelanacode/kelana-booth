import type { FrameWatermark } from '@photo-booth/types';
import { P } from '../components/brand/KelanaLogo';

/**
 * Kelana watermark presets: the K mark alone, the full logo (mark + "elana")
 * or no logo, plus any of Instagram / website / WhatsApp on one line under it.
 * It is built as one SVG in frame pixels, so the booth preview (<img>) and
 * the printed / exported result (canvas drawImage) look identical.
 */

export const DEFAULT_WATERMARK: FrameWatermark = {
  enabled: false,
  logo: 'logo',
  showInstagram: true,
  instagram: '@kelanacirebon_',
  showWebsite: false,
  website: 'ruangkelana.com',
  showWhatsapp: false,
  whatsapp: '0852-8756-0280',
  position: 'bottom-center',
  tone: 'light',
  size: 0.045,
  opacity: 0.9,
  repeatPerStrip: false,
};

export const withWatermarkDefaults = (wm?: Partial<FrameWatermark> | null): FrameWatermark => ({
  ...DEFAULT_WATERMARK,
  ...(wm ?? {}),
});

const PALETTE = {
  color: { blue: '#537796', olive: '#515543', gold: '#CFAD63', highlight: '#FFFFFF', word: '#5E4D42', text: '#5E4D42' },
  light: { blue: '#7FA2C2', olive: '#C3C8AE', gold: '#D9B96F', highlight: '#FFFFFF', word: '#F3EADF', text: '#F5EBDD' },
  dark: { blue: '#2B2B2B', olive: '#2B2B2B', gold: '#2B2B2B', highlight: '#FFFFFF', word: '#2B2B2B', text: '#2B2B2B' },
};

const MARK_VIEW = { x: 37, y: 27, w: 954, h: 711 };
const LOGO_VIEW = { x: 37, y: 27, w: 2532, h: 711 };

const escapeXml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);

export interface WatermarkImage {
  /** SVG data URL. */
  url: string;
  /** Placement in frame pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The contact line, e.g. "@kelanacirebon_ · ruangkelana.com · WA 0852-8756-0280". */
export const watermarkContactLine = (wm: FrameWatermark): string =>
  [
    wm.showInstagram && wm.instagram.trim() ? wm.instagram.trim() : '',
    wm.showWebsite && wm.website.trim() ? wm.website.trim() : '',
    wm.showWhatsapp && wm.whatsapp.trim() ? `WA ${wm.whatsapp.trim()}` : '',
  ]
    .filter(Boolean)
    .join('  ·  ');

/**
 * All watermark placements for a frame: one, or one per strip half when
 * repeatPerStrip is on (double strips that are cut in two).
 */
export const buildWatermarks = (
  watermark: Partial<FrameWatermark> | null | undefined,
  frameWidth: number,
  frameHeight: number,
): WatermarkImage[] => {
  const wm = withWatermarkDefaults(watermark);
  if (!wm.repeatPerStrip) {
    const one = buildWatermark(wm, frameWidth, frameHeight);
    return one ? [one] : [];
  }
  const half = frameWidth / 2;
  const one = buildWatermark(wm, half, frameHeight);
  return one ? [one, { ...one, x: one.x + half }] : [];
};

/** Builds the watermark for a frame (or one strip) of the given size, or null when off/empty. */
export const buildWatermark = (
  watermark: Partial<FrameWatermark> | null | undefined,
  frameWidth: number,
  frameHeight: number,
): WatermarkImage | null => {
  const wm = withWatermarkDefaults(watermark);
  const line = watermarkContactLine(wm);
  if (!wm.enabled || (wm.logo === 'none' && !line) || frameWidth <= 0 || frameHeight <= 0) return null;

  const c = PALETTE[wm.tone] ?? PALETTE.light;
  const logoH = wm.logo === 'none' ? 0 : Math.max(8, frameWidth * wm.size);
  const fontSize = Math.max(8, (logoH || frameWidth * wm.size) * (logoH ? 0.42 : 0.55));
  const gap = logoH && line ? fontSize * 0.45 : 0;
  const lineH = line ? fontSize * 1.25 : 0;
  const boxW = frameWidth * 0.9;
  const boxH = Math.ceil(logoH + gap + lineH);
  const margin = frameWidth * 0.035;

  const pos = wm.position;
  const align = pos.endsWith('left') ? 'start' : pos.endsWith('right') ? 'end' : 'middle';
  const x = align === 'start' ? margin : align === 'end' ? frameWidth - margin - boxW : (frameWidth - boxW) / 2;
  const y = pos.startsWith('top') ? margin : frameHeight - margin - boxH;

  let logoSvg = '';
  if (wm.logo !== 'none') {
    const view = wm.logo === 'mark' ? MARK_VIEW : LOGO_VIEW;
    const logoW = (logoH * view.w) / view.h;
    const lx = align === 'start' ? 0 : align === 'end' ? boxW - logoW : (boxW - logoW) / 2;
    logoSvg =
      `<svg x="${lx.toFixed(2)}" y="0" width="${logoW.toFixed(2)}" height="${logoH.toFixed(2)}" ` +
      `viewBox="${view.x} ${view.y} ${view.w} ${view.h}">` +
      `<path fill="${c.olive}" d="${P.olive}"/>` +
      `<path fill="${c.blue}" fill-rule="evenodd" d="${P.blue}"/>` +
      `<path fill="${c.highlight}" d="${P.highlight}"/>` +
      `<path fill="${c.gold}" d="${P.gold}"/>` +
      (wm.logo === 'logo' ? `<path fill="${c.word}" d="${P.elana}"/>` : '') +
      `</svg>`;
  }

  const textX = align === 'start' ? 0 : align === 'end' ? boxW : boxW / 2;
  const textSvg = line
    ? `<text x="${textX.toFixed(2)}" y="${(logoH + gap + fontSize).toFixed(2)}" text-anchor="${align}" ` +
      `font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-weight="600" font-size="${fontSize.toFixed(2)}" ` +
      `letter-spacing="${(fontSize * 0.02).toFixed(2)}" fill="${c.text}">${escapeXml(line)}</text>`
    : '';

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${boxW.toFixed(0)}" height="${boxH}" ` +
    `viewBox="0 0 ${boxW.toFixed(2)} ${boxH}"><g opacity="${Math.min(1, Math.max(0, wm.opacity))}">` +
    logoSvg +
    textSvg +
    `</g></svg>`;

  return {
    url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    x,
    y,
    width: boxW,
    height: boxH,
  };
};
