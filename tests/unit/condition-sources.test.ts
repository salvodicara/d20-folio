/**
 * Conditions with a source (edge-case family M3): Frightened's roll penalties hold
 * only while its source is in sight. The sheet derives that with `canSee` when it
 * knows the source; otherwise the table answers, per condition instance.
 */
import { describe, expect, it } from "vitest";
import {
  conditionFactsFor,
  conditionSourceInstances,
  needsSeesAnswer,
  sheetConditionEffects,
} from "@/lib/condition-sources";
import { applySheetEvent } from "@/lib/play/sheet-events";
import type { ActiveCombatEffect } from "@/types/combat-effect";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

function fear(id: string, from: string): ActiveCombatEffect {
  return {
    id,
    actor: { kind: "monster", combatantId: from },
    target: { kind: "pc", combatantId: "pc-me", memberUid: "me", characterId: "c" },
    source: { kind: "spell", id: "fear", actionId: "fear" },
    payload: { kind: "condition", conditionId: "frightened" },
    duration: { kind: "encounter" },
  };
}

const withSession = (doc: CharacterDoc, patch: Partial<CharacterDoc["session"]>) => ({
  ...doc,
  session: { ...doc.session, ...patch },
});

const attackDis = (
  doc: CharacterDoc,
  encounter?: Parameters<typeof conditionFactsFor>[1]
) =>
  sheetConditionEffects(doc, encounter).disadvantages.some(
    (d) => d.rollType === "attack"
  );

describe("conditions with a source", () => {
  it("a chip with no known source asks the table, and its answer is stored per instance", () => {
    const doc = withSession(makeCharacterDoc(), { conditions: ["frightened"] });
    const [instance] = conditionSourceInstances(doc);
    expect(instance).toMatchObject({
      key: "condition:frightened",
      conditionId: "frightened",
    });
    expect(instance && needsSeesAnswer(instance)).toBe(true);
    // Unknown: the penalty holds.
    expect(attackDis(doc)).toBe(true);
    const away = applySheetEvent(doc, {
      kind: "set-sees-source",
      key: "condition:frightened",
      sees: false,
    });
    if (!away) throw new Error("no change");
    expect(conditionFactsFor(away).seesSource).toBe(false);
    expect(attackDis(away)).toBe(false);
    // Clearing the answer asks again.
    const reset = applySheetEvent(away, {
      kind: "set-sees-source",
      key: "condition:frightened",
      sees: null,
    });
    expect(reset && attackDis(reset)).toBe(true);
  });

  it("a known source is derived with canSee: Blinded never sees it, an Invisible source neither", () => {
    const effects = [fear("e1", "monster-1")];
    const blind = withSession(makeCharacterDoc(), {
      conditions: ["blinded"],
      encounterEffects: effects,
    });
    expect(conditionFactsFor(blind).seesSource).toBe(false);
    const doc = withSession(makeCharacterDoc(), { encounterEffects: effects });
    const encounter = { rows: [{ id: "monster-1", conditions: ["invisible"] }] };
    const [instance] = conditionSourceInstances(doc, encounter);
    expect(instance).toMatchObject({
      key: "effect:e1",
      sourceId: "monster-1",
      seesSource: false,
    });
    expect(instance && needsSeesAnswer(instance)).toBe(false);
    expect(attackDis(doc, encounter)).toBe(false);
  });

  it("a known source in unknown light still asks the table", () => {
    const doc = withSession(makeCharacterDoc(), {
      encounterEffects: [fear("e1", "monster-1")],
    });
    const encounter = { rows: [{ id: "monster-1", conditions: [] }] };
    const [instance] = conditionSourceInstances(doc, encounter);
    expect(instance?.sourceId).toBe("monster-1");
    expect(instance && needsSeesAnswer(instance)).toBe(true);
  });

  it("two fears answer apart: one source in sight keeps the penalty", () => {
    const doc = withSession(makeCharacterDoc(), {
      encounterEffects: [fear("e1", "monster-1"), fear("e2", "monster-2")],
      seesSource: { "effect:e1": false },
    });
    expect(conditionSourceInstances(doc)).toHaveLength(2);
    expect(attackDis(doc)).toBe(true);
    const both = withSession(doc, {
      seesSource: { "effect:e1": false, "effect:e2": false },
    });
    expect(attackDis(both)).toBe(false);
  });

  it("a chip can carry its source", () => {
    const doc = withSession(makeCharacterDoc(), {
      conditions: ["frightened"],
      conditionSources: { frightened: "monster-1" },
    });
    const encounter = { rows: [{ id: "monster-1", conditions: ["invisible"] }] };
    expect(conditionSourceInstances(doc, encounter)[0]).toMatchObject({
      sourceId: "monster-1",
      seesSource: false,
    });
  });
});

describe("condition sources persistence", () => {
  it("round-trips a chip's source and the table's answers", async () => {
    const { sessionToState, stateToSession } = await import("@/lib/session-state-codec");
    const doc = withSession(makeCharacterDoc(), {
      conditions: ["frightened"],
      conditionSources: { frightened: "monster-1" },
      seesSource: { "condition:frightened": false, "effect:e2": true },
    });
    const back = stateToSession(
      JSON.parse(JSON.stringify(sessionToState(doc.session))) as Record<string, unknown>
    );
    expect(back.conditionSources).toEqual({ frightened: "monster-1" });
    expect(back.seesSource).toEqual({ "condition:frightened": false, "effect:e2": true });
  });
});

describe("removing a chip", () => {
  it("forgets its source and the table's answer", async () => {
    const { removeCondition } = await import("@/lib/play/conditions");
    const doc = withSession(makeCharacterDoc(), {
      conditions: ["frightened"],
      conditionSources: { frightened: "monster-1" },
      seesSource: { "condition:frightened": false, "effect:e2": true },
    });
    const next = removeCondition(doc, "frightened")?.session;
    expect(next?.conditionSources).toEqual({});
    expect(next?.seesSource).toEqual({ "effect:e2": true });
  });
});
