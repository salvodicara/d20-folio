/**
 * Overrides are always possible and stay explained (owner direction, row 13). Every
 * number `sheetNumbers` lists can be set by hand, and a hand-set number keeps its
 * explanation: the computed parts, then ONE "manual adjustment" part for the
 * difference, so the parts still sum to the number the sheet shows. Cases come from
 * every dev scenario; a new sheet number without an override path fails here (the
 * table below is typed over every key of `SheetNumbers`, and the keys are compared
 * at run time too).
 */
import { describe, expect, it } from "vitest";

import { DEV_SCENARIOS, buildDevScenario } from "@/lib/dev-scenarios";
import { computeCharacterMaxHp } from "@/lib/aggregate-character";
import { exhaustionPenalty } from "@/lib/compute";
import { buildWeaponAttackBreakdown } from "@/lib/smart-tracker";
import {
  OVERRIDE_TERM,
  breakdownTotal,
  isHandSet,
  termPart,
  type RawBreakdownPart,
} from "@/lib/value-breakdown";
import { deriveCharacter } from "@/lib/views/derive-character";
import {
  sheetNumbers,
  type Explained,
  type SheetNumbers,
} from "@/lib/views/sheet-numbers";
import type { CharacterDoc } from "@/types/character";
import type { AbilityCode } from "@/data/types";

// Every scenario as built, and again at Exhaustion 2: a hand-set save or attack
// still takes the Exhaustion penalty, and the adjustment must not swallow it.
const docs: [string, CharacterDoc][] = Object.keys(DEV_SCENARIOS).flatMap((id) => {
  const doc = buildDevScenario(id);
  if (!doc) return [];
  const exhausted = { ...doc, session: { ...doc.session, exhaustion: 2 } };
  return [
    [id, doc] as [string, CharacterDoc],
    [`${id} (exhaustion 2)`, exhausted] as [string, CharacterDoc],
  ];
});

type N = SheetNumbers<RawBreakdownPart>;
type E = Explained<RawBreakdownPart>;

/** One overridable number: how to pin it, where to read it, what it then shows. */
interface Case {
  name: string;
  read: (n: N) => E | null;
  pin: (doc: CharacterDoc, value: number) => CharacterDoc;
  /** The number shown once pinned to `value` (the value itself unless noted). */
  shown?: (pinned: CharacterDoc, value: number) => number;
  /** The value to pin (default: the shown number + 3, never the computed one). */
  value?: (doc: CharacterDoc, shownBefore: number) => number;
}

const withChar = (
  doc: CharacterDoc,
  patch: Partial<CharacterDoc["character"]>
): CharacterDoc => ({ ...doc, character: { ...doc.character, ...patch } });

/** A pin sets the modifier: a save, skill or spell attack still takes Exhaustion on top. */
const plusExhaustion = (pinned: CharacterDoc, value: number): number =>
  value + exhaustionPenalty(pinned.session.exhaustion);

const ABILITIES: AbilityCode[] = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];
const PASSIVE_FIELD = {
  perception: "passivePerceptionOverride",
  investigation: "passiveInvestigationOverride",
  insight: "passiveInsightOverride",
} as const;

/** Every sheet number → its override cases. Typed over every key: a new number must
 *  be added here (with an override path) or the typecheck fails. */
const CASES: Record<keyof N, (doc: CharacterDoc) => Case[]> = {
  ac: () => [
    { name: "ac", read: (n) => n.ac, pin: (d, v) => withChar(d, { acOverride: v }) },
  ],
  initiative: () => [
    {
      name: "initiative",
      read: (n) => n.initiative,
      pin: (d, v) => withChar(d, { initiativeBonusOverride: v }),
    },
  ],
  speed: () => [
    {
      name: "speed",
      read: (n) => n.speed,
      pin: (d, v) => withChar(d, { speedOverride: v }),
    },
  ],
  proficiencyBonus: () => [
    {
      name: "proficiencyBonus",
      read: (n) => n.proficiencyBonus,
      pin: (d, v) => withChar(d, { proficiencyBonusOverride: v }),
    },
  ],
  maxHp: () => [
    {
      // The stored max IS the hand-set value; the live boons and a Life Drain still
      // apply on top, exactly as the sheet shows them.
      name: "maxHp",
      read: (n) => n.maxHp,
      pin: (d, v) => withChar(d, { hp: { ...d.character.hp, max: v } }),
      shown: (pinned) => deriveCharacter(pinned).hp.max,
      // Off the by-the-book max, whatever the scenario stores.
      value: (d) => computeCharacterMaxHp(d.character) + 3,
    },
  ],
  saves: () =>
    ABILITIES.map((ability) => ({
      name: `save:${ability}`,
      read: (n: N) => n.saves.find((s) => s.ability === ability) ?? null,
      pin: (d: CharacterDoc, v: number) =>
        withChar(d, {
          savingThrowBonusOverrides: {
            ...d.character.savingThrowBonusOverrides,
            [ability]: v,
          },
        }),
      shown: plusExhaustion,
    })),
  skills: (doc) =>
    sheetNumbers(doc).skills.map(({ id }) => ({
      name: `skill:${id}`,
      read: (n: N) => n.skills.find((s) => s.id === id) ?? null,
      pin: (d: CharacterDoc, v: number) =>
        withChar(d, {
          skillBonusOverrides: { ...d.character.skillBonusOverrides, [id]: v },
        }),
      shown: plusExhaustion,
    })),
  passives: () =>
    (Object.keys(PASSIVE_FIELD) as (keyof typeof PASSIVE_FIELD)[]).map((id) => ({
      name: `passive:${id}`,
      read: (n: N) => n.passives[id],
      pin: (d: CharacterDoc, v: number) => withChar(d, { [PASSIVE_FIELD[id]]: v }),
    })),
  spellcasting: (doc) => {
    const sc = doc.character.spellcasting;
    if (!sc) return [];
    return [
      {
        name: "spellSaveDc",
        read: (n: N) => n.spellcasting?.saveDc ?? null,
        pin: (d: CharacterDoc, v: number) =>
          withChar(d, { spellcasting: { ...sc, saveDCOverride: v } }),
      },
      {
        name: "spellAttack",
        read: (n: N) => n.spellcasting?.attackBonus ?? null,
        pin: (d: CharacterDoc, v: number) =>
          withChar(d, { spellcasting: { ...sc, attackBonusOverride: v } }),
        shown: plusExhaustion,
      },
    ];
  },
};

const isOverridePart = (p: RawBreakdownPart | undefined): boolean =>
  p != null && "term" in p.label && p.label.term === OVERRIDE_TERM;

describe("every sheet number can be set by hand and stays explained", () => {
  it("the override table covers every sheet number", () => {
    const doc = docs[0]?.[1];
    if (!doc) throw new Error("no scenario");
    expect(Object.keys(sheetNumbers(doc)).sort()).toEqual(Object.keys(CASES).sort());
  });

  it.each(docs)(
    "%s: a pinned number shows the pin, keeps its parts and adds one override part",
    (_id, doc) => {
      const baseline = sheetNumbers(doc);
      const cases = Object.values(CASES).flatMap((cases) => cases(doc));
      expect(cases.length).toBeGreaterThan(0);
      for (const c of cases) {
        const before = c.read(baseline);
        if (!before) throw new Error(`${c.name}: no baseline number`);
        // Never the computed value, so the override part always carries a difference.
        const value = c.value ? c.value(doc, before.total) : before.total + 3;
        const pinned = c.pin(doc, value);
        const after = c.read(sheetNumbers(pinned));
        const shown = c.shown ? c.shown(pinned, value) : value;

        expect(after?.total, c.name).toBe(shown);
        // A number without a composition the engine vouches for (a homebrew class's
        // max HP) has nothing to explain, pinned or not.
        if (before.parts === null && c.name === "maxHp") continue;
        expect(after?.parts, c.name).not.toBeNull();
        const parts = after?.parts ?? [];
        expect(breakdownTotal(parts), c.name).toBe(shown);
        expect(isHandSet(parts), c.name).toBe(true);
        expect(parts.filter(isOverridePart), c.name).toHaveLength(1);
        // The computed explanation is kept as it was (a by-the-book baseline).
        if (before.parts && !before.parts.some(isOverridePart)) {
          expect(
            parts.filter((p) => !isOverridePart(p)),
            c.name
          ).toEqual(before.parts);
        }
      }
    }
  );

  it("a stored max HP off the by-the-book average reads as a manual adjustment", () => {
    const entry = docs.find(([, d]) => computeCharacterMaxHp(d.character) > 1);
    if (!entry) throw new Error("no scenario");
    const doc = entry[1];
    const computed = computeCharacterMaxHp(doc.character);
    const n = sheetNumbers(withChar(doc, { hp: { max: computed - 4 } }));
    expect(n.maxHp.parts?.at(-1)).toEqual({
      label: { term: OVERRIDE_TERM },
      value: -4,
    });
  });
});

describe("a hand-set weapon to-hit stays explained", () => {
  const computed = {
    attackStat: "STR" as const,
    abilityMod: 3,
    proficiencyBonus: 2,
    exhaustionPenalty: -4,
    fadingParts: [termPart("character.exhaustion", -1)],
  };

  it.each([0, 9])(
    "pinned to %i, it keeps the computed lines and adds the adjustment",
    (pin) => {
      const before = buildWeaponAttackBreakdown(computed);
      const parts = buildWeaponAttackBreakdown({ ...computed, override: pin });
      expect(parts.slice(0, -1)).toEqual(before);
      expect(parts.at(-1)?.label).toEqual({ term: OVERRIDE_TERM });
      // Exhaustion (−4) and the fading penalty (−1) still apply on top of the pin.
      expect(breakdownTotal(parts)).toBe(pin - 5);
    }
  );
});

describe("a pinned skill still takes Exhaustion, like a pinned save", () => {
  it("at Exhaustion 2 shows the pin, a −4 Exhaustion line, and the total with it", () => {
    const base = docs[0]?.[1];
    if (!base) throw new Error("no scenario");
    const doc = withChar(
      { ...base, session: { ...base.session, exhaustion: 2 } },
      {
        skillBonusOverrides: { stealth: 7 },
        savingThrowBonusOverrides: { DEX: 7 },
      }
    );
    const n = sheetNumbers(doc);
    const skill = n.skills.find((s) => s.id === "stealth");
    const save = n.saves.find((s) => s.ability === "DEX");
    for (const number of [skill, save]) {
      expect(number?.total).toBe(3);
      expect(number?.parts).toContainEqual({
        label: { term: "character.exhaustion" },
        value: -4,
      });
      expect(breakdownTotal(number?.parts ?? [])).toBe(3);
      expect(isHandSet(number?.parts)).toBe(true);
    }
    // The same character's unpinned numbers are not hand-set.
    expect(isHandSet(n.skills.find((s) => s.id === "athletics")?.parts)).toBe(false);
    expect(isHandSet(null)).toBe(false);
    expect(deriveCharacter(doc).skills.find((s) => s.id === "stealth")?.bonus).toBe(3);
  });
});
