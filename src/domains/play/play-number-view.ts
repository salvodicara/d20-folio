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
import { OVERRIDE_TERM, type BreakdownLine } from "@/lib/value-breakdown";
import { sheetNumbersView, type Explained } from "@/lib/views/sheet-numbers-view";
import type { CharacterDoc } from "@/types/character";

export type { SheetNumberKey };

export interface PlayNumberView {
  total: number;
  /** Where the total comes from; null when the engine has nothing to add up. */
  parts: BreakdownLine[] | null;
  /** The hand-set value (feet for speed), or null when the number is computed. */
  stored: number | null;
  /**
   * What «Use the computed value» brings back, when the hand-set value is a FIXED
   * value that replaces the computed one (every number but max HP). Its parts are then
   * the computed ones alone: a fixed value is not a correction, so no «Manual
   * adjustment» row. Null when nothing is fixed, and for max HP, which IS stored as a
   * correction (#1315) and keeps that row.
   */
  computed: number | null;
}

const isOverrideLine = (l: BreakdownLine) =>
  l.kind === "term" && l.term === OVERRIDE_TERM;
const lineNumber = (l: BreakdownLine) => Number(l.value.replace("−", "-"));

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
      case "maxHp":
        return n.maxHp;
      case "ability":
        return n.abilities[key.ability];
      case "save":
        return n.saves.find((s) => s.ability === key.ability);
      case "skill":
        return n.skills.find((s) => s.id === key.id);
      case "passive":
        return n.passives[key.id];
    }
  };
  const value = pick();
  const total = value?.total ?? 0;
  const parts = value?.parts ?? null;
  const stored = storedOverride(doc.character, key);
  const override = parts?.find(isOverrideLine);
  if (stored === null || key.kind === "maxHp" || !override)
    return { total, parts, stored, computed: null };
  const adjust = lineNumber(override);
  return {
    total,
    parts: parts?.filter((l) => !isOverrideLine(l)) ?? null,
    stored,
    computed: Number.isFinite(adjust) ? total - adjust : null,
  };
}

/** Each passive score's label key («Percezione Passiva»). */
export const PASSIVE_LABEL = {
  perception: "abilities.passivePerceptionLabel",
  insight: "abilities.passiveInsightLabel",
  investigation: "abilities.passiveInvestigationLabel",
} as const;
