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
 * world can never freeze a live table). No caller ever chooses a path. The
 * same doctrine covers the DM heal tap ({@link applyAdversaryHeal}, replacing
 * `recordMonsterHp`), the table's turn stepping ({@link stepEncounterTurn} —
 * each advance off a rolled adversary fires the kernel's own `complete-turn`
 * boundary so booked lifetimes expire exactly when the table steps), and the
 * chronicle's one-tap undo ({@link undoAdversaryChronicleEvent} — an
 * engine-mirrored beat reverses its exact journal action, never arithmetic).
 */

import {
  adversaryConditionCapability,
  adversaryDamageCapability,
  adversaryEntityRef,
  adversaryHealCapability,
  commitEncounterWorldAction,
  encounterWorldState,
  engineConditionIds,
  legacyMonsters,
  planAdversaryTurnBoundary,
  runAdversaryAction,
  undoEncounterWorldAction,
  type AdversaryActionCapability,
} from "@/lib/encounter-world-store";
import { canonicalFingerprint } from "@/lib/canonical-fingerprint";
import {
  appendEvent,
  recordCondition,
  recordMonsterDamage,
  recordMonsterHp,
  undoConditionEvent,
  undoHpEvent,
} from "@/features/campaigns/combat-chronicle";
import {
  advanceTurn,
  isDown,
  prevTurn,
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
 * write through the same debounced campaign writer. `engineActionId` stamps
 * every appended beat with the journal action it mirrors, so the chronicle
 * undo can reverse THAT action exactly ({@link undoAdversaryChronicleEvent}).
 */
export function mirrorAdversaryCommit(
  encounter: EncounterState,
  before: Readonly<SharedMaterialState>,
  after: Readonly<SharedMaterialState>,
  provenance?: AdversaryActionProvenance,
  engineActionId?: string
): EncounterState {
  const stamp = engineActionId ? { engineActionId } : {};
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
          ...stamp,
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
          ...stamp,
        });
      }
      if (!wasDown && afterVitals.current === 0) {
        next = appendEvent(next, { kind: "down", targetId: monster.id, ...stamp });
      }
    }
    const beforeConditions = engineConditionIds(before, monster.id);
    const afterConditions = engineConditionIds(after, monster.id);
    for (const conditionId of afterConditions) {
      if (beforeConditions.has(conditionId) || monster.conditions.includes(conditionId))
        continue;
      next = setMonsterCondition(next, monster.id, conditionId, true);
      next = recordCondition(next, monster.id, conditionId, true, {
        ...provenance,
        ...stamp,
      });
    }
    for (const conditionId of beforeConditions) {
      // Only ENGINE-held conditions release the legacy chip: a DM's manual
      // toggle is never clobbered by an engine expiry it does not own.
      if (afterConditions.has(conditionId) || !monster.conditions.includes(conditionId))
        continue;
      next = setMonsterCondition(next, monster.id, conditionId, false);
      next = recordCondition(next, monster.id, conditionId, false, {
        ...provenance,
        ...stamp,
      });
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
  return mirrorAdversaryCommit(
    encounter,
    world,
    committed,
    provenance,
    outcome.action.id
  );
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

/**
 * Book one healing total onto one adversary through the deterministic engine —
 * the same boundary discipline as {@link applyAdversaryDamage}. The kernel's
 * healing law gives the exact legacy semantics: current HP rises by the booked
 * amount clamped at the maximum (never an overheal), temporary hit points
 * untouched, and a full-HP heal is a clean no-op (no beat). A 0-HP adversary
 * takes the DEGRADATION deliberately: the canonical world models it as DEAD
 * (encounter adversaries carry no death saves, and `healCreature` rejects a
 * dead creature — resurrection is a separate program), so the DM's revive tap
 * is a table correction that stays on the legacy arithmetic until the
 * encounter model carries typed down-states.
 */
export function applyAdversaryHeal(
  encounter: EncounterState,
  campaignId: string,
  monsterId: string,
  amount: number,
  provenance?: AdversaryActionProvenance
): EncounterState {
  if (!Number.isFinite(amount)) return encounter;
  const restored = Math.max(0, Math.round(amount));
  if (restored <= 0) return encounter;
  const monster = encounter.combatants.find(({ id }) => id === monsterId);
  if (!monster || monster.kind !== "monster") return encounter;
  if (monster.hp.current > 0) {
    const world = encounterWorldState(encounter, campaignId);
    const entity = world?.entities[monsterId];
    if (world && entity?.kind === "creature") {
      const committed = runCapability(
        encounter,
        campaignId,
        world,
        adversaryHealCapability(
          adversaryEntityRef(campaignId, monsterId, entity.ordinal),
          restored
        ),
        `adversary-heal:${canonicalFingerprint({
          amount: restored,
          monsterId,
          revision: world.revision,
        })}`,
        provenance
      );
      if (committed) return committed;
    }
  }
  // Fail-closed degradation (corrupt persisted world, or the 0-HP revive tap
  // documented above). Reached only from INSIDE this boundary.
  return recordMonsterHp(encounter, monsterId, monster.hp.current + restored);
}

/**
 * Step the table's turn pointer, ENGINE-FIRST: when the pre-step pointer rests
 * on a rolled adversary (the derived canonical phase is "turns"), advancing
 * fires the kernel's own `complete-turn` boundary over the derived world —
 * that adversary's turn ends canonically, so every lifetime booked against
 * the crossed boundaries (condition ends, damage-over-time ends) expires
 * exactly when the table steps the tracker — and the commit mirrors the
 * expiries back onto the legacy chips + chronicle in the SAME encounter value
 * (one write). A pointer resting on a PC or roll-less adversary ends no
 * canonical turn (the v1 composition scope lists adversary participants
 * only), so those steps move the legacy pointer alone — which is also what
 * keeps a PLAYER'S own-turn advance inside the member `turnFieldsOnlyChanged`
 * rules grant. When the engine layer cannot serve (corrupt world, boundary
 * reject), the pointer still steps and booked lifetimes STAND — fail-closed
 * never expires anything early.
 *
 * BACK-STEP DEGRADATION (the documented model): the kernel's complete-turn
 * boundary is one-way — end waves latch and finalize; there is no un-fire.
 * Stepping back therefore rewinds ONLY the legacy pointer; engine-expired
 * lifetimes stay expired (an expiry is a fact the table crossed, not an
 * animation to rewind), and the DM re-books a genuinely lost condition
 * manually — or reverses the exact expiry from its chronicle line
 * ({@link undoAdversaryChronicleEvent}). Honest over pretend-reversal.
 */
export function stepEncounterTurn(
  encounter: EncounterState,
  campaignId: string,
  dir: "next" | "prev"
): EncounterState {
  if (dir === "prev") return prevTurn(encounter);
  const stepped = advanceTurn(encounter);
  if (stepped === encounter) return encounter;
  const world = encounterWorldState(encounter, campaignId);
  if (!world || world.encounter?.phase !== "turns") return stepped;
  const actionId = `adversary-turn:${canonicalFingerprint({
    from: encounter.currentCombatantId,
    revision: world.revision,
    round: encounter.round,
  })}`;
  const action = planAdversaryTurnBoundary(campaignId, world, actionId);
  if (!action) return stepped;
  const committed = commitEncounterWorldAction(
    campaignId,
    world,
    action,
    action.guards.facts.map((fact) => ({
      actual: fact.expected,
      address: fact.address,
      owner: fact.owner,
    }))
  );
  if (!committed) return stepped;
  return mirrorAdversaryCommit(stepped, world, committed, undefined, actionId);
}

/**
 * UNDO one chronicle beat, ENGINE-FIRST: a beat stamped with its journal
 * action (`engineActionId` — every engine-mirrored beat carries one) reverses
 * THAT action through the canonical journal reducer (generation 1 → 2), so hp
 * trio, temporary hit points, condition occurrences and their booked
 * lifetimes all restore EXACTLY — never blind arithmetic. The mirror then
 * writes the reverted world-owned facts back onto the legacy fields WITHOUT
 * appending new beats (an undo removes lines, it never narrates), drops every
 * line of the undone action plus a now-stale `down` line, and persists the
 * reverted world in the same value. A beat that predates the world layer (no
 * `engineActionId`), a corrupt persisted world, or a journal conflict (a
 * later action moved the same facts) degrades to the legacy one-tap
 * arithmetic (`undoHpEvent`/`undoConditionEvent`) — reached only from INSIDE
 * this boundary; no caller ever picks a path.
 */
export function undoAdversaryChronicleEvent(
  encounter: EncounterState,
  campaignId: string,
  eventId: string
): EncounterState {
  const event = encounter.events?.find((candidate) => candidate.id === eventId);
  if (!event) return encounter;
  const isHp = event.kind === "hp-damage" || event.kind === "hp-heal";
  const isCondition = event.kind === "condition-gain" || event.kind === "condition-loss";
  if (!isHp && !isCondition) return encounter;
  const target = encounter.combatants.find(({ id }) => id === event.targetId);
  if (!target || target.kind !== "monster") return encounter;
  const actionId = event.engineActionId;
  const world =
    actionId === undefined ? null : encounterWorldState(encounter, campaignId);
  const reverted =
    world && actionId !== undefined
      ? undoEncounterWorldAction(campaignId, world, actionId)
      : null;
  if (!world || !reverted) {
    return isCondition
      ? undoConditionEvent(encounter, eventId)
      : undoHpEvent(encounter, eventId);
  }
  // The exact silent mirror: legacy hp trio + engine-held chips follow the
  // reverted world; no new chronicle beats are appended.
  let next: EncounterState = encounter;
  for (const monster of legacyMonsters(encounter)) {
    const beforeEntity = world.entities[monster.id];
    const afterEntity = reverted.entities[monster.id];
    if (beforeEntity?.kind !== "creature" || afterEntity?.kind !== "creature") continue;
    const beforeVitals = beforeEntity.vitals.hitPoints;
    const afterVitals = afterEntity.vitals.hitPoints;
    if (
      beforeVitals.current !== afterVitals.current ||
      beforeVitals.temporary.current !== afterVitals.temporary.current
    ) {
      next = setMonsterTempHp(next, monster.id, afterVitals.temporary.current);
      next = setHp(next, monster.id, afterVitals.current);
    }
    const beforeConditions = engineConditionIds(world, monster.id);
    const afterConditions = engineConditionIds(reverted, monster.id);
    for (const conditionId of afterConditions) {
      if (!beforeConditions.has(conditionId)) {
        next = setMonsterCondition(next, monster.id, conditionId, true);
      }
    }
    for (const conditionId of beforeConditions) {
      if (!afterConditions.has(conditionId) && monster.conditions.includes(conditionId)) {
        next = setMonsterCondition(next, monster.id, conditionId, false);
      }
    }
  }
  // Drop EVERY line of the undone action (one commit can mirror several
  // beats), then any `down` line whose target stands again after the restore.
  const removedTargets = new Set<string>();
  const withoutAction = (next.events ?? []).filter((candidate) => {
    if (candidate.engineActionId !== actionId) return true;
    if ("targetId" in candidate && typeof candidate.targetId === "string") {
      removedTargets.add(candidate.targetId);
    }
    return false;
  });
  const events = withoutAction.filter((candidate) => {
    if (candidate.kind !== "down" || !removedTargets.has(candidate.targetId)) {
      return true;
    }
    const monster = next.combatants.find(({ id }) => id === candidate.targetId);
    return monster?.kind === "monster" && isDown(monster);
  });
  return { ...next, events, world: reverted };
}
