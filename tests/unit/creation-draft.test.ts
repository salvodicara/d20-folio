/**
 * The creation DRAFT core (`lib/creation/draft.ts` + `ability-bonus.ts`) — the
 * reducer transitions, the background ability bonus, the 20 cap and the
 * "what's missing" list, exercised without any UI. The wizard drives the same
 * functions (`quickbuild-path`, `creation-completeness` cover them through it).
 */
import { describe, expect, it } from "vitest";
import {
  activeCreationSteps,
  creationDraftReducer,
  creationFacts,
  creationStepBlocked,
  initialCreationDraft,
  missingCreationRequirements,
  type CreationDraft,
  type CreationDraftAction,
} from "@/lib/creation/draft";
import {
  abilityScoreBonusChoiceIsValid,
  effectiveAbilityScores,
  toggleAbilityScoreBonus,
} from "@/lib/creation/ability-bonus";
import { QUICKBUILD_PRESETS } from "@/data/quickbuild";
import { togglePick, toggleLockedPick } from "@/lib/creation/picks";

function apply(draft: CreationDraft, ...actions: CreationDraftAction[]): CreationDraft {
  return actions.reduce(creationDraftReducer, draft);
}

/** The opening draft: the default Fighter build (human soldier). */
const start = initialCreationDraft();

describe("the opening draft", () => {
  it("is the Fighter quickbuild with nothing but the name missing", () => {
    expect(start.classId).toBe("fighter");
    expect(start.name).toBe("");
    expect(missingCreationRequirements(start).map((r) => r.key)).toEqual(["name"]);
    expect(
      missingCreationRequirements(apply(start, { type: "setName", name: "Ada" }))
    ).toEqual([]);
  });

  it("is not sculpted until a build field changes (the name is not one)", () => {
    expect(creationFacts(start).sculpted).toBe(false);
    expect(creationFacts(apply(start, { type: "setName", name: "Ada" })).sculpted).toBe(
      false
    );
    expect(
      creationFacts(apply(start, { type: "toggleClassSkill", skillId: "perception" }))
        .sculpted
    ).toBe(true);
  });
});

describe("class and level changes reset what depends on them", () => {
  it("selecting a class clears subclass, class skills, cantrips and spells", () => {
    const seeded = apply(
      start,
      { type: "setSubclass", subclassId: "champion" },
      { type: "toggleClassSpell", list: "cantrips", spellId: "light", limit: 2 },
      { type: "toggleClassSpell", list: "spells", spellId: "bless", limit: 2 }
    );
    const next = apply(seeded, { type: "selectClass", classId: "wizard" });
    expect(next).toMatchObject({
      classId: "wizard",
      subclassId: "",
      classSkills: [],
      cantrips: [],
      spells: [],
    });
    // Everything else carries over.
    expect(next.raceId).toBe(start.raceId);
    expect(next.backgroundId).toBe(start.backgroundId);
    expect(next.bgAsiChoices).toEqual(start.bgAsiChoices);
  });

  it("a level change clamps to 1–20 and clears subclass + spells, keeping skills", () => {
    const seeded = apply(
      start,
      { type: "setSubclass", subclassId: "champion" },
      { type: "toggleClassSpell", list: "cantrips", spellId: "light", limit: 2 }
    );
    const high = apply(seeded, { type: "setLevel", level: 25 });
    expect(high.level).toBe(20);
    expect(high.subclassId).toBe("");
    expect(high.cantrips).toEqual([]);
    expect(high.classSkills).toEqual(start.classSkills);
    expect(apply(start, { type: "setLevel", level: 0 }).level).toBe(1);
  });

  it("a level that makes a subclass due adds the subclass requirement", () => {
    const l3 = apply(
      start,
      { type: "setName", name: "Ada" },
      { type: "setLevel", level: 3 }
    );
    const missing = missingCreationRequirements(l3);
    expect(missing).toContainEqual({ key: "subclass", met: false, step: "class" });
    expect(creationStepBlocked(l3).class).toBe(true);
  });

  it("a new species clears the human feat and lineage picks", () => {
    const next = apply(start, { type: "selectRace", raceId: "elf" });
    expect(next.humanFeat).toBe("");
    expect(next.lineageChoices).toEqual({});
    expect(missingCreationRequirements(next).map((r) => r.key)).toContain("lineage");
  });
});

describe("class skills", () => {
  it("toggles FIFO at the class count; background skills stay locked", () => {
    // Fighter picks 2; the Soldier grants Athletics + Intimidation.
    expect(start.classSkills).toEqual(["perception", "survival"]);
    const locked = apply(start, { type: "toggleClassSkill", skillId: "athletics" });
    expect(locked).toBe(start);
    const fifo = apply(start, { type: "toggleClassSkill", skillId: "insight" });
    expect(fifo.classSkills).toEqual(["survival", "insight"]);
    const removed = apply(start, { type: "toggleClassSkill", skillId: "perception" });
    expect(removed.classSkills).toEqual(["survival"]);
    expect(missingCreationRequirements(removed)).toContainEqual({
      key: "skills",
      met: false,
      step: "skills",
    });
  });

  it("the locked toggle and the bounded toggle are distinct rules", () => {
    expect(toggleLockedPick(["a", "b"], "c", 2, [])).toEqual(["b", "c"]);
    expect(toggleLockedPick(["a"], "z", 2, ["z"])).toEqual(["a"]);
    expect(togglePick(["a", "b", "c"], "d", 2)).toEqual(["c", "d"]);
  });
});

describe("the background ability score bonus", () => {
  it("+2/+1: first pick takes +2, the next +1, a third is ignored", () => {
    let c = toggleAbilityScoreBonus("+2/+1", {}, "STR");
    expect(c).toEqual({ STR: 2 });
    expect(abilityScoreBonusChoiceIsValid("+2/+1", c)).toBe(false);
    c = toggleAbilityScoreBonus("+2/+1", c, "CON");
    expect(c).toEqual({ STR: 2, CON: 1 });
    expect(abilityScoreBonusChoiceIsValid("+2/+1", c)).toBe(true);
    expect(toggleAbilityScoreBonus("+2/+1", c, "DEX")).toBe(c);
    // Removing the +2 frees it for the next pick.
    c = toggleAbilityScoreBonus("+2/+1", c, "STR");
    expect(toggleAbilityScoreBonus("+2/+1", c, "DEX")).toEqual({ CON: 1, DEX: 2 });
  });

  it("+1/+1/+1: up to three +1s, valid only at three", () => {
    let c = toggleAbilityScoreBonus("+1/+1/+1", {}, "STR");
    c = toggleAbilityScoreBonus("+1/+1/+1", c, "DEX");
    expect(abilityScoreBonusChoiceIsValid("+1/+1/+1", c)).toBe(false);
    c = toggleAbilityScoreBonus("+1/+1/+1", c, "CON");
    expect(c).toEqual({ STR: 1, DEX: 1, CON: 1 });
    expect(abilityScoreBonusChoiceIsValid("+1/+1/+1", c)).toBe(true);
    expect(toggleAbilityScoreBonus("+1/+1/+1", c, "WIS")).toBe(c);
    expect(abilityScoreBonusChoiceIsValid("+2/+1", c)).toBe(false);
  });

  it("switching the mode clears the choice and reopens the requirement", () => {
    const next = apply(start, { type: "switchAbilityBonusMode", mode: "+1/+1/+1" });
    expect(next.bgAsiMode).toBe("+1/+1/+1");
    expect(next.bgAsiChoices).toEqual({});
    expect(missingCreationRequirements(next)).toContainEqual({
      key: "bgAsi",
      met: false,
      step: "bg-asi",
    });
  });

  it("an increase lifts a score to 20 but never past it", () => {
    const base = { STR: 19, DEX: 18, CON: 10, INT: 8, WIS: 8, CHA: 8 };
    expect(effectiveAbilityScores(base, { STR: 2, DEX: 1 })).toEqual({
      ...base,
      STR: 20,
      DEX: 19,
    });
    const draft = apply(
      start,
      { type: "setUsePointBuy", usePointBuy: false },
      { type: "setAbilityScores", abilityScores: base }
    );
    // The Fighter build puts +2 on STR.
    expect(creationFacts(draft).effectiveScores.STR).toBe(20);
  });
});

describe("the background swap", () => {
  it("re-seeds an unsculpted build and clears a sculpted one", () => {
    const fresh = apply(start, { type: "selectBackground", backgroundId: "criminal" });
    // Criminal's trio is DEX/CON/INT: the Fighter's STR-first order lands CON then DEX.
    expect(fresh.bgAsiChoices).toEqual({ CON: 2, DEX: 1 });
    expect(fresh.classSkills).toHaveLength(2);

    const sculpted = apply(
      start,
      { type: "toggleClassSkill", skillId: "insight" },
      { type: "selectBackground", backgroundId: "criminal" }
    );
    expect(sculpted.classSkills).toEqual([]);
    expect(sculpted.bgAsiChoices).toEqual({});
  });
});

describe("the journey and the spell requirement", () => {
  it("a caster picked by hand owes its spells on the spells step", () => {
    const wizard = apply(
      start,
      { type: "setName", name: "Ada" },
      { type: "selectClass", classId: "wizard" }
    );
    const keys = missingCreationRequirements(wizard).map((r) => [r.key, r.step]);
    expect(keys).toContainEqual(["spells", "spells"]);
    expect(keys).toContainEqual(["skills", "skills"]);
    expect(activeCreationSteps(creationFacts(wizard))).toContain("spells");
  });

  it("a non-caster's journey has no spells step", () => {
    expect(activeCreationSteps(creationFacts(start))).not.toContain("spells");
  });

  it("every class's quickbuild satisfies the gate once named", () => {
    for (const [classId, preset] of Object.entries(QUICKBUILD_PRESETS)) {
      const draft = apply(
        start,
        { type: "applyQuickbuild", classId, preset },
        { type: "setName", name: "Ada" }
      );
      expect(missingCreationRequirements(draft), classId).toEqual([]);
    }
  });

  it("applying a quickbuild never touches the typed name", () => {
    const named = apply(start, { type: "setName", name: "Ada" });
    const preset = QUICKBUILD_PRESETS.wizard;
    if (!preset) throw new Error("wizard preset missing");
    const next = apply(named, { type: "applyQuickbuild", classId: "wizard", preset });
    expect(next.name).toBe("Ada");
    expect(creationFacts(next).sculpted).toBe(false);
  });
});
