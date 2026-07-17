/**
 * Collapsed-card subtitle budget guard (owner mandate 2026-06-12).
 *
 * "Universal action cards should avoid showing truncated text … NO PATCHES —
 * this has to be designed and solved SYSTEMATICALLY so it can never happen for
 * any feature-derived item."
 *
 * The design this guard pins:
 *  - The old `shortenEffect` slice-to-"…" mechanism is DELETED (rule 10). The
 *    presenter (`localizeSummary`) either shows a complete effect line or omits
 *    it (`fitsEffectBudget`) — there is no code path that can render an
 *    ellipsized subtitle.
 *  - Every SRD action's collapsed effect line is chosen by ONE shared helper,
 *    `srdEffectText`: the authored one-line `summary` on the action's catalogue
 *    key when present, else the full `description`.
 *  - THIS guard walks EVERY SRD action (feat / class-feature / race-trait /
 *    potion item / base action), resolves the chosen line through the REAL
 *    chooser + localizer in BOTH locales, and FAILS when any line exceeds
 *    `EFFECT_LINE_BUDGET`. A new SRD action whose description doesn't fit MUST
 *    therefore ship an authored `summary` (in `src/i18n/{en,it}/srd/<kind>.json`,
 *    sibling to the action's `name`/`description`) — an over-budget collapsed
 *    subtitle is unrepresentable in shipped data.
 *
 * Mirrors the engine exactly (single source of truth, golden rule 6):
 *  - feat / class-feature REACTION actions are skipped — `resolveFeatureActions`
 *    clears their effect (trigger + name is enough; the trigger parser is
 *    pattern-bounded);
 *  - race-trait actions keep their effect for every action type;
 *  - a potion WITHOUT a heal formula surfaces its item summary-or-description
 *    (`resolveItemConsumable` + the potion branch in `resolveWeaponActions`);
 *  - the engine-authored BASE_ACTIONS table is a collapsed line per entry.
 */
import { describe, it, expect } from "vitest";
import { SRD_FEATS } from "@/data/feats";
import { classFeatures } from "@/data/classes";
import { SRD_RACES, rawRaceTraitCatKey } from "@/data/races";
import { SRD_MAGIC_ITEMS } from "@/data/magic-items";
import { SRD_INVOCATIONS } from "@/data/invocations";
import { srdRefForFeatureSource } from "@/lib/srd-feature-lookup";
import { srdKey } from "@/i18n/srd-key";
import { srdEn } from "@/i18n/srd-en";
import { BASE_ACTIONS, srdEffectText } from "@/lib/smart-tracker";
import { EFFECT_LINE_BUDGET, localizeAction } from "@/lib/views/combat-action-view";
import { localizeText } from "@/lib/views/srd-i18n";
import { customText, litText } from "@/lib/loc-text";
import type { RawResolvedAction } from "@/lib/smart-tracker";

type Violation = { key: string; locale: "en" | "it"; length: number; line: string };

/** Measure one chosen effect line in both locales; collect over-budget lines. */
function measure(
  kind: Parameters<typeof srdEffectText>[0],
  key: string,
  out: Violation[]
): void {
  const ref = srdEffectText(kind, key);
  for (const locale of ["en", "it"] as const) {
    const line = localizeText(ref, locale);
    if (line.length > EFFECT_LINE_BUDGET) {
      out.push({ key: `${kind}:${key}`, locale, length: line.length, line });
    }
  }
}

describe("collapsed-card subtitle budget (no truncation, by construction)", () => {
  it("every feat / class-feature action line fits the budget (authored summary required when the description doesn't)", () => {
    const violations: Violation[] = [];
    for (const src of [...SRD_FEATS, ...classFeatures]) {
      const actions = src.mechanics?.actions;
      if (!actions?.length) continue;
      const ref = srdRefForFeatureSource(src);
      actions.forEach((action, i) => {
        // Engine parity: reaction effects are cleared (trigger + name shown).
        if (action.type === "reaction") return;
        measure(ref.kind, srdKey(ref.key, "mechanics", "actions", String(i)), violations);
      });
    }
    expect(violations).toEqual([]);
  });

  it("every race-trait action line fits the budget", () => {
    const violations: Violation[] = [];
    for (const race of SRD_RACES) {
      for (const trait of race.traits) {
        const actions = trait.mechanics?.actions;
        if (!actions?.length) continue;
        actions.forEach((_, i) => {
          measure(
            "race",
            srdKey(rawRaceTraitCatKey(race.id, trait), "mechanics", "actions", String(i)),
            violations
          );
        });
      }
    }
    expect(violations).toEqual([]);
  });

  it("every invocation action line fits the budget", () => {
    const violations: Violation[] = [];
    for (const inv of SRD_INVOCATIONS) {
      const actions = inv.mechanics?.actions;
      if (!actions?.length) continue;
      actions.forEach((_, i) => {
        measure(
          "invocation",
          srdKey(inv.id, "mechanics", "actions", String(i)),
          violations
        );
      });
    }
    expect(violations).toEqual([]);
  });

  it("every formula-less potion's item line fits the budget", () => {
    const violations: Violation[] = [];
    for (const item of SRD_MAGIC_ITEMS) {
      const isPotion = item.type === "potion" || item.id.startsWith("potion-");
      if (!isPotion || item.potionFormula) continue;
      if (!srdEn("magic-item", item.id, "description")) continue;
      measure("magic-item", item.id, violations);
    }
    expect(violations).toEqual([]);
  });

  it("every base-action effect/trigger fits the budget", () => {
    const violations: Violation[] = [];
    for (const ba of BASE_ACTIONS) {
      for (const locale of ["en", "it"] as const) {
        for (const line of [ba.effect[locale], ba.trigger?.[locale]]) {
          if (line && line.length > EFFECT_LINE_BUDGET) {
            violations.push({ key: ba.id, locale, length: line.length, line });
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

describe("presenter omit-not-slice gate (localizeSummary via localizeAction)", () => {
  function actionWithEffect(effect: RawResolvedAction["summary"]["effect"]) {
    const raw: RawResolvedAction = {
      id: "test-action",
      name: litText({ en: "Test", it: "Test" }),
      type: "action",
      source: "feature",
      spellLevel: null,
      concentration: false,
      summary: { effect },
      costsSlot: false,
      pinned: false,
      defaultPinned: false,
    };
    return localizeAction(raw, "en");
  }

  it("keeps a within-budget custom effect verbatim", () => {
    const line = "Spend 1 point — gain Advantage";
    expect(actionWithEffect(customText(line)).summary.effect).toBe(line);
  });

  it("OMITS (never slices) an over-budget custom effect — the accordion carries the prose", () => {
    const prose =
      "When you or a creature you can see within 60 feet makes an ability check, " +
      "attack roll, or saving throw, you can spend one point to roll an extra die.";
    const localized = actionWithEffect(customText(prose));
    expect(localized.summary.effect).toBeUndefined();
  });

  it("an exactly-at-budget line passes (the budget is inclusive)", () => {
    const line = "x".repeat(EFFECT_LINE_BUDGET);
    expect(actionWithEffect(customText(line)).summary.effect).toBe(line);
  });

  it("resolves an SRD action ref to its AUTHORED summary when the catalogue carries one", () => {
    // Boon of Fate's action: the description is over budget, so the catalogue
    // ships an authored one-line summary and srdEffectText must choose it.
    const key = "boon-of-fate.mechanics.actions.0";
    expect(srdEn("feat", key, "summary")).toBeTruthy();
    const localized = actionWithEffect(srdEffectText("feat", key));
    expect(localized.summary.effect).toBe(srdEn("feat", key, "summary"));
    expect(localized.summary.effect?.length).toBeLessThanOrEqual(EFFECT_LINE_BUDGET);
  });
});
