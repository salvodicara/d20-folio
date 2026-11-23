/**
 * LEVEL-UP AUDIT — Bard 1→20 against SRD 5.2.1 (srd.txt, "Bard Features" table at
 * lines 1940-1963, feature text 1923-2056, College of Lore 2148-2195).
 *
 * The character is built by the real creation path (`buildNewCharacter`), then
 * levelled through the real level-up path: `levelUpAsks` (what the new level-up
 * screen asks) answered row by row, then `commitLevelUp` with the picks it returns.
 * Every expected value below is copied from the SRD text, never from src/data.
 * Readers are the sheet's own: `sheetNumbers` (PB, max HP, skills), the Spells tab
 * view-model `buildSpellsViewModel` (prepared cap, slots), `resolveEffectiveSpells`
 * (the list the Spells tab draws), `resolveTrackers` (Bardic Inspiration).
 *
 * Choices: College of Lore at 3; each ASI is +2 Charisma; average Hit Points.
 */
import { describe, expect, it } from "vitest";

import enClassFeatures from "@/i18n/en/srd/class-features.json";
import { classFeatureIndex } from "@/data/classes";
import { getSpellById } from "@/data/spells";
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
import { resolveEffectiveSpells } from "@/lib/expanded-spells";
import { emptyAsiChoice } from "@/lib/level-up-choices";
import { commitLevelUp } from "@/lib/level-up-commit";
import { resolveTrackers } from "@/lib/smart-tracker";
import { sheetNumbers } from "@/lib/views/sheet-numbers";
import { buildSpellsViewModel } from "@/lib/views/spells-view";
import type { CharacterDoc } from "@/types/character";

/** A value the walk must have produced; throws (failing the test) when it did not. */
function must<T>(v: T | null | undefined): T {
  if (v === null || v === undefined) throw new Error("audit walk: missing value");
  return v;
}

const CLASS = "bard";
const SUBCLASS = "college-of-lore";
const DIE = 8;
const AVG = DIE / 2 + 1; // SRD 1431-1434: "Bard, Cleric, Druid … 5 + Con. modifier"

// ── SRD 5.2.1 — Bard Features table (srd.txt 1940-1963) ──────────────────────
// [level, PB, Bardic Die, Cantrips, Prepared Spells, slots 1..9]
type Row = [number, number, string, number, number, number[]];
const TABLE: ReadonlyArray<Row> = [
  [1, 2, "d6", 2, 4, [2]],
  [2, 2, "d6", 2, 5, [3]],
  [3, 2, "d6", 2, 6, [4, 2]],
  [4, 2, "d6", 3, 7, [4, 3]],
  [5, 3, "d8", 3, 9, [4, 3, 2]],
  [6, 3, "d8", 3, 10, [4, 3, 3]],
  [7, 3, "d8", 3, 11, [4, 3, 3, 1]],
  [8, 3, "d8", 3, 12, [4, 3, 3, 2]],
  [9, 4, "d8", 3, 14, [4, 3, 3, 3, 1]],
  [10, 4, "d10", 4, 15, [4, 3, 3, 3, 2]],
  [11, 4, "d10", 4, 16, [4, 3, 3, 3, 2, 1]],
  [12, 4, "d10", 4, 16, [4, 3, 3, 3, 2, 1]],
  [13, 5, "d10", 4, 17, [4, 3, 3, 3, 2, 1, 1]],
  [14, 5, "d10", 4, 17, [4, 3, 3, 3, 2, 1, 1]],
  [15, 5, "d12", 4, 18, [4, 3, 3, 3, 2, 1, 1, 1]],
  [16, 5, "d12", 4, 18, [4, 3, 3, 3, 2, 1, 1, 1]],
  [17, 6, "d12", 4, 19, [4, 3, 3, 3, 2, 1, 1, 1, 1]],
  [18, 6, "d12", 4, 20, [4, 3, 3, 3, 3, 1, 1, 1, 1]],
  [19, 6, "d12", 4, 21, [4, 3, 3, 3, 3, 2, 1, 1, 1]],
  [20, 6, "d12", 4, 22, [4, 3, 3, 3, 3, 2, 2, 1, 1]],
];
const row = (level: number) => {
  const r = TABLE[level - 1];
  if (!r) throw new Error(`no SRD row ${level}`);
  return { pb: r[1], die: r[2], cantrips: r[3], prepared: r[4], slots: r[5] };
};

// "Class Features" column (srd 1943-1963) + College of Lore (srd 2148-2195).
// ASI / Subclass / Epic Boon / the level-9 Expertise are choices, checked as asks.
const FEATURES: Record<number, string[]> = {
  1: ["Bardic Inspiration", "Spellcasting"],
  2: ["Expertise", "Jack of All Trades"],
  3: ["Bonus Proficiencies", "Cutting Words"],
  5: ["Font of Inspiration"],
  6: ["Magical Discoveries"],
  7: ["Countercharm"],
  10: ["Magical Secrets"],
  14: ["Peerless Skill"],
  18: ["Superior Inspiration"],
  20: ["Words of Creation"],
};
const ASI_LEVELS = [4, 8, 12, 16]; // srd 2009-2012
const EPIC_BOON_LEVEL = 19; // srd 2052-2054
const SUBCLASS_LEVEL = 3; // srd 2001-2007
const EXPERTISE_LEVELS = [2, 9]; // srd 1985-1991: two at 2, "two more" at Bard level 9
// Spells on the Cleric / Wizard lists but not the Bard list (srd 2033-2140 Bard list).
const CLERIC_ONLY_L1 = "guiding-bolt";
const WIZARD_ONLY_L3 = "fireball";

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
    { type: "fillReadyMade" }
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

const spellLevel = (id: string) => getSpellById(id)?.level ?? -1;

function answer(doc: CharacterDoc): LevelUpAsks {
  let a: LevelUpAnswers = NO_ANSWERS;
  for (let pass = 0; pass < 10; pass++) {
    const asks = levelUpAsks(doc, CLASS, a, "en");
    let changed = false;
    for (const r of asks.rows) {
      if (r.count === 0 || r.picked.length >= r.count) continue;
      const ids = r.options.map((o) => o.id);
      const cha = doc.character.abilityScores.CHA;
      const want =
        r.key === "subclass"
          ? [SUBCLASS]
          : r.key === "asiPlusTwo"
            ? [cha <= 18 && ids.includes("CHA") ? "CHA" : "DEX"]
            : r.key.startsWith("slot:spell")
              ? // Magical Discoveries: take levelled spells, so the cantrip count stays the class's own.
                [...ids].sort((x, y) => spellLevel(y) - spellLevel(x))
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
  asks: LevelUpAsks | null;
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
const expectedMaxHp = (level: number) => DIE + (level - 1) * AVG + level * mod(CON_AT_1);

const publicName = (id: string): string | undefined =>
  (enClassFeatures as Record<string, { name?: string }>)[id]?.name;
const featureIds = (doc: CharacterDoc) =>
  doc.character.features.flatMap((f) => ("srdId" in f ? [f.srdId] : []));
const rowKeys = (asks: LevelUpAsks | null) => (asks ? asks.rows.map((r) => r.key) : []);
const effective = (doc: CharacterDoc) =>
  resolveEffectiveSpells(doc.character, doc.session).flatMap((s) =>
    "srdId" in s ? [s] : []
  );
const ownCantrips = (doc: CharacterDoc) =>
  effective(doc).filter((s) => spellLevel(s.srdId) === 0 && s.alwaysPrepared !== true);
const slotTotals = (doc: CharacterDoc) => {
  const vm = buildSpellsViewModel(doc, CLASS, "en", false);
  const out: number[] = [];
  for (const sl of vm.slots) if (!sl.pactMagic) out[sl.level - 1] = sl.total;
  return Array.from({ length: out.length }, (_, i) => out[i] ?? 0);
};

describe("Bard level-up audit (SRD 5.2.1)", () => {
  it("level 1 build is complete (creation)", () => {
    expect(snap(1).doc.character.classes[0]).toMatchObject({ classId: CLASS, level: 1 });
  });

  for (let level = 1; level <= 20; level++) {
    describe(`level ${level}`, () => {
      const s = snap(level);
      const srd = row(level);

      it("proficiency bonus (srd 1943-1963)", () => {
        expect(sheetNumbers(s.doc).proficiencyBonus.total).toBe(srd.pb);
      });

      it("max HP (srd 1414-1434)", () => {
        expect(sheetNumbers(s.doc).maxHp.total).toBe(expectedMaxHp(level));
      });

      it("class and subclass features of this level are on the sheet", () => {
        const names = featureIds(s.doc)
          .filter(
            (id) =>
              classFeatureIndex.get(id)?.level === level &&
              classFeatureIndex.get(id)?.class === CLASS
          )
          .map(publicName);
        for (const want of FEATURES[level] ?? [])
          expect.soft(names, want).toContain(want);
      });

      it("Bardic Die column and uses = CHA modifier, min 1 (srd 1931-1983)", () => {
        const t = resolveTrackers(s.doc).find((x) => x.id === "bard-bardic-inspiration");
        expect.soft(t?.die).toBe(srd.die);
        const cha = sheetNumbers(s.doc).abilities.CHA.total;
        expect.soft(t?.total).toBe(Math.max(1, mod(cha)));
        // srd 2013-2015 (Font of Inspiration, level 5): regain on a Short or Long Rest.
        if (level >= 5)
          expect.soft(["short-rest", "short-or-long-rest"]).toContain(t?.recovery);
        else expect.soft(t?.recovery).toBe("long-rest");
      });

      it("Spell Slots columns (srd 1943-1963)", () => {
        expect(slotTotals(s.doc)).toEqual(srd.slots);
      });

      it("Prepared Spells column: the sheet's cap (srd 1943-1963, 2005-2016)", () => {
        const vm = buildSpellsViewModel(s.doc, CLASS, "en", false);
        expect(vm.castSummary?.preparedMax).toBe(srd.prepared);
      });

      it("Cantrips column: the Bard cantrips on the sheet (srd 1943-1963, 1991-2000)", () => {
        expect(ownCantrips(s.doc).length).toBe(srd.cantrips);
      });

      if (level === 1) return;
      const asks = must(s.asks);
      const prev = row(level - 1);

      it("asks for the subclass at 3 only (srd 2001-2007)", () => {
        expect(rowKeys(asks).includes("subclass")).toBe(level === SUBCLASS_LEVEL);
        if (level >= SUBCLASS_LEVEL)
          expect(s.doc.character.classes[0]?.subclassId).toBe(SUBCLASS);
      });

      it("asks for an Ability Score Improvement or feat at 4/8/12/16 (srd 2009-2012)", () => {
        const asksAsi = rowKeys(asks).some(
          (k) => k === "asiMode" || k === "asiPlusTwo" || k === "feat"
        );
        expect(asksAsi).toBe(ASI_LEVELS.includes(level) || level === EPIC_BOON_LEVEL);
        if (ASI_LEVELS.includes(level)) {
          const m = asks.rows.find((r) => r.key === "asiMode");
          expect(m?.options.map((o) => o.id)).toEqual(
            expect.arrayContaining(["plus2", "plus1_1", "feat"])
          );
        }
      });

      it("asks the new cantrips the column adds (srd 1997-2000)", () => {
        const r = asks.rows.find((x) => x.key === "newCantrips");
        expect(r?.count ?? 0).toBe(srd.cantrips - prev.cantrips);
      });

      it("asks the new prepared spells the column adds, of a level with slots (srd 2014-2020)", () => {
        const r = asks.rows.find((x) => x.key === "newSpells");
        expect.soft(r?.count ?? 0).toBe(srd.prepared - prev.prepared);
        if (r) {
          const top = Math.max(...r.options.map((o) => spellLevel(o.id)));
          expect.soft(top, "highest spell level offered").toBe(srd.slots.length);
          expect
            .soft(Math.min(...r.options.map((o) => spellLevel(o.id))))
            .toBeGreaterThanOrEqual(1);
        }
      });

      it("offers the level-up spell swap and cantrip swap (srd 1979-1982, 1995-1997)", () => {
        expect.soft(rowKeys(asks)).toContain("swapRemove");
        expect.soft(rowKeys(asks)).toContain("cantripRemove");
      });

      it("Expertise: two skills at 2 and two more at 9 (srd 1985-1991)", () => {
        const r = asks.rows.find((x) => x.key === "expertise");
        expect.soft(r?.count ?? 0).toBe(EXPERTISE_LEVELS.includes(level) ? 2 : 0);
        const n = Object.values(s.doc.character.skills).filter(
          (t) => t === "expertise"
        ).length;
        expect.soft(n).toBe(level >= 9 ? 4 : 2);
      });

      it("Jack of All Trades: half PB on an unproficient skill (srd 1993-1999)", () => {
        const n = sheetNumbers(s.doc);
        const history = n.skills.find((x) => x.id === "history");
        const int = n.abilities.INT.total;
        expect(history?.total).toBe(mod(int) + Math.floor(srd.pb / 2));
      });

      if (level === 3) {
        it("Lore Bonus Proficiencies: three skills (srd 2184-2185)", () => {
          const r = asks.rows.find((x) => x.key.startsWith("slot:skill"));
          expect(r?.count).toBe(3);
        });
      }

      if (level === 6) {
        it("Magical Discoveries: two spells from Cleric/Druid/Wizard, always prepared (srd 2161-2172)", () => {
          const r = asks.rows.find((x) => x.key.startsWith("slot:spell"));
          expect.soft(r?.count).toBe(2);
          const ids = r?.options.map((o) => o.id) ?? [];
          expect.soft(ids).toContain(CLERIC_ONLY_L1);
          expect.soft(ids).toContain(WIZARD_ONLY_L3);
          for (const id of r?.picked ?? []) {
            const ref = effective(s.doc).find((x) => x.srdId === id);
            expect.soft(ref?.alwaysPrepared, `${id} always prepared`).toBe(true);
          }
        });
      }

      it("Magical Secrets: Cleric/Druid/Wizard spells from 10 on, not before (srd 2033-2045)", () => {
        const r = asks.rows.find((x) => x.key === "newSpells");
        if (!r) return;
        const ids = r.options.map((o) => o.id);
        if (level >= 10) expect(ids).toContain(CLERIC_ONLY_L1);
        else expect(ids).not.toContain(CLERIC_ONLY_L1);
      });

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
        it("asks for an Epic Boon feat (srd 2052-2054)", () => {
          const canTakeFeat =
            rowKeys(asks).includes("feat") ||
            !!asks.rows
              .find((r) => r.key === "asiMode")
              ?.options.some((o) => o.id === "feat");
          expect(canTakeFeat, `rows: ${rowKeys(asks).join(", ")}`).toBe(true);
        });
        it("offers Epic Boons and 'another feat of your choice' (srd 2052-2054)", () => {
          const featMode = levelUpAsks(
            must(s.before),
            CLASS,
            { ...NO_ANSWERS, asi: { ...emptyAsiChoice(), mode: "feat" } },
            "en"
          );
          const offered =
            featMode.rows.find((r) => r.key === "feat")?.options.map((o) => o.id) ?? [];
          expect.soft(offered).toContain("boon-of-spell-recall");
          // A General feat qualifies: Grappler, "General Feat (Prerequisite: Level 4+, Strength or Dexterity 13+)" (srd 5255-5257); the ASI feat itself is the +2 / +1+1 row, not a list entry.
          expect.soft(offered).toContain("grappler");
        });
      }

      if (level === 20) {
        it("Words of Creation: Power Word Heal and Kill always prepared (srd 2056-2062)", () => {
          for (const id of ["power-word-heal", "power-word-kill"]) {
            const ref = effective(s.doc).find((x) => x.srdId === id);
            expect.soft(ref?.alwaysPrepared, id).toBe(true);
          }
        });
      }
    });
  }
});
