/**
 * LEVEL-UP AUDIT — Barbarian 1→20 against SRD 5.2.1 (srd.txt, "Barbarian Features"
 * table at lines 1755-1777 and the feature text at 1734-1901).
 *
 * The character is built by the real creation path (`buildNewCharacter`), then
 * levelled through the real level-up path: `levelUpAsks` (what the new level-up
 * screen asks) answered row by row, then `commitLevelUp` with the picks it returns.
 * Every expected value below is copied from the SRD text, never from src/data.
 * The sheet's own readers are used for what the player sees: `sheetNumbers` (PB,
 * max HP, speed), `resolveTrackers` (Rages), `resolveFeatureRiders` (Rage Damage).
 *
 * Choices: Path of the Berserker at 3 (the SRD subclass); each ASI is +2 Strength
 * (or Dexterity once Strength is 19+); average Hit Points.
 */
import { describe, expect, it } from "vitest";

import enClassFeatures from "@/i18n/en/srd/class-features.json";
import { classFeatureIndex, getFeaturesAtLevel } from "@/data/classes";
import { SRD_WEAPONS } from "@/data/weapons";
import {
  levelUpAsks,
  NO_ANSWERS,
  toggleAnswer,
  type LevelUpAnswers,
  type LevelUpAsks,
} from "@/domains/leveling/level-up-asks";
import { buildNewCharacter } from "@/lib/creation/build";
import {
  creationDraftReducer,
  creationFacts,
  initialCreationDraft,
  missingCreationRequirements,
  type CreationDraft,
  type CreationDraftAction,
} from "@/lib/creation/draft";
import { emptyAsiChoice } from "@/lib/level-up-choices";
import { commitLevelUp } from "@/lib/level-up-commit";
import { resolveFeatureRiders, resolveTrackers } from "@/lib/smart-tracker";
import { sheetNumbers } from "@/lib/views/sheet-numbers";
import type { CharacterDoc } from "@/types/character";

/** A value the walk must have produced; throws (failing the test) when it did not. */
function must<T>(v: T | null | undefined): T {
  if (v === null || v === undefined) throw new Error("audit walk: missing value");
  return v;
}

const CLASS = "barbarian";
const SUBCLASS = "berserker";
const DIE = 12;
const AVG = DIE / 2 + 1; // SRD 1431-1432: "Barbarian … 7 + Con. modifier"

// ── SRD 5.2.1 — Barbarian Features table (srd.txt 1755-1777) ─────────────────
// [level, PB, Rages, Rage Damage, Weapon Mastery]
const TABLE: ReadonlyArray<[number, number, number, number, number]> = [
  [1, 2, 2, 2, 2],
  [2, 2, 2, 2, 2],
  [3, 2, 3, 2, 2],
  [4, 2, 3, 2, 3],
  [5, 3, 3, 2, 3],
  [6, 3, 4, 2, 3],
  [7, 3, 4, 2, 3],
  [8, 3, 4, 2, 3],
  [9, 4, 4, 3, 3],
  [10, 4, 4, 3, 4],
  [11, 4, 4, 3, 4],
  [12, 4, 5, 3, 4],
  [13, 5, 5, 3, 4],
  [14, 5, 5, 3, 4],
  [15, 5, 5, 3, 4],
  [16, 5, 5, 4, 4],
  [17, 6, 6, 4, 4],
  [18, 6, 6, 4, 4],
  [19, 6, 6, 4, 4],
  [20, 6, 6, 4, 4],
];
const row = (level: number) => {
  const r = TABLE[level - 1];
  if (!r) throw new Error(`no SRD row ${level}`);
  return { pb: r[1], rages: r[2], rageDamage: r[3], weaponMastery: r[4] };
};

// "Class Features" column (srd 1758-1777) + Path of the Berserker (srd 1855-1897).
// ASI / Subclass / Epic Boon are choices and are checked through the asks below.
const FEATURES: Record<number, string[]> = {
  1: ["Rage", "Unarmored Defense", "Weapon Mastery"],
  2: ["Danger Sense", "Reckless Attack"],
  3: ["Primal Knowledge", "Frenzy"],
  5: ["Extra Attack", "Fast Movement"],
  6: ["Mindless Rage"],
  7: ["Feral Instinct", "Instinctive Pounce"],
  9: ["Brutal Strike"],
  10: ["Retaliation"],
  11: ["Relentless Rage"],
  13: ["Improved Brutal Strike"],
  14: ["Intimidating Presence"],
  15: ["Persistent Rage"],
  17: ["Improved Brutal Strike"], // srd 1889: "Level 17: Improved Brutal Strike"
  18: ["Indomitable Might"],
  20: ["Primal Champion"],
};
const ASI_LEVELS = [4, 8, 12, 16]; // srd 1806-1808: "again at Barbarian levels 8, 12, and 16"
const EPIC_BOON_LEVEL = 19; // srd 1899-1901
const SUBCLASS_LEVEL = 3; // srd 1785
// srd 1793-1796: Primal Knowledge — "another skill … from the skill list available to
// Barbarians at level 1"; that list is srd 1735-1737.
const BARBARIAN_SKILLS = [
  "animal-handling",
  "athletics",
  "intimidation",
  "nature",
  "perception",
  "survival",
];

// ── harness ──────────────────────────────────────────────────────────────────
const apply = (d: CreationDraft, ...a: CreationDraftAction[]) =>
  a.reduce(creationDraftReducer, d);

function levelOne(): CharacterDoc {
  const d = apply(
    initialCreationDraft(),
    { type: "setName", name: "Audit" },
    { type: "setAlignment", alignment: "neutral" },
    { type: "selectClass", classId: CLASS },
    { type: "selectRace", raceId: "halfling" },
    { type: "fillReadyMade" },
    // srd 1817-1820: two Simple or Martial MELEE weapons; the SRD names these two.
    { type: "setClassPick", kind: "weaponMasteries", ids: ["greataxe", "handaxe"] }
  );
  const missing = missingCreationRequirements(d, creationFacts(d));
  if (missing.length)
    throw new Error(`creation incomplete: ${missing.map((m) => m.key)}`);
  const built = buildNewCharacter(d, { displayName: null });
  if (!built.ok) throw new Error(built.error);
  return {
    id: "audit",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    revision: 0,
    ...built.payload,
  };
}

const MELEE_PREF = ["greatsword", "maul", "longsword", "battleaxe", "warhammer"];

/** Answer every row the level asks; returns the asks as the player saw them. */
function answer(doc: CharacterDoc): LevelUpAsks {
  let a: LevelUpAnswers = NO_ANSWERS;
  for (let pass = 0; pass < 10; pass++) {
    const asks = levelUpAsks(doc, CLASS, a, "en");
    let changed = false;
    for (const r of asks.rows) {
      if (r.count === 0 || r.picked.length >= r.count) continue;
      const ids = r.options.map((o) => o.id);
      const str = doc.character.abilityScores.STR;
      const want =
        r.key === "subclass"
          ? [SUBCLASS]
          : r.key === "asiPlusTwo"
            ? [str <= 18 && ids.includes("STR") ? "STR" : "DEX"]
            : r.key === "weaponMasteries"
              ? [...MELEE_PREF.filter((id) => ids.includes(id)), ...ids]
              : ids;
      for (const id of want) {
        const now = levelUpAsks(doc, CLASS, a, "en").rows.find((x) => x.key === r.key);
        if (!now || now.picked.length >= now.count) break;
        if (!now.picked.includes(id)) {
          a = toggleAnswer(a, now, id);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return levelUpAsks(doc, CLASS, a, "en");
}

interface Snap {
  level: number;
  asks: LevelUpAsks | null; // what reaching this level asked (null at level 1)
  before: CharacterDoc | null;
  doc: CharacterDoc;
}

const snaps: Snap[] = [];
{
  let doc = levelOne();
  snaps.push({ level: 1, asks: null, before: null, doc });
  for (let level = 2; level <= 20; level++) {
    const asks = answer(doc);
    const next = commitLevelUp(doc, asks.picks);
    snaps.push({ level, asks, before: doc, doc: next });
    doc = next;
  }
}
const snap = (level: number) => must(snaps[level - 1]);
const CON_AT_1 = snap(1).doc.character.abilityScores.CON;
const mod = (score: number) => Math.floor((score - 10) / 2);

/** Primal Champion (srd 1850-1852): CON +4, max 25, at 20. */
const expectedCon = (level: number) =>
  level >= 20 ? Math.min(25, CON_AT_1 + 4) : CON_AT_1;
/** SRD 1414-1420 (level 1 = max die) + 1426-1432 (fixed value) + 1457-1466 (CON retro). */
const expectedMaxHp = (level: number) =>
  DIE + (level - 1) * AVG + level * mod(expectedCon(level));

const publicName = (id: string): string | undefined =>
  (enClassFeatures as Record<string, { name?: string }>)[id]?.name;
const featureIds = (doc: CharacterDoc) =>
  doc.character.features.flatMap((f) => ("srdId" in f ? [f.srdId] : []));
const rowKeys = (asks: LevelUpAsks | null) => (asks ? asks.rows.map((r) => r.key) : []);

// ── per-level assertions ─────────────────────────────────────────────────────
describe("Barbarian level-up audit (SRD 5.2.1)", () => {
  it("level 1 build is complete (creation)", () => {
    expect(snap(1).doc.character.classes[0]).toMatchObject({ classId: CLASS, level: 1 });
  });

  it("creation: Weapon Mastery offers Melee weapons only (srd 1817-1820)", () => {
    const d = apply(
      initialCreationDraft(),
      { type: "selectClass", classId: CLASS },
      { type: "fillReadyMade" }
    );
    const ranged = creationFacts(d).classOptions.weaponMasteries.filter(
      (id) => SRD_WEAPONS.find((w) => w.id === id)?.weaponType === "ranged"
    );
    expect(ranged, "ranged weapons offered at creation").toEqual([]);
  });

  for (let level = 1; level <= 20; level++) {
    describe(`level ${level}`, () => {
      const s = snap(level);
      const srd = row(level);

      it("proficiency bonus (srd 1758-1777)", () => {
        expect(sheetNumbers(s.doc).proficiencyBonus.total).toBe(srd.pb);
      });

      it("max HP (srd 1414-1432, 1457-1466)", () => {
        expect(sheetNumbers(s.doc).maxHp.total).toBe(expectedMaxHp(level));
      });

      it("class and subclass features of this level are on the sheet", () => {
        const owned = featureIds(s.doc).filter(
          (id) =>
            classFeatureIndex.get(id)?.level === level &&
            classFeatureIndex.get(id)?.class === CLASS
        );
        const names = owned.map(publicName);
        for (const want of FEATURES[level] ?? [])
          expect.soft(names, want).toContain(want);
      });

      it("Rages column (srd 1744-1752, 1755-1777)", () => {
        const t = resolveTrackers(s.doc).find((x) => x.id === "barbarian-rage");
        expect.soft(t?.total).toBe(srd.rages);
        // srd 1748-1752: "regain one expended use when you finish a Short Rest, and …
        // all expended uses when you finish a Long Rest".
        expect.soft(t?.shortRestRecovery, "uses back on a Short Rest").toBe(1);
        expect.soft(t?.longRestRecovery, "a Long Rest refills all").toBeUndefined();
      });

      it("Rage Damage column (srd 1785-1789)", () => {
        const chip = resolveFeatureRiders("barbarian-rage", s.doc)[0];
        expect(chip?.value).toBe(`+${srd.rageDamage}`);
      });

      it("Weapon Mastery column (srd 1817-1827)", () => {
        expect(s.doc.character.classes[0]?.weaponMasteries?.length).toBe(
          srd.weaponMastery
        );
      });

      if (level === 1) return;
      const asks = must(s.asks);

      it("asks for the subclass at 3 only (srd 1785-1792)", () => {
        expect(rowKeys(asks).includes("subclass")).toBe(level === SUBCLASS_LEVEL);
        if (level >= SUBCLASS_LEVEL)
          expect(s.doc.character.classes[0]?.subclassId).toBe(SUBCLASS);
      });

      it("asks for an Ability Score Improvement or feat at 4/8/12/16 (srd 1806-1808)", () => {
        const asksAsi = rowKeys(asks).some(
          (k) => k === "asiMode" || k === "asiPlusTwo" || k === "feat"
        );
        expect(asksAsi).toBe(ASI_LEVELS.includes(level) || level === EPIC_BOON_LEVEL);
        if (ASI_LEVELS.includes(level)) {
          const mode = asks.rows.find((r) => r.key === "asiMode");
          expect(mode?.options.map((o) => o.id)).toEqual(
            expect.arrayContaining(["plus2", "plus1_1", "feat"])
          );
        }
      });

      it("Weapon Mastery: asks exactly the new weapons, Melee only (srd 1817-1827)", () => {
        const gain = srd.weaponMastery - row(level - 1).weaponMastery;
        const r = asks.rows.find((x) => x.key === "weaponMasteries");
        expect(r?.count ?? 0).toBe(gain);
        if (r) {
          const ranged = r.options
            .map((o) => o.id)
            .filter(
              (id) => SRD_WEAPONS.find((w) => w.id === id)?.weaponType === "ranged"
            );
          expect(ranged, "ranged weapons offered for a Melee-only mastery").toEqual([]);
        }
      });

      if (level === 3) {
        it("Primal Knowledge asks one skill from the Barbarian list (srd 1793-1796)", () => {
          const r = asks.rows.find((x) => x.key.startsWith("slot:skill"));
          expect(r?.count).toBe(1);
          for (const o of r?.options ?? []) expect.soft(BARBARIAN_SKILLS).toContain(o.id);
        });
      }

      if (level === 5) {
        it("Fast Movement: +10 ft speed without Heavy armor (srd 1818-1820)", () => {
          const before = sheetNumbers(must(s.before)).speed.total;
          expect(sheetNumbers(s.doc).speed.total).toBe(before + 10);
        });
      }

      if (level === 4) {
        it("control: Grappler is offered as a feat at an ordinary ASI level", () => {
          const featMode = levelUpAsks(
            must(s.before),
            CLASS,
            { ...NO_ANSWERS, asi: { ...emptyAsiChoice(), mode: "feat" } },
            "en"
          );
          const offered =
            featMode.rows.find((r) => r.key === "feat")?.options.map((o) => o.id) ?? [];
          expect(offered).toContain("grappler");
        });
      }

      if (level === EPIC_BOON_LEVEL) {
        it("asks for an Epic Boon feat (srd 1899-1901)", () => {
          // The screen must let the player take a feat here: a feat row, or a mode row
          // whose options include "feat".
          const canTakeFeat =
            rowKeys(asks).includes("feat") ||
            !!asks.rows
              .find((r) => r.key === "asiMode")
              ?.options.some((o) => o.id === "feat");
          expect(canTakeFeat, `rows: ${rowKeys(asks).join(", ")}`).toBe(true);
        });
        it("offers Epic Boons and 'another feat of your choice' (srd 1899-1901)", () => {
          const featMode = levelUpAsks(
            must(s.before),
            CLASS,
            { ...NO_ANSWERS, asi: { ...emptyAsiChoice(), mode: "feat" } },
            "en"
          );
          const offered =
            featMode.rows.find((r) => r.key === "feat")?.options.map((o) => o.id) ?? [];
          expect.soft(offered).toContain("boon-of-irresistible-offense");
          // A General feat qualifies: Grappler, "General Feat (Prerequisite: Level 4+, Strength or Dexterity 13+)" (srd 5255-5257); the ASI feat itself is the +2 / +1+1 row, not a list entry.
          expect.soft(offered).toContain("grappler");
        });
      }

      if (level === 20) {
        it("Primal Champion: STR and CON +4, max 25 (srd 1850-1852)", () => {
          const prev = must(s.before).character.abilityScores;
          const now = sheetNumbers(s.doc).abilities;
          expect(now.STR.total).toBe(Math.min(25, prev.STR + 4));
          expect(now.CON.total).toBe(Math.min(25, prev.CON + 4));
        });
      }

      it("the level's class features exist in the app data for this level", () => {
        // Cross-check that the table rows above map to data at the same level (not a
        // name copied from the app): a missing name here means the feature is absent.
        const atLevel = getFeaturesAtLevel(CLASS, level).map((f) => publicName(f.id));
        for (const want of FEATURES[level] ?? []) expect.soft(atLevel).toContain(want);
      });
    });
  }
});
