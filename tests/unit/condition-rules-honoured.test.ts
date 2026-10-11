/**
 * The sheet's condition seams honour the 2024 condition rules table
 * (`CONDITION_RULES`). Cases come from the table itself, so a new
 * damage-defense effect or implication added there is checked here for free.
 */
import { describe, expect, it } from "vitest";
import { CONDITION_RULES } from "@/lib/condition";
import { resolveDamageIntake } from "@/lib/damage-intake";
import { effectiveSessionConditions } from "@/lib/effective-conditions";
import { emptyAggregate } from "@/lib/grants";
import { deriveDamageDefenses } from "@/lib/views/sheet-view";
import srdConditions from "@/i18n/en/srd/conditions.json";
import { DAMAGE_TYPES } from "@/types/damage";

const occurrenceRules = Object.entries(CONDITION_RULES).flatMap(([id, rule]) =>
  rule.kind === "occurrence" ? [{ id, rule }] : []
);

const resistanceCases = occurrenceRules.flatMap(({ id, rule }) =>
  rule.effects.flatMap((effect) =>
    effect.kind === "damage-defense" && effect.rule.kind === "resistance"
      ? [{ id, damageTypes: effect.rule.selector.damageTypes }]
      : []
  )
);

const implicationCases = occurrenceRules.flatMap(({ id, rule }) =>
  rule.implications.map((implied) => ({ id, implied }))
);

describe("condition damage defenses reach the damage intake", () => {
  it("the table has at least one damage-resistance condition", () => {
    expect(resistanceCases.length).toBeGreaterThan(0);
  });

  it.each(resistanceCases)(
    "$id halves damage of every type it resists",
    ({ id, damageTypes }) => {
      const defenses = deriveDamageDefenses(emptyAggregate(), {}, undefined, 2, false, [
        id,
      ]);
      const types = damageTypes.length > 0 ? damageTypes : DAMAGE_TYPES;
      for (const type of types) {
        expect(resolveDamageIntake([{ amount: 10, type }], defenses).netTotal).toBe(5);
      }
      if (damageTypes.length === 0) {
        expect(resolveDamageIntake([{ amount: 10 }], defenses).netTotal).toBe(5);
      }
      // Without the condition the same hit lands in full.
      const bare = deriveDamageDefenses(emptyAggregate(), {}, undefined, 2, false, []);
      expect(resolveDamageIntake([{ amount: 10, type: types[0] }], bare).netTotal).toBe(
        10
      );
    }
  );
});

describe("condition implications reach the effective condition set", () => {
  it.each(implicationCases)("$id implies $implied", ({ id, implied }) => {
    // The SRD text names the implied condition, so the table tracks the rules.
    const srd = (srdConditions as Record<string, { description: string }>)[id];
    const impliedName = (srdConditions as Record<string, { name: string }>)[implied]
      ?.name;
    expect(srd?.description).toContain(impliedName);

    expect(
      effectiveSessionConditions({
        conditions: [id],
        concentration: "",
        concentrationConditions: [],
      })
    ).toContain(implied);
  });
});
