/**
 * Where an applied damage-tray row lands (the tray's "Apply"), shared by every screen
 * that draws the tray:
 *  - me → the sheet's own store seams (heal / temp HP / damage / condition), tagged
 *    with the action as source; undoable as ONE step with the monsters' lines;
 *  - another PC in the live encounter → the same peer combat write the campaign PC card
 *    uses, then an `effect-given` log line (its own undo reverts the write);
 *  - a monster → only the `effect-given` log line (players cannot write monster HP).
 * An attack's shared result goes onto the use's own log line, and the turn keeps one
 * outcome receipt per target.
 */
import type { TFunction } from "i18next";

import type { TrayTarget } from "@/components/shared/damage-tray-target";
import { effectiveMaxHp } from "@/lib/aggregate-character";
import type { LocText } from "@/lib/loc-text";
import { revivalHitPoints } from "@/lib/play/spell-outcomes";
import {
  rowConditions,
  sharedAttackOutcome,
  trayOutcomeReceipts,
  type AttackOutcome,
  type TrayEffect,
  type TrayRow,
} from "@/lib/play/damage-tray";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useToastStore } from "@/stores/toastStore";
import { registerUndoableToast } from "@/stores/undoStore";
import type { CombatEvent } from "@/types/combat-log";

import type { DamageTrayOffer } from "./damage-tray-store";

type T = TFunction;

// ── Apply ──────────────────────────────────────────────────────────────────────

type SelfKind = "hp-heal" | "hp-damage" | "temp-hp-gain" | "condition-gain";

function logIds(): Set<string> {
  return new Set(
    useCharacterStore.getState().character?.session.logEntries.map((e) => e.id) ?? []
  );
}

/** Tag the line a self seam just logged with the action that caused it, so the
 *  session gets ONE line carrying target, amount and source. */
function tagNewLine(before: ReadonlySet<string>, kind: SelfKind, source: LocText): void {
  const store = useCharacterStore.getState();
  const entry = store.character?.session.logEntries.findLast(
    (e) => !before.has(e.id) && e.event.kind === kind
  );
  if (entry) store.amendLogEntry(entry.id, { ...entry.event, source } as CombatEvent);
}

interface AppliedRow {
  target: TrayTarget;
  amount: number;
  conditions: string[];
  outcome?: AttackOutcome;
  knockOut?: true;
}

/** Write the attack's one shared result onto the use's own log line; the returned
 *  undo puts the line back as it was. */
function stampOutcome(castLogId: string | null, outcome: AttackOutcome): () => void {
  const store = useCharacterStore.getState();
  const entry = store.character?.session.logEntries.find((e) => e.id === castLogId);
  if (
    !entry ||
    (entry.event.kind !== "action-use" && entry.event.kind !== "reaction-use")
  )
    return () => {};
  return store.amendLogEntry(entry.id, { ...entry.event, outcome }) ?? (() => {});
}

export function applyTray(
  offer: DamageTrayOffer,
  targets: ReadonlyArray<TrayTarget>,
  rows: ReadonlyArray<TrayRow>,
  /** What each row applies, worked out by the tray (`rowAmount` / `rowAmountByType`). */
  amounts: ReadonlyArray<number>,
  t: T
): void {
  const { plan, source } = offer;
  const effect = plan.effect;
  const applied: AppliedRow[] = targets
    .map((target, index) => {
      const row = rows[index];
      return {
        target,
        amount: effect && row ? (amounts[index] ?? 0) : 0,
        conditions: row ? rowConditions(row) : [],
        ...(row?.attack ? { outcome: row.attack } : {}),
        ...(row?.knockOut ? { knockOut: true as const } : {}),
      };
    })
    .filter((row) => row.amount > 0 || row.conditions.length > 0);
  // Killed outright (Power Word Kill, its answer "100 HP or fewer"): each such target.
  const killed = targets.filter((_, index) => {
    const outcome = rows[index]?.outcome;
    return outcome?.kind === "threshold" && outcome.branch === "dies";
  });
  // A reviving spell (Revivify): each dead target the tray marked comes back.
  const revive = plan.revive;
  const revived = revive
    ? targets.filter((_, index) => rows[index]?.outcome?.kind === "revive")
    : [];
  // Hit / Miss / Critical: the use's line says the shared result, and the turn keeps
  // one receipt per target (a miss applies nothing, yet it is still recorded).
  const shared = plan.attack ? sharedAttackOutcome(rows) : undefined;
  const receipts =
    plan.attack && offer.occurrenceId
      ? trayOutcomeReceipts(offer.occurrenceId, offer.actionId, rows)
      : [];
  const declares = shared !== undefined || receipts.length > 0;
  if (applied.length === 0 && killed.length === 0 && revived.length === 0 && !declares)
    return;

  const local = applied.filter((row) => row.target.kind !== "pc");
  const peers = applied.filter((row) => row.target.kind === "pc");
  const label = {
    message: t("combat.damageTray.appliedToast", { name: offer.actionName }),
  };

  if (
    local.length > 0 ||
    declares ||
    peers.length > 0 ||
    killed.length > 0 ||
    revived.length > 0
  ) {
    registerUndoableToast(
      label,
      () => {
        const store = useCharacterStore.getState();
        if (store.readonly || !store.character) return null;
        const before = logIds();
        const reversals: Array<() => void> = [];
        if (shared) reversals.push(stampOutcome(offer.castLogId, shared));
        const receiptIds = useCombatStore.getState().recordOutcomes(receipts);
        reversals.push(() => useCombatStore.getState().withdrawOutcomes(receiptIds));
        for (const { target, amount, conditions, outcome } of local) {
          if (target.kind === "self") {
            if (effect && amount > 0)
              applySelf(effect, amount, source, reversals, plan.onZeroHp);
            for (const conditionId of conditions) {
              if (
                useCharacterStore
                  .getState()
                  .character?.session.conditions.includes(conditionId)
              )
                continue;
              const ids = logIds();
              useCharacterStore.getState().addCondition(conditionId);
              tagNewLine(ids, "condition-gain", source);
              reversals.push(() => {
                useCharacterStore.getState().removeConditionSilent(conditionId);
              });
            }
            continue;
          }
          // A monster: the line is the record (players cannot write monster HP).
          const given = { target: target.id, targetName: target.name, source };
          if (effect && amount > 0)
            store.logEvent({
              kind: "effect-given",
              effect,
              amount,
              ...given,
              ...(outcome && effect === "damage" ? { outcome } : {}),
            });
          for (const conditionId of conditions)
            store.logEvent({
              kind: "effect-given",
              effect: "condition",
              conditionId,
              ...given,
            });
        }
        // Another PC: their sheet is written through the campaign, and the write's
        // own undo restores it (and drops its line) when the apply is taken back.
        const peerUndos: Array<Promise<() => void>> = [];
        for (const target of killed) {
          if (target.kind === "self") {
            const undo = useCharacterStore.getState().dispatch({ kind: "die" });
            if (undo) reversals.push(undo);
          } else if (target.kind === "pc") {
            peerUndos.push(givePeer(target, "die", 0, undefined, source, t));
          } else {
            // A monster: the line is the record, for the DM to apply.
            store.logEvent({
              kind: "effect-given",
              effect: "damage",
              target: target.id,
              targetName: target.name,
              source,
              killed: true,
            });
          }
        }
        for (const target of revive ? revived : []) {
          if (!revive) break;
          if (target.kind === "self") {
            const self = useCharacterStore.getState().character;
            const max = self ? effectiveMaxHp(self.character, self.session) : 1;
            const undo = useCharacterStore
              .getState()
              .dispatch({ kind: "revive", hitPoints: revivalHitPoints(revive, max) });
            if (undo) reversals.push(undo);
          } else if (target.kind === "pc") {
            const max = target.row?.maxHp ?? 1;
            peerUndos.push(
              givePeer(
                target,
                "revive",
                revivalHitPoints(revive, max),
                undefined,
                source,
                t
              )
            );
          }
        }
        for (const { target, amount, conditions, outcome, knockOut } of peers) {
          if (effect && amount > 0)
            peerUndos.push(
              givePeer(target, effect, amount, undefined, source, t, outcome, knockOut)
            );
          for (const conditionId of conditions)
            peerUndos.push(givePeer(target, "condition", 0, conditionId, source, t));
        }
        return () => {
          for (const reverse of reversals.reverse()) reverse();
          // Every line this apply wrote (and any its reversal wrote) goes with it.
          const live = useCharacterStore.getState();
          for (const entry of live.character?.session.logEntries ?? [])
            if (!before.has(entry.id)) live.removeLogEntry(entry.id);
          for (const undo of peerUndos.reverse()) void undo.then((run) => run());
        };
      },
      { turnScoped: false }
    );
  } else {
    useToastStore.getState().showToast({ ...label, duration: 4000 });
  }
}

/** Me: the store's own heal / temp-HP / damage seams, the line they log tagged. */
function applySelf(
  effect: TrayEffect,
  amount: number,
  source: LocText,
  reversals: Array<() => void>,
  /** What dropping to 0 brings (Disintegrate), past the savers. */
  onZeroHp?: "dies" | "disintegrated"
): void {
  const store = useCharacterStore.getState();
  const character = store.character;
  if (!character) return;
  const ids = logIds();
  if (effect === "heal") {
    const undo = store.applyHealing(amount);
    if (undo) reversals.push(undo);
    tagNewLine(ids, "hp-heal", source);
  } else if (effect === "temp-hp") {
    const undo = store.gainTempHp(amount);
    if (undo) reversals.push(undo);
    tagNewLine(ids, "temp-hp-gain", source);
  } else {
    const undo = store.applyDamage(
      amount,
      onZeroHp ? { onZeroHp: { kind: onZeroHp, sourceId: sourceKey(source) } } : undefined
    );
    if (undo) reversals.push(() => void undo());
    tagNewLine(ids, "hp-damage", source);
  }
}

/** Another PC in the live encounter: the campaign PC card's peer write, then a line.
 *  Resolves with its undo: the same peer write reverted, and its line removed. */
function givePeer(
  target: TrayTarget,
  effect: TrayEffect | "condition" | "die" | "revive",
  amount: number,
  conditionId: string | undefined,
  source: LocText,
  t: T,
  outcome?: AttackOutcome,
  knockOut?: true
): Promise<() => void> {
  const row = target.row;
  const memberUid = row?.memberUid;
  const characterId = row?.characterId;
  const log = () =>
    useCharacterStore.getState().logEvent({
      kind: "effect-given",
      // A death reads as damage; a revival as the Hit Points it gives back.
      effect: effect === "die" ? "damage" : effect === "revive" ? "heal" : effect,
      target: target.id,
      targetName: target.name,
      source,
      ...(effect === "die" ? { killed: true as const } : {}),
      ...(effect === "condition" ? { conditionId } : effect === "die" ? {} : { amount }),
      ...(outcome && effect === "damage" ? { outcome } : {}),
    });
  const unlog = (ids: ReadonlySet<string>) => () => {
    const live = useCharacterStore.getState();
    for (const entry of live.character?.session.logEntries ?? [])
      if (!ids.has(entry.id)) live.removeLogEntry(entry.id);
  };
  if (!row || !memberUid || !characterId) {
    const ids = logIds();
    log();
    return Promise.resolve(unlog(ids));
  }
  const mutation =
    effect === "die"
      ? { kind: "die" as const }
      : effect === "revive"
        ? { kind: "revive" as const, hitPoints: amount }
        : effect === "condition"
          ? {
              kind: "condition" as const,
              operation: { kind: "add" as const, conditionId: conditionId ?? "" },
            }
          : effect === "temp-hp"
            ? { kind: "temp-hp" as const, value: Math.max(row.tempHp, amount) }
            : {
                kind: "hp" as const,
                operation: {
                  kind: effect === "heal" ? ("heal" as const) : ("damage" as const),
                  amount,
                  ...(knockOut && effect === "damage" ? { knockOut } : {}),
                },
              };
  const failed = (error: unknown): void => {
    console.error("Combat write failed", error);
    useToastStore
      .getState()
      .showToast({ message: t("campaignHub.combatWriteFailed"), duration: 6000 });
  };
  return import("@/features/campaigns/campaign-io")
    .then(async ({ writeCampaignCombatEffect }) => {
      const { before, after, spends } = await writeCampaignCombatEffect(
        memberUid,
        characterId,
        null,
        row.maxHp,
        mutation
      );
      const ids = logIds();
      log();
      const dropLine = unlog(ids);
      return () => {
        dropLine();
        void writeCampaignCombatEffect(memberUid, characterId, null, row.maxHp, {
          kind: "revert",
          written: after,
          previous: before,
          spends,
        }).catch(failed);
      };
    })
    .catch((error: unknown) => {
      failed(error);
      return () => {};
    });
}

/** The catalogue key of a source, when it is one ("disintegrate"). */
function sourceKey(source: LocText): string | undefined {
  return "srd" in source ? source.srd.key : undefined;
}
