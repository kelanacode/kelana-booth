/**
 * Frame photo-area detection by solid color key (any color, not only green).
 *
 * The designer paints each photo area as a flat, vivid rectangle. Areas
 * painted the SAME color are the SAME source photo: two magenta boxes are both
 * "Photo 1", two blue boxes both "Photo 2", and so on (double strips, repeated
 * shots). Sources are numbered in reading order of their first area.
 *
 * Detection: region-growing over a downscaled copy finds connected areas of
 * near-uniform color, keeping those that are vivid (saturated), big enough and
 * roughly rectangular (they fill most of their bounding box), so text,
 * ornaments, gradients and the frame background are ignored.
 *
 * Keying: each area's color is made transparent only inside that area's box
 * (with a soft edge), so the same color used elsewhere in the artwork stays.
 */

export interface ColorKeyRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  /** 1-based source photo; areas with the same color share it. */
  source: number;
  /** Key color of the area, as #rrggbb. */
  color: string;
}

export interface ColorKeyedFrame {
  assetUrl: string;
  width: number;
  height: number;
  regions: ColorKeyRegion[];
  /** Number of distinct colors = number of source photos. */
  sourceCount: number;
}

export interface ColorKeyOptions {
  /** Max size of the detection copy, in px (longest side). */
  detectSize?: number;
  /** Max RGB distance between pixels of one flat area. */
  tolerance?: number;
  /** Smallest area, as a share of the image. */
  minRegionRatio?: number;
  /** Largest area, as a share of the image (bigger = background). */
  maxRegionRatio?: number;
  /** How much of its bounding box an area must fill (rectangle-ness). */
  minFill?: number;
  /** Minimum HSV saturation of a key color (excludes white/black/grey). */
  minSaturation?: number;
  /** Max RGB distance for two areas to count as the same color. */
  sameColorDistance?: number;
}

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load image'));
    image.src = src;
  });

const dist = (r1: number, g1: number, b1: number, r2: number, g2: number, b2: number) =>
  Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);

const saturation = (r: number, g: number, b: number) => {
  const max = Math.max(r, g, b);
  return max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
};

const hex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

interface Area {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  count: number;
  r: number;
  g: number;
  b: number;
}

/** Finds flat, vivid, rectangular color areas (in full-image pixels). */
export const detectColorKeyRegions = async (
  imageUrl: string,
  options: ColorKeyOptions = {},
): Promise<{ regions: ColorKeyRegion[]; width: number; height: number; sourceCount: number }> => {
  const detectSize = options.detectSize ?? 400;
  const tolerance = options.tolerance ?? 28;
  const minRegionRatio = options.minRegionRatio ?? 0.003;
  const maxRegionRatio = options.maxRegionRatio ?? 0.6;
  const minFill = options.minFill ?? 0.8;
  const minSaturation = options.minSaturation ?? 0.6;
  const sameColorDistance = options.sameColorDistance ?? 48;

  const image = await loadImage(imageUrl);
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (!width || !height) return { regions: [], width, height, sourceCount: 0 };

  const scale = Math.min(1, detectSize / Math.max(width, height));
  const sw = Math.max(2, Math.round(width * scale));
  const sh = Math.max(2, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { regions: [], width, height, sourceCount: 0 };
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0, sw, sh);
  const { data } = ctx.getImageData(0, 0, sw, sh);

  const total = sw * sh;
  const visited = new Uint8Array(total);
  const minArea = Math.max(6, Math.round(total * minRegionRatio));
  const maxArea = Math.round(total * maxRegionRatio);
  const areas: Area[] = [];
  const stack: number[] = [];

  for (let start = 0; start < total; start++) {
    if (visited[start]) continue;
    const sp = start * 4;
    const sr = data[sp];
    const sg = data[sp + 1];
    const sb = data[sp + 2];
    // Only opaque, vivid pixels can seed a key area.
    if (data[sp + 3] < 200 || saturation(sr, sg, sb) < minSaturation) {
      visited[start] = 1;
      continue;
    }

    // Grow over neighbours close to the seed color.
    stack.length = 0;
    stack.push(start);
    visited[start] = 1;
    let minX = start % sw;
    let maxX = minX;
    let minY = (start - minX) / sw;
    let maxY = minY;
    let count = 0;
    let rs = 0;
    let gs = 0;
    let bs = 0;
    const members: number[] = [];

    while (stack.length > 0) {
      const idx = stack.pop()!;
      const x = idx % sw;
      const y = (idx - x) / sw;
      const p = idx * 4;
      count++;
      rs += data[p];
      gs += data[p + 1];
      bs += data[p + 2];
      members.push(idx);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      const neighbours = [x > 0 ? idx - 1 : -1, x < sw - 1 ? idx + 1 : -1, y > 0 ? idx - sw : -1, y < sh - 1 ? idx + sw : -1];
      for (const n of neighbours) {
        if (n < 0 || visited[n]) continue;
        const q = n * 4;
        if (data[q + 3] >= 200 && dist(data[q], data[q + 1], data[q + 2], sr, sg, sb) <= tolerance) {
          visited[n] = 1;
          stack.push(n);
        }
      }
    }

    const boxArea = (maxX - minX + 1) * (maxY - minY + 1);
    if (count < minArea || count > maxArea || count / boxArea < minFill) {
      // Not a key area: let its pixels seed again only as part of nothing.
      continue;
    }
    areas.push({ minX, minY, maxX, maxY, count, r: rs / count, g: gs / count, b: bs / count });
  }

  // Reading order: top to bottom, then left to right (rows by overlap).
  areas.sort((a, b) => {
    const sameRow = a.minY <= b.maxY && b.minY <= a.maxY;
    return sameRow ? a.minX - b.minX : a.minY - b.minY;
  });

  // Same color => same source photo.
  const palette: Array<{ r: number; g: number; b: number }> = [];
  const inv = 1 / scale;
  const regions: ColorKeyRegion[] = areas.map((a) => {
    let source = palette.findIndex((c) => dist(c.r, c.g, c.b, a.r, a.g, a.b) <= sameColorDistance);
    if (source < 0) {
      palette.push({ r: a.r, g: a.g, b: a.b });
      source = palette.length - 1;
    }
    // Grow by half a detection pixel each side so the photo fully covers
    // the hole (the frame layer sits on top and hides any overlap).
    const x = Math.max(0, Math.floor((a.minX - 0.5) * inv));
    const y = Math.max(0, Math.floor((a.minY - 0.5) * inv));
    const right = Math.min(width, Math.ceil((a.maxX + 1.5) * inv));
    const bottom = Math.min(height, Math.ceil((a.maxY + 1.5) * inv));
    return { x, y, width: right - x, height: bottom - y, source: source + 1, color: hex(a.r, a.g, a.b) };
  });

  return { regions, width, height, sourceCount: palette.length };
};

/**
 * Makes each detected area's key color transparent, only inside that area
 * (plus a small margin), with a soft edge for anti-aliased borders.
 */
export const removeColorKeys = async (
  imageUrl: string,
  regions: ColorKeyRegion[],
  options: { hardDistance?: number; softDistance?: number } = {},
): Promise<string> => {
  const hard = options.hardDistance ?? 40;
  const soft = options.softDistance ?? 80;
  const image = await loadImage(imageUrl);
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || regions.length === 0) return imageUrl;
  ctx.drawImage(image, 0, 0);

  for (const region of regions) {
    const kr = parseInt(region.color.slice(1, 3), 16);
    const kg = parseInt(region.color.slice(3, 5), 16);
    const kb = parseInt(region.color.slice(5, 7), 16);
    const margin = Math.max(2, Math.round(Math.max(width, height) * 0.004));
    const x0 = Math.max(0, region.x - margin);
    const y0 = Math.max(0, region.y - margin);
    const x1 = Math.min(width, region.x + region.width + margin);
    const y1 = Math.min(height, region.y + region.height + margin);
    const img = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const distance = dist(d[i], d[i + 1], d[i + 2], kr, kg, kb);
      if (distance <= hard) {
        d[i + 3] = 0;
      } else if (distance < soft) {
        const keep = (distance - hard) / (soft - hard);
        d[i + 3] = Math.min(d[i + 3], Math.round(255 * keep));
      }
    }
    ctx.putImageData(img, x0, y0);
  }

  return canvas.toDataURL('image/png');
};

/** Full pipeline for an uploaded frame: detect areas, group by color, key them out. */
export const processColorKeyedFrame = async (imageUrl: string, options?: ColorKeyOptions): Promise<ColorKeyedFrame> => {
  const { regions, width, height, sourceCount } = await detectColorKeyRegions(imageUrl, options);
  const assetUrl = regions.length > 0 ? await removeColorKeys(imageUrl, regions) : imageUrl;
  return { assetUrl, width, height, regions, sourceCount };
};
