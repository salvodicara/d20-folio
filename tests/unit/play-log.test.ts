/**
 * The play log as the record (re-foundation phase 3a, docs/architecture/play-log.md):
 * a character's play state is the fold of its entries over a checkpoint. Undo, redo
 * and corrections are entries too, so they survive a reload and reach every device.
 * The cases use the real sheet transitions (`applySheetEvent`) on a real character.
 */

import { describe, expect, it } from "vitest";

import { effectiveEvents, foldPlayLog, type PlayLogEntry } from "@/lib/play/play-log";
import { applySheetEvent, type SheetEvent } from "@/lib/play/sheet-events";
import { makeCharacterDoc } from "./_helpers";
import type { CharacterDoc } from "@/types/character";

function checkpoint(): CharacterDoc {
  return makeCharacterDoc(
    { classId: "wizard", level: 5 },
    { hp: { current: 20, temp: 0 }, spellSlots: { "1": { used: 0 }, "2": { used: 0 } } }
  );
}

let seq = 0;
function entry(
  body:
    | { event: SheetEvent }
    | { undo: string }
    | { redo: string }
    | { correct: string; event: SheetEvent },
  id = `e${++seq}`
): PlayLogEntry {
  return { id, seq, actor: "player", ...body };
}

/** The sheet after applying events one by one, as the store does today. */
function sequential(doc: CharacterDoc, events: SheetEvent[]): CharacterDoc {
  return events.reduce((d, e) => applySheetEvent(d, e) ?? d, doc);
}

describe("play log fold", () => {
  it("replays the events in order, as the store applies them one by one", () => {
    const events: SheetEvent[] = [
      { kind: "spend-slot", level: 1, pactMagic: false },
      { kind: "add-condition", condition: "poisoned" },
      { kind: "set-hp", current: 12 },
      { kind: "spend-slot", level: 2, pactMagic: false },
    ];
    const doc = checkpoint();
    expect(
      foldPlayLog(
        doc,
        events.map((event) => entry({ event }))
      )
    ).toEqual(sequential(doc, events));
  });

  it("takes an undone entry out and replays the rest", () => {
    const doc = checkpoint();
    const a = entry({ event: { kind: "spend-slot", level: 1, pactMagic: false } });
    const b = entry({ event: { kind: "add-condition", condition: "poisoned" } });
    const folded = foldPlayLog(doc, [a, b, entry({ undo: a.id })]);
    expect(folded.session.spellSlots["1"]?.used ?? 0).toBe(0);
    expect(folded.session.conditions).toContain("poisoned");
  });

  it("puts a redone entry back where it was", () => {
    const doc = checkpoint();
    const a = entry({ event: { kind: "spend-slot", level: 1, pactMagic: false } });
    const b = entry({ event: { kind: "spend-slot", level: 1, pactMagic: false } });
    const undo = entry({ undo: a.id });
    expect(effectiveEvents([a, b, undo, entry({ redo: a.id })]).map((e) => e.id)).toEqual(
      [a.id, b.id]
    );
    expect(
      foldPlayLog(doc, [a, b, undo, entry({ redo: a.id })]).session.spellSlots["1"]?.used
    ).toBe(2);
  });

  it("applies a correction in place of the original event", () => {
    const doc = checkpoint();
    const hp = entry({ event: { kind: "set-hp", current: 5 } });
    const folded = foldPlayLog(doc, [
      hp,
      entry({ event: { kind: "spend-slot", level: 1, pactMagic: false } }),
      entry({ correct: hp.id, event: { kind: "set-hp", current: 15 } }),
    ]);
    expect(folded.session.hp.current).toBe(15);
    expect(folded.session.spellSlots["1"]?.used).toBe(1);
  });

  it("ignores meta entries whose target it does not know", () => {
    const doc = checkpoint();
    const a = entry({ event: { kind: "spend-slot", level: 1, pactMagic: false } });
    expect(
      foldPlayLog(doc, [
        a,
        entry({ undo: "missing" }),
        entry({ correct: "missing", event: { kind: "set-hp", current: 1 } }),
      ])
    ).toEqual(foldPlayLog(doc, [a]));
  });

  it("skips an event that changes nothing and keeps going", () => {
    const doc = checkpoint();
    const folded = foldPlayLog(doc, [
      entry({ event: { kind: "remove-condition", condition: "prone" } }),
      entry({ event: { kind: "spend-slot", level: 1, pactMagic: false } }),
    ]);
    expect(folded.session.spellSlots["1"]?.used).toBe(1);
  });

  it("orders by seq, so the same entries fold the same on every device", () => {
    const doc = checkpoint();
    const entries = [
      entry({ event: { kind: "set-hp", current: 9 } }),
      entry({ event: { kind: "set-hp", current: 3 } }),
      entry({ event: { kind: "add-condition", condition: "prone" } }),
    ];
    const shuffled = [entries[2], entries[0], entries[1]] as PlayLogEntry[];
    expect(foldPlayLog(doc, shuffled)).toEqual(foldPlayLog(doc, entries));
    expect(foldPlayLog(doc, shuffled).session.hp.current).toBe(3);
  });

  it("leaves the checkpoint untouched", () => {
    const doc = checkpoint();
    const before = structuredClone(doc);
    foldPlayLog(doc, [
      entry({ event: { kind: "spend-slot", level: 1, pactMagic: false } }),
    ]);
    expect(doc).toEqual(before);
  });
});
