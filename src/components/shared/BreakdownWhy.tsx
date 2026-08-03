/**
 * WhyProse — the ONE renderer for a resolved {@link BreakdownWhyLine} (golden
 * rule 3). A breakdown row explains WHAT sums; this renders WHY: the rule's NAME
 * as a gold lead-in, a colon, then one plain-language sentence.
 *
 * Both surfaces that carry the why layer render THIS — the {@link BreakdownTip}
 * accordion row and the on-hit rider popover — so a change to the register's
 * voice or typography lands in one place. The prose arrives half-resolved from
 * the presenter (`resolveWhy`): SRD names are already strings, the i18n `term` +
 * its params interpolate here because the presenter is i18next-free (§2.5).
 *
 * `translate="yes"` is deliberate: a breakdown popover sets `translate="no"` on
 * its formula rows (stat abbreviations + signed modifiers a machine translator
 * mangles), but this IS prose — it must stay machine-translatable.
 */
import { useTranslation } from "react-i18next";
import type { BreakdownWhyLine } from "@/lib/value-breakdown";
import { cn } from "@/lib/utils";

export function WhyProse({
  why,
  id,
  /** Drop the gold lead-in when the surrounding surface already names the rule
   *  (the rider popover's rubric IS the feature name — rule 19, never twice). */
  showRule = true,
  className,
}: {
  why: BreakdownWhyLine;
  id?: string;
  showRule?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const rule = showRule ? why.rule : undefined;
  return (
    <p
      id={id}
      translate="yes"
      className={cn(
        "max-w-[15.5rem] text-xs leading-[1.5] text-text-secondary",
        className
      )}
    >
      {rule ? <span className="text-accent-text">{rule}</span> : null}
      {/* A COLON, not an em dash: DESIGN §7 bans em dashes in UI copy, and the
          gold ink already carries the name/explanation break visually. */}
      {rule ? ": " : null}
      {t(why.term, why.params)}
    </p>
  );
}
