/**
 * The DM's arrow keys pass the turn (→) and step it back (←), as on the classic screen.
 * They never act while the DM types in a field, while a dialog or menu is open, with a
 * modifier held, or when the shortcut is off.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";

import { useTurnAdvanceShortcut } from "@/hooks/useTurnAdvanceShortcut";

function Harness(props: { enabled?: boolean; onNext: () => void; onPrev: () => void }) {
  useTurnAdvanceShortcut({
    enabled: props.enabled ?? true,
    empty: false,
    onNext: props.onNext,
    onPrev: props.onPrev,
  });
  return (
    <div>
      <input aria-label="name" />
      <dialog open>
        <button type="button">inside</button>
      </dialog>
      <button type="button">outside</button>
    </div>
  );
}

const setup = (enabled?: boolean) => {
  const onNext = vi.fn();
  const onPrev = vi.fn();
  const view = render(
    <Harness
      onNext={onNext}
      onPrev={onPrev}
      {...(enabled === undefined ? {} : { enabled })}
    />
  );
  return { onNext, onPrev, view };
};

describe("the turn's arrow keys", () => {
  it("→ passes and ← steps back", () => {
    const { onNext, onPrev, view } = setup();
    const outside = view.getByRole("button", { name: "outside" });
    fireEvent.keyDown(outside, { key: "ArrowRight" });
    fireEvent.keyDown(outside, { key: "ArrowLeft" });
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onPrev).toHaveBeenCalledTimes(1);
  });

  it("never while typing, with a modifier, or when off", () => {
    const { onNext, view } = setup();
    fireEvent.keyDown(view.getByRole("textbox"), { key: "ArrowRight" });
    fireEvent.keyDown(view.getByRole("button", { name: "outside" }), {
      key: "ArrowRight",
      shiftKey: true,
    });
    expect(onNext).not.toHaveBeenCalled();
    const off = setup(false);
    fireEvent.keyDown(
      off.view.getAllByRole("button", { name: "outside" })[0] as Element,
      {
        key: "ArrowRight",
      }
    );
    expect(off.onNext).not.toHaveBeenCalled();
  });

  it("never while a dialog or menu is open", () => {
    const { onNext, view } = setup();
    fireEvent.keyDown(view.getByRole("button", { name: "inside", hidden: true }), {
      key: "ArrowRight",
    });
    expect(onNext).not.toHaveBeenCalled();
  });
});
