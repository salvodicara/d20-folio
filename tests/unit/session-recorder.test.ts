import { describe, expect, it } from "vitest";

import {
  SESSION_GAP_MS,
  createMemorySessionLogStore,
  createSessionRecorder,
  nextSessionId,
} from "@/lib/session-log";
import type { LogItem } from "@/lib/session-log";

const evening = new Date(2026, 9, 8, 20, 0);
const later = (ms: number): Date => new Date(evening.getTime() + ms);

describe("nextSessionId", () => {
  it("opens a session named after the local day when none exists", () => {
    expect(nextSessionId(null, evening)).toBe("2026-10-08");
  });

  it("keeps the open session while the table is active, even past midnight", () => {
    const head = { id: "2026-10-08", lastAt: evening.getTime() };
    expect(nextSessionId(head, later(SESSION_GAP_MS - 1))).toBe("2026-10-08");
  });

  it("opens a new session after a long pause, numbering a second one on the same day", () => {
    const morning = new Date(2026, 9, 8, 9, 0);
    expect(nextSessionId({ id: "2026-10-08", lastAt: morning.getTime() }, evening)).toBe(
      "2026-10-08-2"
    );
    expect(
      nextSessionId({ id: "2026-10-08-2", lastAt: morning.getTime() }, evening)
    ).toBe("2026-10-08-3");
    const nextWeek = new Date(2026, 9, 15, 20, 0);
    expect(nextSessionId({ id: "2026-10-08", lastAt: evening.getTime() }, nextWeek)).toBe(
      "2026-10-15"
    );
  });
});

describe("createSessionRecorder", () => {
  function setup(start = evening) {
    const store = createMemorySessionLogStore();
    let now = start;
    let n = 0;
    const recorder = (uid: string) =>
      createSessionRecorder({ store, uid, now: () => now, newId: () => `id-${++n}` });
    return {
      store,
      recorder,
      tick: (ms: number) => (now = new Date(now.getTime() + ms)),
    };
  }

  it("records events, corrections and retractions as appended items of one session", async () => {
    const { store, recorder } = setup();
    const ana = recorder("ana");
    const first = await ana.record({ kind: "damage", amount: 3 });
    await ana.correct(first, { kind: "damage", amount: 4 });
    await ana.retract(first);

    const items: LogItem[] = store.items("2026-10-08");
    expect(items.map((i) => [i.type, i.by, "target" in i ? i.target : null])).toEqual([
      ["event", "ana", null],
      ["correct", "ana", first],
      ["retract", "ana", first],
    ]);
  });

  it("puts two devices in the same session and starts a new one after a long pause", async () => {
    const { store, recorder, tick } = setup();
    await recorder("ana").record({ kind: "heal", amount: 5 });
    await recorder("dm").record({ kind: "round-start", round: 1 });
    tick(SESSION_GAP_MS + 1);
    await recorder("ana").record({ kind: "rest", rest: "long" });

    expect(store.items("2026-10-08").map((i) => i.by)).toEqual(["ana", "dm"]);
    expect(store.items("2026-10-09").map((i) => i.by)).toEqual(["ana"]);
  });
});
