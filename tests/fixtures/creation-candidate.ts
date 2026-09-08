import type { CreationCandidate } from "../../src/lib/character-creation/repository";
import { initializeDefinition } from "../../src/lib/homebrew/model";
import { sourceIdentity, type CatalogueSnapshot } from "../../src/lib/homebrew/sources";
import {
  DEFAULT_INSTANCE_STATE,
  materializeInstance,
} from "../../src/lib/homebrew/instances";
export const creationCatalogue = (
  entryId: string,
  family: "class" | "equipment"
): CatalogueSnapshot => ({
  kind: "catalogue",
  schema: 1,
  catalogue: "test",
  release: "1",
  adapterVersion: 1,
  entryId,
  definition: { ...initializeDefinition(family), name: entryId },
});
export function creationCandidate(ownerUid = "owner"): CreationCandidate {
  const character = { ownerUid, id: "hero" },
    lastOperation = { uid: ownerUid, opId: "draft" };
  const source = creationCatalogue("class", "class"),
    equipment = creationCatalogue("gear", "equipment");
  return {
    character: {
      schema: 1,
      ...character,
      name: "Hero",
      speciesId: "species",
      classId: "class",
      level: 1,
      revision: 0,
      currentAssignment: null,
      portraitPath: null,
      sheet: {
        build: {
          creation: {
            schema: 1,
            kind: "guided",
            operationId: "draft",
            abilityMethod: "standard-array",
          },
        },
        state: {},
      },
    },
    origins: { schema: 1, character, revision: 1, selections: {}, lastOperation },
    classes: {
      schema: 1,
      character,
      revision: 1,
      acquisitions: {
        class: {
          id: "class",
          ordinal: 0,
          classLevel: 1,
          snapshot: source,
          answers: {},
          exceptions: [],
        },
      },
      lastOperation,
    },
    loadout: {
      schema: 1,
      character,
      revision: 1,
      sources: { [sourceIdentity(equipment)]: equipment },
      instances: {
        initial_gear: structuredClone(
          materializeInstance(
            character,
            "initial_gear",
            equipment,
            DEFAULT_INSTANCE_STATE,
            1,
            lastOperation,
            {},
            () => true
          )
        ),
      },
      lastOperation,
    },
  };
}

export function ownedCreationEquipment(
  ownerUid = "owner"
): import("../../src/lib/library/model").LibraryVersion {
  return {
    schema: 1,
    ownerUid,
    entryId: "owned-gear",
    version: 1,
    operationId: "publish",
    provenance: null,
    definition: { ...initializeDefinition("equipment"), name: "Owned gear" },
  };
}
export function creationWithOwnedEquipment(): CreationCandidate {
  const candidate = creationCandidate(),
    source = ownedCreationEquipment();
  candidate.loadout.sources = { [sourceIdentity(source)]: source };
  const item = candidate.loadout.instances.initial_gear;
  if (item) item.snapshot = source;
  return candidate;
}
