/**
 * The DM's monster action on the new fight screen (classic MonsterActionTray; D&D
 * Beyond and Foundry roll the attack, the table applies): pick on whom, mark each
 * target Hit · Miss · Critical (or Saved), type the rolled total, Apply. The app never
 * rolls; a target the action misses needs no total.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { MonsterActionDialog } from "@/domains/combat/ui/MonsterActionDialog";
import type { EncounterCombatantView } from "@/features/campaigns/encounter-view";
import type { DamageTrayPlan } from "@/lib/play/damage-tray";

const view = (
  id: string,
  name: string,
  kind: "pc" | "monster"
): EncounterCombatantView => ({
  id,
  kind,
  name,
  ac: 14,
  initiative: 10,
  conditions: [],
  currentHp: 20,
  maxHp: 20,
  tempHp: 0,
  down: false,
  hidden: false,
});
const ana = view("pc-ana", "Ana", "pc");
const bo = view("pc-bo", "Bo", "pc");

const attackPlan = (ids: readonly string[]): DamageTrayPlan => ({
  effect: "damage",
  damageType: "slashing",
  attack: { onMiss: "none" },
  targets: [...ids],
});
const savePlan = (ids: readonly string[]): DamageTrayPlan => ({
  effect: "damage",
  save: { ability: "DEX", dc: 13, onSave: "half" },
  targets: [...ids],
});

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
  };
});

const open = (planFor = attackPlan, picked: string[] = []) => {
  const onApply = vi.fn();
  render(
    <MonsterActionDialog
      title="Scimitar"
      numbers="+4 · 1d6+2"
      candidates={[ana, bo]}
      initiallyPicked={picked}
      planFor={planFor}
      onApply={onApply}
      onClose={() => {}}
    />
  );
  return { onApply };
};

describe("MonsterActionDialog", () => {
  it("an attack: pick Ana, mark it a hit, type the total, apply", () => {
    const { onApply } = open();
    fireEvent.click(screen.getByRole("button", { name: "Ana" }));
    fireEvent.click(screen.getByRole("button", { name: "Hit" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Rolled total" }), {
      target: { value: "7" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    const [plan, rows, total] = onApply.mock.calls[0] as [
      DamageTrayPlan,
      { targetId: string; attack?: string }[],
      number,
    ];
    expect(plan.targets).toEqual(["pc-ana"]);
    expect(rows.map((r) => [r.targetId, r.attack])).toEqual([["pc-ana", "hit"]]);
    expect(total).toBe(7);
  });

  it("a miss needs no total", () => {
    const { onApply } = open(attackPlan, ["pc-ana"]);
    fireEvent.click(screen.getByRole("button", { name: "Miss" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalled();
  });

  it("a hit with no total cannot apply yet", () => {
    open(attackPlan, ["pc-ana"]);
    fireEvent.click(screen.getByRole("button", { name: "Hit" }));
    expect(screen.getByRole("button", { name: "Apply" })).toHaveAttribute(
      "aria-disabled",
      "true"
    );
  });

  it("an attack starts marked «Hit», as the classic tray does", () => {
    open(attackPlan, ["pc-ana"]);
    expect(screen.getByRole("button", { name: "Hit" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("a save: every picked target starts failed; «Saved» marks one", () => {
    const { onApply } = open(savePlan, ["pc-ana", "pc-bo"]);
    fireEvent.click(screen.getAllByRole("button", { name: "Saved" })[1] as HTMLElement);
    fireEvent.change(screen.getByRole("textbox", { name: "Rolled total" }), {
      target: { value: "10" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    const rows = (onApply.mock.calls[0] as [unknown, { saved: boolean }[]])[1];
    expect(rows.map((r) => r.saved)).toEqual([false, true]);
  });
});
