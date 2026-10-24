/**
 * What the cast dialog shows before a spell is cast (Play list row 18): every level
 * it can be cast at with what is left to pay there and what the spell does at that
 * level, the level picked by default, the turn it takes, and — for a Concentration
 * spell — how long it lasts and which spell it would end. Pure: it reads the same
 * cast routes the picker and the action rows read, and rolls nothing.
 */
import { getSpellById } from "@/data/spells";
import type { SpellDuration } from "@/data/types";
import {
  classifySpellCastingTime,
  type CastLevelOption,
  type SpellCastTiming,
} from "@/lib/cast-options";
import type { Locale } from "@/lib/locale";
import { scaleUpcastDice, spellInstanceCount } from "@/lib/utils";
import {
  resolveSpellCastOptions,
  type CastBadgeLabels,
} from "@/lib/views/spell-cast-sources";
import type { CharacterDoc } from "@/types/character";
import type { ConcentrationRef } from "@/types/ids";

export interface CastPreviewLevel {
  /** The route that pays for the cast (a slot, a free cast, an at-will source…). */
  option: CastLevelOption;
  level: number;
  /** Uses left on that route; Infinity for an at-will one (Spell Mastery, an invocation). */
  remaining: number;
  /** The damage dice at this level, when the spell rolls damage. */
  damageDice?: string;
  /** Darts, rays or targets at this level, when the spell counts them. */
  instances: number | null;
}

export interface CastPreview {
  levels: CastPreviewLevel[];
  /** The lowest level with something left to pay with; null when nothing is left. */
  defaultLevel: number | null;
  economy: SpellCastTiming;
  /** Null for a spell without Concentration. `ends` is the spell it would end. */
  concentration: { duration: SpellDuration; ends: ConcentrationRef | null } | null;
}

const NO_LABELS: CastBadgeLabels = { mastery: "", signature: "" };

export function castPreview(
  doc: CharacterDoc,
  spellId: string,
  locale: Locale = "en",
  labels: CastBadgeLabels = NO_LABELS
): CastPreview | null {
  const spell = getSpellById(spellId);
  const known = doc.character.spells.some((s) => !("custom" in s) && s.srdId === spellId);
  if (!spell || !known) return null;

  const levels = resolveSpellCastOptions(
    doc,
    spellId,
    spell.level,
    true,
    locale,
    labels
  ).map((option) => ({
    option,
    level: option.level,
    remaining: "remaining" in option ? option.remaining : Infinity,
    damageDice: scaleUpcastDice(spell, option.level),
    instances: spellInstanceCount(spell, option.level),
  }));

  const held = doc.session.concentration;
  return {
    levels,
    defaultLevel: levels.find((l) => l.remaining > 0)?.level ?? null,
    economy: classifySpellCastingTime(spell.castingTime),
    concentration: spell.concentration
      ? { duration: spell.duration, ends: held ? held : null }
      : null,
  };
}
