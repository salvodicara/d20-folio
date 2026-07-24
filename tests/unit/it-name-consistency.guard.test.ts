/// <reference types="node" />
/**
 * IT-name-consistency guard (public / SRD-only). Fails the build on Italian-name drift:
 * distinct-entity collisions, untranslated regressions, retired names, and retired cross-reference
 * lexemes reappearing in prose. The composed cross-repo check (SRD + content-pack) lives in
 * content-pack/tests/unit/it-name-consistency.guard.pack.test.ts (pack mode only).
 * Authority: docs/IT_NAME_REGISTRY.md · docs/GOLDEN_RULES.md (D2).
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
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

/**
 * Base-action cross-references named by a retired verb form. The 2024 IT SRD 5.2.1 renamed the
 * base actions to nouns ("azione Utilizzo", "azione Studio"); prose must never revive the retired
 * verb-form apposition ("azione Utilizzare", "azione Esaminare"). Exact-phrase (the "azione " prefix
 * scopes it to a genuine action reference, never an ordinary Italian verb elsewhere in the prose).
 */
const RETIRED_ACTION_PHRASES = ["azione Utilizzare", "azione Esaminare"] as const;
const IT_SRD_DIR = resolve(PUBLIC_SRD_I18N, "it", "srd");

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
  it("never cross-references a base action by a retired verb form (RA-W6 prose sweep)", () => {
    const offenders: string[] = [];
    for (const file of readdirSync(IT_SRD_DIR).filter((f) => f.endsWith(".json"))) {
      const text = readFileSync(resolve(IT_SRD_DIR, file), "utf8");
      for (const phrase of RETIRED_ACTION_PHRASES) {
        if (text.includes(phrase)) offenders.push(`${file} revives "${phrase}"`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
