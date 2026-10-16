/**
 * The recorder writes the narrative overrides (#327: hide, show, move) for the editor,
 * and any item can target a named session: the story is often fixed after the game,
 * when a newer session already exists. docs/architecture/session-narrative.md.
 */
import { describe, expect, it } from "vitest";

import {
  createMemorySessionLogStore,
  createSessionRecorder,
  foldSession,
} from "@/lib/session-log";

const DM = "dm";

function setup() {
  const store = createMemorySessionLogStore();
  let clock = new Date(2026, 9, 8, 20, 0);
  let n = 0;
  const recorder = (uid: string) =>
    createSessionRecorder({ store, uid, now: () => clock, newId: () => `i${++n}` });
  return {
    store,
    recorder,
    nextDay: () => {
      clock = new Date(2026, 9, 9, 20, 0);
    },
  };
}

describe("session recorder: narrative overrides", () => {
  it("hides, shows and moves a line, as the line's author or the DM", async () => {
    const { store, recorder } = setup();
    const ana = recorder("ana");
    const dm = recorder(DM);
    const a = await ana.record({ kind: "note", text: "Ana taunts the goblin" });
    const b = await dm.record({ kind: "note", text: "The bridge collapses" });
    await ana.hide(a);
    let ids = foldSession(store.items("2026-10-08"), { dmUid: DM }).map((e) => e.id);
    expect(ids).toEqual([b]);
    await ana.show(a);
    await dm.move(b, null);
    ids = foldSession(store.items("2026-10-08"), { dmUid: DM }).map((e) => e.id);
    expect(ids).toEqual([b, a]);
    expect(store.items("2026-10-08").at(-1)).toMatchObject({
      type: "move",
      target: b,
      after: null,
      by: DM,
    });
  });

  it("an override names its session, so a fix after the game lands where the line is", async () => {
    const { store, recorder, nextDay } = setup();
    const dm = recorder(DM);
    const line = await dm.record({ kind: "note", text: "Yesterday's line" });
    nextDay();
    await dm.record({ kind: "note", text: "Tonight's first line" });
    await dm.hide(line, { sessionId: "2026-10-08" });
    await dm.correct(
      line,
      { kind: "note", text: "Yesterday's line, fixed" },
      { sessionId: "2026-10-08" }
    );
    expect(store.items("2026-10-09")).toHaveLength(1);
    const yesterday = foldSession(
      store.items("2026-10-08"),
      { dmUid: DM },
      {
        includeHidden: true,
      }
    );
    expect(yesterday[0]).toMatchObject({
      hidden: true,
      corrected: true,
      event: { text: "Yesterday's line, fixed" },
    });
  });
});
