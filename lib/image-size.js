// Leest de afmetingen van een afbeelding uit de eerste bytes van het bestand.
//
// Waarom: zonder width/height "springt" de pagina tijdens het laden, en die
// sprong (Cumulative Layout Shift) telt mee in de Google-ranking.
//
// Let op: een deel van de afbeeldingen in src/assets/images is WebP met een
// .png- of .jpeg-naam. We kijken daarom naar de inhoud van het bestand, niet
// naar de extensie.

import fs from "node:fs";

function pngSize(buf) {
  if (buf.length < 24) return null;
  if (buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function webpSize(buf) {
  if (buf.length < 30) return null;
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") return null;
  const chunk = buf.toString("ascii", 12, 16);

  if (chunk === "VP8 ") {
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === "VP8L") {
    const bits = buf.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X") {
    const read24 = (offset) => buf[offset] | (buf[offset + 1] << 8) | (buf[offset + 2] << 16);
    return { width: read24(24) + 1, height: read24(27) + 1 };
  }
  return null;
}

function jpegSize(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = buf[offset + 1];
    // SOF0 t/m SOF15 bevatten de afmetingen; DHT/JPG/DAC zijn geen SOF-markers
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    offset += 2 + buf.readUInt16BE(offset + 2);
  }
  return null;
}

const cache = new Map();

export function imageSize(filePath) {
  if (cache.has(filePath)) return cache.get(filePath);
  let result = null;
  try {
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(65536);
    const bytes = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    const head = buf.subarray(0, bytes);
    result = pngSize(head) || webpSize(head) || jpegSize(head);
  } catch {
    result = null;
  }
  cache.set(filePath, result);
  return result;
}
