/**
 * Downscale an image in the browser before it is uploaded.
 *
 * ## Why this is not optional
 *
 * A modern phone screenshot is 2–5 MB and 1179×2556. Six of those, base64
 * encoded (+33%), is ~40 MB — far past nginx's `client_max_body_size 12M`, over
 * a gym's mobile connection, onto a Raspberry Pi's SD card. Compressed here they
 * land at roughly 200–400 KB each and the whole report fits comfortably.
 *
 * Doing it client-side rather than server-side is deliberate: the bytes that
 * never leave the phone are the cheapest bytes in the system, and the Pi has no
 * image library installed (adding `sharp` would mean a native ARM build on every
 * deploy for something a `<canvas>` already does).
 *
 * ## Fidelity
 *
 * 1600px on the long edge at JPEG q0.82 keeps UI text in a screenshot legible —
 * the whole point of attaching one. EXIF is dropped by the canvas round-trip,
 * which is a privacy gain: phone photos carry GPS coordinates.
 */

/** Long-edge cap. Above this, UI text in a screenshot is legible anyway. */
const MAX_EDGE = 1600;

/** JPEG quality. Below ~0.75 small text in a screenshot starts to smear. */
const QUALITY = 0.82;

/** Refuse absurd inputs before decoding them into memory. */
const MAX_INPUT_BYTES = 25 * 1024 * 1024;

export interface CompressedImage {
  /** `data:image/jpeg;base64,…` — exactly what `POST /feedback` expects. */
  dataUrl: string;
  /** Approximate encoded size in bytes, for showing the user what they added. */
  bytes: number;
}

/**
 * Compress one file to a data URL.
 *
 * @throws Error with a user-showable message — the caller renders it directly,
 *         so the strings here are copy, not diagnostics.
 *
 * PNG in, JPEG out: a screenshot has no transparency worth keeping and JPEG is
 * several times smaller. The one real cost is that a PNG with an alpha channel
 * flattens onto white, which is why the canvas is filled before drawing —
 * without it, transparent regions render black in most encoders.
 */
export async function compressImage(file: File): Promise<CompressedImage> {
  if (!file.type.startsWith('image/')) throw new Error(`${file.name} is not an image`);
  if (file.size > MAX_INPUT_BYTES) throw new Error(`${file.name} is too large`);

  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot process images');

  // Flatten onto white first — a transparent PNG encodes to black otherwise.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h);

  // `close()` where supported: an ImageBitmap holds decoded pixels off-heap and
  // six phone screenshots is a lot of memory to leave to the collector.
  if ('close' in bitmap && typeof (bitmap as ImageBitmap).close === 'function') {
    (bitmap as ImageBitmap).close();
  }

  const dataUrl = canvas.toDataURL('image/jpeg', QUALITY);
  // base64 is 4 chars per 3 bytes; the padding correction keeps the figure
  // honest enough for a size label.
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bytes = Math.round((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);

  return { dataUrl, bytes };
}

/**
 * Decode a file to something drawable.
 *
 * `createImageBitmap` is faster and does not touch the DOM, but Safari did not
 * support it for Blobs until 15 — so the `<img>` path stays as a fallback
 * rather than being deleted for being redundant on modern browsers.
 */
async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // Fall through — a decode failure here is not fatal.
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not read ${file.name}`));
    };
    img.src = url;
  });
}

/** Human-readable size for the attachment chips. */
export const fmtBytes = (n: number) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
