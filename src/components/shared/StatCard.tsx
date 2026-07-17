/**
 * StatCard — the ability medallion (folio §27 "Carved Cartouche").
 *
 * An engraved hero modifier sits over a carved gem score; a save line shows the
 * saving-throw bonus at rest (proficient = gold + bonus, otherwise the quiet
 * "Save" label). The carved base slides open on hover/tap (or when controlled
 * `open`) to disclose the saving-throw math — progressive disclosure, no math
 * shouted by default. Casters get a highlighted face + a small caster rubric.
 *
 * Override-first: this is a pure presentation molecule. The caller passes the
 * already-computed `modifier`/`score`/`saveBonus` (each helper takes its own
 * `override?`), so an overridden value flows straight through and the math line
 * can name the override as the source.
 *
 * Honest blanks: the caster rubric only renders for the spellcasting ability;
 * the save line shows the rest-state bonus only when proficient (otherwise the
 * neutral label). Nothing renders a "+0 proficiency" or empty state.
 */

import { useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { MagicMark } from "@/components/ui/folio-marks";
import type { BreakdownLine } from "@/lib/value-breakdown";
import { renderBreakdownLineLabel } from "@/components/shared/breakdown-line";
import { cn } from "@/lib/utils";

/** Format a signed modifier as the folio convention (−1, +0, +3). */
function formatModifier(mod: number): string {
  return mod >= 0 ? `+${mod}` : `−${Math.abs(mod)}`;
}

export interface StatCardProps {
  /** Short ability label, e.g. "STR" / "FOR" (bilingual copy injected by caller). */
  label: string;
  /** Ability modifier (already computed, override applied upstream). */
  modifier: number;
  /** Ability score (already computed, override applied upstream). */
  score: number;
  /** Saving-throw bonus at rest (modifier + PB when proficient). */
  saveBonus: number;
  /** Whether the character is proficient in this save. */
  saveProficient: boolean;
  /** Highlight as the spellcasting ability (caster face + rubric). */
  caster?: boolean;
  /** Caster rubric copy, e.g. "Spellcasting" (bilingual copy injected by caller). */
  casterLabel?: ReactNode;
  /** "Save" label copy when not proficient (bilingual). Default "Save". */
  saveLabel?: ReactNode;
  /** Carved-base disclosure head, e.g. "Saving Throw" (bilingual). */
  baseHead?: ReactNode;
  /** Proficiency bonus used in the math line (for the "+N PB" term). */
  proficiencyBonus?: number;
  /**
   * The save's per-source composition (from `localizeBreakdown`). When present
   * with ≥2 parts, the carved base renders these labelled lines (mod · PB ·
   * Aura · exhaustion) — the SAME register every value breakdown rides (golden
   * rule 3). Empty / single-part falls back to the terse "+7 = +3 mod +4 PB"
   * math line, so a hand-overridden save still discloses something sensible.
   */
  saveBreakdown?: ReadonlyArray<BreakdownLine>;
  /** Proficient / not-proficient state copy for the carved base (bilingual). */
  proficientStateLabel?: ReactNode;
  notProficientStateLabel?: ReactNode;
  /**
   * B1 — an active condition (Paralyzed / Stunned / Petrified / Unconscious)
   * auto-fails this ability's saving throws. Purely informational (override-first:
   * the condition is player-toggled in the rail; removing it clears the mark) — it
   * does NOT alter the engine-computed `saveBonus` the medallion shows.
   */
  autoFail?: boolean;
  /** Crimson "auto-fail" chip copy (bilingual copy injected). */
  autoFailLabel?: ReactNode;
  /** Title/tooltip naming the gating condition, e.g. "STR saves auto-fail (Stunned)". */
  autoFailTitle?: string;
  /** Controlled open state for the carved base. Omit for hover/tap-only. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Accessible label for the medallion button (bilingual copy injected). */
  ariaLabel?: string;
  className?: string;
}

export function StatCard({
  label,
  modifier,
  score,
  saveBonus,
  saveProficient,
  caster,
  casterLabel,
  saveLabel = "Save",
  baseHead = "Saving Throw",
  proficiencyBonus,
  saveBreakdown,
  proficientStateLabel = "proficient",
  notProficientStateLabel = "not proficient",
  autoFail,
  autoFailLabel,
  autoFailTitle,
  open: openProp,
  onOpenChange,
  ariaLabel,
  className,
}: StatCardProps) {
  const { t } = useTranslation();
  const baseId = useId();
  const [openState, setOpenState] = useState(false);
  const isControlled = openProp !== undefined;
  const isOpen = isControlled ? openProp : openState;

  function toggle() {
    // D1 — on a hover+fine pointer (desktop mouse) the carved base is revealed
    // by :hover / :focus-visible in CSS, so a mouse CLICK must be a no-op for
    // disclosure (it used to latch the base open). On coarse/touch pointers a
    // tap toggles. Controlled consumers always get the change (they own state).
    const hoverFine =
      typeof window !== "undefined" &&
      window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (hoverFine && !isControlled) return;
    const next = !isOpen;
    if (!isControlled) setOpenState(next);
    onOpenChange?.(next);
  }

  // Saving-throw math line: "+7 = +3 mod +4 PB" or "−1 = −1 mod".
  const mathTerms = [`${formatModifier(modifier)} mod`];
  if (saveProficient && proficiencyBonus != null) {
    mathTerms.push(`+${proficiencyBonus} PB`);
  }

  return (
    <button
      type="button"
      className={cn("statcard", caster && "caster", isOpen && "open", className)}
      data-autofail={autoFail ? "" : undefined}
      aria-expanded={isOpen}
      aria-controls={baseId}
      aria-label={ariaLabel}
      onClick={toggle}
    >
      <span className="statcard-face">
        {/* Caster eyebrow sits ABOVE the ability label in its own row (was
            colliding with the label when rendered between label and modifier). */}
        {caster && casterLabel != null && (
          <span className="sc-caster-rubric">
            <MagicMark />
            {casterLabel}
          </span>
        )}
        {/* translate="no" on the ability abbreviation + the math line ONLY:
            machine-translating "STR"/"FOR" or "+3 mod +4 PB" destroys their
            meaning. The prose copy (caster rubric, base head/state) stays
            translatable — translation is allowed app-wide. */}
        <span className="sc-label" translate="no">
          {label}
        </span>
        {/* D48 — the modifier (hero) + the carved score gem share ONE row, so the
            card reads as a fat, squat DDB/BG3-style stat block instead of a tall
            slim strip (the score is no longer a separate stacked row). */}
        <span className="sc-modrow">
          <span className="sc-mod">{formatModifier(modifier)}</span>
          <span className="sc-gem">{score}</span>
        </span>
        <span className="sc-saveline">
          <span
            className="pr-dot"
            data-state={saveProficient ? "prof" : "none"}
            aria-hidden
          />
          {saveProficient ? (
            <span className="sc-save-rest on">{formatModifier(saveBonus)}</span>
          ) : (
            <span className="sc-save-rest">{saveLabel}</span>
          )}
          {/* B1 — a condition (Paralyzed / Stunned / …) auto-fails this save:
              a crimson informational chip beside the bonus. The number still
              reads (the player owns whether the gate applies). */}
          {autoFail && autoFailLabel != null && (
            <span className="sc-autofail" title={autoFailTitle}>
              {autoFailLabel}
            </span>
          )}
        </span>
      </span>
      <span className="sc-base" id={baseId}>
        <span className="sc-base-inner">
          <span className="sc-base-head">{baseHead}</span>
          {saveBreakdown && saveBreakdown.length > 1 ? (
            // The per-source composition (mod · PB · Aura · exhaustion), the SAME
            // register every value breakdown rides. The `ability`/`term` lines
            // resolve their APP-string labels here (the presenter is i18n-free).
            <span className="sc-base-math sc-base-lines" translate="no">
              {saveBreakdown.map((line, i) => (
                <span key={i} className="sc-base-line">
                  <span className="sc-base-line-lbl">
                    {renderBreakdownLineLabel(line, t)}
                  </span>
                  <span className="sc-base-line-val">{line.value}</span>
                </span>
              ))}
            </span>
          ) : (
            <span className="sc-base-math" translate="no">
              <strong>{formatModifier(saveBonus)}</strong> = {mathTerms.join(" ")}
            </span>
          )}
          <span className="sc-base-state">
            {saveProficient ? proficientStateLabel : notProficientStateLabel}
          </span>
        </span>
      </span>
    </button>
  );
}
