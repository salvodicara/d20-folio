/**
 * One sheet number as its pane shows it (#1230, gap map E2 «every number explained»):
 * the total the tile shows, where it comes from (a localized line each), and the
 * hand-set value stored for it, if any. Read from `sheetNumbersView`, the one source
 * the header and the skill list read too, so the pane's total is the tile's number by
 * construction. Pure: no React, no store.
 */
import type { SheetNumberKey } from "@/features/character/number-overrides";
import { storedOverride } from "@/features/character/number-overrides";
import type { Locale } from "@/lib/locale";
import type { BreakdownLine } from "@/lib/value-breakdown";
import { sheetNumbersView, type Explained } from "@/lib/views/sheet-numbers-view";
import type { CharacterDoc } from "@/types/character";

export type { SheetNumberKey };

export interface PlayNumberView {
  total: number;
  /** Where the total comes from; null when the engine has nothing to add up. */
  parts: BreakdownLine[] | null;
  /** The hand-set value (feet for speed), or null when the number is computed. */
  stored: number | null;
}

export function playNumberView(
  doc: CharacterDoc,
  locale: Locale,
  key: SheetNumberKey
): PlayNumberView {
  const n = sheetNumbersView(doc, locale);
  const pick = (): Explained<BreakdownLine> | undefined => {
    switch (key.kind) {
      case "ac":
        return n.ac;
      case "initiative":
        return n.initiative;
      case "speed":
        return n.speed;
      case "proficiency":
        return n.proficiencyBonus;
      case "ability":
        return n.abilities[key.ability];
      case "save":
        return n.saves.find((s) => s.ability === key.ability);
      case "skill":
        return n.skills.find((s) => s.id === key.id);
    }
  };
  const value = pick();
  return {
    total: value?.total ?? 0,
    parts: value?.parts ?? null,
    stored: storedOverride(doc.character, key),
  };
}
