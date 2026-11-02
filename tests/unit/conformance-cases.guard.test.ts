/**
 * Every corpus case has exactly one conformance test: public, or (for non-SRD
 * subjects listed in PACK_CASES) in the content pack. A case can't be dropped,
 * duplicated or renamed away from the corpus without this going red.
 */
import { describe, expect, it } from "vitest";
import { contentPackEnabled } from "../../scripts/content-pack-mode";
import {
  PACK_DIR,
  PUBLIC_DIR,
  caseKey,
  corpusCases,
  declaredCases,
} from "./conformance/cases";
import { PACK_CASES } from "./conformance/pack-cases";

const corpus = new Set(corpusCases().map(caseKey));
const publicCases = declaredCases(PUBLIC_DIR);
const packCases = declaredCases(PACK_DIR);

function duplicates(keys: string[]): string[] {
  return keys.filter((k, i) => keys.indexOf(k) !== i);
}

describe("rules conformance covers the corpus", () => {
  it("reads the corpus", () => {
    expect(corpus.size).toBeGreaterThan(280);
  });

  it("declares only corpus cases, each once", () => {
    const keys = [...publicCases, ...packCases].map(caseKey);
    expect(keys.filter((k) => !corpus.has(k))).toEqual([]);
    expect(duplicates(keys)).toEqual([]);
    expect(PACK_CASES.filter((k) => !corpus.has(k))).toEqual([]);
  });

  it("keeps pack-listed cases out of the public files", () => {
    const pack = new Set(PACK_CASES);
    expect(publicCases.map(caseKey).filter((k) => pack.has(k))).toEqual([]);
  });

  // Expected to fail until the suite is complete; flips red (forcing the flip to
  // a plain `it`) the day every corpus case has its test.
  it.runIf(contentPackEnabled()).fails("declares every corpus case", () => {
    const declared = new Set([...publicCases, ...packCases].map(caseKey));
    expect([...corpus].filter((k) => !declared.has(k))).toEqual([]);
  });

  it.runIf(contentPackEnabled())(
    "the pack declares exactly the pack-listed cases",
    () => {
      expect(packCases.map(caseKey).sort()).toEqual([...PACK_CASES].sort());
    }
  );
});
