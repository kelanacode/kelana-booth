import type { FrameQRPlacement } from '@photo-booth/types';

/**
 * QR placeholders get slightly rounded corners by default (not sharp). A
 * radius of 0 / unset means "default": about 6% of the QR's side. Any radius
 * the admin sets explicitly is used as is. The rounding only trims the QR
 * image's white quiet zone, so scanning is unaffected.
 */
export const QR_DEFAULT_RADIUS_RATIO = 0.06;

/** Corner radius in frame pixels. */
export const qrCornerRadius = (slot: Pick<FrameQRPlacement, 'width' | 'height' | 'borderRadius'>): number =>
  slot.borderRadius && slot.borderRadius > 0
    ? slot.borderRadius
    : Math.round(Math.min(slot.width, slot.height) * QR_DEFAULT_RADIUS_RATIO);

/** Same radius as CSS that scales with the preview (percent of the box). */
export const qrCornerRadiusCss = (slot: Pick<FrameQRPlacement, 'width' | 'height' | 'borderRadius'>): string => {
  const r = qrCornerRadius(slot);
  const w = Math.max(1, slot.width);
  const h = Math.max(1, slot.height);
  return `${((r / w) * 100).toFixed(3)}% / ${((r / h) * 100).toFixed(3)}%`;
};
