/**
 * Search, Study and Influence as check entries (SRD 5.2.1 rules glossary):
 *  - "Search [Action]": "you make a Wisdom check to discern something that isn't
 *    obvious" — Insight, Medicine, Perception, Survival.
 *  - "Study [Action]": "you make an Intelligence check to study your memory, a book,
 *    a clue, or another source of knowledge" — Arcana, History, Investigation,
 *    Nature, Religion.
 *  - "Influence [Action]": an ability check to urge a monster — Deception,
 *    Intimidation, Performance, Persuasion (Charisma), Animal Handling (Wisdom).
 *  - "Ability Check": "If the total equals or exceeds the DC, the ability check
 *    succeeds"; the DC is the DM's (optional here: without one the total is logged).
 *
 * Cases come from the resolved base actions and the one skills catalogue. Blind
 * spot: which skill applies, and the DC, stay the table's call.
 */
import { describe, expect, it } from "vitest";
import { resolveActions } from "@/lib/smart-tracker";
import { localizeAction } from "@/lib/views/combat-action-view";
import { skillAbility } from "@/lib/compute";
import { ACTION_CHECK_SKILLS, checkSucceeded, withCheckResult } from "@/lib/play/checks";
import { localizeCombatEvent } from "@/lib/views/combat-log-view";
import type { CombatEvent } from "@/types/combat-log";
import type { LocText } from "@/lib/loc-text";
import { makeCharacterDoc } from "./_helpers";

const doc = makeCharacterDoc({ classes: [{ classId: "rogue", level: 3 }] });
const actions = new Map(
  resolveActions(doc, "spellbook").map((a) => [a.id, localizeAction(a, "en")])
);

describe("the SRD skills of each check action", () => {
  it("Search is a Wisdom check: Insight, Medicine, Perception, Survival", () => {
    expect(ACTION_CHECK_SKILLS["base-search"]).toEqual([
      "insight",
      "medicine",
      "perception",
      "survival",
    ]);
    expect(ACTION_CHECK_SKILLS["base-search"].map(skillAbility)).toEqual([
      "WIS",
      "WIS",
      "WIS",
      "WIS",
    ]);
  });

  it("Study is an Intelligence check: Arcana, History, Investigation, Nature, Religion", () => {
    expect(ACTION_CHECK_SKILLS["base-study"]).toEqual([
      "arcana",
      "history",
      "investigation",
      "nature",
      "religion",
    ]);
    expect(new Set(ACTION_CHECK_SKILLS["base-study"].map(skillAbility))).toEqual(
      new Set(["INT"])
    );
  });

  it("Influence is a Charisma check, or Wisdom (Animal Handling) for a Beast", () => {
    expect(ACTION_CHECK_SKILLS["base-influence"]).toEqual([
      "deception",
      "intimidation",
      "performance",
      "persuasion",
      "animal-handling",
    ]);
    expect(ACTION_CHECK_SKILLS["base-influence"].map(skillAbility)).toEqual([
      "CHA",
      "CHA",
      "CHA",
      "CHA",
      "WIS",
    ]);
  });

  it("each of the three base action cards offers exactly its skills", () => {
    for (const [id, skills] of Object.entries(ACTION_CHECK_SKILLS)) {
      expect(actions.get(id)?.summary.checkSkills).toEqual(skills);
    }
  });

  it("no other base action offers a check entry", () => {
    const offering = [...actions.values()]
      .filter((a) => a.summary.checkSkills)
      .map((a) => a.id)
      .sort();
    expect(offering).toEqual(Object.keys(ACTION_CHECK_SKILLS).sort());
  });
});

describe("judging the entered check", () => {
  it("a total that equals or exceeds the DC succeeds; one below fails", () => {
    expect(checkSucceeded({ skill: "perception", total: 15, dc: 15 })).toBe(true);
    expect(checkSucceeded({ skill: "perception", total: 16, dc: 15 })).toBe(true);
    expect(checkSucceeded({ skill: "perception", total: 14, dc: 15 })).toBe(false);
  });

  it("without a DC there is no verdict, only the total", () => {
    expect(checkSucceeded({ skill: "perception", total: 14 })).toBeUndefined();
  });

  it("the d20 face plus the live skill bonus is the total the action carries", () => {
    const search = actions.get("base-search");
    if (!search) throw new Error("no Search");
    const checked = withCheckResult(
      search,
      { skill: "survival", face: 12, bonus: 3 },
      15
    );
    expect(checked.checkResult).toEqual({ skill: "survival", total: 15, dc: 15 });
    expect(
      withCheckResult(search, { skill: "survival", face: 12, bonus: 3 }).checkResult
    ).toEqual({ skill: "survival", total: 15 });
  });
});

describe("the log line says the check", () => {
  const t = (key: string, args?: Record<string, string | number>): string =>
    args ? `${key} ${JSON.stringify(args)}` : key;
  const name = (r: LocText): string => ("lit" in r ? r.lit.en : "?");
  const localize = (event: CombatEvent): string =>
    localizeCombatEvent(event, t, String, String, String, name, name);
  const used = (check?: object): CombatEvent =>
    ({
      kind: "action-use",
      action: { lit: { en: "Search", it: "Ricerca" } },
      effect: "generic",
      slot: "action",
      ...(check ? { check } : {}),
    }) as CombatEvent;

  it("with a DC: skill, total, DC and the verdict", () => {
    const line = localize(used({ skill: "perception", total: 17, dc: 15 }));
    expect(line).toContain("combatLog.withCheckDc");
    expect(line).toContain('"skill":"skills.perception"');
    expect(line).toContain('"total":17');
    expect(line).toContain('"dc":15');
    expect(line).toContain('"verdict":"combatLog.checkSuccess"');
  });

  it("a miss reads as a failure", () => {
    expect(localize(used({ skill: "perception", total: 9, dc: 15 }))).toContain(
      '"verdict":"combatLog.checkFailure"'
    );
  });

  it("without a DC: skill and total only", () => {
    const line = localize(used({ skill: "arcana", total: 11 }));
    expect(line).toContain("combatLog.withCheck ");
    expect(line).not.toContain("verdict");
  });

  it("a use without a check keeps the plain line", () => {
    expect(localize(used())).toBe('combatLog.actionUse {"name":"Search"}');
  });
});
