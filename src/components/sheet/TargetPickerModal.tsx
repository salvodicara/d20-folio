/**
 * Target Picker Modal — the optional "On whom?" step (owner 2026-10-09).
 *
 * Opens after an action is chosen (and after its slot, when it has one) and before it
 * commits. Same `.cl-opts` / `.cl-opt` rows as {@link CastLevelModal}, grouped into
 * allies and enemies. One target: a tap commits. Several: tick up to `max`, then
 * confirm. "Skip" always commits without a target; closing cancels (nothing spent).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogBody, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type {
  TargetCandidate,
  TargetStep,
} from "@/features/character/center/target-step";

export interface TargetPickerModalProps {
  request: { actionName: string; isSpell: boolean; step: TargetStep } | null;
  onConfirm: (targetIds: string[]) => void;
  onCancel: () => void;
}

export function TargetPickerModal({
  request,
  onConfirm,
  onCancel,
}: TargetPickerModalProps) {
  return (
    <Dialog
      open={request != null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      {request && (
        <TargetPickerContent
          request={request}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      )}
    </Dialog>
  );
}

function TargetPickerContent({
  request,
  onConfirm,
}: TargetPickerModalProps & { request: NonNullable<TargetPickerModalProps["request"]> }) {
  const { t } = useTranslation();
  const { step } = request;
  const many = step.max > 1;
  const [picked, setPicked] = useState<string[]>([]);
  const hint = many
    ? t("combat.targetStepHintMany", { count: step.max })
    : t("combat.targetStepHintOne");

  const toggle = (id: string) =>
    setPicked((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : current.length < step.max
          ? [...current, id]
          : current
    );

  const row = (candidate: TargetCandidate) => {
    const on = picked.includes(candidate.id);
    const name = candidate.self
      ? t("combat.targetMe", { name: candidate.name })
      : candidate.name;
    return (
      <button
        key={candidate.id}
        type="button"
        className={`cl-opt cl-slot cl-target${on ? " is-active" : ""}`}
        data-side={candidate.side}
        aria-pressed={many ? on : undefined}
        disabled={many && !on && picked.length >= step.max}
        onClick={() => (many ? toggle(candidate.id) : onConfirm([candidate.id]))}
      >
        <span className="cl-seal" aria-hidden>
          {candidate.name.charAt(0).toUpperCase()}
        </span>
        <span className="cl-name">{name}</span>
        {many && <span className="cl-check" aria-hidden />}
      </button>
    );
  };

  const groups = (["ally", "enemy"] as const)
    .map((side) => ({ side, rows: step.candidates.filter((c) => c.side === side) }))
    .filter((group) => group.rows.length > 0);
  if (step.candidates[0]?.side === "enemy") groups.reverse();

  return (
    <DialogContent
      size="sm"
      rubric={hint}
      title={t("combat.targetStepTitle", { name: request.actionName })}
      description={hint}
      closeLabel={t("common.cancel")}
    >
      <DialogBody>
        {groups.map((group) => (
          <section key={group.side} className="cl-group">
            <h3 className="cl-group-label">
              {t(group.side === "ally" ? "combat.targetAllies" : "combat.targetEnemies")}
            </h3>
            <div className="cl-opts">{group.rows.map(row)}</div>
          </section>
        ))}
      </DialogBody>

      <DialogFooter>
        {many ? (
          <>
            <Button variant="secondary" block onClick={() => onConfirm([])}>
              {t("common.skip")}
            </Button>
            <Button
              variant="primary"
              block
              disabled={picked.length === 0}
              onClick={() => onConfirm(picked)}
            >
              {t(
                request.isSpell ? "combat.targetConfirmCast" : "combat.targetConfirmUse",
                {
                  count: picked.length,
                }
              )}
            </Button>
          </>
        ) : (
          <Button variant="secondary" block onClick={() => onConfirm([])}>
            {t("combat.targetSkipNone")}
          </Button>
        )}
      </DialogFooter>
    </DialogContent>
  );
}
