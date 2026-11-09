import React from 'react';
import { KELANA_LOGO_PATHS } from '@photo-booth/types';

/**
 * Kelana brand (traced from the official logo). The mark IS the letter K
 * (blue K with the camera lens, olive speed lines, gold sparkle), so brand text
 * beside it is "elana": the two read "Kelana". Never put "KELANA" next to it.
 * Same paths as public/brand/*.svg and the app icons.
 *
 *  - KelanaMark:  the K mark alone (icons, avatars, tight spaces)
 *  - KelanaLogo:  K mark + "elana" (headers, start screens)
 *
 * Colors are the brand palette. On a dark background pass `variant="light"`
 * (cream "elana", light speed lines); for backwards compatibility a light
 * `ink` color selects it automatically.
 */

export const KELANA_BLUE = '#537796';
export const KELANA_OLIVE = '#515543';
export const KELANA_GOLD = '#CFAD63';
export const KELANA_BROWN = '#5E4D42';
export const KELANA_CREAM = '#F5EBDD';
/** @deprecated old palette names, kept so existing imports keep working. */
export const KELANA_NAVY = KELANA_BLUE;
export const KELANA_ORANGE = KELANA_GOLD;

/** Logo paths (mark: olive/blue/highlight/gold, viewBox 37 27 954 711; with elana: 37 27 2532 711). */
export const P = KELANA_LOGO_PATHS;

const COLORS = {
  color: {"blue":"#537796","olive":"#515543","gold":"#CFAD63","brown":"#5E4D42","highlight":"#FFFFFF"},
  light: {"blue":"#7FA2C2","olive":"#C3C8AE","gold":"#D9B96F","brown":"#F3EADF","highlight":"#FFFFFF"},
};

type Variant = keyof typeof COLORS;

interface BrandProps {
  className?: string;
  style?: React.CSSProperties;
  title?: string;
  /** 'color' on light backgrounds, 'light' on dark ones. */
  variant?: Variant;
  /** @deprecated old prop: a light ink color selects the light variant. */
  ink?: string;
  /** @deprecated ignored (the brand colors are fixed). */
  accent?: string;
  /** @deprecated ignored. */
  light?: string;
}

const luminance = (hex: string): number => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h.slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const pick = (variant?: Variant, ink?: string): (typeof COLORS)['color'] =>
  COLORS[variant ?? (ink && /^#[0-9a-f]{3,8}$/i.test(ink) && luminance(ink) > 0.55 ? 'light' : 'color')];

const Mark: React.FC<{ c: (typeof COLORS)['color'] }> = ({ c }) => (
  <>
    <path fill={c.olive} d={P.olive} />
    <path fill={c.blue} fillRule="evenodd" d={P.blue} />
    <path fill={c.highlight} d={P.highlight} />
    <path fill={c.gold} d={P.gold} />
  </>
);

/** The mark alone. */
export const KelanaMark: React.FC<BrandProps> = ({ className, style, title = 'Kelana', variant, ink }) => (
  <svg viewBox="37 27 954 711" className={className} style={style} role="img" aria-label={title}>
    <Mark c={pick(variant, ink)} />
  </svg>
);

/** K mark + "elana" (about 3.6 : 1). */
export const KelanaLogo: React.FC<BrandProps> = ({ className, style, title = 'Kelana', variant, ink }) => {
  const c = pick(variant, ink);
  return (
    <svg viewBox="37 27 2532 711" className={className} style={style} role="img" aria-label={title}>
      <Mark c={c} />
      <path fill={c.brown} d={P.elana} />
    </svg>
  );
};

export default KelanaLogo;
