/**
 * export-srd-catalogue — writes the public SRD catalogue (Folio Core API step 3) as
 * static JSON: one file per collection plus `index.json` (version, licence, SRD 5.2.1
 * attribution, counts). The shape is `src/lib/srd-catalogue.ts`; this script only
 * wires the real collections and their English text, plus every active mechanic as
 * an Activity (`activities.json`).
 *
 * SRD-only by construction: it refuses to run unless `VITE_CONTENT_PACK=0`, so the
 * `@pack` alias resolves to the empty stub and no private content (or overlay) is
 * loaded; the builder also rejects any entry whose `source` is not "SRD".
 *
 *   VITE_CONTENT_PACK=0 node --import ./scripts/alias-loader.mjs \
 *     scripts/export-srd-catalogue.ts dist/srd/v1
 *
 * (`pnpm srd:catalogue` runs exactly that.)
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { buildSrdCatalogue, type CatalogueCollection } from "@/lib/srd-catalogue";
import { catalogueActivities } from "@/lib/activities/catalogue";
import { spells } from "@/data/spells";
import { MONSTERS } from "@/data/monsters";
import { SRD_MAGIC_ITEMS } from "@/data/magic-items";
import { classFeatures, classTables } from "@/data/classes";
import { SRD_RACES } from "@/data/races";
import { SRD_BACKGROUNDS } from "@/data/backgrounds";
import { SRD_FEATS } from "@/data/feats";
import { SRD_WEAPONS } from "@/data/weapons";
import { SRD_ARMOR } from "@/data/armor";
import { SRD_GEAR } from "@/data/gear";
import { SRD_CONDITIONS } from "@/data/conditions";
import { SRD_INVOCATIONS } from "@/data/invocations";
import { SRD_METAMAGIC } from "@/data/metamagic";

if (process.env.VITE_CONTENT_PACK !== "0") {
  console.error("export-srd-catalogue: run with VITE_CONTENT_PACK=0 (SRD-only).");
  process.exit(1);
}

const outDir = process.argv[2] ?? "dist/srd/v1";
const root = path.resolve(import.meta.dirname, "..");
const text = (file: string): Record<string, unknown> =>
  JSON.parse(
    readFileSync(path.join(root, "src/i18n/en/srd", `${file}.json`), "utf-8")
  ) as Record<string, unknown>;
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf-8")) as {
  version: string;
};
const legal = JSON.parse(
  readFileSync(path.join(root, "src/i18n/en/ui/legal.json"), "utf-8")
) as { legal: { attribution: { statement: string } } };

const equipmentText = text("equipment");
const collections: Record<string, CatalogueCollection> = {
  spells: { entries: spells, text: text("spells") },
  monsters: { entries: MONSTERS, text: text("monsters") },
  "magic-items": { entries: SRD_MAGIC_ITEMS, text: text("magic-items") },
  classes: { entries: classTables, text: text("classes") },
  "class-features": { entries: classFeatures, text: text("class-features") },
  species: { entries: SRD_RACES, text: text("races") },
  backgrounds: { entries: SRD_BACKGROUNDS, text: text("backgrounds") },
  feats: { entries: SRD_FEATS, text: text("feats") },
  weapons: { entries: SRD_WEAPONS, text: equipmentText },
  armor: { entries: SRD_ARMOR, text: equipmentText },
  gear: { entries: SRD_GEAR, text: equipmentText },
  conditions: { entries: SRD_CONDITIONS, text: text("conditions") },
  invocations: { entries: SRD_INVOCATIONS, text: text("invocations") },
  metamagic: { entries: SRD_METAMAGIC, text: text("metamagic") },
  // Every active mechanic above in the one Activity shape (`src/lib/activities`),
  // with the source fields it cannot express yet.
  activities: {
    entries: (await catalogueActivities()).map(({ activity, gaps }) => ({
      id: activity.id,
      activity,
      ...(gaps.length > 0 ? { gaps } : {}),
    })),
  },
};

const { index, files } = buildSrdCatalogue({
  version: pkg.version,
  attribution: legal.legal.attribution.statement,
  collections,
});

mkdirSync(outDir, { recursive: true });
for (const [file, entries] of Object.entries(files)) {
  writeFileSync(path.join(outDir, file), JSON.stringify(entries));
}
writeFileSync(path.join(outDir, "index.json"), JSON.stringify(index, null, 2) + "\n");
console.log(
  `SRD catalogue ${index.version} → ${outDir}: ` +
    Object.entries(index.collections)
      .map(([name, c]) => `${name} ${c.count}`)
      .join(", ")
);
