/**
 * «Passa il tempo» on the Play screen (approved prototype time-pass): the steps it
 * offers, and what a stretch would end, named, read from the engine's own preview
 * (`timePassEnds`, `timePassEndsConcentration`) before anything changes.
 */
import type { Locale } from "@/lib/locale";
import { timePassEnds, timePassEndsConcentration } from "@/lib/play/time";
import { deriveStatuses } from "@/lib/status";
import { concentrationLabel, grantSourceLabel } from "@/lib/views/tracker-view";
import type { CharacterDoc } from "@/types/character";

/** The prototype's steps, in minutes: 1 minute, 10 minutes, 1 hour, 8 hours. */
export const TIME_STEPS = [1, 10, 60, 480] as const;

export interface TimePassView {
  /** The states the stretch ends, by name. */
  ends: string[];
  /** The spell whose Concentration it ends (and what that holds), or null. */
  concentration: string | null;
}

export function timePassView(
  doc: CharacterDoc,
  minutes: number,
  locale: Locale
): TimePassView {
  const ended = timePassEnds(doc, minutes);
  const names = deriveStatuses(doc)
    .filter((s) => ended.has(s.key))
    .map((s) => grantSourceLabel(s.source, locale));
  return {
    ends: [...new Set(names)],
    concentration: timePassEndsConcentration(doc, minutes)
      ? concentrationLabel(doc.session.concentration, locale)
      : null,
  };
}
