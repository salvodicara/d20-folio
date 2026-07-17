/**
 * ArcaneRecoveryModal — the guided one-flow picker for the Wizard's Arcane
 * Recovery (L1): "When you finish a Short Rest, choose expended spell slots to
 * recover with a combined level ≤ ⌈wizard level / 2⌉, none above 5th. 1/Long Rest."
 *
 * S4 — closes the wizard Tier-1 row: BEFORE this, the player tapped the 1/LR
 * action and then HAND-EDITED the slot pools, self-enforcing the cap. This picker
 * enforces the ⌈level/2⌉ cap by construction (a stepper per expended slot level,
 * capped so the running total can never exceed the budget), restores the chosen
 * slots, and debits the use — one flow, undoable.
 *
 * Reuses the shared `ModalShell` (focus trap / ESC / accessible name) + the
 * carved `NumberStepper`, never a bespoke component (golden rule 3). Pure cap
 * math lives in `lib/arcane-recovery.ts`; this is presentation + commit only.
 */

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { arcaneRecoveryCap, ARCANE_RECOVERY_MAX_SLOT_LEVEL } from "@/lib/arcane-recovery";
import { ModalShell } from "@/components/shared/ModalShell";
import { NumberStepper } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface ArcaneRecoveryRequest {
  /** The wizard's class level (drives the ⌈level/2⌉ cap). */
  wizardLevel: number;
  /** Expended slots eligible to recover: `{ level, expended }`, level ≤ 5. */
  expended: ReadonlyArray<{ level: number; expended: number }>;
}

export interface ArcaneRecoveryModalProps {
  request: ArcaneRecoveryRequest | null;
  /** Confirm: the flattened slot-levels chosen (e.g. [2, 1] = one 2nd + one 1st). */
  onConfirm: (slotLevels: number[]) => void;
  onCancel: () => void;
}

export function ArcaneRecoveryModal({
  request,
  onConfirm,
  onCancel,
}: ArcaneRecoveryModalProps) {
  const { t } = useTranslation();
  // One restore-count per eligible slot level (keyed by level), starting at 0.
  const [counts, setCounts] = useState<Record<number, number>>({});

  const cap = request ? arcaneRecoveryCap(request.wizardLevel) : 0;
  // Eligible levels: expended AND ≤ the RAW max (5th). Sorted ascending.
  const rows = useMemo(
    () =>
      (request?.expended ?? [])
        .filter((e) => e.expended > 0 && e.level <= ARCANE_RECOVERY_MAX_SLOT_LEVEL)
        .sort((a, b) => a.level - b.level),
    [request]
  );

  const usedLevels = rows.reduce((sum, r) => sum + r.level * (counts[r.level] ?? 0), 0);
  const remainingBudget = cap - usedLevels;
  const chosenAny = usedLevels > 0;

  if (!request) return null;

  /** Max count selectable at a level: bounded by expended AND the remaining budget. */
  function maxAt(level: number, expended: number): number {
    const current = counts[level] ?? 0;
    // How many MORE of this level fit in the remaining budget, plus the current.
    const fitsInBudget = Math.floor(remainingBudget / level) + current;
    return Math.max(current, Math.min(expended, fitsInBudget));
  }

  function setCount(level: number, value: number): void {
    setCounts((prev) => ({ ...prev, [level]: value }));
  }

  function confirm(): void {
    const slotLevels: number[] = [];
    for (const r of rows) {
      for (let i = 0; i < (counts[r.level] ?? 0); i++) slotLevels.push(r.level);
    }
    onConfirm(slotLevels);
  }

  return (
    <ModalShell
      open
      compact
      size="sm"
      onClose={onCancel}
      rubric={t("character.spellSlots")}
      title={t("combat.arcaneRecoveryTitle")}
      subtitle={t("combat.arcaneRecoveryBudget", {
        remaining: remainingBudget,
        cap,
      })}
    >
      <div className="confirm-body">
        {rows.length === 0 ? (
          <p className="m-0 text-center text-sm text-text-secondary">
            {t("combat.arcaneRecoveryNothing")}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {rows.map((r) => (
              <div key={r.level} className="flex items-center justify-between gap-3">
                <span className="text-sm text-text-primary">
                  {t("combat.arcaneRecoverySlotLevel", { level: r.level })}
                  <span className="ml-1 text-xs text-text-secondary">
                    {t("combat.arcaneRecoveryExpended", { count: r.expended })}
                  </span>
                </span>
                <NumberStepper
                  value={counts[r.level] ?? 0}
                  onChange={(v) => setCount(r.level, v)}
                  min={0}
                  max={maxAt(r.level, r.expended)}
                  ariaLabel={t("combat.arcaneRecoverySlotLevel", { level: r.level })}
                  decrementLabel={t("common.decrease")}
                  incrementLabel={t("common.increase")}
                />
              </div>
            ))}
          </div>
        )}

        <div className="confirm-actions w-full">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button size="sm" disabled={!chosenAny} onClick={confirm}>
            {t("combat.arcaneRecoveryConfirm")}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}
