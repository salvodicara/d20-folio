/**
 * Wizard F point buy — the round-6 illuminated abilities step. The budget card
 * leads with "POINTS REMAINING n / 27" in display type and flares gold when the
 * purse empties (the number IS the meter — the pip row was cut on the owner's
 * round-6 verdict). Each ability is a carved cartouche purchase tile: gilt mono
 * rubric, the shared `NumberStepper` (typing AND stepping, clamped so an
 * unaffordable or out-of-range value is UNREACHABLE — golden rule 20), and the
 * LIVE derived modifier as the tile's hero. Cost notes appear only where they
 * inform (the cap, a 2-point step, the one confusing "points remain but not for
 * THIS tile" case).
 *
 * C2 (owner 2026-06-11): the BACKGROUND ASI flows INTO the tiles reactively —
 * each tile STARTS FROM base+bonus (a +2 CHA background makes the CHA tile read
 * 12, not 10); the stepper edits the base underneath and a quiet gold note says
 * how much of the shown score is the background's. ONE source (base + boost) —
 * no dual state anywhere.
 *
 * B4 (owner correction): `WizardAsiCartouches` — the +2/+1+1 / bg-ASI ability
 * tiles — stays MINIMAL: code · score (→ effective when picked) · modifier,
 * gold-selected. Shared by the level-up boon and the creation bg-ASI step.
 */
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { NumberStepper } from "@/components/ui/input";
import { abilityLabel } from "@/lib/views/level-up-view";
import { abilityModifier } from "@/lib/compute";
import { asLocale } from "@/lib/locale";
import type { AbilityCode } from "@/data/types";
import {
  ABILITY_CODES,
  POINT_BUY_BUDGET,
  POINT_BUY_COST,
  pointBuyCost,
} from "@/features/creation/steps/steps";

function fmtMod(mod: number): string {
  return mod >= 0 ? `+${mod}` : `−${Math.abs(mod)}`;
}

export function WizardPointBuy({
  scores,
  boosts,
  onChange,
  manual = false,
}: {
  scores: Record<AbilityCode, number>;
  /** Background-ASI bonuses per ability — composed LIVE into each tile (C2). */
  boosts?: Partial<Record<AbilityCode, number>>;
  onChange: (next: Record<AbilityCode, number>) => void;
  /** MANUAL entry: same cartouches, free 1–30 steppers, no budget/cost chrome
   *  (owner 2026-06-11: one tile family across both entry methods). */
  manual?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const locale = asLocale(i18n.language);
  const spent = ABILITY_CODES.reduce((sum, code) => sum + pointBuyCost(scores[code]), 0);
  // Infinite when a score sits outside the 8–15 table (a Manual→Point-Buy
  // carry-over): the budget can't be reconciled, so the meter reads "—" rather
  // than a nonsensical "-Infinity", and the `pointsRemaining !== 0` gate keeps
  // Create blocked until the score is brought back into range.
  const remaining = POINT_BUY_BUDGET - spent;
  const remainingLabel = Number.isFinite(remaining) ? remaining : "—";
  const anyBoost = ABILITY_CODES.some((code) => (boosts?.[code] ?? 0) > 0);

  return (
    <section className="wiz-pb">
      {!manual && (
        <div className="wiz-budget" data-spent={remaining === 0 ? "" : undefined}>
          <div className="wiz-budget-text">
            <span className="wiz-budget-label">{t("wizard.pointsRemaining")}</span>
            <span className="wiz-budget-value tnum">
              {remainingLabel}
              <span className="wiz-budget-of"> / {POINT_BUY_BUDGET}</span>
            </span>
          </div>
          {remaining === 0 && (
            <span className="wiz-budget-done">
              <Icon as={Check} size="xs" decorative />
              {t("wizard.allSpent")}
            </span>
          )}
        </div>
      )}

      <div className="wiz-abils">
        {ABILITY_CODES.map((code) => {
          const v = scores[code];
          const boost = boosts?.[code] ?? 0;
          // C2 (owner 2026-06-11): the tile shows the EFFECTIVE score — the
          // background ASI chosen one step earlier is already in the number
          // ("CHA starts from 12, not 10"), live-reactively. The stepper edits
          // the BASE underneath (effective − boost); costs derive from base.
          const effective = v + boost;
          // The stepper's max is what the budget can still AFFORD from here:
          // invalid values are unreachable, not scolded after the fact.
          let max = v;
          while (
            max < 15 &&
            (POINT_BUY_COST[max + 1] ?? Infinity) - (POINT_BUY_COST[v] ?? 0) <= remaining
          ) {
            max += 1;
          }
          const mod = abilityModifier(effective);
          const nextCost =
            v >= 15
              ? null
              : (POINT_BUY_COST[v + 1] ?? Infinity) - (POINT_BUY_COST[v] ?? 0);
          return (
            <div key={code} className="wiz-abil" data-max={v === 15 ? "" : undefined}>
              <p className="wiz-abil-code">{abilityLabel(code, locale)}</p>
              <p className="wiz-abil-name">{t(`abilities.${code}`)}</p>
              <NumberStepper
                className="wiz-abil-stepper"
                value={effective}
                min={(manual ? 1 : 8) + boost}
                max={(manual ? 30 : max) + boost}
                onChange={(next) => onChange({ ...scores, [code]: next - boost })}
                ariaLabel={t(`abilities.${code}`)}
                decrementLabel={t("common.decrease")}
                incrementLabel={t("common.increase")}
              />
              {/* The composition stays legible: a quiet gold note says how much
                  of the shown score is the background's. Reserved (em-dash)
                  once ANY tile has a boost so the six tiles stay aligned. */}
              {anyBoost && (
                <p className="wiz-abil-boost tnum">
                  {boost > 0 ? t("wizard.bgBonus", { n: boost }) : "—"}
                </p>
              )}
              <p className="wiz-abil-mod tnum">
                {fmtMod(mod)}
                <span className="wiz-abil-modlbl"> {t("wizard.mod")}</span>
              </p>
              {/* Cost notes only where they inform; an empty purse needs no
                  six-fold echo — the meter already says it. Manual mode has no
                  economy to annotate. */}
              {!manual && (
                <p className="wiz-abil-cost tnum">
                  {v >= 15
                    ? t("wizard.atCap")
                    : nextCost != null && nextCost > remaining
                      ? remaining > 0
                        ? t("wizard.outOfPoints")
                        : " "
                      : nextCost === 2
                        ? t("wizard.nextCosts2")
                        : " "}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {!manual && !anyBoost && (
        <p className="wiz-asks-quiet wiz-center on-art">{t("wizard.bgAsiAfter")}</p>
      )}
    </section>
  );
}

/**
 * B4 — the MINIMAL ability tiles (owner 2026-06-11): code · score (with
 * "→ effective" stamped in gold once picked) · live modifier. A capped (20)
 * ability is unpickable — invalid states unreachable (golden rule 20). Shared
 * by the level-up ASI boon and the creation background-ASI picker.
 */
export function WizardAsiCartouches({
  abilityScores,
  bonusFor,
  isSelected,
  onPick,
  disabledFor,
  cap = 20,
}: {
  abilityScores: Record<AbilityCode, number>;
  /** The increase THIS tile would carry when selected (+2 or +1). */
  bonusFor: (code: AbilityCode) => number;
  isSelected: (code: AbilityCode) => boolean;
  onPick: (code: AbilityCode) => void;
  /** Extra unpickable condition (e.g. the bg-ASI picker is full). */
  disabledFor?: (code: AbilityCode) => boolean;
  /** Score ceiling — 20 for both the level-up boon and the creation bg-ASI
   *  step (a Manual base can already sit at 20, so the cap is load-bearing). */
  cap?: number;
}) {
  const { t, i18n } = useTranslation();
  const locale = asLocale(i18n.language);
  return (
    <div className="wiz-asi-tiles">
      {ABILITY_CODES.map((code) => {
        const current = abilityScores[code];
        const capped = current >= cap;
        const selected = isSelected(code);
        const b = selected ? bonusFor(code) : 0;
        const effective = Math.min(cap, current + b);
        const unpickable = capped || (!selected && (disabledFor?.(code) ?? false));
        return (
          <button
            key={code}
            type="button"
            className="wiz-asi-tile tnum"
            data-chosen={selected && !capped ? "" : undefined}
            disabled={unpickable}
            aria-pressed={selected}
            title={capped ? t("wizard.atCap") : undefined}
            onClick={() => onPick(code)}
          >
            <span className="wiz-asi-code">{abilityLabel(code, locale)}</span>
            <span className="wiz-asi-score">
              {current}
              {b > 0 && <span className="wiz-abil-eff"> → {effective}</span>}
            </span>
            <span className="wiz-asi-mod">{fmtMod(abilityModifier(effective))}</span>
          </button>
        );
      })}
    </div>
  );
}
