/**
 * The Play screen's «Incantesimi» tab (approved prototype x-play-spells): the casting
 * numbers (save DC, spell attack, how many are prepared), then the spells by level,
 * cantrips first, each level with its slots left. A spell is the same row as on the
 * actions list (`playActionsView`, spellbook scope: its numbers and its cast button);
 * the Spells model (`buildSpellsViewModel`) says whether it is prepared, so an
 * unprepared spell is shown but not cast.
 */
import { primaryClassId } from "@/lib/classes";
import type { Locale } from "@/lib/locale";
import { buildSpellsViewModel } from "@/lib/views/spells-view";
import type { CharacterDoc } from "@/types/character";
import { FRESH_TURN, playActionsView, type PlayActionRow } from "./play-actions-view";
import type { ActionTurnState } from "@/lib/views/action-cta-view";

export interface PlaySpell {
  row: PlayActionRow;
  /** Prepared, always prepared, or a cantrip: it casts. */
  prepared: boolean;
  /** It can be cast as a Ritual without a slot. */
  ritual: boolean;
}

export interface PlaySpellsView {
  summary: {
    saveDc: number | null;
    attack: number | null;
    prepared: { count: number; max: number } | null;
  } | null;
  groups: {
    level: number;
    slots: { left: number; total: number } | null;
    spells: PlaySpell[];
  }[];
}

export function playSpellsView(
  doc: CharacterDoc,
  locale: Locale,
  turn: ActionTurnState = FRESH_TURN
): PlaySpellsView {
  const model = buildSpellsViewModel(doc, primaryClassId(doc.character), locale, false);
  const cards = new Map(
    model.levels.flatMap((g) => g.spells).map((card) => [card.data?.id ?? card.key, card])
  );
  const rows = playActionsView(doc, locale, turn, "spellbook")
    .groups.flatMap((g) => g.rows)
    .filter((row) => row.spellId !== undefined && row.level !== null);
  const levels = [...new Set(rows.map((r) => r.level ?? 0))].sort((a, b) => a - b);
  const cs = model.castSummary;
  return {
    summary: cs
      ? {
          saveDc: cs.saveDC,
          attack: cs.attackBonus,
          prepared: cs.isPreparedCaster
            ? { count: cs.preparedCount, max: cs.preparedMax }
            : null,
        }
      : null,
    groups: levels.map((level) => {
      const slot = model.slots.find((s) => s.level === level && !s.pactMagic);
      return {
        level,
        slots: slot && level > 0 ? { left: slot.remaining, total: slot.total } : null,
        spells: rows
          .filter((r) => (r.level ?? 0) === level)
          .map((row) => {
            const card = cards.get(row.spellId ?? "");
            return {
              row,
              prepared: level === 0 || !card || card.isPrepared || card.isAlwaysPrepared,
              ritual: card?.canRitual ?? false,
            };
          }),
      };
    }),
  };
}
