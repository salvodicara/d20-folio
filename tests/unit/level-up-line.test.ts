/**
 * A level-up leaves a line (walkthrough 2026-11-12, M2): «Lyra sale al livello 10
 * (Bardo)» in the sheet's log, which the session recorder forwards to the attached
 * campaign's open session (outside a campaign it stays the character's own line, as a
 * solo fight's does). Undoing the level-up takes the line back.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { recordLevelUp } from "@/domains/leveling/level-up-line";
import { MOCK_CHARACTER } from "@/lib/mock";
import { setPlayLogSink, useCharacterStore } from "@/stores/characterStore";

const lines = () =>
  (useCharacterStore.getState().character?.session.logEntries ?? []).map((e) => e.event);

beforeEach(() => {
  const doc = structuredClone(MOCK_CHARACTER);
  doc.session.logEntries = [];
  useCharacterStore.setState({
    character: doc,
    loading: false,
    error: null,
    readonly: false,
  });
});

describe("recordLevelUp", () => {
  it("logs the level-up, and the session recorder hears it", () => {
    const heard: string[] = [];
    setPlayLogSink({
      added: (_id, entry) => heard.push(entry.event.kind),
      removed: () => {},
      corrected: () => {},
    });
    recordLevelUp({ from: 9, to: 10, classId: "bard" });
    setPlayLogSink(null);
    expect(lines()).toEqual([{ kind: "level-up", from: 9, to: 10, classId: "bard" }]);
    expect(heard).toEqual(["level-up"]);
  });

  it("its undo takes the line back, and tells the recorder", () => {
    const removed: string[] = [];
    setPlayLogSink({
      added: () => {},
      removed: (_c, id) => removed.push(id),
      corrected: () => {},
    });
    const undo = recordLevelUp({ from: 9, to: 10, classId: "bard" });
    undo();
    setPlayLogSink(null);
    expect(lines()).toEqual([]);
    expect(removed).toHaveLength(1);
  });
});
