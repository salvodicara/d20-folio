/**
 * «Passa il tempo» on the Play screen (approved prototype time-pass): how much time
 * passes (1 minute, 10 minutes, 1 hour, 8 hours, or any number of minutes), what it
 * ends, named, then «Fai passare», with its undo toast (`passTimeWithUndo`).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { TIME_STEPS, timePassView } from "@/domains/play/time-pass-view";
import { passTimeWithUndo } from "@/features/character/pass-time";
import type { Locale } from "@/lib/locale";
import type { CharacterDoc } from "@/types/character";
import { Button, Choice, Dialog, Field } from "@/ui";

export function PlayTime({
  doc,
  locale,
  onClose,
}: {
  doc: CharacterDoc;
  locale: Locale;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [step, setStep] = useState<number | "other">(60);
  const [typed, setTyped] = useState("");
  const minutes =
    step === "other" ? (/^\d+$/.test(typed.trim()) ? Number(typed.trim()) : 0) : step;
  const view = minutes > 0 ? timePassView(doc, minutes, locale) : null;
  const span = (m: number) =>
    m % 60 === 0
      ? t("play.time.hours", { count: m / 60 })
      : t("equipment.armorTimeMinutes", { count: m });
  const lines = view
    ? [
        ...view.ends.map((name) => t("play.rest.ends", { name })),
        ...(view.concentration
          ? [t("play.time.concentrationEnds", { spell: view.concentration })]
          : []),
      ]
    : [];
  return (
    <Dialog
      open
      onClose={onClose}
      color="res"
      title={t("play.time.title")}
      closeLabel={t("common.close")}
      actions={
        <>
          <Button kind="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            kind="primary"
            disabled={minutes <= 0}
            onClick={() => {
              // «Passa 1 ora», «Passano 10 minuti»: the verb agrees with the span.
              const one = minutes === 1 || minutes === 60;
              passTimeWithUndo(
                minutes,
                t("play.time.done", { count: one ? 1 : 2, time: span(minutes) })
              );
              onClose();
            }}
          >
            {t("play.time.confirm")}
          </Button>
        </>
      }
    >
      <div className="f-ask">
        <span className="f-lbl">{t("play.time.howMuch")}</span>
        <div className="f-slots">
          {TIME_STEPS.map((m) => (
            <Choice key={m} tile on={step === m} onClick={() => setStep(m)}>
              <b>{span(m)}</b>
            </Choice>
          ))}
          <Choice tile on={step === "other"} onClick={() => setStep("other")}>
            <b>{t("report.types.other")}</b>
          </Choice>
        </div>
        {step === "other" && (
          <Field
            label={t("play.time.otherMinutes")}
            inputMode="numeric"
            autoComplete="off"
            className="f-in f-in-big f-in-short"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
        )}
      </div>
      {view && (
        <div className="f-ask">
          <span className="f-lbl">{t("play.time.whatHappens")}</span>
          {lines.length > 0 ? (
            <ul className="f-rest-lines">
              {lines.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
          ) : (
            <p className="f-quiet">{t("play.time.nothing")}</p>
          )}
        </div>
      )}
    </Dialog>
  );
}
