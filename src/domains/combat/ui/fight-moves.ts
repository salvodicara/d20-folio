/**
 * The Scontro tab's moves, on the engine's combat lifecycle (combat-lifecycle-io): roll
 * into the fight, pass or step back a turn, end it and reopen it. Every move shows a
 * toast whose «Annulla» runs the move's own undo; a move that no longer fits (someone
 * else moved first) says so instead of acting.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  endCombatNow,
  passCombatTurn,
  reopenLastCombat,
  rollForMissing,
  rollIntoCombat,
  stepCombatTurnBack,
  subscribeToEndedCombat,
  type CombatUndo,
} from "@/features/campaigns/combat-lifecycle-io";
import { diagnosticsLog } from "@/lib/diagnostics";
import type { EncounterEndReason, EncounterState } from "@/types/campaign";

export type Toaster = (message: string, undo?: () => void) => void;

/** The campaign's just-ended fight (null when there is none), kept for «Riapri». */
export function useEndedCombat(campaignId: string): EncounterState | null {
  const [ended, setEnded] = useState<EncounterState | null>(null);
  useEffect(
    () =>
      subscribeToEndedCombat(campaignId, setEnded, (error) =>
        diagnosticsLog("warn", "combat.ended-read-failed", { message: error.message })
      ),
    [campaignId]
  );
  return ended;
}

/** Run one lifecycle move and tell the table how it went, with its undo. */
export function useFightMove(onToast: Toaster) {
  const { t } = useTranslation();
  return (move: () => Promise<CombatUndo | null>, done: string) => {
    move()
      .then((undo) => {
        if (!undo) {
          onToast(t("fight.moved"));
          return;
        }
        onToast(done, () => {
          void undo().then((ok) => {
            if (!ok) onToast(t("fight.tooLate"));
          });
        });
      })
      .catch((error: unknown) => {
        diagnosticsLog("warn", "combat.move-failed", { message: String(error) });
        onToast(t("fight.failed"));
      });
  };
}

export const moves = {
  pass: (campaignId: string, uid: string, isDm: boolean, current: string | null) => () =>
    passCombatTurn(campaignId, { uid, isDm, expectedCurrentId: current }),
  back: (campaignId: string, uid: string, isDm: boolean, current: string | null) => () =>
    stepCombatTurnBack(campaignId, { uid, isDm, expectedCurrentId: current }),
  end: (campaignId: string, reason?: Exclude<EncounterEndReason, "manual">) => () =>
    endCombatNow(campaignId, reason ? { reason } : {}),
  reopen: (campaignId: string) => () => reopenLastCombat(campaignId),
  rollMissing: (campaignId: string, uid: string, bonuses: Record<string, number>) => () =>
    rollForMissing(campaignId, { uid, bonuses }),
  roll:
    (campaignId: string, uid: string, roll: number, bonuses: Record<string, number>) =>
    () =>
      rollIntoCombat(campaignId, { uid, roll, bonuses }),
};
