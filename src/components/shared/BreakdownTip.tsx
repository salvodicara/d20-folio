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
 *
 * ## The WHY layer
 *
 * A receipt says WHAT sums; it never said WHY. When a rule silently changed the
 * outcome the engine now attaches a `why` (and, for a replaced die, a
 * `fromValue`) to that line — so the row shows the substitution (`1d4 → 1d6`)
 * and becomes a `.cause-toggle` disclosure: tapping it unfolds ONE plain-language
 * sentence beneath the row, accordion-style (one open at a time). A line with
 * nothing non-obvious to explain renders EXACTLY as it always has — no toggle,
 * no chevron (rule 19: only, and all, the necessary).
 */
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import type { BreakdownLine, BreakdownNote } from "@/lib/value-breakdown";
import { renderBreakdownLineLabel } from "@/components/shared/breakdown-line";
import { WhyProse } from "@/components/shared/BreakdownWhy";
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
  const baseId = useId();
  // Accordion: at most ONE explanation open at a time (tap again to close), so
  // the popover never grows into a wall of prose.
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const rubric = t(RUBRIC_KEY[flavor]);
  const renderNote = (note: BreakdownNote): ReactNode => (
    <span className="text-accent-text">
      {" "}
      · {t("whileActive" in note ? "combat.whileActiveNote" : note.term)}
    </span>
  );
  return (
    // Closing the popover RESETS the accordion: reopening it must show the
    // resting receipt, not whichever row happened to be open last time.
    <Popover
      onOpenChange={(o) => {
        if (!o) setOpenIndex(null);
      }}
    >
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
          {lines.map((line, i) => {
            const label = renderBreakdownLineLabel(line, t);
            const open = openIndex === i;
            const whyId = `${baseId}-why-${i}`;
            return (
              <div key={i} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-4 text-sm">
                  <span className="text-text-secondary">
                    {line.why ? (
                      <button
                        type="button"
                        className="cause-toggle"
                        aria-expanded={open}
                        // Only while OPEN: `aria-controls` pointing at an element
                        // that isn't in the DOM is an invalid attribute value (axe
                        // `aria-valid-attr-value`), and the a11y bar is zero.
                        aria-controls={open ? whyId : undefined}
                        onClick={() => setOpenIndex(open ? null : i)}
                      >
                        {label}
                        <Icon
                          as={ChevronRight}
                          size="xs"
                          decorative
                          className={cn("transition-transform", open && "rotate-90")}
                        />
                      </button>
                    ) : (
                      label
                    )}
                    {line.note && renderNote(line.note)}
                  </span>
                  <span className="font-mono font-semibold text-text-primary">
                    {/* A die a rule REPLACED shows muted before the effective one
                        (`1d4 → 1d6`) — the substitution becomes visible instead of
                        silently swallowing the weapon's printed die. */}
                    {line.fromValue ? (
                      <>
                        <span className="font-normal text-text-secondary opacity-65">
                          {line.fromValue}
                        </span>
                        <span className="px-1 font-normal text-text-muted">→</span>
                      </>
                    ) : null}
                    {line.value}
                  </span>
                </div>
                {/* `mt-1.5` clears the toggle's outward-padded hit area: without
                    it the open row's focus ring paints over the first prose line. */}
                {line.why && open ? (
                  <WhyProse id={whyId} why={line.why} className="mt-1.5" />
                ) : null}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
