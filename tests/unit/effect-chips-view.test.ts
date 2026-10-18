/**
 * The header's status chips (design session, 2026-10-18): one list of what is on the
 * character now, buffs and conditions together, each with its name, kind, what is left
 * of it, its source and whether Concentration holds it. A countdown reads in rounds
 * under a minute and in whole minutes from there (10 rounds = 1 minute); a status the
 * clock does not count (until a rest, kept up by hand) has no remaining time.
 */
import { describe, expect, it } from "vitest";

import { effectChipsView } from "@/lib/views/effect-chips-view";
import { makeCharacterDoc } from "./_helpers";

const barbarian = (session = {}) =>
  makeCharacterDoc(
    { classId: "barbarian", level: 3, features: [{ srdId: "barbarian-rage" }] },
    session
  );

describe("effectChipsView", () => {
  it("lists a lit buff with its countdown in minutes, then the conditions", () => {
    const chips = effectChipsView(
      barbarian({
        activeFeatures: ["barbarian-rage"],
        effectTimers: { "barbarian-rage": { roundsLeft: 100 } },
        conditions: ["poisoned"],
      }),
      "en"
    );
    expect(chips).toEqual([
      {
        id: "barbarian-rage",
        name: "Rage",
        kind: "buff",
        remaining: { minutes: 10 },
        source: "barbarian-rage",
        concentration: false,
      },
      {
        id: "poisoned",
        name: "Poisoned",
        kind: "condition",
        remaining: null,
        source: null,
        concentration: false,
      },
    ]);
  });

  it("under a minute the countdown reads in rounds; past it, whole minutes rounded up", () => {
    const rounds = (left: number) =>
      effectChipsView(
        barbarian({
          activeFeatures: ["barbarian-rage"],
          effectTimers: { "barbarian-rage": { roundsLeft: left } },
        }),
        "en"
      )[0]?.remaining;
    expect(rounds(3)).toEqual({ rounds: 3 });
    expect(rounds(9)).toEqual({ rounds: 9 });
    expect(rounds(10)).toEqual({ minutes: 1 });
    expect(rounds(11)).toEqual({ minutes: 2 });
  });

  it("names in the reader's language", () => {
    const chips = effectChipsView(
      barbarian({ activeFeatures: ["barbarian-rage"], conditions: ["poisoned"] }),
      "it"
    );
    expect(chips.map((chip) => chip.name)).toEqual(["Ira", "Avvelenato"]);
  });

  it("an empty sheet has no chips", () => {
    expect(effectChipsView(barbarian(), "en")).toEqual([]);
  });
});
