/**
 * Pool Spend Modal
 *
 * A compact dialog that appears when the player uses an action backed by an
 * isPool tracker (e.g. Lay on Hands, Wholeness of Body). Asks "How many X are you
 * spending?" with a default of 1 and confirms.
 *
 * On the folio system: it reuses the shared `ModalShell` (Radix-backed — focus
 * trap, ESC/outside-click dismissal, accessible name) at the `sm`/`compact` tier,
 * the carved `NumberStepper` for the amount, and `.btn primary`/`ghost` actions —
 * no bespoke scrim, flat `bg-accent` fill, or un-trapped card.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TrackerUnit } from "@/data/types";
import { localizeTrackerUnit } from "@/lib/views/tracker-view";
import { ModalShell } from "@/components/shared/ModalShell";
import { NumberStepper } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface PoolSpendRequest {
  /** Display name of the feature (e.g. "Lay on Hands") */
  featureName: string;
  /** Stable pool unit TOKEN (e.g. "hp", "points") — localized at the render boundary. */
  unit: TrackerUnit;
  /** Maximum spendable amount (remaining uses) */
  max: number;
  /** Default amount to pre-fill */
  defaultAmount?: number;
}

export interface PoolSpendModalProps {
  request: PoolSpendRequest | null;
  /** Called with the chosen spend amount, or null if cancelled. */
  onConfirm: (amount: number) => void;
  onCancel: () => void;
}

export function PoolSpendModal({ request, onConfirm, onCancel }: PoolSpendModalProps) {
  const { t } = useTranslation();
  // Initialize with defaultAmount; the component is mounted fresh on each new
  // request (the consumers render it only while a request exists), so this state
  // resets per request.
  const [amount, setAmount] = useState(request?.defaultAmount ?? 1);

  if (!request) return null;

  // Localize the stable unit TOKEN to its display string ONCE, before it is
  // interpolated into the combat copy (golden rule 7 — the modal never
  // renders the raw "hp"/"points" token).
  const unit = localizeTrackerUnit(request.unit, t);

  return (
    <ModalShell
      open
      compact
      size="sm"
      onClose={onCancel}
      rubric={t("common.use")}
      title={request.featureName}
      subtitle={t("combat.poolSpendRemaining", {
        remaining: request.max,
        unit,
      })}
    >
      <div className="confirm-body items-center">
        <NumberStepper
          value={amount}
          onChange={setAmount}
          min={1}
          max={request.max}
          ariaLabel={t("combat.poolSpendLabel", { unit })}
          decrementLabel={t("common.decrease")}
          incrementLabel={t("common.increase")}
        />
        <p className="m-0 text-center font-mono text-xs text-text-secondary">
          {t("combat.poolSpendLabel", { unit })}
        </p>
        <div className="confirm-actions w-full">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button size="sm" onClick={() => onConfirm(amount)}>
            {t("combat.poolSpendConfirm")}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}
