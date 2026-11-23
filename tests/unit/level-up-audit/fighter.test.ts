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
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { weaponMasteryCountForClass } from "@/lib/weapon-mastery-pick";

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

// ─── SRD 5.2.1 (srd.txt) — the Fighter Features table, lines 2870–2892 ──────
// Level → Proficiency Bonus, Second Wind, Weapon Mastery (table row = line 2872 + level).
const TABLE: Record<number, { pb: number; secondWind: number; mastery: number }> = {
  1: { pb: 2, secondWind: 2, mastery: 3 },
  2: { pb: 2, secondWind: 2, mastery: 3 },
  3: { pb: 2, secondWind: 2, mastery: 3 },
  4: { pb: 2, secondWind: 3, mastery: 4 },
  5: { pb: 3, secondWind: 3, mastery: 4 },
  6: { pb: 3, secondWind: 3, mastery: 4 },
  7: { pb: 3, secondWind: 3, mastery: 4 },
  8: { pb: 3, secondWind: 3, mastery: 4 },
  9: { pb: 4, secondWind: 3, mastery: 4 },
  10: { pb: 4, secondWind: 4, mastery: 5 },
  11: { pb: 4, secondWind: 4, mastery: 5 },
  12: { pb: 4, secondWind: 4, mastery: 5 },
  13: { pb: 5, secondWind: 4, mastery: 5 },
  14: { pb: 5, secondWind: 4, mastery: 5 },
  15: { pb: 5, secondWind: 4, mastery: 5 },
  16: { pb: 5, secondWind: 4, mastery: 6 },
  17: { pb: 6, secondWind: 4, mastery: 6 },
  18: { pb: 6, secondWind: 4, mastery: 6 },
  19: { pb: 6, secondWind: 4, mastery: 6 },
  20: { pb: 6, secondWind: 4, mastery: 6 },
};
// Class features by name, from the table's Class Features column and the
// Champion subclass text (lines 2950–2993). Upgrades ("Two Extra Attacks",
// "Action Surge (two uses)", "Indomitable (two uses)") are checked as numbers below.
const FEATURES: Record<number, string[]> = {
  1: ["Fighting Style", "Second Wind", "Weapon Mastery"],
  2: ["Action Surge", "Tactical Mind"],
  3: ["Improved Critical", "Remarkable Athlete"],
  5: ["Extra Attack", "Tactical Shift"],
  7: ["Additional Fighting Style"],
  9: ["Indomitable", "Tactical Master"],
  10: ["Heroic Warrior"],
  13: ["Studied Attacks"],
  15: ["Superior Critical"],
  18: ["Survivor"],
};
// "Level 4: Ability Score Improvement … again at Fighter levels 6, 8, 12, 14, and 16" (2897–2900).
const ASI_LEVELS = [4, 6, 8, 12, 14, 16];
// Action Surge: one use; "Starting at level 17, you can use it twice" (2920–2925).
const actionSurge = (l: number) => (l >= 17 ? 2 : l >= 2 ? 1 : 0);
// Indomitable: once; "twice … starting at level 13 and three times … at level 17" (2910–2916).
const indomitable = (l: number) => (l >= 17 ? 3 : l >= 13 ? 2 : l >= 9 ? 1 : 0);
// Extra Attack 5 (2903), Two Extra Attacks 11 (2924), Three Extra Attacks 20 (2940).
const attacks = (l: number) => (l >= 20 ? 4 : l >= 11 ? 3 : l >= 5 ? 2 : 1);

const CLASS = "fighter";
const states = climb(CLASS, {
  subclass: "champion",
  asiOrder: ["STR", "DEX", "WIS"],
  // "Defense is recommended" (2864); Champion 7 takes a second, different one.
  fightingStyles: ["defense", "archery", "great-weapon-fighting", "two-weapon-fighting"],
  epicBoon: "boon-of-combat-prowess",
});
const l1 = must(states[0]).doc.character;
const conMod = mod(l1.abilityScores.CON);

describe("Fighter level-up audit vs SRD 5.2.1", () => {
  it("every level-up commits without an error", () => {
    for (const s of states) expect.soft(s.error, `level ${s.level}`).toBeUndefined();
  });

  for (const s of states) {
    const L = s.level;
    const row = must(TABLE[L]);
    it(`level ${L}`, () => {
      const doc = s.doc;
      const sn = sheetNumbers(doc);
      expect.soft(doc.character.classes[0]?.level, "class level").toBe(L);
      // Proficiency bonus (table column).
      expect.soft(sn.proficiencyBonus.total, "proficiency bonus").toBe(row.pb);
      // HP: level 1 = 10 + CON; each later level 6 + CON ("D10 per Fighter level", 2840).
      expect.soft(sn.maxHp.total, "max HP").toBe(10 + conMod + (L - 1) * (6 + conMod));
      expect
        .soft(doc.character.hp.max, "stored max HP")
        .toBe(10 + conMod + (L - 1) * (6 + conMod));

      // Features gained by this level are on the character; later ones are not.
      const owned = ownedFeatureNames(doc);
      for (const [lvl, names] of Object.entries(FEATURES)) {
        for (const n of names) {
          if (Number(lvl) <= L)
            expect.soft(owned.has(norm(n)), `has "${n}" (SRD level ${lvl})`).toBe(true);
          else
            expect.soft(owned.has(norm(n)), `"${n}" not before level ${lvl}`).toBe(false);
        }
      }

      // Numeric columns, as the sheet derives them.
      const sw = tracker(doc, "fighter-second-wind");
      expect.soft(sw?.total, "Second Wind uses").toBe(row.secondWind);
      expect.soft(sw?.die, "Second Wind die (1d10, lines 2897–2900)").toBe("d10");
      expect
        .soft(weaponMasteryCountForClass(CLASS, L), "Weapon Mastery count")
        .toBe(row.mastery);
      expect
        .soft(doc.character.classes[0]?.weaponMasteries?.length ?? 0, "masteries held")
        .toBe(row.mastery);
      expect
        .soft(tracker(doc, "fighter-action-surge")?.total ?? 0, "Action Surge uses")
        .toBe(actionSurge(L));
      expect
        .soft(tracker(doc, "fighter-indomitable")?.total ?? 0, "Indomitable uses")
        .toBe(indomitable(L));
      expect
        .soft(attacksPerActionForCharacter(doc), "attacks per Attack action")
        .toBe(attacks(L));
      // Champion: crit on 19–20 from 3 ("Improved Critical", 2961–2963), 18–20 from 15
      // ("Superior Critical", 2983–2985); Defy Death treats 18–20 as a 20 from 18 (2987–2991).
      const agg = aggregateCharacterGrants(doc.character, doc.session);
      expect
        .soft(agg.critThreshold, "weapon crit threshold")
        .toBe(L >= 15 ? 18 : L >= 3 ? 19 : 20);
      expect
        .soft(agg.deathSaveCritThreshold, "death-save 20 threshold")
        .toBe(L >= 18 ? 18 : 20);

      if (L === 1) return;
      // What the level asks (rows the player must answer, with counts).
      const kinds = askKinds(must(s.asks).rows);
      const expected: Record<string, number> = {};
      if (L === 3) expected.subclass = 1;
      if (ASI_LEVELS.includes(L) || L === 19) expected.asi = 1;
      if (L === 7) expected.fightingStyle = 1; // Champion: Additional Fighting Style
      const masteryGain = row.mastery - must(TABLE[L - 1]).mastery;
      if (masteryGain > 0) expected.weaponMasteries = masteryGain;
      expect.soft(kinds, "rows asked").toEqual(expected);
      expect.soft(must(s.asks).complete, "screen ends complete").toBe(true);
      expect.soft(must(s.asks).supported, "new screen supports the level").toBe(true);
    });
  }

  // Level 19: "You gain an Epic Boon feat … or another feat of your choice for
  // which you qualify" (2936–2938). The screen's first rows must let the player
  // pick an Epic Boon feat.
  it("level 19 lets the player choose an Epic Boon feat", () => {
    const rows = must(must(states[18]).firstRows);
    const featRow = rows.find((r) => r.key === "feat");
    const modeRow = rows.find((r) => r.key === "asiMode");
    const canPickFeat =
      (featRow?.options.some((o) => o.id === "boon-of-combat-prowess") ?? false) ||
      (modeRow?.options.some((o) => o.id === "feat") ?? false);
    expect(canPickFeat, `rows: ${rows.map((r) => r.key).join(", ")}`).toBe(true);
  });

  it("level 19 still offers other feats the character qualifies for", () => {
    const at18 = must(states[17]).doc;
    const asks = levelUpAsks(
      at18,
      CLASS,
      { ...NO_ANSWERS, asi: { ...emptyAsiChoice(), mode: "feat" } },
      "en"
    );
    const ids = asks.rows.find((r) => r.key === "feat")?.options.map((o) => o.id) ?? [];
    expect(ids, "a general feat the Fighter qualifies for (Grappler, STR 13+)").toEqual(
      expect.arrayContaining(["grappler"])
    );
  });

  // "Whenever you gain a Fighter level, you can replace the feat you chose with a
  // different Fighting Style feat" (2865–2867).
  it("a Fighter level-up offers to replace the Fighting Style feat", () => {
    for (const s of states.slice(1)) {
      const keys = must(s.firstRows).map((r) => r.key);
      expect
        .soft(keys.includes("fightingStyle"), `level ${s.level}: ${keys.join(", ")}`)
        .toBe(true);
    }
  });
});
