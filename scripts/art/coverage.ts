/**
 * art-coverage — every catalogue entry has its painted icon (owner, 2026-11-05: no
 * glyph fallbacks at release). Lists the ids with no file under
 * `public/assets/art/<kind>/<id>.webp` (SRD) or `content-pack/assets/art/<kind>/` (pack).
 *
 *   pnpm art:coverage            report the missing ids per catalogue
 *   pnpm art:coverage --strict   exit 1 when any is missing (the release gate)
 *
 * Run it in the composed checkout so the pack's entries are counted too.
 */
import { existsSync } from "node:fs";
import path from "node:path";

import { classFeatures, classTables } from "@/data/classes";
import { SRD_EQUIPMENT } from "@/data/equipment";
import { SRD_FEATS } from "@/data/feats";
import { SRD_MAGIC_ITEMS } from "@/data/magic-items";
import { MONSTERS } from "@/data/monsters";
import { SRD_RACES } from "@/data/races";
import { spells } from "@/data/spells";

const ROOT = path.resolve(import.meta.dirname, "../..");
const DIRS = [
  path.join(ROOT, "public/assets/art"),
  path.join(ROOT, "content-pack/assets/art"),
];

export const CATALOGUES: Record<string, readonly string[]> = {
  spell: spells.map((s) => s.id),
  class: classTables.map((t) => t.id),
  subclass: classTables.flatMap((t) =>
    t.subclasses.map((sc) => (typeof sc === "string" ? sc : sc.id))
  ),
  feature: classFeatures.map((f) => f.id),
  feat: SRD_FEATS.map((f) => f.id),
  item: SRD_MAGIC_ITEMS.map((m) => m.id),
  equipment: SRD_EQUIPMENT.map((e) => e.id),
  monster: MONSTERS.map((m) => m.id),
  species: SRD_RACES.map((r) => r.id),
};

/** Catalogue kind → the ids with no painted icon yet. */
export function missingArt(): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(CATALOGUES).map(([kind, ids]) => [
      kind,
      [...new Set(ids)].filter(
        (id) => !DIRS.some((dir) => existsSync(path.join(dir, kind, `${id}.webp`)))
      ),
    ])
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const missing = missingArt();
  let total = 0;
  for (const [kind, ids] of Object.entries(missing)) {
    const of = new Set(CATALOGUES[kind]).size;
    total += ids.length;
    console.log(
      `${kind.padEnd(10)} ${String(of - ids.length).padStart(4)}/${String(of)} painted`
    );
    if (ids.length && process.argv.includes("--list"))
      console.log(`  missing: ${ids.join(", ")}`);
  }
  console.log(
    total
      ? `${String(total)} catalogue entries still show a glyph.`
      : "Every catalogue entry is painted."
  );
  if (total && process.argv.includes("--strict")) process.exit(1);
}
