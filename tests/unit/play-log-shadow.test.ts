/**
 * Phase 3a step 2 (docs/architecture/play-log.md): shadow mode. Next to every sheet
 * event the store applies, the shadow appends a log entry and checks parity: the fold
 * of the log must equal the live character. A write that bypassed the log starts a
 * new checkpoint (counted, so we can see how much still bypasses it). An undo is an
 * entry; where today's snapshot undo and the log's replay disagree, the shadow
 * reports the mismatch instead of hiding it.
 */

import { describe, expect, it } from "vitest";

import { createPlayLogShadow } from "@/lib/play/play-log-shadow";
import { applySheetEvent, type SheetEvent } from "@/lib/play/sheet-events";
import { makeCharacterDoc } from "./_helpers";
import type { CharacterDoc, LogEntry } from "@/types/character";

const NARRATIVE: LogEntry = {
  id: "line-1",
  ts: 0,
  event: { kind: "hp-heal", amount: 2, current: 22, max: 40 },
};

function start(): CharacterDoc {
  return makeCharacterDoc(
    { classId: "wizard", level: 5 },
    { hp: { current: 20, temp: 0 }, spellSlots: { "1": { used: 0 } } }
  );
}

function apply(doc: CharacterDoc, event: SheetEvent): CharacterDoc {
  const next = applySheetEvent(doc, event);
  if (!next) throw new Error("event changed nothing");
  return next;
}

describe("play log shadow", () => {
  it("keeps parity across the events the store applies", () => {
    const shadow = createPlayLogShadow("player");
    let doc = start();
    for (const event of [
      { kind: "spend-slot", level: 1, pactMagic: false },
      { kind: "add-condition", condition: "poisoned" },
      { kind: "set-hp", current: 11 },
    ] satisfies SheetEvent[]) {
      const after = apply(doc, event);
      expect(shadow.record(doc, event, after).parity).toBe(true);
      doc = after;
    }
    expect(shadow.stats()).toMatchObject({ entries: 3, checkpoints: 1, mismatches: 0 });
  });

  it("starts a new checkpoint when a write bypassed the log", () => {
    const shadow = createPlayLogShadow("player");
    const doc = start();
    const a = apply(doc, { kind: "spend-slot", level: 1, pactMagic: false });
    shadow.record(doc, { kind: "spend-slot", level: 1, pactMagic: false }, a);
    // Something outside dispatch changed the sheet (a world commit, a rest dialog…).
    const outside: CharacterDoc = {
      ...a,
      session: { ...a.session, hp: { ...a.session.hp, current: 3 } },
    };
    const b = apply(outside, { kind: "add-condition", condition: "prone" });
    expect(
      shadow.record(outside, { kind: "add-condition", condition: "prone" }, b).parity
    ).toBe(true);
    expect(shadow.stats()).toMatchObject({ checkpoints: 2, mismatches: 0 });
  });

  it("an undo of the last event keeps parity", () => {
    const shadow = createPlayLogShadow("player");
    const doc = start();
    const after = apply(doc, { kind: "spend-slot", level: 1, pactMagic: false });
    const { id } = shadow.record(
      doc,
      { kind: "spend-slot", level: 1, pactMagic: false },
      after
    );
    expect(shadow.undo(id, doc).parity).toBe(true);
  });

  it("reports where a snapshot undo and the log's replay disagree", () => {
    const shadow = createPlayLogShadow("player");
    const doc = start();
    const first = apply(doc, { kind: "set-hp", current: 10 });
    const { id } = shadow.record(doc, { kind: "set-hp", current: 10 }, first);
    const second = apply(first, { kind: "set-hp", current: 5 });
    shadow.record(first, { kind: "set-hp", current: 5 }, second);
    // Today's undo of the FIRST event restores its snapshot (HP 20); the log removes
    // that event and replays the later absolute one (HP 5). The shadow says so.
    const result = shadow.undo(id, doc);
    expect(result.parity).toBe(false);
    expect(shadow.stats().mismatches).toBe(1);
  });

  it("re-checkpoints after a cap so the fold stays short", () => {
    const shadow = createPlayLogShadow("player", { maxEntries: 3 });
    let doc = start();
    for (let i = 0; i < 7; i++) {
      const event: SheetEvent = { kind: "set-hp", current: 19 - i };
      const after = apply(doc, event);
      expect(shadow.record(doc, event, after).parity).toBe(true);
      doc = after;
    }
    expect(shadow.stats().entries).toBeLessThanOrEqual(3);
  });

  it("compares the play state, not the session log's narrative lines", () => {
    const shadow = createPlayLogShadow("player");
    const doc = start();
    const a = apply(doc, { kind: "spend-slot", level: 1, pactMagic: false });
    shadow.record(doc, { kind: "spend-slot", level: 1, pactMagic: false }, a);
    // The store writes the table's narrative line next to the event, outside the log.
    const narrated: CharacterDoc = {
      ...a,
      session: { ...a.session, logEntries: [...a.session.logEntries, NARRATIVE] },
    };
    const b = apply(narrated, { kind: "add-condition", condition: "prone" });
    expect(
      shadow.record(narrated, { kind: "add-condition", condition: "prone" }, b).parity
    ).toBe(true);
    expect(shadow.stats()).toMatchObject({ entries: 2, checkpoints: 1, mismatches: 0 });
  });

  it("undoes through the log when it reproduces the live sheet: only that event goes", () => {
    const shadow = createPlayLogShadow("player");
    const doc = start();
    const slot = { kind: "spend-slot", level: 1, pactMagic: false } satisfies SheetEvent;
    const a = apply(doc, slot);
    const { id } = shadow.record(doc, slot, a);
    const temp = { kind: "set-temp-hp", temp: 5 } satisfies SheetEvent;
    const b = apply(a, temp);
    shadow.record(a, temp, b);
    // Undoing the OLDER event: the slot comes back, the later temp HP stay.
    expect(shadow.undoFrom(b, id)).toEqual(apply(doc, temp));
    expect(shadow.stats()).toMatchObject({ entries: 3, mismatches: 0 });
  });

  it("declines (null, nothing recorded) when the live sheet moved outside the log", () => {
    const shadow = createPlayLogShadow("player");
    const doc = start();
    const slot = { kind: "spend-slot", level: 1, pactMagic: false } satisfies SheetEvent;
    const a = apply(doc, slot);
    const { id } = shadow.record(doc, slot, a);
    const outside: CharacterDoc = {
      ...a,
      session: { ...a.session, hp: { ...a.session.hp, current: 3 } },
    };
    expect(shadow.undoFrom(outside, id)).toBeNull();
    expect(shadow.stats().entries).toBe(1);
  });
});
