/**
 * encounter-world-command — the COMMAND BOUNDARY between the campaign hub and
 * the deterministic mechanics engine for adversary state.
 *
 * Each command is a PURE `EncounterState → EncounterState` reducer (the exact
 * shape the legacy reducers had), so it rides the SAME `setEncounter` seam —
 * optimistic store set + the debounced campaign writer — with zero new write
 * topology. Inside, the flow is the canonical engine loop: derive the shared
 * world from the encounter document (`encounterWorldState`, fail-closed) →
 * run one causal action through the coordinator → commit through the journal
 * reducer (CAS-guarded) → MIRROR the world-owned adversary facts back onto
 * the legacy fields every still-legacy surface reads (hp trio + condition
 * chips + the combat chronicle beat) and persist the committed world in the
 * same encounter value.
 *
 * DM damage taps dispatch {@link applyAdversaryDamage} — it REPLACED the
 * direct `recordMonsterDamage` callsite (the legacy arithmetic survives only
 * INSIDE this boundary as the fail-closed degradation, so a corrupt persisted
 * world can never freeze a live table). No caller ever chooses a path.
 */

import {
  adversaryConditionCapability,
  adversaryDamageCapability,
  adversaryEntityRef,
  commitEncounterWorldAction,
  encounterWorldState,
  engineConditionIds,
  legacyMonsters,
  runAdversaryAction,
  type AdversaryActionCapability,
} from "@/lib/encounter-world-store";
import { canonicalFingerprint } from "@/lib/canonical-fingerprint";
import {
  appendEvent,
  recordCondition,
  recordMonsterDamage,
} from "@/features/campaigns/combat-chronicle";
import {
  isDown,
  setHp,
  setMonsterCondition,
  setMonsterTempHp,
} from "@/features/campaigns/encounter";
import type { EncounterState } from "@/types/campaign";
import type { LocText } from "@/lib/loc-text";
import type { SharedMaterialState } from "@/types/material-state";
import type { MechanicsCoordinationResult } from "@/types/mechanics-coordinator";

export interface AdversaryActionProvenance {
  readonly action?: LocText;
  readonly actorId?: string;
}

/**
 * Mirror the world-owned adversary facts onto the exact legacy encounter
 * fields every still-legacy surface reads (hp trio + conditions + the combat
 * chronicle beat), and persist the committed world in the same value — one
 * write through the same debounced campaign writer.
 */
export function mirrorAdversaryCommit(
  encounter: EncounterState,
  before: Readonly<SharedMaterialState>,
  after: Readonly<SharedMaterialState>,
  provenance?: AdversaryActionProvenance
): EncounterState {
  let next: EncounterState = encounter;
  for (const monster of legacyMonsters(encounter)) {
    const beforeEntity = before.entities[monster.id];
    const afterEntity = after.entities[monster.id];
    if (beforeEntity?.kind !== "creature" || afterEntity?.kind !== "creature") continue;
    const beforeVitals = beforeEntity.vitals.hitPoints;
    const afterVitals = afterEntity.vitals.hitPoints;
    const wasDown = isDown(monster);
    if (
      beforeVitals.current !== afterVitals.current ||
      beforeVitals.temporary.current !== afterVitals.temporary.current
    ) {
      next = setMonsterTempHp(next, monster.id, afterVitals.temporary.current);
      next = setHp(next, monster.id, afterVitals.current);
      const landed =
        beforeVitals.current +
        beforeVitals.temporary.current -
        afterVitals.current -
        afterVitals.temporary.current;
      const tempAbsorbed = Math.max(
        0,
        beforeVitals.temporary.current - afterVitals.temporary.current
      );
      if (landed > 0) {
        next = appendEvent(next, {
          amount: landed,
          current: afterVitals.current,
          kind: "hp-damage",
          max: monster.hp.max,
          targetId: monster.id,
          ...(tempAbsorbed > 0 ? { tempAbsorbed } : {}),
          ...(provenance?.actorId ? { attackerId: provenance.actorId } : {}),
          ...(provenance?.action ? { action: provenance.action } : {}),
        });
      } else if (landed < 0) {
        next = appendEvent(next, {
          amount: -landed,
          current: afterVitals.current,
          kind: "hp-heal",
          max: monster.hp.max,
          targetId: monster.id,
          ...(provenance?.actorId ? { actorId: provenance.actorId } : {}),
          ...(provenance?.action ? { action: provenance.action } : {}),
        });
      }
      if (!wasDown && afterVitals.current === 0) {
        next = appendEvent(next, { kind: "down", targetId: monster.id });
      }
    }
    const beforeConditions = engineConditionIds(before, monster.id);
    const afterConditions = engineConditionIds(after, monster.id);
    for (const conditionId of afterConditions) {
      if (beforeConditions.has(conditionId) || monster.conditions.includes(conditionId))
        continue;
      next = setMonsterCondition(next, monster.id, conditionId, true);
      next = recordCondition(next, monster.id, conditionId, true, provenance);
    }
    for (const conditionId of beforeConditions) {
      // Only ENGINE-held conditions release the legacy chip: a DM's manual
      // toggle is never clobbered by an engine expiry it does not own.
      if (afterConditions.has(conditionId) || !monster.conditions.includes(conditionId))
        continue;
      next = setMonsterCondition(next, monster.id, conditionId, false);
      next = recordCondition(next, monster.id, conditionId, false, provenance);
    }
  }
  return { ...next, world: after };
}

function completedCommit(
  encounter: EncounterState,
  campaignId: string,
  world: Readonly<SharedMaterialState>,
  outcome: Readonly<MechanicsCoordinationResult>,
  provenance?: AdversaryActionProvenance
): EncounterState | null {
  if (outcome.status !== "complete" || !outcome.action) return null;
  const committed = commitEncounterWorldAction(
    campaignId,
    world,
    outcome.action,
    outcome.action.guards.facts.map((fact) => ({
      actual: fact.expected,
      address: fact.address,
      owner: fact.owner,
    }))
  );
  if (!committed) return null;
  return mirrorAdversaryCommit(encounter, world, committed, provenance);
}

function runCapability(
  encounter: EncounterState,
  campaignId: string,
  world: Readonly<SharedMaterialState>,
  capability: Readonly<AdversaryActionCapability> | null,
  actionId: string,
  provenance?: AdversaryActionProvenance
): EncounterState | null {
  if (!capability) return null;
  const outcome = runAdversaryAction(campaignId, world, capability, actionId);
  if (!outcome) return null;
  if (outcome.status === "complete" && outcome.action === null) return encounter;
  return completedCommit(encounter, campaignId, world, outcome, provenance);
}

/**
 * Book one landed damage total onto one adversary through the deterministic
 * engine (derive → run → journal-commit → mirror), returning the next
 * encounter value for the same `setEncounter` seam the legacy reducer used.
 */
export function applyAdversaryDamage(
  encounter: EncounterState,
  campaignId: string,
  monsterId: string,
  amount: number,
  provenance?: AdversaryActionProvenance
): EncounterState {
  if (!Number.isFinite(amount)) return encounter;
  const landed = Math.max(0, Math.round(amount));
  if (landed <= 0) return encounter;
  const monster = encounter.combatants.find(({ id }) => id === monsterId);
  if (!monster || monster.kind !== "monster") return encounter;
  const world = encounterWorldState(encounter, campaignId);
  const entity = world?.entities[monsterId];
  if (world && entity?.kind === "creature") {
    const committed = runCapability(
      encounter,
      campaignId,
      world,
      adversaryDamageCapability(
        adversaryEntityRef(campaignId, monsterId, entity.ordinal),
        landed
      ),
      `adversary-damage:${canonicalFingerprint({
        amount: landed,
        monsterId,
        revision: world.revision,
      })}`,
      provenance
    );
    if (committed) return committed;
  }
  // Fail-closed degradation: the table keeps running on the legacy arithmetic
  // when the engine layer cannot serve (corrupt persisted world). Reached
  // only from INSIDE this boundary — no caller ever picks a path.
  return recordMonsterDamage(
    encounter,
    monsterId,
    landed,
    provenance?.actorId,
    provenance?.action
  );
}

/**
 * Book one condition with a turn-boundary lifetime onto one adversary through
 * the engine — the same boundary discipline as {@link applyAdversaryDamage}.
 * Unlike damage there is no legacy degradation: a lifetime only exists as an
 * engine fact, so when the engine layer cannot serve, the same encounter
 * value returns unchanged and the manual condition toggle remains the tool.
 */
export function applyAdversaryCondition(
  encounter: EncounterState,
  campaignId: string,
  monsterId: string,
  conditionId: string,
  lifetime: { readonly phase: "end" | "start"; readonly turns: number },
  provenance?: AdversaryActionProvenance
): EncounterState {
  const monster = encounter.combatants.find(({ id }) => id === monsterId);
  if (!monster || monster.kind !== "monster") return encounter;
  const world = encounterWorldState(encounter, campaignId);
  const entity = world?.entities[monsterId];
  if (!world || entity?.kind !== "creature") return encounter;
  return (
    runCapability(
      encounter,
      campaignId,
      world,
      adversaryConditionCapability(
        adversaryEntityRef(campaignId, monsterId, entity.ordinal),
        conditionId,
        lifetime
      ),
      `adversary-condition:${canonicalFingerprint({
        conditionId,
        lifetime,
        monsterId,
        revision: world.revision,
      })}`,
      provenance
    ) ?? encounter
  );
}
