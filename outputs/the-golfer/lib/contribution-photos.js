import sharp from 'sharp';

export const CONTRIBUTION_BUCKET = 'player-contributions';
export const CONTRIBUTION_MAX_INPUT_BYTES = 5 * 1024 * 1024;
export const CONTRIBUTION_MAX_OUTPUT_BYTES = 2 * 1024 * 1024;

export function decodeDataUrl(dataUrl) {
  const raw = String(dataUrl || '');
  const match = raw.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw Object.assign(new Error('Photo must be a valid data URL.'), { status: 400 });
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length) throw Object.assign(new Error('Photo data is empty.'), { status: 400 });
  if (!/^image\/(jpeg|png|webp)$/i.test(match[1])) {
    throw Object.assign(new Error('Only JPEG, PNG, and WebP photos are supported.'), { status: 400 });
  }
  if (buffer.length > CONTRIBUTION_MAX_INPUT_BYTES) {
    throw Object.assign(new Error('Photo must be under 5 MB.'), { status: 400 });
  }
  return { declaredMime: match[1].toLowerCase(), buffer };
}

export async function normalizeContributionPhoto(buffer) {
  const png = buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpg = buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
  const webp = buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  if (!png && !jpg && !webp) {
    throw Object.assign(new Error('Only JPEG, PNG, and WebP photos are supported.'), { status: 400 });
  }

  const metadata = await sharp(buffer, { limitInputPixels: 16000000, failOn: 'warning' })
    .rotate()
    .metadata();
  if ((metadata.width || 0) > 8000 || (metadata.height || 0) > 8000) {
    throw Object.assign(new Error('Photo dimensions are too large.'), { status: 400 });
  }

  const output = await sharp(buffer, { limitInputPixels: 16000000, failOn: 'warning' })
    .rotate()
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();

  if (output.length > CONTRIBUTION_MAX_OUTPUT_BYTES) {
    throw Object.assign(new Error('The optimized photo exceeds 2 MB.'), { status: 400 });
  }

  return { buffer: output, mime: 'image/jpeg', ext: 'jpg' };
}
