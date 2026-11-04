/**
 * At 0 Hit Points on the Play screen (approved prototype x-play-down): the death saves
 * as pips and «Tira il dado», the d20 the player rolled at the table, applied through
 * the sheet's one death-save path (`useHpControls`: a 20 rises with 1 HP, a 1 counts
 * two failures, undoable). Once Stable, how long, and that after 1d4 hours it regains
 * 1 Hit Point (the table rolls the hours).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { playDownView } from "@/domains/play/play-down-view";
import { useHpControls } from "@/features/character/molecules/use-hp-controls";
import { useSheetReadonly } from "@/hooks/useSheetReadonly";
import type { CharacterDoc } from "@/types/character";
import { Button, Dialog, Field } from "@/ui";

export function PlayDown({ doc }: { doc: CharacterDoc }) {
  const { t } = useTranslation();
  const readonly = useSheetReadonly();
  const { applyDeathSave } = useHpControls();
  const [rolling, setRolling] = useState(false);
  const [typed, setTyped] = useState("");
  const down = playDownView(doc);
  if (!down) return null;
  const face = Number(typed);
  const valid = /^\d{1,2}$/.test(typed.trim()) && face >= 1 && face <= 20;
  const pips = (n: number, kind: "succ" | "fail") => (
    <span className="f-pips" data-kind={kind} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <i key={i} data-on={i < n || undefined} />
      ))}
    </span>
  );
  return (
    <div className="f-down" role="group" aria-label={t("play.down.title")}>
      <p className="f-help">
        {down.stable
          ? down.stableMinutes !== null
            ? t("play.down.stableFor", { minutes: down.stableMinutes })
            : t("play.down.stable")
          : t("play.down.title")}
      </p>
      <div className="f-down-row">
        <span className="f-lbl">{t("deathSaves.successes")}</span>
        {pips(down.successes, "succ")}
        <span className="f-sr">{`${String(down.successes)}/3`}</span>
      </div>
      <div className="f-down-row">
        <span className="f-lbl">{t("deathSaves.failures")}</span>
        {pips(down.failures, "fail")}
        <span className="f-sr">{`${String(down.failures)}/3`}</span>
      </div>
      {!down.stable && !readonly && (
        <Button kind="primary" aria-haspopup="dialog" onClick={() => setRolling(true)}>
          {t("play.down.roll")}
        </Button>
      )}
      {rolling && (
        <Dialog
          open
          onClose={() => setRolling(false)}
          color="ini"
          title={t("play.down.rollTitle")}
          closeLabel={t("common.close")}
          actions={
            <>
              <Button kind="ghost" onClick={() => setRolling(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                kind="primary"
                disabled={!valid}
                onClick={() => {
                  applyDeathSave(face);
                  setTyped("");
                  setRolling(false);
                }}
              >
                {t("common.confirm")}
              </Button>
            </>
          }
        >
          <Field
            label={t("play.down.face")}
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            className="f-in f-in-big f-in-short"
            value={typed}
            help={t("play.down.faceHint")}
            onChange={(e) => setTyped(e.target.value)}
          />
        </Dialog>
      )}
    </div>
  );
}
