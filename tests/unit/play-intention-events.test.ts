/**
 * Phase 3a step 3 (docs/architecture/play-log.md): damage, healing and temporary HP
 * as intention events. An absolute `set-hp` pins the value it was given, so undoing
 * an earlier entry and replaying the log would keep a stale number. An intention
 * (`take-damage 5`, `heal 3`) composes: the replay recomputes from wherever the
 * sheet now is. The transitions are the ones the store already uses.
 */

import { describe, expect, it } from "vitest";

import { effectiveMaxHp } from "@/lib/aggregate-character";
import { takeDamage } from "@/lib/play/damage";
import { foldPlayLog, type PlayLogEntry } from "@/lib/play/play-log";
import { applySheetEvent, type SheetEvent } from "@/lib/play/sheet-events";
import { setHp, setTempHp } from "@/lib/play/vitals";
import { makeCharacterDoc } from "./_helpers";
import type { CharacterDoc } from "@/types/character";

function start(hp = { current: 20, temp: 0 }): CharacterDoc {
  return makeCharacterDoc({ classId: "fighter", level: 5 }, { hp });
}

function log(events: SheetEvent[]): PlayLogEntry[] {
  return events.map((event, i) => ({ id: `e${i}`, seq: i, actor: "player", event }));
}

describe("intention events", () => {
  it("take-damage is the store's damage transition", () => {
    const doc = start({ current: 20, temp: 4 });
    expect(applySheetEvent(doc, { kind: "take-damage", amount: 7 })?.session).toEqual(
      takeDamage(doc, 7)?.session
    );
    expect(
      applySheetEvent(doc, { kind: "take-damage", amount: 7, crit: true })?.session
    ).toEqual(takeDamage(doc, 7, { crit: true })?.session);
  });

  it("heal adds to the current HP, never past the maximum", () => {
    const doc = start();
    const max = effectiveMaxHp(doc.character, doc.session);
    expect(applySheetEvent(doc, { kind: "heal", amount: 3 })?.session).toEqual(
      setHp(doc, 23)
    );
    expect(applySheetEvent(doc, { kind: "heal", amount: 999 })?.session.hp.current).toBe(
      max
    );
  });

  it("heal off 0 resets the death saves, like the store's heal", () => {
    const doc = start({ current: 0, temp: 0 });
    const dying = { ...doc, session: { ...doc.session, deathSucc: 1, deathFail: 2 } };
    const healed = applySheetEvent(dying, { kind: "heal", amount: 5 });
    expect(healed?.session).toEqual(setHp(dying, 5));
    expect(healed?.session).toMatchObject({ deathSucc: 0, deathFail: 0 });
  });

  it("heal changes nothing at full HP or on a fallen character", () => {
    const doc = start();
    const max = effectiveMaxHp(doc.character, doc.session);
    const full = { ...doc, session: { ...doc.session, hp: { current: max, temp: 0 } } };
    expect(applySheetEvent(full, { kind: "heal", amount: 4 })).toBeNull();
    expect(
      applySheetEvent({ ...doc, status: "dead" }, { kind: "heal", amount: 4 })
    ).toBeNull();
  });

  it("gain-temp-hp keeps the larger pool: temporary HP never stack", () => {
    const doc = start({ current: 20, temp: 5 });
    expect(applySheetEvent(doc, { kind: "gain-temp-hp", amount: 8 })?.session).toEqual(
      setTempHp(doc, 8)
    );
    expect(applySheetEvent(doc, { kind: "gain-temp-hp", amount: 3 })).toBeNull();
  });

  it("undoing an early hit replays the later ones from the new HP", () => {
    const doc = start();
    const entries = log([
      { kind: "take-damage", amount: 5 },
      { kind: "heal", amount: 2 },
      { kind: "take-damage", amount: 4 },
    ]);
    // 20 → 15 → 17 → 13; without the first hit: 20 → 22 → 18.
    expect(foldPlayLog(doc, entries).session.hp.current).toBe(13);
    const undone = foldPlayLog(doc, [
      ...entries,
      { id: "u", seq: 9, actor: "player", undo: "e0" },
    ]);
    expect(undone.session.hp.current).toBe(18);
  });
});
