/**
 * The DM's encounter edit log wired to the store and the server (`encounter-edit-sync`):
 * an edit shows at once, a burst of edits goes out as one transaction, a snapshot never
 * takes an edit off the screen, and with no network the fight is written the old way
 * (a queued whole write), so nothing is lost and no error shows.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rebaseMock, wholeMock, readMock } = vi.hoisted(() => ({
  rebaseMock: vi.fn(),
  wholeMock: vi.fn<(campaignId: string, fight: unknown) => Promise<void>>(() =>
    Promise.resolve()
  ),
  readMock: vi.fn(),
}));
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
  handOverEncounterEdits,
  isEditLogFight,
} from "@/features/campaigns/encounter-edit-sync";
import { setHidden, startEncounter } from "@/lib/play/encounter";
import type { CampaignDoc, EncounterState } from "@/types/campaign";

function fight(): EncounterState {
  return startEncounter(
    { a: { characterId: "ca" }, b: { characterId: "cb" } },
    ["a", "b"],
    1
  );
}

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

const shown = () => useCampaignStore.getState().campaign?.encounter ?? null;
const hiddenOn = (f: EncounterState | null, id: string) =>
  f?.combatants.find((c: { id: string }) => c.id === id)?.hidden === true;
const hide = (id: string) => (e: EncounterState) => setHidden(e, id, true);
const nextRound = (e: EncounterState) => ({ ...e, round: e.round + 1 });

/** The server: replays what it is sent onto the fight it holds. */
let server: EncounterState | null;

beforeEach(() => {
  vi.useFakeTimers();
  server = fight();
  rebaseMock.mockReset();
  rebaseMock.mockImplementation((_id: string, edits: readonly EncounterEdit[]) => {
    server = replayEdits(server, edits);
    return Promise.resolve(server);
  });
  wholeMock.mockClear();
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

describe("the DM's fight edits, kept and sent", () => {
  it("an edit shows at once, before anything is written", () => {
    editEncounter("c1", hide("pc-a"));
    expect(hiddenOn(shown(), "pc-a")).toBe(true);
    expect(rebaseMock).not.toHaveBeenCalled();
  });

  it("five quick edits go out as ONE transaction, and land in order", async () => {
    for (let i = 0; i < 5; i++) editEncounter("c1", nextRound);
    expect(shown()?.round).toBe(6);
    await vi.runAllTimersAsync();
    expect(rebaseMock).toHaveBeenCalledTimes(1);
    expect(server?.round).toBe(6);
    expect(shown()?.round).toBe(6);
  });

  it("a snapshot between two edits takes neither off the screen, and both land", async () => {
    editEncounter("c1", hide("pc-a"));
    // A player's write: the server's fight, without the DM's waiting edit.
    const snap = encounterFromServer("c1", fight());
    expect(hiddenOn(snap, "pc-a")).toBe(true);
    useCampaignStore.getState().setCampaign(campaign(snap));
    editEncounter("c1", hide("pc-b"));
    await vi.runAllTimersAsync();
    expect(hiddenOn(server, "pc-a")).toBe(true);
    expect(hiddenOn(server, "pc-b")).toBe(true);
  });

  it("a change someone else made on the server meanwhile is kept", async () => {
    editEncounter("c1", hide("pc-a"));
    server = { ...fight(), round: 7 };
    await vi.runAllTimersAsync();
    expect(server.round).toBe(7);
    expect(hiddenOn(server, "pc-a")).toBe(true);
  });

  it("offline, the fight is written the old way (queued), with no transaction", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    editEncounter("c1", hide("pc-a"));
    await vi.runAllTimersAsync();
    expect(rebaseMock).not.toHaveBeenCalled();
    expect(wholeMock).toHaveBeenCalledTimes(1);
    expect(hiddenOn(wholeMock.mock.calls[0]?.[1] as EncounterState, "pc-a")).toBe(true);
    expect(hiddenOn(shown(), "pc-a")).toBe(true);
  });

  it("a failed transaction falls back to the old write, and the edit stays on screen", async () => {
    rebaseMock.mockImplementationOnce(() => Promise.reject(new Error("unavailable")));
    editEncounter("c1", hide("pc-a"));
    await vi.runAllTimersAsync();
    expect(wholeMock).toHaveBeenCalledTimes(1);
    expect(hiddenOn(shown(), "pc-a")).toBe(true);
  });

  it("the screen's own fight never re-arms the old autosave", () => {
    editEncounter("c1", hide("pc-a"));
    expect(isEditLogFight("c1", shown())).toBe(true);
    expect(isEditLogFight("c1", fight())).toBe(false);
  });

  it("a fight started outside the log is taken as it is", () => {
    editEncounter("c1", hide("pc-a"));
    const fresh = { ...fight(), epoch: 2 };
    useCampaignStore.getState().setCampaign(campaign(fresh));
    editEncounter("c1", hide("pc-b"));
    expect(shown()?.epoch).toBe(2);
    expect(hiddenOn(shown(), "pc-b")).toBe(true);
  });
});

describe("a change made outside the edit log", () => {
  it("takes over the waiting edits: the old autosave writes them whole, the log never sends them", async () => {
    editEncounter("c1", hide("pc-a"));
    // A turn passed on this screen: built over the fight shown, edit included.
    const passed = { ...(shown() as EncounterState), round: 2 };
    useCampaignStore.getState().setCampaign(campaign(passed));
    handOverEncounterEdits("c1");
    server = passed; // what the old autosave writes
    await vi.runAllTimersAsync();
    expect(rebaseMock).not.toHaveBeenCalled();
    // The next edit starts from what is on screen.
    editEncounter("c1", hide("pc-b"));
    await vi.runAllTimersAsync();
    expect(rebaseMock).toHaveBeenCalledTimes(1);
    expect(rebaseMock.mock.calls[0]?.[1]).toHaveLength(1);
    expect(hiddenOn(shown(), "pc-a")).toBe(true);
    expect(shown()?.round).toBe(2);
  });
});
