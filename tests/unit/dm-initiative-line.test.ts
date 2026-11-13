/**
 * The classic hub: the DM types a hero's initiative on the hero's card. The report
 * gains the same line the new UI's «Roll for the missing» writes («Initiative for X,
 * rolled by the DM: N»), one per hero per fight: a changed number corrects it, a
 * cleared roll takes it back, a new roll after that is a line again (coordinator,
 * 2026-11-12, found by the second session-report rehearsal).
 */
import { describe, expect, it } from "vitest";

import { createDmInitiativeLines } from "@/features/campaigns/dm-initiative-line";
import {
  createMemorySessionLogStore,
  createSessionRecorder,
  foldSession,
  type SessionLogStore,
} from "@/lib/session-log";

async function lines(store: SessionLogStore) {
  const [session] = await store.recent(1);
  if (!session) return [];
  return foldSession(session.items, { dmUid: "dm" }).map((entry) => entry.event);
}

function setup() {
  const store = createMemorySessionLogStore();
  const recorder = createSessionRecorder({ store, uid: "dm" });
  return { store, type: createDmInitiativeLines(recorder) };
}

describe("the DM's typed initiative in the report", () => {
  it("one line, rolled by the DM, with the roll and its total", async () => {
    const { store, type } = setup();
    await type({ epoch: 3, memberUid: "ana", roll: 14, bonus: 2 });
    expect(await lines(store)).toEqual([
      { kind: "initiative", actor: "pc-ana", roll: 14, total: 16, rolledBy: "dm" },
    ]);
  });

  it("a changed number corrects the line: still one line per hero per fight", async () => {
    const { store, type } = setup();
    await type({ epoch: 3, memberUid: "ana", roll: 14, bonus: 2 });
    await type({ epoch: 3, memberUid: "ana", roll: 9, bonus: 2 });
    expect(await lines(store)).toEqual([
      { kind: "initiative", actor: "pc-ana", roll: 9, total: 11, rolledBy: "dm" },
    ]);
  });

  it("a cleared roll takes the line back; typing again is a line again", async () => {
    const { store, type } = setup();
    await type({ epoch: 3, memberUid: "ana", roll: 14, bonus: 2 });
    await type({ epoch: 3, memberUid: "ana", roll: null, bonus: 2 });
    expect(await lines(store)).toEqual([]);
    await type({ epoch: 3, memberUid: "ana", roll: 5, bonus: 2 });
    expect(await lines(store)).toEqual([
      { kind: "initiative", actor: "pc-ana", roll: 5, total: 7, rolledBy: "dm" },
    ]);
  });

  it("two heroes, or a new fight, are lines of their own", async () => {
    const { store, type } = setup();
    await type({ epoch: 3, memberUid: "ana", roll: 14, bonus: 2 });
    await type({ epoch: 3, memberUid: "ben", roll: 8, bonus: 0 });
    await type({ epoch: 4, memberUid: "ana", roll: 3, bonus: 2 });
    expect((await lines(store)).map((e) => "total" in e && e.total)).toEqual([16, 8, 5]);
  });
});
