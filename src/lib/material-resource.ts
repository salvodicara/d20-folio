/** One physical locator for every canonical mechanics resource. */

import { materialRefKey } from "@/lib/action-journal";
import { conformResourceCell, conformResourceRef } from "@/lib/resources";
import type { ActionFactGuard, JournalPath, JsonValue } from "@/types/action-journal";
import type { IntegerBindings } from "@/types/integer-expression";
import type { EntityRef, MaterialRef } from "@/types/mechanics-reference";
import type { MaterialEntity } from "@/types/material-state";
import type { MechanicsDocument, MechanicsWorld } from "@/types/mechanics-world";
import type { ResourceCell, ResourceRef, ResourceSpec } from "@/types/resource";

export interface MaterialResourceLocation {
  readonly cell: Readonly<ResourceCell>;
  readonly material: Readonly<MaterialRef>;
  readonly owner: Readonly<EntityRef>;
  readonly path: JournalPath;
  readonly resource: Readonly<ResourceRef>;
}

/** CAS evidence for a definition derived outside mutable material state. */
export function resourceDefinitionFactGuard(
  location: Readonly<MaterialResourceLocation>,
  spec: Readonly<ResourceSpec>,
  bindings: Readonly<IntegerBindings>
): ActionFactGuard {
  return {
    address: ["resource-definition", ...location.path],
    expected: {
      present: true,
      value: structuredClone({ bindings, spec }) as JsonValue,
    },
    lifecycle: "commit",
    owner: structuredClone(location.owner),
  };
}

function documentFor(
  world: Readonly<MechanicsWorld>,
  material: Readonly<MaterialRef>
): { readonly document: Readonly<MechanicsDocument>; readonly index: number } | null {
  const key = materialRefKey(material);
  const index = world.documents.findIndex(
    (document) => materialRefKey(document.material) === key
  );
  const document = world.documents[index];
  return document ? { document, index } : null;
}

function exactMaterialEntity(
  document: Readonly<MechanicsDocument>,
  owner: Readonly<EntityRef>
): Readonly<MaterialEntity> | null {
  if (owner.entityId === "self") return null;
  const entity = document.state.entities[owner.entityId];
  return entity !== undefined && entity.ordinal === owner.ordinal ? entity : null;
}

/** Resolve one exact physical cell and its journal address from a conformed world. */
export function locateResolvedMaterialResource(
  world: Readonly<MechanicsWorld>,
  resource: Readonly<ResourceRef>
): Readonly<MaterialResourceLocation> | null {
  if (resource.kind === "pool") {
    const located = documentFor(world, resource.owner.material);
    if (!located) return null;
    if (resource.owner.entityId === "self") {
      if (located.document.kind !== "character") return null;
      const cell = located.document.state.resources.pools[resource.resourceId];
      return cell
        ? {
            cell,
            material: located.document.material,
            owner: resource.owner,
            path: ["resources", "pools", resource.resourceId],
            resource,
          }
        : null;
    }
    const entity = exactMaterialEntity(located.document, resource.owner);
    const cell = entity?.resources[resource.resourceId];
    return cell
      ? {
          cell,
          material: located.document.material,
          owner: resource.owner,
          path: ["entities", resource.owner.entityId, "resources", resource.resourceId],
          resource,
        }
      : null;
  }

  const located = documentFor(world, resource.character);
  if (!located || located.document.kind !== "character") return null;
  const owner = { entityId: "self", material: resource.character } as const;
  switch (resource.kind) {
    case "standard-spell-slot": {
      const level = String(resource.level);
      const cell = located.document.state.resources.standardSpellSlots[level];
      return cell
        ? {
            cell,
            material: located.document.material,
            owner,
            path: ["resources", "standardSpellSlots", level],
            resource,
          }
        : null;
    }
    case "pact-spell-slot": {
      const cell = located.document.state.resources.pactSpellSlot;
      return cell
        ? {
            cell,
            material: located.document.material,
            owner,
            path: ["resources", "pactSpellSlot"],
            resource,
          }
        : null;
    }
    case "hit-die": {
      const cell = located.document.state.resources.hitDice[resource.die];
      return cell
        ? {
            cell,
            material: located.document.material,
            owner,
            path: ["resources", "hitDice", resource.die],
            resource,
          }
        : null;
    }
    case "currency":
      return {
        cell: located.document.state.resources.currency[resource.denomination],
        material: located.document.material,
        owner,
        path: ["resources", "currency", resource.denomination],
        resource,
      };
    case "item-resource": {
      const instance = located.document.state.inventory[resource.instanceId];
      if (instance?.ordinal !== resource.instanceOrdinal) return null;
      const cell = instance.resources[resource.resourceId];
      return cell
        ? {
            cell,
            material: located.document.material,
            owner,
            path: ["inventory", resource.instanceId, "resources", resource.resourceId],
            resource,
          }
        : null;
    }
    case "item-quantity": {
      const instance = located.document.state.inventory[resource.instanceId];
      return instance?.ordinal === resource.instanceOrdinal
        ? {
            cell: instance.quantity,
            material: located.document.material,
            owner,
            path: ["inventory", resource.instanceId, "quantity"],
            resource,
          }
        : null;
    }
  }
}

/** Hostile-input convenience boundary for presenters and adapters. */
export function locateMaterialResource(
  world: Readonly<MechanicsWorld>,
  resourceValue: unknown
): Readonly<MaterialResourceLocation> | null {
  const resource = conformResourceRef(resourceValue);
  return resource ? locateResolvedMaterialResource(world, resource) : null;
}

function replaceEntityCell(
  entity: Readonly<MaterialEntity>,
  resourceId: string,
  cell: Readonly<ResourceCell>
): MaterialEntity {
  return {
    ...entity,
    resources: { ...entity.resources, [resourceId]: cell },
  };
}

/**
 * Replace exactly one located cell without interpreting it. The caller runs
 * mechanics-world closure before exposing or journaling the candidate.
 */
export function replaceResolvedMaterialResource(
  world: Readonly<MechanicsWorld>,
  resource: Readonly<ResourceRef>,
  cellValue: unknown
): Readonly<MechanicsWorld> | null {
  const location = locateResolvedMaterialResource(world, resource);
  const cell = conformResourceCell(cellValue);
  if (!location || !cell) return null;
  const located = documentFor(world, location.material);
  if (!located) return null;

  const documents = world.documents.map(
    (document, index): Readonly<MechanicsDocument> => {
      if (index !== located.index || document.kind !== "character") {
        if (index !== located.index || resource.kind !== "pool") return document;
      }
      if (resource.kind === "pool") {
        if (resource.owner.entityId === "self") {
          if (document.kind !== "character") return document;
          return {
            ...document,
            state: {
              ...document.state,
              resources: {
                ...document.state.resources,
                pools: { ...document.state.resources.pools, [resource.resourceId]: cell },
              },
            },
          };
        }
        const entity = exactMaterialEntity(document, resource.owner);
        if (!entity) return document;
        return {
          ...document,
          state: {
            ...document.state,
            entities: {
              ...document.state.entities,
              [resource.owner.entityId]: replaceEntityCell(
                entity,
                resource.resourceId,
                cell
              ),
            },
          },
        };
      }
      if (document.kind !== "character") return document;
      switch (resource.kind) {
        case "standard-spell-slot":
          return {
            ...document,
            state: {
              ...document.state,
              resources: {
                ...document.state.resources,
                standardSpellSlots: {
                  ...document.state.resources.standardSpellSlots,
                  [String(resource.level)]: cell,
                },
              },
            },
          };
        case "pact-spell-slot":
          return {
            ...document,
            state: {
              ...document.state,
              resources: { ...document.state.resources, pactSpellSlot: cell },
            },
          };
        case "hit-die":
          return {
            ...document,
            state: {
              ...document.state,
              resources: {
                ...document.state.resources,
                hitDice: { ...document.state.resources.hitDice, [resource.die]: cell },
              },
            },
          };
        case "currency":
          return cell.kind === "count"
            ? {
                ...document,
                state: {
                  ...document.state,
                  resources: {
                    ...document.state.resources,
                    currency: {
                      ...document.state.resources.currency,
                      [resource.denomination]: cell,
                    },
                  },
                },
              }
            : document;
        case "item-resource": {
          const instance = document.state.inventory[resource.instanceId];
          if (instance?.ordinal !== resource.instanceOrdinal) return document;
          return {
            ...document,
            state: {
              ...document.state,
              inventory: {
                ...document.state.inventory,
                [resource.instanceId]: {
                  ...instance,
                  resources: { ...instance.resources, [resource.resourceId]: cell },
                },
              },
            },
          };
        }
        case "item-quantity": {
          const instance = document.state.inventory[resource.instanceId];
          if (!instance || cell.kind !== "count") return document;
          return {
            ...document,
            state: {
              ...document.state,
              inventory: {
                ...document.state.inventory,
                [resource.instanceId]: { ...instance, quantity: cell },
              },
            },
          };
        }
      }
    }
  );
  return { documents, scope: world.scope };
}

function withoutKey<Value>(
  values: Readonly<Record<string, Value>>,
  key: string
): Record<string, Value> {
  return Object.fromEntries(
    Object.entries(values).filter(([candidate]) => candidate !== key)
  );
}

/**
 * Insert one resource cell at an address whose physical container already
 * exists. Absence is the CAS precondition; fixed-shape currency and item
 * quantity are never dynamically created.
 */
export function insertResolvedMaterialResource(
  world: Readonly<MechanicsWorld>,
  resource: Readonly<ResourceRef>,
  cellValue: unknown
): Readonly<MechanicsWorld> | null {
  if (
    locateResolvedMaterialResource(world, resource) !== null ||
    resource.kind === "currency" ||
    resource.kind === "item-quantity"
  ) {
    return null;
  }
  const cell = conformResourceCell(cellValue);
  if (!cell) return null;

  const material =
    resource.kind === "pool" ? resource.owner.material : resource.character;
  const located = documentFor(world, material);
  if (!located) return null;
  if (
    resource.kind === "pool" &&
    resource.owner.entityId !== "self" &&
    exactMaterialEntity(located.document, resource.owner) === null
  ) {
    return null;
  }
  const documents = world.documents.map(
    (document, index): Readonly<MechanicsDocument> => {
      if (index !== located.index) return document;
      if (resource.kind === "pool") {
        if (resource.owner.entityId === "self") {
          if (document.kind !== "character") return document;
          return {
            ...document,
            state: {
              ...document.state,
              resources: {
                ...document.state.resources,
                pools: { ...document.state.resources.pools, [resource.resourceId]: cell },
              },
            },
          };
        }
        const entity = exactMaterialEntity(document, resource.owner);
        if (!entity) return document;
        return {
          ...document,
          state: {
            ...document.state,
            entities: {
              ...document.state.entities,
              [resource.owner.entityId]: replaceEntityCell(
                entity,
                resource.resourceId,
                cell
              ),
            },
          },
        };
      }
      if (document.kind !== "character") return document;
      switch (resource.kind) {
        case "standard-spell-slot":
          return cell.kind === "count"
            ? {
                ...document,
                state: {
                  ...document.state,
                  resources: {
                    ...document.state.resources,
                    standardSpellSlots: {
                      ...document.state.resources.standardSpellSlots,
                      [String(resource.level)]: cell,
                    },
                  },
                },
              }
            : document;
        case "pact-spell-slot":
          return cell.kind === "count"
            ? {
                ...document,
                state: {
                  ...document.state,
                  resources: { ...document.state.resources, pactSpellSlot: cell },
                },
              }
            : document;
        case "hit-die":
          return cell.kind === "count"
            ? {
                ...document,
                state: {
                  ...document.state,
                  resources: {
                    ...document.state.resources,
                    hitDice: {
                      ...document.state.resources.hitDice,
                      [resource.die]: cell,
                    },
                  },
                },
              }
            : document;
        case "item-resource": {
          const instance = document.state.inventory[resource.instanceId];
          if (instance?.ordinal !== resource.instanceOrdinal) return document;
          return {
            ...document,
            state: {
              ...document.state,
              inventory: {
                ...document.state.inventory,
                [resource.instanceId]: {
                  ...instance,
                  resources: { ...instance.resources, [resource.resourceId]: cell },
                },
              },
            },
          };
        }
      }
    }
  );
  const candidate = { documents, scope: world.scope };
  return locateResolvedMaterialResource(candidate, resource) ? candidate : null;
}

/**
 * Remove one dynamically owned resource cell. Presence is the CAS precondition;
 * fixed-shape currency and item quantity cannot be removed independently of
 * their owning material.
 */
export function removeResolvedMaterialResource(
  world: Readonly<MechanicsWorld>,
  resource: Readonly<ResourceRef>
): Readonly<MechanicsWorld> | null {
  const location = locateResolvedMaterialResource(world, resource);
  if (!location || resource.kind === "currency" || resource.kind === "item-quantity") {
    return null;
  }
  const located = documentFor(world, location.material);
  if (!located) return null;
  const documents = world.documents.map(
    (document, index): Readonly<MechanicsDocument> => {
      if (index !== located.index) return document;
      if (resource.kind === "pool") {
        if (resource.owner.entityId === "self") {
          if (document.kind !== "character") return document;
          return {
            ...document,
            state: {
              ...document.state,
              resources: {
                ...document.state.resources,
                pools: withoutKey(document.state.resources.pools, resource.resourceId),
              },
            },
          };
        }
        const entity = exactMaterialEntity(document, resource.owner);
        if (!entity) return document;
        return {
          ...document,
          state: {
            ...document.state,
            entities: {
              ...document.state.entities,
              [resource.owner.entityId]: {
                ...entity,
                resources: withoutKey(entity.resources, resource.resourceId),
              },
            },
          },
        };
      }
      if (document.kind !== "character") return document;
      switch (resource.kind) {
        case "standard-spell-slot":
          return {
            ...document,
            state: {
              ...document.state,
              resources: {
                ...document.state.resources,
                standardSpellSlots: withoutKey(
                  document.state.resources.standardSpellSlots,
                  String(resource.level)
                ),
              },
            },
          };
        case "pact-spell-slot":
          return {
            ...document,
            state: {
              ...document.state,
              resources: { ...document.state.resources, pactSpellSlot: null },
            },
          };
        case "hit-die":
          return {
            ...document,
            state: {
              ...document.state,
              resources: {
                ...document.state.resources,
                hitDice: withoutKey(document.state.resources.hitDice, resource.die),
              },
            },
          };
        case "item-resource": {
          const instance = document.state.inventory[resource.instanceId];
          if (!instance) return document;
          return {
            ...document,
            state: {
              ...document.state,
              inventory: {
                ...document.state.inventory,
                [resource.instanceId]: {
                  ...instance,
                  resources: withoutKey(instance.resources, resource.resourceId),
                },
              },
            },
          };
        }
        case "currency":
        case "item-quantity":
          return document;
      }
    }
  );
  const candidate = { documents, scope: world.scope };
  return locateResolvedMaterialResource(candidate, resource) === null ? candidate : null;
}
