/**
 * The Scontro tab's initiative list (approved prototype camp-fight, 2026-11-02): one row
 * per turn in order, the current one marked. Characters show their HP numbers; creatures
 * show only how hurt they look (the shared `hpBand`), never a number. The same creature on
 * the same initiative is always one row («Goblin ×3»), whatever state each is in (counted
 * by state) and even on its turn: no half grouping (owner review, 2026-11-02). Status chips
 * as on the Gruppo panel: Concentration first, then conditions.
 */
import { describe, expect, it } from "vitest";

import { fightRows } from "@/domains/combat/fight-rows-view";
import type { EncounterCombatantView } from "@/features/campaigns/encounter-view";

const pc = (id: string, name: string, init: number, hp: [number, number], extra = {}) =>
  ({
    id,
    kind: "pc",
    name,
    ac: 15,
    initiative: init,
    conditions: [],
    currentHp: hp[0],
    maxHp: hp[1],
    tempHp: 0,
    down: hp[0] <= 0,
    hidden: false,
    memberUid: id.replace(/^pc-/, ""),
    ...extra,
  }) as EncounterCombatantView;
const foe = (id: string, name: string, init: number, hp: [number, number], extra = {}) =>
  ({
    id,
    kind: "monster",
    name,
    ac: 13,
    initiative: init,
    conditions: [],
    currentHp: hp[0],
    maxHp: hp[1],
    tempHp: 0,
    down: hp[0] <= 0,
    hidden: false,
    ...extra,
  }) as EncounterCombatantView;

const rows = [
  foe("m1", "Hobgoblin Captain", 19, [20, 39]),
  pc("pc-kaela", "Kaela", 18, [17, 38], { conditions: ["prone"] }),
  foe("m2", "Raider 1", 17, [11, 11]),
  foe("m3", "Raider 2", 17, [11, 11]),
  foe("m4", "Raider 3", 17, [2, 11]),
  pc("pc-selene", "Selene", 15, [31, 38]),
  foe("m5", "Raider 4", 12, [11, 11]),
];

describe("fightRows", () => {
  const list = fightRows(
    rows,
    "pc-kaela",
    { "pc-selene": [{ kind: "conc", label: "Bless" }] },
    "en"
  );

  it("keeps the turn order and marks whose turn it is", () => {
    expect(list.map((r) => r.name)).toEqual([
      "Hobgoblin Captain",
      "Kaela",
      "Raider",
      "Selene",
      "Raider",
    ]);
    expect(list.filter((r) => r.current).map((r) => r.name)).toEqual(["Kaela"]);
  });

  it("a character shows HP numbers, a creature only how hurt it looks", () => {
    expect(list[1]).toMatchObject({ hp: { current: 17, max: 38 }, bands: [] });
    expect(list[0]).toMatchObject({ hp: null, bands: [{ band: "healthy", count: 1 }] });
  });

  it("the same creature on the same initiative is one line, its states counted", () => {
    expect(list[2]).toMatchObject({
      name: "Raider",
      count: 3,
      ids: ["m2", "m3", "m4"],
      bands: [
        { band: "healthy", count: 2 },
        { band: "nearDeath", count: 1 },
      ],
    });
    // Another initiative is another turn: its own line.
    expect(list[4]).toMatchObject({ count: 1, ids: ["m5"] });
  });

  it("chips: Concentration first, then conditions, localized", () => {
    expect(list[3]?.chips).toEqual([{ kind: "conc", label: "Bless" }]);
    expect(list[1]?.chips).toEqual([{ kind: "cond", label: "Prone" }]);
  });

  it("a group whose creature's turn it is stays whole and is marked as the current turn", () => {
    const now = fightRows(rows, "m3", {}, "en");
    expect(now.map((r) => [r.ids, r.current])[2]).toEqual([["m2", "m3", "m4"], true]);
    expect(now.filter((r) => r.current)).toHaveLength(1);
  });

  it("a character who hasn't rolled is never hidden: under the rolled ones, marked to roll", () => {
    const late = fightRows(
      [pc("pc-tib", "Tib", null as never, [7, 33]), ...rows],
      "pc-kaela",
      {},
      "en"
    );
    expect(late.at(-1)).toMatchObject({ name: "Tib", mustRoll: true, initiative: null });
    expect(late.slice(0, -1).every((r) => !r.mustRoll)).toBe(true);
  });
});
