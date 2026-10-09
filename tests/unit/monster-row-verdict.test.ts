/**
 * The monster row's right chip says what the seal does not (owner 2026-10-09): the
 * seal already shows the Challenge Rating, so the chip shows the XP a DM budgets with.
 * Cases come from the bestiary itself.
 */
import { describe, expect, it } from "vitest";
import i18n from "@/i18n";
import { monsterSpec } from "@/features/compendium/picker/specs/monster";
import { MONSTERS } from "@/data/monsters";
import { monsterXp } from "@/lib/monster";
import { fmtXp, formatCr } from "@/lib/utils";

describe("monster row verdict", () => {
  it("every bestiary row shows its XP, never a second copy of the CR", async () => {
    await i18n.changeLanguage("it");
    const t = i18n.getFixedT("it");
    const ctx = { t, locale: "it" } as Parameters<
      NonNullable<typeof monsterSpec.verdict>
    >[1];
    expect(MONSTERS.length).toBeGreaterThan(100);
    for (const m of MONSTERS) {
      const label = monsterSpec.verdict?.(m, ctx)?.label;
      expect(label, m.id).toBe(`${fmtXp(monsterXp(m), "it")} PE`);
      expect(label, m.id).not.toContain(`GS ${formatCr(m.cr)}`);
    }
    await i18n.changeLanguage("en");
  });
});
