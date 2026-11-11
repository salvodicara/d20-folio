/**
 * The card's damage chip for a spell with a bigger die against a hurt target reads
 * both dice ("1d8 / 1d12 if hurt"), scaled, within the chip budget.
 */
import { describe, expect, it } from "vitest";
import i18next from "i18next";
import enCombat from "@/i18n/en/ui/combat.json";
import itCombat from "@/i18n/it/ui/combat.json";
import { combatVerdict } from "@/features/character/center/tabs/combat-card-helpers";
import { CHIP_BUDGET } from "@/lib/views/combat-action-view";
import type { ResolvedAction } from "@/lib/smart-tracker";

const i18n = i18next.createInstance();
await i18n.init({
  lng: "en",
  resources: { en: { translation: enCombat }, it: { translation: itCombat } },
  interpolation: { escapeValue: false },
});

const tolling = (damage: string, damageIfHurt: string) =>
  ({
    id: "spell-toll",
    summary: { damage, damageIfHurt, damageType: "necrotic" },
  }) as unknown as ResolvedAction;

describe("the hurt-target die on the card chip", () => {
  it("reads both dice, in English and Italian, scaled", () => {
    const en = i18n.getFixedT("en");
    const it_ = i18n.getFixedT("it");
    expect(combatVerdict(tolling("1d8", "1d12"), en)).toBe("1d8 / 1d12 if hurt");
    expect(combatVerdict(tolling("2d8", "2d12"), it_)).toBe("2d8 / 2d12 se ferito");
    expect(combatVerdict(tolling("4d8", "4d12"), it_).length).toBeLessThanOrEqual(
      CHIP_BUDGET
    );
  });
});
