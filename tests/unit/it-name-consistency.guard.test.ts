/// <reference types="node" />
/**
 * IT-name-consistency guard (public / SRD-only). Fails the build on Italian-name drift:
 * distinct-entity collisions, untranslated regressions, retired names, and retired cross-reference
 * lexemes reappearing in prose. The composed cross-repo check (SRD + content-pack) lives in
 * content-pack/tests/unit/it-name-consistency.guard.pack.test.ts (pack mode only).
 * Authority: docs/IT_NAME_REGISTRY.md · docs/GOLDEN_RULES.md (D2).
 */
import { describe, it, expect } from "vitest";
import {
  loadEntities,
  findCollisions,
  findUntranslated,
  findRetiredNames,
  findRetiredInProse,
  PUBLIC_SRD_I18N,
} from "./__helpers__/it-name-registry";

const ents = loadEntities([PUBLIC_SRD_I18N]);

describe("IT name consistency (public SRD)", () => {
  it("loads the SRD entity set", () => {
    expect(ents.length).toBeGreaterThan(300);
  });
  it("has no distinct-entity name collisions", () => {
    expect(findCollisions(ents)).toEqual([]);
  });
  it("has no untranslated names outside the proper-noun allowlist", () => {
    expect(findUntranslated(ents)).toEqual([]);
  });
  it("never revives a retired name as a canonical name", () => {
    expect(findRetiredNames(ents)).toEqual([]);
  });
  it("never revives a retired cross-reference lexeme in prose", () => {
    expect(findRetiredInProse(ents)).toEqual([]);
  });
});
