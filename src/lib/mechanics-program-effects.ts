/** Pure effect-lifecycle primitives shared by the MechanicsProgram compiler. */

import { materialRefKey } from "@/lib/action-journal";
import { canonicalFingerprint, canonicalJson } from "@/lib/canonical-fingerprint";
import { evaluateIntegerExpression } from "@/lib/integer-expression";
import { isEffectOccurrence, selectOccurrenceEntries } from "@/lib/mechanic-occurrences";
import {
  conformMechanicId,
  conformOccurrenceGenerationRef,
  entityRefKey,
  occurrenceGenerationRefKey,
} from "@/lib/mechanics-reference-schema";
import type {
  EffectOccurrence,
  EndRule,
  StandingFact,
} from "@/types/mechanic-occurrence";
import type {
  ClockRef,
  EntityRef,
  MaterialRef,
  OccurrenceGenerationRef,
} from "@/types/mechanics-reference";
import type { EncounterState, MaterialTimeline } from "@/types/material-state";
import type {
  MechanicsLifetimeSpec,
  MechanicsStep,
} from "@/types/mechanics-program-authoring";
import type { MechanicsWorld } from "@/types/mechanics-world";

type StandingFactTemplate = Extract<MechanicsStep, { readonly kind: "standing" }>["fact"];

export interface MechanicsProgramEffectIdentity {
  readonly execution: number;
  readonly phaseId: string;
  readonly root: Readonly<OccurrenceGenerationRef>;
  readonly slot: number;
  readonly stepId: string;
}

export interface ResolvedMechanicsMaterialClocks {
  readonly encounter: {
    readonly clock: Readonly<ClockRef>;
    readonly state: Readonly<EncounterState>;
  } | null;
  readonly timeline: {
    readonly clock: Readonly<ClockRef>;
    readonly state: Readonly<MaterialTimeline>;
  };
}

export interface MechanicsLifetimeResolutionContext {
  readonly bindings: Readonly<Record<string, number>>;
  /** Required only by rest and turn-boundary lifetimes. */
  readonly combatant: Readonly<EntityRef> | null;
  readonly currentPhaseId: string;
  /** Last reached boundary of the current combatant's turn. */
  readonly currentTurnPhase: "start" | "active" | "end";
  readonly execution: number;
  readonly phaseExecutions: Readonly<Record<string, number>>;
  readonly root: Readonly<OccurrenceGenerationRef>;
  readonly world: Readonly<MechanicsWorld>;
}

export interface MaterializedMechanicsStandingFact {
  readonly fact: Readonly<StandingFact>;
  readonly target: Readonly<EntityRef>;
}

export type ActiveMechanicsEffectMatcher =
  | {
      readonly conditionId?: string;
      readonly kind: "condition";
      readonly root?: Readonly<OccurrenceGenerationRef>;
      readonly target?: Readonly<EntityRef>;
    }
  | {
      readonly fact?: Readonly<StandingFact>;
      readonly kind: "standing";
      readonly root?: Readonly<OccurrenceGenerationRef>;
      readonly target?: Readonly<EntityRef>;
    }
  | {
      readonly kind: "concentration";
      readonly root?: Readonly<OccurrenceGenerationRef>;
      readonly target?: Readonly<EntityRef>;
    }
  | {
      readonly formId?: string;
      readonly kind: "polymorph-form";
      readonly root?: Readonly<OccurrenceGenerationRef>;
      readonly target?: Readonly<EntityRef>;
    };

interface ActiveEffectEntry {
  readonly id: string;
  readonly material: Readonly<MaterialRef>;
  readonly occurrence: Readonly<EffectOccurrence>;
}

/** Convert one zero-based expansion index to its durable one-based slot. */
export function mechanicsProgramExpansionSlot(index: number): number | null {
  return Number.isSafeInteger(index) && index >= 0 && index < Number.MAX_SAFE_INTEGER
    ? index + 1
    : null;
}

/** Stable occurrence address for one exact authored effect expansion. */
export function mechanicsProgramEffectOccurrenceId(
  identity: Readonly<MechanicsProgramEffectIdentity>
): string | null {
  return conformOccurrenceGenerationRef(identity.root) &&
    conformMechanicId(identity.phaseId) &&
    conformMechanicId(identity.stepId) &&
    Number.isSafeInteger(identity.execution) &&
    identity.execution > 0 &&
    Number.isSafeInteger(identity.slot) &&
    identity.slot > 0
    ? `effect:${canonicalFingerprint({
        execution: identity.execution,
        kind: "program-effect",
        phaseId: identity.phaseId,
        root: identity.root,
        slot: identity.slot,
        stepId: identity.stepId,
      })}`
    : null;
}

function documentFor(world: Readonly<MechanicsWorld>, material: Readonly<MaterialRef>) {
  const key = materialRefKey(material);
  return world.documents.find((document) => materialRefKey(document.material) === key);
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Resolve a material's leased clocks without duplicating clock state. */
export function resolveMechanicsMaterialClocks(
  world: Readonly<MechanicsWorld>,
  owner: Readonly<MaterialRef>
): Readonly<ResolvedMechanicsMaterialClocks> | null {
  const ownerDocument = documentFor(world, owner);
  if (
    !ownerDocument ||
    ownerDocument.kind !== (owner.kind === "character-play" ? "character" : "shared")
  ) {
    return null;
  }

  const timelineClock =
    ownerDocument.kind === "character"
      ? ownerDocument.state.clockBinding.timeline
      : { epoch: ownerDocument.state.timeline.epoch, material: ownerDocument.material };
  const timelineDocument = documentFor(world, timelineClock.material);
  if (
    !timelineDocument ||
    timelineDocument.state.timeline.epoch !== timelineClock.epoch
  ) {
    return null;
  }

  const encounterClock =
    ownerDocument.kind === "character"
      ? ownerDocument.state.clockBinding.encounter
      : ownerDocument.state.encounter
        ? {
            epoch: ownerDocument.state.encounter.epoch,
            material: ownerDocument.material,
          }
        : null;
  if (encounterClock === null) {
    return {
      encounter: null,
      timeline: { clock: timelineClock, state: timelineDocument.state.timeline },
    };
  }
  const encounterDocument = documentFor(world, encounterClock.material);
  const encounter = encounterDocument?.state.encounter;
  return encounter?.epoch === encounterClock.epoch
    ? {
        encounter: { clock: encounterClock, state: encounter },
        timeline: { clock: timelineClock, state: timelineDocument.state.timeline },
      }
    : null;
}

function resolvedTurnBoundary(
  spec: Readonly<Extract<MechanicsLifetimeSpec, { readonly kind: "turn-boundary" }>>,
  context: Readonly<MechanicsLifetimeResolutionContext>
): Readonly<EndRule> | null {
  const turns = evaluateIntegerExpression(spec.offsetTurns, context.bindings);
  const combatant = context.combatant;
  if (turns === null || turns < 1 || combatant === null) return null;
  const clocks = resolveMechanicsMaterialClocks(context.world, combatant.material);
  const encounter = clocks?.encounter;
  if (
    !encounter ||
    encounter.state.phase !== "turns" ||
    encounter.state.currentCombatantId === null
  ) {
    return null;
  }

  const combatantKey = entityRefKey(combatant);
  const targetId = encounter.state.order.find((participantId) => {
    const participant = encounter.state.participants[participantId];
    return participant && entityRefKey(participant.combatant) === combatantKey;
  });
  const targetIndex = targetId ? encounter.state.order.indexOf(targetId) : -1;
  const currentIndex = encounter.state.order.indexOf(encounter.state.currentCombatantId);
  if (targetIndex < 0 || currentIndex < 0) return null;
  const requestedPhase = spec.phase === "start" ? 0 : 2;
  const currentPhase =
    context.currentTurnPhase === "start"
      ? 0
      : context.currentTurnPhase === "active"
        ? 1
        : 2;
  const stillAhead =
    targetIndex > currentIndex ||
    (targetIndex === currentIndex && requestedPhase > currentPhase);
  const roundOffset = (stillAhead ? 0 : 1) + turns - 1;
  if (
    !Number.isSafeInteger(roundOffset) ||
    roundOffset < 0 ||
    encounter.state.round > Number.MAX_SAFE_INTEGER - roundOffset
  ) {
    return null;
  }
  const round = encounter.state.round + roundOffset;
  return round > 0
    ? {
        clock: encounter.clock,
        combatant,
        kind: "turn-boundary",
        phase: spec.phase,
        round,
      }
    : null;
}

/** Freeze one authored relative lifetime into exact physical end rules. */
export function resolveMechanicsLifetime(
  spec: Readonly<MechanicsLifetimeSpec>,
  context: Readonly<MechanicsLifetimeResolutionContext>
): readonly Readonly<EndRule>[] | null {
  const root = conformOccurrenceGenerationRef(context.root);
  const currentPhaseId = conformMechanicId(context.currentPhaseId);
  if (
    !root ||
    !currentPhaseId ||
    !Number.isSafeInteger(context.execution) ||
    context.execution < 1
  ) {
    return null;
  }
  if (spec.kind === "manual") return [];
  if (spec.kind === "source-end") {
    return [{ kind: "occurrence-end", occurrenceId: root.occurrence.occurrenceId }];
  }
  if (spec.kind === "program-phase-end") {
    const phaseId = conformMechanicId(spec.phaseId);
    const completed = context.phaseExecutions[spec.phaseId];
    const execution =
      phaseId === currentPhaseId
        ? context.execution
        : completed === undefined ||
            !Number.isSafeInteger(completed) ||
            completed < 0 ||
            completed === Number.MAX_SAFE_INTEGER
          ? null
          : completed + 1;
    return phaseId && execution !== null
      ? [
          {
            execution,
            kind: "program-phase-end",
            occurrenceId: root.occurrence.occurrenceId,
            phaseId,
          },
        ]
      : null;
  }
  if (spec.kind === "temporary-hit-points-empty") {
    return [{ kind: "temporary-hp-empty" }];
  }
  if (spec.kind === "turn-boundary") {
    const rule = resolvedTurnBoundary(spec, context);
    return rule ? [rule] : null;
  }

  const ownerClocks = resolveMechanicsMaterialClocks(
    context.world,
    root.occurrence.material
  );
  if (!ownerClocks) return null;
  if (spec.kind === "combat-end") {
    return ownerClocks.encounter
      ? [{ clock: ownerClocks.encounter.clock, kind: "combat-end" }]
      : null;
  }
  if (spec.kind === "duration") {
    const seconds = evaluateIntegerExpression(spec.seconds, context.bindings);
    const elapsed = ownerClocks.timeline.state.elapsedSeconds;
    return seconds !== null && seconds > 0 && elapsed <= Number.MAX_SAFE_INTEGER - seconds
      ? [
          {
            clock: ownerClocks.timeline.clock,
            elapsedSeconds: elapsed + seconds,
            kind: "time-reached",
          },
        ]
      : null;
  }
  if (spec.kind === "day-phase") {
    if (ownerClocks.timeline.state.nextBoundaryOrdinal === Number.MAX_SAFE_INTEGER) {
      return null;
    }
    return [
      {
        clock: ownerClocks.timeline.clock,
        kind: "day-phase",
        minimumBoundaryOrdinal: ownerClocks.timeline.state.nextBoundaryOrdinal,
        phase: spec.phase,
      },
    ];
  }
  const combatant = context.combatant;
  if (combatant === null) return null;
  const combatantClocks = resolveMechanicsMaterialClocks(
    context.world,
    combatant.material
  );
  return combatantClocks &&
    combatantClocks.timeline.state.nextBoundaryOrdinal !== Number.MAX_SAFE_INTEGER
    ? [
        {
          clock: combatantClocks.timeline.clock,
          combatant,
          kind: "rest-completed",
          minimumBoundaryOrdinal: combatantClocks.timeline.state.nextBoundaryOrdinal,
          rest: spec.rest,
        },
      ]
    : null;
}

/** Materialize one standing template per target; marks broadcast or zip exactly. */
export function materializeMechanicsStandingFacts(
  template: Readonly<StandingFactTemplate>,
  targets: readonly Readonly<EntityRef>[],
  markedTargets: readonly Readonly<EntityRef>[] | null = null
): readonly Readonly<MaterializedMechanicsStandingFact>[] | null {
  if (targets.length === 0) return [];
  if (template.kind !== "target-mark") {
    return markedTargets === null
      ? targets.map((target) => ({ fact: template, target }))
      : null;
  }
  if (
    markedTargets === null ||
    (markedTargets.length !== 1 && markedTargets.length !== targets.length)
  ) {
    return null;
  }
  const materialized: MaterializedMechanicsStandingFact[] = [];
  for (const [index, target] of targets.entries()) {
    const marked = markedTargets.length === 1 ? markedTargets[0] : markedTargets[index];
    if (!marked) return null;
    materialized.push({
      fact: { kind: "target-mark", markId: template.markId, marked },
      target,
    });
  }
  return materialized;
}

function activeEffectEntries(world: Readonly<MechanicsWorld>): ActiveEffectEntry[] {
  return [...world.documents]
    .sort((left, right) =>
      compareCodeUnits(materialRefKey(left.material), materialRefKey(right.material))
    )
    .flatMap((document) =>
      selectOccurrenceEntries(document.state).flatMap(({ id, occurrence }) =>
        isEffectOccurrence(occurrence) && occurrence.ending === null
          ? [{ id, material: document.material, occurrence }]
          : []
      )
    );
}

function matcherAccepts(
  occurrence: Readonly<EffectOccurrence>,
  matcher: Readonly<ActiveMechanicsEffectMatcher>
): boolean {
  if (
    occurrence.kind !== matcher.kind ||
    (matcher.root &&
      occurrenceGenerationRefKey(occurrence.origin.root) !==
        occurrenceGenerationRefKey(matcher.root)) ||
    (matcher.target && entityRefKey(occurrence.target) !== entityRefKey(matcher.target))
  ) {
    return false;
  }
  if (matcher.kind === "condition" && occurrence.kind === "condition") {
    return (
      matcher.conditionId === undefined || occurrence.conditionId === matcher.conditionId
    );
  }
  if (matcher.kind === "standing" && occurrence.kind === "standing") {
    return (
      matcher.fact === undefined ||
      canonicalJson(occurrence.fact) === canonicalJson(matcher.fact)
    );
  }
  if (matcher.kind === "polymorph-form" && occurrence.kind === "polymorph-form") {
    return matcher.formId === undefined || occurrence.formId === matcher.formId;
  }
  return matcher.kind === "concentration" && occurrence.kind === "concentration";
}

function generation(entry: Readonly<ActiveEffectEntry>): OccurrenceGenerationRef {
  return {
    occurrence: { material: entry.material, occurrenceId: entry.id },
    ordinal: entry.occurrence.ordinal,
  };
}

/** World-wide active effect selection in material, allocation-ordinal, id order. */
export function selectActiveMechanicsEffects(
  world: Readonly<MechanicsWorld>,
  matcher: Readonly<ActiveMechanicsEffectMatcher>
): readonly Readonly<OccurrenceGenerationRef>[] {
  return activeEffectEntries(world)
    .filter(({ occurrence }) => matcherAccepts(occurrence, matcher))
    .map(generation);
}

/** Select one exact root generation's active step children across all executions. */
export function selectActiveProgramStepChildren(
  world: Readonly<MechanicsWorld>,
  root: Readonly<OccurrenceGenerationRef>,
  stepId: string
): readonly Readonly<OccurrenceGenerationRef>[] {
  const rootKey = occurrenceGenerationRefKey(root);
  const selected = activeEffectEntries(world)
    .filter(
      ({ occurrence }) =>
        occurrence.origin.stepId === stepId &&
        occurrenceGenerationRefKey(occurrence.origin.root) === rootKey
    )
    .sort(
      (left, right) =>
        left.occurrence.origin.execution - right.occurrence.origin.execution ||
        left.occurrence.origin.slot - right.occurrence.origin.slot ||
        left.occurrence.ordinal - right.occurrence.ordinal ||
        compareCodeUnits(
          occurrenceGenerationRefKey(generation(left)),
          occurrenceGenerationRefKey(generation(right))
        )
    )
    .map(generation);
  const seen = new Set<string>();
  return selected.filter((reference) => {
    const key = occurrenceGenerationRefKey(reference);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
