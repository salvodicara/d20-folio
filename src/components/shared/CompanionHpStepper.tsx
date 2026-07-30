/**
 * CompanionHpStepper — the ONE `cur / max` HP readout with its ±1 micro-steppers,
 * shared by every companion surface (golden rule 6): the rail's grant-companion
 * row, the familiar row, and the companion stat-block modal/card.
 *
 * Presentational only — `onChange` receives the NEXT current HP (the − step may go
 * below 0; the store clamps), and omitting it renders the read-only readout (edit
 * mode / a non-interactive card).
 */

import { Plus, Minus } from "lucide-react";
import { Icon } from "@/components/ui/icon";

export interface CompanionHpStepperProps {
  /** The companion's localized name — the ± buttons' accessible label. */
  label: string;
  current: number;
  max: number;
  /** Omit for a read-only readout (no steppers). */
  onChange?: (next: number) => void;
}

export function CompanionHpStepper({
  label,
  current,
  max,
  onChange,
}: CompanionHpStepperProps) {
  return (
    <span className="inline-flex items-center gap-1 text-[0.68rem] text-text-secondary">
      {onChange && (
        <button
          type="button"
          onClick={() => onChange(current - 1)}
          className="flex h-4 w-4 items-center justify-center rounded border border-border text-text-secondary hover:border-danger hover:text-danger"
          aria-label={`−1 HP ${label}`}
        >
          <Icon as={Minus} size="sm" decorative />
        </button>
      )}
      <span className="font-mono font-semibold text-text-primary">
        {current} / {max}
      </span>
      {onChange && (
        <button
          type="button"
          onClick={() => onChange(Math.min(max, current + 1))}
          className="flex h-4 w-4 items-center justify-center rounded border border-border text-text-secondary hover:border-success hover:text-success"
          aria-label={`+1 HP ${label}`}
        >
          <Icon as={Plus} size="sm" decorative />
        </button>
      )}
    </span>
  );
}
