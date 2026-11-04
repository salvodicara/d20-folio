/**
 * «Passa il tempo» on the Play screen (approved prototype time-pass): how much time
 * passes (1 minute, 10 minutes, 1 hour, 8 hours, or any number of minutes), what it
 * ends, named, then «Fai passare», with its undo toast (`passTimeWithUndo`).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  clockText,
  parseClockText,
  TIME_STEPS,
  timePassView,
} from "@/domains/play/time-pass-view";
import { useOptionalItemResourceCommands } from "@/features/character/center/useItemResourceCommands";
import { declareClockBoundary } from "@/features/character/clock-boundaries";
import { passTimeWithUndo } from "@/features/character/pass-time";
import { crossedBoundaries } from "@/lib/play/time";
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
  const commands = useOptionalItemResourceCommands();
  const [step, setStep] = useState<number | "other">(60);
  const [typed, setTyped] = useState("");
  // The time of day (M18): optional. Once set, it is shown here every time, moved by
  // the time that passed; never asked twice.
  const known = doc.session.timeOfDay;
  const [askTime, setAskTime] = useState(known !== undefined);
  const [clock, setClock] = useState(known !== undefined ? clockText(known) : "");
  const timeOfDay = askTime ? (parseClockText(clock) ?? undefined) : known;
  const minutes =
    step === "other" ? (/^\d+$/.test(typed.trim()) ? Number(typed.trim()) : 0) : step;
  const view = minutes > 0 ? timePassView(doc, minutes, locale, timeOfDay) : null;
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
        ...view.recoveries.map((r) =>
          r.amount === null
            ? t(`play.time.recoversAll_${r.kind}`, { item: r.item })
            : t(`play.time.recovers_${r.kind}`, {
                item: r.item,
                amount: r.amount,
                unit: t(`units.${r.unit}`),
              })
        ),
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
                t("play.time.done", { count: one ? 1 : 2, time: span(minutes) }),
                timeOfDay
              );
              // Dawn and dusk come with the clock: what recovers then, recovers now.
              if (commands) {
                for (const kind of crossedBoundaries(timeOfDay, minutes)) {
                  void declareClockBoundary(
                    commands,
                    kind,
                    t(`magicItems.clockApplied_${kind}`)
                  );
                }
              }
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
        <div className="f-slots f-slots-row">
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
        {askTime ? (
          <Field
            label={t(known !== undefined ? "play.time.now" : "play.time.whatTime")}
            type="time"
            className="f-in f-in-short"
            value={clock}
            onChange={(e) => setClock(e.target.value)}
            {...(view?.span
              ? { help: t("play.time.span", { from: view.span.from, to: view.span.to }) }
              : {})}
          />
        ) : (
          <Button kind="quiet" onClick={() => setAskTime(true)}>
            {t("play.time.setTimeOfDay")}
          </Button>
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
