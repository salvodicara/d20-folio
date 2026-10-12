/**
 * SummonCountStepper — how many creatures a multi-creature summon fields (Animate
 * Dead, Animate Objects, Create Undead), with ±1 steppers. Same micro-stepper
 * recipe as {@link CompanionHpStepper}; omitting `onChange` renders the number
 * only (edit mode / readonly).
 */

import { Plus, Minus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { MAX_SUMMONED } from "@/lib/summon-count";

export interface SummonCountStepperProps {
  /** The creature's localized name — the ± buttons' accessible label. */
  label: string;
  count: number;
  onChange?: (next: number) => void;
}

export function SummonCountStepper({ label, count, onChange }: SummonCountStepperProps) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-[length:var(--text-micro)] uppercase tracking-wider text-text-tertiary">
        {t("features.countLabel")}
      </span>
      <span className="inline-flex items-center gap-1 text-[0.68rem] text-text-secondary">
        {onChange && (
          <IconButton
            onClick={() => onChange(count - 1)}
            disabled={count <= 1}
            className="companion-hp-step"
            aria-label={t("features.countFewer", { name: label })}
          >
            <Icon as={Minus} size="xs" decorative />
          </IconButton>
        )}
        <span className="min-w-[2ch] text-center font-mono font-semibold text-text-primary">
          {count}
        </span>
        {onChange && (
          <IconButton
            onClick={() => onChange(count + 1)}
            disabled={count >= MAX_SUMMONED}
            className="companion-hp-step"
            aria-label={t("features.countMore", { name: label })}
          >
            <Icon as={Plus} size="xs" decorative />
          </IconButton>
        )}
      </span>
    </span>
  );
}
