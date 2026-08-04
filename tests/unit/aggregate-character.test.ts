/**
 * #90 regression — the chosen lineage/circle bundle MUST flow into the sheet-wide
 * aggregate. The engine (`evaluateGrants`) was always correct; the bug was that
 * the senses/derived consumers (LeftHud, CombatHeader, roster, free-casts) called
 * it WITHOUT the 3rd `bundleChoices` argument, so a picked Elven Lineage never
 * bumped darkvision off the base 60 ft and lineage-granted spells never appeared.
 * `aggregateCharacterGrants` is the single seam that threads
 * `session.grantBundleChoices` (and `activeFeatures`); these tests pin that it
 * does — including the "no third arg ⇒ base 60" path that was the live bug.
 */
import { describe, it, expect } from "vitest";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { evaluateGrants } from "@/lib/grants";
import { resolveAllGrantSources } from "@/lib/resolve-grant-sources";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { ActiveCombatEffect } from "@/types/combat-effect";

const elf = MOCK_CHARACTER.character; // race "Elf" — carries the elf-lineage bundle

describe("aggregateCharacterGrants — lineage bundle flows into the aggregate (#90)", () => {
  it("Drow lineage raises darkvision to 120 ft", () => {
    const agg = aggregateCharacterGrants(elf, {
      activeFeatures: [],
      grantBundleChoices: { "elf-lineage": "drow" },
    });
    expect(agg.darkvisionFt).toBe(120);
  });

  it("High-Elf lineage keeps the base 60 ft and grants its cantrip", () => {
    const agg = aggregateCharacterGrants(elf, {
      activeFeatures: [],
      grantBundleChoices: { "elf-lineage": "high-elf" },
    });
    expect(agg.darkvisionFt).toBe(60);
    // High Elf grants a wizard cantrip as an always-prepared / free-cast entry —
    // proving the bundle's SPELL grants flow too, not just senses.
    const hasGrantedCasting = agg.freeCasts.length > 0 || agg.alwaysPrepared.length > 0;
    expect(hasGrantedCasting).toBe(true);
  });

  it("omitting the bundle choice falls back to base darkvision (the pre-fix bug path)", () => {
    const agg = aggregateCharacterGrants(elf, {
      activeFeatures: [],
      grantBundleChoices: {},
    });
    expect(agg.darkvisionFt).toBe(60);
    // The exact shape of the old bug: calling evaluateGrants with only one arg
    // also yields 60 — the regression is that the consumers used to do THIS.
    const buggy = evaluateGrants(resolveAllGrantSources(elf));
    expect(buggy.darkvisionFt).toBe(60);
  });

  it("tolerates undefined session slices (legacy docs)", () => {
    const agg = aggregateCharacterGrants(elf, {
      activeFeatures: undefined,
      grantBundleChoices: undefined,
    });
    expect(agg.darkvisionFt).toBe(60);
  });

  it("projects a target-bound spell grant the recipient does not know", () => {
    const heroism: ActiveCombatEffect = {
      id: "effect-heroism",
      actor: { kind: "monster", combatantId: "caster" },
      target: {
        kind: "pc",
        combatantId: "pc-recipient",
        memberUid: "recipient",
        characterId: "character-1",
      },
      source: {
        kind: "spell",
        id: "heroism",
        actionId: "spell-heroism",
      },
      payload: { kind: "grant-group", activeKey: "spell-heroism" },
      duration: {
        kind: "concentration",
        actorId: "caster",
        sourceId: "heroism",
      },
    };
    const character = {
      ...elf,
      spells: [],
    };
    const agg = aggregateCharacterGrants(character, {
      activeFeatures: [],
      grantBundleChoices: {},
      encounterEffects: [heroism],
    });
    expect(agg.conditionImmunities.has("frightened")).toBe(true);
  });

  it("does not stack duplicate projections of the same spell group", () => {
    const aid = (id: string): ActiveCombatEffect => ({
      id,
      actor: { kind: "monster", combatantId: `caster-${id}` },
      target: {
        kind: "pc",
        combatantId: "pc-recipient",
        memberUid: "recipient",
        characterId: "character-1",
      },
      source: { kind: "spell", id: "aid", actionId: "spell-aid" },
      payload: { kind: "grant-group", activeKey: "spell-aid" },
      duration: { kind: "encounter" },
    });
    const agg = aggregateCharacterGrants(
      { ...elf, spells: [] },
      {
        activeFeatures: [],
        grantBundleChoices: {},
        encounterEffects: [aid("one"), aid("two")],
      }
    );
    expect(agg.hpFlat).toBe(5);
  });
});
