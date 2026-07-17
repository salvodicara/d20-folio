/**
 * Spell heal-verdict detection — regression for the 2024-phrasing miss.
 *
 * 2024 healing spells read "regains a number of Hit Points equal to 2d8 + your
 * spellcasting ability modifier" (the dice come AFTER "hit points"). The old
 * smart-tracker regex only matched the legacy "regains 2d8 hit points" form, so
 * EVERY 2024 healing spell silently showed no heal verdict — and the
 * `heal-bonus` rider (which appends to that verdict) was dead in the running app
 * even though its pure-helper unit test passed. Found by self-validating a Life
 * Cleric scenario in the live cockpit (see `lib/dev-scenarios.ts`).
 *
 * This pins the BASE detection path (no rider) using the canonical Bard mock, so
 * the fix can't regress independently of the Disciple-of-Life rider.
 */
import { describe, expect, it } from "vitest";
import { resolveActions, type ResolvedActionHeal } from "@/lib/smart-tracker";
import {
  CHIP_BUDGET,
  chipText,
  formatActionHeal,
  localizeActions,
  localizeHealBreakdown,
} from "@/lib/views/combat-action-view";
import { MOCK_CHARACTER } from "@/lib/mock";
import { makeCharacterDoc } from "./_helpers";

describe("smart-tracker — 2024 healing spells surface a heal verdict", () => {
  it("Healing Word (Bard, CHA 20 → +5) reads 2d4+5 — base spellcasting mod, no rider", () => {
    // Lyra (the mock) is a Bard 9 with Healing Word prepared and CHA 20. She has
    // no heal-amount rider, so the verdict is the spell's own dice + her casting
    // modifier — exactly what the 2024 phrasing must yield.
    const word = resolveActions(MOCK_CHARACTER).find((a) => a.spellId === "healing-word");
    expect(word?.summary.healing).toBe("2d4+5");
  });
});

/**
 * Feature heal-chip seam (P1 HEAL-SEAM, then CHIP-COMPACT 2026-06-12) — the
 * Second Wind chip USED to be regex-extracted from the EN prose (leaking
 * "Fighter level" into IT), then rendered the term SYMBOLICALLY ("1d10 +
 * livello da Guerriero" — the owner's four-line-wrapping verbose chip). Now the
 * data carries the declarative {@link import("@/data/types").ActionHeal}, the
 * ENGINE evaluates the term it knows (the owning class entry's level / the
 * ability mod) at emission, and the chip shows the compact evaluated token
 * ("1d10+5") in EVERY locale; the words moved to the breakdown tip
 * (`localizeHealBreakdown` — the same register as the weapon damage tip).
 * These pin: (1) the engine emits the EVALUATED structured heal; (2) the chip
 * is the compact token in both locales, within the chip budget; (3) the
 * provenance lines per locale; (4) the evaluation is multiclass-correct (the
 * OWNING class's level, never the other's); (5) the pure formatter + gate.
 */
describe("feature heal chip is evaluated + compact (provenance in the tip)", () => {
  const secondWind = { srdId: "fighter-second-wind" };

  it("the engine emits the EVALUATED structured heal for Second Wind (Fighter 5 → bonus 5)", () => {
    const doc = makeCharacterDoc({
      classId: "fighter",
      level: 5,
      features: [secondWind],
    });
    const action = resolveActions(doc).find((a) => a.id === "fighter-second-wind-bonus");
    // i18n-free AND evaluated: the engine resolves the class level to a number
    // at emission, keeping the term as provenance for the tip.
    expect(action?.summary.heal).toEqual({
      dice: "1d10",
      bonus: 5,
      term: { kind: "class-level", classId: "fighter" },
    });
    expect(action?.summary.healing).toBeUndefined();
  });

  // The chip is the SAME compact token in both locales (locale-free digits) —
  // and always within the chip budget (the owner's wrapping-chip repro class).
  it.each([{ locale: "en" as const }, { locale: "it" as const }])(
    "Second Wind chip in $locale reads 1d10+5 — evaluated, compact, within budget",
    ({ locale }) => {
      const doc = makeCharacterDoc({
        classId: "fighter",
        level: 5,
        features: [secondWind],
      });
      const action = localizeActions(doc, locale).find(
        (a) => a.id === "fighter-second-wind-bonus"
      );
      expect(action?.summary.healing).toBe("1d10+5");
      expect(action?.summary.healing?.length).toBeLessThanOrEqual(CHIP_BUDGET);
      // The words live in the TIP, never the chip (the leak guard, upgraded).
      expect(action?.summary.healing).not.toMatch(/[A-Za-z]{2,}/);
    }
  );

  it("the provenance moved to the breakdown tip — localized lines per locale", () => {
    const doc = makeCharacterDoc({
      classId: "fighter",
      level: 5,
      features: [secondWind],
    });
    const en = localizeActions(doc, "en").find(
      (a) => a.id === "fighter-second-wind-bonus"
    );
    const it = localizeActions(doc, "it").find(
      (a) => a.id === "fighter-second-wind-bonus"
    );
    expect(en?.summary.healingBreakdown).toEqual([
      { kind: "loc", value: "1d10", label: en?.name },
      { kind: "loc", value: "+5", label: "Fighter level" },
    ]);
    expect(it?.summary.healingBreakdown).toEqual([
      { kind: "loc", value: "1d10", label: it?.name },
      { kind: "loc", value: "+5", label: "livello da Guerriero" },
    ]);
  });

  it("the evaluation is multiclass-correct — Fighter 5 / Wizard 3 reads +5 (the OWNING class's level)", () => {
    const doc = makeCharacterDoc({
      classes: [
        { classId: "fighter", level: 5 },
        { classId: "wizard", level: 3 },
      ],
      features: [secondWind],
    });
    const en = localizeActions(doc, "en").find(
      (a) => a.id === "fighter-second-wind-bonus"
    );
    const it = localizeActions(doc, "it").find(
      (a) => a.id === "fighter-second-wind-bonus"
    );
    expect(en?.summary.healing).toBe("1d10+5");
    expect(it?.summary.healing).toBe("1d10+5");
    // The tip names the OWNING class, never the other.
    expect(it?.summary.healingBreakdown?.[1]).toMatchObject({
      label: "livello da Guerriero",
      value: "+5",
    });
  });

  // The pure formatter — pin every evaluated shape (locale-free by construction).
  const formatCases: Array<{ heal: ResolvedActionHeal; expected: string }> = [
    {
      heal: { dice: "1d10", bonus: 5, term: { kind: "class-level", classId: "fighter" } },
      expected: "1d10+5",
    },
    {
      heal: { dice: "2d6", bonus: 3, term: { kind: "ability-mod", ability: "WIS" } },
      expected: "2d6+3",
    },
    { heal: { dice: "2d4", bonus: 2 }, expected: "2d4+2" },
    { heal: { dice: "1d10", bonus: 0 }, expected: "1d10" },
    { heal: { bonus: 5 }, expected: "5" },
    {
      heal: { dice: "2d6", bonus: -1, term: { kind: "ability-mod", ability: "WIS" } },
      expected: "2d6-1",
    },
  ];
  it.each(formatCases)("formatActionHeal renders $expected", ({ heal, expected }) => {
    expect(formatActionHeal(heal)).toBe(expected);
  });

  it("localizeHealBreakdown: ability-mod provenance is an ability line; flat/dice-only have NO tip", () => {
    const abilityHeal: ResolvedActionHeal = {
      dice: "2d6",
      bonus: 3,
      term: { kind: "ability-mod", ability: "WIS" },
    };
    expect(localizeHealBreakdown(abilityHeal, "Healing Light", "en")).toEqual([
      { kind: "loc", value: "2d6", label: "Healing Light" },
      { kind: "ability", value: "+3", ability: "WIS" },
    ]);
    // Flat term: the number IS its own provenance — no tip.
    expect(
      localizeHealBreakdown({ dice: "2d4", bonus: 2 }, "Potion", "en")
    ).toBeUndefined();
    // Dice-only: nothing to decompose.
    expect(
      localizeHealBreakdown({ dice: "1d10", bonus: 0 }, "Second Wind", "en")
    ).toBeUndefined();
  });

  // The chip omit-not-wrap gate (CHIP_BUDGET) — the systematic lock.
  it("chipText: keeps a fitting composition, drops the label when over, omits when even the core is over", () => {
    expect(chipText("1d10+5", "1d10+5 Heal")).toBe("1d10+5 Heal");
    expect(chipText("1d10+5", "1d10+5 " + "x".repeat(CHIP_BUDGET))).toBe("1d10+5");
    expect(chipText("x".repeat(CHIP_BUDGET + 1))).toBeUndefined();
    expect(chipText("x".repeat(CHIP_BUDGET))).toBe("x".repeat(CHIP_BUDGET));
  });
});
