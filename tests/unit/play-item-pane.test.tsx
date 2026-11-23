/**
 * The Play inventory's item and coin panes (#1230, D&D Beyond's item pane and «Manage
 * Coin»): the stepper sets how many and never goes below 1, armor goes on or off,
 * «Remove from inventory» removes with its undo, the coin pane adds or takes in one
 * move, and a read-only sheet shows the details with no controls.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/firebase", () => ({}));
import { fireEvent, render, screen } from "@testing-library/react";

import { playInventoryView, type PlayItem } from "@/domains/play/play-inventory-view";
import { PlayCoinPane, PlayItemPane } from "@/domains/play/ui/PlayItemPane";
import { MOCK_CHARACTER } from "@/lib/mock";
import { useCharacterStore } from "@/stores/characterStore";
import { useUndoStore } from "@/stores/undoStore";
import type { CharacterDoc } from "@/types/character";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
  };
});

const live = () => useCharacterStore.getState().character as CharacterDoc;

function load(): void {
  const doc = structuredClone(MOCK_CHARACTER);
  doc.character.equipment = [
    { srdId: "torch", instanceId: "torch", quantity: 4 },
    { srdId: "chain-shirt", instanceId: "shirt", quantity: 1 },
  ];
  doc.session.currency = { pp: 1, gp: 10, ep: 0, sp: 3, cp: 0 };
  useCharacterStore.setState({ character: doc, loading: false, error: null });
}

const itemNamed = (re: RegExp): PlayItem => {
  const item = playInventoryView(live(), "en")
    .groups.flatMap((g) => g.items)
    .find((i) => re.test(i.name));
  if (!item) throw new Error(`no ${String(re)}`);
  return item;
};

describe("the item pane", () => {
  beforeEach(() => {
    useUndoStore.getState().clear();
    load();
  });

  it("sets how many, and never below 1", () => {
    render(
      <PlayItemPane
        item={itemNamed(/torch/i)}
        line={null}
        locale="en"
        readonly={false}
        onClose={() => undefined}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "One more" }));
    expect(live().character.equipment[0]?.quantity).toBe(5);
    fireEvent.change(
      screen.getAllByRole("spinbutton", { name: "Quantity" })[0] as HTMLElement,
      {
        target: { value: "0" },
      }
    );
    expect(live().character.equipment[0]?.quantity).toBe(1);
  });

  it("armor goes on with one tap; a torch has no such toggle", () => {
    const { unmount } = render(
      <PlayItemPane
        item={itemNamed(/chain shirt/i)}
        line={null}
        locale="en"
        readonly={false}
        onClose={() => undefined}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Equip" }));
    expect(live().character.equipment[1]?.equipped).toBe(true);
    unmount();
    render(
      <PlayItemPane
        item={itemNamed(/torch/i)}
        line={null}
        locale="en"
        readonly={false}
        onClose={() => undefined}
      />
    );
    expect(screen.queryByRole("button", { name: /^Equip/ })).toBeNull();
  });

  it("removes the item and closes; undo brings it back", () => {
    const onClose = vi.fn();
    render(
      <PlayItemPane
        item={itemNamed(/torch/i)}
        line={null}
        locale="en"
        readonly={false}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove from inventory" }));
    expect(onClose).toHaveBeenCalled();
    expect(live().character.equipment.map((r) => r.instanceId)).toEqual(["shirt"]);
    expect(useUndoStore.getState().undo()).toBe(true);
    expect(live().character.equipment.map((r) => r.instanceId)).toEqual([
      "torch",
      "shirt",
    ]);
  });

  it("a read-only sheet shows the details, with no controls", () => {
    render(
      <PlayItemPane
        item={itemNamed(/torch/i)}
        line={null}
        locale="en"
        readonly
        onClose={() => undefined}
      />
    );
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "One more" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove from inventory" })).toBeNull();
  });
});

describe("the coin pane", () => {
  beforeEach(() => {
    useUndoStore.getState().clear();
    load();
  });

  it("totals the coins in gold and says what each is worth", () => {
    render(
      <PlayCoinPane
        coins={live().session.currency}
        locale="en"
        readonly={false}
        onClose={() => undefined}
      />
    );
    // 1 pp + 10 gp + 3 sp = 20.3 gp
    expect(screen.getByText("Worth 20.3 gp in all")).toBeTruthy();
    expect(screen.getByText("10 sp = 1 gp")).toBeTruthy();
  });

  it("adds or takes several coins in one move", () => {
    render(
      <PlayCoinPane
        coins={live().session.currency}
        locale="en"
        readonly={false}
        onClose={() => undefined}
      />
    );
    const add = screen.getByRole("button", { name: "Add" });
    expect(add.getAttribute("aria-disabled")).toBe("true");
    fireEvent.change(screen.getByRole("spinbutton", { name: "gp" }), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "sp" }), {
      target: { value: "2" },
    });
    fireEvent.click(add);
    expect(live().session.currency).toMatchObject({ gp: 15, sp: 5 });
    fireEvent.change(screen.getByRole("spinbutton", { name: "gp" }), {
      target: { value: "7" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Take" }));
    expect(live().session.currency.gp).toBe(8);
  });

  it("a read-only sheet shows the coins, with no adjust row", () => {
    render(
      <PlayCoinPane
        coins={live().session.currency}
        locale="en"
        readonly
        onClose={() => undefined}
      />
    );
    expect(screen.queryByRole("button", { name: "Add" })).toBeNull();
    expect(screen.queryByRole("spinbutton", { name: "gp" })).toBeNull();
  });
});
