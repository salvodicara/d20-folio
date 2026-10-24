/**
 * What a spell does to this one target, read from the target's own Hit Points, shown
 * on its tray row (Rules session's batch 4). SRD 5.2.1: Revivify "That creature
 * revives with 1 Hit Point"; Resurrection returns it "with all its Hit Points"; Power
 * Word Kill "If the target has 100 Hit Points or fewer, it dies. Otherwise, it takes
 * 12d12 Psychic damage"; Power Word Stun stuns a target with 150 or fewer, otherwise
 * its Speed is 0. A target whose Hit Points the viewer may not see has no verdict.
 */
import { describe, expect, it } from "vitest";

import { spells } from "@/data/spells";
import { shouldResolveCombatAction } from "@/lib/combat-resolution";
import {
  damageTrayPlan,
  initialTrayRow,
  type DamageTrayPlan,
} from "@/lib/play/damage-tray";
import { resolveActions, type ResolvedAction } from "@/lib/smart-tracker";
import { localizeAction } from "@/lib/views/combat-action-view";
import { makeCharacterDoc } from "./_helpers";

const doc = makeCharacterDoc({
  classes: [{ classId: "wizard", level: 20 }],
  spells: spells.map((spell) => ({ srdId: spell.id })),
});
const byId = new Map(
  resolveActions(doc, "spellbook")
    .map((row) => localizeAction(row, "en"))
    .filter(shouldResolveCombatAction)
    .map((a) => [a.id, a] as const)
);
const plan = (id: string, target: string): DamageTrayPlan => {
  const a: ResolvedAction | undefined = byId.get(id);
  const found = a ? damageTrayPlan(a, [target], "pc-me") : null;
  if (!found) throw new Error(`no tray for ${id}`);
  return found;
};
const hp = (current: number, max: number) => ({ current, max });

describe("the spell's outcome on each tray row", () => {
  it("Revivify brings the dead ally back with 1 Hit Point; Resurrection with all", () => {
    // A revive spell isn't resolved in combat yet (it would open the "On whom?" step:
    // a visible change behind the owner's gate), so the row is read from its plan.
    const revive = (hitPoints: number | "all"): DamageTrayPlan => ({
      effect: null,
      revive: { hitPoints },
      targets: ["pc-ally"],
    });
    const at = (p: DamageTrayPlan) =>
      initialTrayRow(p, "pc-ally", undefined, undefined, hp(0, 40)).outcome;
    expect(at(revive(1))).toEqual({ kind: "revive", hitPoints: 1 });
    expect(at(revive("all"))).toEqual({ kind: "revive", hitPoints: 40 });
    expect(initialTrayRow(revive(1), "pc-ally").outcome).toEqual({
      kind: "revive",
      hitPoints: null,
    });
  });

  it("Power Word Kill: 100 Hit Points or fewer dies, more takes the damage", () => {
    const p = plan("spell-power-word-kill", "monster-1");
    expect(
      initialTrayRow(p, "monster-1", undefined, undefined, hp(100, 180)).outcome
    ).toEqual({
      kind: "threshold",
      branch: "dies",
    });
    expect(
      initialTrayRow(p, "monster-1", undefined, undefined, hp(101, 180)).outcome
    ).toEqual({
      kind: "threshold",
      branch: "otherwise",
    });
  });

  it("Power Word Stun: 150 or fewer is stunned, otherwise Speed 0", () => {
    // Power Word Stun doesn't open the tray yet (no damage, no save): read from its plan.
    const p: DamageTrayPlan = {
      effect: null,
      hitPointThreshold: { max: 150, atOrBelow: "condition", otherwise: "speed-zero" },
      targets: ["monster-1"],
    };
    expect(
      initialTrayRow(p, "monster-1", undefined, undefined, hp(150, 200)).outcome
    ).toEqual({
      kind: "threshold",
      branch: "condition",
    });
    expect(
      initialTrayRow(p, "monster-1", undefined, undefined, hp(151, 200)).outcome
    ).toEqual({
      kind: "threshold",
      branch: "speed-zero",
    });
  });

  it("Hit Points the viewer can't see: no verdict, the DM decides", () => {
    const p = plan("spell-power-word-kill", "monster-1");
    expect(initialTrayRow(p, "monster-1").outcome).toEqual({
      kind: "threshold",
      branch: null,
    });
  });

  it("a spell without such an outcome has none (Fireball)", () => {
    const row = initialTrayRow(
      plan("spell-fireball", "monster-1"),
      "monster-1",
      undefined,
      undefined,
      hp(10, 20)
    );
    expect(row.outcome).toBeUndefined();
  });
});
