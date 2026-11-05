/**
 * A use on another creature's roll (Cutting Words): «Su chi?» (in a fight, the same
 * medallion rows as the target step), «Su quale tiro?», and «Aggiungi / Sottrai»
 * when the use lets you choose; the line says the die to roll at the table and what
 * it does. «Usa la Reazione» spends the Reaction and the use, with the undo toast.
 * Copied from the BG3 reaction prompt (the reaction, its target and its effect in
 * one decision) and D&D Beyond's reaction card (the die by level on the card).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Portrait } from "@/components/shared/Portrait";
import type { ReactableRoll } from "@/data/types";
import {
  operationLabelKey,
  rollLabelKey,
  type RollReactionPlan,
} from "@/lib/play/roll-reactions";

import type { RollReactionView } from "./roll-reaction-view";

export function RollReactionDialog({
  name,
  view,
  onUse,
  onClose,
}: {
  name: string;
  view: RollReactionView;
  onUse: (plan: RollReactionPlan) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [target, setTarget] = useState<string | null>(
    view.targets.length === 1 ? (view.targets[0]?.id ?? null) : null
  );
  const [roll, setRoll] = useState<ReactableRoll | null>(
    view.rolls.length === 1 ? (view.rolls[0] ?? null) : null
  );
  const [operation, setOperation] = useState<"add" | "subtract">(
    view.operations[0] ?? "subtract"
  );
  const needsTarget = view.targets.length > 0;
  const ready = roll !== null && (!needsTarget || target !== null);
  const line = t(
    operation === "add" ? "play.rollReaction.doAdd" : "play.rollReaction.doSubtract",
    { die: view.die }
  );
  const use = () => {
    if (!roll) return;
    const picked = view.targets.find((c) => c.id === target);
    onUse({
      die: view.die,
      operation,
      roll,
      ...(picked ? { target: { id: picked.id, name: picked.name } } : {}),
    });
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        size="sm"
        rubric={t("combat.reaction")}
        title={t("play.rollReaction.title", { name })}
        description={line}
        closeLabel={t("common.cancel")}
      >
        <DialogBody>
          {needsTarget && (
            <section className="cl-group">
              <h3 className="cl-group-label">{t("campaignHub.encounterActionOnWhom")}</h3>
              <div className="cl-opts">
                {view.targets.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`cl-opt cl-slot cl-target${target === c.id ? " is-active" : ""}`}
                    data-side={c.side}
                    aria-pressed={target === c.id}
                    onClick={() => setTarget(c.id)}
                  >
                    <span className="cl-avatar" aria-hidden>
                      <Portrait
                        src={c.portraitUrl ?? null}
                        crop={c.portraitCrop ?? null}
                        name={c.name}
                        seed={c.id}
                      />
                    </span>
                    <span className="cl-name">{c.name}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
          <section className="cl-group">
            <h3 className="cl-group-label">{t("play.rollReaction.which")}</h3>
            <div className="cl-opts">
              {view.rolls.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`cl-opt cl-slot${roll === r ? " is-active" : ""}`}
                  aria-pressed={roll === r}
                  onClick={() => setRoll(r)}
                >
                  <span className="cl-name">{t(rollLabelKey(r))}</span>
                </button>
              ))}
            </div>
          </section>
          <p className="cl-higher">{line}</p>
          {view.operations.length > 1 && (
            <section className="cl-group">
              <div className="cl-opts">
                {view.operations.map((op) => (
                  <button
                    key={op}
                    type="button"
                    className={`cl-opt cl-slot${operation === op ? " is-active" : ""}`}
                    aria-pressed={operation === op}
                    onClick={() => setOperation(op)}
                  >
                    <span className="cl-name">{t(operationLabelKey(op))}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" block onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" block disabled={!ready} onClick={use}>
            {t("play.rollReaction.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
