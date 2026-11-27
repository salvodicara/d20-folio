/** The read-only survey for #1413 (write-chain keys before the rules deploy). Counts only. */
import { describe, expect, it } from "vitest";
import type { RawMap } from "../../scripts/lib/migration-kit";
import { DISCOVERY, surveyWriteChainKeys } from "../../scripts/survey-write-chain-keys";

const src = (path: string, data: Record<string, unknown>) => ({
  path,
  data: data as RawMap,
});

describe("survey — write-chain keys", () => {
  it("counts parents, and those holding a writeId or a baseWriteId key", () => {
    const survey = surveyWriteChainKeys([
      src("users/u1/characters/c1", { revision: 3, build: { name: "Secret" } }),
      src("users/u1/characters/c2", { revision: 1, writeId: "w-secret-1" }),
      src("users/u2/characters/c3", { revision: 2, baseWriteId: null }),
      src("users/u2/characters/c4", {
        revision: 4,
        writeId: "w-secret-2",
        baseWriteId: "w-secret-1",
      }),
      // Not a parent: never counted.
      src("users/u1/characters/c1/combat/state", { writeId: "w-play" }),
      src("campaigns/k1", { writeId: "w-camp" }),
    ]);
    expect(survey).toEqual({
      format: "d20-folio-write-chain-keys-survey-v1",
      parents: 4,
      withWriteId: 2,
      withBaseWriteId: 2,
    });
  });

  it("prints counts only: no id, path, name or key value leaks", () => {
    const survey = surveyWriteChainKeys([
      src("users/u-leak/characters/c-leak", {
        writeId: "w-leak",
        baseWriteId: "b-leak",
        build: { name: "Leak Name" },
      }),
    ]);
    expect(JSON.stringify(survey)).not.toMatch(/leak|Leak/);
  });

  it("discovers character parents only", () => {
    expect(DISCOVERY).toEqual([
      { collectionGroup: "characters", pattern: /^users\/([^/]+)\/characters\/([^/]+)$/ },
    ]);
  });
});
