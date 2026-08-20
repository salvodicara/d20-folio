/** Physical d20 entry shared by every baseline D20 Test surface. */

import { NumberStepper } from "@/components/ui/input";

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
}: EnteredD20FacesProps) {
  return (
    <div className="flex items-center gap-1.5">
      <NumberStepper
        value={first}
        onChange={onFirstChange}
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
    </div>
  );
}
