/**
 * At most one `combat/state` write per change (rehearsal 2026-11-06 P1). On the
 * emulator, in a fight with the cast dialog open, every snapshot of the sheet's own
 * write dropped the projected campaign clock; the projection set it again, the session
 * changed by reference, and the same ~25 KB play state went back out: ~16 billed writes
 * in a few seconds, on the classic sheet too. The writer the subscription wires
 * (`createCombatStateWriter`) sends a change once and an unchanged or echoed state never.
 */
import { describe, expect, it, vi } from "vitest";

import { defaultCombatState } from "@/lib/combat-state";
import { createCombatStateWriter } from "@/lib/combat-state-writer";
import type { CombatState } from "@/types/combat-state";

const at = (current: number): CombatState => ({
  ...defaultCombatState(30),
  hp: { current, temp: 0 },
});

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function setup(
  send = vi.fn<(state: CombatState, base: CombatState | null) => Promise<void>>(() =>
    Promise.resolve()
  )
) {
  const reconciler = {
    markChildPending: vi.fn(),
    acknowledgeChildWrite: vi.fn(),
    rejectChildWrite: vi.fn(),
  };
  const onRejected = vi.fn();
  const writer = createCombatStateWriter({ send, reconciler, onRejected });
  return { writer, send, reconciler, onRejected };
}

describe("the combat/state writer", () => {
  it("one command's asks are one write, of the final state", async () => {
    const { writer, send } = setup();
    for (const hp of [28, 26, 25, 25]) writer.write(at(hp));
    await tick();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(at(25), null);
  });

  it("the echo loop: sixteen snapshots and re-projections of the same state, one write", async () => {
    const { writer, send } = setup();
    writer.write(at(25));
    await tick();
    for (let echo = 0; echo < 16; echo++) {
      writer.observe(at(25)); // the server's snapshot of the write
      writer.write(structuredClone(at(25))); // the clock re-projected: same content
      await tick();
    }
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("a state already on the server is settled as written, not resent", async () => {
    const { writer, send, reconciler } = setup();
    writer.observe(at(20));
    writer.write(at(20));
    await tick();
    expect(send).not.toHaveBeenCalled();
    expect(reconciler.acknowledgeChildWrite).toHaveBeenCalledWith(at(20));
  });

  it("a real change after it is sent", async () => {
    const { writer, send } = setup();
    writer.observe(at(20));
    writer.shown(at(20));
    writer.write(at(14));
    await tick();
    expect(send).toHaveBeenCalledWith(at(14), at(20));
  });

  it("after a failed write the same state is sent again", async () => {
    const send = vi
      .fn<(state: CombatState) => Promise<void>>(() => Promise.resolve())
      .mockRejectedValueOnce(new Error("offline"));
    const { writer, onRejected } = setup(send);
    writer.write(at(20));
    await tick();
    expect(onRejected).toHaveBeenCalled();
    writer.write(at(20));
    await tick();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("each write goes with the server state it was built on", async () => {
    const { writer, send } = setup();
    writer.observe(at(30)); // the snapshot
    writer.shown(at(30)); // the sheet shows it
    writer.write(at(25));
    await tick();
    expect(send).toHaveBeenLastCalledWith(at(25), at(30));
    // Before the next snapshot, the next edit builds on what was just sent.
    writer.write(at(20));
    await tick();
    expect(send).toHaveBeenLastCalledWith(at(20), at(25));
    // A snapshot carrying another device's write is the new base.
    writer.observe(at(12));
    writer.shown(at(12));
    writer.write(at(10));
    await tick();
    expect(send).toHaveBeenLastCalledWith(at(10), at(12));
  });

  it("an edit builds on what the sheet shows, not on a snapshot it has not shown yet", async () => {
    // Rehearsal 2026-11-10 (classic, Uncanny Dodge): the DM's hit (38 → 33) reached the
    // writer while the sheet still showed its own unacknowledged write (38); the fold
    // built on 38 was diffed against 33, read as a +5 heal, and undid the hit.
    const { writer, send } = setup();
    writer.shown(at(38));
    writer.observe(at(33)); // the hit: the server holds it, the sheet does not show it
    writer.write({ ...at(38), round: 2 }); // the fold, built on what the sheet shows
    await tick();
    expect(send).toHaveBeenLastCalledWith({ ...at(38), round: 2 }, at(38));
    // Once the sheet shows the hit, the next edit builds on it.
    writer.shown(at(33));
    writer.write({ ...at(33), round: 3 });
    await tick();
    expect(send).toHaveBeenLastCalledWith({ ...at(33), round: 3 }, at(33));
  });

  it("a shown state that is the sheet's own queued ask is not a base", async () => {
    // The ask is pending before it leaves (`markChildPending`), so a snapshot landing
    // in that tick shows the ask itself: taking it as the base would send nothing.
    const { writer, send } = setup();
    writer.shown(at(30));
    const mine = at(25);
    writer.write(mine);
    writer.shown(mine);
    await tick();
    expect(send).toHaveBeenLastCalledWith(mine, at(30));
  });

  it("a failed write is not counted as sent: the retry goes from the old base", async () => {
    const send = vi
      .fn<
        (state: CombatState, base: CombatState | null) => Promise<void>
      >(() => Promise.resolve())
      .mockRejectedValueOnce(new Error("denied"));
    const { writer } = setup(send);
    writer.observe(at(30));
    writer.shown(at(30));
    writer.write(at(25));
    await tick();
    writer.write(at(25));
    await tick();
    expect(send).toHaveBeenLastCalledWith(at(25), at(30));
  });

  it("a stopped writer writes nothing", async () => {
    const { writer, send } = setup();
    writer.write(at(20));
    writer.stop();
    await tick();
    expect(send).not.toHaveBeenCalled();
  });
});
