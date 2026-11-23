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

// ─── SRD 5.2.1 (srd.txt) — the Ranger Features table, lines 3469–3492 ───────
// Level → Proficiency Bonus, Favored Enemy, Prepared Spells, slots L1–L5.
const TABLE: Record<
  number,
  { pb: number; fe: number; prepared: number; slots: number[] }
> = {
  1: { pb: 2, fe: 2, prepared: 2, slots: [2, 0, 0, 0, 0] },
  2: { pb: 2, fe: 2, prepared: 3, slots: [2, 0, 0, 0, 0] },
  3: { pb: 2, fe: 2, prepared: 4, slots: [3, 0, 0, 0, 0] },
  4: { pb: 2, fe: 2, prepared: 5, slots: [3, 0, 0, 0, 0] },
  5: { pb: 3, fe: 3, prepared: 6, slots: [4, 2, 0, 0, 0] },
  6: { pb: 3, fe: 3, prepared: 6, slots: [4, 2, 0, 0, 0] },
  7: { pb: 3, fe: 3, prepared: 7, slots: [4, 3, 0, 0, 0] },
  8: { pb: 3, fe: 3, prepared: 7, slots: [4, 3, 0, 0, 0] },
  9: { pb: 4, fe: 4, prepared: 9, slots: [4, 3, 2, 0, 0] },
  10: { pb: 4, fe: 4, prepared: 9, slots: [4, 3, 2, 0, 0] },
  11: { pb: 4, fe: 4, prepared: 10, slots: [4, 3, 3, 0, 0] },
  12: { pb: 4, fe: 4, prepared: 10, slots: [4, 3, 3, 0, 0] },
  13: { pb: 5, fe: 5, prepared: 11, slots: [4, 3, 3, 1, 0] },
  14: { pb: 5, fe: 5, prepared: 11, slots: [4, 3, 3, 1, 0] },
  15: { pb: 5, fe: 5, prepared: 12, slots: [4, 3, 3, 2, 0] },
  16: { pb: 5, fe: 5, prepared: 12, slots: [4, 3, 3, 2, 0] },
  17: { pb: 6, fe: 6, prepared: 14, slots: [4, 3, 3, 3, 1] },
  18: { pb: 6, fe: 6, prepared: 14, slots: [4, 3, 3, 3, 1] },
  19: { pb: 6, fe: 6, prepared: 15, slots: [4, 3, 3, 3, 2] },
  20: { pb: 6, fe: 6, prepared: 15, slots: [4, 3, 3, 3, 2] },
};
// Class features by name (table column; Hunter text 3631–3690).
const FEATURES: Record<number, string[]> = {
  1: ["Spellcasting", "Favored Enemy", "Weapon Mastery"],
  2: ["Deft Explorer", "Fighting Style"],
  3: ["Hunter's Lore", "Hunter's Prey"],
  5: ["Extra Attack"],
  6: ["Roving"],
  7: ["Defensive Tactics"],
  9: ["Expertise"],
  10: ["Tireless"],
  11: ["Superior Hunter's Prey"],
  13: ["Relentless Hunter"],
  14: ["Nature's Veil"],
  15: ["Superior Hunter's Defense"],
  17: ["Precise Hunter"],
  18: ["Feral Senses"],
  20: ["Foe Slayer"],
};
// "Level 4: Ability Score Improvement … again at Ranger levels 8, 12, and 16" (3561–3566).
const ASI_LEVELS = [4, 8, 12, 16];

const CLASS = "ranger";
const states = climb(CLASS, {
  subclass: "hunter",
  asiOrder: ["DEX", "WIS", "STR"],
  fightingStyles: ["archery", "defense", "great-weapon-fighting", "two-weapon-fighting"],
  // "Boon of Dimensional Travel is recommended" (3563–3569).
  epicBoon: "boon-of-dimensional-travel",
  other: ["colossus-slayer", "escape-the-horde"],
});
const l1 = must(states[0]).doc.character;
const conMod = mod(l1.abilityScores.CON);
const baseSpeed = sheetNumbers(must(states[0]).doc).speed.total; // species (wood elf)

describe("Ranger level-up audit vs SRD 5.2.1", () => {
  it("every level-up commits without an error", () => {
    for (const s of states) expect.soft(s.error, `level ${s.level}`).toBeUndefined();
  });

  for (const s of states) {
    const L = s.level;
    const row = must(TABLE[L]);
    it(`level ${L}`, () => {
      const doc = s.doc;
      const sn = sheetNumbers(doc);
      const c = doc.character;
      const wis = mod(sn.abilities.WIS.total);
      expect.soft(c.classes[0]?.level, "class level").toBe(L);
      expect.soft(sn.proficiencyBonus.total, "proficiency bonus").toBe(row.pb);
      // "D10 per Ranger level" (3413).
      expect.soft(sn.maxHp.total, "max HP").toBe(10 + conMod + (L - 1) * (6 + conMod));
      expect
        .soft(doc.character.hp.max, "stored max HP")
        .toBe(10 + conMod + (L - 1) * (6 + conMod));

      const owned = ownedFeatureNames(doc);
      for (const [lvl, names] of Object.entries(FEATURES)) {
        for (const n of names) {
          if (Number(lvl) <= L)
            expect.soft(owned.has(norm(n)), `has "${n}" (SRD level ${lvl})`).toBe(true);
          else
            expect.soft(owned.has(norm(n)), `"${n}" not before level ${lvl}`).toBe(false);
        }
      }

      // Favored Enemy: Hunter's Mark without a slot, column count (3504–3512).
      expect
        .soft(tracker(doc, "ranger-favored-enemy")?.total, "Favored Enemy tracker")
        .toBe(row.fe);
      const hm = c.spells.find((x) => !("custom" in x) && x.srdId === "hunters-mark") as
        | { alwaysPrepared?: boolean }
        | undefined;
      expect.soft(hm?.alwaysPrepared, "Hunter's Mark always prepared").toBe(true);
      // Weapon Mastery: two kinds (3513–3521).
      expect.soft(weaponMasteryCountForClass(CLASS, L), "Weapon Mastery count").toBe(2);
      expect.soft(c.classes[0]?.weaponMasteries?.length ?? 0, "masteries held").toBe(2);
      expect
        .soft(attacksPerActionForCharacter(doc), "attacks per Attack action")
        .toBe(L >= 5 ? 2 : 1);

      const sp = spellsSummary(doc, CLASS);
      expect.soft(sp.slots, "spell slots L1–L5").toEqual(row.slots);
      expect.soft(sp.preparedMax, "Prepared Spells (limit)").toBe(row.prepared);
      expect
        .soft(sp.preparedCount, "Prepared Spells (count, always-prepared excluded)")
        .toBe(row.prepared);

      // Roving: "+10 feet while you aren't wearing Heavy armor … Climb Speed and a
      // Swim Speed equal to your Speed" (3576–3579). The quickbuild wears Studded Leather.
      const walk = baseSpeed + (L >= 6 ? 10 : 0);
      expect.soft(sn.speed.total, "walking speed").toBe(walk);
      expect
        .soft(sn.otherSpeeds.climb?.total ?? 0, "climb speed")
        .toBe(L >= 6 ? walk : 0);
      expect.soft(sn.otherSpeeds.swim?.total ?? 0, "swim speed").toBe(L >= 6 ? walk : 0);
      // Tireless: Temporary HP "a number of times equal to your Wisdom modifier (minimum of once)" (3526–3533).
      expect
        .soft(tracker(doc, "ranger-tireless")?.total ?? 0, "Tireless uses")
        .toBe(L >= 10 ? Math.max(1, wis) : 0);
      // Nature's Veil: "a number of times equal to your Wisdom modifier (minimum of once)" (3545–3551).
      expect
        .soft(tracker(doc, "ranger-natures-veil")?.total ?? 0, "Nature's Veil uses")
        .toBe(L >= 14 ? Math.max(1, wis) : 0);
      // Expertise: one skill at 2 (Deft Explorer, 3528–3532), two more at 9 (3521–3524).
      const expertise = Object.values(c.skills).filter((t) => t === "expertise").length;
      expect.soft(expertise, "skills with Expertise").toBe(L >= 9 ? 3 : L >= 2 ? 1 : 0);
      // Deft Explorer: two languages (3534–3535) on top of the level-1 languages.
      expect
        .soft(c.languageIds.length, "languages")
        .toBe(must(states[0]).doc.character.languageIds.length + (L >= 2 ? 2 : 0));

      if (L === 1) return;
      const kinds = askKinds(must(s.asks).rows);
      const expected: Record<string, number> = {};
      if (L === 2) {
        expected.fightingStyle = 1;
        expected["slot:expertise"] = 1;
        expected["slot:language"] = 2;
      }
      if (L === 3) {
        expected.subclass = 1;
        expected.bundle = 1; // Hunter's Prey option
      }
      if (L === 7) expected.bundle = 1; // Defensive Tactics option
      if (L === 9) expected["slot:expertise"] = 2;
      if (ASI_LEVELS.includes(L) || L === 19) expected.asi = 1;
      const gain = row.prepared - must(TABLE[L - 1]).prepared;
      if (gain > 0) expected.newSpells = gain;
      expect.soft(kinds, "rows asked").toEqual(expected);
      expect.soft(must(s.asks).complete, "screen ends complete").toBe(true);
      expect.soft(must(s.asks).supported, "new screen supports the level").toBe(true);
    });
  }

  // Deft Explorer: "You know two languages of your choice" (3534–3535): a language
  // the character already knows adds nothing.
  it("level 2 language options leave out languages already known", () => {
    const known = must(states[0]).doc.character.languageIds;
    const row = must(must(states[1]).firstRows).find((r) =>
      r.key.startsWith("slot:language")
    );
    const offered = row?.options.map((o) => o.id) ?? [];
    expect(
      offered.filter((id) => known.includes(id)),
      `known: ${known.join(", ")}`
    ).toEqual([]);
  });

  // Expertise: "Choose two of your skill proficiencies with which you lack Expertise" (3521–3523).
  it("level 9 Expertise options leave out skills that already have Expertise", () => {
    const at8 = must(states[7]).doc.character.skills;
    const already = Object.entries(at8)
      .filter(([, t]) => t === "expertise")
      .map(([id]) => id);
    const row = must(must(states[8]).firstRows).find((r) =>
      r.key.startsWith("slot:expertise")
    );
    const offered = row?.options.map((o) => o.id) ?? [];
    expect(
      offered.filter((id) => already.includes(id)),
      `already: ${already.join(", ")}`
    ).toEqual([]);
  });

  // Favored Enemy: "You can cast it twice without expending a spell slot" (3505–3507):
  // casting Hunter's Mark should offer the slot-free use.
  it("casting Hunter's Mark offers the Favored Enemy slot-free casts", () => {
    expect(freeCastUses(must(states[0]).doc, "hunters-mark")).toBe(2);
  });

  // "Instead of choosing one of those feats, you can choose … Druidic Warrior" (3538–3543).
  it("level 2 Fighting Style offers Druidic Warrior", () => {
    const fs = must(must(states[1]).firstRows).find((r) => r.key === "fightingStyle");
    expect(fs?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["druidic-warrior"])
    );
  });

  // "The chosen spells must be of a level for which you have spell slots" (3505; slot
  // levels from the table): a spell of each new level is offered from the level
  // that first gives its slot, not before.
  it("new-spell options follow the spell-slot levels", () => {
    const offered = (L: number) =>
      must(must(states[L - 1]).firstRows)
        .find((r) => r.key === "newSpells")
        ?.options.map((o) => o.id) ?? [];
    expect.soft(offered(4), "barkskin not offered at level 4").not.toContain("barkskin");
    expect.soft(offered(5), "barkskin offered at level 5").toContain("barkskin");
    expect
      .soft(offered(7), "conjure-animals not offered at level 7")
      .not.toContain("conjure-animals");
    expect
      .soft(offered(9), "conjure-animals offered at level 9")
      .toContain("conjure-animals");
    expect
      .soft(offered(11), "stoneskin not offered at level 11")
      .not.toContain("stoneskin");
    expect.soft(offered(13), "stoneskin offered at level 13").toContain("stoneskin");
    expect
      .soft(offered(15), "tree-stride not offered at level 15")
      .not.toContain("tree-stride");
    expect.soft(offered(17), "tree-stride offered at level 17").toContain("tree-stride");
  });

  it("level 19 lets the player choose an Epic Boon feat", () => {
    const rows = must(must(states[18]).firstRows);
    const featRow = rows.find((r) => r.key === "feat");
    const modeRow = rows.find((r) => r.key === "asiMode");
    const canPickFeat =
      (featRow?.options.some((o) => o.id === "boon-of-dimensional-travel") ?? false) ||
      (modeRow?.options.some((o) => o.id === "feat") ?? false);
    expect(canPickFeat, `rows: ${rows.map((r) => r.key).join(", ")}`).toBe(true);
  });
});
