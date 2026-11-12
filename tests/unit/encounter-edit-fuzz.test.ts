/**
 * The DM's fight edits under every order of events at once: 400 seeded random runs of
 * edits, snapshots (current and late, older ones), another device's writes, this
 * device's own moves (handed over), slow transactions and the clock, then everything
 * settles. Every edit the DM made must be on the server. The second run also makes one
 * transaction in five fail (tried again while online; the whole-fight write only when
 * every try fails). A failing run prints its seed and its trace of events.
 */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const { rebaseMock, wholeMock, readMock } = vi.hoisted(() => ({
  rebaseMock: vi.fn(),
  wholeMock: vi.fn(),
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
  handOverEncounterEdits,
} from "@/features/campaigns/encounter-edit-sync";
import { setHidden, startEncounter } from "@/lib/play/encounter";
import type { CampaignDoc, EncounterState } from "@/types/campaign";
const IDS = ["a", "b", "c", "d", "e", "f"];
const start = (): EncounterState =>
  startEncounter(
    Object.fromEntries(IDS.map((i) => [i, { characterId: "c" + i }])),
    IDS,
    1
  );
const camp = (encounter: EncounterState | null): CampaignDoc => ({
  id: "c1",
  name: "T",
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: "dm",
  dmUid: "dm",
  members: ["dm"],
  memberDetails: {},
  status: "active",
  inviteCode: "c1",
  treasury: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
  treasuryLog: [],
  encounter,
});
let server: EncounterState;
let history: EncounterState[] = [];
let pending: Array<() => void> = [];
let failRate = 0;
let seed = 1;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
function commit(f: EncounterState) {
  server = f;
  history.push(f);
}
beforeEach(() => {
  vi.useFakeTimers();
  server = start();
  history = [server];
  pending = [];
  rebaseMock.mockReset();
  rebaseMock.mockImplementation(
    (_id: string, edits: readonly EncounterEdit[]) =>
      new Promise((resolve, reject) => {
        pending.push(() => {
          if (rnd() < failRate) {
            reject(new Error("aborted"));
            return;
          }
          const next = replayEdits(server, edits) as EncounterState;
          if (next !== server) commit(next);
          resolve(next);
        });
      })
  );
  wholeMock.mockReset();
  wholeMock.mockImplementation((_id: string, f: EncounterState) => {
    commit(f);
    return Promise.resolve();
  });
  readMock.mockReset();
  readMock.mockImplementation(
    () => new Promise((resolve) => pending.push(() => resolve(server)))
  );
  vi.stubGlobal("navigator", { onLine: true });
  // the subscription: the store follows the log's shown fight, and a foreign store change hands over
  useCampaignStore.getState().setCampaign(camp(server));
});
afterEach(() => {
  closeEncounterEdits("c1");
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const deliver = (f: EncounterState) => {
  const shown = encounterFromServer("c1", f);
  useCampaignStore.getState().setCampaign(camp(shown));
};
async function fuzz(rate: number) {
  failRate = rate;
  for (let run = 0; run < 400; run++) {
    seed = run + 7;
    closeEncounterEdits("c1");
    server = start();
    history = [server];
    pending = [];
    useCampaignStore.getState().setCampaign(camp(server));
    const made: string[] = [];
    const trace: string[] = [];
    for (let step = 0; step < 25; step++) {
      const r = rnd();
      if (r < 0.3) {
        const id = IDS[Math.floor(rnd() * IDS.length)] ?? "a";
        const before = useCampaignStore.getState().campaign?.encounter;
        editEncounter("c1", (e) => setHidden(e, `pc-${id}`, true));
        const after = useCampaignStore.getState().campaign?.encounter;
        if (before !== after) {
          made.push(id);
          trace.push("edit " + id);
        }
      } else if (r < 0.45) {
        const idx = Math.floor(rnd() * history.length);
        deliver(history[Math.max(idx, history.length - 2)] ?? server);
        trace.push(`snap ${idx}`);
      } else if (r < 0.55) {
        const f = { ...server, round: server.round + 1 };
        commit(f);
        trace.push("other write");
      } else if (r < 0.6) {
        // a move by this device: its own write, and the store follows it
        const shownNow = useCampaignStore.getState().campaign?.encounter ?? server;
        const moved = { ...shownNow, round: shownNow.round + 10 };
        commit({ ...server, round: server.round + 10 });
        useCampaignStore.getState().setCampaign(camp(moved));
        handOverEncounterEdits("c1");
        trace.push("move");
      } else if (r < 0.75) {
        const p = pending.shift();
        if (p) {
          p();
          trace.push("resolve");
        }
        await Promise.resolve();
        await Promise.resolve();
      } else {
        await vi.advanceTimersByTimeAsync(Math.floor(rnd() * 400));
        trace.push("time");
      }
    }
    for (let k = 0; k < 50; k++) {
      for (let next = pending.shift(); next; next = pending.shift()) {
        next();
        await Promise.resolve();
      }
      await vi.advanceTimersByTimeAsync(1000);
    }
    const lost = made.filter(
      (id) => server.combatants.find((c) => c.id === `pc-${id}`)?.hidden !== true
    );
    expect(lost, `run ${run}: ${trace.join(" | ")}`).toEqual([]);
  }
}
it("fuzz: every edit made reaches the server", async () => {
  await fuzz(0);
});
it("fuzz: and when some transactions fail and the fight is written whole", async () => {
  await fuzz(0.2);
});
