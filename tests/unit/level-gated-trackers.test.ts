/**
 * Regression: features whose base `total: "0"` plus a `levels[]` upgrade
 * gate the tracker behind a character-level threshold are now properly
 * suppressed at lower levels.
 *
 * The only shipped `total: "0"` gate (a pack species' Celestial Revelation) is PACK
 * content, so the positive/negative gating pair lives in
 * `content-pack/tests/unit/level-gated-trackers.pack.test.ts`. The public
 * regression kept here:
 *   - Tiefling Fiendish Legacy "free casts" pool was REMOVED — the 2024 legacy
 *     is modeled as PER-SPELL `free-cast-spell` grants now, each its own
 *     1/Long-Rest cast, not one shared ramping tracker. See
 *     `tests/unit/effective-spells.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { resolveTrackers } from "@/lib/smart-tracker";
import { makeCharacterDoc } from "./_helpers";

describe("smart-tracker — level-gated trackers (total: '0' baseline)", () => {
  it("Tiefling Fiendish Legacy no longer emits a shared pool tracker (now per-spell free casts)", () => {
    const char = makeCharacterDoc({ level: 5 });
    char.character.features = [{ srdId: "tiefling-fiendish-legacy" }];
    const trackers = resolveTrackers(char);
    expect(trackers.find((t) => t.id === "tiefling-fiendish-legacy")).toBeUndefined();
  });
});
