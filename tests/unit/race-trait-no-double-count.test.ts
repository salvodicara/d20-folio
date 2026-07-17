/**
 * Regression: species-trait grants must be counted ONCE.
 *
 * The creation wizard stores race traits in `character.features[]` (via
 * `buildGrantedFeatures` with the raceId), but race grants are ALSO resolved
 * independently from `character.race` by `resolveGrantSourcesForRace`. Without a
 * guard, every species grant was double-counted — a list/sum field like the
 * advantage clauses (Halfling Brave → Advantage vs Frightened) showed twice, and
 * a race Speed bonus would be summed twice. `resolveGrantSourcesForFeatures` now
 * skips race-trait ids so the race path is their single source.
 */
import { describe, expect, it } from "vitest";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { buildScenario } from "@/lib/dev-scenarios";
import type { CharacterData } from "@/types/character";
import { loc } from "../_harness/loc";

describe("species traits are counted once even when stored in features[]", () => {
  it("Halfling Brave's Frightened advantage appears exactly ONCE", () => {
    const doc = buildScenario({
      name: "Pip, Thief",
      raceId: "halfling",
      classId: "rogue",
      subclassId: "thief",
      level: 5,
      background: "criminal",
      abilityScores: { STR: 10, DEX: 17, CON: 14, INT: 12, WIS: 12, CHA: 10 },
    });
    // Simulate what the creation wizard does: store the race trait IN features[]
    // (on top of `character.race` already being set to the species).
    const character: CharacterData = {
      ...doc.character,
      features: [...doc.character.features, { srdId: "halfling-brave" }],
    };
    const aggregate = aggregateCharacterGrants(character, doc.session);
    const frightened = aggregate.advantages.filter((c) =>
      /frightened/i.test(loc(c.description, "en"))
    );
    expect(frightened).toHaveLength(1);
  });
});
