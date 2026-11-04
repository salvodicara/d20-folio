/**
 * «Passa il tempo» on the Play screen (approved prototype time-pass): the steps it
 * offers, and what a stretch would end, named, read from the engine's own preview
 * (`timePassEnds`, `timePassEndsConcentration`) before anything changes.
 */
import { localizeSrd } from "@/i18n/resolver";
import type { Locale } from "@/lib/locale";
import {
  advanceTimeOfDay,
  crossedBoundaries,
  timePassEnds,
  timePassEndsConcentration,
} from "@/lib/play/time";
import {
  tableClockRecoveries,
  type TableClockBoundary,
} from "@/lib/views/item-resource-boundary-view";
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
  /** From and to on the clock ("22:00", "06:00"), when a time of day is known. */
  span: { from: string; to: string } | null;
  /** What dawn or dusk brings back, when the stretch crosses one. */
  recoveries: Array<{
    kind: TableClockBoundary;
    item: string;
    unit: string;
    /** "1d6+1", "3", or null for all of it. */
    amount: string | null;
  }>;
}

/** "22:00" for 1320 minutes since midnight. */
export function clockText(minutes: number): string {
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** Minutes since midnight from "22:00" / "7:05", or null. */
export function parseClockText(text: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  return hh < 24 && mm < 60 ? hh * 60 + mm : null;
}

export function timePassView(
  doc: CharacterDoc,
  minutes: number,
  locale: Locale,
  /** The time of day the table says it is now, if it differs from the clock's. */
  timeOfDay: number | undefined = doc.session.timeOfDay
): TimePassView {
  const ended = timePassEnds(doc, minutes);
  const names = deriveStatuses(doc)
    .filter((s) => ended.has(s.key))
    .map((s) => grantSourceLabel(s.source, locale));
  const to = advanceTimeOfDay(timeOfDay, minutes);
  return {
    ends: [...new Set(names)],
    concentration: timePassEndsConcentration(doc, minutes)
      ? concentrationLabel(doc.session.concentration, locale)
      : null,
    span:
      timeOfDay !== undefined && to !== undefined
        ? { from: clockText(timeOfDay), to: clockText(to) }
        : null,
    recoveries: crossedBoundaries(timeOfDay, minutes).flatMap((kind) =>
      tableClockRecoveries(doc, kind).map((r) => ({
        kind,
        item: localizeSrd("magic-item", r.itemId, "name", locale),
        unit: r.unit,
        amount: r.amount,
      }))
    ),
  };
}
