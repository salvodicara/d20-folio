/** World-bound projection from active occurrences and creature vitals to 2024 conditions. */

import { entityRefKey, materialRefKey } from "@/lib/action-journal";
import { projectCreatureConditions } from "@/lib/condition";
import { conformEntityRef } from "@/lib/mechanics-reference-schema";
import { parseMechanicsWorld } from "@/lib/mechanics-world";
import type { ConditionInstance, EntityConditionProjection } from "@/types/condition";
import type { EntityRef } from "@/types/mechanics-reference";
import type { MechanicsDocument, MechanicsWorld } from "@/types/mechanics-world";
import type { CreatureVitals } from "@/types/vitals";

function documentFor(
  world: Readonly<MechanicsWorld>,
  target: Readonly<EntityRef>
): Readonly<MechanicsDocument> | null {
  const key = materialRefKey(target.material);
  return (
    world.documents.find((document) => materialRefKey(document.material) === key) ?? null
  );
}

function creatureVitalsFor(
  world: Readonly<MechanicsWorld>,
  target: Readonly<EntityRef>
): Readonly<CreatureVitals> | null {
  const document = documentFor(world, target);
  if (!document) return null;
  if (target.entityId === "self") {
    return document.kind === "character" ? document.state.vitals : null;
  }
  const entity = document.state.entities[target.entityId];
  return entity !== undefined &&
    entity.ordinal === target.ordinal &&
    entity.kind === "creature"
    ? entity.vitals
    : null;
}

function directConditionInstances(
  world: Readonly<MechanicsWorld>,
  target: Readonly<EntityRef>
): ConditionInstance[] {
  const targetKey = entityRefKey(target);
  const instances: ConditionInstance[] = [];
  for (const document of world.documents) {
    for (const [occurrenceId, occurrence] of Object.entries(document.state.occurrences)) {
      if (
        occurrence.kind !== "condition" ||
        occurrence.ending !== null ||
        entityRefKey(occurrence.target) !== targetKey
      ) {
        continue;
      }
      instances.push({
        conditionId: occurrence.conditionId,
        identity: {
          kind: "occurrence",
          ref: {
            occurrence: { material: document.material, occurrenceId },
            ordinal: occurrence.ordinal,
          },
        },
        source: null,
      });
    }
  }
  return instances;
}

function resolvedEntityConditions(
  world: Readonly<MechanicsWorld>,
  target: Readonly<EntityRef>
): Readonly<EntityConditionProjection> | null {
  const vitals = creatureVitalsFor(world, target);
  if (!vitals) return null;
  const instances = directConditionInstances(world, target);
  return projectCreatureConditions(instances, target, vitals);
}

/** Project a target from an already conformed transaction world. */
export function projectResolvedEntityConditions(
  world: Readonly<MechanicsWorld>,
  target: Readonly<EntityRef>
): Readonly<EntityConditionProjection> | null {
  return resolvedEntityConditions(world, target);
}

/**
 * Project the complete effective condition view for one creature in an exact world.
 * A condition may be owned by any loaded material document; zero-HP Unconscious is
 * derived from vitals and is therefore never persisted as a duplicate occurrence.
 */
export function projectEntityConditions(
  worldValue: unknown,
  targetValue: unknown
): Readonly<EntityConditionProjection> | null {
  const parsed = parseMechanicsWorld(worldValue);
  const target = conformEntityRef(targetValue);
  if (!parsed.ok || !target) return null;

  return resolvedEntityConditions(parsed.value, target);
}
