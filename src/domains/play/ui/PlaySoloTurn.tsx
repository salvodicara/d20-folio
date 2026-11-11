/**
 * A fight without a campaign, on the Play screen (the classic turn band's solo mode,
 * on the rules lane's `turn-model`). BG3's turn-based toggle sits where End Turn goes:
 * «Inizia il combattimento» while exploring; then the round, the lit «Fine Turno»
 * (BG3's End Turn at the end of the action area), «Rialzati» when Prone, and
 * «Fine Combattimento» tucked behind a confirm (D&D Beyond's End Combat behind NEXT).
 * A maintained state not kept going this turn (Rage) is asked about BEFORE the turn
 * ends (BG3), so «Extend (Bonus Action)» spends this turn's Bonus Action; once each is
 * answered the turn ends. Under the strip wait the other notes, each with its one
 * action: the extra turn on offer, the Time Stop turns to enter, the Wish follow-up,
 * the ammunition to recover after the fight.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  canExtendWithBonus,
  endCombat,
  endMaintainedEffect,
  endTurn,
  maintenanceDue,
  recoverAmmunition,
  setTimeStopTurns,
  standUp,
  startCombat,
  takeExtraTurn,
  turnModelView,
  type MaintainedPrompt,
} from "@/domains/play/turn-model";
import { useExtendMaintained } from "@/domains/play/ui/use-extend-maintained";
import { sheetInEncounter } from "@/features/character/center/sheet-in-encounter";
import { TIME_STOP_ID } from "@/lib/play/extra-turns";
import { WISH_DUPLICATE_MAX_LEVEL } from "@/lib/play/wish";
import { grantSourceLabel } from "@/lib/views/tracker-view";
import type { Locale } from "@/lib/locale";
import { localeDistance } from "@/lib/utils";
import { isCharacterAlive } from "@/lib/character-status";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { Button, Dialog, Field } from "@/ui";

export function useSoloTurn(locale: Locale) {
  const { t } = useTranslation();
  // re-read the model when the stores it reads change
  useCombatStore((s) => s.round);
  useCombatStore((s) => s.timeStopTurns);
  useCombatStore((s) => s.reflexesTaken);
  useCombatStore((s) => s.selected);
  const doc = useCharacterStore((s) => s.character);
  const alive = doc ? isCharacterAlive(doc.status, doc.session) : false;
  const view = turnModelView();
  const [fighting, setFighting] = useState(view.round > 1);
  const [prompts, setPrompts] = useState<MaintainedPrompt[]>([]);
  const [ammo, setAmmo] = useState(0);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [turns, setTurns] = useState("");
  const extend = useExtendMaintained(locale);
  const solo = view.mode === "solo";

  // End Turn asks first; the turn ends once nothing is left to answer. A state kept
  // without its extend action stays lit (the player owns the call): End Turn's own
  // re-ask is dropped.
  const askOrEnd = (left: MaintainedPrompt[]) => {
    setPrompts(left);
    if (left.length === 0) endTurn(t);
  };
  const answer = (m: MaintainedPrompt) =>
    askOrEnd(prompts.filter((x) => x.activeKey !== m.activeKey));
  // «Extend» commits through the economy asynchronously: the turn ends only once the
  // Bonus Action has landed on THIS turn (a declined commit leaves the question open,
  // and the button live to try again).
  // Listening starts in the click itself, so a commit that lands at once is not missed.
  const stopWaiting = useRef<(() => void) | null>(null);
  useEffect(() => () => stopWaiting.current?.(), []);
  const extendThenEnd = (m: MaintainedPrompt) => {
    const landed = () => !maintenanceDue().some((x) => x.activeKey === m.activeKey);
    const done = () => {
      stopWaiting.current?.();
      stopWaiting.current = null;
      answer(m);
    };
    stopWaiting.current?.();
    stopWaiting.current = useCombatStore.subscribe(() => {
      if (landed()) done();
    });
    if (!extend(m.activeKey)) {
      stopWaiting.current();
      stopWaiting.current = null;
    } else if (landed()) done();
  };
  const active = solo && (fighting || view.round > 1);

  const controls = solo && alive && view.canStartCombat && (
    <>
      {active && view.standUp && (
        <Button
          kind="ghost"
          disabled={!view.standUp.possible}
          onClick={() => standUp(t, locale)}
        >
          {t("combat.standAction", { cost: localeDistance(view.standUp.costFt, locale) })}
        </Button>
      )}
      {active ? (
        <>
          <Button
            kind="primary"
            icon="u-next"
            data-end-turn=""
            onClick={() => askOrEnd(maintenanceDue())}
          >
            {t("play.endTurn")}
          </Button>
          <Button kind="quiet" onClick={() => setConfirmEnd(true)}>
            {t("fight.end")}
          </Button>
        </>
      ) : (
        <Button
          kind="ghost"
          onClick={() => {
            startCombat();
            setFighting(true);
            setAmmo(0);
          }}
        >
          {t("play.solo.start")}
        </Button>
      )}
    </>
  );

  const notes = solo && (
    <>
      {prompts.map((m) => {
        const bonus = m.maintainedBy.includes("bonus-extend");
        return (
          <div key={m.activeKey} className="f-note f-save-due" data-c="res" role="group">
            {/* the 2024 reason it ends (Rage: no attack and no forced save this turn) */}
            <p>
              {t("play.solo.endingName", { name: grantSourceLabel(m.sourceId, locale) })}
              {m.maintainedBy.includes("attack") && ` ${t("play.solo.endingWhyAttack")}`}
            </p>
            <div className="f-acts">
              <Button
                kind="primary"
                disabled={bonus && !canExtendWithBonus(m.activeKey, locale).ok}
                onClick={() => {
                  if (!bonus) answer(m);
                  // outside a running fight the economy only logs: nothing will land
                  else if (sheetInEncounter()) extendThenEnd(m);
                  else if (extend(m.activeKey)) answer(m);
                }}
              >
                {bonus ? t("play.solo.extendBonus") : t("combat.maintainedKeepAction")}
              </Button>
              <Button
                kind="ghost"
                onClick={() => {
                  endMaintainedEffect(m.activeKey, t);
                  answer(m);
                }}
              >
                {t("play.solo.letEnd")}
              </Button>
            </div>
          </div>
        );
      })}
      {view.extraTurnOffer && (
        <div className="f-note f-save-due" data-c="ini" role="group">
          <p>
            {view.extraTurnOffer.source === TIME_STOP_ID
              ? t("combat.extraTurnsNextNote", {
                  source: grantSourceLabel(view.extraTurnOffer.source, locale),
                  n: view.extraTurnOffer.n,
                  of: view.extraTurnOffer.of,
                })
              : t("combat.secondTurnNote", {
                  source: grantSourceLabel(view.extraTurnOffer.source, locale),
                })}
          </p>
          <div className="f-acts">
            <Button kind="primary" icon="u-next" onClick={() => takeExtraTurn(t, locale)}>
              {view.extraTurnOffer.source === TIME_STOP_ID
                ? t("combat.nextExtraTurn", {
                    source: grantSourceLabel(view.extraTurnOffer.source, locale),
                    n: view.extraTurnOffer.n,
                    of: view.extraTurnOffer.of,
                  })
                : t("combat.secondTurn", {
                    source: grantSourceLabel(view.extraTurnOffer.source, locale),
                  })}
            </Button>
          </div>
        </div>
      )}
      {view.askTimeStopTurns && (
        <div className="f-note f-save-due" data-c="res" role="group">
          <p>
            {t("combat.extraTurnsNote", {
              source: grantSourceLabel(TIME_STOP_ID, locale),
            })}
          </p>
          <div className="f-acts">
            <Field
              label={t("combat.extraTurnsLabel")}
              inputMode="numeric"
              autoComplete="off"
              className="f-in f-in-short"
              value={turns}
              onChange={(e) => setTurns(e.target.value)}
            />
            <Button
              kind="primary"
              disabled={!/^\d$/.test(turns.trim())}
              onClick={() => {
                if (setTimeStopTurns(Number(turns))) setTurns("");
              }}
            >
              {t("common.confirm")}
            </Button>
          </div>
        </div>
      )}
      {view.pendingWish && (
        <div className="f-note f-save-due" data-c="res" role="status">
          <p>{t("combat.wishNote", { level: WISH_DUPLICATE_MAX_LEVEL })}</p>
        </div>
      )}
      {ammo > 0 && (
        <div className="f-note f-save-due" data-c="act" role="group">
          <p>{t("play.solo.ammo", { count: ammo })}</p>
          <div className="f-acts">
            <Button
              kind="primary"
              onClick={() => {
                recoverAmmunition(t);
                setAmmo(0);
              }}
            >
              {t("common.recover")}
            </Button>
            <Button kind="quiet" onClick={() => setAmmo(0)}>
              {t("common.close")}
            </Button>
          </div>
        </div>
      )}
      {confirmEnd && (
        <Dialog
          open
          onClose={() => setConfirmEnd(false)}
          color="ini"
          title={t("combat.endCombatConfirmTitle")}
          closeLabel={t("common.close")}
          actions={
            <>
              <Button kind="ghost" onClick={() => setConfirmEnd(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                kind="primary"
                onClick={() => {
                  const done = endCombat();
                  setAmmo(done?.ammunitionRecoverable ?? 0);
                  setFighting(false);
                  setPrompts([]);
                  setConfirmEnd(false);
                }}
              >
                {t("fight.end")}
              </Button>
            </>
          }
        >
          <p className="f-help">{t("combat.endCombatConfirmBody")}</p>
        </Dialog>
      )}
    </>
  );

  return { active, round: view.round, controls, notes };
}
