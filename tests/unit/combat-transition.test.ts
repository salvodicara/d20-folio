import { describe, expect, it } from "vitest";
import { reducePcDamage, type PcDamageState } from "@/lib/combat-transition";
import type { ActiveCombatEffect } from "@/types/combat-effect";

const state = (overrides: Partial<PcDamageState> = {}): PcDamageState => ({
  hp: { current: 20, temp: 0, max: 20 },
  conditions: [],
  deathSaves: { successes: 0, failures: 0 },
  ...overrides,
});

const effect = (
  id: string,
  sourceId: "death-ward" | "warding-bond"
): ActiveCombatEffect => ({
  id,
  actor: { kind: "monster", combatantId: "caster" },
  target: { kind: "monster", combatantId: "target" },
  source: { kind: "spell", id: sourceId, actionId: `spell-${sourceId}` },
  payload: { kind: "grant-group", activeKey: `spell-${sourceId}` },
  duration: { kind: "encounter" },
});

describe("combat-transition — canonical PC damage", () => {
  it("absorbs temporary HP before current HP and emits the resolved hit", () => {
    const result = reducePcDamage({
      state: state({ hp: { current: 20, temp: 5, max: 20 } }),
      intake: { stage: "resolved", amount: 8 },
    });

    expect(result.state.hp).toEqual({ current: 17, temp: 0, max: 20 });
    expect(result.events[0]).toEqual({
      kind: "hp-damage",
      incoming: 8,
      applied: 8,
      current: 17,
      max: 20,
      tempAbsorbed: 5,
    });
  });

  it("turns a critical hit at 0 into two failures and clears stability", () => {
    const result = reducePcDamage({
      state: state({
        hp: { current: 0, temp: 3, max: 20 },
        conditions: ["unconscious"],
        deathSaves: { successes: 3, failures: 0 },
      }),
      intake: { stage: "resolved", amount: 2 },
      crit: true,
    });

    expect(result.state.hp).toEqual({ current: 0, temp: 1, max: 20 });
    expect(result.state.deathSaves).toEqual({ successes: 0, failures: 2 });
  });

  it("removes Unconscious when damage at 0 reaches three failures", () => {
    const result = reducePcDamage({
      state: state({
        hp: { current: 0, temp: 0, max: 20 },
        conditions: ["unconscious"],
        deathSaves: { successes: 1, failures: 2 },
      }),
      intake: { stage: "resolved", amount: 1 },
    });

    expect(result.state.conditions).toEqual([]);
    expect(result.state.deathSaves).toEqual({ successes: 0, failures: 3 });
    expect(result.events).toContainEqual({
      kind: "condition-loss",
      conditionId: "unconscious",
    });
  });

  it("distinguishes massive death from a fresh unconscious knockout", () => {
    const massive = reducePcDamage({
      state: state({ hp: { current: 8, temp: 2, max: 20 } }),
      intake: { stage: "resolved", amount: 30 },
    });
    const knockout = reducePcDamage({
      state: state({
        hp: { current: 8, temp: 2, max: 20 },
        deathSaves: { successes: 2, failures: 1 },
      }),
      intake: { stage: "resolved", amount: 29 },
    });

    expect(massive.state).toMatchObject({
      hp: { current: 0, temp: 0 },
      conditions: [],
      deathSaves: { successes: 0, failures: 3 },
    });
    expect(massive.instantDeath).toBe(true);
    expect(knockout.state).toMatchObject({
      hp: { current: 0, temp: 0 },
      conditions: ["unconscious"],
      deathSaves: { successes: 0, failures: 0 },
    });
  });

  it("does not defend resolved damage twice while transfer and Death Ward still run", () => {
    const bond = effect("bond", "warding-bond");
    const ward = effect("ward", "death-ward");
    const result = reducePcDamage({
      state: state({ hp: { current: 8, temp: 0, max: 20 } }),
      intake: { stage: "resolved", amount: 20 },
      persistentEffects: [bond, ward],
    });

    expect(result.resolvedDamage).toBe(20);
    expect(result.state.hp.current).toBe(1);
    expect(result.transfers).toEqual([
      { target: bond.actor, amount: 20, effectId: bond.id },
    ]);
    expect(result.consumedEffectIds).toContain(ward.id);
    expect(result.events.some((event) => event.kind === "down")).toBe(false);
    expect(result.events[0]).toMatchObject({
      kind: "hp-damage",
      incoming: 20,
      applied: 7,
    });
  });

  it("halves raw all-damage resistance once and transfers the resolved amount", () => {
    const bond = effect("bond", "warding-bond");
    const result = reducePcDamage({
      state: state(),
      intake: { stage: "raw", amount: 9 },
      persistentEffects: [bond],
    });

    expect(result.resolvedDamage).toBe(4);
    expect(result.state.hp.current).toBe(16);
    expect(result.transfers).toEqual([
      { target: bond.actor, amount: 4, effectId: bond.id },
    ]);
  });

  it("consumes a state-backed zero-HP floor without knowing its source id", () => {
    const result = reducePcDamage({
      state: state({ hp: { current: 8, temp: 0, max: 20 } }),
      intake: { stage: "resolved", amount: 100 },
      stateZeroHpFloors: [{ stateKey: "ward-state", hitPoints: 1 }],
    });

    expect(result.state.hp.current).toBe(1);
    expect(result.consumedStateKeys).toEqual(["ward-state"]);
    expect(result.instantDeath).toBe(false);
  });

  it("consumes both representations when one ward is projected and state-backed", () => {
    const ward = effect("ward", "death-ward");
    const result = reducePcDamage({
      state: state({ hp: { current: 8, temp: 0, max: 20 } }),
      intake: { stage: "resolved", amount: 20 },
      persistentEffects: [ward],
      stateZeroHpFloors: [{ stateKey: "spell-death-ward", hitPoints: 1 }],
    });

    expect(result.state.hp.current).toBe(1);
    expect(result.consumedEffectIds).toEqual([ward.id]);
    expect(result.consumedStateKeys).toEqual(["spell-death-ward"]);
  });

  it("consumes only the highest competing zero-HP floor", () => {
    const ward = effect("ward", "death-ward");
    const result = reducePcDamage({
      state: state({ hp: { current: 8, temp: 0, max: 20 } }),
      intake: { stage: "resolved", amount: 20 },
      persistentEffects: [ward],
      stateZeroHpFloors: [{ stateKey: "stronger-floor", hitPoints: 5 }],
    });

    expect(result.state.hp.current).toBe(5);
    expect(result.consumedStateKeys).toEqual(["stronger-floor"]);
    expect(result.consumedEffectIds).not.toContain(ward.id);
  });
});
