/**
 * A repeat save that ends a spell's effect with no condition (#1346): Slow, Confusion,
 * Ray of Enfeeblement and Phantasmal Killer each say "the target repeats the save at
 * the end of each of its turns, ending the spell on a success", but impose no named
 * condition. The spell's `effectEnds` carries the same `ConditionEnd` rule, read for
 * the effect the cast leaves on each target (a `grant-group` state), so a shared fight
 * prompts the save and a success ends the effect on that target only.
 */
import { describe, expect, it } from "vitest";

import { getSpellById } from "@/data/spells";
import en from "@/i18n/en/srd/spells.json";
import {
  fightConditionEnds,
  sourcedFightConditions,
  type FightLook,
} from "@/lib/play/fight-condition-ends";
import { soloRepeatSavesDue } from "@/lib/play/solo-repeat-saves";
import { combatResolutionSpec } from "@/lib/combat-resolution";
import { resolveActions } from "@/lib/smart-tracker";
import { localizeAction } from "@/lib/views/combat-action-view";
import { makeCharacterDoc } from "./_helpers";
import type {
  ActiveCombatEffect,
  CombatantRef,
  CombatEffectOp,
} from "@/types/combat-effect";

const text = (id: string) =>
  (en as Record<string, { description?: string }>)[id]?.description ?? "";

describe("spells whose effect ends on a repeat save, with no condition", () => {
  it.each([
    ["slow", "WIS"],
    ["confusion", "WIS"],
    ["ray-of-enfeeblement", "CON"],
    ["phantasmal-killer", "WIS"],
  ] as const)("%s: %s at the end of each of the target's turns", (id, ability) => {
    expect(text(id)).toMatch(/at the end of each of its turns/i);
    const spell = getSpellById(id);
    expect(spell?.effectEnds).toEqual([
      { on: "repeat-save", ability, at: "target-turn-end" },
    ]);
    // The rule hangs off the effect: no condition is attached.
    expect(spell?.conditionApplication).toBeUndefined();
  });

  it.each(["slow", "confusion", "phantasmal-killer"])(
    "%s leaves its state on each failed target (a selected-recipient state)",
    (id) => {
      const states = (getSpellById(id)?.grants ?? []).filter(
        (g) => g.type === "while-active" && g.recipient === "selected"
      );
      expect(states).toHaveLength(1);
    }
  );
});

describe("a cast leaves the state on each failed target", () => {
  const doc = makeCharacterDoc({
    classes: [{ classId: "wizard", level: 20 }],
    spells: ["slow", "confusion", "phantasmal-killer"].map((srdId) => ({ srdId })),
  });
  const rows = resolveActions(doc, "spellbook").map((row) => localizeAction(row, "en"));

  it.each([
    ["slow", "spell-slow"],
    ["confusion", "spell-confusion"],
    ["phantasmal-killer", "spell-phantasmal-killer"],
  ])("%s: a save whose failure writes the %s state on the target", (id, activeKey) => {
    const cast = rows.find((a) => a.spellId === id && !a.id.endsWith("-recurring"));
    if (!cast) throw new Error(`no cast row for ${id}`);
    const spec = combatResolutionSpec(cast);
    expect(spec.kind).toBe("save");
    expect(spec.standingEffect?.payload).toEqual({ kind: "grant-group", activeKey });
    expect(spec.standingEffect?.source.id).toBe(id);
  });
});

const caster: CombatantRef = {
  kind: "pc",
  combatantId: "pc-me",
  memberUid: "me",
  characterId: "c1",
};

const apply = (effect: ActiveCombatEffect): CombatEffectOp => ({
  id: `op-${effect.id}`,
  kind: "apply",
  effect,
});

/** One Slow cast on two goblins: one state effect per target. */
const slowOn = (effectId: string, targetId: string): ActiveCombatEffect => ({
  id: effectId,
  actor: caster,
  target: { kind: "monster", combatantId: targetId },
  source: { kind: "spell", id: "slow", actionId: "spell-slow", castLevel: 3 },
  payload: { kind: "grant-group", activeKey: "spell-slow" },
  bindings: { saveDc: 15 },
  duration: { kind: "concentration", actorId: "pc-me", sourceId: "slow" },
});

const ops = [apply(slowOn("slow-a", "goblin-a")), apply(slowOn("slow-b", "goblin-b"))];

function look(turn: string | null): FightLook {
  return {
    rows: ["goblin-a", "goblin-b", "pc-me"].map((id) => ({
      id,
      currentHp: 10,
      tempHp: 0,
      conditions: [],
    })),
    currentCombatantId: turn,
  };
}

describe("a shared fight: Slow on a target", () => {
  it("raises a WIS save at the end of the target's turn, naming no condition", () => {
    const { ended, saves } = fightConditionEnds(ops, look("goblin-a"), look("goblin-b"));
    expect(ended).toEqual([]);
    expect(saves).toEqual([
      {
        id: "slow-a",
        targetId: "goblin-a",
        ability: "WIS",
        dc: 15,
        at: "target-turn-end",
        actorId: "pc-me",
      },
    ]);
  });

  it("raises nothing at the start of the target's turn", () => {
    expect(fightConditionEnds(ops, look("pc-me"), look("goblin-a")).saves).toEqual([]);
  });

  it("each target of the same cast is its own occurrence: a save ends only its own", () => {
    // The prompt's success revokes the save's id; the other target's effect is
    // another id, untouched.
    const sourced = sourcedFightConditions(ops);
    expect(sourced.map((c) => [c.id, c.targetId])).toEqual([
      ["slow-a", "goblin-a"],
      ["slow-b", "goblin-b"],
    ]);
    const { saves } = fightConditionEnds(ops, look("goblin-a"), look("goblin-b"));
    expect(saves.map((s) => s.id)).toEqual(["slow-a"]);
  });

  it("a state from a spell without the rule asks nothing (Bane)", () => {
    const bane = apply({
      ...slowOn("bane-a", "goblin-a"),
      source: { kind: "spell", id: "bane", actionId: "spell-bane" },
      payload: { kind: "grant-group", activeKey: "spell-bane" },
    });
    expect(sourcedFightConditions([bane])).toEqual([]);
  });
});

describe("regression: condition-based repeat saves are unchanged", () => {
  const paralyzed = apply({
    id: "hold-1",
    actor: caster,
    target: { kind: "monster", combatantId: "goblin-a" },
    source: { kind: "spell", id: "hold-person", actionId: "spell-hold-person" },
    payload: { kind: "condition", conditionId: "paralyzed" },
    bindings: { saveDc: 14 },
    duration: { kind: "concentration", actorId: "pc-me", sourceId: "hold-person" },
  });

  it("Hold Person's Paralyzed asks its WIS save at the end of the target's turn", () => {
    expect(
      fightConditionEnds([paralyzed], look("goblin-a"), look("goblin-b")).saves
    ).toEqual([
      {
        id: "hold-1",
        conditionId: "paralyzed",
        targetId: "goblin-a",
        ability: "WIS",
        dc: 14,
        at: "target-turn-end",
        actorId: "pc-me",
      },
    ]);
  });
});

describe("the solo strip: a spell effect on the sheet", () => {
  it("Slow's state asks the WIS save at the end of the turn, naming no condition", () => {
    expect(
      soloRepeatSavesDue([
        {
          key: "slow-1",
          source: { kind: "spell", id: "slow", actionId: "spell-slow" },
          saveDc: 15,
        },
      ])
    ).toEqual([
      {
        id: "slow-1",
        conditionIds: [],
        keys: ["slow-1"],
        source: { kind: "spell", id: "slow" },
        ability: "WIS",
        at: "target-turn-end",
        dc: 15,
      },
    ]);
  });
});
