/**
 * The play-log sink: the sheet forwards exactly its own appends and undos (never a
 * clear, a cap eviction or a read-only view), and a failing sink never breaks the sheet.
 */
import { afterEach, describe, expect, it } from "vitest";

import { MOCK_CHARACTER } from "@/lib/mock";
import { setPlayLogSink, useCharacterStore } from "@/stores/characterStore";

function load(readonly: boolean): void {
  const doc = structuredClone(MOCK_CHARACTER);
  doc.session.logEntries = [];
  useCharacterStore.setState({ character: doc, loading: false, error: null, readonly });
}

function capture(): string[] {
  const calls: string[] = [];
  setPlayLogSink({
    added: (characterId, entry) => calls.push(`+${characterId}:${entry.event.kind}`),
    removed: (characterId, entryId) => calls.push(`-${characterId}:${entryId}`),
    corrected: (characterId, entry) => calls.push(`~${characterId}:${entry.event.kind}`),
  });
  return calls;
}

afterEach(() => setPlayLogSink(null));

describe("play-log sink", () => {
  it("forwards the owner's appends and undos, not a clear", () => {
    load(false);
    const calls = capture();
    const { logEvent, removeLogEntry, clearLog } = useCharacterStore.getState();
    const id = logEvent({ kind: "rest", restKind: "short" });
    removeLogEntry(id);
    logEvent({ kind: "rest", restKind: "long" });
    clearLog();
    const charId = MOCK_CHARACTER.id;
    expect(calls).toEqual([`+${charId}:rest`, `-${charId}:${id}`, `+${charId}:rest`]);
  });

  it("forwards nothing from a read-only sheet", () => {
    load(true);
    const calls = capture();
    useCharacterStore.getState().logEvent({ kind: "rest", restKind: "short" });
    expect(calls).toEqual([]);
  });

  it("keeps the sheet working when the sink throws", () => {
    load(false);
    setPlayLogSink({
      added: () => {
        throw new Error("offline");
      },
      removed: () => {
        throw new Error("offline");
      },
      corrected: () => {
        throw new Error("offline");
      },
    });
    const id = useCharacterStore.getState().logEvent({ kind: "rest", restKind: "short" });
    expect(id).not.toBeNull();
    expect(useCharacterStore.getState().character?.session.logEntries).toHaveLength(1);
  });

  it("forwards an amended line as a correction, and its inverse as another", () => {
    load(false);
    const calls = capture();
    const { logEvent, amendLogEntry } = useCharacterStore.getState();
    const id = logEvent({
      kind: "action-use",
      action: { custom: "Bless" },
      effect: "spell-cast",
      slot: "action",
    });
    if (!id) throw new Error("missing log id");
    const restore = amendLogEntry(id, {
      kind: "action-use",
      action: { custom: "Bless" },
      effect: "spell-cast",
      slot: "action",
      targets: ["pc-bo"],
    });
    const line = () =>
      useCharacterStore.getState().character?.session.logEntries.find((e) => e.id === id);
    expect(line()?.event).toMatchObject({ targets: ["pc-bo"] });
    restore?.();
    expect(line()?.event).not.toHaveProperty("targets");
    const charId = MOCK_CHARACTER.id;
    expect(calls).toEqual([
      `+${charId}:action-use`,
      `~${charId}:action-use`,
      `~${charId}:action-use`,
    ]);
  });
});
