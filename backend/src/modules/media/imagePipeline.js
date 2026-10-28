// Image pipeline: every upload is decoded and re-encoded, never stored as uploaded.
// - Re-encoding to WebP drops anything hidden in the original (scripts in polyglot files, trailing data).
// - EXIF/XMP/ICC metadata (incl. phone GPS location) is not copied: sharp only keeps it if asked to.
// - Huge or "decompression bomb" images are refused before decoding (pixel limit + side limit).
import sharp from 'sharp';
import { IMAGE_WIDTHS } from '../../config/constants.js';

sharp.cache(false); // no decoded-image cache: keeps memory flat on a small server
sharp.concurrency(1); // one libvips thread per image; uploads are queued one at a time anyway

export const MAX_SIDE_PX = 10_000;
const MAX_INPUT_PIXELS = 40_000_000; // ~40 megapixels: enough for any phone photo
const WEBP_QUALITY = 80;
// Per processing step: a normal photo takes well under a second; anything near this is hostile or broken.
const STEP_TIMEOUT_SECONDS = 30;

export class ImageRejectedError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const open = (input) => sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error', pages: 1 });
// Reading the header never decodes pixels, so it runs without sharp's pixel limit: that lets us tell the
// admin the real size instead of "unreadable". Decoding (open) keeps the hard limit as a second guard.
const readHeader = (input) => sharp(input, { limitInputPixels: false, failOn: 'error', pages: 1 }).metadata();

/**
 * Turn an uploaded file into WebP renditions (480/960/1600 px wide, never upscaled) and a tiny
 * blurred placeholder. Returns { width, height, variants: [{ width, height, data }], placeholder }.
 */
export async function processImage(inputPath) {
  let meta;
  try {
    meta = await readHeader(inputPath);
  } catch {
    throw new ImageRejectedError('IMAGE_UNREADABLE', 'This image file is damaged or not a real image. Try exporting it again as JPEG or PNG.');
  }
  if (!meta.width || !meta.height) {
    throw new ImageRejectedError('IMAGE_UNREADABLE', 'This image file is damaged or not a real image. Try exporting it again as JPEG or PNG.');
  }
  if (meta.width > MAX_SIDE_PX || meta.height > MAX_SIDE_PX || meta.width * meta.height > MAX_INPUT_PIXELS) {
    throw new ImageRejectedError(
      'IMAGE_TOO_LARGE',
      `This image is ${meta.width} × ${meta.height} pixels. The limit is ${MAX_SIDE_PX.toLocaleString('en-IN')} pixels on a side and 40 megapixels; resize it and try again.`,
    );
  }

  // EXIF orientations 5–8 rotate by 90°, swapping width and height once applied.
  const swapped = (meta.orientation ?? 1) >= 5;
  const width = swapped ? meta.height : meta.width;
  const height = swapped ? meta.width : meta.height;

  // Widths smaller than the original, plus the original width itself if it's under the largest rendition.
  const targets = [...new Set([...IMAGE_WIDTHS.filter((w) => w < width), Math.min(width, IMAGE_WIDTHS.at(-1))])].sort((a, b) => a - b);
  try {
    // Decode the original once, upright and already shrunk to the largest rendition, as raw pixels
    // (no metadata survives). Every rendition is made from that, never from the original again.
    const { data: pixels, info } = await open(inputPath)
      .rotate()
      .toColorspace('srgb')
      .resize({ width: targets.at(-1), withoutEnlargement: true })
      .raw()
      .timeout({ seconds: STEP_TIMEOUT_SECONDS })
      .toBuffer({ resolveWithObject: true });
    const fromPixels = () => sharp(pixels, { raw: { width: info.width, height: info.height, channels: info.channels } }).timeout({ seconds: STEP_TIMEOUT_SECONDS });

    const variants = [];
    for (const target of targets) {
      const out = await fromPixels()
        .resize({ width: target, withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY, effort: 4 })
        .toBuffer({ resolveWithObject: true });
      variants.push({ width: out.info.width, height: out.info.height, data: out.data });
    }
    // The placeholder is flattened onto a neutral colour, so it never shows through transparent images.
    const tiny = await fromPixels().resize(16, 16, { fit: 'inside' }).flatten({ background: '#d9d4cc' }).webp({ quality: 40 }).toBuffer();
    return { width, height, variants, placeholder: `data:image/webp;base64,${tiny.toString('base64')}` };
  } catch (err) {
    if (/timeout/i.test(err?.message ?? '')) {
      throw new ImageRejectedError('IMAGE_TOO_COMPLEX', 'This image took too long to process. Export it again as a standard JPEG or PNG, or make it smaller, and try again.');
    }
    throw new ImageRejectedError('IMAGE_UNREADABLE', 'This image could not be processed. Try exporting it again as JPEG or PNG.');
  }
}
