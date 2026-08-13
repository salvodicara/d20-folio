/// <reference types="node" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  conformMechanicsInvocationRef,
  mechanicsInstallationFactAddress,
  mechanicsInvocationRefKey,
} from "@/lib/mechanics-authority-ref";

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
    const files = [
      "src/lib/mechanics-command-schema.ts",
      "src/lib/mechanics-command-boundary.ts",
      "src/types/mechanics-execution.ts",
    ];

    for (const file of files) {
      const source = readFileSync(resolve(__dirname, "../..", file), "utf8");
      expect(source).toContain("mechanics-authority-ref");
      expect(source).not.toMatch(/from\s+["']@\/(?:lib|types)\/mechanics-authority["']/);
    }
  });
});
