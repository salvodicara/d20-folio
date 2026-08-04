/** Completeness + delivery lock for the canonical Living Bestiary portrait corpus. */
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MONSTERS } from "@/data/monsters";
import { MONSTER_ART, monsterPortraitUrl } from "@/data/monster-art";
import { contentPackEnabled } from "@scripts/content-pack-mode";
import { webpSize } from "@tests/helpers/webp";

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
