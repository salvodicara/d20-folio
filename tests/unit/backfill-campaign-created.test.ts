/**
 * backfill-campaign-created — the one-off createdAt backfill's PURE mapping + gate.
 * Locks the owner-specified name→date mapping (incl. the exact Firestore Timestamp for
 * 2026-02-02) and the idempotency gate that treats the BUG's broken
 * `{ _methodName: "serverTimestamp" }` map as "missing" (so a broken createdAt is
 * repaired, and a genuine Timestamp is skipped).
 *
 * RULE 10: this test is deleted together with `scripts/backfill-campaign-created.ts`
 * once the backfill has run on live data + been verified idempotent.
 */
import { describe, it, expect } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import {
  TARGET_DATES,
  plannedDateForName,
  hasValidCreatedAt,
  isTimestampLike,
} from "../../scripts/backfill-campaign-created";

describe("backfill-campaign-created — plannedDateForName (name → start date)", () => {
  it("maps the two owner-specified campaigns to their start dates", () => {
    expect(plannedDateForName("La Compagnia del Carretto (Siciliano)")).toEqual(
      new Date("2026-02-02T12:00:00.000Z")
    );
    expect(plannedDateForName("test")).toEqual(new Date("2026-06-30T12:00:00.000Z"));
  });

  it("returns null for any campaign that is NOT a named target (never guesses a date)", () => {
    expect(plannedDateForName("The Starless Keep")).toBeNull();
    expect(plannedDateForName("")).toBeNull();
    // Case / trimming are NOT normalized — the match is an EXACT name (documented).
    expect(plannedDateForName("Test")).toBeNull();
    expect(plannedDateForName(" test ")).toBeNull();
  });

  it("2026-02-02 → the correct Firestore Timestamp (calendar date stable, TZ-safe noon UTC)", () => {
    const date = plannedDateForName("La Compagnia del Carretto (Siciliano)");
    expect(date).not.toBeNull();
    const ts = Timestamp.fromDate(date as Date);
    // Round-trips to the exact instant, and the UTC calendar date is Feb 2 2026.
    expect(ts.toDate().toISOString()).toBe("2026-02-02T12:00:00.000Z");
    expect(ts.seconds).toBe(Math.floor(Date.parse("2026-02-02T12:00:00.000Z") / 1000));
    // The map is the single source of the ISO strings the dates derive from.
    expect(TARGET_DATES["La Compagnia del Carretto (Siciliano)"]).toBe(
      "2026-02-02T12:00:00.000Z"
    );
  });
});

describe("backfill-campaign-created — hasValidCreatedAt (idempotency gate)", () => {
  it("TRUE for a genuine Firestore Timestamp → SKIP (idempotent re-run)", () => {
    expect(hasValidCreatedAt({ createdAt: Timestamp.fromDate(new Date()) })).toBe(true);
    // Any faithful toDate-carrying double also passes (matches the app read boundary).
    expect(hasValidCreatedAt({ createdAt: { toDate: () => new Date() } })).toBe(true);
  });

  it("FALSE for the BUG's broken sentinel map → treated as MISSING (gets repaired)", () => {
    // The exact shape stripUndefined wrote when it flattened serverTimestamp().
    expect(hasValidCreatedAt({ createdAt: { _methodName: "serverTimestamp" } })).toBe(
      false
    );
  });

  it("FALSE for an absent / null / non-Timestamp createdAt", () => {
    expect(hasValidCreatedAt({})).toBe(false);
    expect(hasValidCreatedAt({ createdAt: null })).toBe(false);
    expect(hasValidCreatedAt({ createdAt: "2026-02-02" })).toBe(false);
    expect(hasValidCreatedAt({ createdAt: 1_700_000_000 })).toBe(false);
  });
});

describe("backfill-campaign-created — isTimestampLike (duck-type)", () => {
  it("matches only objects carrying a toDate() method", () => {
    expect(isTimestampLike({ toDate: () => new Date() })).toBe(true);
    expect(isTimestampLike(Timestamp.now())).toBe(true);
    expect(isTimestampLike({ _methodName: "serverTimestamp" })).toBe(false);
    expect(isTimestampLike(null)).toBe(false);
    expect(isTimestampLike(42)).toBe(false);
    expect(isTimestampLike("x")).toBe(false);
  });
});
