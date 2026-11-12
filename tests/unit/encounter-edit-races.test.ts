/**
 * A DM fight edit is never lost to another device's write (#1025's guarantee), in
 * every order the two can land. Rehearsal classic-dm-edits failed once on Verify
 * 43203056381 with the DM's first edit missing; these pin each interleaving at the
 * edit log's own seam, with a server that behaves like Firestore's transactions (a
 * write between the transaction's read and its commit makes it retry on the newer
 * document):
 *
 *  1. the other write lands before this device sends (its snapshot arrives first);
 *  2. the other write lands between the transaction's read and its commit;
 *  3. the other write's snapshot reaches this device while the batch is out;
 *  4. that snapshot reaches this device only after the send has finished (an older
 *     fight arriving late), and the next edit goes out normally;
 *  5. the same late snapshot, then the next edit's transaction fails and the fight is
 *     written whole (the offline fallback). This one lost the first edit: the late
 *     snapshot was taken as the server's fight, and the fallback wrote from it. A
 *     snapshot that differs from the last write is now checked by a read instead;
 *  6. so a newer change by another device still reaches the screen.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rebaseMock, wholeMock, readMock } = vi.hoisted(() => ({
  rebaseMock: vi.fn(),
  wholeMock: vi.fn<(campaignId: string, fight: unknown) => Promise<void>>(),
  readMock: vi.fn(),
}));
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/features/campaigns/campaign-io", () => ({
  rebaseEncounterEdits: rebaseMock,
  writeWholeEncounter: wholeMock,
  readServerEncounter: readMock,
}));

import { useCampaignStore } from "@/features/campaigns/campaignStore";
import { replayEdits, type EncounterEdit } from "@/features/campaigns/encounter-edit-log";
import {
  closeEncounterEdits,
  editEncounter,
  encounterFromServer,
} from "@/features/campaigns/encounter-edit-sync";
import { setHidden, startEncounter } from "@/lib/play/encounter";
import type { CampaignDoc, EncounterState } from "@/types/campaign";

const start = (): EncounterState =>
  startEncounter({ a: { characterId: "ca" }, b: { characterId: "cb" } }, ["a", "b"], 1);

function campaign(encounter: EncounterState | null): CampaignDoc {
  return {
    id: "c1",
    name: "Table",
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: "dm",
    dmUid: "dm",
    members: ["dm", "a", "b"],
    memberDetails: {},
    status: "active",
    inviteCode: "c1",
    treasury: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
    treasuryLog: [],
    encounter,
  };
}

/** The DM's two edits (the rehearsal's reveal and hide). */
const first = (e: EncounterState) => setHidden(e, "pc-a", true);
const second = (e: EncounterState) => setHidden(e, "pc-b", true);
const has = (f: EncounterState | null, id: string) =>
  f?.combatants.find((c) => c.id === id)?.hidden === true;

/** The server: one document, a version bumped by every write. */
let server: EncounterState;
let version = 0;
/** Runs once inside the next transaction, between its read and its commit. */
let betweenReadAndCommit: (() => void) | null = null;
/** Makes the next transaction fail outright (the fallback path). */
let failNextTransaction = false;

/** Another device's write: it changes the round, never the DM's edits. */
function otherDeviceWrites(): EncounterState {
  server = { ...server, round: server.round + 1 };
  version += 1;
  return server;
}

/** A snapshot reaches the DM's device, as `useCampaignSubscription` applies it. */
function deliver(fight: EncounterState | null): void {
  const shown = encounterFromServer("c1", fight);
  useCampaignStore.getState().setCampaign(campaign(shown));
}

beforeEach(() => {
  vi.useFakeTimers();
  server = start();
  version = 0;
  betweenReadAndCommit = null;
  failNextTransaction = false;
  rebaseMock.mockReset();
  // Firestore's transaction: read, replay, commit only if nothing was written since
  // the read; otherwise run again on the newer document (up to five attempts).
  rebaseMock.mockImplementation(async (_id: string, edits: readonly EncounterEdit[]) => {
    await Promise.resolve();
    if (failNextTransaction) {
      failNextTransaction = false;
      throw new Error("aborted");
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      const readVersion = version;
      const next = replayEdits(server, edits) as EncounterState;
      const hook = betweenReadAndCommit;
      betweenReadAndCommit = null;
      hook?.();
      if (version !== readVersion) continue;
      server = next;
      version += 1;
      return next;
    }
    throw new Error("too much contention");
  });
  wholeMock.mockReset();
  wholeMock.mockImplementation((_id: string, fight: unknown) => {
    server = fight as EncounterState;
    version += 1;
    return Promise.resolve();
  });
  readMock.mockReset();
  readMock.mockImplementation(() => Promise.resolve(server));
  vi.stubGlobal("navigator", { onLine: true });
  useCampaignStore.getState().setCampaign(campaign(server));
});

afterEach(() => {
  closeEncounterEdits("c1");
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("a DM edit is never lost to another device's write", () => {
  it("1. the other write lands before the send", async () => {
    editEncounter("c1", first);
    deliver(otherDeviceWrites());
    await vi.runAllTimersAsync();
    editEncounter("c1", second);
    await vi.runAllTimersAsync();
    expect(has(server, "pc-a") && has(server, "pc-b")).toBe(true);
    expect(server.round).toBe(2);
  });

  it("2. the other write lands between the transaction's read and its commit", async () => {
    editEncounter("c1", first);
    betweenReadAndCommit = otherDeviceWrites;
    await vi.runAllTimersAsync();
    editEncounter("c1", second);
    await vi.runAllTimersAsync();
    expect(has(server, "pc-a") && has(server, "pc-b")).toBe(true);
    expect(server.round).toBe(2);
  });

  it("3. the other write's snapshot arrives while the batch is out", async () => {
    editEncounter("c1", first);
    const older = otherDeviceWrites();
    betweenReadAndCommit = () => deliver(older);
    await vi.runAllTimersAsync();
    editEncounter("c1", second);
    await vi.runAllTimersAsync();
    expect(has(server, "pc-a") && has(server, "pc-b")).toBe(true);
  });

  it("4. an older snapshot arrives after the send, then the next edit goes out", async () => {
    editEncounter("c1", first);
    const older = otherDeviceWrites();
    await vi.runAllTimersAsync();
    deliver(older); // late: it predates the DM's committed edit
    editEncounter("c1", second);
    await vi.runAllTimersAsync();
    expect(has(server, "pc-a") && has(server, "pc-b")).toBe(true);
  });

  it("5. an older snapshot arrives after the send, then the next write falls back whole", async () => {
    editEncounter("c1", first);
    const older = otherDeviceWrites();
    await vi.runAllTimersAsync();
    // The read that checks the late snapshot is slower than the next send.
    let releaseRead: () => void = () => undefined;
    readMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseRead = () => resolve(server);
        })
    );
    deliver(older);
    failNextTransaction = true;
    editEncounter("c1", second);
    await vi.runAllTimersAsync();
    expect(has(server, "pc-b")).toBe(true);
    expect(has(server, "pc-a")).toBe(true);
    releaseRead();
    await vi.runAllTimersAsync();
  });

  it("a newer change by another device after the send still reaches the screen", async () => {
    editEncounter("c1", first);
    await vi.runAllTimersAsync();
    // After the DM's write: the snapshot differs from it, so the log reads the server.
    deliver(otherDeviceWrites());
    await vi.runAllTimersAsync();
    const shown = useCampaignStore.getState().campaign?.encounter ?? null;
    expect(shown?.round).toBe(2);
    expect(has(shown, "pc-a")).toBe(true);
  });
});
