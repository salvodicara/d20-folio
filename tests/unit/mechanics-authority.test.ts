import { describe, expect, it } from "vitest";

import { canonicalJson } from "@/lib/canonical-fingerprint";
import {
  conformMechanicsAuthorityDefinition,
  conformMechanicsAuthoritySnapshot,
  mechanicsAuthorityDefinitionFingerprint,
  mechanicsAuthorityDefinitionKey,
  mechanicsAuthoritySnapshotKey,
  resolveInstalledMechanicsCapability,
  resolveMechanicsProgramAuthorityReceipt,
} from "@/lib/mechanics-authority";
import {
  conformMechanicsCapabilitySnapshot,
  mechanicsCapabilitySnapshotFingerprint,
  mechanicsCapabilitySnapshotKey,
} from "@/lib/mechanics-capability";
import {
  conformHomebrewDefinitionOwnerRef,
  conformMechanicsCapabilityInstallationRef,
  conformMechanicsCapabilityRef,
  conformMechanicsDefinitionRef,
  conformMechanicsInvocationRef,
  conformMechanicsSourceRef,
  conformTableDeclarationMechanicsDefinitionRef,
  homebrewDefinitionOwnerRefKey,
  mechanicsBuildFactAddress,
  mechanicsCapabilityInstallationRefKey,
  mechanicsCapabilityRefKey,
  mechanicsDefinitionFactAddress,
  mechanicsDefinitionRefKey,
  mechanicsInstallationFactAddress,
  mechanicsInvocationRefKey,
  mechanicsResourceFactAddress,
  mechanicsSourceRefKey,
  tableDeclarationMechanicsDefinitionRefKey,
} from "@/lib/mechanics-authority-ref";
import type {
  MechanicsActorSpec,
  MechanicsAuthorityDefinition,
} from "@/types/mechanics-authority";
import type { MechanicsCapabilitySnapshot } from "@/types/mechanics-capability";
import type {
  HomebrewDefinitionOwnerRef,
  MechanicsAuthorityAnchors,
  MechanicsCapabilityInstallationRef,
  MechanicsCapabilityRef,
  MechanicsDefinitionRef,
  MechanicsInvocationRef,
  MechanicsRevision,
  MechanicsSourceRef,
} from "@/types/mechanics-authority-ref";

const REVISION: MechanicsRevision = `sha256:${"0".repeat(64)}`;
const MATERIAL = {
  characterId: "character-1",
  kind: "character-play",
  uid: "user-1",
} as const;
const ENTITY = { entityId: "self", material: MATERIAL } as const;
const OTHER_ENTITY = { entityId: "other", material: MATERIAL, ordinal: 1 } as const;
const MATERIAL_ENTITY = {
  entityId: "familiar",
  material: MATERIAL,
  ordinal: 13,
} as const;
const TABLE_OWNER = {
  authority: "table",
  kind: "material-authority",
  material: MATERIAL,
} as const;

const CATALOGUE_DEFINITION = {
  catalogueKind: "spell",
  entityId: "spell.fireball",
  kind: "catalogue",
  mechanicsRevision: REVISION,
} as const;
const CHARACTER_BUILD_DEFINITION = {
  generation: 3,
  kind: "homebrew",
  owner: {
    character: MATERIAL,
    collection: "spell",
    entryId: "custom-spell-1",
    kind: "character-build",
  },
} as const;
const INVENTORY_DEFINITION = {
  generation: 5,
  kind: "homebrew",
  owner: {
    character: MATERIAL,
    instanceId: "item-1",
    instanceOrdinal: 7,
    kind: "inventory-item",
  },
} as const;
const ENTITY_DEFINITION = {
  generation: 11,
  kind: "homebrew",
  owner: {
    entity: MATERIAL_ENTITY,
    kind: "material-entity",
  },
} as const;
const TABLE_DEFINITION = {
  authority: "table",
  declarationId: "hazard-1",
  generation: 17,
  kind: "table-declaration",
  material: MATERIAL,
} as const;
const CAPABILITY = {
  capabilityId: "primary",
  definition: CATALOGUE_DEFINITION,
  kind: "program",
} as const;
const INSTALLATION = {
  capability: CAPABILITY,
  generation: 19,
  installationId: "install-1",
  owner: ENTITY,
} as const;
const TABLE_CAPABILITY = {
  capabilityId: "hazard",
  definition: TABLE_DEFINITION,
  kind: "system",
} as const;
const TABLE_INSTALLATION = {
  capability: TABLE_CAPABILITY,
  generation: 23,
  installationId: "hazard-installation",
  owner: TABLE_OWNER,
} as const;

const ANCHORS = {
  activator: ENTITY,
  caster: ENTITY,
  owner: ENTITY,
  source: ENTITY,
  target: ENTITY,
} as const;

function program(id = "primary") {
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
  } as const;
}

function executableSnapshot(
  ref: MechanicsCapabilityRef = CAPABILITY
): MechanicsCapabilitySnapshot {
  return {
    grantGroups: {
      mobility: [{ grant: { amount: 5, type: "speed" }, grantId: "speed" }],
    },
    program: program(ref.capabilityId),
    ref,
    resources: {
      charges: {
        capacity: { amount: { kind: "fixed", value: 3 }, kind: "bounded" },
        id: "charges",
        initial: { kind: "full" },
        kind: "count",
        recoveries: [],
      },
    },
    schema: 1,
  };
}

function authorityDefinition(
  options: {
    actorSpec?: MechanicsActorSpec;
    anchors?: MechanicsAuthorityAnchors;
    installation?: MechanicsCapabilityInstallationRef;
    snapshot?: MechanicsCapabilitySnapshot;
    source?: MechanicsSourceRef;
  } = {}
): MechanicsAuthorityDefinition {
  const installation = options.installation ?? INSTALLATION;
  const snapshot = options.snapshot ?? executableSnapshot(installation.capability);
  const definition: MechanicsAuthorityDefinition = {
    actorSpec: options.actorSpec ?? { kind: "role", role: "owner" },
    anchors: options.anchors ?? ANCHORS,
    definitionGuards: [
      {
        address: mechanicsDefinitionFactAddress(snapshot.ref.definition),
        expected: {
          present: true,
          value: mechanicsCapabilitySnapshotFingerprint(snapshot),
        },
        lifecycle: "commit",
        owner: installation.owner,
      },
    ],
    installation,
    installationGuards: [],
    owner: installation.owner,
    snapshot,
    source: options.source ?? {
      capability: installation.capability,
      kind: "capability",
      owner: ENTITY,
    },
    staticBindings: { proficiencyBonus: 3 },
  };
  return {
    ...definition,
    installationGuards: [
      {
        address: mechanicsInstallationFactAddress(installation),
        expected: {
          present: true,
          value: mechanicsAuthorityDefinitionFingerprint(definition),
        },
        lifecycle: "commit",
        owner: installation.owner,
      },
    ],
  };
}

describe("mechanics authority exact identity", () => {
  it.each([
    "background",
    "class",
    "class-feature",
    "companion",
    "condition",
    "feat",
    "invocation",
    "item",
    "maneuver",
    "metamagic",
    "monster",
    "object",
    "species",
    "spell",
    "subclass",
    "system",
    "weapon",
  ] as const)("conforms the %s catalogue kind", (catalogueKind) => {
    expect(
      conformMechanicsDefinitionRef({ ...CATALOGUE_DEFINITION, catalogueKind })
    ).toEqual({ ...CATALOGUE_DEFINITION, catalogueKind });
  });

  it.each([
    CHARACTER_BUILD_DEFINITION.owner,
    INVENTORY_DEFINITION.owner,
    ENTITY_DEFINITION.owner,
  ])("conforms every homebrew owner variant", (owner) => {
    expect(conformHomebrewDefinitionOwnerRef(owner)).toEqual(owner);
  });

  it.each([
    CATALOGUE_DEFINITION,
    CHARACTER_BUILD_DEFINITION,
    INVENTORY_DEFINITION,
    ENTITY_DEFINITION,
    TABLE_DEFINITION,
  ])("conforms every definition and homebrew-owner variant", (definition) => {
    expect(conformMechanicsDefinitionRef(definition)).toEqual(definition);
  });

  it("conforms the standalone table declaration reference", () => {
    expect(conformTableDeclarationMechanicsDefinitionRef(TABLE_DEFINITION)).toEqual(
      TABLE_DEFINITION
    );
  });

  it.each(["program", "cast", "attack", "resource", "grant-group", "system"])(
    "conforms the %s capability kind",
    (kind) => {
      expect(conformMechanicsCapabilityRef({ ...CAPABILITY, kind })).toEqual({
        ...CAPABILITY,
        kind,
      });
    }
  );

  it.each([
    { entity: ENTITY, kind: "entity" },
    {
      instanceId: "item-1",
      instanceOrdinal: 7,
      kind: "inventory-item",
      owner: MATERIAL,
    },
    { capability: CAPABILITY, kind: "capability", owner: ENTITY },
    TABLE_DEFINITION,
  ])("conforms every source variant", (source) => {
    expect(conformMechanicsSourceRef(source)).toEqual(source);
  });

  it("conforms installations and both invocation variants", () => {
    expect(conformMechanicsCapabilityInstallationRef(INSTALLATION)).toEqual(INSTALLATION);
    expect(conformMechanicsCapabilityInstallationRef(TABLE_INSTALLATION)).toEqual(
      TABLE_INSTALLATION
    );
    const installed = { installation: INSTALLATION, kind: "installed-capability" };
    const program = {
      kind: "program-root",
      occurrence: {
        occurrence: { material: MATERIAL, occurrenceId: "program-1" },
        ordinal: 1,
      },
    };
    expect(conformMechanicsInvocationRef(installed)).toEqual(installed);
    expect(conformMechanicsInvocationRef(program)).toEqual(program);
  });

  it("returns fresh deeply frozen values with no input aliasing", () => {
    const input = {
      capability: {
        capabilityId: "primary",
        definition: {
          catalogueKind: "spell",
          entityId: "spell.fireball",
          kind: "catalogue",
          mechanicsRevision: REVISION,
        },
        kind: "program",
      },
      kind: "capability",
      owner: {
        entityId: "self",
        material: { characterId: "character-1", kind: "character-play", uid: "user-1" },
      },
    };
    const conformed = conformMechanicsSourceRef(input);
    expect(conformed).not.toBe(input);
    expect(Object.isFrozen(conformed)).toBe(true);
    expect(
      Object.isFrozen(conformed?.kind === "capability" && conformed.capability)
    ).toBe(true);
    input.capability.capabilityId = "changed";
    expect(conformed?.kind === "capability" && conformed.capability.capabilityId).toBe(
      "primary"
    );
  });

  it("rejects hostile shapes, unsafe identifiers, digests and counters", () => {
    expect(
      conformMechanicsDefinitionRef({ ...CATALOGUE_DEFINITION, excess: true })
    ).toBeNull();

    const inherited = Object.assign(
      Object.create({ inherited: true }) as Record<string, unknown>,
      CAPABILITY
    );
    expect(conformMechanicsCapabilityRef(inherited)).toBeNull();

    const sparse = Array(2);
    sparse[1] = CAPABILITY;
    expect(conformMechanicsCapabilityRef(sparse)).toBeNull();

    const unsafe = { entity: ENTITY, kind: "entity" };
    Object.defineProperty(unsafe, "__proto__", { enumerable: true, value: {} });
    expect(conformMechanicsSourceRef(unsafe)).toBeNull();
    expect(
      conformMechanicsDefinitionRef({
        ...CATALOGUE_DEFINITION,
        entityId: "constructor",
      })
    ).toBeNull();
    expect(
      conformMechanicsDefinitionRef({
        ...CATALOGUE_DEFINITION,
        mechanicsRevision: `sha256:${"A".repeat(64)}`,
      })
    ).toBeNull();
    expect(
      conformMechanicsDefinitionRef({ ...INVENTORY_DEFINITION, generation: 0 })
    ).toBeNull();
    expect(
      conformMechanicsDefinitionRef({
        ...ENTITY_DEFINITION,
        owner: { ...ENTITY_DEFINITION.owner, entityOrdinal: 13 },
      })
    ).toBeNull();
    expect(
      conformMechanicsDefinitionRef({
        ...INVENTORY_DEFINITION,
        owner: { ...INVENTORY_DEFINITION.owner, instanceOrdinal: -0 },
      })
    ).toBeNull();
    expect(
      conformMechanicsCapabilityInstallationRef({
        ...INSTALLATION,
        generation: 1.5,
      })
    ).toBeNull();
    expect(
      conformMechanicsDefinitionRef({
        ...TABLE_DEFINITION,
        generation: Number.MAX_SAFE_INTEGER + 1,
      })
    ).toBeNull();
  });
});

describe("mechanics authority stable keys", () => {
  it("normalizes object order for every reference family", () => {
    const reorderedDefinition = {
      mechanicsRevision: REVISION,
      kind: "catalogue",
      entityId: "spell.fireball",
      catalogueKind: "spell",
    } as MechanicsDefinitionRef;
    const reorderedCapability = {
      kind: "program",
      definition: reorderedDefinition,
      capabilityId: "primary",
    } as MechanicsCapabilityRef;
    const source = {
      capability: CAPABILITY,
      kind: "capability",
      owner: ENTITY,
    } as MechanicsSourceRef;
    const reorderedSource = {
      owner: { material: MATERIAL, entityId: "self" },
      kind: "capability",
      capability: reorderedCapability,
    } as MechanicsSourceRef;
    const reorderedInstallation = {
      owner: ENTITY,
      installationId: "install-1",
      generation: 19,
      capability: reorderedCapability,
    } as MechanicsCapabilityInstallationRef;
    const invocation = {
      installation: INSTALLATION,
      kind: "installed-capability",
    } as MechanicsInvocationRef;
    const reorderedInvocation = {
      kind: "installed-capability",
      installation: reorderedInstallation,
    } as MechanicsInvocationRef;

    expect(
      homebrewDefinitionOwnerRefKey(
        CHARACTER_BUILD_DEFINITION.owner as HomebrewDefinitionOwnerRef
      )
    ).toBe(
      homebrewDefinitionOwnerRefKey({
        character: MATERIAL,
        entryId: "custom-spell-1",
        kind: "character-build",
        collection: "spell",
      })
    );
    expect(mechanicsDefinitionRefKey(CATALOGUE_DEFINITION)).toBe(
      mechanicsDefinitionRefKey(reorderedDefinition)
    );
    expect(tableDeclarationMechanicsDefinitionRefKey(TABLE_DEFINITION)).toBe(
      tableDeclarationMechanicsDefinitionRefKey({
        material: MATERIAL,
        kind: "table-declaration",
        generation: 17,
        declarationId: "hazard-1",
        authority: "table",
      })
    );
    expect(mechanicsCapabilityRefKey(CAPABILITY)).toBe(
      mechanicsCapabilityRefKey(reorderedCapability)
    );
    expect(mechanicsSourceRefKey(source)).toBe(mechanicsSourceRefKey(reorderedSource));
    expect(mechanicsCapabilityInstallationRefKey(INSTALLATION)).toBe(
      mechanicsCapabilityInstallationRefKey(reorderedInstallation)
    );
    expect(mechanicsInvocationRefKey(invocation)).toBe(
      mechanicsInvocationRefKey(reorderedInvocation)
    );
  });

  it("distinguishes ABA identity through every ordinal and generation", () => {
    expect(
      mechanicsDefinitionRefKey(INVENTORY_DEFINITION as MechanicsDefinitionRef)
    ).not.toBe(
      mechanicsDefinitionRefKey({
        ...INVENTORY_DEFINITION,
        owner: { ...INVENTORY_DEFINITION.owner, instanceOrdinal: 8 },
      })
    );
    expect(mechanicsDefinitionRefKey(ENTITY_DEFINITION)).not.toBe(
      mechanicsDefinitionRefKey({
        ...ENTITY_DEFINITION,
        owner: {
          ...ENTITY_DEFINITION.owner,
          entity: { ...ENTITY_DEFINITION.owner.entity, ordinal: 14 },
        },
      })
    );
    expect(mechanicsDefinitionRefKey(TABLE_DEFINITION)).not.toBe(
      mechanicsDefinitionRefKey({ ...TABLE_DEFINITION, generation: 18 })
    );
    expect(mechanicsCapabilityInstallationRefKey(INSTALLATION)).not.toBe(
      mechanicsCapabilityInstallationRefKey({ ...INSTALLATION, generation: 20 })
    );
    expect(
      mechanicsSourceRefKey({
        instanceId: "item-1",
        instanceOrdinal: 7,
        kind: "inventory-item",
        owner: MATERIAL,
      })
    ).not.toBe(
      mechanicsSourceRefKey({
        instanceId: "item-1",
        instanceOrdinal: 8,
        kind: "inventory-item",
        owner: MATERIAL,
      })
    );
  });
});

describe("mechanics authority fact addresses", () => {
  it("builds canonical bounded definition paths for every owner family", () => {
    const paths = [
      mechanicsDefinitionFactAddress(CATALOGUE_DEFINITION),
      mechanicsDefinitionFactAddress(CHARACTER_BUILD_DEFINITION),
      mechanicsDefinitionFactAddress(INVENTORY_DEFINITION),
      mechanicsDefinitionFactAddress(ENTITY_DEFINITION),
      mechanicsDefinitionFactAddress(TABLE_DEFINITION),
    ];

    expect(paths).toEqual([
      [
        "mechanics-definition",
        "catalogue",
        "spell",
        "spell.fireball",
        "revision",
        REVISION,
      ],
      [
        "mechanics-definition",
        "homebrew",
        "character-build",
        "character-play",
        "user-1",
        "character-1",
        "spell",
        "custom-spell-1",
        "3",
      ],
      [
        "mechanics-definition",
        "homebrew",
        "inventory-item",
        "character-play",
        "user-1",
        "character-1",
        "item-1",
        "7",
        "5",
      ],
      [
        "mechanics-definition",
        "homebrew",
        "material-entity",
        "character-play",
        "user-1",
        "character-1",
        "familiar",
        "13",
        "11",
      ],
      [
        "mechanics-definition",
        "table-declaration",
        "character-play",
        "user-1",
        "character-1",
        "table",
        "hazard-1",
        "17",
      ],
    ]);
    for (const path of paths) {
      expect(Object.isFrozen(path)).toBe(true);
      expect(path.length).toBeLessThanOrEqual(16);
      expect(path.every((segment) => segment.length > 0 && segment.length <= 256)).toBe(
        true
      );
    }
  });

  it("builds exact resource and build paths and rejects invalid path input", () => {
    expect(
      mechanicsResourceFactAddress(CATALOGUE_DEFINITION, "pool.channel-divinity")
    ).toEqual([
      "mechanics-definition",
      "catalogue",
      "spell",
      "spell.fireball",
      "revision",
      REVISION,
      "resource",
      "pool.channel-divinity",
    ]);
    expect(mechanicsBuildFactAddress(0)).toEqual(["build", "0"]);
    expect(mechanicsBuildFactAddress(4, ["features", "feature-1"])).toEqual([
      "build",
      "4",
      "features",
      "feature-1",
    ]);
    expect(Object.isFrozen(mechanicsBuildFactAddress(4))).toBe(true);
    expect(() => mechanicsResourceFactAddress(CATALOGUE_DEFINITION, "__proto__")).toThrow(
      TypeError
    );
    expect(() => mechanicsBuildFactAddress(-0)).toThrow(TypeError);
    expect(() => mechanicsBuildFactAddress(1, Array(1))).toThrow(TypeError);
    expect(() =>
      mechanicsDefinitionFactAddress({
        ...INVENTORY_DEFINITION,
        generation: 0,
      })
    ).toThrow(TypeError);
  });

  it("builds bounded installation slots without embedding ABA generations", () => {
    expect(mechanicsInstallationFactAddress(INSTALLATION)).toEqual([
      "mechanics-installation",
      "character-play",
      "user-1",
      "character-1",
      "entity",
      "self",
      "install-1",
    ]);
    expect(mechanicsInstallationFactAddress(TABLE_INSTALLATION)).toEqual([
      "mechanics-installation",
      "character-play",
      "user-1",
      "character-1",
      "material-authority",
      "table",
      "hazard-installation",
    ]);
    expect(mechanicsInstallationFactAddress({ ...INSTALLATION, generation: 20 })).toEqual(
      mechanicsInstallationFactAddress(INSTALLATION)
    );
    expect(Object.isFrozen(mechanicsInstallationFactAddress(INSTALLATION))).toBe(true);
    expect(() =>
      mechanicsInstallationFactAddress({ ...INSTALLATION, installationId: "__proto__" })
    ).toThrow(TypeError);
  });
});

describe("authoritative executable closure", () => {
  it.each(["program", "cast", "attack", "system"] as const)(
    "requires an exact executable body for %s capabilities",
    (kind) => {
      const ref = { ...CAPABILITY, kind };
      const snapshot = executableSnapshot(ref);
      expect(conformMechanicsCapabilitySnapshot(snapshot)).toEqual(snapshot);
      expect(
        conformMechanicsCapabilitySnapshot({ ...snapshot, program: null })
      ).toBeNull();
      expect(
        conformMechanicsCapabilitySnapshot({
          ...snapshot,
          program: program("another-capability"),
        })
      ).toBeNull();
    }
  );

  it.each(["resource", "grant-group"] as const)(
    "forbids hidden executable bodies on %s leaf capabilities",
    (kind) => {
      const ref = { ...CAPABILITY, kind };
      const leaf = { ...executableSnapshot(ref), program: null };
      expect(conformMechanicsCapabilitySnapshot(leaf)).toEqual(leaf);
      expect(
        conformMechanicsCapabilitySnapshot({ ...leaf, program: program("primary") })
      ).toBeNull();
    }
  );

  it("enforces resource and grant-group identities", () => {
    const snapshot = executableSnapshot();
    expect(
      conformMechanicsCapabilitySnapshot({
        ...snapshot,
        resources: { other: snapshot.resources.charges },
      })
    ).toBeNull();
    expect(
      conformMechanicsCapabilitySnapshot({
        ...snapshot,
        grantGroups: { __proto__: snapshot.grantGroups.mobility },
      })
    ).toBeNull();
    expect(
      conformMechanicsCapabilitySnapshot({
        ...snapshot,
        grantGroups: {
          first: snapshot.grantGroups.mobility,
          second: snapshot.grantGroups.mobility,
        },
      })
    ).toBeNull();
    expect(
      conformMechanicsCapabilitySnapshot({
        ...snapshot,
        grantGroups: {
          mobility: [
            { grant: { amount: 5, future: true, type: "speed" }, grantId: "speed" },
          ],
        },
      })
    ).toBeNull();
  });

  it("is exact, immutable, alias-free and canonically fingerprinted", () => {
    const input = structuredClone(executableSnapshot());
    const parsed = conformMechanicsCapabilitySnapshot(input);
    expect(parsed).not.toBe(input);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed?.grantGroups.mobility?.[0]?.grant)).toBe(true);
    const inputCharges = input.resources.charges;
    if (!inputCharges) throw new Error("charges fixture");
    Reflect.set(inputCharges, "id", "changed");
    expect(parsed?.resources.charges?.id).toBe("charges");
    expect(
      conformMechanicsCapabilitySnapshot({ ...executableSnapshot(), excess: true })
    ).toBeNull();

    const reordered = {
      schema: 1,
      resources: executableSnapshot().resources,
      ref: CAPABILITY,
      program: program(),
      grantGroups: executableSnapshot().grantGroups,
    } as MechanicsCapabilitySnapshot;
    expect(mechanicsCapabilitySnapshotFingerprint(executableSnapshot())).toBe(
      mechanicsCapabilitySnapshotFingerprint(reordered)
    );
    expect(mechanicsCapabilitySnapshotFingerprint(executableSnapshot())).toMatch(
      /^sha256:[0-9a-f]{64}$/
    );
    expect(mechanicsCapabilitySnapshotKey(executableSnapshot())).toBe(
      mechanicsCapabilitySnapshotFingerprint(executableSnapshot())
    );
    expect(() =>
      mechanicsCapabilitySnapshotFingerprint({
        ...executableSnapshot(),
        staticBindings: {},
      } as never)
    ).toThrow(TypeError);
  });
});

describe("mechanics authority closure", () => {
  it("conforms one exact immutable closure and fingerprints every installed fact", () => {
    const definition = authorityDefinition();
    const conformed = conformMechanicsAuthorityDefinition(definition);
    expect(conformed).toEqual(definition);
    expect(conformed).not.toBe(definition);
    expect(Object.isFrozen(conformed)).toBe(true);
    expect(Object.isFrozen(conformed?.anchors)).toBe(true);
    expect(mechanicsAuthorityDefinitionKey(definition)).toBe(
      mechanicsCapabilityInstallationRefKey(INSTALLATION)
    );
    expect(definition.installationGuards[0]?.expected).toEqual({
      present: true,
      value: mechanicsAuthorityDefinitionFingerprint(definition),
    });
    expect(
      mechanicsAuthorityDefinitionFingerprint({
        ...definition,
        staticBindings: { proficiencyBonus: 4 },
      })
    ).not.toBe(mechanicsAuthorityDefinitionFingerprint(definition));
  });

  it("projects exactly the durable program-root receipt and rejects forged provenance", () => {
    const definition = authorityDefinition();
    const receipt = resolveMechanicsProgramAuthorityReceipt(definition);

    expect(receipt).toEqual({
      anchors: definition.anchors,
      installation: definition.installation,
      schema: 1,
      snapshot: definition.snapshot,
      source: definition.source,
      staticBindings: definition.staticBindings,
    });
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(
      conformMechanicsAuthorityDefinition({
        ...definition,
        source: { ...definition.source, owner: OTHER_ENTITY },
      })
    ).toBeNull();
    expect(
      resolveMechanicsProgramAuthorityReceipt({
        ...definition,
        snapshot: { ...definition.snapshot, program: null },
      })
    ).toBeNull();
  });

  it("keeps large executable closures inside the semantic-fact value bound", () => {
    const base = executableSnapshot();
    const snapshot: MechanicsCapabilitySnapshot = {
      ...base,
      program: {
        ...program(),
        phases: [
          ...program().phases,
          ...Array.from({ length: 20 }, (_, index) => ({
            inputs: [],
            phaseId: `source-end-${String(index).padStart(2, "0")}-${"x".repeat(80)}`,
            steps: [],
            trigger: { kind: "source-end" as const },
          })),
        ],
      },
    };
    expect(canonicalJson(snapshot).length).toBeGreaterThan(1024);

    const definition = authorityDefinition({ snapshot });
    const capabilityFingerprint = mechanicsCapabilitySnapshotFingerprint(snapshot);
    const closureFingerprint = mechanicsAuthorityDefinitionFingerprint(definition);

    expect(capabilityFingerprint).toHaveLength(71);
    expect(closureFingerprint).toHaveLength(71);
    expect(definition.definitionGuards[0]?.expected).toEqual({
      present: true,
      value: capabilityFingerprint,
    });
    expect(definition.installationGuards[0]?.expected).toEqual({
      present: true,
      value: closureFingerprint,
    });
    expect(conformMechanicsAuthorityDefinition(definition)).toEqual(definition);
  });

  it("requires both non-recursive commit-only attestations and rejects drift", () => {
    const definition = authorityDefinition();
    expect(
      conformMechanicsAuthorityDefinition({
        ...definition,
        owner: OTHER_ENTITY,
      })
    ).toBeNull();
    expect(
      conformMechanicsAuthorityDefinition({
        ...definition,
        installation: {
          ...INSTALLATION,
          capability: { ...CAPABILITY, capabilityId: "other" },
        },
      })
    ).toBeNull();
    expect(
      conformMechanicsAuthorityDefinition({ ...definition, definitionGuards: [] })
    ).toBeNull();
    expect(
      conformMechanicsAuthorityDefinition({ ...definition, installationGuards: [] })
    ).toBeNull();
    expect(
      conformMechanicsAuthorityDefinition({
        ...definition,
        definitionGuards: [
          {
            ...definition.definitionGuards[0],
            address: mechanicsResourceFactAddress(CATALOGUE_DEFINITION, "charges"),
          },
        ],
      })
    ).toBeNull();
    expect(
      conformMechanicsAuthorityDefinition({
        ...definition,
        definitionGuards: [
          {
            ...definition.definitionGuards[0],
            expected: { present: true, value: "forged" },
          },
        ],
      })
    ).toBeNull();
    expect(
      conformMechanicsAuthorityDefinition({
        ...definition,
        installationGuards: [
          { ...definition.installationGuards[0], lifecycle: "commit-redo" },
        ],
      })
    ).toBeNull();
    expect(
      conformMechanicsAuthorityDefinition({
        ...definition,
        installationGuards: [
          {
            ...definition.installationGuards[0],
            expected: { present: true, value: "forged" },
          },
        ],
      })
    ).toBeNull();
    expect(
      conformMechanicsAuthorityDefinition({
        ...definition,
        staticBindings: { proficiencyBonus: 4 },
      })
    ).toBeNull();
  });

  it("requires canonical guard order and forbids conflicts across guard classes", () => {
    const definition = authorityDefinition();
    const auxiliary = {
      address: ["auxiliary"] as const,
      expected: { present: false } as const,
      lifecycle: "commit" as const,
      owner: ENTITY,
    };
    expect(
      conformMechanicsAuthorityDefinition({
        ...definition,
        definitionGuards: [auxiliary, definition.definitionGuards[0]],
      })
    ).not.toBeNull();
    expect(
      conformMechanicsAuthorityDefinition({
        ...definition,
        definitionGuards: [definition.definitionGuards[0], auxiliary],
      })
    ).toBeNull();
    expect(
      conformMechanicsAuthorityDefinition({
        ...definition,
        definitionGuards: [auxiliary, definition.definitionGuards[0]],
        installationGuards: [auxiliary, definition.installationGuards[0]],
      })
    ).toBeNull();
  });

  it("binds role actors to one selected non-null static anchor", () => {
    expect(
      conformMechanicsAuthorityDefinition(
        authorityDefinition({ actorSpec: { kind: "role", role: "source" } })
      )
    ).not.toBeNull();

    const definition = authorityDefinition();
    expect(
      conformMechanicsAuthorityDefinition({
        ...definition,
        anchors: { ...ANCHORS, owner: null },
      })
    ).toBeNull();
    expect(
      conformMechanicsAuthorityDefinition({
        ...definition,
        anchors: { ...ANCHORS, owner: OTHER_ENTITY },
      })
    ).toBeNull();
    expect(
      conformMechanicsAuthorityDefinition({
        ...definition,
        actorSpec: { kind: "role", role: "target" },
      })
    ).toBeNull();
  });

  it("allows actorless table declarations only under coincident material authority", () => {
    const table = authorityDefinition({
      actorSpec: { kind: "table-declaration" },
      anchors: {
        activator: null,
        caster: null,
        owner: null,
        source: null,
        target: null,
      },
      installation: TABLE_INSTALLATION,
      source: TABLE_DEFINITION,
    });
    expect(conformMechanicsAuthorityDefinition(table)).toEqual(table);

    expect(
      conformMechanicsAuthorityDefinition({
        ...table,
        source: { ...TABLE_DEFINITION, declarationId: "another-hazard" },
      })
    ).toBeNull();
    expect(
      conformMechanicsAuthorityDefinition({
        ...table,
        owner: { ...TABLE_OWNER, authority: "environment" },
      })
    ).toBeNull();
    expect(
      conformMechanicsAuthorityDefinition({
        ...table,
        actorSpec: { kind: "role", role: "owner" },
      })
    ).toBeNull();
    expect(
      conformMechanicsAuthorityDefinition({
        ...authorityDefinition(),
        actorSpec: { kind: "table-declaration" },
      })
    ).toBeNull();
  });

  it("rejects hostile and legacy closure shapes", () => {
    const definition = authorityDefinition();
    expect(
      conformMechanicsAuthorityDefinition({ ...definition, future: true })
    ).toBeNull();
    expect(
      conformMechanicsAuthorityDefinition({
        ...definition,
        anchors: { ...definition.anchors, victim: ENTITY },
      })
    ).toBeNull();
    expect(
      conformMechanicsAuthorityDefinition({
        ...definition,
        roles: definition.anchors,
      })
    ).toBeNull();
    const sparse = Array(2);
    sparse[1] = definition.definitionGuards[0];
    expect(
      conformMechanicsAuthorityDefinition({ ...definition, definitionGuards: sparse })
    ).toBeNull();
  });

  it("requires canonical unique installations but permits two physical copies", () => {
    const firstInstallation = {
      ...INSTALLATION,
      installationId: "install-item-1",
    };
    const secondInstallation = {
      ...INSTALLATION,
      installationId: "install-item-2",
    };
    const first = authorityDefinition({
      installation: firstInstallation,
      source: {
        instanceId: "item-1",
        instanceOrdinal: 1,
        kind: "inventory-item",
        owner: MATERIAL,
      },
    });
    const second = authorityDefinition({
      installation: secondInstallation,
      source: {
        instanceId: "item-2",
        instanceOrdinal: 2,
        kind: "inventory-item",
        owner: MATERIAL,
      },
    });
    const definitions = [first, second].sort((left, right) =>
      mechanicsAuthorityDefinitionKey(left) < mechanicsAuthorityDefinitionKey(right)
        ? -1
        : 1
    );
    const snapshot = { definitions };
    expect(conformMechanicsAuthoritySnapshot(snapshot)).toEqual(snapshot);
    expect(Object.isFrozen(conformMechanicsAuthoritySnapshot(snapshot))).toBe(true);
    expect(mechanicsAuthoritySnapshotKey(snapshot)).toBe(
      mechanicsAuthoritySnapshotKey({ definitions: [...definitions] })
    );
    expect(mechanicsAuthoritySnapshotKey(snapshot)).toMatch(/^sha256:[0-9a-f]{64}$/);

    expect(
      conformMechanicsAuthoritySnapshot({ definitions: [definitions[1], definitions[0]] })
    ).toBeNull();
    expect(conformMechanicsAuthoritySnapshot({ definitions: [first, first] })).toBeNull();
    const ABA = authorityDefinition({
      installation: {
        ...firstInstallation,
        generation: firstInstallation.generation + 1,
      },
      source: first.source,
    });
    expect(
      conformMechanicsAuthoritySnapshot({
        definitions: [first, ABA].sort((left, right) =>
          mechanicsAuthorityDefinitionKey(left) < mechanicsAuthorityDefinitionKey(right)
            ? -1
            : 1
        ),
      })
    ).toBeNull();
  });

  it("scopes installation identities by their journal actor", () => {
    const first = authorityDefinition();
    const otherInstallation = {
      ...INSTALLATION,
      owner: OTHER_ENTITY,
    };
    const second = authorityDefinition({
      anchors: { ...ANCHORS, owner: OTHER_ENTITY },
      installation: otherInstallation,
      source: { capability: CAPABILITY, kind: "capability", owner: OTHER_ENTITY },
    });
    const definitions = [first, second].sort((left, right) =>
      mechanicsAuthorityDefinitionKey(left) < mechanicsAuthorityDefinitionKey(right)
        ? -1
        : 1
    );
    expect(conformMechanicsAuthoritySnapshot({ definitions })).toEqual({ definitions });
  });

  it("resolves only an exact installed invocation with no aliases", () => {
    const definition = authorityDefinition();
    const input = { definitions: [definition] };
    const resolved = resolveInstalledMechanicsCapability(input, {
      installation: INSTALLATION,
      kind: "installed-capability",
    });
    expect(resolved).toEqual(definition);
    expect(resolved).not.toBe(definition);
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(
      resolveInstalledMechanicsCapability(input, {
        installation: { ...INSTALLATION, generation: 20 },
        kind: "installed-capability",
      })
    ).toBeNull();
    expect(
      resolveInstalledMechanicsCapability(input, {
        kind: "program-root",
        occurrence: { material: MATERIAL, occurrenceId: "program-1" },
      })
    ).toBeNull();
  });
});
