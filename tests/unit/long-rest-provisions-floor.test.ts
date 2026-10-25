/**
 * SRD 5.2.1 Dehydration / Malnutrition: the Exhaustion levels thirst and hunger add
 * "can't be removed until the creature drinks / eats a full day's ration". A Long Rest
 * still removes the other levels, never those (`longRestExhaustionFloor`).
 */
import { describe, expect, it } from "vitest";

import { longRestCharacter } from "@/lib/play/rests";
import { makeCharacterDoc } from "./_helpers";

const tired = (exhaustion: number, provisions?: { thirst?: number; hunger?: number }) =>
  makeCharacterDoc(
    { classId: "fighter", level: 3 },
    {
      exhaustion,
      ...(provisions ? { provisions } : {}),
    }
  );

describe("a Long Rest and Exhaustion owed to thirst and hunger", () => {
  it("removes a level as usual when nothing is owed", () => {
    expect(longRestCharacter(tired(2)).session.exhaustion).toBe(1);
  });

  it("can't go below the levels thirst and hunger added", () => {
    expect(longRestCharacter(tired(2, { thirst: 1, hunger: 1 })).session.exhaustion).toBe(
      2
    );
    expect(longRestCharacter(tired(3, { hunger: 1 })).session.exhaustion).toBe(2);
  });
});
