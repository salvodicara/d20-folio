/**
 * A spell with a bigger die against a hurt target (`damageIfHurt`): each tray row
 * shows the die that target takes, read from its own Hit Points. A target at full
 * Hit Points, or one whose Hit Points are unknown, takes the base die.
 */
import { describe, expect, it } from "vitest";
import { resolveActions, type ResolvedAction } from "@/lib/smart-tracker";
import { localizeAction } from "@/lib/views/combat-action-view";
import { shouldResolveCombatAction } from "@/lib/combat-resolution";
import { damageTrayPlan, initialTrayRow } from "@/lib/play/damage-tray";
import { initialTrayRowFor } from "@/components/shared/damage-tray-target";
import { makeCharacterDoc } from "./_helpers";

const doc = makeCharacterDoc({
  classes: [{ classId: "cleric", level: 5 }],
  spells: [{ srdId: "sacred-flame" }],
});
const flame = resolveActions(doc, "spellbook")
  .map((row) => localizeAction(row, "en"))
  .filter(shouldResolveCombatAction)
  .find((a) => a.spellId === "sacred-flame");
if (!flame) throw new Error("no Sacred Flame row");
// The same cantrip row, given a bigger die against a hurt target.
const tolling: ResolvedAction = {
  ...flame,
  summary: { ...flame.summary, damage: "2d8", damageIfHurt: "2d12" },
};

describe("the tray's die per target", () => {
  const plan = damageTrayPlan(tolling, ["orc", "ogre", "mystery"], "pc-me");
  if (!plan) throw new Error("no tray");

  it("full Hit Points: the base die; missing any: the bigger one; unknown: both", () => {
    expect(
      initialTrayRow(plan, "ogre", undefined, undefined, { current: 59, max: 59 }).dice
    ).toBe("2d8");
    expect(
      initialTrayRow(plan, "orc", undefined, undefined, { current: 6, max: 15 }).dice
    ).toBe("2d12");
    // Unknown: the player can't tell, so both dice ("ask the DM"), never a wrong one.
    expect(initialTrayRow(plan, "mystery").dice).toBe("2d8 / 2d12");
  });

  it("a spell without the rule names no per-target die", () => {
    const own = damageTrayPlan(flame, ["orc"], "pc-me");
    if (!own) throw new Error("no tray");
    expect(
      initialTrayRow(own, "orc", undefined, undefined, { current: 6, max: 15 }).dice
    ).toBe(undefined);
  });

  it("hidden Hit Points: a Bloodied band still says the target is hurt", () => {
    const plan = damageTrayPlan(tolling, ["orc"], "pc-me");
    if (!plan) throw new Error("no tray");
    const row = (band: "healthy" | "bloodied") =>
      initialTrayRowFor(plan, { id: "orc", name: "Orc", kind: "monster", band }).dice;
    // "In forze" can't tell full from a scratch: both dice.
    expect(row("healthy")).toBe("2d8 / 2d12");
    expect(row("bloodied")).toBe("2d12");
  });
});
