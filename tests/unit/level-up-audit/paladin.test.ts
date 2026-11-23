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

// ─── SRD 5.2.1 (srd.txt) — the Paladin Features table, lines 3198–3221 ──────
// Level → Proficiency Bonus, Channel Divinity, Prepared Spells, slots L1–L5.
const TABLE: Record<
  number,
  { pb: number; cd: number; prepared: number; slots: number[] }
> = {
  1: { pb: 2, cd: 0, prepared: 2, slots: [2, 0, 0, 0, 0] },
  2: { pb: 2, cd: 0, prepared: 3, slots: [2, 0, 0, 0, 0] },
  3: { pb: 2, cd: 2, prepared: 4, slots: [3, 0, 0, 0, 0] },
  4: { pb: 2, cd: 2, prepared: 5, slots: [3, 0, 0, 0, 0] },
  5: { pb: 3, cd: 2, prepared: 6, slots: [4, 2, 0, 0, 0] },
  6: { pb: 3, cd: 2, prepared: 6, slots: [4, 2, 0, 0, 0] },
  7: { pb: 3, cd: 2, prepared: 7, slots: [4, 3, 0, 0, 0] },
  8: { pb: 3, cd: 2, prepared: 7, slots: [4, 3, 0, 0, 0] },
  9: { pb: 4, cd: 2, prepared: 9, slots: [4, 3, 2, 0, 0] },
  10: { pb: 4, cd: 2, prepared: 9, slots: [4, 3, 2, 0, 0] },
  11: { pb: 4, cd: 3, prepared: 10, slots: [4, 3, 3, 0, 0] },
  12: { pb: 4, cd: 3, prepared: 10, slots: [4, 3, 3, 0, 0] },
  13: { pb: 5, cd: 3, prepared: 11, slots: [4, 3, 3, 1, 0] },
  14: { pb: 5, cd: 3, prepared: 11, slots: [4, 3, 3, 1, 0] },
  15: { pb: 5, cd: 3, prepared: 12, slots: [4, 3, 3, 2, 0] },
  16: { pb: 5, cd: 3, prepared: 12, slots: [4, 3, 3, 2, 0] },
  17: { pb: 6, cd: 3, prepared: 14, slots: [4, 3, 3, 3, 1] },
  18: { pb: 6, cd: 3, prepared: 14, slots: [4, 3, 3, 3, 1] },
  19: { pb: 6, cd: 3, prepared: 15, slots: [4, 3, 3, 3, 2] },
  20: { pb: 6, cd: 3, prepared: 15, slots: [4, 3, 3, 3, 2] },
};
// Class features by name (table column; Oath of Devotion text 3346–3420).
const FEATURES: Record<number, string[]> = {
  1: ["Lay On Hands", "Spellcasting", "Weapon Mastery"],
  2: ["Fighting Style", "Paladin's Smite"],
  3: ["Channel Divinity", "Sacred Weapon"],
  5: ["Extra Attack", "Faithful Steed"],
  6: ["Aura of Protection"],
  7: ["Aura of Devotion"],
  9: ["Abjure Foes"],
  10: ["Aura of Courage"],
  11: ["Radiant Strikes"],
  14: ["Restoring Touch"],
  15: ["Smite of Protection"],
  18: ["Aura Expansion"],
  20: ["Holy Nimbus"],
};
// "Level 4: Ability Score Improvement … again at Paladin levels 8, 12, and 16" (3306–3309).
const ASI_LEVELS = [4, 8, 12, 16];
// Always prepared, not counted against Prepared Spells (3261–3264):
// Divine Smite from 2 (3245), Find Steed from 5 (3316–3318), Oath of Devotion
// Spells table (3365–3377).
const ALWAYS: Record<number, string[]> = {
  2: ["divine-smite"],
  3: ["protection-from-evil-and-good", "shield-of-faith"],
  5: ["find-steed", "aid", "zone-of-truth"],
  9: ["beacon-of-hope", "dispel-magic"],
  13: ["freedom-of-movement", "guardian-of-faith"],
  17: ["commune", "flame-strike"],
};

const CLASS = "paladin";
const states = climb(CLASS, {
  subclass: "oath-of-devotion",
  asiOrder: ["STR", "CHA", "WIS"],
  fightingStyles: ["defense", "great-weapon-fighting", "archery", "two-weapon-fighting"],
  // "Boon of Truesight is recommended" (3319–3321).
  epicBoon: "boon-of-truesight",
});
const l1 = must(states[0]).doc.character;
const conMod = mod(l1.abilityScores.CON);

describe("Paladin level-up audit vs SRD 5.2.1", () => {
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
      expect.soft(c.classes[0]?.level, "class level").toBe(L);
      expect.soft(sn.proficiencyBonus.total, "proficiency bonus").toBe(row.pb);
      // "D10 per Paladin level" (3174).
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

      // Lay On Hands: "a total number of Hit Points equal to five times your Paladin level" (3188–3193).
      expect
        .soft(tracker(doc, "paladin-lay-on-hands")?.total, "Lay On Hands pool")
        .toBe(5 * L);
      // Channel Divinity column.
      expect
        .soft(
          tracker(doc, "paladin-channel-divinity")?.total ?? 0,
          "Channel Divinity uses"
        )
        .toBe(row.cd);
      // Weapon Mastery: two kinds (3276–3279), never more.
      expect.soft(weaponMasteryCountForClass(CLASS, L), "Weapon Mastery count").toBe(2);
      expect.soft(c.classes[0]?.weaponMasteries?.length ?? 0, "masteries held").toBe(2);
      expect
        .soft(attacksPerActionForCharacter(doc), "attacks per Attack action")
        .toBe(L >= 5 ? 2 : 1);

      // Spells as the Spells tab shows them.
      const sp = spellsSummary(doc, CLASS);
      expect.soft(sp.slots, "spell slots L1–L5").toEqual(row.slots);
      expect.soft(sp.preparedMax, "Prepared Spells (limit)").toBe(row.prepared);
      expect
        .soft(sp.preparedCount, "Prepared Spells (count, always-prepared excluded)")
        .toBe(row.prepared);
      for (const [lvl, ids] of Object.entries(ALWAYS)) {
        if (Number(lvl) > L) continue;
        for (const id of ids) {
          const ref = c.spells.find((x) => !("custom" in x) && x.srdId === id) as
            | { alwaysPrepared?: boolean }
            | undefined;
          expect
            .soft(ref?.alwaysPrepared, `${id} always prepared (from level ${lvl})`)
            .toBe(true);
        }
      }
      // Paladin's Smite: Divine Smite once without a slot per Long Rest (3245–3248);
      // Faithful Steed: Find Steed once without a slot per Long Rest (3316–3320).
      expect
        .soft(freeCastUses(doc, "divine-smite"), "Divine Smite casts without a slot")
        .toBe(L >= 2 ? 1 : 0);
      expect
        .soft(freeCastUses(doc, "find-steed"), "Find Steed casts without a slot")
        .toBe(L >= 5 ? 1 : 0);
      // Aura of Protection: "a bonus to saving throws equal to your Charisma modifier (minimum bonus of +1)" (3323–3329).
      const aura = L >= 6 ? Math.max(1, mod(sn.abilities.CHA.total)) : 0;
      for (const sv of sn.saves) {
        const prof = sv.ability === "WIS" || sv.ability === "CHA";
        expect
          .soft(sv.total, `${sv.ability} save (incl. Aura of Protection)`)
          .toBe(mod(sn.abilities[sv.ability].total) + (prof ? row.pb : 0) + aura);
      }

      if (L === 1) return;
      const kinds = askKinds(must(s.asks).rows);
      const expected: Record<string, number> = {};
      if (L === 2) expected.fightingStyle = 1;
      if (L === 3) expected.subclass = 1;
      if (ASI_LEVELS.includes(L) || L === 19) expected.asi = 1;
      const gain = row.prepared - must(TABLE[L - 1]).prepared;
      if (gain > 0) expected.newSpells = gain;
      expect.soft(kinds, "rows asked").toEqual(expected);
      expect.soft(must(s.asks).complete, "screen ends complete").toBe(true);
      expect.soft(must(s.asks).supported, "new screen supports the level").toBe(true);
    });
  }

  // "Instead of choosing one of those feats, you can choose … Blessed Warrior" (3231–3240).
  it("level 2 Fighting Style offers Blessed Warrior", () => {
    const fs = must(must(states[1]).firstRows).find((r) => r.key === "fightingStyle");
    expect(fs?.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(["blessed-warrior"])
    );
  });

  // Faithful Steed: "You always have the Find Steed spell prepared" (3316–3318), and
  // such spells "don't count against the number of spells you can prepare" (3261–3264).
  // The level-5 spell row must not let a pick be spent on it (or on Aid / Zone of Truth,
  // the Oath of Devotion spells that level grants, 3365–3377).
  it("level 5 new-spell options leave out the spells level 5 makes always prepared", () => {
    const row = must(must(states[4]).firstRows).find((r) => r.key === "newSpells");
    const offered = row?.options.map((o) => o.id) ?? [];
    expect(
      offered.filter((id) => ["find-steed", "aid", "zone-of-truth"].includes(id))
    ).toEqual([]);
  });

  it("picking Find Steed at level 5 still leaves it always prepared and uncounted", () => {
    const at4 = must(states[3]).doc;
    let a: LevelUpAnswers = NO_ANSWERS;
    const row = levelUpAsks(at4, CLASS, a, "en").rows.find((r) => r.key === "newSpells");
    a = toggleAnswer(a, must(row), "find-steed");
    const asks = levelUpAsks(at4, CLASS, a, "en");
    const at5 = commitLevelUp(at4, asks.picks);
    const ref = at5.character.spells.find(
      (x) => !("custom" in x) && x.srdId === "find-steed"
    ) as { alwaysPrepared?: boolean } | undefined;
    expect.soft(ref?.alwaysPrepared, "Find Steed always prepared").toBe(true);
    expect
      .soft(spellsSummary(at5, CLASS).preparedCount, "prepared count")
      .toBe(spellsSummary(at4, CLASS).preparedCount);
  });

  // "The chosen spells must be of a level for which you have spell slots" (3257; slot
  // levels from the table): a spell of each new level is offered from the level
  // that first gives its slot, not before.
  it("new-spell options follow the spell-slot levels", () => {
    const offered = (L: number) =>
      must(must(states[L - 1]).firstRows)
        .find((r) => r.key === "newSpells")
        ?.options.map((o) => o.id) ?? [];
    expect
      .soft(offered(4), "lesser-restoration not offered at level 4")
      .not.toContain("lesser-restoration");
    expect
      .soft(offered(5), "lesser-restoration offered at level 5")
      .toContain("lesser-restoration");
    expect.soft(offered(7), "revivify not offered at level 7").not.toContain("revivify");
    expect.soft(offered(9), "revivify offered at level 9").toContain("revivify");
    expect
      .soft(offered(11), "banishment not offered at level 11")
      .not.toContain("banishment");
    expect.soft(offered(13), "banishment offered at level 13").toContain("banishment");
    expect
      .soft(offered(15), "raise-dead not offered at level 15")
      .not.toContain("raise-dead");
    expect.soft(offered(17), "raise-dead offered at level 17").toContain("raise-dead");
  });

  it("level 19 lets the player choose an Epic Boon feat", () => {
    const rows = must(must(states[18]).firstRows);
    const featRow = rows.find((r) => r.key === "feat");
    const modeRow = rows.find((r) => r.key === "asiMode");
    const canPickFeat =
      (featRow?.options.some((o) => o.id === "boon-of-truesight") ?? false) ||
      (modeRow?.options.some((o) => o.id === "feat") ?? false);
    expect(canPickFeat, `rows: ${rows.map((r) => r.key).join(", ")}`).toBe(true);
  });
});
