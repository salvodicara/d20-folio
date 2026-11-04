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

/** Help, as the effect it leaves, before the start of the helper's next turn: on an
 *  enemy, spent by the next attack of one of the helper's allies (`helped-against`);
 *  on an ally, Advantage on its next ability check, spent by that check
 *  (`helped-check`). */
export function helpEffect(help: {
  helper: CombatantRef;
  /** The creature named: an enemy (attack form) or an ally (check form). */
  enemy: CombatantRef;
  round: number;
  effectId: string;
  form?: "attack" | "check";
}): ActiveCombatEffect {
  return {
    id: help.effectId,
    actor: help.helper,
    target: help.enemy,
    source: { kind: "feature", id: "action-help", actionId: "base-help" },
    payload: {
      kind: "grant-group",
      activeKey: help.form === "check" ? "helped-check" : "helped-against",
    },
    duration: {
      kind: "turn-boundary",
      combatantId: help.helper.combatantId,
      round: help.round + 1,
      phase: "turn-start",
    },
  };
}

/**
 * Help in the live fight (the Help action's «Su chi?»): on an enemy, the effect
 * that lets an ally attack it with Advantage; on an ally, Advantage on its next
 * ability check. Writes the effect and returns its undo. Null outside a fight or
 * before the v0.26.0 rules.
 */
export function giveHelp(targetId: string, characterId: string): (() => void) | null {
  const status = useCombatStatusStore.getState().status;
  if (!status || !combatEffectsV26On()) return null;
  const helper = selfRef(status, characterId);
  const sideOf = fightSideOf(status.view.rows);
  const effect = helpEffect({
    helper,
    enemy: targetRef(status, targetId),
    round: status.round,
    effectId: crypto.randomUUID(),
    form: sideOf(targetId) === sideOf(helper.combatantId) ? "check" : "attack",
  });
  const io = import("@/features/campaigns/campaign-io");
  void io
    .then(({ appendPersistentCombatEffect }) =>
      appendPersistentCombatEffect(status.campaignId, effect)
    )
    .catch(() => undefined);
  return () => {
    void io
      .then(({ revokePersistentCombatEffect }) =>
        revokePersistentCombatEffect(status.campaignId, effect.id)
      )
      .catch(() => undefined);
  };
}

/** A fight's sides by combatant: a row's own side, else a PC's is the party's. */
export function fightSideOf(
  rows: ReadonlyArray<{ id: string; kind: "pc" | "monster"; side?: string }>
): (combatantId: string) => "party" | "enemy" {
  const sides = new Map(
    rows.map((row) => [
      row.id,
      (row.side ?? (row.kind === "pc" ? "ally" : "enemy")) === "enemy"
        ? ("enemy" as const)
        : ("party" as const),
    ])
  );
  return (id) => sides.get(id) ?? (id.startsWith("pc-") ? "party" : "enemy");
}

/** Two per-target writers as one (each may be absent). */
export function combineWriters(
  ...writers: Array<((targetId: string) => ActiveCombatEffect[]) | undefined>
): ((targetId: string) => ActiveCombatEffect[]) | undefined {
  const present = writers.filter((w) => w !== undefined);
  if (present.length === 0) return undefined;
  return (targetId) => present.flatMap((write) => write(targetId));
}
