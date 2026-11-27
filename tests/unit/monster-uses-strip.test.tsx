/**
 * The DM's limited-use strip under a monster's line: a Recharge use ready to spend, or
 * spent with its d6 to roll; N/Day uses counted down; the legendary pool counted down
 * with a «regain» once any is spent.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import type { MonsterUseRow } from "@/domains/combat/monster-uses-view";
import { MonsterUses } from "@/domains/combat/ui/MonsterUses";

const breath = (left: number): MonsterUseRow => ({
  key: "actions:fire-breath",
  max: 1,
  kind: "recharge",
  recharge: 5,
  left,
  entryId: "fire-breath",
});
const legendary = (left: number): MonsterUseRow => ({
  key: "legendary",
  max: 3,
  kind: "legendary",
  left,
});
const perDay: MonsterUseRow = {
  key: "actions:web",
  max: 2,
  kind: "uses",
  left: 0,
  entryId: "web",
};

const open = (uses: { use: MonsterUseRow; label: string }[]) => {
  const onSpend = vi.fn();
  const onRecharge = vi.fn();
  const onRegain = vi.fn();
  render(
    <MonsterUses
      uses={uses}
      onSpend={onSpend}
      onRecharge={onRecharge}
      onRegain={onRegain}
    />
  );
  return { onSpend, onRecharge, onRegain };
};

describe("MonsterUses", () => {
  it("a ready Recharge use is spent with a tap", () => {
    const { onSpend } = open([{ use: breath(1), label: "Fire Breath" }]);
    fireEvent.click(screen.getByRole("button", { name: "Fire Breath (Recharge 5–6)" }));
    expect(onSpend).toHaveBeenCalledWith(breath(1));
  });

  it("a spent Recharge use offers its d6", () => {
    const { onRecharge, onSpend } = open([{ use: breath(0), label: "Fire Breath" }]);
    fireEvent.click(screen.getByRole("button", { name: "Roll recharge: Fire Breath" }));
    expect(onRecharge).toHaveBeenCalledWith(breath(0));
    expect(onSpend).not.toHaveBeenCalled();
  });

  it("legendary actions count down; «regain» shows once any is spent", () => {
    const { onSpend, onRegain } = open([{ use: legendary(2), label: "" }]);
    fireEvent.click(screen.getByRole("button", { name: "Legendary actions 2/3" }));
    expect(onSpend).toHaveBeenCalledWith(legendary(2));
    fireEvent.click(screen.getByRole("button", { name: "Regain legendary actions" }));
    expect(onRegain).toHaveBeenCalledWith(legendary(2));
  });

  it("no «regain» while the pool is full; an exhausted N/Day use does nothing", () => {
    const { onSpend } = open([
      { use: legendary(3), label: "" },
      { use: perDay, label: "Web" },
    ]);
    expect(screen.queryByRole("button", { name: "Regain legendary actions" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Web 0/2" }));
    expect(onSpend).not.toHaveBeenCalled();
  });
});
