/**
 * Physical-roll entry for typed magic-item resources.
 *
 * The resource planner is roll-free: when a capacity, starting amount, recovery,
 * or last-charge consequence needs a die result, it emits `ResourceInputRequest`.
 * This one modal renders those requests for every consumer and returns only the
 * entered facts. Nothing has been committed while it is open.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { NumberStepper } from "@/components/ui/input";
import { ModalBody, ModalFoot } from "@/components/ui/modal-head";
import { ModalShell } from "@/components/shared/ModalShell";
import type { ResourceInputRequest } from "@/lib/resources";
import {
  enteredRollLabel,
  initialValue,
  inputLabelKey,
} from "@/lib/views/item-resource-view";

export interface ItemResourceInputRequest {
  sourceName: string;
  requests: readonly ResourceInputRequest[];
}

export interface ItemResourceInputModalProps {
  request: ItemResourceInputRequest | null;
  onConfirm: (answers: ReadonlyMap<ResourceInputRequest["kind"], number>) => void;
  onCancel: () => void;
}

function initialAnswers(
  request: ItemResourceInputRequest | null
): Map<ResourceInputRequest["kind"], number> {
  return new Map(
    request?.requests.map((input) => [input.kind, initialValue(input)] as const) ?? []
  );
}

export function ItemResourceInputModal({
  request,
  onConfirm,
  onCancel,
}: ItemResourceInputModalProps) {
  const { t } = useTranslation();
  const [answers, setAnswers] = useState<Map<ResourceInputRequest["kind"], number>>(() =>
    initialAnswers(request)
  );

  if (!request) return null;

  return (
    <ModalShell
      open
      compact
      size="sm"
      onClose={onCancel}
      rubric={t("magicItems.resourceInputRubric")}
      title={request.sourceName}
      subtitle={t("magicItems.resourceInputHint")}
    >
      <ModalBody className="flex flex-col gap-4">
        {request.requests.map((input) => {
          const roll = enteredRollLabel(input);
          const label = t(inputLabelKey(input), { roll });
          const value = answers.get(input.kind) ?? initialValue(input);
          return (
            <div
              key={input.kind}
              className="flex flex-wrap items-center justify-between gap-3"
            >
              <span className="min-w-0 flex-1 font-mono text-xs text-text-secondary">
                {label}
              </span>
              <NumberStepper
                value={value}
                onChange={(next) => {
                  setAnswers((current) => {
                    const updated = new Map(current);
                    updated.set(input.kind, next);
                    return updated;
                  });
                }}
                min={input.min}
                max={input.max}
                digits={String(input.max).length}
                ariaLabel={label}
                decrementLabel={t("common.decrease")}
                incrementLabel={t("common.increase")}
              />
            </div>
          );
        })}
      </ModalBody>
      <ModalFoot>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button size="sm" onClick={() => onConfirm(answers)}>
          {t("common.continue")}
        </Button>
      </ModalFoot>
    </ModalShell>
  );
}
