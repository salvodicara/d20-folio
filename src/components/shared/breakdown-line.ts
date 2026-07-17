/**
 * Shared label resolver for a localized {@link BreakdownLine} (golden rule 3 —
 * one helper, every breakdown surface). A line's visible LABEL is one of three
 * kinds; only `ability` + `term` carry an APP i18n key the i18next-free presenter
 * left structured, so they resolve here via the caller's `t`. The `loc` kind was
 * already resolved to a string by the presenter and passes straight through.
 *
 * Both surfaces that render breakdown lines — the {@link BreakdownTip} popover and
 * the {@link StatCard} carved base — call THIS, so a change to how a label is
 * resolved (a renamed ability key, a new kind) lands in one place.
 */
import type { TFunction } from "i18next";
import type { BreakdownLine } from "@/lib/value-breakdown";

export function renderBreakdownLineLabel(line: BreakdownLine, t: TFunction): string {
  switch (line.kind) {
    case "ability":
      return t(`abilities.${line.ability}_short`);
    case "term":
      return t(line.term);
    case "loc":
      return line.label;
  }
}
