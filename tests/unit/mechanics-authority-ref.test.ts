/// <reference types="node" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  conformMechanicsInvocationRef,
  mechanicsInstallationFactAddress,
  mechanicsInvocationRefKey,
} from "@/lib/mechanics-authority-ref";
import {
  conformEntityRef,
  conformInventoryGenerationRef,
  conformOccurrenceGenerationRef,
  entityRefKey,
  inventoryGenerationRefKey,
  occurrenceGenerationRefKey,
} from "@/lib/mechanics-reference-schema";

const MATERIAL = {
  characterId: "character-1",
  kind: "character-play",
  uid: "user-1",
} as const;
const ENTITY = { entityId: "self", material: MATERIAL } as const;
const CAPABILITY = {
  capabilityId: "primary",
  definition: {
    catalogueKind: "spell",
    entityId: "spell.fireball",
    kind: "catalogue",
    mechanicsRevision: `sha256:${"0".repeat(64)}`,
  },
  kind: "program",
} as const;
const INSTALLATION = {
  capability: CAPABILITY,
  generation: 3,
  installationId: "installation-1",
  owner: ENTITY,
} as const;

describe("low-dependency mechanics authority references", () => {
  it("uses the character material as self identity and ordinals for every other entity", () => {
    const first = { entityId: "familiar", material: MATERIAL, ordinal: 1 } as const;
    const replacement = { ...first, ordinal: 2 } as const;

    expect(conformEntityRef(ENTITY)).toEqual(ENTITY);
    expect(conformEntityRef(first)).toEqual(first);
    expect(entityRefKey(first)).not.toBe(entityRefKey(replacement));
    expect(conformEntityRef({ ...ENTITY, ordinal: 1 })).toBeNull();
    expect(
      conformEntityRef({
        entityId: "self",
        material: { campaignId: "campaign-1", kind: "shared-combat" },
      })
    ).toBeNull();
    expect(conformEntityRef({ entityId: "familiar", material: MATERIAL })).toBeNull();
    expect(conformEntityRef({ ...first, ordinal: 0 })).toBeNull();
    expect(conformEntityRef({ ...first, ordinal: -0 })).toBeNull();
  });

  it("separates a reusable occurrence address from its exact active generation", () => {
    const address = { material: MATERIAL, occurrenceId: "program-1" } as const;
    const first = { occurrence: address, ordinal: 1 } as const;
    const replacement = { occurrence: address, ordinal: 2 } as const;

    expect(conformOccurrenceGenerationRef(first)).toEqual(first);
    expect(occurrenceGenerationRefKey(first)).not.toBe(
      occurrenceGenerationRefKey(replacement)
    );
    expect(conformOccurrenceGenerationRef(address)).toBeNull();
    expect(
      conformOccurrenceGenerationRef({ occurrence: address, ordinal: 0 })
    ).toBeNull();
  });

  it("keys the exact inventory generation so a reused instance id cannot ABA", () => {
    const first = { instanceId: "wand", instanceOrdinal: 1, owner: MATERIAL } as const;
    const replacement = { ...first, instanceOrdinal: 2 } as const;
    const reordered = {
      owner: structuredClone(MATERIAL),
      instanceOrdinal: 1,
      instanceId: "wand",
    } as const;

    const conformed = conformInventoryGenerationRef(first);
    if (!conformed) throw new Error("fixture must conform");

    expect(conformed).toEqual(first);
    expect(conformed).not.toBe(first);
    expect(Object.isFrozen(conformed)).toBe(true);
    expect(Object.isFrozen(conformed.owner)).toBe(true);
    expect(inventoryGenerationRefKey(first)).toBe(inventoryGenerationRefKey(reordered));
    expect(inventoryGenerationRefKey(first)).not.toBe(
      inventoryGenerationRefKey(replacement)
    );
  });

  it("rejects inexact and hostile inventory generation references", () => {
    const valid = { instanceId: "wand", instanceOrdinal: 1, owner: MATERIAL } as const;
    const inherited = Object.assign(
      Object.create({ inherited: true }) as Record<string, unknown>,
      valid
    );
    const accessor = { ...valid } as Record<string, unknown>;
    Object.defineProperty(accessor, "instanceOrdinal", {
      enumerable: true,
      get: () => {
        throw new Error("accessor must not run");
      },
    });
    const unsafeKey = { ...valid };
    Object.defineProperty(unsafeKey, "__proto__", { enumerable: true, value: {} });

    for (const rejected of [
      { ...valid, extra: true },
      { instanceId: "wand", owner: MATERIAL },
      { ...valid, instanceId: "self" },
      { ...valid, instanceId: "__proto__" },
      { ...valid, instanceOrdinal: 0 },
      { ...valid, instanceOrdinal: -0 },
      { ...valid, instanceOrdinal: 1.5 },
      {
        ...valid,
        owner: { campaignId: "campaign-1", kind: "shared-combat" },
      },
      inherited,
      accessor,
      unsafeKey,
    ]) {
      expect(conformInventoryGenerationRef(rejected)).toBeNull();
    }
    expect(() => inventoryGenerationRefKey({ ...valid, instanceId: "self" })).toThrow(
      TypeError
    );
  });

  it("conforms exact immutable invocation identity and its canonical key", () => {
    const input = {
      installation: structuredClone(INSTALLATION),
      kind: "installed-capability",
    } as const;
    const conformed = conformMechanicsInvocationRef(input);
    if (!conformed) throw new Error("fixture must conform");

    expect(conformed).toEqual(input);
    expect(conformed).not.toBe(input);
    expect(Object.isFrozen(conformed)).toBe(true);
    expect(Object.isFrozen(conformed.installation)).toBe(true);
    expect(mechanicsInvocationRefKey(conformed)).toBe(
      mechanicsInvocationRefKey({
        kind: "installed-capability",
        installation: INSTALLATION,
      })
    );
    expect(conformMechanicsInvocationRef({ ...input, program: {} })).toBeNull();
  });

  it("rejects a stale logical program-root address without its generation", () => {
    const occurrence = {
      occurrence: { material: MATERIAL, occurrenceId: "program-1" },
      ordinal: 9,
    } as const;
    expect(conformMechanicsInvocationRef({ kind: "program-root", occurrence })).toEqual({
      kind: "program-root",
      occurrence,
    });
    expect(
      conformMechanicsInvocationRef({
        kind: "program-root",
        occurrence: occurrence.occurrence,
      })
    ).toBeNull();
  });

  it("owns installation semantic addresses without importing installed closures", () => {
    expect(mechanicsInstallationFactAddress(INSTALLATION)).toEqual([
      "mechanics-installation",
      "character-play",
      "user-1",
      "character-1",
      "entity",
      "self",
      "installation-1",
    ]);
  });

  it("cannot depend on program, occurrence, world, material state or high authority", () => {
    const forbidden = new Set([
      "@/lib/material-state",
      "@/lib/mechanic-occurrence-schema",
      "@/lib/mechanic-occurrences",
      "@/lib/mechanics-authority",
      "@/lib/mechanics-authority-schema",
      "@/lib/mechanics-program",
      "@/lib/mechanics-program-schema",
      "@/lib/mechanics-world",
      "@/types/material-state",
      "@/types/mechanic-occurrence",
      "@/types/mechanics-authority",
      "@/types/mechanics-program",
      "@/types/mechanics-world",
    ]);
    const files = [
      "src/lib/mechanics-authority-ref-schema.ts",
      "src/lib/mechanics-authority-ref.ts",
      "src/types/mechanics-authority-ref.ts",
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

  it("keeps command and subscriber identity boundaries off high authority", () => {
    const commandFiles = [
      "src/lib/mechanics-command-schema.ts",
      "src/lib/mechanics-command-boundary.ts",
    ];
    const files = [...commandFiles, "src/types/mechanics-execution.ts"];

    for (const file of files) {
      const source = readFileSync(resolve(__dirname, "../..", file), "utf8");
      if (commandFiles.includes(file)) {
        expect(source).toContain("mechanics-authority-ref");
      }
      expect(source).not.toMatch(/from\s+["']@\/(?:lib|types)\/mechanics-authority["']/);
    }
  });
});
