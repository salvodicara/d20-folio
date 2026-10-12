/**
 * MasteryRiders — the weapon's declarable Weapon-Mastery effects on a combat
 * attack card (Graze, Topple, Push, Sap, Slow, Vex, Cleave), one tappable row
 * each. It reuses the shared `.rider-strip` / `.rider-token` register the
 * on-hit riders and the Cunning Strike picker use, so the three read as
 * siblings. A tap declares the effect: it logs a rider-use line (and, for Vex,
 * lights the next-attack Advantage) with a 5 s undo — never automatic.
 *
 * The line is a sentence, not a chip ("Rovesciamento: TS COS CD 14 → Prono"),
 * so it renders in the wrapping `.rider-note` register instead of the
 * single-line `.uc-verdict` chip, and never truncates.
 */
import { useTranslation } from "react-i18next";
import { masteryRiderLine, type MasteryRiderVM } from "@/lib/views/mastery-rider-view";

export interface MasteryRidersProps {
  riders: ReadonlyArray<MasteryRiderVM>;
  /** Declare a mastery rider (log + undo toast). Combat surface only. */
  onApply: (rider: MasteryRiderVM) => void;
}

export function MasteryRiders({ riders, onApply }: MasteryRidersProps) {
  const { t } = useTranslation();
  if (riders.length === 0) return null;

  return (
    <div className="rider-strip" data-testid="mastery-riders">
      <span className="rider-strip-label">{t("weaponMastery.eyebrow")}</span>
      <div className="rider-tokens">
        {riders.map((rider) => {
          const line = masteryRiderLine(rider, t);
          return (
            <button
              key={rider.id}
              type="button"
              className="rider-token rider-token-spend"
              data-mastery={rider.id}
              onClick={(e) => {
                e.stopPropagation();
                onApply(rider);
              }}
              title={rider.description}
            >
              <span className="rider-note">{line}</span>
              <span className="rider-spend-cue" aria-hidden>
                {t("combat.apply")}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
