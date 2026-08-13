/** Exact observed facts that may activate one authored mechanics phase. */

import {
  booleanSchema,
  customSchema,
  discriminatedUnionSchema,
  literalSchema,
  objectSchema,
  unionSchema,
  type InferExactSchema,
} from "@/lib/exact-schema";
import type { DamageResolution } from "@/types/damage";
import type {
  ClockRef,
  EntityRef,
  OccurrenceGenerationRef,
} from "@/types/mechanics-reference";
import type { ResourceRef } from "@/types/resource";

const ID_SCHEMA = customSchema<"id", string>("id");
const POSITIVE_INTEGER_SCHEMA = customSchema<"positive-integer", number>(
  "positive-integer"
);
const CLOCK_REF_SCHEMA = customSchema<"clock-ref", ClockRef>("clock-ref");
const ENTITY_REF_SCHEMA = customSchema<"entity-ref", EntityRef>("entity-ref");
const OCCURRENCE_GENERATION_REF_SCHEMA = customSchema<
  "occurrence-generation-ref",
  OccurrenceGenerationRef
>("occurrence-generation-ref");
const RESOURCE_REF_SCHEMA = customSchema<"resource-ref", ResourceRef>("resource-ref");
const DAMAGE_RESOLUTION_SCHEMA = customSchema<"damage-resolution", DamageResolution>(
  "damage-resolution"
);
const NULL_SCHEMA = literalSchema(null);

/** Invocation has no event id; every other variant is paired with a root CAS event id. */
export const MECHANICS_TRIGGER_EVIDENCE_SCHEMA = discriminatedUnionSchema("kind", {
  invocation: objectSchema({ kind: literalSchema("invocation") }),
  "turn-boundary": objectSchema({
    clock: CLOCK_REF_SCHEMA,
    combatant: ENTITY_REF_SCHEMA,
    kind: literalSchema("turn-boundary"),
    phase: unionSchema([literalSchema("start"), literalSchema("end")]),
    round: POSITIVE_INTEGER_SCHEMA,
    triggerEventId: ID_SCHEMA,
  }),
  "resource-depleted": objectSchema({
    kind: literalSchema("resource-depleted"),
    resource: RESOURCE_REF_SCHEMA,
    triggerEventId: ID_SCHEMA,
  }),
  "hit-points-zero": objectSchema({
    kind: literalSchema("hit-points-zero"),
    target: ENTITY_REF_SCHEMA,
    triggerEventId: ID_SCHEMA,
  }),
  "damage-taken": objectSchema({
    attacker: unionSchema([ENTITY_REF_SCHEMA, NULL_SCHEMA]),
    criticalHit: booleanSchema,
    kind: literalSchema("damage-taken"),
    resolution: DAMAGE_RESOLUTION_SCHEMA,
    triggerEventId: ID_SCHEMA,
  }),
  "rest-completed": objectSchema({
    boundaryOrdinal: POSITIVE_INTEGER_SCHEMA,
    clock: CLOCK_REF_SCHEMA,
    combatant: ENTITY_REF_SCHEMA,
    kind: literalSchema("rest-completed"),
    rest: unionSchema([literalSchema("short"), literalSchema("long")]),
    triggerEventId: ID_SCHEMA,
  }),
  "day-phase": objectSchema({
    boundaryOrdinal: POSITIVE_INTEGER_SCHEMA,
    clock: CLOCK_REF_SCHEMA,
    kind: literalSchema("day-phase"),
    phase: unionSchema([literalSchema("dawn"), literalSchema("dusk")]),
    triggerEventId: ID_SCHEMA,
  }),
  "source-end": objectSchema({
    kind: literalSchema("source-end"),
    occurrence: OCCURRENCE_GENERATION_REF_SCHEMA,
    triggerEventId: ID_SCHEMA,
  }),
  "program-phase-end": objectSchema({
    execution: POSITIVE_INTEGER_SCHEMA,
    kind: literalSchema("program-phase-end"),
    occurrence: OCCURRENCE_GENERATION_REF_SCHEMA,
    phaseId: ID_SCHEMA,
    triggerEventId: ID_SCHEMA,
  }),
  "area-boundary": objectSchema({
    area: OCCURRENCE_GENERATION_REF_SCHEMA,
    boundary: unionSchema([literalSchema("enter"), literalSchema("leave")]),
    entity: ENTITY_REF_SCHEMA,
    kind: literalSchema("area-boundary"),
    triggerEventId: ID_SCHEMA,
  }),
  "manual-table-event": objectSchema({
    authority: unionSchema([literalSchema("table"), literalSchema("environment")]),
    eventId: ID_SCHEMA,
    kind: literalSchema("manual-table-event"),
    triggerEventId: ID_SCHEMA,
  }),
});

export type MechanicsTriggerEvidenceSchemaShape = InferExactSchema<
  typeof MECHANICS_TRIGGER_EVIDENCE_SCHEMA,
  MechanicsTriggerSchemaCustomTypes
>;

export type MechanicsTriggerSchemaCustomTypes = {
  readonly "clock-ref": ClockRef;
  readonly "damage-resolution": DamageResolution;
  readonly "entity-ref": EntityRef;
  readonly id: string;
  readonly "occurrence-generation-ref": OccurrenceGenerationRef;
  readonly "positive-integer": number;
  readonly "resource-ref": ResourceRef;
};
