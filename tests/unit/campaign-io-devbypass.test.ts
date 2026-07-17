/**
 * campaign-io under dev bypass + the dev fixture (Phase 5 · Part 2b).
 *
 * Dev bypass has no real auth, so a real Firestore write would be denied. The io
 * boundary must therefore short-circuit create/join (return a code, persist
 * nothing) so the create/join → hub flow works locally + in e2e, with the hub
 * seeding `makeDevCampaign`. Mirrors the 2a `campaign-io.test.ts` mocking.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/dev-bypass", () => ({ DEV_BYPASS_AUTH: true }));

const { setDocMock, updateDocMock, getDocsMock } = vi.hoisted(() => ({
  setDocMock: vi.fn(() => Promise.resolve()),
  updateDocMock: vi.fn(() => Promise.resolve()),
  getDocsMock: vi.fn(() => Promise.resolve({ docs: [] })),
}));

vi.mock("@/lib/firebase", () => ({ db: { __db: true } }));
vi.mock("firebase/firestore", () => ({
  arrayUnion: (...a: unknown[]) => ({ __arrayUnion: a }),
  collection: vi.fn(() => ({ __collection: true })),
  doc: vi.fn(() => ({ id: "dev-session-id" })),
  getDocs: getDocsMock,
  onSnapshot: vi.fn(() => () => {}),
  query: vi.fn(() => ({ __query: true })),
  serverTimestamp: vi.fn(() => ({ __ts: true })),
  setDoc: setDocMock,
  Timestamp: class {
    toDate(): Date {
      return new Date(0);
    }
  },
  updateDoc: updateDocMock,
  where: vi.fn(() => ({ __where: true })),
}));

import {
  createCampaign,
  createSession,
  joinCampaign,
  listSessions,
  listSharedCampaigns,
  commitChronicleEdit,
  setCampaignBanner,
} from "@/features/campaigns/campaign-io";
import {
  DEV_CAMPAIGN_ID,
  makeDevCampaign,
  makeDevNotes,
} from "@/features/campaigns/dev-fixture";

describe("campaign-io under dev bypass", () => {
  beforeEach(() => {
    setDocMock.mockClear();
    updateDocMock.mockClear();
    getDocsMock.mockClear();
  });

  it("createCampaign returns an invite code WITHOUT writing Firestore", async () => {
    const code = await createCampaign("u1", { name: "Goblins" });
    expect(code).toMatch(/^[A-Z2-9]{14}$/);
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it("joinCampaign returns the code WITHOUT writing Firestore", async () => {
    const id = await joinCampaign("u2", "ABCDEFGH234567");
    expect(id).toBe("ABCDEFGH234567");
    expect(updateDocMock).not.toHaveBeenCalled();
  });

  it("listSharedCampaigns returns the seeded dev campaign WITHOUT a query (D29)", async () => {
    const cs = await listSharedCampaigns("u1");
    // The list is reachable in dev so the owner can test campaigns locally.
    expect(cs).toEqual([makeDevCampaign()]);
    expect(getDocsMock).not.toHaveBeenCalled();
  });
});

describe("makeDevCampaign fixture", () => {
  it("is a fully-populated, deterministic campaign", () => {
    const c = makeDevCampaign();
    expect(c.id).toBe(DEV_CAMPAIGN_ID);
    expect(c.dmUid).toBe("mock-uid");
    expect(c.members).toHaveLength(3);
    expect(Object.keys(c.memberDetails)).toHaveLength(3);
    expect(c.treasury.gp).toBe(145);
    // The roster is denormalized, so Party renders without reading character docs.
    expect(c.memberDetails["member-mara"]?.displayName).toBe("Mara");
  });

  it("accepts a custom id (used by the hub fixture seed)", () => {
    expect(makeDevCampaign("XYZ").id).toBe("XYZ");
  });

  it("makeDevNotes seeds the shared notes incl. one hidden (dmOnly) for the reveal demo", () => {
    const notes = makeDevNotes();
    // The pinned Morweth note + the long rumor note (the CAMPAIGN-NOTES-UX clamp case)
    // + one staged-hidden note so the bypass DM sees the soft-reveal toggle at rest.
    expect(notes).toHaveLength(3);
    expect(notes.filter((n) => n.dmOnly === true)).toHaveLength(1);
    expect(notes.find((n) => n.id === "note-morweth")?.pinned).toBe(true);
  });
});

describe("campaign-io subcollections under dev bypass", () => {
  it("commitChronicleEdit persists nothing", async () => {
    await commitChronicleEdit("c1", { text: "x", editedBy: "u1" });
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it("setCampaignBanner persists nothing (N4)", async () => {
    await setCampaignBanner("c1", "https://example/banner.jpeg", {
      x: 0,
      y: 0,
      width: 100,
      height: 33,
    });
    expect(updateDocMock).not.toHaveBeenCalled();
  });

  it("listSessions returns the dev fixtures and issues no query", async () => {
    // D28 — dev-bypass seeds sessions (so the accordion renders locally + in the
    // a11y/visual suite) but still hits no Firestore query.
    const sessions = await listSessions("c1");
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions[0]?.date.getTime()).toBeGreaterThanOrEqual(
      sessions[sessions.length - 1]?.date.getTime() ?? 0
    );
    expect(getDocsMock).not.toHaveBeenCalled();
  });

  it("createSession returns a generated id without writing", async () => {
    const id = await createSession("c1", { label: "Session 1", date: new Date(0) });
    expect(id).toBe("dev-session-id");
    expect(setDocMock).not.toHaveBeenCalled();
  });
});
