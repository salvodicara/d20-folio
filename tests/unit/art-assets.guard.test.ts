/**
 * Guard: every painted icon shipped under public/assets/art/<kind>/<id>.webp names a
 * real catalogue entry of that kind, so a renamed or removed entry never leaves an
 * orphan file, and a typo never ships an icon nobody can reach (owner, 2026-11-05).
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { classFeatures, classTables } from "@/data/classes";
import { SRD_EQUIPMENT } from "@/data/equipment";
import { SRD_FEATS } from "@/data/feats";
import { SRD_MAGIC_ITEMS } from "@/data/magic-items";
import { MONSTERS } from "@/data/monsters";
import { spells } from "@/data/spells";

const ROOT = resolve(__dirname, "../../public/assets/art");
const subclassIds = classTables.flatMap((t) =>
  t.subclasses.map((sc) => (typeof sc === "string" ? sc : sc.id))
);
const CATALOGUE: Record<string, ReadonlySet<string>> = {
  spell: new Set(spells.map((s) => s.id)),
  class: new Set(classTables.map((t) => t.id)),
  subclass: new Set(subclassIds),
  feat: new Set(SRD_FEATS.map((f) => f.id)),
  item: new Set(SRD_MAGIC_ITEMS.map((m) => m.id)),
  equipment: new Set(SRD_EQUIPMENT.map((e) => e.id)),
  monster: new Set(MONSTERS.map((m) => m.id)),
  feature: new Set(classFeatures.map((f) => f.id)),
};

describe("painted icons", () => {
  it("sit in a known catalogue folder and name one of its entries", () => {
    if (!existsSync(ROOT)) return;
    const orphans: string[] = [];
    for (const kind of readdirSync(ROOT)) {
      if (!statSync(resolve(ROOT, kind)).isDirectory()) continue;
      const ids = CATALOGUE[kind];
      for (const file of readdirSync(resolve(ROOT, kind))) {
        const id = file.replace(/\.webp$/, "");
        if (!ids || !file.endsWith(".webp") || !ids.has(id))
          orphans.push(`${kind}/${file}`);
      }
    }
    expect(orphans).toEqual([]);
  });
});
