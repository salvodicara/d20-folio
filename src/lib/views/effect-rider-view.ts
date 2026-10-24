/**
 * The generic riders (push or pull, Speed loss, Hit Point maximum drain, swallow)
 * as display lines: the card facts of an action that carries them, and the line a
 * combat log or session report writes when one lands. One recipe for all three, so
 * the card, the log and the report say the same words. Distances stay feet in the
 * data and read in the reader's units here (`localeDistance`: IT metres).
 *
 * Pure: the translator is injected (the log and report pass theirs; the card goes
 * through `localizeText`), the locale only picks the units.
 */
import { riderNotes, type RiderEffect } from "@/lib/activities";
import type { UiTextParams } from "@/lib/loc-text";
import type { Locale } from "@/lib/locale";
import { localeDistance } from "@/lib/utils";
import type { DamageType } from "@/types/damage";
import { localizeText } from "@/lib/views/srd-i18n";

/** One render-ready rider line; `damageType` is the chip the line shows beside it. */
export interface EffectRiderLine {
  /** Stable within the action: `${kind}:${index}`. */
  id: string;
  text: string;
  damageType?: DamageType;
}

/** A translator with the i18next `t` shape (the log's and the report's). */
export type RiderTranslate = (
  key: string,
  params?: Record<string, string | number>
) => string;

/** The lines one rider shows, in order, through the given translator. */
export function riderEffectLines(
  effect: RiderEffect,
  translate: RiderTranslate,
  locale: Locale
): EffectRiderLine[] {
  return riderNotes(effect).flatMap((note, index) => {
    // Every rider note is a ui-catalogue line (`combat.effectRider.*`).
    if (!("ui" in note.text)) return [];
    const text: { ui: string; params?: UiTextParams } = note.text;
    const params: Record<string, string | number> = {
      ...(text.params ?? {}),
      ...(note.distanceFt !== undefined
        ? { distance: localeDistance(note.distanceFt, locale) }
        : {}),
    };
    return [
      {
        id: `${effect.kind}:${index}`,
        text: translate(text.ui, params),
        ...(note.damageType ? { damageType: note.damageType } : {}),
      },
    ];
  });
}

/** Every rider's lines for an action card, in the viewer's language. */
export function actionRiderLines(
  effects: ReadonlyArray<RiderEffect>,
  locale: Locale
): EffectRiderLine[] {
  const translate: RiderTranslate = (ui, params) => localizeText({ ui, params }, locale);
  return effects.flatMap((effect, at) =>
    riderEffectLines(effect, translate, locale).map((line) => ({
      ...line,
      id: `${at}:${line.id}`,
    }))
  );
}

/** One rider as a single log or report clause: its lines joined. */
export function riderEffectClause(
  effect: RiderEffect,
  translate: RiderTranslate,
  locale: Locale
): string {
  return riderEffectLines(effect, translate, locale)
    .map((line) => line.text)
    .join(" · ");
}
