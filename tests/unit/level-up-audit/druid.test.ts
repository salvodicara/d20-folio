/**
 * LEVEL-UP AUDIT — Druid 1→20 against SRD 5.2.1 (srd.txt, "Druid Features" table
 * at lines 2509-2531, feature text 2495-2660, Circle of the Land 2771-2840).
 *
 * The character is built by the real creation path (`buildNewCharacter`), then
 * levelled through the real level-up path: `levelUpAsks` (what the new level-up
 * screen asks) answered row by row, then `commitLevelUp` with the picks it returns.
 * Every expected value below is copied from the SRD text, never from src/data.
 * Readers are the sheet's own: `sheetNumbers` (PB, max HP), the Spells tab
 * view-model `buildSpellsViewModel` (prepared cap, slots), `resolveEffectiveSpells`
 * (the list the Spells tab draws), `resolveTrackers` (Wild Shape), `formPool` (the
 * Wild Shape form picker).
 *
 * Choices: Primal Order Warden at creation (Magician is checked apart, so the
 * Cantrips column reads clean); Circle of the Land at 3 with the Arid land; the first
 * Elemental Fury option at 7; each ASI is +2 Wisdom; average Hit Points.
 */
import { describe, expect, it } from "vitest";

import enClassFeatures from "@/i18n/en/srd/class-features.json";
import { BEASTS } from "@/data/beasts";
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
import { formPool } from "@/lib/form-pool";
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

const CLASS = "druid";
const SUBCLASS = "circle-of-the-land";
const DIE = 8;
const AVG = DIE / 2 + 1; // SRD 1431-1434: "Bard, Cleric, Druid … 5 + Con. modifier"

// ── SRD 5.2.1 — Druid Features table (srd.txt 2509-2531) ─────────────────────
// [level, PB, Wild Shape (0 = "—"), Cantrips, Prepared Spells, slots 1..9]
type Row = [number, number, number, number, number, number[]];
const TABLE: ReadonlyArray<Row> = [
  [1, 2, 0, 2, 4, [2]],
  [2, 2, 2, 2, 5, [3]],
  [3, 2, 2, 2, 6, [4, 2]],
  [4, 2, 2, 3, 7, [4, 3]],
  [5, 3, 2, 3, 9, [4, 3, 2]],
  [6, 3, 3, 3, 10, [4, 3, 3]],
  [7, 3, 3, 3, 11, [4, 3, 3, 1]],
  [8, 3, 3, 3, 12, [4, 3, 3, 2]],
  [9, 4, 3, 3, 14, [4, 3, 3, 3, 1]],
  [10, 4, 3, 4, 15, [4, 3, 3, 3, 2]],
  [11, 4, 3, 4, 16, [4, 3, 3, 3, 2, 1]],
  [12, 4, 3, 4, 16, [4, 3, 3, 3, 2, 1]],
  [13, 5, 3, 4, 17, [4, 3, 3, 3, 2, 1, 1]],
  [14, 5, 3, 4, 17, [4, 3, 3, 3, 2, 1, 1]],
  [15, 5, 3, 4, 18, [4, 3, 3, 3, 2, 1, 1, 1]],
  [16, 5, 3, 4, 18, [4, 3, 3, 3, 2, 1, 1, 1]],
  [17, 6, 4, 4, 19, [4, 3, 3, 3, 2, 1, 1, 1, 1]],
  [18, 6, 4, 4, 20, [4, 3, 3, 3, 3, 1, 1, 1, 1]],
  [19, 6, 4, 4, 21, [4, 3, 3, 3, 3, 2, 1, 1, 1]],
  [20, 6, 4, 4, 22, [4, 3, 3, 3, 3, 2, 2, 1, 1]],
];
const row = (level: number) => {
  const r = TABLE[level - 1];
  if (!r) throw new Error(`no SRD row ${level}`);
  return { pb: r[1], wildShape: r[2], cantrips: r[3], prepared: r[4], slots: r[5] };
};

// Beast Shapes table (srd 2585-2593): [from Druid level, known forms, max CR, fly].
const BEAST_SHAPES: ReadonlyArray<[number, number, number, boolean]> = [
  [2, 4, 0.25, false],
  [4, 6, 0.5, false],
  [8, 8, 1, true],
];
const beastShape = (level: number) =>
  [...BEAST_SHAPES].reverse().find(([from]) => level >= from) ?? null;

// "Class Features" column (srd 2512-2531) + Circle of the Land (srd 2771-2840).
const FEATURES: Record<number, string[]> = {
  1: ["Spellcasting", "Druidic", "Primal Order"],
  2: ["Wild Shape", "Wild Companion"],
  3: ["Circle of the Land Spells", "Land's Aid"],
  5: ["Wild Resurgence"],
  6: ["Natural Recovery"],
  7: ["Elemental Fury"],
  10: ["Nature's Ward"],
  14: ["Nature's Sanctuary"],
  15: ["Improved Elemental Fury"],
  18: ["Beast Spells"],
  20: ["Archdruid"],
};
const ASI_LEVELS = [4, 8, 12, 16]; // srd 2648-2652
const EPIC_BOON_LEVEL = 19; // srd 2635-2638
const SUBCLASS_LEVEL = 3; // srd 2640-2646
// Arid Land circle spells (srd 2792-2799): prepared from these Druid levels.
const ARID_SPELLS: Record<number, string[]> = {
  3: ["blur", "burning-hands", "fire-bolt"],
  5: ["fireball"],
  7: ["blight"],
  9: ["wall-of-stone"],
};
const BEAST_IDS = new Set(BEASTS.map((b) => b.id));

// ── harness ──────────────────────────────────────────────────────────────────
const apply = (d: CreationDraft, ...a: CreationDraftAction[]) =>
  a.reduce(creationDraftReducer, d);

function levelOne(order: "warden" | "magician"): CharacterDoc {
  const d = apply(
    initialCreationDraft(),
    { type: "setName", name: "Audit" },
    { type: "setAlignment", alignment: "neutral" },
    { type: "selectClass", classId: CLASS },
    { type: "selectRace", raceId: "halfling" },
    { type: "fillReadyMade" },
    { type: "setLineageChoice", bundleKey: "druid-primal-order", optionId: order }
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
      const wis = doc.character.abilityScores.WIS;
      const want =
        r.key === "subclass"
          ? [SUBCLASS]
          : r.key === "asiPlusTwo"
            ? [wis <= 18 && ids.includes("WIS") ? "WIS" : "DEX"]
            : r.key === "bundle:druid-land-terrain"
              ? ["arid"]
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
  let doc = levelOne("warden");
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

describe("Druid level-up audit (SRD 5.2.1)", () => {
  it("level 1 build is complete (creation)", () => {
    expect(snap(1).doc.character.classes[0]).toMatchObject({ classId: CLASS, level: 1 });
    expect(snap(1).doc.session.grantBundleChoices).toMatchObject({
      "druid-primal-order": "warden",
    });
  });

  it("creation: Magician knows one extra cantrip (srd 2544-2545)", () => {
    const doc = levelOne("magician");
    // Every cantrip the Spells tab lists, always-prepared or not.
    const all = effective(doc).filter((s) => spellLevel(s.srdId) === 0);
    expect(all.length).toBe(row(1).cantrips + 1);
  });

  it("Druidic: Speak with Animals always prepared (srd 2584-2590)", () => {
    const ref = effective(snap(1).doc).find((x) => x.srdId === "speak-with-animals");
    expect(ref?.alwaysPrepared).toBe(true);
  });

  for (let level = 1; level <= 20; level++) {
    describe(`level ${level}`, () => {
      const s = snap(level);
      const srd = row(level);

      it("proficiency bonus (srd 2512-2531)", () => {
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

      it("Wild Shape column (srd 2512-2531, 2560-2566)", () => {
        const t = resolveTrackers(s.doc).find((x) => x.id === "druid-wild-shape");
        expect.soft(t?.total ?? 0).toBe(srd.wildShape);
        // srd 2562-2564: "regain one expended use when you finish a Short Rest, and … all
        // expended uses when you finish a Long Rest".
        if (t) {
          expect.soft(t.shortRestRecovery, "uses back on a Short Rest").toBe(1);
          expect.soft(t.longRestRecovery, "a Long Rest refills all").toBeUndefined();
        }
      });

      it("Beast Shapes: max CR and Fly Speed of the forms offered (srd 2568-2593)", () => {
        const shape = beastShape(level);
        if (!shape) return;
        const [, , maxCr, fly] = shape;
        const pool = formPool(s.doc, "druid-wild-shape");
        expect.soft(Math.max(...pool.map((b) => b.cr))).toBe(maxCr);
        expect.soft(pool.some((b) => (b.speeds.fly ?? 0) > 0)).toBe(fly);
      });

      it("Spell Slots columns (srd 2512-2531)", () => {
        expect(slotTotals(s.doc)).toEqual(srd.slots);
      });

      it("Prepared Spells column: the sheet's cap (srd 2512-2531, 2555-2566)", () => {
        const vm = buildSpellsViewModel(s.doc, CLASS, "en", false);
        expect(vm.castSummary?.preparedMax).toBe(srd.prepared);
      });

      it("Cantrips column: the Druid cantrips on the sheet (srd 2541-2549)", () => {
        expect(ownCantrips(s.doc).length).toBe(srd.cantrips);
      });

      it("Arid circle spells: prepared from their level (srd 2782-2799)", () => {
        const eff = effective(s.doc);
        for (const [from, ids] of Object.entries(ARID_SPELLS)) {
          for (const id of ids) {
            const ref = eff.find((x) => x.srdId === id);
            if (level >= Number(from))
              expect.soft(ref?.alwaysPrepared, `${id} at ${level}`).toBe(true);
            else
              expect.soft(ref?.alwaysPrepared ?? false, `${id} at ${level}`).toBe(false);
          }
        }
      });

      if (level === 1) return;
      const asks = must(s.asks);
      const prev = row(level - 1);

      it("asks for the subclass at 3 only (srd 2640-2646)", () => {
        expect(rowKeys(asks).includes("subclass")).toBe(level === SUBCLASS_LEVEL);
        if (level >= SUBCLASS_LEVEL)
          expect(s.doc.character.classes[0]?.subclassId).toBe(SUBCLASS);
      });

      it("asks for an Ability Score Improvement or feat at 4/8/12/16 (srd 2648-2652)", () => {
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

      it("asks the new cantrips the column adds (srd 2547-2549)", () => {
        const r = asks.rows.find((x) => x.key === "newCantrips");
        expect(r?.count ?? 0).toBe(srd.cantrips - prev.cantrips);
      });

      it("asks the new prepared spells the column adds, of a level with slots (srd 2555-2566)", () => {
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

      it("offers the level-up cantrip swap (srd 2544-2546)", () => {
        // "Whenever you gain a Druid level, you can replace one of your cantrips
        // with another cantrip of your choice from the Druid spell list."
        expect(rowKeys(asks)).toContain("cantripRemove");
      });

      it("Wild Shape Known Forms: asks the forms the Beast Shapes table adds (srd 2568-2593)", () => {
        const now = beastShape(level)?.[1] ?? 0;
        const before = beastShape(level - 1)?.[1] ?? 0;
        const formRows = asks.rows.filter((r) =>
          r.options.some((o) => BEAST_IDS.has(o.id))
        );
        expect(formRows.reduce((n, r) => n + r.count, 0)).toBe(now - before);
      });

      if (level === 3) {
        it("Circle of the Land: asks the land type (srd 2782-2786)", () => {
          const r = asks.rows.find((x) => x.key === "bundle:druid-land-terrain");
          expect(r?.options.map((o) => o.id).sort()).toEqual([
            "arid",
            "polar",
            "temperate",
            "tropical",
          ]);
        });
      }

      if (level === 7) {
        it("Elemental Fury: one of two options (srd 2608-2616)", () => {
          const r = asks.rows.find((x) => x.key === "bundle:druid-elemental-fury");
          expect(r?.options.map((o) => o.id).sort()).toEqual([
            "potent-spellcasting",
            "primal-strike",
          ]);
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
        it("asks for an Epic Boon feat (srd 2635-2638)", () => {
          const canTakeFeat =
            rowKeys(asks).includes("feat") ||
            !!asks.rows
              .find((r) => r.key === "asiMode")
              ?.options.some((o) => o.id === "feat");
          expect(canTakeFeat, `rows: ${rowKeys(asks).join(", ")}`).toBe(true);
        });
        it("offers Epic Boons and 'another feat of your choice' (srd 2635-2638)", () => {
          const featMode = levelUpAsks(
            must(s.before),
            CLASS,
            { ...NO_ANSWERS, asi: { ...emptyAsiChoice(), mode: "feat" } },
            "en"
          );
          const offered =
            featMode.rows.find((r) => r.key === "feat")?.options.map((o) => o.id) ?? [];
          expect.soft(offered).toContain("boon-of-dimensional-travel");
          // A General feat qualifies: Grappler, "General Feat (Prerequisite: Level 4+, Strength or Dexterity 13+)" (srd 5255-5257); the ASI feat itself is the +2 / +1+1 row, not a list entry.
          expect.soft(offered).toContain("grappler");
        });
      }
    });
  }
});
