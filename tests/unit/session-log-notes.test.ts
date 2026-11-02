import { describe, expect, it } from "vitest";

import { createMemorySessionLogStore, createSessionRecorder } from "@/lib/session-log";

import * as v025 from "./__fixtures__/session-log-v0.25.0-reader";

/** The play log is the session record: its text (the Diario's «Cronaca della sessione»)
 *  lives on it, so nothing pairs two documents by date. */
describe("a session's text", () => {
  const evening = async () => {
    const store = createMemorySessionLogStore();
    const recorder = createSessionRecorder({
      store,
      uid: "ana",
      now: () => new Date(2026, 10, 2, 21),
    });
    await recorder.record({ kind: "heal", amount: 2 });
    return store;
  };

  it("is saved whole on the session and read back with it", async () => {
    const store = await evening();
    await store.saveNotes("2026-11-02", "We reached Cragmaw.");
    await store.saveNotes("2026-11-02", "We reached Cragmaw. Then the owlbear.");
    const [session] = await store.recent(5);
    expect(session?.notes).toBe("We reached Cragmaw. Then the owlbear.");
    expect(session?.items).toHaveLength(1);
  });

  it("never makes an older evening the current session", async () => {
    const store = await evening();
    const before = await store.latest();
    await store.saveNotes("2026-11-02", "Edited the next morning.");
    expect(await store.latest()).toEqual(before);
  });

  it("is absent on a session nobody wrote about", async () => {
    const [session] = await (await evening()).recent(5);
    expect(session?.notes).toBeUndefined();
  });

  it("is ignored by a v0.25.0 client reading the session", () => {
    const head = { schema: 1, lastAt: 5, log: [] };
    expect(v025.readHead("s", { ...head, notes: "We reached Cragmaw." })).toEqual(
      v025.readHead("s", head)
    );
  });
});
