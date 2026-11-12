/**
 * The class-feature coverage rule (`__helpers__/class-feature-coverage.ts`, shared
 * with the pack's twin) treats some features as carried by a sibling; each one it
 * names must exist and be public. The counts themselves are rendered by
 * `pnpm rules:coverage`, not pinned in a committed doc.
 */
import { describe, expect, it } from "vitest";
import { classFeatureIndex } from "@/data/classes";
import { SRD_CARRIED } from "./__helpers__/class-feature-coverage";

describe("the class-feature coverage rule", () => {
  it("every carried feature exists and is public", () => {
    for (const id of Object.keys(SRD_CARRIED)) {
      expect(classFeatureIndex.get(id)?.source, id).toBe("SRD");
    }
  });
});
