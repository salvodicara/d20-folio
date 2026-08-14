/// <reference types="node" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  conformMechanicsProgramAuthorityReceipt,
  mechanicsProgramAuthorityReceiptFingerprint,
} from "@/lib/mechanics-program-receipt";
import type { MechanicsCapabilitySnapshot } from "@/types/mechanics-capability";
import type { MechanicsProgramAuthorityReceipt } from "@/types/mechanics-program-receipt";

const MATERIAL = {
  characterId: "character-1",
  kind: "character-play",
  uid: "user-1",
} as const;
const ENTITY = { entityId: "self", material: MATERIAL } as const;
const OTHER_ENTITY = { entityId: "other", material: MATERIAL, ordinal: 1 } as const;
const DEFINITION = {
  catalogueKind: "spell",
  entityId: "spell.fireball",
  kind: "catalogue",
  mechanicsRevision: `sha256:${"0".repeat(64)}`,
} as const;
const CAPABILITY = {
  capabilityId: "primary",
  definition: DEFINITION,
  kind: "program",
} as const;
const INSTALLATION = {
  capability: CAPABILITY,
  generation: 3,
  installationId: "installation-1",
  owner: ENTITY,
} as const;
const ANCHORS = {
  activator: ENTITY,
  caster: ENTITY,
  owner: ENTITY,
  source: OTHER_ENTITY,
  target: OTHER_ENTITY,
} as const;

function program(id: string = CAPABILITY.capabilityId) {
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

function snapshot(
  ref: MechanicsCapabilitySnapshot["ref"] = CAPABILITY,
  programId = ref.capabilityId
): MechanicsCapabilitySnapshot {
  return {
    grantGroups: {},
    program: program(programId),
    ref,
    resources: {},
    schema: 1,
  };
}

function receipt(): MechanicsProgramAuthorityReceipt {
  return {
    anchors: ANCHORS,
    installation: INSTALLATION,
    schema: 1,
    snapshot: snapshot(),
    source: { capability: CAPABILITY, kind: "capability", owner: ENTITY },
    staticBindings: { proficiencyBonus: 3 },
  };
}

describe("mechanics program authority receipt", () => {
  it("conforms only the durable executable closure without aliasing role anchors", () => {
    const input = structuredClone(receipt());
    const conformed = conformMechanicsProgramAuthorityReceipt(input);
    if (!conformed) throw new Error("fixture must conform");

    expect(conformed).toEqual(input);
    expect(conformed).not.toBe(input);
    expect(conformed.anchors.owner).not.toBe(input.anchors.owner);
    expect(conformed.anchors.owner).not.toBe(conformed.anchors.caster);
    expect(Object.isFrozen(conformed)).toBe(true);
    expect(Object.isFrozen(conformed.installation)).toBe(true);
    expect(Object.isFrozen(conformed.snapshot.program)).toBe(true);
    expect(Object.isFrozen(conformed.staticBindings)).toBe(true);

    Reflect.set(input.installation, "installationId", "changed");
    Reflect.set(input.staticBindings, "proficiencyBonus", 9);
    expect(conformed.installation.installationId).toBe("installation-1");
    expect(conformed.staticBindings.proficiencyBonus).toBe(3);
  });

  it("binds installation, executable program and capability provenance exactly", () => {
    const valid = receipt();
    expect(conformMechanicsProgramAuthorityReceipt(valid)).toEqual(valid);
    expect(
      conformMechanicsProgramAuthorityReceipt({
        ...valid,
        installation: {
          ...valid.installation,
          capability: { ...CAPABILITY, capabilityId: "other" },
        },
      })
    ).toBeNull();
    expect(
      conformMechanicsProgramAuthorityReceipt({
        ...valid,
        snapshot: { ...valid.snapshot, program: null },
      })
    ).toBeNull();
    expect(
      conformMechanicsProgramAuthorityReceipt({
        ...valid,
        snapshot: snapshot(CAPABILITY, "other"),
      })
    ).toBeNull();
    expect(
      conformMechanicsProgramAuthorityReceipt({
        ...valid,
        source: {
          ...valid.source,
          capability: { ...CAPABILITY, capabilityId: "other" },
        },
      })
    ).toBeNull();
    expect(
      conformMechanicsProgramAuthorityReceipt({
        ...valid,
        source: { ...valid.source, owner: OTHER_ENTITY },
      })
    ).toBeNull();
  });

  it("fingerprints the complete executable receipt without lossy aliases", () => {
    const valid = receipt();
    const fingerprint = mechanicsProgramAuthorityReceiptFingerprint(valid);

    expect(fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(mechanicsProgramAuthorityReceiptFingerprint(structuredClone(valid))).toBe(
      fingerprint
    );
    expect(
      mechanicsProgramAuthorityReceiptFingerprint({
        ...valid,
        anchors: { ...valid.anchors, target: ENTITY },
      })
    ).not.toBe(fingerprint);
    expect(() =>
      mechanicsProgramAuthorityReceiptFingerprint({ ...valid, schema: 2 } as never)
    ).toThrow(TypeError);
  });

  it("keeps semantic anchors independent from installation provenance", () => {
    const valid = receipt();
    expect(valid.anchors.source).not.toEqual(valid.installation.owner);
    expect(conformMechanicsProgramAuthorityReceipt(valid)).not.toBeNull();
  });

  it.each(["table", "environment"] as const)(
    "requires exact table-declaration provenance for %s roots",
    (authority) => {
      const tableDefinition = {
        authority,
        declarationId: "hazard-1",
        generation: 5,
        kind: "table-declaration",
        material: MATERIAL,
      } as const;
      const tableCapability = {
        capabilityId: "hazard",
        definition: tableDefinition,
        kind: "system",
      } as const;
      const tableInstallation = {
        capability: tableCapability,
        generation: 7,
        installationId: "hazard-installation",
        owner: {
          authority,
          kind: "material-authority",
          material: MATERIAL,
        },
      } as const;
      const tableReceipt = {
        anchors: ANCHORS,
        installation: tableInstallation,
        schema: 1,
        snapshot: snapshot(tableCapability),
        source: tableDefinition,
        staticBindings: {},
      } as const;

      expect(conformMechanicsProgramAuthorityReceipt(tableReceipt)).toEqual(tableReceipt);
      expect(
        conformMechanicsProgramAuthorityReceipt({
          ...tableReceipt,
          source: { capability: tableCapability, kind: "capability", owner: ENTITY },
        })
      ).toBeNull();
      expect(
        conformMechanicsProgramAuthorityReceipt({
          ...tableReceipt,
          source: { ...tableDefinition, declarationId: "other" },
        })
      ).toBeNull();
    }
  );

  it("rejects hostile, excessive and non-receipt persisted fields", () => {
    const valid = receipt();
    const missingSchema = {
      anchors: valid.anchors,
      installation: valid.installation,
      snapshot: valid.snapshot,
      source: valid.source,
      staticBindings: valid.staticBindings,
    };
    expect(conformMechanicsProgramAuthorityReceipt(missingSchema)).toBeNull();
    expect(conformMechanicsProgramAuthorityReceipt({ ...valid, schema: 2 })).toBeNull();
    expect(
      conformMechanicsProgramAuthorityReceipt({ ...valid, actorSpec: {} })
    ).toBeNull();
    expect(
      conformMechanicsProgramAuthorityReceipt({ ...valid, owner: ENTITY })
    ).toBeNull();
    expect(
      conformMechanicsProgramAuthorityReceipt({ ...valid, definitionGuards: [] })
    ).toBeNull();
    expect(
      conformMechanicsProgramAuthorityReceipt({ ...valid, fingerprint: "forged" })
    ).toBeNull();
    expect(
      conformMechanicsProgramAuthorityReceipt({
        ...valid,
        staticBindings: Object.fromEntries(
          Array.from({ length: 257 }, (_, index) => [`binding-${index}`, index])
        ),
      })
    ).toBeNull();

    const accessor = structuredClone(valid);
    Object.defineProperty(accessor.anchors, "owner", {
      enumerable: true,
      get: () => ENTITY,
    });
    expect(conformMechanicsProgramAuthorityReceipt(accessor)).toBeNull();

    const cyclic = structuredClone(valid) as unknown as Record<string, unknown>;
    cyclic.source = cyclic;
    expect(conformMechanicsProgramAuthorityReceipt(cyclic)).toBeNull();
  });

  it("cannot depend on occurrences, world, high authority or runtime programs", () => {
    const forbidden = new Set([
      "@/lib/material-state",
      "@/lib/mechanic-occurrence-schema",
      "@/lib/mechanic-occurrences",
      "@/lib/mechanics-reference-schema",
      "@/lib/mechanics-authority",
      "@/lib/mechanics-authority-schema",
      "@/lib/mechanics-program",
      "@/lib/mechanics-program-schema",
      "@/lib/mechanics-world",
      "@/types/material-state",
      "@/types/mechanic-occurrence",
      "@/types/mechanics-reference",
      "@/types/mechanics-authority",
      "@/types/mechanics-program",
      "@/types/mechanics-world",
      "@/types/action-journal",
    ]);
    const files = [
      "src/lib/mechanics-program-receipt-schema.ts",
      "src/lib/mechanics-program-receipt.ts",
      "src/types/mechanics-program-receipt.ts",
    ];

    for (const file of files) {
      const source = readFileSync(resolve(__dirname, "../..", file), "utf8");
      const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map(
        (match) => match[1]
      );
      expect(
        imports.filter((specifier) => specifier && forbidden.has(specifier))
      ).toEqual([]);
    }
  });
});
