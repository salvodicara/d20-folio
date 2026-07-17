import { describe, it, expect } from "vitest";
import { syncOriginFeats } from "@/lib/character-build";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CharacterData } from "@/types/character";

function base(): CharacterData {
  return structuredClone(MOCK_CHARACTER.character);
}
const hasFeat = (c: CharacterData, id: string) =>
  c.features.some((f) => "srdId" in f && f.srdId === id);

describe("syncOriginFeats — features[] is a projection of the build choices", () => {
  it("replaces a stale Origin feat when the choice changes (no lingering entry)", () => {
    // "skilled"/"savage-attacker" — Origin feats NOT granted by the mock's
    // background (Criminal → Alert), so the human-versatile slot owns them.
    const c = base();
    c.humanOriginFeat = "skilled";
    const first = syncOriginFeats(c);
    expect(hasFeat(first, "skilled")).toBe(true);

    const second = syncOriginFeats({ ...first, humanOriginFeat: "savage-attacker" });
    expect(hasFeat(second, "skilled")).toBe(false); // old origin feat dropped
    expect(hasFeat(second, "savage-attacker")).toBe(true); // new one added
  });

  it("clearing the choice removes the Origin feat", () => {
    const withFeat = syncOriginFeats({ ...base(), humanOriginFeat: "skilled" });
    const cleared = syncOriginFeats({ ...withFeat, humanOriginFeat: "" });
    expect(hasFeat(cleared, "skilled")).toBe(false);
  });

  it("is idempotent", () => {
    const once = syncOriginFeats({ ...base(), humanOriginFeat: "skilled" });
    const twice = syncOriginFeats(once);
    expect(JSON.stringify(twice.features)).toBe(JSON.stringify(once.features));
  });

  it("preserves custom + non-Origin (class/ASI) features", () => {
    const c = base();
    const customBefore = c.features.filter((f) => "custom" in f);
    const synced = syncOriginFeats(c);
    for (const f of customBefore) expect(synced.features).toContainEqual(f);
    // The Bard class feature refs (non-origin) survive.
    expect(hasFeat(synced, "bard-bardic-inspiration")).toBe(true);
  });
});
