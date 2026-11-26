/**
 * The Scontro tab's moves, on the engine's combat lifecycle (combat-lifecycle-io): roll
 * into the fight, pass or step back a turn, end it and reopen it. Every move shows a
 * toast whose «Annulla» runs the move's own undo; a move that no longer fits (someone
 * else moved first) says so instead of acting.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { DmHitStep } from "@/domains/combat/dm-hit-plan";
import type { FightMark } from "@/domains/combat/fight-rows-view";
import {
  addMonstersMove,
  typeHeroRollMove,
  setMonsterTempHpMove,
  removeCombatantMove,
  changeMonsterHp,
  damagePcFromDm,
  endCombatNow,
  setMonsterConditionMove,
  setPcConditionMove,
  passCombatTurn,
  reopenLastCombat,
  reorderCombatantMove,
  setCombatantHiddenMove,
  setMonsterInitiativeMove,
  setMonsterRevealedMove,
  setMonsterSideMove,
  rollForMissing,
  rollIntoCombat,
  stepCombatTurnBack,
  subscribeToEndedCombat,
  type CombatUndo,
  CombatMoveRefused,
} from "@/features/campaigns/combat-lifecycle-io";
import { diagnosticsLog } from "@/lib/diagnostics";
import type { MonsterInput } from "@/lib/play/encounter";
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
        if (error instanceof CombatMoveRefused) {
          onToast(t(`fight.refused.${error.reason}`));
          return;
        }
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

/** Several moves as one: the undo takes them back newest first. Null when none landed. */
async function together(
  runs: ReadonlyArray<() => Promise<CombatUndo | null>>
): Promise<CombatUndo | null> {
  const undos: CombatUndo[] = [];
  for (const run of runs) {
    const undo = await run();
    if (undo) undos.push(undo);
  }
  if (undos.length === 0) return null;
  return async () => {
    let ok = true;
    for (const undo of undos.reverse()) ok = (await undo()) && ok;
    return ok;
  };
}

/** The DM's tools on the Scontro tab (combat-lifecycle-io's DM-only moves). */
export const dmMoves = {
  hit: (campaignId: string, uid: string, steps: readonly DmHitStep[]) => () =>
    together(
      steps.map((s) =>
        s.kind === "monster"
          ? () =>
              changeMonsterHp(campaignId, {
                uid,
                monsterId: s.monsterId,
                change: s.change,
              })
          : () =>
              damagePcFromDm(campaignId, {
                uid,
                memberUid: s.memberUid,
                characterId: s.characterId,
                maxHp: s.maxHp,
                parts: s.parts,
              })
      )
    ),
  condition:
    (
      campaignId: string,
      uid: string,
      target: {
        id: string;
        kind: "pc" | "monster";
        memberUid?: string;
        characterId?: string;
        maxHp: number;
      },
      conditionId: string,
      active: boolean
    ) =>
    () =>
      target.kind === "monster"
        ? setMonsterConditionMove(campaignId, {
            uid,
            monsterId: target.id,
            conditionId,
            active,
          })
        : target.memberUid && target.characterId
          ? setPcConditionMove(campaignId, {
              uid,
              memberUid: target.memberUid,
              characterId: target.characterId,
              maxHp: target.maxHp,
              conditionId,
              active,
            })
          : Promise.resolve(null),
  /** «Per i giocatori» on every chosen monster, as one move with one undo. */
  show:
    (
      campaignId: string,
      uid: string,
      monsterIds: readonly string[],
      mark: FightMark,
      on: boolean
    ) =>
    () =>
      together(
        monsterIds.map(
          (id) => () =>
            mark === "hidden"
              ? setCombatantHiddenMove(campaignId, { uid, id, hidden: on })
              : mark === "revealed"
                ? setMonsterRevealedMove(campaignId, { uid, monsterId: id, revealed: on })
                : setMonsterSideMove(campaignId, {
                    uid,
                    monsterId: id,
                    side: on ? "ally" : "enemy",
                  })
        )
      ),
  /** A monster line's new initiative, every creature on it; once turns have begun the
   *  order stands, so they also move before `beforeId` (their number's place). */
  initiative:
    (
      campaignId: string,
      uid: string,
      monsterIds: readonly string[],
      value: number,
      place: { beforeId: string | null } | null
    ) =>
    () =>
      together([
        ...monsterIds.map(
          (monsterId) => () =>
            setMonsterInitiativeMove(campaignId, { uid, monsterId, value })
        ),
        ...(place
          ? monsterIds.map(
              (id) => () =>
                reorderCombatantMove(campaignId, { uid, id, beforeId: place.beforeId })
            )
          : []),
      ]),
  add: (campaignId: string, uid: string, monsters: readonly MonsterInput[]) => () =>
    together(
      monsters.map((monster) => () => addMonstersMove(campaignId, { uid, monster }))
    ),
  /** The DM types a hero's d20 (a player without the app); the report says so. */
  heroRoll:
    (
      campaignId: string,
      uid: string,
      heroUid: string,
      roll: number,
      bonuses: Readonly<Record<string, number>>
    ) =>
    () =>
      typeHeroRollMove(campaignId, { uid, heroUid, roll, bonuses }),
  /** The chosen creatures leave the fight, as one move with one undo. */
  remove: (campaignId: string, uid: string, ids: readonly string[]) => () =>
    together(ids.map((id) => () => removeCombatantMove(campaignId, { uid, id }))),
  /** Temporary HP on the chosen monsters, as one move with one undo. */
  tempHp: (campaignId: string, uid: string, ids: readonly string[], temp: number) => () =>
    together(
      ids.map(
        (monsterId) => () => setMonsterTempHpMove(campaignId, { uid, monsterId, temp })
      )
    ),
  /** «Su» / «Giù»: the line's creatures move before `beforeId`, one undo. */
  reorder:
    (campaignId: string, uid: string, ids: readonly string[], beforeId: string | null) =>
    () =>
      together(
        ids.map((id) => () => reorderCombatantMove(campaignId, { uid, id, beforeId }))
      ),
};
