/**
 * A rider landing on the character (SRD 5.2.1 stat blocks): a wight's Life Drain
 * lowers the Hit Point maximum by the damage taken, a purple worm's swallow leaves
 * you Blinded and Restrained, a giant's shove or a Speed loss only reads in the log
 * (the app moves no token). `takeRider` applies the rider's sheet events and its log
 * line; one undo takes back exactly that, the log line first.
 */
import { afterEach, describe, expect, it } from "vitest";

import { effectiveMaxHp } from "@/lib/aggregate-character";
import type { RiderEffect } from "@/lib/activities";
import { srdText } from "@/lib/loc-text";
import { useCharacterStore } from "@/stores/characterStore";
import { makeCharacterDoc } from "./_helpers";

function load(): void {
  const doc = makeCharacterDoc(
    { classId: "fighter", level: 5 },
    { hp: { current: 30, temp: 0 } }
  );
  useCharacterStore.setState({
    character: doc,
    readonly: false,
    loading: false,
    error: null,
  });
}

const live = () => {
  const doc = useCharacterStore.getState().character;
  if (!doc) throw new Error("no character");
  return doc;
};
const lastEvent = () => live().session.logEntries.at(-1)?.event;
const wight = srdText("monster", "wight", "name");

afterEach(() => useCharacterStore.setState({ character: null }));

describe("takeRider", () => {
  it("Life Drain: the maximum drops by the damage taken; undo restores it and the log", () => {
    load();
    const max = effectiveMaxHp(live().character, live().session);
    const drain: RiderEffect = { kind: "hp-max-reduction" };
    const lines = live().session.logEntries.length;
    const undo = useCharacterStore.getState().takeRider(drain, { damageTaken: 7 }, wight);
    expect(live().session.hpMaxReduction).toBe(7);
    expect(effectiveMaxHp(live().character, live().session)).toBe(max - 7);
    expect(lastEvent()).toEqual({ kind: "rider-taken", rider: drain, source: wight });
    undo?.();
    expect(live().session.hpMaxReduction ?? 0).toBe(0);
    expect(live().session.logEntries).toHaveLength(lines);
  });

  it("a swallow: Blinded and Restrained; undo ends both", () => {
    load();
    const undo = useCharacterStore
      .getState()
      .takeRider({ kind: "swallow" }, { damageTaken: 0 });
    expect(live().session.conditions).toEqual(
      expect.arrayContaining(["blinded", "restrained"])
    );
    undo?.();
    expect(live().session.conditions).not.toContain("blinded");
    expect(live().session.conditions).not.toContain("restrained");
  });

  it("a shove changes nothing on the sheet but its log line, which the undo removes", () => {
    load();
    const lines = live().session.logEntries.length;
    const shove: RiderEffect = { kind: "forced-movement", direction: "push", feet: 10 };
    const undo = useCharacterStore.getState().takeRider(shove, { damageTaken: 0 });
    expect(lastEvent()).toEqual({ kind: "rider-taken", rider: shove });
    undo?.();
    expect(live().session.logEntries).toHaveLength(lines);
  });

  it("a read-only sheet takes nothing", () => {
    load();
    useCharacterStore.setState({ readonly: true });
    expect(
      useCharacterStore.getState().takeRider({ kind: "swallow" }, { damageTaken: 0 })
    ).toBeNull();
    expect(live().session.conditions).not.toContain("blinded");
  });
});
