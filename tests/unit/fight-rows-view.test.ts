/**
 * The Scontro tab's initiative list (approved prototype camp-fight, 2026-11-02): one row
 * per turn in order, the current one marked. Characters show their HP numbers; creatures
 * show only how hurt they look (the shared `hpBand`), never a number. The same creature
 * acting one after another in the same state reads as one row («Goblin ×3»). Status chips
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
      "Raider",
      "Selene",
      "Raider",
    ]);
    expect(list.filter((r) => r.current).map((r) => r.name)).toEqual(["Kaela"]);
  });

  it("a character shows HP numbers, a creature only how hurt it looks", () => {
    expect(list[1]).toMatchObject({ hp: { current: 17, max: 38 }, band: null });
    expect(list[0]).toMatchObject({ hp: null, band: "healthy" });
  });

  it("the same creature in a row and in the same state is one line with a count", () => {
    expect(list[2]).toMatchObject({
      name: "Raider",
      count: 2,
      ids: ["m2", "m3"],
      band: "healthy",
    });
    expect(list[3]).toMatchObject({ count: 1, ids: ["m4"], band: "nearDeath" });
    expect(list[5]).toMatchObject({ count: 1, ids: ["m5"] });
  });

  it("chips: Concentration first, then conditions, localized", () => {
    expect(list[4]?.chips).toEqual([{ kind: "conc", label: "Bless" }]);
    expect(list[1]?.chips).toEqual([{ kind: "cond", label: "Prone" }]);
  });

  it("a creature whose turn it is stays on its own line", () => {
    const now = fightRows(rows, "m3", {}, "en");
    expect(now.slice(2, 5).map((r) => [r.ids, r.current])).toEqual([
      [["m2"], false],
      [["m3"], true],
      [["m4"], false],
    ]);
  });
});
