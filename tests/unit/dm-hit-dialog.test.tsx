/**
 * The DM's «Danni e cure»: the entry lands on every chosen creature (a dropped chip is
 * left out), with its type; Cura is for monsters only; one creature shows its conditions.
 * «For the players» sets what the players see of the chosen monsters: hidden, exact HP
 * shown, ally (the classic MonsterCard's toggles).
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
    const onShow = vi.fn();
    const onTempHp = vi.fn();
    const onRemove = vi.fn();
    render(
      <DmHitDialog
        targets={targets}
        locale="en"
        onHit={onHit}
        onCondition={onCondition}
        onShow={onShow}
        onTempHp={onTempHp}
        onRemove={onRemove}
        onClose={() => {}}
      />
    );
    return { onHit, onCondition, onShow, onTempHp, onRemove };
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

  describe("for the players", () => {
    it("hides every chosen monster at once, leaving out a dropped one and the heroes", () => {
      const { onShow } = open([goblin(1), goblin(2), goblin(3), mara]);
      fireEvent.click(screen.getByRole("button", { name: /Goblin 3/ }));
      fireEvent.click(screen.getByRole("button", { name: "Hidden from the players" }));
      expect(onShow).toHaveBeenCalledWith([goblin(1), goblin(2)], "hidden", true);
    });

    it("a toggle is on only when every chosen monster has it, and turns it off for all", () => {
      const { onShow } = open([
        { ...goblin(1), revealed: true },
        { ...goblin(2), revealed: true },
      ]);
      const reveal = screen.getByRole("button", { name: "Exact HP shown" });
      expect(reveal).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("button", { name: "Ally" })).toHaveAttribute(
        "aria-pressed",
        "false"
      );
      fireEvent.click(reveal);
      expect(onShow).toHaveBeenCalledWith(
        [
          { ...goblin(1), revealed: true },
          { ...goblin(2), revealed: true },
        ],
        "revealed",
        false
      );
    });

    it("with the monsters mixed, a toggle is off and sets it on every one", () => {
      const { onShow } = open([{ ...goblin(1), side: "ally" }, goblin(2)]);
      const ally = screen.getByRole("button", { name: "Ally" });
      expect(ally).toHaveAttribute("aria-pressed", "false");
      fireEvent.click(ally);
      expect(onShow).toHaveBeenCalledWith(
        [{ ...goblin(1), side: "ally" }, goblin(2)],
        "ally",
        true
      );
    });

    it("has nothing to set on heroes alone", () => {
      open([mara]);
      expect(screen.queryByRole("button", { name: "Ally" })).toBeNull();
    });
  });

  describe("S3: temp HP and «Togli dallo scontro»", () => {
    it("gives the chosen monsters the typed temporary HP", () => {
      const { onTempHp } = open([goblin(1), goblin(2)]);
      fireEvent.change(screen.getByRole("textbox"), { target: { value: "4" } });
      fireEvent.click(screen.getByRole("button", { name: "Temporary HP" }));
      expect(onTempHp).toHaveBeenCalledWith([goblin(1), goblin(2)], 4);
    });

    it("takes the chosen monsters out of the fight; heroes stay", () => {
      const { onRemove } = open([goblin(1), mara]);
      fireEvent.click(screen.getByRole("button", { name: "Remove from the fight" }));
      expect(onRemove).toHaveBeenCalledWith([goblin(1)]);
    });

    it("neither for heroes alone", () => {
      open([mara]);
      expect(screen.queryByRole("button", { name: "Temporary HP" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Remove from the fight" })).toBeNull();
    });
  });
});
