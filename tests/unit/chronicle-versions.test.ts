/**
 * chronicle-versions (D27) — the capped restore-history helpers. Guards the
 * Firebase-size ceiling (count + bytes), the no-op snapshot skip, and the
 * "you're wiping a lot of the story" reduction signal.
 */

import { describe, expect, it } from "vitest";
import type { ChronicleVersion } from "@/types/campaign";
import {
  capVersions,
  pushVersion,
  isLargeReduction,
  MAX_VERSIONS,
} from "@/features/campaigns/chronicle-versions";

function v(text: string, i = 0): ChronicleVersion {
  return {
    timestamp: new Date(2026, 0, 1 + i),
    editedBy: `u${i}`,
    editedByName: `Editor ${i}`,
    textSnapshot: text,
  };
}

describe("capVersions", () => {
  it("keeps at most MAX_VERSIONS, dropping the oldest (tail)", () => {
    const many = Array.from({ length: MAX_VERSIONS + 5 }, (_, i) => v(`r${i}`, i));
    const kept = capVersions(many);
    expect(kept).toHaveLength(MAX_VERSIONS);
    expect(kept[0]?.textSnapshot).toBe("r0"); // newest first preserved
  });

  it("drops oldest until under the byte budget but never below one", () => {
    const big = "x".repeat(1000);
    const list = Array.from({ length: 5 }, (_, i) => v(big, i));
    const kept = capVersions(list, 10, 2500); // budget fits ~2 snapshots
    expect(kept.length).toBeLessThan(5);
    expect(kept.length).toBeGreaterThanOrEqual(1);
  });

  it("keeps a single huge snapshot even past the byte budget", () => {
    const kept = capVersions([v("y".repeat(5000))], 10, 100);
    expect(kept).toHaveLength(1);
  });
});

describe("pushVersion", () => {
  it("prepends the new snapshot (newest first)", () => {
    const out = pushVersion([v("old", 1)], v("older-now-newest", 2));
    expect(out[0]?.textSnapshot).toBe("older-now-newest");
  });

  it("skips an empty snapshot (nothing to restore to)", () => {
    expect(pushVersion([], v(""))).toEqual([]);
    expect(pushVersion([], v("   "))).toEqual([]);
  });

  it("skips a snapshot identical to the current newest (no duplicate)", () => {
    const existing = [v("same", 1)];
    expect(pushVersion(existing, v("same", 2))).toEqual(existing);
  });
});

describe("isLargeReduction", () => {
  it("is true when clearing a non-empty chronicle", () => {
    expect(isLargeReduction("the whole story is here", "")).toBe(true);
  });

  it("is true when losing more than ~40% of the characters", () => {
    expect(isLargeReduction("a".repeat(100), "a".repeat(50))).toBe(true);
  });

  it("is false for a small trim or an addition", () => {
    expect(isLargeReduction("a".repeat(100), "a".repeat(95))).toBe(false);
    expect(isLargeReduction("short", "short and then much longer")).toBe(false);
  });

  it("is false when there was nothing there to begin with", () => {
    expect(isLargeReduction("", "")).toBe(false);
  });
});
