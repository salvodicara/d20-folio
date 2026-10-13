/**
 * The damage tray (owner 2026-10-12): the intermediate screen right after a use with
 * targets. Copied from Foundry VTT dnd5e's damage-application tray — one rolled total,
 * one row per target with ×0 · ×½ · ×1 · ×2 and the target's resistances, one Apply —
 * plus Roll20 GroupCheck/ApplyDamage's per-target "Saved" toggle. The panel itself is
 * shared with the DM's monster card ({@link DamageTrayPanel}); this file is the
 * sheet's side: which targets the player picked, and where an applied row lands. The
 * app never rolls: the player types what the table rolled.
 *
 * An attack's row also says Colpito · Mancato · Critico (Foundry dnd5e's chat card):
 * Apply writes the shared result onto the use's own log line, the per-target result
 * onto each damage line, and one outcome receipt per target into the turn.
 *
 * Where an applied row lands:
 *  - me → the sheet's own store seams (heal / temp HP / damage / condition), tagged
 *    with the action as source; undoable as ONE step with the monsters' lines;
 *  - another PC in the live encounter → the same peer combat write the campaign PC card
 *    uses, then an `effect-given` log line (a remote write, not undone by Undo);
 *  - a monster → only the `effect-given` log line (players cannot write monster HP).
 * Skip (or closing) applies nothing: the use stays logged exactly as it was.
 */
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { DamageTrayPanel } from "@/components/shared/DamageTrayPanel";
import {
  trayTargetFromRow,
  type TrayTarget,
} from "@/components/shared/damage-tray-target";
import { Dialog } from "@/components/ui/dialog";
import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { useHpControls } from "@/features/character/molecules/use-hp-controls";
import type { LocText } from "@/lib/loc-text";
import {
  rowAmount,
  rowConditions,
  sharedAttackOutcome,
  trayOutcomeReceipts,
  type AttackOutcome,
  type TrayEffect,
  type TrayRow,
} from "@/lib/play/damage-tray";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useToastStore } from "@/stores/toastStore";
import { registerUndoableToast } from "@/stores/undoStore";
import type { CombatEvent } from "@/types/combat-log";

import { useDamageTrayStore, type DamageTrayOffer } from "./damage-tray-store";

export function DamageTray() {
  const offer = useDamageTrayStore((s) => s.offer);
  const characterId = useCharacterStore((s) => s.character?.id);
  const open = offer !== null && offer.characterId === characterId;
  // Leaving the sheet (the provider unmounts) drops a tray nobody answered: it must
  // never reappear over another screen. Skipping is the default anyway.
  useEffect(() => () => useDamageTrayStore.getState().close(), []);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) useDamageTrayStore.getState().close();
      }}
    >
      {open && <DamageTrayContent key={offer.castLogId ?? "tray"} offer={offer} />}
    </Dialog>
  );
}

function DamageTrayContent({ offer }: { offer: DamageTrayOffer }) {
  const { t } = useTranslation();
  const { plan } = offer;
  const hp = useHpControls();
  const selfName = useCharacterStore((s) => s.character?.character.name ?? "");
  const status = useCombatStatusStore((s) => s.status);
  const uid = useAuthStore((s) => s.user?.uid);
  // The same "me" the commit used (TurnEconomyProvider.selfCombatantId).
  const selfId = status?.myId ?? (uid ? `pc-${uid}` : "self");

  const targets = useMemo<TrayTarget[]>(
    () =>
      plan.targets.map((id): TrayTarget => {
        if (id === selfId)
          return {
            id,
            name: selfName,
            kind: "self",
            hp: { current: hp.current, max: hp.max, temp: hp.temp },
            defenses: hp.defenses,
          };
        const row = status?.view.rows.find((r) => r.id === id);
        if (!row) return { id, name: id, kind: "monster" };
        return trayTargetFromRow(row, row.kind === "pc" || row.side === "ally");
      }),
    // The rows are fixed for the tray's life: the targets were picked already.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <DamageTrayPanel
      title={offer.actionName}
      plan={plan}
      targets={targets}
      onApply={(rows, total) => {
        applyTray(offer, targets, rows, total, t);
        useDamageTrayStore.getState().close();
      }}
      onSkip={() => useDamageTrayStore.getState().close()}
    />
  );
}

type T = ReturnType<typeof useTranslation>["t"];

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

function applyTray(
  offer: DamageTrayOffer,
  targets: ReadonlyArray<TrayTarget>,
  rows: ReadonlyArray<TrayRow>,
  total: number,
  t: T
): void {
  const { plan, source } = offer;
  const effect = plan.effect;
  const applied: AppliedRow[] = targets
    .map((target, index) => {
      const row = rows[index];
      return {
        target,
        amount: effect && row ? rowAmount(total, row, plan) : 0,
        conditions: row ? rowConditions(row) : [],
        ...(row?.attack ? { outcome: row.attack } : {}),
      };
    })
    .filter((row) => row.amount > 0 || row.conditions.length > 0);
  // Hit / Miss / Critical: the use's line says the shared result, and the turn keeps
  // one receipt per target (a miss applies nothing, yet it is still recorded).
  const shared = plan.attack ? sharedAttackOutcome(rows) : undefined;
  const receipts =
    plan.attack && offer.occurrenceId
      ? trayOutcomeReceipts(offer.occurrenceId, offer.actionId, rows)
      : [];
  const declares = shared !== undefined || receipts.length > 0;
  if (applied.length === 0 && !declares) return;

  const local = applied.filter((row) => row.target.kind !== "pc");
  const peers = applied.filter((row) => row.target.kind === "pc");
  const label = {
    message: t("combat.damageTray.appliedToast", { name: offer.actionName }),
  };

  if (local.length > 0 || declares) {
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
            if (effect && amount > 0) applySelf(effect, amount, source, reversals);
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
        return () => {
          for (const reverse of reversals.reverse()) reverse();
          // Every line this apply wrote (and any its reversal wrote) goes with it.
          const live = useCharacterStore.getState();
          for (const entry of live.character?.session.logEntries ?? [])
            if (!before.has(entry.id)) live.removeLogEntry(entry.id);
        };
      },
      { turnScoped: false }
    );
  } else {
    useToastStore.getState().showToast({ ...label, duration: 4000 });
  }

  for (const { target, amount, conditions, outcome } of peers) {
    if (effect && amount > 0)
      givePeer(target, effect, amount, undefined, source, t, outcome);
    for (const conditionId of conditions)
      givePeer(target, "condition", 0, conditionId, source, t);
  }
}

/** Me: the store's own heal / temp-HP / damage seams, the line they log tagged. */
function applySelf(
  effect: TrayEffect,
  amount: number,
  source: LocText,
  reversals: Array<() => void>
): void {
  const store = useCharacterStore.getState();
  const character = store.character;
  if (!character) return;
  const ids = logIds();
  if (effect === "heal") {
    const { hp, deathSucc, deathFail, conditions } = character.session;
    const snapshot = {
      current: hp.current,
      temp: hp.temp,
      deathSucc,
      deathFail,
      conditions: [...conditions],
    };
    store.applyHealing(amount);
    reversals.push(() => useCharacterStore.getState().restoreHpSnapshot(snapshot));
    tagNewLine(ids, "hp-heal", source);
  } else if (effect === "temp-hp") {
    const prevTemp = character.session.hp.temp;
    store.gainTempHp(amount);
    reversals.push(() => useCharacterStore.getState().setTempHP(prevTemp));
    tagNewLine(ids, "temp-hp-gain", source);
  } else {
    const undo = store.applyDamage(amount);
    if (undo) reversals.push(() => void undo());
    tagNewLine(ids, "hp-damage", source);
  }
}

/** Another PC in the live encounter: the campaign PC card's peer write, then a line. */
function givePeer(
  target: TrayTarget,
  effect: TrayEffect | "condition",
  amount: number,
  conditionId: string | undefined,
  source: LocText,
  t: T,
  outcome?: AttackOutcome
): void {
  const row = target.row;
  const memberUid = row?.memberUid;
  const characterId = row?.characterId;
  const log = () =>
    useCharacterStore.getState().logEvent({
      kind: "effect-given",
      effect,
      target: target.id,
      targetName: target.name,
      source,
      ...(effect === "condition" ? { conditionId } : { amount }),
      ...(outcome && effect === "damage" ? { outcome } : {}),
    });
  if (!row || !memberUid || !characterId) {
    log();
    return;
  }
  const mutation =
    effect === "condition"
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
            },
          };
  void import("@/features/campaigns/campaign-io")
    .then(({ writeCampaignCombatEffect }) =>
      writeCampaignCombatEffect(memberUid, characterId, null, row.maxHp, mutation)
    )
    .then(log)
    .catch((error: unknown) => {
      console.error("Combat write failed", error);
      useToastStore
        .getState()
        .showToast({ message: t("campaignHub.combatWriteFailed"), duration: 6000 });
    });
}
