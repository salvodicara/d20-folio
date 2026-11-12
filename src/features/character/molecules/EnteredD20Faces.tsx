/** Physical d20 entry shared by every baseline D20 Test surface. */

import { useTranslation } from "react-i18next";

import { NumberStepper } from "@/components/ui/input";
import { useLocale } from "@/hooks/useLocale";
import { grantSourceLabel } from "@/lib/views/tracker-view";

import type { ForetoldFace } from "./use-foretold-face";

interface EnteredD20FacesProps {
  faceCount: 1 | 2;
  first: number;
  second: number;
  onFirstChange: (face: number) => void;
  onSecondChange: (face: number) => void;
  singleAriaLabel: string;
  firstAriaLabel: string;
  secondAriaLabel: string;
  decrementLabel: string;
  incrementLabel: string;
  /** Recorded d20s (Portent) offered as the roll, one d20 only. */
  foretold?: ForetoldFace;
}

/** The recorded d20s as chips: a tap puts the face in the d20 and picks that roll. */
export function ForetoldChips({
  foretold,
  onFace,
}: {
  foretold: ForetoldFace;
  onFace: (face: number) => void;
}) {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  if (foretold.recorded.length === 0) return null;
  return (
    <div className="fchip-group" role="group" aria-label={t("play.down.foretold")}>
      {foretold.recorded.map((r) => (
        <button
          key={`${r.trackerId}:${String(r.index)}`}
          type="button"
          className="fchip fchip-sm"
          aria-pressed={
            foretold.picked?.trackerId === r.trackerId &&
            foretold.picked.index === r.index
          }
          onClick={(e) => {
            e.stopPropagation();
            onFace(r.face);
            foretold.choose(r);
          }}
        >
          {`${grantSourceLabel(r.trackerId, locale)} ${String(r.face)}`}
        </button>
      ))}
    </div>
  );
}

/**
 * The app never rolls. This control records exactly the physical faces required
 * by the kernel's net mode: one normally/cancelled, two for pure Advantage or
 * Disadvantage. Selection remains an engine fact, not a UI calculation.
 */
export function EnteredD20Faces({
  faceCount,
  first,
  second,
  onFirstChange,
  onSecondChange,
  singleAriaLabel,
  firstAriaLabel,
  secondAriaLabel,
  decrementLabel,
  incrementLabel,
  foretold,
}: EnteredD20FacesProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <NumberStepper
        value={first}
        onChange={(face) => {
          onFirstChange(face);
          foretold?.drop();
        }}
        min={1}
        max={20}
        digits={2}
        compact
        ariaLabel={faceCount === 1 ? singleAriaLabel : firstAriaLabel}
        decrementLabel={decrementLabel}
        incrementLabel={incrementLabel}
      />
      {faceCount === 2 && (
        <NumberStepper
          value={second}
          onChange={onSecondChange}
          min={1}
          max={20}
          digits={2}
          compact
          ariaLabel={secondAriaLabel}
          decrementLabel={decrementLabel}
          incrementLabel={incrementLabel}
        />
      )}
      {faceCount === 1 && foretold && (
        <ForetoldChips foretold={foretold} onFace={onFirstChange} />
      )}
    </div>
  );
}
