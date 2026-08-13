import { describe, expect, it } from "vitest";

import { addOccurrence, resolveOccurrenceAuthority } from "@/lib/mechanic-occurrences";
import {
  createEmptyCharacterMaterialState,
  createEmptySharedMaterialState,
  parseCharacterMaterialState,
  parseSharedMaterialState,
} from "@/lib/material-state";
import type {
  CharacterMaterialState,
  CreatureMaterialEntity,
  InventoryInstance,
  ObjectMaterialEntity,
  SharedMaterialState,
} from "@/types/material-state";
import type { NewMechanicOccurrence } from "@/types/mechanic-occurrence";
import type {
  CharacterMaterialRef,
  EntityRef,
  SharedMaterialRef,
} from "@/types/mechanics-reference";
import type { CreatureVitals } from "@/types/vitals";

const CHARACTER = {
  characterId: "character-1",
  kind: "character-play",
  uid: "user-1",
} as const satisfies CharacterMaterialRef;
const SHARED = {
  campaignId: "campaign-1",
  kind: "shared-combat",
} as const satisfies SharedMaterialRef;
const SELF: EntityRef = { entityId: "self", material: CHARACTER };
const GHOST: EntityRef = {
  entityId: "not-present",
  material: CHARACTER,
  ordinal: 1,
};

type NewProgramOccurrence = Extract<NewMechanicOccurrence, { kind: "program" }>;
type NewStandingOccurrence = Extract<NewMechanicOccurrence, { kind: "standing" }>;

function livingVitals(current = 10): CreatureVitals {
  return {
    hitPoints: {
      current,
      temporary: { current: 0, sourceOccurrence: null },
    },
    zeroHitPoints: null,
  };
}

function authoredProgram(
  id: string
): NewProgramOccurrence["authority"]["snapshot"]["program"] {
  return {
    id,
    phases: [
      {
        inputs: [],
        phaseId: "invoke",
        steps: [],
        trigger: { kind: "invocation" },
      },
    ],
    registers: [],
    version: 1,
  };
}

function entityAuthority(
  anchors: NewProgramOccurrence["authority"]["anchors"] = {
    activator: SELF,
    caster: SELF,
    owner: SELF,
    source: SELF,
    target: SELF,
  }
): NewProgramOccurrence["authority"] {
  const definition = {
    catalogueKind: "spell",
    entityId: "spell.web",
    kind: "catalogue",
    mechanicsRevision: `sha256:${"0".repeat(64)}`,
  } as const;
  const capability = {
    capabilityId: "primary",
    definition,
    kind: "program",
  } as const;
  return {
    anchors,
    installation: {
      capability,
      generation: 1,
      installationId: "installation-1",
      owner: SELF,
    },
    schema: 1,
    snapshot: {
      grantGroups: {},
      program: authoredProgram(capability.capabilityId),
      ref: capability,
      resources: {},
      schema: 1,
    },
    source: { capability, kind: "capability", owner: SELF },
    staticBindings: {},
  };
}

function tableAuthority(
  authority: "environment" | "table" = "table"
): NewProgramOccurrence["authority"] {
  const definition = {
    authority,
    declarationId: "hazard-1",
    generation: 1,
    kind: "table-declaration",
    material: SHARED,
  } as const;
  const capability = {
    capabilityId: "hazard",
    definition,
    kind: "system",
  } as const;
  return {
    anchors: {
      activator: null,
      caster: null,
      owner: null,
      source: null,
      target: null,
    },
    installation: {
      capability,
      generation: 1,
      installationId: "hazard-installation",
      owner: { authority, kind: "material-authority", material: SHARED },
    },
    schema: 1,
    snapshot: {
      grantGroups: {},
      program: authoredProgram(capability.capabilityId),
      ref: capability,
      resources: {},
      schema: 1,
    },
    source: definition,
    staticBindings: {},
  };
}

function program(
  authority: NewProgramOccurrence["authority"] = entityAuthority()
): NewProgramOccurrence {
  return {
    authority,
    endRules: [],
    kind: "program",
    phaseState: { invoke: { execution: 0, lastTriggerEventId: null } },
    registers: {},
  };
}

function standing(target: EntityRef, parentId = "root"): NewStandingOccurrence {
  return {
    endRules: [],
    fact: { key: "owned", kind: "active-key" },
    kind: "standing",
    parentId,
    target,
  };
}

function withProgram<State extends CharacterMaterialState | SharedMaterialState>(
  state: State,
  target: EntityRef,
  authority: NewProgramOccurrence["authority"] = entityAuthority()
): State {
  const root = addOccurrence(
    {
      nextOccurrenceOrdinal: state.nextOccurrenceOrdinal,
      occurrences: state.occurrences,
    },
    "root",
    program(authority)
  );
  const child = addOccurrence(root, "child", standing(target));
  return { ...state, ...child };
}

function characterState(): CharacterMaterialState {
  return structuredClone(createEmptyCharacterMaterialState(4, CHARACTER, livingVitals()));
}

function sharedState(): SharedMaterialState {
  return structuredClone(createEmptySharedMaterialState());
}

function quantity(current = 1) {
  return {
    capacity: { base: { kind: "unbounded" as const }, override: null },
    current,
    disabled: false,
    kind: "count" as const,
  };
}

function item(ordinal: number, itemId = "longsword"): InventoryInstance {
  return {
    attuned: false,
    definition: { itemId, kind: "catalogue" },
    disposition: "nonmagical",
    enchantInstanceId: null,
    equipped: false,
    notes: "",
    ordinal,
    overrides: {
      armorClass: null,
      attackBonus: null,
      damageFormula: null,
      damageType: null,
      name: null,
    },
    ownerOccurrence: null,
    quantity: quantity(),
    resources: {},
    tags: [],
  };
}

function creature(
  ordinal: number,
  ownerOccurrence: CreatureMaterialEntity["ownerOccurrence"] = null
): CreatureMaterialEntity {
  return {
    availability: "present",
    exhaustion: 0,
    kind: "creature",
    label: "",
    ordinal,
    overrides: {
      armorClass: null,
      hitPointMaximum: null,
      initiativeBonus: null,
      speedFt: null,
    },
    ownerOccurrence,
    resources: {},
    template: {
      creatureTypeOverride: null,
      kind: "catalogue-monster",
      monsterId: "goblin-warrior",
    },
    vitals: livingVitals(7),
  };
}

function inventoryObject(
  ordinal: number,
  instanceId: string,
  instanceOrdinal: number
): ObjectMaterialEntity {
  return {
    availability: "present",
    kind: "object",
    label: "",
    ordinal,
    overrides: {
      armorClass: null,
      damageDefenseProfile: null,
      hitPointMaximum: 1,
      magical: null,
      materials: null,
      size: null,
    },
    ownerOccurrence: null,
    resources: {},
    template: {
      instanceId,
      instanceOrdinal,
      kind: "inventory-item",
      owner: CHARACTER,
    },
    vitals: { hitPoints: { current: 1 } },
  };
}

describe("material state schema 3", () => {
  it("constructs exact frozen roots with first-unused physical ordinals", () => {
    const character = createEmptyCharacterMaterialState(4, CHARACTER, livingVitals());
    const shared = createEmptySharedMaterialState();

    expect(character).toMatchObject({
      inventory: {},
      nextEntityOrdinal: 1,
      nextInventoryOrdinal: 1,
      nextOccurrenceOrdinal: 1,
      schema: 3,
    });
    expect(shared).toMatchObject({
      nextEntityOrdinal: 1,
      nextOccurrenceOrdinal: 1,
      schema: 3,
    });
    expect(parseCharacterMaterialState(character, CHARACTER)).toEqual({
      ok: true,
      value: character,
    });
    expect(parseSharedMaterialState(shared, SHARED)).toEqual({
      ok: true,
      value: shared,
    });
    expect(Object.isFrozen(character)).toBe(true);
  });

  it("has no schema-2 or missing physical-identity compatibility path", () => {
    const oldSchema = { ...characterState(), schema: 2 };
    expect(parseCharacterMaterialState(oldSchema, CHARACTER)).toEqual({ ok: false });

    const missingInventoryCounter = characterState() as unknown as Record<
      string,
      unknown
    >;
    delete missingInventoryCounter.nextInventoryOrdinal;
    expect(parseCharacterMaterialState(missingInventoryCounter, CHARACTER)).toEqual({
      ok: false,
    });

    const missingItemOrdinal = characterState();
    missingItemOrdinal.nextInventoryOrdinal = 2;
    missingItemOrdinal.inventory.sword = item(1);
    delete (missingItemOrdinal.inventory.sword as unknown as { ordinal?: number })
      .ordinal;
    expect(parseCharacterMaterialState(missingItemOrdinal, CHARACTER)).toEqual({
      ok: false,
    });

    const missingEntityOrdinal = sharedState();
    missingEntityOrdinal.nextEntityOrdinal = 2;
    missingEntityOrdinal.entities.goblin = creature(1);
    delete (missingEntityOrdinal.entities.goblin as unknown as { ordinal?: number })
      .ordinal;
    expect(parseSharedMaterialState(missingEntityOrdinal, SHARED)).toEqual({ ok: false });
  });

  it("enforces unique inventory ordinals below a monotonic high-water mark", () => {
    const valid = characterState();
    valid.nextInventoryOrdinal = 3;
    valid.inventory = { sword: item(1), shield: item(2, "shield") };
    expect(parseCharacterMaterialState(valid, CHARACTER).ok).toBe(true);

    const duplicate = structuredClone(valid);
    if (duplicate.inventory.shield) duplicate.inventory.shield.ordinal = 1;
    expect(parseCharacterMaterialState(duplicate, CHARACTER)).toEqual({ ok: false });

    const usedHighWater = structuredClone(valid);
    usedHighWater.nextInventoryOrdinal = 2;
    expect(parseCharacterMaterialState(usedHighWater, CHARACTER)).toEqual({ ok: false });

    const afterDeletion = structuredClone(valid);
    afterDeletion.inventory = {};
    expect(parseCharacterMaterialState(afterDeletion, CHARACTER).ok).toBe(true);
    expect(afterDeletion.nextInventoryOrdinal).toBe(3);
  });

  it("enforces unique entity ordinals below the existing monotonic high-water mark", () => {
    const valid = sharedState();
    valid.nextEntityOrdinal = 3;
    valid.entities = { first: creature(1), second: creature(2) };
    expect(parseSharedMaterialState(valid, SHARED).ok).toBe(true);

    const duplicate = structuredClone(valid);
    if (duplicate.entities.second) duplicate.entities.second.ordinal = 1;
    expect(parseSharedMaterialState(duplicate, SHARED)).toEqual({ ok: false });

    const usedHighWater = structuredClone(valid);
    usedHighWater.nextEntityOrdinal = 2;
    expect(parseSharedMaterialState(usedHighWater, SHARED)).toEqual({ ok: false });

    const afterDeletion = structuredClone(valid);
    afterDeletion.entities = {};
    expect(parseSharedMaterialState(afterDeletion, SHARED).ok).toBe(true);
    expect(afterDeletion.nextEntityOrdinal).toBe(3);
  });

  it.each(["table", "environment"] as const)(
    "accepts table-native %s entities without duplicated provenance",
    (authority) => {
      let state = sharedState();
      state.nextEntityOrdinal = 2;
      state.entities.hazard = creature(1);
      state = withProgram(
        state,
        { entityId: "hazard", material: SHARED, ordinal: 1 },
        tableAuthority(authority)
      );
      expect(parseSharedMaterialState(state, SHARED).ok).toBe(true);
      expect(state.entities.hazard).not.toHaveProperty("source");
    }
  );

  it("ignores targetless root anchors as live-presence edges", () => {
    const state = characterState();
    const occurrenceState = addOccurrence(
      {
        nextOccurrenceOrdinal: state.nextOccurrenceOrdinal,
        occurrences: state.occurrences,
      },
      "root",
      program(
        entityAuthority({
          activator: SELF,
          caster: SELF,
          owner: SELF,
          source: GHOST,
          target: GHOST,
        })
      )
    );
    const candidate = { ...state, ...occurrenceState };
    expect(parseCharacterMaterialState(candidate, CHARACTER).ok).toBe(true);
  });

  it("requires entity ownership to name a local effect targeting that exact entity", () => {
    const target = {
      entityId: "familiar",
      material: CHARACTER,
      ordinal: 1,
    } as const;
    const valid = withProgram(characterState(), target);
    valid.nextEntityOrdinal = 2;
    valid.entities.familiar = creature(1, {
      occurrence: { material: CHARACTER, occurrenceId: "child" },
      ordinal: 2,
    });
    const parsed = parseCharacterMaterialState(valid, CHARACTER);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.entities.familiar).not.toHaveProperty("source");
    expect(resolveOccurrenceAuthority(parsed.value, "child")?.authority).toEqual(
      entityAuthority()
    );

    const rootOwned = structuredClone(valid);
    if (rootOwned.entities.familiar) {
      rootOwned.entities.familiar.ownerOccurrence = {
        occurrence: { material: CHARACTER, occurrenceId: "root" },
        ordinal: 1,
      };
    }
    expect(parseCharacterMaterialState(rootOwned, CHARACTER)).toEqual({ ok: false });

    const staleTarget = structuredClone(valid);
    const staleChild = staleTarget.occurrences.child;
    if (staleChild?.kind !== "standing") throw new Error("expected owned effect fixture");
    staleChild.target = { ...target, ordinal: 2 };
    expect(parseCharacterMaterialState(staleTarget, CHARACTER)).toEqual({ ok: false });

    const wrongTarget = structuredClone(valid);
    const child = wrongTarget.occurrences.child;
    if (child?.kind !== "standing") throw new Error("expected owned effect fixture");
    child.target = SELF;
    expect(parseCharacterMaterialState(wrongTarget, CHARACTER)).toEqual({ ok: false });
  });

  it("requires inventory ownership to name an effect targeting self", () => {
    const valid = withProgram(characterState(), SELF);
    valid.nextInventoryOrdinal = 2;
    valid.inventory.sword = {
      ...item(1),
      ownerOccurrence: {
        occurrence: { material: CHARACTER, occurrenceId: "child" },
        ordinal: 2,
      },
    };
    expect(parseCharacterMaterialState(valid, CHARACTER).ok).toBe(true);

    const rootOwned = structuredClone(valid);
    if (rootOwned.inventory.sword) {
      rootOwned.inventory.sword.ownerOccurrence = {
        occurrence: { material: CHARACTER, occurrenceId: "root" },
        ordinal: 1,
      };
    }
    expect(parseCharacterMaterialState(rootOwned, CHARACTER)).toEqual({ ok: false });

    const otherTarget = structuredClone(valid);
    const child = otherTarget.occurrences.child;
    if (child?.kind !== "standing") throw new Error("expected owned effect fixture");
    child.target = GHOST;
    expect(parseCharacterMaterialState(otherTarget, CHARACTER)).toEqual({ ok: false });
  });

  it("binds inventory-backed objects to the exact physical item generation", () => {
    const valid = characterState();
    valid.nextInventoryOrdinal = 2;
    valid.inventory.wand = item(1, "wand");
    valid.nextEntityOrdinal = 2;
    valid.entities.wandObject = inventoryObject(1, "wand", 1);
    expect(parseCharacterMaterialState(valid, CHARACTER).ok).toBe(true);

    const staleGeneration = structuredClone(valid);
    if (staleGeneration.inventory.wand) staleGeneration.inventory.wand.ordinal = 2;
    staleGeneration.nextInventoryOrdinal = 3;
    expect(parseCharacterMaterialState(staleGeneration, CHARACTER)).toEqual({
      ok: false,
    });

    const currentGeneration = structuredClone(staleGeneration);
    const object = currentGeneration.entities.wandObject;
    if (object?.kind !== "object" || object.template.kind !== "inventory-item") {
      throw new Error("expected inventory-object fixture");
    }
    object.template.instanceOrdinal = 2;
    expect(parseCharacterMaterialState(currentGeneration, CHARACTER).ok).toBe(true);

    const missingGeneration = structuredClone(valid);
    const missingObject = missingGeneration.entities.wandObject;
    if (
      missingObject?.kind !== "object" ||
      missingObject.template.kind !== "inventory-item"
    ) {
      throw new Error("expected inventory-object fixture");
    }
    delete (missingObject.template as unknown as { instanceOrdinal?: number })
      .instanceOrdinal;
    expect(parseCharacterMaterialState(missingGeneration, CHARACTER)).toEqual({
      ok: false,
    });
  });

  it("rejects hostile roots without executing accessors", () => {
    const accessor = characterState();
    Object.defineProperty(accessor, "nextInventoryOrdinal", {
      enumerable: true,
      get: () => 1,
    });
    expect(parseCharacterMaterialState(accessor, CHARACTER)).toEqual({ ok: false });

    const customPrototype = Object.create({ inherited: true }) as Record<string, unknown>;
    Object.assign(customPrototype, sharedState());
    expect(parseSharedMaterialState(customPrototype, SHARED)).toEqual({ ok: false });
  });
});
