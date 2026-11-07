/**
 * The DM's «Danni e cure»: the entry lands on every chosen creature (a dropped chip is
 * left out), with its type; Cura is for monsters only; one creature shows its conditions.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import type { DmTarget } from "@/domains/combat/dm-hit-plan";
import { DmHitDialog } from "@/domains/combat/ui/DmHitDialog";

const goblin = (n: number): DmTarget => ({
  id: `monster-${n}`,
  kind: "monster",
  name: `Goblin ${n}`,
  hp: { current: 7, max: 7, temp: 0 },
  conditions: [],
});
const mara: DmTarget = {
  id: "pc-member-mara",
  kind: "pc",
  name: "Mara",
  hp: { current: 30, max: 38, temp: 0 },
  conditions: [],
  memberUid: "member-mara",
  characterId: "char-mara",
};

describe("DmHitDialog", () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.open = false;
    };
  });

  const open = (targets: DmTarget[]) => {
    const onHit = vi.fn();
    const onCondition = vi.fn();
    render(
      <DmHitDialog
        targets={targets}
        locale="en"
        onHit={onHit}
        onCondition={onCondition}
        onClose={() => {}}
      />
    );
    return { onHit, onCondition };
  };

  it("hits the chosen creatures with the typed amount, leaving out a dropped one", () => {
    const { onHit } = open([goblin(1), goblin(2), mara]);
    fireEvent.click(screen.getByRole("button", { name: /Goblin 2/ }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: "Slashing" }));
    fireEvent.click(screen.getByRole("button", { name: "Damage" }));
    expect(onHit).toHaveBeenCalledWith([goblin(1), mara], {
      kind: "damage",
      amount: 8,
      type: "slashing",
    });
  });

  it("heals monsters only", () => {
    open([mara]);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "5" } });
    expect(screen.getByRole("button", { name: "Heal" })).toHaveAttribute(
      "aria-disabled",
      "true"
    );
  });

  it("toggles a lone creature's condition", () => {
    const { onCondition } = open([goblin(1)]);
    fireEvent.click(screen.getByRole("button", { name: "Prone" }));
    expect(onCondition).toHaveBeenCalledWith(goblin(1), "prone", true);
  });
});
