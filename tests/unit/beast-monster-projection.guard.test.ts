/**
 * The Polymorph projection guard (C1, §D.2).
 *
 * The eager Beast catalogue (`src/data/beasts/beasts.ts`) is a GENERATED 2024
 * projection of the monster corpus (D-5): every beast id must have a monster twin
 * that it DEEP-EQUALS via `beastProjectionFromMonster` — numbers, attack rows,
 * nameKeys, and trait lists. This iterates the COMPOSED `BEASTS` against the
 * COMPOSED corpus, so it passes in BOTH build modes: the pack's beast ↔ its pack
 * monster in pack mode, the public beasts ↔ the public corpus in SRD-only mode.
 *
 * COMPLETENESS (final wave, D-5 closure): the corpus is now total, so the guard
 * asserts EVERY beast resolves to a monster twin — no intersection semantics, a
 * beast with no twin is a hard failure, not a silent skip. The public count is
 * pinned (84 after the RAW Monstrosity sweep, below).
 *
 * RAW TYPE GUARD: 2024 Polymorph grants BEAST forms only. Some Polymorph-catalogue
 * animals were reclassified as non-Beast in 2024 (flying-snake / axe-beak /
 * giant-vulture → Monstrosity; giant-eagle / giant-elk / giant-owl → Celestial),
 * so they were swept out of the Beast catalogue. This guard pins every beast id's
 * monster twin to `type === "beast"`, so a future reclassification fails LOUD here
 * instead of silently offering an illegal Polymorph form.
 *
 * Adjudication for a mismatch: the SRD 5.2.1 PDF is truth — the monster entry is
 * authored to it and `beasts.ts` is REGENERATED to the projection, never the
 * reverse. Top-level ids never change (persisted `session.polymorphForm.beastId`
 * stays safe); attack/trait sub-structure changes freely.
 */
import { describe, expect, it } from "vitest";
import { BEASTS } from "@/data/beasts";
import { BEASTS as PUBLIC_BEASTS } from "@/data/beasts/beasts";
import { getMonster } from "@/data/monsters";
import { beastProjectionFromMonster } from "../../scripts/beast-projection";

describe("beast → monster projection (C1)", () => {
  it("pins the public Beast count (RAW Monstrosity sweep: 84)", () => {
    // The raw public array is a build-mode invariant (composed BEASTS adds the
    // pack's forms on top). The count moves only with a deliberate data wave.
    expect(PUBLIC_BEASTS.length).toBe(84);
  });

  it.each(BEASTS.map((b) => [b.id, b] as const))(
    "%s resolves to a Beast-typed monster twin and deep-equals its projection",
    (_id, beast) => {
      const monster = getMonster(beast.id);
      // COMPLETENESS: every beast MUST have a twin (no intersection skip).
      expect(monster, `no monster twin for beast "${beast.id}"`).toBeDefined();
      if (!monster) throw new Error(`no monster for ${beast.id}`);
      // RAW: Polymorph grants Beast forms only — the twin must be a Beast.
      expect(monster.type, `beast "${beast.id}" twin is not type beast`).toBe("beast");
      // The projection derivation is the single source of the beast's numbers.
      expect(beast).toEqual(beastProjectionFromMonster(monster));
    }
  );
});
