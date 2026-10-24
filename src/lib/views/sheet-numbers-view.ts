/**
 * {@link sheetNumbers} for the tip: the same totals, each part list as localized
 * display lines. The numbers themselves are ./sheet-numbers (locale-free).
 */
import type { Locale } from "@/lib/locale";
import type { BreakdownLine, RawBreakdownPart } from "@/lib/value-breakdown";
import { localizeBreakdown } from "@/lib/views/combat-action-view";
import type { CharacterDoc } from "@/types/character";
import { sheetNumbers, type Explained, type SheetNumbers } from "./sheet-numbers";

export { sheetNumbers, type Explained, type SheetNumbers } from "./sheet-numbers";

/** {@link sheetNumbers} with each part list as localized display lines. */
export function sheetNumbersView(
  doc: CharacterDoc,
  locale: Locale
): SheetNumbers<BreakdownLine> {
  const n = sheetNumbers(doc);
  const lines = <T extends Explained<RawBreakdownPart>>(
    value: T
  ): Omit<T, "parts"> & Explained<BreakdownLine> => ({
    ...value,
    parts: value.parts ? localizeBreakdown(value.parts, locale) : null,
  });
  return {
    ac: lines(n.ac),
    initiative: lines(n.initiative),
    speed: lines(n.speed),
    proficiencyBonus: lines(n.proficiencyBonus),
    maxHp: lines(n.maxHp),
    saves: n.saves.map(lines),
    skills: n.skills.map(lines),
    passives: {
      perception: lines(n.passives.perception),
      investigation: lines(n.passives.investigation),
      insight: lines(n.passives.insight),
    },
  };
}
