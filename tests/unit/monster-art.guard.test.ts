/** Completeness + delivery lock for the canonical Living Bestiary portrait corpus. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MONSTERS } from "@/data/monsters";
import { MONSTER_ART, monsterPortraitUrl } from "@/data/monster-art";
import { contentPackEnabled } from "@scripts/content-pack-mode";

const ROOT = process.cwd();
const ASSET_DIRS = [
  path.join(ROOT, "assets", "monsters"),
  ...(contentPackEnabled()
    ? [path.join(ROOT, "content-pack", "assets", "monsters")]
    : []),
];

function portraitFiles(): string[] {
  return ASSET_DIRS.flatMap((dir) =>
    readdirSync(dir)
      .filter((name) => name.endsWith(".webp"))
      .map((name) => path.join(dir, name))
  );
}

function uint24le(bytes: Buffer, offset: number): number {
  return bytes.readUIntLE(offset, 3);
}

/** Read canvas dimensions from the three WebP bitstream variants, dependency-free. */
function webpSize(file: string): { width: number; height: number } {
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

describe("canonical monster art guard", () => {
  it("has exactly one portrait for every monster and no orphan ids", () => {
    const monsterIds = MONSTERS.map((monster) => monster.id).sort();
    const fileIds = portraitFiles()
      .map((file) => path.basename(file, ".webp"))
      .sort();
    expect(fileIds).toEqual(monsterIds);
    expect(Object.keys(MONSTER_ART).sort()).toEqual(monsterIds);
    expect(monsterPortraitUrl("stale-or-custom-id")).toBeNull();
  });

  it("keeps every master 4:5, exact-size, and runtime-cache friendly", () => {
    for (const file of portraitFiles()) {
      expect(webpSize(file), path.basename(file)).toEqual({ width: 672, height: 840 });
      expect(statSync(file).size, path.basename(file)).toBeLessThanOrEqual(90_000);
    }
  });
});
