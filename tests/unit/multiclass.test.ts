/**
 * #36 — 2024 multiclassing engine: the 13+ primary-ability prerequisite (both
 * ways, and/or modes), the eligible-new-class filter (RAW-illegal options are
 * FILTERED, never greyed), the partial "As a Multiclass Character" entry
 * grants, and the initial-vs-multiclass armor-training seam `featGateCtx`
 * reads. Facts verified against dnd2024.wikidot.com.
 */
import { describe, expect, it } from "vitest";
import {
  canMulticlassInto,
  classArmorTraining,
  eligibleNewClasses,
  meetsPrimaryAbility,
  multiclassEntryGrants,
  multiclassFilterReport,
  unmetPrimaryAbility,
} from "@/lib/multiclass";
import { featGateCtx } from "@/lib/feat-prereq";
import { getClassTable, classTables } from "@/data/classes";
import { ALL_SKILLS, grantSkillProficiency, proficientSkillIds } from "@/lib/skills";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { AbilityCode } from "@/data/types";
import type { CharacterData } from "@/types/character";

const scores = (over: Partial<Record<AbilityCode, number>>) => ({
  STR: 10,
  DEX: 10,
  CON: 10,
  INT: 10,
  WIS: 10,
  CHA: 10,
  ...over,
});

function charWith(
  classes: CharacterData["classes"],
  over: Partial<Record<AbilityCode, number>>
): CharacterData {
  return { ...MOCK_CHARACTER.character, classes, abilityScores: scores(over) };
}

describe("meetsPrimaryAbility (13+ rule, and/or modes)", () => {
  const table = (id: string) => {
    const t = getClassTable(id);
    if (!t) throw new Error(`no class table: ${id}`);
    return t;
  };
  it.each([
    // [classId, scores, expected]
    ["barbarian", { STR: 13 }, true],
    ["barbarian", { STR: 12 }, false],
    // Fighter "Strength OR Dexterity" — either side qualifies (mode: any).
    ["fighter", { DEX: 13 }, true],
    ["fighter", { STR: 13 }, true],
    ["fighter", { STR: 12, DEX: 12 }, false],
    // Monk "Dexterity AND Wisdom" — both required (default mode: all).
    ["monk", { DEX: 13, WIS: 13 }, true],
    ["monk", { DEX: 13, WIS: 12 }, false],
    ["paladin", { STR: 13, CHA: 13 }, true],
    ["paladin", { STR: 13, CHA: 12 }, false],
    ["ranger", { DEX: 13, WIS: 13 }, true],
    ["wizard", { INT: 13 }, true],
    ["wizard", { INT: 12 }, false],
  ] as const)("%s with %o → %s", (id, over, expected) => {
    expect(meetsPrimaryAbility(table(id), scores(over))).toBe(expected);
  });
});

describe("canMulticlassInto (both ways) + eligibleNewClasses (filtered)", () => {
  it("requires the prerequisite BOTH ways (current class too)", () => {
    // A STR-12 fighter cannot multiclass anywhere (fails its own prereq)…
    const weakFighter = charWith([{ classId: "fighter", level: 3 }], {
      STR: 12,
      DEX: 12,
      INT: 16,
    });
    expect(canMulticlassInto(weakFighter, "wizard")).toBe(false);
    expect(eligibleNewClasses(weakFighter)).toEqual([]);
    // …while a STR-13 fighter with INT 13 can take Wizard.
    const fighter = charWith([{ classId: "fighter", level: 3 }], {
      STR: 13,
      INT: 13,
    });
    expect(canMulticlassInto(fighter, "wizard")).toBe(true);
    expect(eligibleNewClasses(fighter)).toContain("wizard");
  });

  it("a class already owned is never a 'new' class", () => {
    const fighter = charWith([{ classId: "fighter", level: 3 }], { STR: 13 });
    expect(canMulticlassInto(fighter, "fighter")).toBe(false);
    expect(eligibleNewClasses(fighter)).not.toContain("fighter");
  });

  it("filters to RAW-legal classes only (no greying)", () => {
    const fighter = charWith([{ classId: "fighter", level: 3 }], {
      STR: 13,
      CHA: 13,
    });
    const legal = eligibleNewClasses(fighter);
    expect(legal).toEqual(expect.arrayContaining(["bard", "sorcerer", "warlock"]));
    expect(legal).not.toContain("wizard"); // INT 10
    expect(legal).not.toContain("monk"); // DEX/WIS 10
  });
});

describe("multiclassFilterReport (§2.7.3 — the filtered absence carries a cause)", () => {
  // The MC-CAUSE incident character: Coralino (live fixture shape) — Bard 3,
  // STR 8 / DEX 16 / CON 14 / INT 8 / WIS 10 / CHA 17. RAW-eligible for exactly
  // Fighter (DEX via "any"), Rogue, Sorcerer, Warlock; everything else filtered.
  const CORALINO_SCORES = { STR: 8, DEX: 16, CON: 14, INT: 8, WIS: 10, CHA: 17 };
  const coralino = charWith([{ classId: "bard", level: 3 }], CORALINO_SCORES);

  it("Coralino: exactly 4 classes offered, the rest filtered WITH their cause", () => {
    expect(eligibleNewClasses(coralino).sort()).toEqual([
      "fighter",
      "rogue",
      "sorcerer",
      "warlock",
    ]);
    const report = multiclassFilterReport(coralino);
    // Own class (Bard, CHA 17) passes — no own-side blocker.
    expect(report.ownUnmet).toEqual([]);
    // Every other class is filtered (all shipped classes − bard − 4 eligible).
    // Artificer is pack content — tolerated-absent in SRD-only mode; filtering
    // the expectation to the shipped classes keeps the pin EXACT in both
    // compositions (8 filtered in pack mode, 7 in SRD-only).
    expect(report.filtered.map((c) => c.classId).sort()).toEqual(
      [
        "artificer",
        "barbarian",
        "cleric",
        "druid",
        "monk",
        "paladin",
        "ranger",
        "wizard",
      ].filter((id) => classTables.some((t) => t.id === id))
    );
  });

  it.each(
    (
      [
        // [classId, mode, unmet abilities with the character's offending score]
        // (artificer is pack content — its row runs only when shipped)
        ["artificer", "all", [{ ability: "INT", needed: 13, has: 8 }]],
        ["barbarian", "all", [{ ability: "STR", needed: 13, has: 8 }]],
        ["cleric", "all", [{ ability: "WIS", needed: 13, has: 10 }]],
        ["druid", "all", [{ ability: "WIS", needed: 13, has: 10 }]],
        // AND-mode classes report ONLY the failing half (DEX 16 / CHA 17 are met
        // preconditions — never stated, §2.7.3).
        ["monk", "all", [{ ability: "WIS", needed: 13, has: 10 }]],
        ["paladin", "all", [{ ability: "STR", needed: 13, has: 8 }]],
        ["ranger", "all", [{ ability: "WIS", needed: 13, has: 10 }]],
        ["wizard", "all", [{ ability: "INT", needed: 13, has: 8 }]],
      ] as const
    ).filter(([classId]) => classTables.some((t) => t.id === classId))
  )("Coralino's %s cause: %s %o", (classId, mode, unmet) => {
    const cause = multiclassFilterReport(coralino).filtered.find(
      (c) => c.classId === classId
    );
    expect(cause).toEqual({ classId, mode, unmet });
  });

  it("an 'any'-mode class that fails BOTH ways lists every option (either would do)", () => {
    const low = charWith([{ classId: "wizard", level: 2 }], { INT: 16, STR: 9, DEX: 11 });
    const fighter = multiclassFilterReport(low).filtered.find(
      (c) => c.classId === "fighter"
    );
    expect(fighter).toEqual({
      classId: "fighter",
      mode: "any",
      unmet: [
        { ability: "STR", needed: 13, has: 9 },
        { ability: "DEX", needed: 13, has: 11 },
      ],
    });
  });

  it("an own-class blocker closes EVERYTHING and is reported once as ownUnmet", () => {
    // STR-12/DEX-12 Fighter: fails its own prereq both ways — every class is
    // filtered, including ones whose own floor is met (INT 16 Wizard).
    const weak = charWith([{ classId: "fighter", level: 3 }], {
      STR: 12,
      DEX: 12,
      INT: 16,
    });
    const report = multiclassFilterReport(weak);
    expect(report.ownUnmet).toEqual([
      {
        classId: "fighter",
        mode: "any",
        unmet: [
          { ability: "STR", needed: 13, has: 12 },
          { ability: "DEX", needed: 13, has: 12 },
        ],
      },
    ]);
    expect(report.filtered).toHaveLength(classTables.length - 1);
    // The Wizard's target-side floor IS met — its cause is the own blocker alone.
    expect(report.filtered.find((c) => c.classId === "wizard")?.unmet).toEqual([]);
  });

  it("a character qualifying for EVERY class reports nothing to explain (rule 19)", () => {
    const paragon = charWith([{ classId: "fighter", level: 3 }], {
      STR: 13,
      DEX: 13,
      CON: 13,
      INT: 13,
      WIS: 13,
      CHA: 13,
    });
    const report = multiclassFilterReport(paragon);
    expect(report.ownUnmet).toEqual([]);
    expect(report.filtered).toEqual([]);
  });

  it("invariant: filtered ∪ eligible = every non-owned class (nothing silently dropped)", () => {
    for (const c of [coralino, MOCK_CHARACTER.character]) {
      const eligible = eligibleNewClasses(c);
      const { filtered } = multiclassFilterReport(c);
      const ownedIds = new Set(c.classes.map((e) => e.classId));
      const union = [...eligible, ...filtered.map((f) => f.classId)].sort();
      expect(union).toEqual(
        classTables
          .map((t) => t.id)
          .filter((id) => !ownedIds.has(id))
          .sort()
      );
    }
  });

  it("unmetPrimaryAbility is exactly the complement of meetsPrimaryAbility", () => {
    for (const table of classTables) {
      for (const s of [scores({}), scores({ DEX: 16, CHA: 17 }), scores({ STR: 14 })]) {
        expect(unmetPrimaryAbility(table, s).length === 0).toBe(
          meetsPrimaryAbility(table, s)
        );
      }
    }
  });
});

describe("multiclassEntryGrants (the 'As a Multiclass Character' facts)", () => {
  it.each([
    [
      "barbarian",
      { weapons: ["martial-weapons"], armor: ["shields"], tools: [], skill: null },
    ],
    [
      "rogue",
      {
        weapons: [],
        armor: ["light-armor"],
        tools: ["thieves-tools"],
        skill: { count: 1, fromList: true },
      },
    ],
    [
      "bard",
      {
        weapons: [],
        armor: ["light-armor"],
        tools: ["musical-instrument"],
        skill: { count: 1, fromList: false },
      },
    ],
    [
      "fighter",
      {
        weapons: ["martial-weapons"],
        armor: ["light-armor", "medium-armor", "shields"],
        tools: [],
        skill: null,
      },
    ],
  ] as const)("%s", (id, expected) => {
    const grants = multiclassEntryGrants(id);
    expect(grants).not.toBeNull();
    expect(grants?.weaponProficiencies).toEqual(expected.weapons);
    expect(grants?.armorTraining).toEqual(expected.armor);
    expect(grants?.toolProficiencies).toEqual(expected.tools);
    if (expected.skill === null) {
      expect(grants?.skillChoice).toBeNull();
    } else {
      expect(grants?.skillChoice?.count).toBe(expected.skill.count);
      if (expected.skill.fromList) {
        expect(grants?.skillChoice?.options.length).toBeGreaterThan(0);
        expect(grants?.skillChoice?.options).toContain("stealth");
      } else {
        // "Any skill" (Bard) is a CONCRETE pool of all 18 ids — never an
        // empty sentinel a consumer must interpret (or mask with a fallback).
        expect(grants?.skillChoice?.options).toEqual(ALL_SKILLS.map((s) => s.id));
      }
    }
  });

  it("skillChoice options are NEVER empty and always canonical skill ids, for every class that declares one", () => {
    for (const table of classTables) {
      const choice = multiclassEntryGrants(table.id)?.skillChoice;
      if (!choice) continue;
      expect(choice.options.length).toBeGreaterThan(0);
      for (const id of choice.options) {
        expect(ALL_SKILLS.some((s) => s.id === id)).toBe(true);
      }
    }
  });

  it("Monk/Sorcerer/Wizard grant only their Hit Point Die (null)", () => {
    for (const id of ["monk", "sorcerer", "wizard"]) {
      expect(multiclassEntryGrants(id)).toBeNull();
    }
  });
});

describe("featGateCtx armor training honors the multiclass partial set", () => {
  it("a Wizard who multiclasses into Fighter is NOT heavy-armor trained", () => {
    const wizardFirst = charWith(
      [
        { classId: "wizard", level: 3 },
        { classId: "fighter", level: 1 },
      ],
      { INT: 16, STR: 13 }
    );
    const ctx = featGateCtx({ ...wizardFirst, features: [] }, 5);
    expect(ctx.armorTraining).toContain("medium-armor");
    expect(ctx.armorTraining).not.toContain("heavy-armor");
  });

  it("a Fighter-first character keeps the full table set", () => {
    const fighterFirst = charWith([{ classId: "fighter", level: 3 }], { STR: 13 });
    const ctx = featGateCtx({ ...fighterFirst, features: [] }, 4);
    expect(ctx.armorTraining).toContain("heavy-armor");
  });

  it("classArmorTraining: initial = full set, non-initial = partial", () => {
    expect(classArmorTraining("fighter", true)).toContain("heavy-armor");
    expect(classArmorTraining("fighter", false)).not.toContain("heavy-armor");
    expect(classArmorTraining("fighter", false)).toContain("shields");
  });
});

// ─── the skill-proficiency helpers behind the multiclass pick (JoAT seam) ─────

describe("proficientSkillIds / grantSkillProficiency", () => {
  // A rehydrated Jack-of-All-Trades map: an entry for EVERY skill, only some
  // of them real proficiencies — the exact shape that emptied the live
  // Bard→Ladro pool when filtered by key presence (owner 2026-06-11).
  const joat = {
    acrobatics: "proficient",
    stealth: "expertise",
    athletics: "halfProficiency",
    history: "halfProficiency",
  } as const;

  it("proficientSkillIds reads the proficiency STATE — JoAT half never counts as owned", () => {
    expect(proficientSkillIds(joat)).toEqual(new Set(["acrobatics", "stealth"]));
    expect(proficientSkillIds({})).toEqual(new Set());
  });

  it("grantSkillProficiency fills unset, upgrades half, never downgrades; identity on no-op", () => {
    expect(grantSkillProficiency(joat, "insight").insight).toBe("proficient");
    expect(grantSkillProficiency(joat, "athletics").athletics).toBe("proficient");
    // proficient/expertise stay untouched — and the SAME record comes back.
    expect(grantSkillProficiency(joat, "acrobatics")).toBe(joat);
    expect(grantSkillProficiency(joat, "stealth")).toBe(joat);
  });
});
