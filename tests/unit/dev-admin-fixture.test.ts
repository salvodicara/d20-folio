/**
 * dev-admin-fixture — the in-memory user roster that makes the admin console
 * exercisable under `VITE_DEV_BYPASS_AUTH` (Firestore is never read in bypass).
 * These tests pin the contract the panel relies on: a "You" row matching the
 * injected bypass identity, a blocked row, and enough state variety to drive every
 * branch of the console (stats strip, block/unblock, never-active, new-joiner).
 */

import { describe, it, expect } from "vitest";
import {
  makeDevUsers,
  devCharacterCounts,
  devCampaignSummaries,
} from "@/lib/dev-admin-fixture";

describe("makeDevUsers", () => {
  it("includes the bypass identity (mock-uid) as an active row so the panel can mark 'You'", () => {
    const you = makeDevUsers().find((u) => u.uid === "mock-uid");
    expect(you).toBeDefined();
    expect(you?.status).toBe("active");
    // auth.ts seeds the bypass user's email as mock@test.dev — they must agree so
    // the panel's identity match is exact.
    expect(you?.email).toBe("mock@test.dev");
  });

  it("includes at least one blocked user so the unblock action + danger row are testable", () => {
    expect(makeDevUsers().some((u) => u.status === "blocked")).toBe(true);
  });

  it("covers the never-active state (lastActiveAt null) for the 'Never' relative-time branch", () => {
    expect(makeDevUsers().some((u) => u.lastActiveAt === null)).toBe(true);
  });

  it("has unique uids and a non-empty email + displayName on every row", () => {
    const users = makeDevUsers();
    const uids = new Set(users.map((u) => u.uid));
    expect(uids.size).toBe(users.length);
    for (const u of users) {
      expect(u.email.length).toBeGreaterThan(0);
      expect(u.displayName.length).toBeGreaterThan(0);
      expect(u.createdAt).toBeInstanceOf(Date);
    }
  });

  it("marks exactly the bypass identity as the data-driven admin (role)", () => {
    const users = makeDevUsers();
    expect(users.filter((u) => u.role === "admin").map((u) => u.uid)).toEqual([
      "mock-uid",
    ]);
  });

  it("is deterministic — two calls produce equal data (stable for captures)", () => {
    expect(makeDevUsers()).toEqual(makeDevUsers());
  });

  it("returns fresh instances each call (a mutation can't leak between callers)", () => {
    const a = makeDevUsers();
    const b = makeDevUsers();
    expect(a).not.toBe(b);
    const [a0] = a;
    const [b0] = b;
    expect(a0).toBeDefined();
    expect(b0).toBeDefined();
    if (!a0 || !b0) return;
    a0.status = "blocked";
    expect(b0.status).toBe("active");
  });
});

describe("devCharacterCounts", () => {
  it("resolves a count for every requested uid (unknown → 0)", () => {
    const uids = makeDevUsers().map((u) => u.uid);
    const counts = devCharacterCounts([...uids, "ghost-uid"]);
    for (const uid of uids) expect(counts[uid]).toBeGreaterThanOrEqual(0);
    expect(counts["ghost-uid"]).toBe(0);
  });

  it("gives the panel varied data — at least one prolific roster and one empty", () => {
    const counts = devCharacterCounts(makeDevUsers().map((u) => u.uid));
    const values = Object.values(counts);
    expect(Math.max(...values)).toBeGreaterThan(0);
    expect(values).toContain(0);
  });
});

describe("devCampaignSummaries", () => {
  it("only references dev-roster uids, so per-user tallies have real shape", () => {
    const roster = new Set(makeDevUsers().map((u) => u.uid));
    for (const c of devCampaignSummaries()) {
      expect(roster.has(c.dmUid)).toBe(true);
      for (const m of c.members) expect(roster.has(m)).toBe(true);
      // the DM is always a member of their own campaign
      expect(c.members).toContain(c.dmUid);
    }
  });

  it("includes both an active and an archived campaign", () => {
    const statuses = new Set(devCampaignSummaries().map((c) => c.status));
    expect(statuses).toContain("active");
    expect(statuses).toContain("archived");
  });
});
