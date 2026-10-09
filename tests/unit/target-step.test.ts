/**
 * target-step — the optional "On whom?" step between choosing an action (and its slot)
 * and committing it (owner 2026-10-09: an intermediate, skippable screen, like picking
 * an enemy to attack; how many targets varies per spell/action).
 *
 * Cases come from the real engine: SRD spells resolved for a wizard/cleric sheet, and
 * an equipped weapon. Blind spot: the encounter roster here is a hand-built fixture
 * (the encounter view has its own suite).
 */
import { describe, expect, it } from "vitest";
import { resolveActions, type ResolvedAction } from "@/lib/smart-tracker";
import { localizeAction } from "@/lib/views/combat-action-view";
import { actionAtCastLevel } from "@/lib/cast-resolution";
import { getSpellById, spells } from "@/data/spells";
import { activityFromSpell } from "@/lib/activities";
import { combatResolutionSpec } from "@/lib/combat-resolution";
import {
  targetStepFor,
  type TargetRoster,
} from "@/features/character/center/target-step";
import { makeCharacterDoc } from "./_helpers";

const doc = makeCharacterDoc({
  classes: [{ classId: "wizard", level: 9 }],
  spells: spells.map((spell) => ({ srdId: spell.id })),
});
const rows = new Map(
  resolveActions(doc, "spellbook").map((row) => [row.id, localizeAction(row, "en")])
);
function spellAction(id: string, castLevel?: number): ResolvedAction {
  const row = rows.get(`spell-${id}`);
  if (!row) throw new Error(`no action for ${id}`);
  return castLevel ? actionAtCastLevel(row, getSpellById(id), castLevel) : row;
}

const SOLO: TargetRoster = { selfId: "pc-me", selfName: "Mirovel", rows: [] };
const FIGHT: TargetRoster = {
  selfId: "pc-me",
  selfName: "Mirovel",
  rows: [
    { id: "pc-me", kind: "pc", side: "ally", name: "Mirovel" },
    { id: "pc-bren", kind: "pc", side: "ally", name: "Bren" },
    { id: "pc-cora", kind: "pc", side: "ally", name: "Coralino" },
    { id: "pc-dana", kind: "pc", side: "ally", name: "Dana" },
    { id: "m-gob1", kind: "monster", side: "enemy", name: "Goblin 1" },
    { id: "m-gob2", kind: "monster", side: "enemy", name: "Goblin 2" },
    { id: "m-zomb", kind: "monster", side: "enemy", name: "Zombie" },
  ],
};
const ids = (action: ResolvedAction, roster: TargetRoster) =>
  targetStepFor(action, roster)?.candidates.map((c) => c.id);

describe("targetStepFor", () => {
  it("Bless: up to three, allies first with me on top; one more per slot level", () => {
    const step = targetStepFor(spellAction("bless"), FIGHT);
    expect(step?.max).toBe(3);
    expect(step?.candidates.slice(0, 3).map((c) => c.id)).toEqual([
      "pc-me",
      "pc-bren",
      "pc-cora",
    ]);
    expect(step?.candidates[0]).toMatchObject({ self: true, side: "ally" });
    expect(targetStepFor(spellAction("bless", 2), FIGHT)?.max).toBe(4);
  });

  it("a spell that lights a state on its recipient asks even solo (only me)", () => {
    expect(ids(spellAction("mage-armor"), SOLO)).toEqual(["pc-me"]);
  });

  it("solo, a pick that changes nothing is not asked (heals and blasts stay one tap)", () => {
    expect(targetStepFor(spellAction("healing-word"), SOLO)).toBeNull();
    expect(targetStepFor(spellAction("fire-bolt"), SOLO)).toBeNull();
  });

  it("an attack offers the enemies, one at a time, and never me", () => {
    const step = targetStepFor(spellAction("fire-bolt"), FIGHT);
    expect(step?.max).toBe(1);
    expect(step?.candidates.filter((c) => c.side === "enemy").map((c) => c.id)).toEqual([
      "m-gob1",
      "m-gob2",
      "m-zomb",
    ]);
    expect(step?.candidates.some((c) => c.self)).toBe(false);
  });

  it("an area offers every legal creature at once", () => {
    const step = targetStepFor(spellAction("fireball"), FIGHT);
    expect(step?.max).toBe(step?.candidates.length);
    expect(step?.candidates.length).toBeGreaterThanOrEqual(3);
  });

  it("a self-only spell never asks", () => {
    expect(targetStepFor(spellAction("shield"), FIGHT)).toBeNull();
    expect(targetStepFor(spellAction("mirror-image"), FIGHT)).toBeNull();
  });

  it("never offers more than any SRD spell's own target count", () => {
    let checked = 0;
    for (const spell of spells) {
      const action = rows.get(`spell-${spell.id}`);
      if (!action) continue;
      const step = targetStepFor(action, FIGHT);
      const target = activityFromSpell(spell).target;
      if (target?.affinity === "self" && !action.standingEffect) {
        expect(step, spell.id).toBeNull();
      }
      const cap = combatResolutionSpec(action).targetCap;
      if (step) {
        expect(step.max, spell.id).toBeLessThanOrEqual(
          Math.min(cap, step.candidates.length)
        );
        expect(step.max, spell.id).toBeGreaterThanOrEqual(1);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
});
