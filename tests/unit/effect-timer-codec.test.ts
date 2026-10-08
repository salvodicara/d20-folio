import { describe, expect, it } from "vitest";

import { MOCK_CHARACTER } from "@/lib/mock";
import { sessionToState, stateToSession } from "@/lib/session-state-codec";

describe("effect timers round-trip", () => {
  it("keeps the counted round and drops a malformed one", () => {
    const session = structuredClone(MOCK_CHARACTER.session);
    session.effectTimers = {
      "barbarian-rage": { roundsLeft: 7, tickedRound: 4 },
      "spell-bless": { roundsLeft: 3 },
    };
    const back = stateToSession(sessionToState(session));
    expect(back.effectTimers).toEqual(session.effectTimers);

    const tampered = stateToSession({
      effectTimers: { "barbarian-rage": { roundsLeft: 7, tickedRound: "x" } },
    });
    expect(tampered.effectTimers).toEqual({ "barbarian-rage": { roundsLeft: 7 } });
  });
});
