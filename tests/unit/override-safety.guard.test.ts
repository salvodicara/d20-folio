/**
 * Override-safety guard (goal prong 3: a manual override must NEVER break the
 * sheet). A player may homebrew any FINITE value, but garbage (NaN / ±Infinity,
 * which an in-app/programmatic path could inject — JSON itself nulls them) must
 * never poison a derived value: `override ?? computed` lets `NaN` through because
 * `NaN` is not nullish. This fuzzes every override field and asserts the
 * fully-derived sheet (`dumpSheet`) stays coherent — every number finite, no throw.
 */
import { describe, it, expect } from "vitest";
import { MOCK_CHARACTER } from "@/lib/mock";
import { rehydrateCharacter } from "@/lib/character-minimal";
import type { CharacterDoc, CharacterData } from "@/types/character";
import { dumpSheet } from "../_harness/sheet-dump";

const GARBAGE = [NaN, Infinity, -Infinity] as const;

function docWith(overrides: Partial<CharacterData>): CharacterDoc {
  return {
    ...MOCK_CHARACTER,
    character: rehydrateCharacter({ ...MOCK_CHARACTER.character, ...overrides }),
  };
}

/** Collect every numeric leaf in the dump (recursively) so we can assert finiteness. */
function numbers(value: unknown, out: number[] = []): number[] {
  if (typeof value === "number") out.push(value);
  else if (Array.isArray(value)) for (const v of value) numbers(v, out);
  else if (value && typeof value === "object")
    for (const v of Object.values(value)) numbers(v, out);
  return out;
}

function assertCoherent(doc: CharacterDoc, label: string): void {
  const dump = dumpSheet(doc);
  const nums = numbers(dump);
  const bad = nums.filter((n) => !Number.isFinite(n));
  expect(bad, `${label}: produced non-finite numbers ${JSON.stringify(bad)}`).toEqual([]);
  // Also assert nothing rendered the literal string "NaN" / "Infinity".
  const json = JSON.stringify(dump);
  expect(json.includes("NaN"), `${label}: dump contains "NaN" text`).toBe(false);
  expect(json.includes("Infinity"), `${label}: dump contains "Infinity" text`).toBe(
    false
  );
}

describe("override safety — garbage scalar overrides never break the sheet", () => {
  const scalarFields: Array<keyof CharacterData> = [
    "acOverride",
    "proficiencyBonusOverride",
    "initiativeBonusOverride",
    "passivePerceptionOverride",
    "passiveInsightOverride",
    "passiveInvestigationOverride",
    "hitDiceTotalOverride",
  ];

  for (const field of scalarFields) {
    for (const g of GARBAGE) {
      it(`${field} = ${g} stays coherent`, () => {
        assertCoherent(docWith({ [field]: g }), field);
      });
    }
  }

  for (const g of GARBAGE) {
    it(`spellcasting saveDC/attack/prepared overrides = ${g} stay coherent`, () => {
      const base = MOCK_CHARACTER.character;
      if (!base.spellcasting) return;
      assertCoherent(
        docWith({
          spellcasting: {
            ...base.spellcasting,
            saveDCOverride: g,
            attackBonusOverride: g,
            preparedMaxOverride: g,
          },
        }),
        "spellcasting overrides"
      );
    });
  }
});

describe("override safety — garbage map overrides never break the sheet", () => {
  for (const g of GARBAGE) {
    it(`skillBonusOverrides / savingThrowBonusOverrides = ${g} stay coherent`, () => {
      assertCoherent(
        docWith({
          skillBonusOverrides: { perception: g, stealth: g },
          savingThrowBonusOverrides: { STR: g, DEX: g },
        }),
        "skill/save overrides"
      );
    });

    it(`senseRangeOverrides / speedOverrides = ${g} stay coherent`, () => {
      assertCoherent(
        docWith({
          senseRangeOverrides: { darkvision: g },
          speedOverrides: { fly: g, swim: g },
        }),
        "sense/speed overrides"
      );
    });
  }
});

describe("override safety — garbage weapon overrides never break the combat row", () => {
  for (const g of GARBAGE) {
    it(`a weapon attackBonusOverride = ${g} stays coherent`, () => {
      const base = MOCK_CHARACTER.character;
      const weapons = base.weapons.map((w, i) =>
        i === 0 ? { ...w, attackBonusOverride: g } : w
      );
      assertCoherent(docWith({ weapons }), "weapon attackBonusOverride");
    });
  }
});

describe("override safety — extreme FINITE overrides are honored (homebrew), not broken", () => {
  it("a huge AC override renders as-is (homebrew is allowed)", () => {
    const dump = dumpSheet(docWith({ acOverride: 99 }));
    expect(dump.vitals.acEffective).toBe(99);
  });
});
