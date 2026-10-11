/**
 * castFollowUps — the optional line under a used card ("Aria +__ HP", "Goblin −__ HP",
 * "Goblin: failed the save? → Paralyzed", "+__ temp HP"): who it is for and what it
 * applies, from the action's resolution spec and the "On whom?" pick.
 *
 * Cases come from the catalogue: every SRD spell resolved for a full-spellbook sheet,
 * classified by its own resolution spec (never a hand-written list), plus the base
 * actions the same sheet carries.
 */
import { describe, expect, it } from "vitest";
import { resolveActions, type ResolvedAction } from "@/lib/smart-tracker";
import { localizeAction } from "@/lib/views/combat-action-view";
import { spells } from "@/data/spells";
import { combatResolutionSpec, shouldResolveCombatAction } from "@/lib/combat-resolution";
import { castFollowUps } from "@/lib/play/cast-follow-ups";
import { makeCharacterDoc } from "./_helpers";

const doc = makeCharacterDoc({
  classes: [{ classId: "wizard", level: 9 }],
  spells: spells.map((spell) => ({ srdId: spell.id })),
});
const catalogue: ResolvedAction[] = resolveActions(doc, "spellbook")
  .map((row) => localizeAction(row, "en"))
  .filter(shouldResolveCombatAction);
const byId = new Map(catalogue.map((action) => [action.id, action]));
const action = (id: string): ResolvedAction => {
  const found = byId.get(id);
  if (!found) throw new Error(`no action ${id}`);
  return found;
};

const ME = "pc-me";
const ALLY = "pc-aria";
const FOE = "monster-1";

const heals = catalogue.filter((a) => combatResolutionSpec(a).hasHealing);
const damages = catalogue.filter((a) => combatResolutionSpec(a).hasDamage);
const saveConditions = catalogue.filter(
  (a) => combatResolutionSpec(a).conditionApplication?.on === "failed-save"
);
const tempHps = catalogue.filter(
  (a) => combatResolutionSpec(a).hasTempHp && !(a.useEffects ?? []).length
);

describe("castFollowUps", () => {
  it("the catalogue holds every kind of case", () => {
    expect(heals.length).toBeGreaterThan(5);
    expect(damages.length).toBeGreaterThan(20);
    expect(saveConditions.length).toBeGreaterThan(10);
    expect(tempHps.length).toBeGreaterThan(0);
  });

  it("every heal offers a heal line to each picked target", () => {
    for (const a of heals) {
      const lines = castFollowUps(a, [ALLY, ME], ME);
      expect(
        lines.filter((l) => l.kind === "heal").map((l) => l.targetId),
        a.id
      ).toEqual([ALLY, ME]);
    }
  });

  it("a heal with no pick goes to me when it can reach me", () => {
    for (const a of heals) {
      const spec = combatResolutionSpec(a);
      const selfOk = spec.targetAffinity !== "enemy" && !spec.excludeSelf;
      const lines = castFollowUps(a, [], ME).filter((l) => l.kind === "heal");
      expect(
        lines.map((l) => l.targetId),
        a.id
      ).toEqual(selfOk ? [ME] : []);
    }
  });

  it("every damage action offers a damage line per target, and none without a target", () => {
    for (const a of damages) {
      expect(
        castFollowUps(a, [FOE], ME)
          .filter((l) => l.kind === "damage")
          .map((l) => l.targetId),
        a.id
      ).toEqual([FOE]);
      expect(
        castFollowUps(a, [], ME).filter((l) => l.kind === "damage"),
        a.id
      ).toEqual([]);
    }
  });

  it("every save-or-condition action offers its conditions per target", () => {
    for (const a of saveConditions) {
      const application = combatResolutionSpec(a).conditionApplication;
      if (!application) throw new Error(a.id);
      const lines = castFollowUps(a, [FOE], ME).filter((l) => l.kind === "condition");
      expect(lines, a.id).toEqual([
        {
          kind: "condition",
          targetId: FOE,
          conditionIds: application.options,
          pickOne:
            application.max !== undefined && application.max < application.options.length,
        },
      ]);
      expect(castFollowUps(a, [], ME), a.id).toEqual([]);
    }
  });

  it("a condition that lands without a save (Invisibility) is not asked", () => {
    expect(
      castFollowUps(action("spell-invisibility"), [ALLY], ME).filter(
        (l) => l.kind === "condition"
      )
    ).toEqual([]);
  });

  it("temporary HP not applied on use go to the pick, else to me", () => {
    for (const a of tempHps) {
      expect(
        castFollowUps(a, [], ME)
          .filter((l) => l.kind === "temp-hp")
          .map((l) => l.targetId),
        a.id
      ).toEqual([ME]);
    }
  });

  it("an action with nothing to apply offers nothing (Mage Armor)", () => {
    expect(castFollowUps(action("spell-mage-armor"), [ME], ME)).toEqual([]);
  });

  it("Hold Person on a goblin: one line, Paralyzed", () => {
    expect(castFollowUps(action("spell-hold-person"), [FOE], ME)).toEqual([
      { kind: "condition", targetId: FOE, conditionIds: ["paralyzed"], pickOne: false },
    ]);
  });
});
