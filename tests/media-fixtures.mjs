import { deflateSync } from 'node:zlib';

function chunk(name, body) {
  const bytes = Buffer.alloc(body.length + 12);
  bytes.writeUInt32BE(body.length); bytes.write(name, 4); body.copy(bytes, 8);
  let crc = 0xffffffff;
  for (const value of bytes.subarray(4, -4)) {
    crc ^= value;
    for (let n = 0; n < 8; n++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  bytes.writeUInt32BE((crc ^ 0xffffffff) >>> 0, bytes.length - 4);
  return bytes;
}

export function pngFixture({ width = 1, height = 1, compressed = deflateSync(Buffer.from([0, 255, 0, 0, 255])) } = {}) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
}

// Three complete MPEG-1 Layer III frames (128 kbps, 44.1 kHz), with optional ID3.
export function mp3Fixture(withTag = false) {
  const frame = Buffer.alloc(417); frame.set([0xff, 0xfb, 0x90, 0]);
  return Buffer.concat([...(withTag ? [Buffer.from([0x49,0x44,0x33,4,0,0,0,0,0,0])] : []), frame, frame, frame]);
}

export const webpFixture = Buffer.from('UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=', 'base64');
