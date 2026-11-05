/**
 * A feature that adds to another feature's outcome (an `action-outcome-rider`), with
 * an outcome that holds whatever the save (`saveOutcome: "any"`) and a state that
 * gives Disadvantage on saves against its creator's spells (`save-disadvantage`).
 * The case: a subclass feature by which a Stunning Strike target, whatever its save,
 * has Disadvantage on saves against the monk's spells until the start of the monk's
 * next turn. The rider here is a fixture feature, so the public suite needs no
 * private content.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadCampaignIo, writesSettled } from "./__helpers__/campaign-io-writes";

const io = vi.hoisted(() => ({
  appendPersistentCombatEffect: vi.fn(() => Promise.resolve()),
  revokePersistentCombatEffect: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/features/campaigns/campaign-io", () => io);

beforeAll(loadCampaignIo);

import { classFeatureIndex } from "@/data/classes";
import type { SrdClassFeatureData } from "@/data/types";
import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { applyTray } from "@/features/character/center/apply-tray";
import {
  saveFailedWriter,
  saveSuccessWriter,
} from "@/features/character/center/outcome-offer";
import { incomingSaveModes } from "@/lib/combat-effects";
import { conformGrant } from "@/lib/grants";
import { damageTrayPlan, initialTrayRow, toggleSaved } from "@/lib/play/damage-tray";
import { resolveActions } from "@/lib/smart-tracker";
import { localizeActions } from "@/lib/views/combat-action-view";
import { useCharacterStore } from "@/stores/characterStore";
import type { ActiveCombatEffect, CombatEffectOp } from "@/types/combat-effect";
import { makeCharacterDoc } from "./_helpers";

const RIDER_ID = "test-focused-strike";
const STATE = "test-focused-strike-spell-saves";

const rider = {
  id: RIDER_ID,
  class: "monk",
  level: 11,
  grants: [
    {
      type: "action-outcome-rider",
      actionOf: "monk-stunning-strike",
      effects: [
        {
          kind: "save-disadvantage",
          against: "actor-spells",
          saveOutcome: "any",
          until: { phase: "turn-start", anchor: "actor" },
          activeKey: STATE,
        },
      ],
    },
  ],
  targetStates: [
    {
      type: "while-active",
      activeKey: STATE,
      onlyAgainstCreator: true,
      grants: [{ type: "disadvantage-on", rollType: "save", vs: "spells" }],
    },
  ],
  source: "SRD",
} as unknown as SrdClassFeatureData;

classFeatureIndex.set(RIDER_ID, rider);
afterAll(() => {
  classFeatureIndex.delete(RIDER_ID);
});

const withRider = makeCharacterDoc({
  classId: "monk",
  level: 11,
  features: [{ srdId: "monk-stunning-strike" }, { srdId: RIDER_ID }],
});
const without = makeCharacterDoc({
  classId: "monk",
  level: 11,
  features: [{ srdId: "monk-stunning-strike" }],
});
const strikeOf = (doc: typeof withRider) => {
  const strike = resolveActions(doc, "combat").find((a) =>
    a.id.includes("monk-stunning-strike")
  );
  if (!strike) throw new Error("no Stunning Strike");
  return strike;
};

describe("the rider grant", () => {
  it("conforms as a catalogue grant", () => {
    expect(conformGrant(rider.grants?.[0])).not.toBeNull();
  });

  it("Stunning Strike carries the rider's state, held by the rider feature", () => {
    expect(strikeOf(withRider).summary.outcomeRiders).toEqual([
      {
        source: { kind: "feature", id: RIDER_ID },
        effects: [
          expect.objectContaining({ kind: "save-disadvantage", activeKey: STATE }),
        ],
      },
    ]);
    expect(strikeOf(without).summary.outcomeRiders).toBeUndefined();
  });
});

describe("the tray writes it whether or not the target saves", () => {
  const plan = {
    effect: null,
    save: { ability: "CON", dc: 15, onSave: "none" },
    conditions: { options: ["stunned"], pickOne: false },
    targets: ["monster-1"],
  } as never;
  const target = { id: "monster-1", name: "Ogre", kind: "monster" as const };

  function written(): Array<ActiveCombatEffect> {
    return io.appendPersistentCombatEffect.mock.calls.map(
      (call) => (call as unknown as [string, ActiveCombatEffect])[1]
    );
  }

  function apply(doc: typeof withRider, saved: boolean) {
    const strike = strikeOf(doc);
    const onSaved = saveSuccessWriter(strike, doc.id);
    const onFailed = saveFailedWriter(strike, doc.id);
    const row = initialTrayRow(plan, "monster-1");
    applyTray(
      {
        characterId: doc.id,
        actionName: "Stunning Strike",
        source: { custom: "Stunning Strike" },
        castLogId: null,
        actionId: strike.id,
        plan,
        ...(onSaved ? { onSaved } : {}),
        ...(onFailed ? { onFailed } : {}),
      },
      [target],
      [saved ? toggleSaved(row, plan) : row],
      [0],
      ((k: string) => k) as never
    );
  }

  beforeEach(() => {
    vi.stubEnv("VITE_COMBAT_EFFECTS_V26", "true");
    io.appendPersistentCombatEffect.mockClear();
    useCharacterStore.setState({ character: withRider, readonly: false });
    useCombatStatusStore.setState({
      status: {
        campaignId: "c1",
        myId: "pc-me",
        characterId: withRider.id,
        round: 2,
        encounter: { effectOps: [], currentCombatantId: "pc-me" },
        view: { rows: [{ id: "monster-1", kind: "monster" }], turnOrderIds: [] },
      } as never,
    });
  });

  it("a failed save: the rider's state, from the rider, until the monk's next turn", async () => {
    apply(withRider, false);
    await writesSettled();
    const states = written().filter((e) => e.source.id === RIDER_ID);
    expect(states).toHaveLength(1);
    expect(states[0]).toMatchObject({
      actor: { combatantId: "pc-me" },
      target: { combatantId: "monster-1" },
      payload: { kind: "grant-group", activeKey: STATE },
      duration: {
        kind: "turn-boundary",
        combatantId: "pc-me",
        round: 3,
        phase: "turn-start",
      },
    });
  });

  it("a successful save: the rider's state too, beside Stunning Strike's own", async () => {
    apply(withRider, true);
    await writesSettled();
    expect(written().map((e) => e.payload)).toEqual([
      { kind: "grant-group", activeKey: "monk-stunning-strike-slowed" },
      { kind: "grant-group", activeKey: "monk-stunning-strike-exposed" },
      { kind: "grant-group", activeKey: STATE },
    ]);
  });

  it("without the rider feature a failed save writes no state", () => {
    expect(saveFailedWriter(strikeOf(without), without.id)).toBeUndefined();
  });
});

describe("a save against the creator's spell", () => {
  const effect: ActiveCombatEffect = {
    id: "e1",
    actor: { kind: "pc", combatantId: "pc-monk", memberUid: "u", characterId: "c" },
    target: { kind: "monster", combatantId: "monster-1" },
    source: { kind: "feature", id: RIDER_ID },
    payload: { kind: "grant-group", activeKey: STATE },
    duration: {
      kind: "turn-boundary",
      combatantId: "pc-monk",
      round: 3,
      phase: "turn-start",
    },
  } as ActiveCombatEffect;
  const ops = [{ id: "o1", kind: "apply", effect }] as unknown as CombatEffectOp[];

  it("has Disadvantage when the monk casts", () => {
    expect(incomingSaveModes(ops, "monster-1", "pc-monk")).toEqual([
      { effect, sourceId: RIDER_ID, mode: "disadvantage" },
    ]);
  });

  it("not when another caster does, nor for another creature", () => {
    expect(incomingSaveModes(ops, "monster-1", "pc-wizard")).toEqual([]);
    expect(incomingSaveModes(ops, "monster-2", "pc-monk")).toEqual([]);
  });

  it("a spell's tray says its save is a spell's; Stunning Strike's does not", () => {
    const wizard = makeCharacterDoc({
      classId: "wizard",
      level: 5,
      spells: [{ srdId: "fireball", prepared: true }],
      spellSlots: [{ level: 3, total: 2 }],
    });
    const fireball = localizeActions(wizard, "en").find((a) => a.spellId === "fireball");
    if (!fireball) throw new Error("no Fireball");
    expect(damageTrayPlan(fireball, ["monster-1"], "pc-me")?.save?.bySpell).toBe(true);
    const strike = localizeActions(withRider, "en").find((a) =>
      a.id.includes("monk-stunning-strike")
    );
    if (!strike) throw new Error("no Stunning Strike");
    expect(damageTrayPlan(strike, ["monster-1"], "pc-me")?.save?.bySpell).toBeUndefined();
  });
});
