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
  runTransaction: vi.fn(),
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
  advanceEncounterTurn,
  appendPersistentCombatEffect,
  createCampaign,
  createSession,
  joinCampaign,
  listSessions,
  listSharedCampaigns,
  revokePersistentCombatEffectsBySource,
  commitChronicleEdit,
  setCampaignBanner,
} from "@/features/campaigns/campaign-io";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import {
  DEV_CAMPAIGN_ID,
  makeDevCampaign,
  makeDevNotes,
} from "@/features/campaigns/dev-fixture";
import type { ActiveCombatEffect, CombatEffectOp } from "@/types/combat-effect";
import { clearDevDocuments } from "@/lib/dev-document-store";

describe("campaign-io under dev bypass", () => {
  beforeEach(() => {
    clearDevDocuments();
    setDocMock.mockClear();
    updateDocMock.mockClear();
    getDocsMock.mockClear();
    useCampaignStore.setState({ campaign: null });
  });

  it("advances turn-bound effects and creates their aftereffect in dev bypass", async () => {
    const campaign = makeDevCampaign();
    const haste: ActiveCombatEffect = {
      id: "haste:dev",
      actor: { kind: "monster", combatantId: "monster-1" },
      target: { kind: "monster", combatantId: "monster-2" },
      source: { kind: "spell", id: "haste", actionId: "cast-haste" },
      payload: { kind: "grant-group", activeKey: "spell-haste" },
      duration: {
        kind: "turn-boundary",
        combatantId: "monster-2",
        round: 1,
        phase: "turn-start",
      },
    };
    campaign.encounter = {
      nextMonsterOrdinal: 3,
      round: 1,
      currentCombatantId: "monster-1",
      order: ["monster-1", "monster-2"],
      epoch: 1,
      status: "active",
      combatants: [
        {
          kind: "monster",
          id: "monster-1",
          name: "Caster",
          ac: 12,
          initiative: 10,
          conditions: [],
          hp: { current: 20, temp: 0, max: 20 },
        },
        {
          kind: "monster",
          id: "monster-2",
          name: "Target",
          ac: 12,
          initiative: 9,
          conditions: [],
          hp: { current: 20, temp: 0, max: 20 },
        },
      ],
      effectOps: [{ id: "apply:haste", kind: "apply", effect: haste }],
    };
    useCampaignStore.setState({ campaign });

    await advanceEncounterTurn(
      campaign.id,
      "next",
      { uid: "dm", isDm: true },
      "monster-1"
    );

    const effectOps = useCampaignStore.getState().campaign?.encounter?.effectOps ?? [];
    expect(effectOps).toContainEqual(
      expect.objectContaining({ kind: "revoke", effectId: haste.id })
    );
    const successor = effectOps.find(
      (operation) =>
        operation.kind === "apply" && operation.effect.id === `${haste.id}:aftereffect`
    );
    expect(successor?.kind === "apply" ? successor.effect.payload : null).toMatchObject({
      phase: "aftereffect",
    });
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

  it("revokes every matching persistent effect optimistically without Firestore", async () => {
    const campaign = makeDevCampaign();
    const active = (id: string): ActiveCombatEffect => ({
      id,
      actor: { kind: "monster", combatantId: "monster-1" },
      target: { kind: "monster", combatantId: "monster-2" },
      source: { kind: "spell", id: "heroism", actionId: "cast" },
      payload: { kind: "grant-group", activeKey: "heroism-active" },
      duration: { kind: "encounter" },
    });
    const effectOps: CombatEffectOp[] = [
      { id: "apply:one", kind: "apply", effect: active("one") },
      { id: "apply:two", kind: "apply", effect: active("two") },
    ];
    campaign.encounter = {
      nextMonsterOrdinal: 1,
      round: 1,
      currentCombatantId: null,
      epoch: 1,
      status: "active",
      combatants: [],
      effectOps,
    };
    useCampaignStore.setState({ campaign });

    await revokePersistentCombatEffectsBySource(campaign.id, {
      actorId: "monster-1",
      sourceId: "heroism",
    });

    expect(
      useCampaignStore
        .getState()
        .campaign?.encounter?.effectOps?.filter(
          (operation) => operation.kind === "revoke"
        )
    ).toHaveLength(1);
    expect(updateDocMock).not.toHaveBeenCalled();
  });

  it("validates persistent-effect participants in dev bypass too", async () => {
    const campaign = makeDevCampaign();
    campaign.encounter = {
      nextMonsterOrdinal: 3,
      round: 1,
      currentCombatantId: "pc-u1",
      epoch: 1,
      status: "active",
      combatants: [
        { kind: "pc", id: "pc-u1", memberUid: "u1", characterId: "char-u1" },
        {
          kind: "monster",
          id: "monster-1",
          name: "Goblin 1",
          ac: 13,
          initiative: 8,
          conditions: [],
          hp: { current: 7, temp: 0, max: 7 },
        },
        {
          kind: "monster",
          id: "monster-2",
          name: "Goblin 2",
          ac: 13,
          initiative: 8,
          conditions: [],
          hp: { current: 7, temp: 0, max: 7 },
        },
      ],
    };
    useCampaignStore.setState({ campaign });
    const valid: ActiveCombatEffect = {
      id: "ward:1",
      actor: {
        kind: "pc",
        combatantId: "pc-u1",
        memberUid: "u1",
        characterId: "char-u1",
      },
      target: { kind: "monster", combatantId: "monster-2" },
      source: { kind: "spell", id: "ward", actionId: "cast" },
      payload: { kind: "grant-group", activeKey: "ward-active" },
      duration: { kind: "encounter" },
    };

    await appendPersistentCombatEffect(campaign.id, valid);
    expect(useCampaignStore.getState().campaign?.encounter?.effectOps).toContainEqual({
      id: "apply:ward:1",
      kind: "apply",
      effect: valid,
    });
    await expect(
      appendPersistentCombatEffect(campaign.id, {
        ...valid,
        id: "ward:spoofed",
        actor: {
          kind: "pc",
          combatantId: "pc-u1",
          memberUid: "other",
          characterId: "char-u1",
        },
      })
    ).rejects.toThrow("Combat effect participant mismatch");
    await expect(
      appendPersistentCombatEffect(campaign.id, {
        ...valid,
        id: "ward:missing-target",
        // One combatant per creature: a target must exist at the table.
        target: { kind: "monster", combatantId: "monster-3" },
      })
    ).rejects.toThrow("Combat effect participant mismatch");
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
