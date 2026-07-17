/**
 * BreakdownTip — the universal "where does this number come from?" popover.
 *
 * SUPERSEDES `DamageBreakdownTip` (issue #27 dogfood: "hovering damage breaks
 * down where every bonus comes from"). The owner asked (2026-06-13) to do the
 * SAME for AC "and any other value that varies based on several components", so
 * this ONE component now renders EVERY value breakdown — AC, initiative, spell
 * save DC / attack, passive scores, AND weapon damage / heal — off the single
 * {@link BreakdownLine} register (golden rule 3). Nothing about the premium
 * visual changed: it reuses the GlossaryTip popover VERBATIM (quiet dotted-gold
 * trigger, branded folio popover, click/tap-to-open so phones work).
 *
 * The lines arrive PRE-RESOLVED from the ONE presenter (`localizeBreakdown` and
 * its `localizeDamageBreakdown` / `localizeHealBreakdown` aliases). The only
 * `t(...)` here resolves APP strings the i18next-free presenter could not: a
 * `term` label's i18n key, the `ability` short name, and a part's `note`.
 */
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import type { BreakdownLine, BreakdownNote } from "@/lib/value-breakdown";
import { renderBreakdownLineLabel } from "@/components/shared/breakdown-line";
import { cn } from "@/lib/utils";

export interface BreakdownTipProps {
  /** The visible label the trigger wraps (the value text, or a verdict chip). */
  label: ReactNode;
  /** Pre-resolved breakdown lines (from `localizeBreakdown` & its aliases). */
  lines: ReadonlyArray<BreakdownLine>;
  /**
   * Which rubric heads the popover. `"damage"` / `"heal"` keep the combat
   * register; `"value"` (default) is the generic stat rubric ("Breakdown" /
   * "Scomposizione"). ONE component for every register (golden rule 3); only the
   * heading word differs.
   */
  flavor?: "value" | "damage" | "heal";
  /** Verdict-chip outcome colour key — forwarded as `data-o` (combat chips). */
  outcome?: string;
  className?: string;
}

const RUBRIC_KEY: Record<NonNullable<BreakdownTipProps["flavor"]>, string> = {
  damage: "combat.damageBreakdown",
  heal: "combat.healBreakdown",
  value: "breakdown.rubric",
};

export function BreakdownTip({
  label,
  lines,
  flavor = "value",
  outcome,
  className,
}: BreakdownTipProps) {
  const { t } = useTranslation();
  const rubric = t(RUBRIC_KEY[flavor]);
  const renderNote = (note: BreakdownNote): ReactNode => (
    <span className="text-accent-text">
      {" "}
      · {t("whileActive" in note ? "combat.whileActiveNote" : note.term)}
    </span>
  );
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn("glossary-term", className)}
          data-o={outcome}
          aria-label={rubric}
        >
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent
        rubric={rubric}
        side="top"
        align="center"
        collisionPadding={12}
        className="glossary-pop"
        aria-label={rubric}
      >
        {/* translate="no": the breakdown IS a formula decomposition ("+3 STR ·
            +2 Shield") — stat abbreviations and signed modifiers a machine
            translator would mangle. Translation stays allowed app-wide. */}
        <div className="flex min-w-36 flex-col gap-1" translate="no">
          {lines.map((line, i) => (
            <div key={i} className="flex items-baseline justify-between gap-4 text-sm">
              <span className="text-text-secondary">
                {renderBreakdownLineLabel(line, t)}
                {line.note && renderNote(line.note)}
              </span>
              <span className="font-mono font-semibold text-text-primary">
                {line.value}
              </span>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
