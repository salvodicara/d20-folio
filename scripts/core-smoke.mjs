/**
 * core-smoke — prove the BUILT @d20-folio/core works from plain Node: for each
 * fixture export it runs `parseCharacter` → `deriveCharacter` from
 * `packages/folio-core/dist/index.js` and compares the sheet with the committed
 * expected numbers (which `tests/unit/folio-core-fixtures.test.ts` keeps equal to the
 * app's own derivation), then checks the bundled SRD activities. Run by
 * `pnpm core:build`.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { deepStrictEqual } from "node:assert/strict";

const pkg = path.resolve(import.meta.dirname, "../packages/folio-core");
const core = await import(path.join(pkg, "dist/index.js"));
const dir = path.join(pkg, "fixtures");

let checked = 0;
for (const file of readdirSync(dir).filter(
  (f) => f.endsWith(".json") && !f.endsWith(".expected.json")
)) {
  const parsed = core.parseCharacter(readFileSync(path.join(dir, file), "utf-8"));
  if (!parsed.success) throw new Error(`${file}: ${parsed.error}`);
  const now = new Date();
  const sheet = core.deriveCharacter({
    id: file,
    createdAt: now,
    updatedAt: now,
    ...parsed.doc,
  });
  const expected = JSON.parse(
    readFileSync(path.join(dir, file.replace(".json", ".expected.json")), "utf-8")
  );
  deepStrictEqual(
    {
      level: sheet.level,
      ac: sheet.ac,
      hpMax: sheet.hp.max,
      initiativeBonus: sheet.initiativeBonus,
      passives: sheet.passives,
      saves: sheet.saves.map((s) => s.bonus),
      spellSaveDc: sheet.spellcasting?.saveDc ?? null,
    },
    expected,
    file
  );
  checked += 1;
}
if (checked === 0) throw new Error("core-smoke: no fixtures");

// The activities: the whole SRD's, one shape, from the same bundle.
const activities = await core.catalogueActivities();
const fireball = activities.find(({ activity }) => activity.id === "spell:fireball");
deepStrictEqual(
  fireball?.activity.effects[0],
  {
    kind: "damage",
    dice: { dice: "8d6", perUpcast: "1d6" },
    types: ["fire"],
    onSave: "half",
  },
  "spell:fireball"
);
for (const kind of ["monster", "weapon"]) {
  if (!activities.some(({ activity }) => activity.source.kind === kind)) {
    throw new Error(`core-smoke: no ${kind} activities`);
  }
}
console.log(
  `core-smoke: the built package derives ${checked} fixture sheets exactly and lists ${activities.length} activities`
);
