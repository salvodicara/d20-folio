import { describe, expect, it } from "vitest";

import {
  beginSend,
  logEdit,
  logSnapshot,
  openEditLog,
  replayEdits,
  sendDone,
  shownFight,
  type EncounterEdit,
} from "@/features/campaigns/encounter-edit-log";
import { setHidden, setRevealed, startEncounter } from "@/lib/play/encounter";
import type { EncounterState } from "@/types/campaign";

/** A fight with two PCs, the way the DM's "Run encounter" starts one. */
function fight(epoch = 1): EncounterState {
  return startEncounter(
    { a: { characterId: "ca" }, b: { characterId: "cb" } },
    ["a", "b"],
    epoch
  );
}

const hide = (id: string, epoch = 1): EncounterEdit => ({
  epoch,
  apply: (e) => setHidden(e, id, true),
});
const reveal = (id: string, epoch = 1): EncounterEdit => ({
  epoch,
  apply: (e) => setRevealed(e, id, true),
});
const nextRound = (epoch = 1): EncounterEdit => ({
  epoch,
  apply: (e) => ({ ...e, round: e.round + 1 }),
});

const hidden = (f: EncounterState | null, id: string) =>
  f?.combatants.find((c: { id: string }) => c.id === id)?.hidden === true;

describe("the DM's encounter edit log", () => {
  it("shows an edit at once, over the fight the server holds", () => {
    const log = logEdit(openEditLog(fight()), hide("pc-a"));
    expect(hidden(shownFight(log), "pc-a")).toBe(true);
  });

  it("keeps an unsent edit over a snapshot that does not have it (a player's write lands)", () => {
    let log = logEdit(openEditLog(fight()), hide("pc-a"));
    // Someone else moved the fight on; the server's copy has no hide yet.
    log = logSnapshot(log, { ...fight(), round: 3 });
    const shown = shownFight(log);
    expect(hidden(shown, "pc-a")).toBe(true);
    expect(shown?.round).toBe(3);
  });

  it("loses no edit when a snapshot lands between two edits (today's loss)", () => {
    let log = logEdit(openEditLog(fight()), hide("pc-a"));
    log = logSnapshot(log, fight());
    log = logEdit(log, hide("pc-b"));
    const shown = shownFight(log);
    expect(hidden(shown, "pc-a")).toBe(true);
    expect(hidden(shown, "pc-b")).toBe(true);
  });

  it("sends every waiting edit as one batch, in order, and none twice", () => {
    let log = openEditLog(fight());
    for (let i = 0; i < 5; i++) log = logEdit(log, nextRound());
    const sent = beginSend(log);
    expect(sent?.batch).toHaveLength(5);
    // While the batch is out, another send has nothing to take.
    expect(sent && beginSend(sent.log)).toBeNull();
  });

  it("replays a batch onto the server's newest fight, so a concurrent change stays", () => {
    const server = { ...fight(), round: 4 };
    const replayed = replayEdits(server, [hide("pc-a"), reveal("pc-a")]);
    expect(replayed?.round).toBe(4);
    expect(hidden(replayed, "pc-a")).toBe(true);
  });

  it("drops an edit made in another fight (ended and started again)", () => {
    const replayed = replayEdits(fight(2), [hide("pc-a", 1)]);
    expect(hidden(replayed, "pc-a")).toBe(false);
  });

  it("never applies a batch twice when the server's echo arrives before the send ends", () => {
    let log = logEdit(openEditLog(fight()), nextRound());
    const sent = beginSend(log);
    if (!sent) throw new Error("nothing to send");
    log = sent.log;
    const written = replayEdits(fight(), sent.batch);
    if (!written) throw new Error("no fight");
    // The echo of the write lands while the transaction is still resolving.
    log = logSnapshot(log, written);
    expect(shownFight(log)?.round).toBe(2);
    const done = sendDone(log, written);
    expect(shownFight(done.log)?.round).toBe(2);
    expect(done.recheck).toBe(false);
  });

  it("keeps edits made during a send, on top of what the send wrote", () => {
    let log = logEdit(openEditLog(fight()), hide("pc-a"));
    const sent = beginSend(log);
    if (!sent) throw new Error("nothing to send");
    log = logEdit(sent.log, hide("pc-b"));
    const written = replayEdits(fight(), sent.batch);
    if (!written) throw new Error("no fight");
    const done = sendDone(log, written);
    expect(hidden(shownFight(done.log), "pc-a")).toBe(true);
    expect(hidden(shownFight(done.log), "pc-b")).toBe(true);
    expect(beginSend(done.log)?.batch).toHaveLength(1);
  });

  it("asks for a fresh read when a different snapshot arrived during the send", () => {
    let log = logEdit(openEditLog(fight()), hide("pc-a"));
    const sent = beginSend(log);
    if (!sent) throw new Error("nothing to send");
    log = logSnapshot(sent.log, { ...fight(), round: 5 });
    const written = replayEdits(fight(), sent.batch);
    if (!written) throw new Error("no fight");
    const done = sendDone(log, written);
    // Which came first is unknown: show what was written, and read the server again.
    expect(done.recheck).toBe(true);
    expect(hidden(shownFight(done.log), "pc-a")).toBe(true);
  });

  it("an ended fight shows as ended, whatever is waiting", () => {
    let log = logEdit(openEditLog(fight()), hide("pc-a"));
    log = logSnapshot(log, null);
    expect(shownFight(log)).toBeNull();
  });
});
