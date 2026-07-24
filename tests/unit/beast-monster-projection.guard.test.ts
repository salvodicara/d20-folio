/**
 * The Polymorph projection guard (C1, §D.2).
 *
 * The eager Beast catalogue (`src/data/beasts/beasts.ts`) is a GENERATED 2024
 * projection of the monster corpus (D-5): every beast id that ALSO exists in the
 * composed `MONSTERS` aggregate must DEEP-EQUAL `beastProjectionFromMonster` of its
 * monster — numbers, attack rows, nameKeys, and trait lists. This iterates the
 * COMPOSED `BEASTS` against the COMPOSED corpus, so it passes in BOTH build modes:
 * the pack's beast ↔ its pack monster in pack mode, the public beasts ↔ the public
 * corpus in SRD-only mode.
 *
 * INTERSECTION semantics from day 1 (no gate-red mid-campaign): a beast whose
 * monster is not yet authored is simply skipped. The corpus census confirms all 90
 * public beast ids land in the corpus, so the COMPLETENESS assertion (every beast
 * resolves) joins here in the final wave commit — after which the guard is total.
 *
 * Adjudication for a mismatch: the SRD 5.2.1 PDF is truth — the monster entry is
 * authored to it and `beasts.ts` is REGENERATED to the projection
 * (`node scripts/sync-beast-projection.ts`), never the reverse. Top-level ids never
 * change (persisted `session.polymorphForm.beastId` stays safe); attack/trait
 * sub-structure changes freely.
 */
import { describe, expect, it } from "vitest";
import { BEASTS } from "@/data/beasts";
import { getMonster } from "@/data/monsters";
import { beastProjectionFromMonster } from "../../scripts/beast-projection";

const intersection = BEASTS.filter((b) => getMonster(b.id) !== undefined);

describe("beast → monster projection (C1)", () => {
  it("the corpus intersects the beast catalogue (guards the sweep against a vacuous pass)", () => {
    // Until the corpus is complete the sweep is over an intersection; if it ever
    // empties, `it.each` below would register zero cases and pass silently. The
    // pilot authored brown-bear + rat, so the intersection is non-empty today.
    expect(intersection.length).toBeGreaterThan(0);
  });

  it.each(intersection.map((b) => [b.id, b] as const))(
    "%s deep-equals its monster projection",
    (_id, beast) => {
      const monster = getMonster(beast.id);
      if (!monster) throw new Error(`no monster for ${beast.id}`);
      expect(beast).toEqual(beastProjectionFromMonster(monster));
    }
  );
});
