import { FrameConfig, FramePhotoPlacement, FrameTemplateConfig } from '@photo-booth/types';

/**
 * Blank frame canvas: the print layout's 97 × 140 mm frame box at 300 dpi, so
 * a frame built without artwork prints without being stretched (see
 * lib/printSheet.ts).
 */
export const DEFAULT_FRAME_CANVAS = {
  width: 1146,
  height: 1654,
} as const;

const DEFAULT_SLOT_LAYOUTS: Record<number, FramePhotoPlacement[]> = {
  1: [
    {
      slotNumber: 1,
      sourcePhotoSlot: 1,
      x: 115,
      y: 165,
      width: 917,
      height: 1199,
      borderRadius: 0,
      zIndex: 10,
      objectFit: 'cover',
      objectPosition: 'center',
    },
  ],
  2: [
    {
      slotNumber: 1,
      sourcePhotoSlot: 1,
      x: 124,
      y: 155,
      width: 898,
      height: 538,
      borderRadius: 0,
      zIndex: 10,
      objectFit: 'cover',
      objectPosition: 'center',
    },
    {
      slotNumber: 2,
      sourcePhotoSlot: 2,
      x: 124,
      y: 765,
      width: 898,
      height: 538,
      borderRadius: 0,
      zIndex: 10,
      objectFit: 'cover',
      objectPosition: 'center',
    },
  ],
  3: [
    {
      slotNumber: 1,
      sourcePhotoSlot: 1,
      x: 138,
      y: 145,
      width: 869,
      height: 351,
      borderRadius: 0,
      zIndex: 10,
      objectFit: 'cover',
      objectPosition: 'center',
    },
    {
      slotNumber: 2,
      sourcePhotoSlot: 2,
      x: 138,
      y: 538,
      width: 869,
      height: 351,
      borderRadius: 0,
      zIndex: 10,
      objectFit: 'cover',
      objectPosition: 'center',
    },
    {
      slotNumber: 3,
      sourcePhotoSlot: 3,
      x: 138,
      y: 930,
      width: 869,
      height: 351,
      borderRadius: 0,
      zIndex: 10,
      objectFit: 'cover',
      objectPosition: 'center',
    },
    
  ],
};

const createStackedSlots = (photoSlotCount: number): FramePhotoPlacement[] => {
  const gap = 43;
  const x = 115;
  const y = 145;
  const width = 917;
  const availableHeight = 1220;
  const slotHeight = (availableHeight - gap * (photoSlotCount - 1)) / photoSlotCount;

  return Array.from({ length: photoSlotCount }, (_, index) => ({
    slotNumber: index + 1,
    sourcePhotoSlot: index + 1,
    x,
    y: y + (slotHeight + gap) * index,
    width,
    height: slotHeight,
    borderRadius: 0,
    zIndex: 10,
    objectFit: 'cover',
    objectPosition: 'center',
  }));
};

export const createFallbackFrameTemplate = (photoSlotCount: number): FrameTemplateConfig => {
  const normalizedSlotCount = Math.max(1, Math.floor(photoSlotCount));

  return {
    assetUrl: '',
    width: DEFAULT_FRAME_CANVAS.width,
    height: DEFAULT_FRAME_CANVAS.height,
    backgroundColor: '#ffffff',
    frameLayerZIndex: 30,
    photoSlots: DEFAULT_SLOT_LAYOUTS[normalizedSlotCount] ?? createStackedSlots(normalizedSlotCount),
  };
};

export const resolveFrameTemplate = (
  frame: FrameConfig | null | undefined,
  photoSlotCount: number,
): FrameTemplateConfig => {
  const normalizedSlotCount = Math.max(1, Math.floor(photoSlotCount));

  return (
    frame?.templatesByPhotoSlots?.[normalizedSlotCount] ??
    frame?.template ??
    createFallbackFrameTemplate(normalizedSlotCount)
  );
};

const objectPositionOffset = (value: string, axis: 'x' | 'y'): number => {
  if (value === 'center') return 0.5;
  if (axis === 'x' && value === 'left') return 0;
  if (axis === 'x' && value === 'right') return 1;
  if (axis === 'y' && value === 'top') return 0;
  if (axis === 'y' && value === 'bottom') return 1;
  const percentage = value.match(/^(-?\d+(?:\.\d+)?)%$/);
  return percentage ? Number(percentage[1]) / 100 : 0.5;
};

export const resolveObjectPosition = (position = 'center') => {
  const tokens = position.trim().toLowerCase().split(/\s+/);
  let [horizontal = 'center', vertical = 'center'] = tokens;

  if (tokens.length === 1 && ['top', 'bottom'].includes(horizontal)) {
    vertical = horizontal;
    horizontal = 'center';
  } else if (['top', 'bottom'].includes(horizontal) && ['left', 'right'].includes(vertical)) {
    [horizontal, vertical] = [vertical, horizontal];
  }

  return {
    x: objectPositionOffset(horizontal, 'x'),
    y: objectPositionOffset(vertical, 'y'),
  };
};
