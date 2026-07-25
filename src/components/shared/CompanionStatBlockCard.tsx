/**
 * CompanionStatBlockCard — the shared, presentational stat block for a
 * feature-declared companion (Artificer Steel Defender / Eldritch Cannon, Beast
 * Master Primal Companion, pack spell-companions). Promoted verbatim from the
 * Features-tab `.uc-callout` so ONE component serves both mounts (golden rule 6):
 * the Features-tab feature card AND the Companions rail's stat-block modal.
 *
 * It reads a fully-localized {@link CompanionCardView} (the R2 presenter already
 * resolved AC/HP/attacks + localized every string), so this component makes ZERO
 * catalogue reads. NEW here: the Beast Master Land/Sea/Sky variant `Segmented`
 * (play-time, quiet status register — Constitution §2.8) bound to
 * `session.companionVariant` via `onVariantChange`; a variant switch resets the HP
 * pool in the store (a different beast = a different pool).
 *
 * The familiar's stat block is a DIFFERENT contract (a printed-verbatim monster
 * form) rendered by `MonsterStatBlockCard`; the two never share a code path.
 */

import { useTranslation } from "react-i18next";
import { Plus, Minus } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { Segmented } from "@/components/ui/segmented";
import { useLocale } from "@/hooks/useLocale";
import { formatModifier, localeDistance } from "@/lib/utils";
import type { CompanionCardView } from "@/lib/views/companion-row-view";

export interface CompanionStatBlockCardProps {
  view: CompanionCardView;
  /**
   * Play mode: the HP steppers + the variant Segmented are interactive. Edit /
   * readonly render the values only (the RightHud already goes inert for readonly).
   */
  interactive: boolean;
  /** Set the companion's current HP (clamped 0..max by the store). */
  onHpChange?: (featureId: string, current: number) => void;
  /** Pick a variant (Beast Master); the store resets the HP pool + toasts undo. */
  onVariantChange?: (featureId: string, variantId: string) => void;
}

export function CompanionStatBlockCard({
  view,
  interactive,
  onHpChange,
  onVariantChange,
}: CompanionStatBlockCardProps) {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const cur = view.current ?? view.hpMax;

  return (
    <div className="uc-callout">
      <div className="flex items-baseline justify-between">
        <span className="font-semibold text-text-primary">{view.label}</span>
        {view.kind && (
          <span className="text-[length:var(--text-micro)] italic text-text-secondary">
            {view.kind}
          </span>
        )}
      </div>

      {/* Variant chooser (Beast Master: Beast of the Land / Sea / Sky) — play-time,
          quiet status register; switching resets the HP pool (store + undo toast). */}
      {view.variants && view.variants.length > 1 && view.selectedVariantId && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[length:var(--text-micro)] uppercase tracking-wider text-text-tertiary">
            {t("features.variantLabel")}
          </span>
          {interactive && onVariantChange ? (
            <Segmented
              aria-label={t("features.variantLabel")}
              value={view.selectedVariantId}
              onChange={(variantId) => onVariantChange(view.featureId, variantId)}
              options={view.variants.map((o) => ({ value: o.variantId, label: o.label }))}
            />
          ) : (
            <span className="text-[0.68rem] text-text-secondary">
              {view.variants.find((o) => o.variantId === view.selectedVariantId)?.label}
            </span>
          )}
        </div>
      )}

      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.68rem] text-text-secondary">
        <span>
          {t("stats.ac")}{" "}
          <span className="font-mono font-semibold text-text-primary">{view.ac}</span>
        </span>
        {view.speed && (
          <span>
            {t("stats.spd")}{" "}
            <span className="font-mono font-semibold text-text-primary">
              {view.speed}
            </span>
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          {t("character.hp")}
          {interactive && onHpChange && (
            <button
              type="button"
              onClick={() => onHpChange(view.featureId, cur - 1)}
              className="flex h-4 w-4 items-center justify-center rounded border border-border text-text-secondary hover:border-danger hover:text-danger"
              aria-label={`−1 HP ${view.label}`}
            >
              <Icon as={Minus} size="sm" decorative />
            </button>
          )}
          <span className="font-mono font-semibold text-text-primary">
            {cur} / {view.hpMax}
          </span>
          {interactive && onHpChange && (
            <button
              type="button"
              onClick={() => onHpChange(view.featureId, Math.min(view.hpMax, cur + 1))}
              className="flex h-4 w-4 items-center justify-center rounded border border-border text-text-secondary hover:border-success hover:text-success"
              aria-label={`+1 HP ${view.label}`}
            >
              <Icon as={Plus} size="sm" decorative />
            </button>
          )}
        </span>
      </div>

      {view.attacks.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-border/60 pt-2">
          {view.attacks.map((atk) => (
            <li key={atk.id} className="text-[0.68rem] leading-snug">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-semibold text-text-primary">{atk.name}</span>
                <span className="font-mono text-text-secondary">
                  {formatModifier(atk.attackBonus)} {t("srd.toHit")}
                </span>
                <span className="text-text-tertiary">·</span>
                <span className="font-mono text-text-secondary">{atk.damage}</span>
                <span className="text-text-tertiary">·</span>
                <span className="text-text-secondary">
                  {atk.ranged ? t("spells.range") : t("srd.reach")}{" "}
                  <span className="font-mono">{localeDistance(atk.reachFt, locale)}</span>
                </span>
              </div>
              {atk.rider && <p className="text-text-tertiary">{atk.rider}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
