/**
 * Dev-bypass admin fixture.
 *
 * Under `VITE_DEV_BYPASS_AUTH` the app never reads Firestore (`dev-bypass.ts`), so
 * the admin console's `listAllUsers()` would come back empty and the panel would be
 * impossible to exercise locally. This module provides a deterministic in-memory
 * user roster — the admin-layer analogue of `MOCK_CHARACTER` / `makeDevCampaign` —
 * covering every state the panel renders: YOU (the bypass identity `mock-uid`, which
 * can't block itself), plain active members, a blocked member, brand-new joiners,
 * and a never-active account. So block/unblock, the stats strip, the blocked-row
 * styling, the initial-fallback avatars, and the "new since last visit" delta all
 * have real data to drive.
 *
 * Pure (type-only import surface — it constructs plain objects + `Date`s) and
 * tree-shaken from production builds, where `DEV_BYPASS_AUTH` is statically `false`.
 */

/** One row in the admin console — mirrors `listAllUsers()`'s element shape. */
export interface DevAdminUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  status: "active" | "blocked";
  /** App role — only the data-driven `"admin"` matters here; everyone else is null. */
  role: "admin" | null;
  createdAt: Date | null;
  lastActiveAt: Date | null;
}

/** Slim campaign shape the admin console needs to derive per-user membership + the
 *  campaign total, without pulling treasury / notes / banners. */
export interface AdminCampaignSummary {
  id: string;
  members: string[];
  dmUid: string;
  status: "active" | "archived";
}

/**
 * The dev-bypass user roster. Fixed dates keep it deterministic (stable for any
 * visual/a11y capture). `photoURL` is null on every row so the avatars exercise the
 * deterministic tinted-initial fallback (#82) and nothing reaches out to the network
 * offline. Two members carry a recent `createdAt` (early June) so that, after setting
 * an older `admin_last_visit`, the "new since last visit" badge has something to show.
 */
export function makeDevUsers(): DevAdminUser[] {
  return [
    {
      // YOU — the injected bypass identity (auth.ts seeds `mock-uid`). The panel
      // tags this row "You" and hides its block button (can't block yourself).
      uid: "mock-uid",
      email: "mock@test.dev",
      displayName: "Dev Admin",
      photoURL: null,
      status: "active",
      role: "admin",
      createdAt: new Date("2026-01-08T09:00:00Z"),
      lastActiveAt: new Date("2026-06-05T08:30:00Z"),
    },
    {
      uid: "user-aria",
      email: "aria.holloway@example.com",
      displayName: "Aria Holloway",
      photoURL: null,
      status: "active",
      role: null,
      createdAt: new Date("2026-02-19T14:10:00Z"),
      lastActiveAt: new Date("2026-06-04T20:05:00Z"),
    },
    {
      // Blocked member — exercises the danger-tinted row + "Unblock" action.
      uid: "user-garrick",
      email: "garrick.stone@example.com",
      displayName: "Garrick Stone",
      photoURL: null,
      status: "blocked",
      role: null,
      createdAt: new Date("2026-03-01T11:45:00Z"),
      lastActiveAt: new Date("2026-05-20T22:40:00Z"),
    },
    {
      // Recent joiner (early June) — shows as "new" once admin_last_visit is older.
      uid: "user-lyra",
      email: "lyra.vance@example.com",
      displayName: "Lyra Vance",
      photoURL: null,
      status: "active",
      role: null,
      createdAt: new Date("2026-06-03T16:20:00Z"),
      lastActiveAt: new Date("2026-06-03T17:00:00Z"),
    },
    {
      // Never signed back in after creating the account (lastActive null → "Never").
      uid: "user-tomas",
      email: "tomas.reed@example.com",
      displayName: "Tomas Reed",
      photoURL: null,
      status: "active",
      role: null,
      createdAt: new Date("2026-04-12T08:15:00Z"),
      lastActiveAt: null,
    },
    {
      uid: "user-senna",
      email: "senna.okafor@example.com",
      displayName: "Senna Okafor",
      photoURL: null,
      status: "active",
      role: null,
      createdAt: new Date("2026-06-04T13:30:00Z"),
      lastActiveAt: new Date("2026-06-05T07:50:00Z"),
    },
  ];
}

/**
 * Per-user character tallies for the dev console (keyed by the {@link makeDevUsers}
 * uids). Lets the per-user metric strip + the derived "total characters" show
 * believable, varied data offline — a couple of prolific players, one empty roster.
 */
const DEV_CHARACTER_COUNTS: Record<string, number> = {
  "mock-uid": 3,
  "user-aria": 2,
  "user-garrick": 1,
  "user-lyra": 0,
  "user-tomas": 1,
  "user-senna": 2,
};

/** Resolve each requested uid to its fixture character count (unknown → 0). */
export function devCharacterCounts(uids: string[]): Record<string, number> {
  return Object.fromEntries(uids.map((uid) => [uid, DEV_CHARACTER_COUNTS[uid] ?? 0]));
}

/** One fixture roster row for the admin "view a user's characters" drill-down. */
export interface DevUserCharacter {
  id: string;
  name: string;
  portraitUrl: string | null;
}

/**
 * The dev-bypass per-user character roster — believable names so the admin
 * drill-down + read-only sheet entry are drivable offline (in the visual/a11y
 * suite). Every id is the shared `mock-1` fixture so the read-only sheet renders the
 * MOCK character (the SAME dev seam `useMemberCharacterSubscription` resolves). Count
 * matches {@link devCharacterCounts} so the metric strip and drill-down agree.
 */
const DEV_USER_CHARACTERS: Record<string, DevUserCharacter[]> = {
  "mock-uid": [
    { id: "mock-1", name: "Talon Brightwood", portraitUrl: null },
    { id: "mock-1", name: "Mirella Dusk", portraitUrl: null },
    { id: "mock-1", name: "Aldric Vane", portraitUrl: null },
  ],
  "user-aria": [
    { id: "mock-1", name: "Aria's Cleric", portraitUrl: null },
    { id: "mock-1", name: "Aria's Rogue", portraitUrl: null },
  ],
  "user-garrick": [{ id: "mock-1", name: "Garrick the Bold", portraitUrl: null }],
  "user-tomas": [{ id: "mock-1", name: "Tomas Reed", portraitUrl: null }],
  "user-senna": [
    { id: "mock-1", name: "Senna's Wizard", portraitUrl: null },
    { id: "mock-1", name: "Senna's Bard", portraitUrl: null },
  ],
};

/** Resolve a uid to its fixture roster (unknown / empty → []). */
export function devUserCharacters(uid: string): DevUserCharacter[] {
  return DEV_USER_CHARACTERS[uid] ?? [];
}

/** One fixture bug-inbox row (structurally matches firestore's `AdminBugReport`). */
export interface DevBugReport {
  id: string;
  type: string;
  title: string;
  status: "new" | "opened" | "error";
  severity: string;
  screen: string;
  issueUrl: string | null;
  issueNumber: number | null;
  createdAt: Date | null;
}

/**
 * Dev-bypass bug inbox — one STRANDED error report (GitHub creation failed, the
 * case the inbox exists to surface), one opened (links its issue), one new. Fixed
 * dates keep the visual/a11y capture deterministic.
 */
export function devBugReports(): DevBugReport[] {
  return [
    {
      id: "rep-error",
      type: "bug",
      title: "Spell slot tracker desyncs after a long rest",
      status: "error",
      severity: "high",
      screen: "character",
      issueUrl: null,
      issueNumber: null,
      createdAt: new Date("2026-06-06T10:15:00Z"),
    },
    {
      id: "rep-opened",
      type: "feature",
      title: "Add a dice-formula tooltip on attack rolls",
      status: "opened",
      severity: "low",
      screen: "character",
      issueUrl: "https://github.com/salvodicara/d20-folio/issues/42",
      issueNumber: 42,
      createdAt: new Date("2026-06-05T18:40:00Z"),
    },
    {
      id: "rep-new",
      type: "visual",
      title: "Light-theme contrast on the campaign banner caption",
      status: "new",
      severity: "medium",
      screen: "campaigns",
      issueUrl: null,
      issueNumber: null,
      createdAt: new Date("2026-06-07T08:05:00Z"),
    },
  ];
}

/**
 * Dev-bypass campaign summaries — two live tables and one archived, with members
 * drawn from the dev roster so per-user "Campaigns" / "DM" counts have real shape
 * (Dev Admin DMs one, Aria DMs one and plays another, Tomas plays none).
 */
export function devCampaignSummaries(): AdminCampaignSummary[] {
  return [
    {
      id: "camp-mistlands",
      dmUid: "mock-uid",
      members: ["mock-uid", "user-aria", "user-lyra"],
      status: "active",
    },
    {
      id: "camp-emberfall",
      dmUid: "user-aria",
      members: ["user-aria", "user-senna", "user-garrick"],
      status: "active",
    },
    {
      id: "camp-old-reach",
      dmUid: "user-senna",
      members: ["user-senna"],
      status: "archived",
    },
  ];
}
