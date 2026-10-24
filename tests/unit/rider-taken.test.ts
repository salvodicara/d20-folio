/**
 * A rider landing on the character (a wight's Life Drain, a purple worm's swallow)
 * as sheet events: the Hit Point maximum through `set-hp-max-reduction` (the same
 * path Harm uses), the swallow's Blinded and Restrained through `add-condition`.
 * Each is a play-log entry, so an undo takes it back; the push and the Speed loss
 * are table facts and change nothing on the sheet. Its log line says what landed.
 */
import { describe, expect, it } from "vitest";
import type { RiderEffect } from "@/lib/activities";
import { effectiveMaxHp } from "@/lib/aggregate-character";
import { effectiveSessionConditions } from "@/lib/effective-conditions";
import { foldPlayLog, type PlayLogEntry } from "@/lib/play/play-log";
import {
  riderTakenEvents,
  riderTakenLog,
  swallowEndEvents,
} from "@/lib/play/rider-taken";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

const DRAIN: RiderEffect = { kind: "hp-max-reduction" };
const DICE_DRAIN: RiderEffect = { kind: "hp-max-reduction", dice: { dice: "1d10" } };
const SWALLOW: RiderEffect = {
  kind: "swallow",
  damage: { dice: { dice: "5d6" }, types: ["acid"] },
};

function fighter(): CharacterDoc {
  return makeCharacterDoc({ classId: "fighter", level: 5 });
}

const entriesOf = (events: ReturnType<typeof riderTakenEvents>): PlayLogEntry[] =>
  events.map((event, i) => ({ id: `e${i}`, seq: i, actor: "dm", event }));

describe("a drain on the character", () => {
  it("adds the damage taken to the running reduction, through the play log", () => {
    const doc = fighter();
    const full = effectiveMaxHp(doc.character, doc.session);
    const once = foldPlayLog(
      doc,
      entriesOf(riderTakenEvents(doc, DRAIN, { damageTaken: 7 }))
    );
    expect(once.session.hpMaxReduction).toBe(7);
    expect(effectiveMaxHp(once.character, once.session)).toBe(full - 7);
    // A second drain stacks on the first.
    const twice = foldPlayLog(
      once,
      entriesOf(riderTakenEvents(once, DRAIN, { damageTaken: 3 }))
    );
    expect(twice.session.hpMaxReduction).toBe(10);
  });

  it("a dice drain takes the rolled total, not the damage", () => {
    const doc = fighter();
    expect(riderTakenEvents(doc, DICE_DRAIN, { damageTaken: 9, rolled: 4 })).toEqual([
      { kind: "set-hp-max-reduction", total: 4 },
    ]);
  });

  it("no damage taken, no event", () => {
    expect(riderTakenEvents(fighter(), DRAIN, { damageTaken: 0 })).toEqual([]);
  });

  it("undo gives the maximum back", () => {
    const doc = fighter();
    const entries = entriesOf(riderTakenEvents(doc, DRAIN, { damageTaken: 7 }));
    const undone = foldPlayLog(doc, [
      ...entries,
      { id: "u", seq: 9, actor: "dm", undo: "e0" },
    ]);
    expect(undone.session.hpMaxReduction ?? 0).toBe(0);
  });
});

describe("a swallow on the character", () => {
  it("gives Blinded and Restrained, each a play-log entry an undo takes back", () => {
    const doc = fighter();
    const events = riderTakenEvents(doc, SWALLOW, { damageTaken: 0 });
    expect(events).toEqual([
      { kind: "add-condition", condition: "blinded" },
      { kind: "add-condition", condition: "restrained" },
    ]);
    const swallowed = foldPlayLog(doc, entriesOf(events));
    expect(effectiveSessionConditions(swallowed.session)).toEqual(
      expect.arrayContaining(["blinded", "restrained"])
    );
    const undone = foldPlayLog(doc, [
      ...entriesOf(events),
      { id: "u0", seq: 8, actor: "dm", undo: "e0" },
      { id: "u1", seq: 9, actor: "dm", undo: "e1" },
    ]);
    expect(effectiveSessionConditions(undone.session)).not.toContain("blinded");
    expect(effectiveSessionConditions(undone.session)).not.toContain("restrained");
  });

  it("a condition already on is not given twice", () => {
    const doc = fighter();
    doc.session.conditions = ["blinded"];
    expect(riderTakenEvents(doc, SWALLOW, { damageTaken: 0 })).toEqual([
      { kind: "add-condition", condition: "restrained" },
    ]);
  });

  it("getting out ends the swallow's conditions", () => {
    const doc = fighter();
    const swallowed = foldPlayLog(
      doc,
      entriesOf(riderTakenEvents(doc, SWALLOW, { damageTaken: 0 }))
    );
    expect(swallowEndEvents(swallowed)).toEqual([
      { kind: "remove-condition", condition: "blinded" },
      { kind: "remove-condition", condition: "restrained" },
    ]);
    expect(swallowEndEvents(doc)).toEqual([]);
  });

  it("its log line carries the Total Cover and the recurring acid as facts", () => {
    expect(riderTakenLog(SWALLOW, { custom: "Swallow" })).toEqual({
      kind: "rider-taken",
      rider: SWALLOW,
      source: { custom: "Swallow" },
    });
  });
});

describe("a push and a Speed loss", () => {
  it("are table facts: no sheet event, only the log line", () => {
    const push: RiderEffect = { kind: "forced-movement", direction: "push", feet: 15 };
    expect(riderTakenEvents(fighter(), push, { damageTaken: 0 })).toEqual([]);
    expect(riderTakenLog(push)).toEqual({ kind: "rider-taken", rider: push });
  });
});
