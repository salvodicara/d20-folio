/**
 * #1403 — a build save the rules refused as a revision conflict (another device saved
 * first, typically an offline edit sent on reconnect) is kept as a rescue copy instead
 * of being dropped. Only a proven conflict keeps one: a server-confirmed sheet at or
 * past the refused generation. Exactly one notice per refusal.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createConflictRescue,
  type ConflictNotice,
} from "@/features/character/conflict-rescue";
import type { CharacterDoc } from "@/types/character";

const sheet = (revision: number, quote = `edit ${revision}`): CharacterDoc =>
  ({ id: "c1", revision, character: { quote }, session: {} }) as unknown as CharacterDoc;

let kept: CharacterDoc[];
let dropped: number[];
let notices: ConflictNotice[];
let keepResult: number | null;

function make() {
  return createConflictRescue({
    keep: (payload) => {
      kept.push(payload);
      return Promise.resolve(keepResult);
    },
    drop: (savedAt) => dropped.push(savedAt),
    notify: (notice) => notices.push(notice),
  });
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  kept = [];
  dropped = [];
  notices = [];
  keepResult = 111;
});

describe("a refused build save", () => {
  it("refused, then a server sheet at that generation: kept, one «kept» notice", async () => {
    const r = make();
    const a = sheet(5);
    r.sent(a);
    r.refused(a);
    r.snapshot(sheet(5, "other device"), false);
    await flush();
    expect(kept).toEqual([a]);
    expect(notices).toEqual(["kept"]);
  });

  it("the server sheet first, the refusal after: kept the same way", async () => {
    const r = make();
    const a = sheet(5);
    r.sent(a);
    r.snapshot(sheet(6, "other device"), false);
    r.refused(a);
    await flush();
    expect(kept).toEqual([a]);
    expect(notices).toEqual(["kept"]);
  });

  it("a server sheet still below the refused generation is no conflict: nothing kept", async () => {
    const r = make();
    const a = sheet(5);
    r.sent(a);
    r.refused(a);
    r.snapshot(sheet(4), false);
    await flush();
    expect(kept).toEqual([]);
    expect(notices).toEqual(["not-saved"]);
  });

  it("the sheet is gone: nothing kept", async () => {
    const r = make();
    const a = sheet(5);
    r.sent(a);
    r.refused(a);
    r.snapshot(null, false);
    await flush();
    expect(kept).toEqual([]);
    expect(notices).toEqual(["not-saved"]);
  });

  it("the listener is refused too (signed out, access gone): nothing kept", async () => {
    const r = make();
    const a = sheet(5);
    r.sent(a);
    r.refused(a);
    r.listenerFailed();
    await flush();
    expect(kept).toEqual([]);
    expect(notices).toEqual(["not-saved"]);
  });

  it("a snapshot still carrying queued writes decides nothing yet", async () => {
    const r = make();
    const a = sheet(5);
    r.sent(a);
    r.refused(a);
    r.snapshot(sheet(6), true);
    await flush();
    expect(kept).toEqual([]);
    expect(notices).toEqual([]);
  });

  it("a copy already on the device is not overwritten: «not saved»", async () => {
    keepResult = null;
    const r = make();
    const a = sheet(5);
    r.sent(a);
    r.refused(a);
    r.snapshot(sheet(5), false);
    await flush();
    expect(notices).toEqual(["not-saved"]);
  });
});

describe("several saves queued offline", () => {
  it("both refused: the newest refused edit is the copy", async () => {
    const r = make();
    const a = sheet(5);
    const b = sheet(6);
    r.sent(a);
    r.sent(b);
    r.refused(a);
    r.refused(b);
    r.snapshot(sheet(7, "other device"), false);
    await flush();
    expect(kept).toEqual([b]);
    expect(notices).toEqual(["kept"]);
  });

  it("the first refused, a later one (carrying the same edit) lands: nothing kept, no notice", async () => {
    const r = make();
    const a = sheet(5);
    const b = sheet(6);
    r.sent(a);
    r.sent(b);
    r.refused(a);
    r.landed(b);
    r.snapshot(sheet(6), false);
    await flush();
    expect(kept).toEqual([]);
    expect(notices).toEqual([]);
  });

  it("a carrier that lands after the copy was kept drops that copy", async () => {
    const r = make();
    const a = sheet(5);
    const b = sheet(6);
    r.sent(a);
    r.sent(b);
    r.refused(a);
    r.snapshot(sheet(6), false);
    await flush();
    r.landed(b);
    expect(dropped).toEqual([111]);
  });

  it("an edit sent AFTER the refusal does not carry the refused edit: the copy stays", async () => {
    const r = make();
    const a = sheet(5);
    r.sent(a);
    r.refused(a);
    r.snapshot(sheet(5), false);
    await flush();
    const later = sheet(6, "new edit on the server's sheet");
    r.sent(later);
    r.landed(later);
    expect(dropped).toEqual([]);
  });
});

describe("a refusal that cannot be kept", () => {
  it("the copy cannot be built: «not saved»", async () => {
    const r = createConflictRescue({
      keep: () => Promise.reject(new Error("chunk failed")),
      drop: vi.fn(),
      notify: (notice) => notices.push(notice),
    });
    const a = sheet(5);
    r.sent(a);
    r.refused(a);
    r.snapshot(sheet(5), false);
    await flush();
    expect(notices).toEqual(["not-saved"]);
  });
});
