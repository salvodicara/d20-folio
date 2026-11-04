/**
 * A once-per-turn use keeps the turn it was spent in across a save (edge-case M5),
 * and an older reader, which keeps only tracker entries with recorded rolls, still
 * keeps its count.
 */
import { describe, expect, it } from "vitest";

import { sessionToState, stateToSession } from "@/lib/session-state-codec";
import { makeCharacterDoc } from "./_helpers";

describe("a once-per-turn use across a save", () => {
  it("keeps its count and its turn", () => {
    const doc = makeCharacterDoc(
      {},
      { trackers: { "rogue-sneak-attack": { used: 1, turnKey: "5:pc-rogue" } } }
    );
    const stored = JSON.parse(JSON.stringify(sessionToState(doc.session))) as Record<
      string,
      unknown
    >;
    // An older reader keeps an object entry only with `rolls`: it rides along empty.
    expect(stored.trackers).toEqual({
      "rogue-sneak-attack": { used: 1, rolls: [], turnKey: "5:pc-rogue" },
    });
    expect(stateToSession(stored).trackers?.["rogue-sneak-attack"]).toEqual({
      used: 1,
      turnKey: "5:pc-rogue",
    });
  });
});
