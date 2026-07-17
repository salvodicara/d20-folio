/**
 * Class-table ↔ class-feature consistency guard.
 *
 * Background: a character's gained features are reconstructed by two seams that
 * MUST agree on which features exist at each level —
 *   • the creation wizard's `buildGrantedFeatures` iterates ALL classFeatures by
 *     `f.level <= level`, and
 *   • feature derivation (`inferFeatures` / `buildGrantedFeatures`) rebuilds the
 *     list strictly from the class table's `levels[].featureIds` / subclasses'
 *     `featureIds`.
 * When a feature is defined with mechanics but is NOT referenced by its table,
 * derivation silently DROPS it (regression: derived Monks lost Flurry of
 * Blows / Patient Defense / Step of the Wind / Uncanny Metabolism, their core
 * L2 combat economy + a tracker). This test asserts every feature is reachable
 * from its table at its declared level, so a future orphan fails CI.
 */
import { describe, expect, it } from "vitest";
import { classTables, classFeatures } from "@/data/classes";
import { MONK_TABLE, MONK_FEATURES } from "@/data/classes/monk";

/**
 * Features that are intentionally defined but NOT auto-granted by the table —
 * they are sub-options of a player CHOICE, not level-up grants. Listing them in
 * `featureIds` would wrongly auto-apply their mechanics to every character of
 * the class.
 *
 *  • paladin-fighting-style-defense — one of the Fighting Style options the
 *    paladin picks at L2; the chosen style is resolved through the feat/choice
 *    picker, never auto-granted. (It is the lone fighting-style sub-option still
 *    modeled as a standalone feature row.)
 */
const INTENTIONAL_TABLE_ORPHANS = new Set<string>(["paladin-fighting-style-defense"]);

describe("class-table ↔ class-feature consistency", () => {
  it("every class feature is referenced by its table at its declared level", () => {
    const tableById = new Map(classTables.map((t) => [t.id, t]));
    const orphans: string[] = [];

    for (const f of classFeatures) {
      if (INTENTIONAL_TABLE_ORPHANS.has(f.id)) continue;
      const table = tableById.get(f.class);
      expect(
        table,
        `no class table for class "${f.class}" (feature ${f.id})`
      ).toBeDefined();
      if (!table) continue;

      if (f.subclass) {
        const sub = table.subclasses.find((s) => s.id === f.subclass);
        if (!sub || !sub.featureIds.includes(f.id)) {
          orphans.push(`${f.class}/${f.subclass} subclass list missing ${f.id}`);
        }
      } else {
        const row = table.levels.find((l) => l.level === f.level);
        if (!row || !row.featureIds.includes(f.id)) {
          orphans.push(`${f.class} L${f.level} featureIds missing ${f.id}`);
        }
      }
    }

    expect(orphans).toEqual([]);
  });

  it("Monk L2 lists all six level-2 features (regression for the dropped combat economy)", () => {
    const l2Table = MONK_TABLE.levels.find((l) => l.level === 2);
    expect(l2Table).toBeDefined();
    const l2Ids = new Set(l2Table?.featureIds ?? []);

    const definedL2 = MONK_FEATURES.filter((f) => f.level === 2 && !f.subclass).map(
      (f) => f.id
    );
    expect(definedL2).toEqual(
      expect.arrayContaining([
        "monk-focus",
        "monk-unarmored-movement",
        "monk-uncanny-metabolism",
        "monk-flurry-of-blows",
        "monk-patient-defense",
        "monk-step-of-the-wind",
      ])
    );

    for (const id of definedL2) {
      expect(l2Ids.has(id), `MONK_TABLE L2 is missing ${id}`).toBe(true);
    }
  });
});
