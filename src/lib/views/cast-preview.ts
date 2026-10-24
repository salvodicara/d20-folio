/**
 * What the cast dialog shows before a spell is cast (Play list row 18): every level
 * it can be cast at (a spent slot level too, greyed) with what is left to pay there and what the spell does at that
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
import { isSpellcastingBlocked } from "@/lib/smart-tracker";
import {
  canCastSpellWithSlots,
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
  /** False for a spent slot level, which the dialog shows greyed. */
  available: boolean;
  /** The damage dice at this level, when the spell rolls damage. */
  damageDice?: string;
  /** The healing dice at this level, when the spell heals. */
  healDice?: string;
  /** Separate darts or rays at this level (Magic Missile), when the spell counts them. */
  instances: number | null;
  /** How many creatures it can target at this level (Bless 3/4/5), when capped. */
  targets: number | null;
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

  const routes = resolveSpellCastOptions(doc, spellId, spell.level, true, locale, labels);
  // The routes leave a spent slot level out; the dialog shows it greyed ("none"), so
  // players see why they can't upcast there.
  const spent: CastLevelOption[] =
    isSpellcastingBlocked(doc) || !canCastSpellWithSlots(doc, spellId)
      ? []
      : doc.character.spellSlots
          .filter((slot) => slot.level >= spell.level)
          .filter(
            (slot) =>
              !routes.some(
                (r) =>
                  (r.kind === undefined || r.kind === "slot") &&
                  r.level === slot.level &&
                  (r.pactMagic === true) === (slot.pactMagic === true)
              )
          )
          .map((slot) => ({
            kind: "slot",
            level: slot.level,
            remaining: 0,
            total: slot.total,
            pactMagic: slot.pactMagic === true,
          }));
  const steps = (level: number) => Math.max(0, level - spell.level);
  const levels = [...routes, ...spent]
    .map((option) => {
      const remaining = "remaining" in option ? option.remaining : Infinity;
      return {
        option,
        level: option.level,
        remaining,
        available: remaining > 0,
        damageDice: scaleUpcastDice(spell, option.level),
        healDice: spell.healDice
          ? scaleUpcastDice(
              {
                level: spell.level,
                damageDice: spell.healDice,
                damageDicePerUpcast: spell.healDicePerUpcast,
              },
              option.level
            )
          : undefined,
        instances: spellInstanceCount(spell, option.level),
        targets:
          spell.targeting?.maxTargets !== undefined
            ? spell.targeting.maxTargets +
              (spell.targeting.maxTargetsPerUpcast ?? 0) * steps(option.level)
            : null,
      };
    })
    .sort((a, b) => a.level - b.level);

  const held = doc.session.concentration;
  return {
    levels,
    defaultLevel: levels.find((l) => l.available)?.level ?? null,
    economy: classifySpellCastingTime(spell.castingTime),
    concentration: spell.concentration
      ? { duration: spell.duration, ends: held ? held : null }
      : null,
  };
}
