/**
 * The `combat/state` writer sends only a real change (rehearsal 2026-11-06 P1: a sheet
 * rewrote the same ~25 KB play state about 16 times in a few seconds, each a billed
 * Firestore write). At most one write per change; none for an unchanged state, for one
 * already on its way, or for the server's own snapshot coming back.
 */
import { describe, expect, it } from "vitest";

import { defaultCombatState } from "@/lib/combat-state";
import { createCombatWriteGate } from "@/lib/combat-write-gate";
import type { CombatState } from "@/types/combat-state";

const at = (current: number): CombatState => ({
  ...defaultCombatState(30),
  hp: { current, temp: 0 },
});

describe("the combat/state write gate", () => {
  it("sends a change once, and the same state again never", () => {
    const gate = createCombatWriteGate();
    expect(gate.admit(at(20))).toBe("send");
    expect(gate.admit(at(20))).toBe("in-flight");
    gate.observe(at(20)); // the write's answer
    expect(gate.admit(at(20))).toBe("held");
  });

  it("a rebuilt state with the same content is the same state", () => {
    const gate = createCombatWriteGate();
    gate.observe(at(20));
    expect(gate.admit(structuredClone(at(20)))).toBe("held");
  });

  it("the server's snapshot echoed back sends nothing", () => {
    const gate = createCombatWriteGate();
    gate.observe(at(17)); // a snapshot: the DM's hit
    expect(gate.admit(at(17))).toBe("held");
    expect(gate.admit(at(15))).toBe("send");
  });

  it("after a failed write the next state is sent", () => {
    const gate = createCombatWriteGate();
    expect(gate.admit(at(20))).toBe("send");
    gate.forget();
    expect(gate.admit(at(20))).toBe("send");
  });

  it("a burst of rebuilds of one change is one write", () => {
    const gate = createCombatWriteGate();
    gate.observe(at(30));
    const verdicts = [at(25), at(25), structuredClone(at(25)), at(25)].map((s) =>
      gate.admit(s)
    );
    expect(verdicts.filter((v) => v === "send")).toHaveLength(1);
  });
});
