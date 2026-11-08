/**
 * At 0 Hit Points on the Play screen (approved prototype x-play-down): the death saves
 * as pips and «Tira il dado», the d20 the player rolled at the table, applied through
 * the sheet's one death-save path (`useHpControls`: a 20 rises with 1 HP, a 1 counts
 * two failures, undoable). Once Stable, how long, and that after 1d4 hours it regains
 * 1 Hit Point (the table rolls the hours). What the player adds after the roll rides
 * the same entry (BG3's roll-modifier toggles, D&D Beyond's roll with Advantage): a held
 * Bardic Inspiration die («+ Ispirazione Bardica (d8)», then its face) and a paid
 * Advantage («Fortunato: Vantaggio», then the second d20), spent in the same undo.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  BARDIC_INSPIRATION_DIE_SOURCE,
  postRollSources,
  type PostRollUse,
} from "@/lib/character-d20-tests";
import { bareActionSpend } from "@/lib/play/cast-payment";
import { localizeActions } from "@/lib/views/combat-action-view";
import { useLocale } from "@/hooks/useLocale";

import { playDownView } from "@/domains/play/play-down-view";
import { useHpControls } from "@/features/character/molecules/use-hp-controls";
import { useSheetReadonly } from "@/hooks/useSheetReadonly";
import type { CharacterDoc } from "@/types/character";
import { Button, Chip, Dialog, Field } from "@/ui";

export function PlayDown({ doc }: { doc: CharacterDoc }) {
  const { t } = useTranslation();
  const readonly = useSheetReadonly();
  const { applyDeathSave } = useHpControls();
  const [rolling, setRolling] = useState(false);
  const [typed, setTyped] = useState("");
  const [second, setSecond] = useState("");
  const [dieFace, setDieFace] = useState("");
  const [withDie, setWithDie] = useState(false);
  const [advantage, setAdvantage] = useState<string | null>(null);
  const { language: locale } = useLocale();
  const actions = useMemo(() => localizeActions(doc, locale), [doc, locale]);
  const sources = postRollSources(doc, actions);
  const sides = doc.session.bardicInspirationDie?.replace(/^d/, "") ?? "";
  const lucky = actions.filter(
    (a) => sources.advantageOptIns.includes(a.id) && (a.summary.uses?.current ?? 1) > 0
  );
  const down = playDownView(doc);
  if (!down) return null;
  const inRange = (text: string, max: number) =>
    /^\d{1,2}$/.test(text.trim()) && Number(text) >= 1 && Number(text) <= max;
  const face = Number(typed);
  const valid =
    inRange(typed, 20) &&
    (!advantage || inRange(second, 20)) &&
    (!withDie || inRange(dieFace, Number(sides)));
  const reset = () => {
    setTyped("");
    setSecond("");
    setDieFace("");
    setWithDie(false);
    setAdvantage(null);
    setRolling(false);
  };
  const confirm = () => {
    const paid = lucky.find((a) => a.id === advantage);
    const use: PostRollUse = {
      ...(withDie
        ? { enteredModifierFaces: { [BARDIC_INSPIRATION_DIE_SOURCE]: [Number(dieFace)] } }
        : {}),
      ...(paid ? { advantage: { sourceId: paid.id, actions } } : {}),
    };
    const spend = paid ? bareActionSpend(doc.character.spellSlots, paid) : null;
    applyDeathSave(
      advantage ? [face, Number(second)] : face,
      use,
      spend?.kind === "tracker"
        ? { trackerId: spend.trackerId, amount: spend.amount }
        : undefined
    );
    reset();
  };
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
          onClose={reset}
          color="ini"
          title={t("play.down.rollTitle")}
          closeLabel={t("common.close")}
          actions={
            <>
              <Button kind="ghost" onClick={reset}>
                {t("common.cancel")}
              </Button>
              <Button kind="primary" disabled={!valid} onClick={confirm}>
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
          {(sources.enteredModifiers.length > 0 || lucky.length > 0) && (
            <div
              className="f-ask f-chips"
              role="group"
              aria-label={t("play.down.addAfter")}
            >
              {sources.enteredModifiers.length > 0 && (
                <Chip pressed={withDie} onClick={() => setWithDie((on) => !on)}>
                  {t("play.down.addBardic", { die: doc.session.bardicInspirationDie })}
                </Chip>
              )}
              {lucky.map((a) => (
                <Chip
                  key={a.id}
                  pressed={advantage === a.id}
                  onClick={() => setAdvantage((on) => (on === a.id ? null : a.id))}
                >
                  {t("play.down.paidAdvantage", { name: a.name })}
                </Chip>
              ))}
            </div>
          )}
          {advantage && (
            <Field
              label={t("play.down.secondFace")}
              inputMode="numeric"
              autoComplete="off"
              className="f-in f-in-big f-in-short"
              value={second}
              onChange={(e) => setSecond(e.target.value)}
            />
          )}
          {withDie && (
            <Field
              label={t("play.down.dieFace", { die: doc.session.bardicInspirationDie })}
              inputMode="numeric"
              autoComplete="off"
              className="f-in f-in-big f-in-short"
              value={dieFace}
              onChange={(e) => setDieFace(e.target.value)}
            />
          )}
        </Dialog>
      )}
    </div>
  );
}
