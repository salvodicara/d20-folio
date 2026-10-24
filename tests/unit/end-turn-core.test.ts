/**
 * End Turn's own decisions, moved out of the turn-economy provider (architecture
 * pass 2026-10-24, programme step 1). Characterized from the provider's behaviour:
 *
 * - A "maintained" state (Rage: "ends early … if you haven't made an attack roll …
 *   or taken a Bonus Action to extend it") surfaces the keep/end prompt at the end of
 *   your turn unless something kept it going this round; a state that just expired
 *   outright is never also prompted (the hard drop supersedes the soft one).
 * - Every effect that ended at this End Turn is announced, in the order they ended:
 *   the timed ones, then those that ended at the turn's end, then at the next start.
 */
import { describe, expect, it } from "vitest";

import { expiryNoticeSources, unmaintainedStates } from "@/lib/play/end-turn";
import { makeCharacterDoc } from "./_helpers";

const raging = () =>
  makeCharacterDoc(
    { classId: "barbarian", level: 3, features: [{ srdId: "barbarian-rage" }] },
    { activeFeatures: ["barbarian-rage"] }
  );

const used = (triggerEvents: ("attack" | "bonus-extend")[]) => ({
  action: [{ triggerEvents }],
  bonus: [],
  free: [],
});

describe("unmaintainedStates", () => {
  it("Rage with no attack and no extending bonus action this round is prompted", () => {
    expect(
      unmaintainedStates(raging(), used([]), new Set()).map((e) => e.activeKey)
    ).toEqual(["barbarian-rage"]);
  });

  it.each([["attack"], ["bonus-extend"]] as const)(
    "a %s this round keeps it going: no prompt",
    (event) => {
      expect(unmaintainedStates(raging(), used([event]), new Set())).toEqual([]);
    }
  );

  it("a state that just expired outright is not prompted too", () => {
    expect(unmaintainedStates(raging(), used([]), new Set(["barbarian-rage"]))).toEqual(
      []
    );
  });

  it("no character, nothing to prompt", () => {
    expect(unmaintainedStates(null, used([]), new Set())).toEqual([]);
  });
});

describe("expiryNoticeSources", () => {
  it("timed expiries, then the turn's end, then the next turn's start, in order", () => {
    expect(
      expiryNoticeSources(
        [{ sourceId: "barbarian-rage" }],
        [{ sourceId: "spell-shield" }],
        [{ sourceId: "spell-bless" }]
      )
    ).toEqual(["barbarian-rage", "spell-shield", "spell-bless"]);
  });

  it("in a shared fight there is no next-turn start to announce", () => {
    expect(expiryNoticeSources([{ sourceId: "a" }], [{ sourceId: "b" }])).toEqual([
      "a",
      "b",
    ]);
  });
});
