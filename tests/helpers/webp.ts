import { readFileSync } from "node:fs";

function uint24le(bytes: Buffer, offset: number): number {
  return bytes.readUIntLE(offset, 3);
}

/** Read canvas dimensions from the three WebP bitstream variants, dependency-free. */
export function webpSize(file: string): { width: number; height: number } {
  const bytes = readFileSync(file);
  if (
    bytes.toString("ascii", 0, 4) !== "RIFF" ||
    bytes.toString("ascii", 8, 12) !== "WEBP"
  )
    throw new Error(`${file}: not a WebP`);

  for (let chunk = 12; chunk + 8 <= bytes.length; ) {
    const kind = bytes.toString("ascii", chunk, chunk + 4);
    const data = chunk + 8;
    const size = bytes.readUInt32LE(chunk + 4);
    if (kind === "VP8X") {
      return {
        width: uint24le(bytes, data + 4) + 1,
        height: uint24le(bytes, data + 7) + 1,
      };
    }
    if (kind === "VP8 ") {
      return {
        width: bytes.readUInt16LE(data + 6) & 0x3fff,
        height: bytes.readUInt16LE(data + 8) & 0x3fff,
      };
    }
    if (kind === "VP8L") {
      const b1 = bytes.readUInt8(data + 1);
      const b2 = bytes.readUInt8(data + 2);
      const b3 = bytes.readUInt8(data + 3);
      const b4 = bytes.readUInt8(data + 4);
      return {
        width: 1 + (((b2 & 0x3f) << 8) | b1),
        height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6)),
      };
    }
    chunk = data + size + (size % 2);
  }
  throw new Error(`${file}: no supported WebP image chunk`);
}
