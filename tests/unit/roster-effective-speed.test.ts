/**
 * The roster and party cards show the Speed the sheet shows (like the stamped
 * effective AC), not the stored base: a species or feature bonus counts.
 */
import { describe, expect, it } from "vitest";
import { buildCharacterCache } from "@/lib/character-cache-build";
import { makeCharacterDoc } from "./_helpers";

describe("the roster cache's speed", () => {
  it("is the effective walking Speed: a Barbarian 5's Fast Movement counts", () => {
    const doc = makeCharacterDoc({
      classes: [{ classId: "barbarian", level: 5 }],
      features: [{ srdId: "barbarian-fast-movement" }],
      speed: "30",
    });
    expect(buildCharacterCache(doc.character, doc.session).speed).toBe("40");
  });

  it("a hand-set Speed wins, as on the sheet", () => {
    const doc = makeCharacterDoc({ speed: "30", speedOverride: 25 });
    expect(buildCharacterCache(doc.character, doc.session).speed).toBe("25");
  });
});
