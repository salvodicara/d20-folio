/**
 * The roster shows the character's background beside its species («Umana ·
 * Accolita»). The id comes from the stored build (every saved doc has it), never
 * the cache: the public share sheet's cache is a closed schema.
 */
import { describe, expect, it } from "vitest";
import {
  buildCharacterCache,
  cacheToRosterDoc,
  rosterProjectionFromDoc,
} from "@/lib/character-cache";
import { makeCharacterDoc } from "./_helpers";

const meta = { createdAt: 0, updatedAt: 0, status: "active" } as never;

describe("roster background", () => {
  it("is carried by the projection and stays out of the cache", () => {
    const doc = makeCharacterDoc({ background: "acolyte" });
    expect(rosterProjectionFromDoc(doc).character.background).toBe("acolyte");
    expect(buildCharacterCache(doc.character, doc.session)).not.toHaveProperty(
      "backgroundId"
    );
  });

  it("is read from the stored build", () => {
    const projected = cacheToRosterDoc(
      "c1",
      { cache: { name: "Mara", raceId: "human" }, build: { background: "sage" } },
      meta
    );
    expect(projected?.character.background).toBe("sage");
  });

  it("is absent when neither says", () => {
    const projected = cacheToRosterDoc("c1", { cache: { name: "Mara" } }, meta);
    expect(projected?.character).not.toHaveProperty("background");
  });
});
