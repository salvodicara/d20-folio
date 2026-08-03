import { describe, expect, it } from "vitest";
import { getSpellById } from "@/data/spells";
import { actionAtCastLevel } from "@/lib/cast-resolution";
import type { ResolvedAction } from "@/lib/smart-tracker";
import { srdText } from "@/lib/loc-text";

function action(spellId: string, summary: ResolvedAction["summary"]): ResolvedAction {
  const spell = getSpellById(spellId);
  if (!spell) throw new Error(`Missing fixture spell ${spellId}`);
  return {
    id: spellId,
    name: spellId,
    nameLoc: srdText("spell", spellId, "name"),
    type: "action",
    source: "spell",
    spellLevel: spell.level,
    spellId,
    concentration: false,
    costsSlot: spell.level > 0,
    pinned: false,
    defaultPinned: false,
    summary,
  };
}

describe("actionAtCastLevel", () => {
  it("updates healing dice while preserving the resolved casting modifier", () => {
    const base = action("healing-word", { healing: "2d4+5" });
    expect(actionAtCastLevel(base, getSpellById("healing-word"), 3).summary.healing).toBe(
      "6d4+5"
    );
  });

  it("updates a cast-level linked self-heal before target resolution", () => {
    const base = action("healing-word", {
      healing: "2d4+5",
      selfHealingOnOther: { amount: 3, perCastLevel: 1 },
    });
    expect(
      actionAtCastLevel(base, getSpellById("healing-word"), 3).summary.selfHealingOnOther
    ).toEqual({ amount: 5, perCastLevel: 1 });
  });

  it("updates Magic Missile's instance count without multiplying its per-dart die", () => {
    const base = action("magic-missile", { damage: "1d4+1", instances: 3 });
    const upcast = actionAtCastLevel(base, getSpellById("magic-missile"), 4);
    expect(upcast.summary.damage).toBe("1d4+1");
    expect(upcast.summary.instances).toBe(6);
  });

  it("updates both Scorching Ray's ray count and selected slot", () => {
    const base = action("scorching-ray", { damage: "2d6", instances: 3 });
    const upcast = actionAtCastLevel(base, getSpellById("scorching-ray"), 4);
    expect(upcast.summary.damage).toBe("2d6");
    expect(upcast.summary.instances).toBe(5);
    expect(upcast.slotLevel).toBe(4);
  });

  it("adds False Life's deterministic temporary-HP upcast bonus", () => {
    const base = action("false-life", {
      tempHpApply: { dice: "2d4", bonus: 4 },
    });
    expect(
      actionAtCastLevel(base, getSpellById("false-life"), 4).summary.tempHpApply
    ).toEqual({ dice: "2d4", bonus: 19 });
  });

  it("expands an upcast spell's structured target cap before target selection", () => {
    const base = action("invisibility", {
      conditionApplication: { options: ["invisible"], on: "automatic" },
      targeting: { affinity: "ally", maxTargets: 1, maxTargetsPerUpcast: 1 },
    });
    expect(
      actionAtCastLevel(base, getSpellById("invisibility"), 4).summary.targeting
    ).toMatchObject({ maxTargets: 3, maxTargetsPerUpcast: 1 });
  });
});
