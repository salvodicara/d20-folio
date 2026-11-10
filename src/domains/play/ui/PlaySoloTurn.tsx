/**
 * A fight without a campaign, on the Play screen (the classic turn band's solo mode,
 * on the rules lane's `turn-model`). BG3's turn-based toggle sits where End Turn goes:
 * «Inizia il combattimento» while exploring; then the round, the lit «Fine Turno»
 * (BG3's End Turn at the end of the action area), «Rialzati» when Prone, and
 * «Fine Combattimento» tucked behind a confirm (D&D Beyond's End Combat behind NEXT).
 * What End Turn hands back waits under the strip as notes, each with its one action:
 * a maintained state to keep or end (Rage), the extra turn on offer, the Time Stop
 * turns to enter, the Wish follow-up, the ammunition to recover after the fight.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  endCombat,
  endMaintainedEffect,
  endTurn,
  recoverAmmunition,
  setTimeStopTurns,
  standUp,
  startCombat,
  takeExtraTurn,
  turnModelView,
  type MaintainedPrompt,
} from "@/domains/play/turn-model";
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
  const doc = useCharacterStore((s) => s.character);
  const alive = doc ? isCharacterAlive(doc.status, doc.session) : false;
  const view = turnModelView();
  const [fighting, setFighting] = useState(view.round > 1);
  const [prompts, setPrompts] = useState<MaintainedPrompt[]>([]);
  const [ammo, setAmmo] = useState(0);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [turns, setTurns] = useState("");
  const solo = view.mode === "solo";
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
            onClick={() => setPrompts(endTurn(t).maintenancePrompts)}
          >
            {t("combat.endTurn")}
          </Button>
          <Button kind="quiet" onClick={() => setConfirmEnd(true)}>
            {t("combat.endCombat")}
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
      {prompts.map((m) => (
        <div key={m.activeKey} className="f-note f-save-due" data-c="res" role="group">
          <p>
            {t("combat.maintainedEndPrompt", {
              name: grantSourceLabel(m.sourceId, locale),
            })}
          </p>
          <div className="f-acts">
            <Button
              kind="primary"
              onClick={() => setPrompts((all) => all.filter((x) => x !== m))}
            >
              {t("combat.maintainedKeepAction")}
            </Button>
            <Button
              kind="ghost"
              onClick={() => {
                endMaintainedEffect(m.activeKey, t);
                setPrompts((all) => all.filter((x) => x !== m));
              }}
            >
              {t("combat.maintainedEndAction")}
            </Button>
          </div>
        </div>
      ))}
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
              {t("play.solo.ammoRecover")}
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
                {t("combat.endCombat")}
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
