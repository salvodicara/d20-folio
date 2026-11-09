/**
 * The Concentration save a hit asks for, on the Play screen (the classic
 * ConcentrationSaveBanner's flow, in the new language): the oldest pending save says
 * which spell and the DC, with how many more wait; «Tira il dado» asks the d20 the
 * player rolled at the table (both d20s when the sheet rolls it with Advantage or
 * Disadvantage), plus what they add after the roll (`usePostRollEntry`). Applied through
 * the sheet's one path (`commitPendingConcentrationSave`), with its undo.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useLocale } from "@/hooks/useLocale";
import { useSheetReadonly } from "@/hooks/useSheetReadonly";
import {
  concentrationSaveD20Context,
  enteredD20FaceCount,
} from "@/lib/character-d20-tests";
import { concentrationLabel } from "@/lib/views/concentration-label";
import { useCharacterStore } from "@/stores/characterStore";
import { registerUndoableResult } from "@/stores/undoStore";
import type { CharacterDoc } from "@/types/character";
import type { PendingConcentrationSave } from "@/types/combat-state";
import { Button, Dialog } from "@/ui";
import { usePostRollEntry, type PostRollCommit } from "./PostRollEntry";

export function PlayConcentrationSave({ doc }: { doc: CharacterDoc }) {
  const pending = useCharacterStore((s) => s.combatPendingConcentrationSaves[0]);
  const queued = useCharacterStore((s) => s.combatPendingConcentrationSaves.length);
  if (!pending) return null;
  return <Prompt key={pending.id} doc={doc} pending={pending} queued={queued} />;
}

function Prompt({
  doc,
  pending,
  queued,
}: {
  doc: CharacterDoc;
  pending: PendingConcentrationSave;
  queued: number;
}) {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const readonly = useSheetReadonly();
  const [rolling, setRolling] = useState(false);
  const context = useMemo(
    () => concentrationSaveD20Context(doc, pending),
    [doc, pending]
  );
  const sheetFaces = enteredD20FaceCount(context) === 2 ? 2 : 1;
  const mode =
    context.advantageSourceIds.length > 0 && context.disadvantageSourceIds.length === 0
      ? "advantage"
      : context.disadvantageSourceIds.length > 0 &&
          context.advantageSourceIds.length === 0
        ? "disadvantage"
        : null;
  const roll = usePostRollEntry(doc, sheetFaces, { face: t("play.down.face") });
  const spell = concentrationLabel(pending.spell, locale);
  const close = () => {
    roll.reset();
    setRolling(false);
  };
  const apply = (entry: PostRollCommit) => {
    const committed = useCharacterStore
      .getState()
      .commitPendingConcentrationSave(
        pending,
        entry.faces,
        undefined,
        entry.use,
        entry.spend
      );
    if (!committed) return;
    const message = t(
      committed.result.reviewedOutcome.status === "success"
        ? "combat.concentrationSaveSuccessToast"
        : "combat.concentrationSaveFailureToast",
      { total: committed.result.total }
    );
    registerUndoableResult({ message }, committed.undo, () => apply(entry));
  };
  return (
    <div className="f-note f-save-due" data-c="conc" role="group" aria-label={spell}>
      <p>
        {t("combat.concentrationSavePrompt", { spell, dc: pending.difficultyClass })}
        {queued > 1 && ` · ${t("combat.concentrationSaveQueue", { count: queued })}`}
      </p>
      {!readonly && (
        <div className="f-acts">
          <Button kind="primary" aria-haspopup="dialog" onClick={() => setRolling(true)}>
            {t("play.down.roll")}
          </Button>
        </div>
      )}
      {rolling && (
        <Dialog
          open
          onClose={close}
          color="res"
          title={t("combat.concentrationSavePrompt", {
            spell,
            dc: pending.difficultyClass,
          })}
          closeLabel={t("common.close")}
          actions={
            <>
              <Button kind="ghost" onClick={close}>
                {t("common.cancel")}
              </Button>
              <Button
                kind="primary"
                disabled={!roll.valid}
                onClick={() => {
                  apply(roll.entry());
                  close();
                }}
              >
                {t("common.confirm")}
              </Button>
            </>
          }
        >
          {mode && <p className="f-quiet">{t(`combat.rollMode.${mode}`)}</p>}
          {roll.fields}
        </Dialog>
      )}
    </div>
  );
}
