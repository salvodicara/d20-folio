/**
 * chronicle-feed — what the live encounter adds to a session-log line: the HP readout
 * (which follows the monster card's `showExact` rule: the DM always, players only for
 * allies, revealed monsters and PCs) and the DM's engine undo on a monster's HP or
 * condition line. The log itself carries no HP totals.
 */
import { describe, expect, it } from "vitest";

import { feedHp, undoableBeatId } from "@/features/campaigns/chronicle-feed";
import type { FeedLine } from "@/lib/session-log";
import type { EncounterMonster, EncounterState } from "@/types/campaign";

const monster = (
  id: string,
  extra: Partial<EncounterMonster> = {}
): EncounterMonster => ({
  kind: "monster",
  id,
  name: id,
  ac: 12,
  initiative: 10,
  conditions: [],
  hp: { current: 4, temp: 0, max: 12 },
  ...extra,
});

const encounter: EncounterState = {
  combatants: [
    monster("monster-1"),
    monster("monster-2", { revealed: true }),
    monster("monster-3", { side: "ally" }),
  ],
  nextMonsterOrdinal: 4,
  round: 1,
  currentCombatantId: null,
  epoch: 5,
  status: "active",
  events: [
    {
      id: "0",
      round: 1,
      kind: "hp-damage",
      targetId: "monster-1",
      amount: 8,
      current: 4,
      max: 12,
    },
    {
      id: "1",
      round: 1,
      kind: "hp-damage",
      targetId: "monster-2",
      amount: 8,
      current: 4,
      max: 12,
    },
    {
      id: "2",
      round: 1,
      kind: "hp-heal",
      targetId: "monster-3",
      amount: 2,
      current: 6,
      max: 12,
    },
    {
      id: "3",
      round: 1,
      kind: "hp-damage",
      targetId: "pc-ana",
      amount: 3,
      current: 9,
      max: 12,
    },
    {
      id: "4",
      round: 1,
      kind: "condition-gain",
      targetId: "monster-1",
      conditionId: "prone",
    },
    { id: "5", round: 1, kind: "down", targetId: "monster-1" },
  ],
};

const line = (id: string): FeedLine => ({
  id,
  by: "dm",
  event: { kind: "damage", amount: 8 },
  logged: { kind: "damage", amount: 8 },
});

describe("feedHp", () => {
  it("the DM sees every readout, a concealed enemy's included", () => {
    expect(feedHp(line("enc:5:ev:0"), encounter, true)).toEqual({ current: 4, max: 12 });
  });

  it("a player never sees a concealed enemy's HP", () => {
    expect(feedHp(line("enc:5:ev:0"), encounter, false)).toBeNull();
  });

  it("a player sees a revealed monster, an ally and a PC", () => {
    expect(feedHp(line("enc:5:ev:1"), encounter, false)).toEqual({ current: 4, max: 12 });
    expect(feedHp(line("enc:5:ev:2"), encounter, false)).toEqual({ current: 6, max: 12 });
    expect(feedHp(line("enc:5:ev:3"), encounter, false)).toEqual({ current: 9, max: 12 });
  });

  it("finds the beat of a line recorded under a later generation (a reused beat id)", () => {
    expect(feedHp(line("enc:5:ev:0:g2"), encounter, true)).toEqual({
      current: 4,
      max: 12,
    });
    expect(undoableBeatId(line("enc:5:ev:0:g3"), encounter)).toBe("0");
  });

  it("no readout for a line the encounter does not hold (a sheet line, another fight)", () => {
    expect(feedHp(line("pc:char:1"), encounter, true)).toBeNull();
    expect(feedHp(line("enc:4:ev:0"), encounter, true)).toBeNull();
  });
});

describe("undoableBeatId", () => {
  it("is the beat of a monster HP or condition line", () => {
    expect(undoableBeatId(line("enc:5:ev:0"), encounter)).toBe("0");
    expect(undoableBeatId(line("enc:5:ev:4"), encounter)).toBe("4");
  });

  it("is null for a PC line, a down line, or a line the encounter no longer holds", () => {
    expect(undoableBeatId(line("enc:5:ev:3"), encounter)).toBeNull();
    expect(undoableBeatId(line("enc:5:ev:5"), encounter)).toBeNull();
    expect(undoableBeatId(line("enc:5:ev:9"), encounter)).toBeNull();
    expect(undoableBeatId(line("pc:char:1"), encounter)).toBeNull();
  });
});
