/**
 * Preparing a spell (the Play screen's «Gestisci incantesimi», the cockpit's Spells
 * tab): a spell the character knows flips prepared; a spell a subclass always
 * prepares can't be unprepared.
 */
import { describe, expect, it } from "vitest";
import { togglePrepared } from "@/lib/play/spell-prep";
import { makeCharacterDoc } from "./_helpers";

const cleric = makeCharacterDoc({
  classId: "cleric",
  level: 3,
  spells: [
    { srdId: "bless", prepared: true },
    { srdId: "cure-wounds", prepared: false },
    { srdId: "aid", prepared: true, alwaysPrepared: true },
  ],
});

const prepared = (doc: ReturnType<typeof togglePrepared>) =>
  doc?.character.spells.map((s) => ("prepared" in s ? s.prepared : null));

describe("togglePrepared", () => {
  it("prepares a spell that wasn't", () => {
    expect(prepared(togglePrepared(cleric, 1))).toEqual([true, true, true]);
  });

  it("unprepares a prepared spell", () => {
    expect(prepared(togglePrepared(cleric, 0))).toEqual([false, false, true]);
  });

  it("leaves an always-prepared spell alone", () => {
    expect(togglePrepared(cleric, 2)).toBeNull();
  });

  it("is null for a spell that isn't there", () => {
    expect(togglePrepared(cleric, 9)).toBeNull();
  });
});
