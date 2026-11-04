/**
 * The Play screen's «Incantesimi» tab (approved prototype x-play-spells): the casting
 * numbers (save DC, spell attack, how many are prepared), then the spells by level,
 * cantrips first, each level with its slots left. A spell is the same row as on the
 * actions list (`playActionsView`, spellbook scope: its numbers and its cast button);
 * the Spells model (`buildSpellsViewModel`) says whether it is prepared, so an
 * unprepared spell is shown but not cast.
 */
import { getSpellById } from "@/data/spells";
import { localizeSrd } from "@/i18n/resolver";
import { primaryClassId } from "@/lib/classes";
import { casterClassAbilities } from "@/lib/spell-owning-class";
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

export interface PrepareList {
  count: number;
  max: number;
  overLimit: boolean;
  levels: {
    level: number;
    spells: {
      idx: number;
      name: string;
      prepared: boolean;
      always: boolean;
      /** A spell two of the character's caster classes share: which one it comes
       *  through (2024 multiclassing, `viaClass`); `current` null is automatic. */
      via?: { options: { classId: string; label: string }[]; current: string | null };
    }[];
  }[];
}

/** «Gestisci incantesimi»: the levelled spells a prepared caster chooses among, by
 *  level, each with its place in the spell list (what `togglePrepared` flips), and how
 *  many are prepared against the most they may. Cantrips are always ready. */
export function prepareList(doc: CharacterDoc, locale: Locale): PrepareList {
  const model = buildSpellsViewModel(doc, primaryClassId(doc.character), locale, false);
  const cs = model.castSummary;
  const casters = casterClassAbilities(doc.character);
  return {
    count: cs?.preparedCount ?? 0,
    max: cs?.preparedMax ?? 0,
    overLimit: cs?.overLimit ?? false,
    levels: model.levels
      .filter((g) => g.level > 0)
      .map((g) => ({
        level: g.level,
        spells: g.spells.map((card) => {
          const via = viaChoice(doc, card.idx, casters, locale);
          return {
            idx: card.idx,
            name: card.name,
            prepared: card.isPrepared || card.isAlwaysPrepared,
            always: card.isAlwaysPrepared,
            ...(via ? { via } : {}),
          };
        }),
      }))
      .filter((g) => g.spells.length > 0),
  };
}

/** The classes a shared spell may come through, when two or more of the character's
 *  caster classes have it on their list. */
function viaChoice(
  doc: CharacterDoc,
  idx: number,
  casters: ReturnType<typeof casterClassAbilities>,
  locale: Locale
): { options: { classId: string; label: string }[]; current: string | null } | null {
  const ref = doc.character.spells[idx];
  if (!ref || "custom" in ref) return null;
  const spell = getSpellById(ref.srdId);
  if (!spell) return null;
  const options = casters
    .filter((c) => spell.classes.includes(c.spellListId))
    .map((c) => ({
      classId: c.classId,
      label: localizeSrd("class", c.classId, "name", locale),
    }));
  return options.length >= 2 ? { options, current: ref.viaClass ?? null } : null;
}
