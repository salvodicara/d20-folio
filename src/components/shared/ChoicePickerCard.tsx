/**
 * ChoicePickerCard — the shared shell for level-up / creation choice pickers.
 *
 * Six byte-identical `.info-card.flush` choice-picker cards had drifted apart
 * across the level-up and creation wizards (ASI, feat, subclass, spell, skill,
 * fighting-style pickers). This collapses them to one primitive: an optional
 * `.field-label` rubric over the picker body.
 *
 * Usage:
 *   <ChoicePickerCard label="Choose a Fighting Style">
 *     …picker controls…
 *   </ChoicePickerCard>
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { InfoCard } from "@/components/shared/InfoCard";

export interface ChoicePickerCardProps {
  /** Optional rubric label rendered above the picker body. */
  label?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function ChoicePickerCard({ label, children, className }: ChoicePickerCardProps) {
  return (
    <InfoCard flush className={cn("choice-picker-card", className)}>
      {label && <div className="field-label">{label}</div>}
      {children}
    </InfoCard>
  );
}
