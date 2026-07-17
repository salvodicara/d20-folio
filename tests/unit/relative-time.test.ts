/**
 * Roster relative-time helper (H2) — deterministic via the injected `now`.
 */
import { describe, it, expect } from "vitest";
import { formatRelativeTime, isRecent } from "@/features/roster/relative-time";

const NOW = new Date("2026-06-02T12:00:00Z").getTime();

describe("formatRelativeTime", () => {
  it("formats recent past in English (numeric: auto)", () => {
    const twoDaysAgo = new Date("2026-05-31T12:00:00Z");
    expect(formatRelativeTime(twoDaysAgo, "en", NOW)).toBe("2 days ago");
  });

  it("uses 'yesterday' / 'today' phrasing (numeric: auto)", () => {
    const yesterday = new Date("2026-06-01T12:00:00Z");
    expect(formatRelativeTime(yesterday, "en", NOW)).toBe("yesterday");
  });

  it("localizes to Italian", () => {
    // 3 days avoids IT's special "l’altro ieri" (day-before-yesterday) phrasing.
    const threeDaysAgo = new Date("2026-05-30T12:00:00Z");
    expect(formatRelativeTime(threeDaysAgo, "it", NOW)).toMatch(/giorni fa/);
  });

  it("falls back to years for distant dates", () => {
    const twoYearsAgo = new Date("2024-06-02T12:00:00Z");
    expect(formatRelativeTime(twoYearsAgo, "en", NOW)).toBe("2 years ago");
  });
});

describe("isRecent", () => {
  it("is true within the last day", () => {
    expect(isRecent(new Date(NOW - 60_000), NOW)).toBe(true);
  });
  it("is false beyond a day", () => {
    expect(isRecent(new Date(NOW - 48 * 3600_000), NOW)).toBe(false);
  });
  it("is false for future timestamps", () => {
    expect(isRecent(new Date(NOW + 60_000), NOW)).toBe(false);
  });
});
