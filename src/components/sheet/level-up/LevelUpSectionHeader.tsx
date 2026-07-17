/**
 * Folio section header for the level-up wizard — the shared `<SectionHeader>`
 * rubric (gold diamond ◆ + display-italic deep-gold title + fading gold rule),
 * with the leading step icon wrapped in the `.lvl-step-glyph` gold-tinted seal
 * unique to the wizard. A thin adapter over the canonical atom so the markup
 * lives in ONE place; every level-up step (the orchestrator + the `level-up/`
 * subcomponents) imports THIS one header (golden rule 3).
 */

import type { ReactNode } from "react";
import { SectionHeader as SectionHeaderBase } from "@/components/shared/SectionHeader";

export function SectionHeader({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <SectionHeaderBase
      tight
      title={label}
      icon={
        <span className="lvl-step-glyph" aria-hidden>
          {icon}
        </span>
      }
    />
  );
}
