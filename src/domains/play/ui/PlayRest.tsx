/**
 * «Riposo breve» and «Riposo lungo» on the Play screen (approved prototypes rest-short,
 * rest-long). A Short Rest picks how many Hit Point Dice to spend (tap a die), takes
 * the rolled total, shows the Hit Points it leads to and what else comes back or ends;
 * a Long Rest lists what the character wakes with. Both go through `useRestCommit`, the
 * one way any screen rests. A rest is the undo stack's fence, so it asks first.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { longRestChange } from "@/domains/play/long-rest-change";
import { prepareList } from "@/domains/play/play-spells-view";
import { restView, type RestLine } from "@/domains/play/rest-view";
import { shortRestHeal } from "@/lib/play/short-rest-healing";
import { PlayPrepare } from "@/domains/play/ui/PlayPrepare";
import { PlayRestSummary } from "@/domains/play/ui/PlayRestSummary";
import { restSummary, type RestSummary } from "@/domains/play/rest-model";
import { useCharacterStore } from "@/stores/characterStore";
import { useRestCommit } from "@/features/character/use-rest-commit";
import type { Locale } from "@/lib/locale";
import { hitDiceLabel, hitDicePool, hitDiceTotalRange } from "@/lib/play/hit-dice";
import type { RestKind } from "@/lib/play/rest-preview";
import type { CharacterDoc } from "@/types/character";
import { Button, Choice, Dialog, Field } from "@/ui";

export function PlayRest({
  doc,
  kind,
  locale,
  onClose,
}: {
  doc: CharacterDoc;
  kind: RestKind;
  locale: Locale;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const rest = useRestCommit();
  const view = restView(doc, kind, locale);
  const [count, setCount] = useState(0);
  const [typed, setTyped] = useState("");
  // after a Long Rest, a class that prepares its spells may change them (owner, «Guida»)
  const [preparing, setPreparing] = useState(false);
  // what came back, shown before closing or changing prepared spells
  const [summary, setSummary] = useState<RestSummary | null>(null);
  const change =
    kind === "long" && prepareList(doc, locale).levels.length > 0
      ? longRestChange(doc)
      : null;
  const heal = shortRestHeal(doc, count, typed);
  const pool = hitDicePool(doc.character);
  const range = hitDiceTotalRange(pool, count);
  const dice = hitDiceLabel(pool, count).dice ?? hitDiceLabel(pool).sizes;
  const line = (r: RestLine) => {
    switch (r.kind) {
      case "hp":
        return t("play.rest.hpPreview", { from: r.from, to: r.to });
      case "slots":
        return r.all
          ? t("play.rest.slotsAll")
          : t("play.rest.slotsSome", { count: r.amount });
      case "hit-dice":
        return t("play.rest.hitDiceLine", { count: r.amount, total: r.total });
      case "exhaustion":
        return t("play.rest.exhaustionLine", { from: r.from, to: r.to });
      case "tracker":
        return t("play.rest.trackerLine", { name: r.name, count: r.amount });
    }
  };
  // A Short Rest names the Hit Points apart (they hang on the dice); the rest is a list.
  const others = view.recovers.filter((r) => kind === "long" || r.kind !== "hp");
  const lines = [
    ...others.map(line),
    ...view.ends.map((name) => t("play.rest.ends", { name })),
  ];
  // A rest needs at least 1 Hit Point (2024): at 0, or dead, it says why and waits.
  const canRest = view.blocked === null && (kind === "long" || heal.valid);
  const confirm = () => {
    const done =
      kind === "short" ? rest.shortRest(doc, count, heal.heal ?? 0) : rest.longRest(doc);
    void done.then((prepared) => {
      if (!prepared) return;
      const after = useCharacterStore.getState().character ?? doc;
      setSummary(
        restSummary(
          kind,
          doc,
          after,
          prepared.entries.map(({ receipt }) => receipt)
        )
      );
    });
  };
  if (summary && !preparing) {
    const live = useCharacterStore.getState().character ?? doc;
    return (
      <PlayRestSummary
        doc={live}
        summary={summary}
        locale={locale}
        onDone={() => (change ? setPreparing(true) : onClose())}
      />
    );
  }
  if (preparing && change)
    return <PlayPrepare doc={doc} locale={locale} longRest={change} onClose={onClose} />;
  return (
    <Dialog
      open
      onClose={onClose}
      color="res"
      title={t(kind === "short" ? "play.rest.shortTitle" : "play.rest.longTitle")}
      closeLabel={t("common.close")}
      actions={
        <>
          <Button kind="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button kind="primary" disabled={!canRest || rest.committing} onClick={confirm}>
            {t("rest.completeRest")}
          </Button>
        </>
      }
    >
      {view.blocked && (
        <p className="f-note" role="status">
          {t(
            view.blocked === "dead" ? "play.rest.blockedDead" : "play.rest.blockedZeroHp"
          )}
        </p>
      )}
      {kind === "short" && !view.blocked && (
        <div className="f-ask">
          <span className="f-lbl">{t("play.rest.spend")}</span>
          <p className="f-help">
            {t("rest.hitDiceAvailable", {
              available: view.hitDice.available,
              total: view.hitDice.total,
            })}
          </p>
          <div className="f-slots f-rest-dice">
            {view.hitDice.dice.map((die, i) => (
              <Choice
                // the dice are interchangeable: a die is its place in the row
                key={i}
                tile
                on={i < count}
                onClick={() => {
                  setCount(i + 1 === count ? i : i + 1);
                  setTyped("");
                }}
              >
                <b>{`d${String(die)}`}</b>
              </Choice>
            ))}
          </div>
          {count > 0 && (
            <Field
              label={t("rest.diceTotal")}
              inputMode="numeric"
              autoComplete="off"
              className="f-in f-in-big f-in-short"
              value={typed}
              help={t("rest.diceTotalHint", { dice })}
              error={
                typed.trim() !== "" && !heal.valid
                  ? t("rest.diceTotalError", { min: range.min, max: range.max })
                  : undefined
              }
              onChange={(e) => setTyped(e.target.value)}
            />
          )}
          {heal.heal !== null && heal.heal > 0 && (
            <p className="f-note" data-c="res" role="status">
              {t("play.rest.hpPreview", {
                from: view.hp.current,
                to: Math.min(view.hp.current + heal.heal, view.hp.max),
              })}
            </p>
          )}
        </div>
      )}
      {!view.blocked && (
        <div className="f-ask">
          <span className="f-lbl">
            {t(kind === "short" ? "play.rest.alsoRecover" : "play.rest.onWaking")}
          </span>
          {lines.length > 0 ? (
            <ul className="f-rest-lines">
              {lines.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
          ) : (
            <p className="f-quiet">{t("play.rest.nothing")}</p>
          )}
        </div>
      )}
    </Dialog>
  );
}
