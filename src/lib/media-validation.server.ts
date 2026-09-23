import { inflateSync } from 'node:zlib';

const MAX_IMAGE_BYTES = 16_000_000;
const MAX_AUDIO_BYTES = 8_000_000;
const IMAGE_ERROR = 'The image provider did not return a usable illustration. Your completed pictures have been kept.';
const AUDIO_ERROR = 'The saved recording is invalid. Your listening script and other completed materials have been kept.';

function decodeBase64(value: unknown, limit: number): Buffer | undefined {
  if (typeof value !== 'string' || !value.length || value.length > Math.ceil(limit / 3) * 4 ||
      value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return;
  const bytes = Buffer.from(value, 'base64');
  // Buffer's decoder accepts malformed padding and silently ignores bad bytes.
  if (bytes.length > limit || bytes.toString('base64') !== value) return;
  return bytes;
}

function dimensions(width: number, height: number) {
  return width > 0 && height > 0 && width <= 8192 && height <= 8192 && width * height <= 16_777_216;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let value = n;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function isPng(bytes: Buffer) {
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return false;
  let offset = 8, width = 0, height = 0, depth = 0, channels = 0, interlaced = 0;
  const compressed: Buffer[] = [];
  let palette = false, color = -1, ended = false;
  while (offset + 12 <= bytes.length) {
    const size = bytes.readUInt32BE(offset), end = offset + 12 + size;
    if (end > bytes.length) return false;
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, end - 4);
    if (!/^[A-Za-z]{4}$/.test(type) || crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) return false;
    if (offset === 8 && type !== 'IHDR') return false;
    if (type === 'IHDR') {
      if (offset !== 8 || size !== 13) return false;
      width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]!; color = data[9]!;
      channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[color] ?? 0;
      const depths = color === 0 ? [1, 2, 4, 8, 16] : color === 3 ? [1, 2, 4, 8] : [8, 16];
      interlaced = data[12]!;
      if (!dimensions(width, height) || !channels || !depths.includes(depth) || data[10] !== 0 || data[11] !== 0 || interlaced > 1) return false;
    } else if (type === 'PLTE') {
      if (!size || size % 3 || size > 768 || compressed.length) return false;
      palette = true;
    } else if (type === 'IDAT') compressed.push(data);
    else if (type === 'IEND') {
      if (size !== 0 || end !== bytes.length) return false;
      ended = true; break;
    } else if (type[0] === type[0]!.toUpperCase()) return false; // Unknown critical chunk.
    offset = end;
  }
  if (!ended || !compressed.length || (color === 3 && !palette)) return false;
  // Bounded inflation catches truncated/corrupt pictures without allocating an
  // unbounded buffer. Check scanline lengths and filters, including Adam7 passes.
  const passes = interlaced ? [[0,0,8,8], [4,0,8,8], [0,4,4,8], [2,0,4,4], [0,2,2,4], [1,0,2,2], [0,1,1,2]] : [[0,0,1,1]];
  const rows = passes.map(([x, y, dx, dy]) => {
    const w = Math.max(0, Math.ceil((width - x!) / dx!));
    const h = w ? Math.max(0, Math.ceil((height - y!) / dy!)) : 0;
    return { count: h, size: 1 + Math.ceil(w * channels * depth / 8) };
  });
  const expected = rows.reduce((sum, row) => sum + row.count * row.size, 0);
  if (!expected || expected > 128_000_000) return false;
  const raw = inflateSync(Buffer.concat(compressed), { maxOutputLength: expected });
  if (raw.length !== expected) return false;
  offset = 0;
  for (const row of rows) for (let n = 0; n < row.count; n++, offset += row.size) if (raw[offset]! > 4) return false;
  return true;
}

function isJpeg(bytes: Buffer) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return false;
  let offset = 2, frame = false, scan = false;
  while (offset < bytes.length) {
    if (bytes[offset++] !== 0xff) return false;
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9) return frame && scan && offset === bytes.length;
    if (marker === undefined || marker === 0 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || offset + 2 > bytes.length) return false;
    const size = bytes.readUInt16BE(offset), end = offset + size;
    if (size < 2 || end > bytes.length) return false;
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (size < 11 || bytes[offset + 2] !== 8 || !dimensions(bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3))) return false;
      const components = bytes[offset + 7]!;
      if (![1, 3, 4].includes(components) || size !== 8 + 3 * components) return false;
      frame = true;
    }
    offset = end;
    if (marker === 0xda) {
      if (!frame || size < 6) return false;
      const start = offset;
      while (offset + 1 < bytes.length) {
        if (bytes[offset] !== 0xff) { offset++; continue; }
        const next = bytes[offset + 1]!;
        if (next === 0 || (next >= 0xd0 && next <= 0xd7)) { offset += 2; continue; }
        if (next === 0xff) { offset++; continue; }
        break;
      }
      if (offset === start) return false;
      scan = true;
    }
  }
  return false;
}

function isWebp(bytes: Buffer) {
  if (bytes.length < 30 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP' || bytes.readUInt32LE(4) !== bytes.length - 8) return false;
  let offset = 12, image = false;
  while (offset + 8 <= bytes.length) {
    const type = bytes.toString('ascii', offset, offset + 4), size = bytes.readUInt32LE(offset + 4);
    const start = offset + 8, end = start + size;
    if (end + (size % 2) > bytes.length) return false;
    if (type === 'VP8 ') {
      if (image || size < 11 || (bytes[start]! & 1) || bytes.toString('hex', start + 3, start + 6) !== '9d012a' || !dimensions(bytes.readUInt16LE(start + 6) & 0x3fff, bytes.readUInt16LE(start + 8) & 0x3fff)) return false;
      image = true;
    } else if (type === 'VP8L') {
      if (image || size < 6 || bytes[start] !== 0x2f) return false;
      const bits = bytes.readUInt32LE(start + 1);
      if (bits >>> 29 || !dimensions((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1)) return false;
      image = true;
    } else if (type === 'VP8X') {
      if (offset !== 12 || size !== 10 || !dimensions(bytes.readUIntLE(start + 4, 3) + 1, bytes.readUIntLE(start + 7, 3) + 1)) return false;
    } else if (!['ALPH', 'ICCP', 'EXIF', 'XMP '].includes(type)) return false;
    offset = end + (size % 2);
  }
  return image && offset === bytes.length;
}

/** Checks declared MIME against bounded binary structure; never trusts a data-URL prefix. */
export function validateImageBase64(value: unknown, mime: unknown): string {
  try {
    const bytes = decodeBase64(value, MAX_IMAGE_BYTES);
    if (bytes && ((mime === 'image/png' && isPng(bytes)) || (mime === 'image/jpeg' && isJpeg(bytes)) || (mime === 'image/webp' && isWebp(bytes)))) return `data:${mime};base64,${value}`;
  } catch { /* Surface a fixed message, never provider bytes or decoding internals. */ }
  throw new Error(IMAGE_ERROR);
}

export function validateImageDataUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 32) throw new Error(IMAGE_ERROR);
  const comma = value.indexOf(',');
  const header = /^data:(image\/(?:png|jpeg|webp));base64$/.exec(value.slice(0, comma));
  if (!header) throw new Error(IMAGE_ERROR);
  return validateImageBase64(value.slice(comma + 1), header[1]);
}

/** An ID3 tag alone is not a recording: require complete, consecutive MPEG Layer III frames. */
export function isValidMp3(bytes: Uint8Array): boolean {
  if (bytes.length < 500 || bytes.length > MAX_AUDIO_BYTES) return false;
  let offset = 0, frames = 0;
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    if (![2, 3, 4].includes(bytes[3]!) || bytes[4] === 0xff || bytes.subarray(6, 10).some(v => v > 127)) return false;
    const size = bytes[6]! * 0x200000 + bytes[7]! * 0x4000 + bytes[8]! * 0x80 + bytes[9]!;
    offset = 10 + size + (bytes[3] === 4 && (bytes[5]! & 0x10) ? 10 : 0);
  }
  let format: number | undefined;
  while (offset + 4 <= bytes.length) {
    if (frames >= 2 && bytes.length - offset === 128 && bytes[offset] === 0x54 && bytes[offset + 1] === 0x41 && bytes[offset + 2] === 0x47) return true;
    const a = bytes[offset]!, b = bytes[offset + 1]!, c = bytes[offset + 2]!;
    const version = (b >>> 3) & 3, layer = (b >>> 1) & 3, bitrate = c >>> 4, sample = (c >>> 2) & 3;
    if (a !== 0xff || (b & 0xe0) !== 0xe0 || version === 1 || layer !== 1 || bitrate === 0 || bitrate === 15 || sample === 3) return false;
    const currentFormat = version * 4 + sample;
    if (format !== undefined && format !== currentFormat) return false;
    format = currentFormat;
    const rate = (version === 3 ? [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320] : [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160])[bitrate]!;
    const frequency = [44100,48000,32000][sample]! / (version === 3 ? 1 : version === 2 ? 2 : 4);
    const size = Math.floor((version === 3 ? 144000 : 72000) * rate / frequency) + ((c >>> 1) & 1);
    if (offset + size > bytes.length) return false;
    offset += size; frames++;
  }
  return frames >= 2 && offset === bytes.length;
}

export function validateMp3DataUrl(value: unknown): string {
  const prefix = 'data:audio/mpeg;base64,';
  if (typeof value !== 'string' || !value.startsWith(prefix)) throw new Error(AUDIO_ERROR);
  const bytes = decodeBase64(value.slice(prefix.length), MAX_AUDIO_BYTES);
  if (!bytes || !isValidMp3(bytes)) throw new Error(AUDIO_ERROR);
  return value;
}
