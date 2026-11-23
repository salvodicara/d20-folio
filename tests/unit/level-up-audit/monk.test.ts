// ─── Driver (identical in fighter/monk/paladin/ranger audit files) ───────────
// A level-1 character from the real creation build (the class quickbuild, its
// class picks filled), then 19 level-ups through the new level-up screen's seam:
// `levelUpAsks` rows answered with `toggleAnswer`, committed with
// `commitLevelUp(doc, asks.picks)` — exactly what LevelUpScreen saves.
import { describe, expect, it } from "vitest";
import {
  creationDraftReducer,
  creationFacts,
  initialCreationDraft,
} from "@/lib/creation/draft";
import { buildNewCharacter } from "@/lib/creation/build";
import { QUICKBUILD_PRESETS } from "@/data/quickbuild";
import {
  levelUpAsks,
  NO_ANSWERS,
  toggleAnswer,
  type AskRow,
  type LevelUpAnswers,
  type LevelUpAsks,
} from "@/domains/leveling/level-up-asks";
import { emptyAsiChoice } from "@/lib/level-up-choices";
import { commitLevelUp } from "@/lib/level-up-commit";
import { srdEn } from "@/i18n/srd-en";
import {
  attacksPerActionForCharacter,
  resolveActions,
  resolveTrackers,
} from "@/lib/smart-tracker";
import { sheetNumbers } from "@/lib/views/sheet-numbers";
import { buildSpellsViewModel } from "@/lib/views/spells-view";
import { freeCastSourcesForSpell } from "@/lib/views/spell-cast-sources";
import { resolveEffectiveSpells } from "@/lib/expanded-spells";
import type { AbilityCode } from "@/data/types";
import type { CharacterDoc } from "@/types/character";

/** The value, or a thrown error when it is missing (no non-null assertions). */
export function must<T>(v: T | null | undefined): T {
  if (v === null || v === undefined) throw new Error("missing value");
  return v;
}

const mod = (score: number) => Math.floor((score - 10) / 2);
const norm = (s: string) =>
  s.toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, " ").trim();

interface Prefs {
  subclass: string;
  /** Abilities to raise with +2, in order (never CON), each only while ≤ 18. */
  asiOrder: AbilityCode[];
  fightingStyles: string[];
  epicBoon: string;
  /** Preferred option ids for any other row, tried before the first options. */
  other?: string[];
}

interface LevelState {
  level: number;
  doc: CharacterDoc;
  /** The asks that produced this level (absent at level 1). */
  asks?: LevelUpAsks;
  /** The rows the screen shows before any answer. */
  firstRows?: AskRow[];
  error?: string;
}

function levelOne(classId: string, fightingStyle: string | null): CharacterDoc {
  const preset = QUICKBUILD_PRESETS[classId];
  if (!preset) throw new Error(`no quickbuild for ${classId}`);
  let d = creationDraftReducer(initialCreationDraft(), {
    type: "applyQuickbuild",
    classId,
    preset,
  });
  d = creationDraftReducer(d, { type: "setName", name: "Audit" });
  const facts = creationFacts(d);
  if (facts.classNeeds.fightingStyles && fightingStyle) {
    d = creationDraftReducer(d, {
      type: "setClassPick",
      kind: "fightingStyles",
      ids: [fightingStyle],
    });
  }
  if (facts.classNeeds.weaponMasteries) {
    d = creationDraftReducer(d, {
      type: "setClassPick",
      kind: "weaponMasteries",
      ids: facts.classOptions.weaponMasteries.slice(0, facts.classNeeds.weaponMasteries),
    });
  }
  const r = buildNewCharacter(d, { displayName: "Audit" });
  if (!r.ok) throw new Error(`creation failed: ${r.error}`);
  return {
    id: "audit",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    revision: 0,
    ...r.payload,
  };
}

/** Languages, Expertise skills and spells the character already has. */
export function heldIds(doc: CharacterDoc): Set<string> {
  const c = doc.character;
  const out = new Set<string>(c.languageIds);
  for (const [id, tier] of Object.entries(c.skills))
    if (tier === "expertise") out.add(id);
  for (const s of resolveEffectiveSpells(c, doc.session))
    if (!("custom" in s)) out.add(s.srdId);
  return out;
}

function answerRows(
  doc: CharacterDoc,
  classId: string,
  start: LevelUpAnswers,
  prefs: Prefs
): LevelUpAsks {
  let a = start;
  for (let pass = 0; pass < 10; pass++) {
    const asks = levelUpAsks(doc, classId, a, "en");
    const open = asks.rows.filter((r) => r.count > 0 && r.picked.length < r.count);
    if (open.length === 0) return asks;
    const row = must(open[0]);
    let wanted: string[];
    if (row.key === "subclass") wanted = [prefs.subclass];
    else if (row.key === "asiPlusTwo") {
      const s = doc.character.abilityScores;
      wanted = prefs.asiOrder.filter((ab) => s[ab] <= 18);
    } else if (row.key === "fightingStyle") wanted = prefs.fightingStyles;
    else if (row.key === "feat") wanted = [prefs.epicBoon];
    else if (row.key === "featAbility") wanted = prefs.asiOrder;
    else wanted = prefs.other ?? [];
    // Like a player would: skip an option the character already has (a known
    // language, a skill with Expertise, a spell it already has from another
    // source). The option lists themselves are checked in dedicated tests.
    const held = heldIds(doc);
    const ids = [
      ...wanted.filter((id) => row.options.some((o) => o.id === id)),
      ...row.options.map((o) => o.id).filter((id) => !held.has(id)),
      ...row.options.map((o) => o.id),
    ];
    let progressed = false;
    for (const id of ids) {
      const now = levelUpAsks(doc, classId, a, "en").rows.find((r) => r.key === row.key);
      if (!now || now.picked.length >= now.count) break;
      if (now.picked.includes(id)) continue;
      a = toggleAnswer(a, now, id);
      progressed = true;
    }
    if (!progressed) return levelUpAsks(doc, classId, a, "en");
  }
  return levelUpAsks(doc, classId, a, "en");
}

function climb(classId: string, prefs: Prefs): LevelState[] {
  let doc = levelOne(classId, prefs.fightingStyles[0] ?? null);
  const out: LevelState[] = [{ level: 1, doc }];
  for (let level = 2; level <= 20; level++) {
    const firstRows = levelUpAsks(doc, classId, NO_ANSWERS, "en").rows;
    let start = NO_ANSWERS;
    // The screen offers no way to pick the Epic Boon (see the level-19 test);
    // to keep climbing with a boon, answer as the classic wizard does (feat mode).
    if (!firstRows.some((r) => r.key === "asiMode" || r.key === "feat")) {
      const plan = levelUpAsks(doc, classId, NO_ANSWERS, "en").plan;
      if (plan.isEpicBoonGate)
        start = { ...NO_ANSWERS, asi: { ...emptyAsiChoice(), mode: "feat" } };
    }
    const asks = answerRows(doc, classId, start, prefs);
    try {
      doc = commitLevelUp(doc, asks.picks);
      out.push({ level, doc, asks, firstRows });
    } catch (e) {
      out.push({ level, doc, asks, firstRows, error: String(e) });
    }
  }
  return out;
}

/** The SRD-named features the character holds (class features, by English name). */
export function ownedFeatureNames(doc: CharacterDoc): Set<string> {
  const names = new Set<string>();
  for (const f of doc.character.features) {
    if ("custom" in f) continue;
    const n = srdEn("class-feature", f.srdId, "name");
    if (n) names.add(norm(n));
  }
  return names;
}

export function tracker(doc: CharacterDoc, id: string) {
  return resolveTrackers(doc).find((t) => t.id === id);
}

/** Row "kinds" a level asks (rows with a count > 0), with their counts. */
export function askKinds(rows: readonly AskRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (r.count === 0) continue;
    let k: string = r.key;
    if (
      k === "asiMode" ||
      k === "asiPlusTwo" ||
      k === "asiPlusOne" ||
      k === "feat" ||
      k === "featAbility"
    )
      k = "asi";
    else if (k.startsWith("slot:")) k = k.split(":").slice(0, 2).join(":");
    else if (k.startsWith("bundle:")) k = "bundle";
    out[k] = k === "asi" ? 1 : (out[k] ?? 0) + r.count;
  }
  return out;
}

export function unarmedDie(doc: CharacterDoc): string | undefined {
  const a = resolveActions(doc).find((x) => x.id === "unarmed-strike") as
    | { summary?: { damage?: string } }
    | undefined;
  return /^(\d*d\d+)/.exec(a?.summary?.damage ?? "")?.[1];
}

export function spellsSummary(doc: CharacterDoc, classId: string) {
  const vm = buildSpellsViewModel(doc, classId, "en", false);
  return {
    preparedMax: vm.castSummary?.preparedMax,
    preparedCount: vm.castSummary?.preparedCount,
    slots: [1, 2, 3, 4, 5].map(
      (lvl) => vm.slots.find((s) => s.level === lvl && !s.pactMagic)?.total ?? 0
    ),
  };
}
/** Slot-free casts of a spell the cast picker offers, with uses per rest. */
export function freeCastUses(doc: CharacterDoc, spellId: string): number {
  return freeCastSourcesForSpell(doc, spellId, "en", "Signature")
    .filter((s) => s.sourceId !== "signature")
    .reduce((n, s) => n + s.usesPerRest, 0);
}
// ─── End driver ──────────────────────────────────────────────────────────────

// ─── SRD 5.2.1 (srd.txt) — the Monk Features table, lines 3004–3028 ─────────
// Level → Proficiency Bonus, Martial Arts, Focus Points, Unarmored Movement (ft).
const TABLE: Record<number, { pb: number; die: string; focus: number; move: number }> = {
  1: { pb: 2, die: "1d6", focus: 0, move: 0 }, // "—" "—"
  2: { pb: 2, die: "1d6", focus: 2, move: 10 },
  3: { pb: 2, die: "1d6", focus: 3, move: 10 },
  4: { pb: 2, die: "1d6", focus: 4, move: 10 },
  5: { pb: 3, die: "1d8", focus: 5, move: 10 },
  6: { pb: 3, die: "1d8", focus: 6, move: 15 },
  7: { pb: 3, die: "1d8", focus: 7, move: 15 },
  8: { pb: 3, die: "1d8", focus: 8, move: 15 },
  9: { pb: 4, die: "1d8", focus: 9, move: 15 },
  10: { pb: 4, die: "1d8", focus: 10, move: 20 },
  11: { pb: 4, die: "1d10", focus: 11, move: 20 },
  12: { pb: 4, die: "1d10", focus: 12, move: 20 },
  13: { pb: 5, die: "1d10", focus: 13, move: 20 },
  14: { pb: 5, die: "1d10", focus: 14, move: 25 },
  15: { pb: 5, die: "1d10", focus: 15, move: 25 },
  16: { pb: 5, die: "1d10", focus: 16, move: 25 },
  17: { pb: 6, die: "1d12", focus: 17, move: 25 },
  18: { pb: 6, die: "1d12", focus: 18, move: 30 },
  19: { pb: 6, die: "1d12", focus: 19, move: 30 },
  20: { pb: 6, die: "1d12", focus: 20, move: 30 },
};
// Class features by name (table Class Features column; Warrior of the Open Hand
// text, lines 3112–3160). "Monk's Focus" also brings Flurry of Blows, Patient
// Defense and Step of the Wind (3034–3060).
const FEATURES: Record<number, string[]> = {
  1: ["Martial Arts", "Unarmored Defense"],
  2: [
    "Monk's Focus",
    "Unarmored Movement",
    "Uncanny Metabolism",
    "Flurry of Blows",
    "Patient Defense",
    "Step of the Wind",
  ],
  3: ["Deflect Attacks", "Open Hand Technique"],
  4: ["Slow Fall"],
  5: ["Extra Attack", "Stunning Strike"],
  6: ["Empowered Strikes", "Wholeness of Body"],
  7: ["Evasion"],
  9: ["Acrobatic Movement"],
  10: ["Heightened Focus", "Self-Restoration"],
  11: ["Fleet Step"],
  13: ["Deflect Energy"],
  14: ["Disciplined Survivor"],
  15: ["Perfect Focus"],
  17: ["Quivering Palm"],
  18: ["Superior Defense"],
  20: ["Body and Mind"],
};
// "Level 4: Ability Score Improvement … again at Monk levels 8, 12, and 16" (3104).
const ASI_LEVELS = [4, 8, 12, 16];

const CLASS = "monk";
const states = climb(CLASS, {
  subclass: "open-hand",
  asiOrder: ["DEX", "WIS", "STR"],
  fightingStyles: [],
  // "Boon of Irresistible Offense is recommended" (3155).
  epicBoon: "boon-of-irresistible-offense",
});
const l1 = must(states[0]).doc.character;
const conMod = mod(l1.abilityScores.CON);
const baseSpeed = sheetNumbers(must(states[0]).doc).speed.total; // species speed (wood elf)

describe("Monk level-up audit vs SRD 5.2.1", () => {
  it("every level-up commits without an error", () => {
    for (const s of states) expect.soft(s.error, `level ${s.level}`).toBeUndefined();
  });

  for (const s of states) {
    const L = s.level;
    const row = must(TABLE[L]);
    it(`level ${L}`, () => {
      const doc = s.doc;
      const sn = sheetNumbers(doc);
      const scores = doc.character.abilityScores;
      expect.soft(doc.character.classes[0]?.level, "class level").toBe(L);
      expect.soft(sn.proficiencyBonus.total, "proficiency bonus").toBe(row.pb);
      // "D8 per Monk level" (2956): level 1 = 8 + CON, then 5 + CON.
      expect.soft(sn.maxHp.total, "max HP").toBe(8 + conMod + (L - 1) * (5 + conMod));
      expect
        .soft(doc.character.hp.max, "stored max HP")
        .toBe(8 + conMod + (L - 1) * (5 + conMod));

      const owned = ownedFeatureNames(doc);
      for (const [lvl, names] of Object.entries(FEATURES)) {
        for (const n of names) {
          if (Number(lvl) <= L)
            expect.soft(owned.has(norm(n)), `has "${n}" (SRD level ${lvl})`).toBe(true);
          else
            expect.soft(owned.has(norm(n)), `"${n}" not before level ${lvl}`).toBe(false);
        }
      }

      // Martial Arts die: the Unarmed Strike damage the Play screen shows.
      expect.soft(unarmedDie(doc), "Martial Arts die (Unarmed Strike)").toBe(row.die);
      // Focus Points: none at level 1 ("—"), then the column.
      expect.soft(tracker(doc, "monk-focus")?.total ?? 0, "Focus Points").toBe(row.focus);
      // Unarmored Movement: speed bonus with no armor or Shield (the quickbuild wears none).
      expect
        .soft(sn.speed.total, "walking speed (species + Unarmored Movement)")
        .toBe(baseSpeed + row.move);
      // Uncanny Metabolism: once per Long Rest from level 2 (3071–3076).
      expect
        .soft(tracker(doc, "monk-uncanny-metabolism")?.total ?? 0, "Uncanny Metabolism")
        .toBe(L >= 2 ? 1 : 0);
      // Wholeness of Body: "a number of times equal to your Wisdom modifier (minimum of once)" (3132–3141).
      expect
        .soft(
          tracker(doc, "monk-open-hand-wholeness-of-body")?.total ?? 0,
          "Wholeness of Body uses"
        )
        .toBe(L >= 6 ? Math.max(1, mod(scores.WIS)) : 0);
      // Extra Attack at 5 (3066).
      expect
        .soft(attacksPerActionForCharacter(doc), "attacks per Attack action")
        .toBe(L >= 5 ? 2 : 1);
      // Saves: Strength and Dexterity (core traits); "proficiency in all saving throws" at 14 (3136–3138).
      for (const sv of sn.saves) {
        const prof = L >= 14 || sv.ability === "STR" || sv.ability === "DEX";
        expect
          .soft(sv.total, `${sv.ability} save`)
          .toBe(mod(sn.abilities[sv.ability].total) + (prof ? row.pb : 0));
      }

      if (L === 1) return;
      const kinds = askKinds(must(s.asks).rows);
      const expected: Record<string, number> = {};
      if (L === 3) expected.subclass = 1;
      if (ASI_LEVELS.includes(L) || L === 19) expected.asi = 1;
      expect.soft(kinds, "rows asked").toEqual(expected);
      expect.soft(must(s.asks).complete, "screen ends complete").toBe(true);
      expect.soft(must(s.asks).supported, "new screen supports the level").toBe(true);
    });
  }

  // Body and Mind: "Your Dexterity and Wisdom scores increase by 4, to a maximum of 25" (3157–3160).
  it("level 20 raises Dexterity and Wisdom by 4 (max 25)", () => {
    const before = must(states[18]).doc.character.abilityScores;
    const after = must(states[19]).doc.character.abilityScores;
    expect.soft(after.DEX, "DEX").toBe(Math.min(25, before.DEX + 4));
    expect.soft(after.WIS, "WIS").toBe(Math.min(25, before.WIS + 4));
  });

  // Level 19: "You gain an Epic Boon feat … or another feat" (3152–3155).
  it("level 19 lets the player choose an Epic Boon feat", () => {
    const rows = must(must(states[18]).firstRows);
    const featRow = rows.find((r) => r.key === "feat");
    const modeRow = rows.find((r) => r.key === "asiMode");
    const canPickFeat =
      (featRow?.options.some((o) => o.id === "boon-of-irresistible-offense") ?? false) ||
      (modeRow?.options.some((o) => o.id === "feat") ?? false);
    expect(canPickFeat, `rows: ${rows.map((r) => r.key).join(", ")}`).toBe(true);
  });
});
