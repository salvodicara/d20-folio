/**
 * W10 guard (rule 10) — the BASE class `levels[]` progression table is
 * subclass-AGNOSTIC.
 *
 * A base class table lists ONLY base-class features per level. Subclass features
 * carry the stable subclass slug in `f.subclass` and are surfaced by
 * `getFeaturesAtLevel(classId, level)` + the subclass filter in `applyNewFeatures`
 * (`lib/level-up.ts`) — they must NEVER be hardcoded into a base `levels[].featureIds`.
 *
 * Hardcoding a subclass feature id there (Bard → College of Lore, Druid → Circle of
 * the Land before this fix) is INERT — the apply path re-filters by the chosen
 * subclass, and the level-up cards read the FILTERED change, not this table — but it
 * mis-describes the level progression and is a trap (a future consumer that trusts
 * `levels[].featureIds` verbatim would show a Lore feature to every Bard subclass).
 * This guard pins the seam for EVERY class so it can never regress.
 */
import { describe, it, expect } from "vitest";
import { classTables, classFeatureIndex } from "@/data/classes";

describe("base class `levels[]` carries no subclass feature ids (W10)", () => {
  it("every base levels[].featureIds entry resolves to a BASE (non-subclass) feature", () => {
    const offenders: string[] = [];
    for (const table of classTables) {
      for (const row of table.levels) {
        for (const id of row.featureIds) {
          const feature = classFeatureIndex.get(id);
          // A placeholder id (e.g. an `-asi`/expertise/metamagic sentinel) may not
          // resolve to a real feature — those are base-class progression markers and
          // are fine. We only flag a RESOLVED feature that is subclass-tagged.
          if (feature?.subclass != null) {
            offenders.push(
              `${table.id} L${row.level}: "${id}" belongs to subclass "${feature.subclass}"`
            );
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
