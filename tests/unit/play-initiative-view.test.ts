/**
 * The Play screen's «Iniziativa» rows (approved prototype x-play, `.ir`): one line per
 * turn with the initiative, the name (yours marked), the one whose turn it is and the
 * next, and on the right your own Hit Points or how the others look. A creature never
 * shows a number.
 */
import { describe, expect, it } from "vitest";
import type { FightRow } from "@/domains/combat/fight-rows-view";
import { playInitiativeRows } from "@/domains/play/play-initiative-view";

function row(
  over: Partial<FightRow> & Pick<FightRow, "ids" | "kind" | "name">
): FightRow {
  return {
    count: 1,
    initiative: 10,
    current: false,
    mustRoll: false,
    hp: null,
    bands: [],
    chips: [],
    art: null,
    ...over,
  };
}

const rows: FightRow[] = [
  row({
    ids: ["pc-kaela"],
    kind: "pc",
    name: "Kaela",
    initiative: 18,
    hp: { current: 9, max: 30, temp: 0 },
  }),
  row({
    ids: ["pc-me"],
    kind: "pc",
    name: "Selene",
    initiative: 15,
    current: true,
    hp: { current: 31, max: 38, temp: 5 },
  }),
  row({
    ids: ["m-1", "m-2", "m-3"],
    kind: "monster",
    name: "Goblin",
    count: 3,
    initiative: 12,
    bands: [
      { band: "healthy", count: 2 },
      { band: "bloodied", count: 1 },
    ],
  }),
  row({
    ids: ["pc-brann"],
    kind: "pc",
    name: "Brann",
    initiative: 9,
    hp: { current: 40, max: 40, temp: 0 },
  }),
];

describe("playInitiativeRows", () => {
  const view = playInitiativeRows(rows, "pc-me");

  it("keeps the turn order, each line with its initiative and name", () => {
    expect(view.map((r) => [r.initiative, r.name, r.count])).toEqual([
      [18, "Kaela", 1],
      [15, "Selene", 1],
      [12, "Goblin", 3],
      [9, "Brann", 1],
    ]);
  });

  it("marks yours, the one whose turn it is, and the next", () => {
    expect(view.map((r) => [r.mine, r.current, r.next])).toEqual([
      [false, false, false],
      [true, true, false],
      [false, false, true],
      [false, false, false],
    ]);
  });

  it("shows your own Hit Points, and how the others look", () => {
    expect(view.map((r) => r.state)).toEqual([
      { kind: "band", band: "bloodied" },
      { kind: "hp", current: 31, max: 38 },
      { kind: "band", band: "bloodied" },
      { kind: "band", band: "healthy" },
    ]);
  });

  // The compact list (prototype: «Kaela», «Brann», «Selene (tu)»): a character by first name.
  it("names a character by first name, a creature in full", () => {
    const named = playInitiativeRows(
      [
        row({ ids: ["pc-c"], kind: "pc", name: "Catalion di Sancaldo" }),
        row({ ids: ["m-9"], kind: "monster", name: "Raider Chief" }),
      ],
      "pc-c"
    );
    expect(named.map((r) => r.name)).toEqual(["Catalion", "Raider Chief"]);
  });

  it("the next turn wraps to the top of the order", () => {
    const last = playInitiativeRows(
      rows.map((r) => ({ ...r, current: r.name === "Brann" })),
      "pc-me"
    );
    expect(last.map((r) => r.next)).toEqual([true, false, false, false]);
  });
});
