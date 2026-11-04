/**
 * The tray's state writers for a used action: what each target that made its save
 * still gets (Stunning Strike), and what a hit puts on its target (Guiding Bolt), as
 * persistent combat effects in the live fight. Absent outside a fight or when the
 * action has none.
 */
import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { combatEffectsV26On } from "@/lib/deployed-rules";
import { outcomeEffects } from "@/lib/play/outcome-effects";
import type { ActionSummary } from "@/lib/smart-tracker";
import { useAuthStore } from "@/stores/authStore";
import type { ActiveCombatEffect, CombatantRef } from "@/types/combat-effect";

type StateSummary = Pick<
  ActionSummary,
  "saveSuccessEffects" | "hitEffects" | "targetStateSource"
>;

/** What a target's successful save still gets (Stunning Strike). */
export function saveSuccessWriter(
  action: { id: string; summary: StateSummary },
  characterId: string
): ((targetId: string) => ActiveCombatEffect[]) | undefined {
  return stateWriter(action, characterId, "save-success");
}

/** What a hit puts on its target (Guiding Bolt). */
export function hitStateWriter(
  action: { id: string; summary: StateSummary },
  characterId: string
): ((targetId: string) => ActiveCombatEffect[]) | undefined {
  return stateWriter(action, characterId, "hit");
}

function stateWriter(
  action: { id: string; summary: StateSummary },
  characterId: string,
  outcome: "hit" | "save-success"
): ((targetId: string) => ActiveCombatEffect[]) | undefined {
  const effects =
    outcome === "hit" ? action.summary.hitEffects : action.summary.saveSuccessEffects;
  const source = action.summary.targetStateSource;
  const status = useCombatStatusStore.getState().status;
  // A feature's state on its target needs the v0.26.0 rules (deployed-rules); a
  // spell's is accepted today.
  if (!effects?.length || !source || !status) return undefined;
  if (source.kind === "feature" && !combatEffectsV26On()) return undefined;
  const uid = useAuthStore.getState().user?.uid ?? "";
  const actor: CombatantRef = {
    kind: "pc",
    combatantId: status.myId,
    memberUid: uid,
    characterId,
  };
  return (targetId) => {
    const row = status.view.rows.find((r) => r.id === targetId);
    const target: CombatantRef =
      row?.kind === "pc" && row.memberUid && row.characterId
        ? {
            kind: "pc",
            combatantId: row.id,
            memberUid: row.memberUid,
            characterId: row.characterId,
          }
        : { kind: "monster", combatantId: targetId };
    return outcomeEffects({
      source: { kind: source.kind, id: source.id, actionId: action.id },
      effects,
      outcome,
      actor,
      target,
      round: status.round,
      effectId: () => crypto.randomUUID(),
    });
  };
}

/** Vex (a weapon mastery): a hit gives Advantage on the attacker's next attack
 *  against that creature, before the end of the attacker's next turn. Out of a fight,
 *  or before the v0.26.0 rules, the sheet keeps its own next-attack flag instead. */
export function vexWriter(
  action: { id: string; masteryRiders?: ReadonlyArray<{ id: string }> },
  characterId: string
): ((targetId: string) => ActiveCombatEffect[]) | undefined {
  if (!action.masteryRiders?.some((rider) => rider.id === "vex")) return undefined;
  const status = useCombatStatusStore.getState().status;
  if (!status || !combatEffectsV26On()) return undefined;
  const actor = selfRef(status, characterId);
  return (targetId) =>
    outcomeEffects({
      source: { kind: "feature", id: "mastery-vex", actionId: action.id },
      effects: [
        {
          kind: "next-attack-advantage",
          until: { phase: "turn-end", anchor: "actor" },
          activeKey: "vexed",
        },
      ],
      outcome: "hit",
      actor,
      target: targetRef(status, targetId),
      round: status.round,
      effectId: () => crypto.randomUUID(),
    });
}

/** Whether a weapon's Vex is played on its target in this fight (`vexWriter`). */
export function vexIsTargeted(): boolean {
  return Boolean(useCombatStatusStore.getState().status) && combatEffectsV26On();
}

type Status = NonNullable<ReturnType<typeof useCombatStatusStore.getState>["status"]>;

function selfRef(status: Status, characterId: string): CombatantRef {
  return {
    kind: "pc",
    combatantId: status.myId,
    memberUid: useAuthStore.getState().user?.uid ?? "",
    characterId,
  };
}

function targetRef(status: Status, targetId: string): CombatantRef {
  const row = status.view.rows.find((r) => r.id === targetId);
  return row?.kind === "pc" && row.memberUid && row.characterId
    ? {
        kind: "pc",
        combatantId: row.id,
        memberUid: row.memberUid,
        characterId: row.characterId,
      }
    : { kind: "monster", combatantId: targetId };
}

/** Help (attack form), as the effect it leaves: on the enemy, spent by the named
 *  ally's next attack before the start of the helper's next turn. */
export function helpEffect(help: {
  helper: CombatantRef;
  enemy: CombatantRef;
  allyId: string;
  round: number;
  effectId: string;
}): ActiveCombatEffect {
  return {
    id: help.effectId,
    actor: help.helper,
    target: help.enemy,
    source: { kind: "feature", id: "action-help", actionId: "base-help" },
    payload: { kind: "grant-group", activeKey: "helped-against" },
    bindings: { beneficiaryId: help.allyId },
    duration: {
      kind: "turn-boundary",
      combatantId: help.helper.combatantId,
      round: help.round + 1,
      phase: "turn-start",
    },
  };
}

/**
 * Help an ally against an enemy in the live fight (the Help action's «Su chi?» then
 * «Per chi?»): writes the effect, undoable. False outside a fight or before the
 * v0.26.0 rules.
 */
export function giveHelp(enemyId: string, allyId: string, characterId: string): boolean {
  const status = useCombatStatusStore.getState().status;
  if (!status || !combatEffectsV26On()) return false;
  const effect = helpEffect({
    helper: selfRef(status, characterId),
    enemy: targetRef(status, enemyId),
    allyId,
    round: status.round,
    effectId: crypto.randomUUID(),
  });
  const io = import("@/features/campaigns/campaign-io");
  void io
    .then(({ appendPersistentCombatEffect }) =>
      appendPersistentCombatEffect(status.campaignId, effect)
    )
    .catch(() => undefined);
  return true;
}

/** Two per-target writers as one (each may be absent). */
export function combineWriters(
  ...writers: Array<((targetId: string) => ActiveCombatEffect[]) | undefined>
): ((targetId: string) => ActiveCombatEffect[]) | undefined {
  const present = writers.filter((w) => w !== undefined);
  if (present.length === 0) return undefined;
  return (targetId) => present.flatMap((write) => write(targetId));
}
