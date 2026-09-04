/**
 * The target block — under the strip, and ONLY while a creature is selected (UI spec rule 30):
 * name, type and challenge rating, the health bar, the condition chips.
 *
 * The number inside the bar is shown only where the viewer may read it: `mapView` already
 * decided that (`hp === null` means "bar only"), so this component never re-decides it. CR and
 * AC carry their explain triggers — an abbreviation nobody explained is a defect on this screen.
 */
import { useTranslation } from "react-i18next";
import { PlayExplain } from "./PlayTip";
import { PlayIcon } from "./PlayIcon";

export interface TargetView {
  readonly name: string;
  /** Localized creature type ("Giant", "Humanoid"), when the table knows it. */
  readonly type: string | null;
  /** Challenge rating as it prints ("2", "1/4"), when the table knows it. */
  readonly cr: string | null;
  readonly ac: number | null;
  readonly hp: number | null;
  readonly maxHp: number;
  readonly hpRatio: number;
  readonly conditions: readonly { readonly id: string; readonly label: string }[];
}

export interface TargetBlockProps {
  readonly target: TargetView | null;
}

export function TargetBlock({ target }: TargetBlockProps) {
  const { t } = useTranslation();
  if (!target) return null;
  return (
    <section className="pl-float pl-target" data-testid="pl-target">
      <div className="pl-target__name">
        {target.name}
        <small>
          {target.type ? <>{target.type}</> : null}
          {target.cr === null ? null : (
            <>
              {target.type ? " · " : null}
              <PlayExplain
                term={t("play.explain.cr.abbr")}
                label={t("play.explain.cr.label")}
                hint={t("play.explain.cr.hint")}
              />{" "}
              {target.cr}
            </>
          )}
          {target.ac === null ? null : (
            <>
              {" · "}
              <PlayExplain
                term={t("play.explain.ac.abbr")}
                label={t("play.explain.ac.label")}
                hint={t("play.explain.ac.hint")}
              />{" "}
              {target.ac}
            </>
          )}
        </small>
      </div>
      <div
        className="pl-target__bar"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={target.maxHp}
        aria-valuenow={target.hp ?? undefined}
        aria-label={t("play.target.hpAria", { name: target.name })}
      >
        <i style={{ width: `${Math.round(target.hpRatio * 100)}%` }} />
        <b>
          {target.hp === null
            ? t("play.target.hpHidden")
            : `${target.hp} / ${target.maxHp}`}
        </b>
      </div>
      {target.conditions.length > 0 ? (
        <div className="pl-chips">
          {target.conditions.map((condition) => (
            <span key={condition.id} className="pl-chip">
              <i>
                <PlayIcon id="i-circle-alert" />
              </i>
              {condition.label}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}
