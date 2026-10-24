/**
 * What a tap on a spell leads to, decided before anything is paid: cast straight
 * away (the only way to pay, a cantrip, a ritual), ask the player (a choice of
 * levels or Metamagic), say nothing is left to pay with, or nothing at all (not a
 * configurable spell). Pure: the caller shows the picker or commits the option.
 */
import {
  buildCastOptions,
  type CastLevelOption,
  type MetamagicCastOption,
} from "@/lib/cast-options";
import type { Locale } from "@/lib/locale";
import { TURN_EXECUTION, type ActionExecution } from "@/lib/play/cast-execution";
import type { CastCommitOption } from "@/lib/play/cast-payment";
import type { ResolvedAction } from "@/lib/smart-tracker";
import {
  resolveMetamagicForCast,
  resolveSpellCastOptions,
  type CastBadgeLabels,
} from "@/lib/views/spell-cast-sources";
import type { CharacterDoc } from "@/types/character";

export type CastPlan =
  | { kind: "none" }
  | { kind: "no-slots" }
  | { kind: "commit"; option: CastCommitOption }
  | {
      kind: "pick";
      baseLevel: number;
      options: CastLevelOption[];
      metamagic: MetamagicCastOption[];
    };

const NO_LABELS: CastBadgeLabels = { mastery: "", signature: "" };

export function castPlan(
  doc: CharacterDoc,
  action: ResolvedAction,
  execution: ActionExecution = TURN_EXECUTION,
  locale: Locale = "en",
  labels: CastBadgeLabels = NO_LABELS
): CastPlan {
  if (action.summary.recurringUse || action.source !== "spell") return { kind: "none" };

  const isCantrip = (action.spellLevel ?? 0) === 0;
  const baseLevel = action.slotLevel ?? action.spellLevel ?? 1;
  if (execution.ritual)
    return { kind: "commit", option: { kind: "ritual", level: baseLevel } };

  const options = isCantrip
    ? []
    : action.spellId
      ? resolveSpellCastOptions(doc, action.spellId, baseLevel, true, locale, labels)
      : buildCastOptions(doc.character.spellSlots, doc.session.spellSlots, baseLevel);
  if (!isCantrip && options.length === 0) return { kind: "no-slots" };

  const metamagic = action.spellId ? resolveMetamagicForCast(doc, action.spellId) : [];
  if (metamagic.length === 0) {
    if (isCantrip) return { kind: "commit", option: { kind: "cantrip", level: 0 } };
    if (options.length === 1 && options[0]) return { kind: "commit", option: options[0] };
  }
  return { kind: "pick", baseLevel, options, metamagic };
}
