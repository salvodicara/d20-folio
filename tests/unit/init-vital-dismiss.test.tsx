/**
 * InitVital dismissal + commit contract.
 *
 * TWO surfaces, ONE live-draft commit model (the roll is read from a synchronously-updated
 * ref, never a render-lagged closure or a spurious-unmount cleanup — the deleted failed-fix
 * machinery that wrote empty/stale drafts):
 *
 *  - PARTY CARD (owns its popover): the resting chip is the trigger; the editor FLOATS; a
 *    dismissal that Radix reports through `onOpenChange(false)` (outside-click / trigger
 *    re-click) commits the live draft; Enter commits + closes; Escape cancels.
 *  - PIP (`autoEdit`, caller owns the popover): the tile mirrors the live draft into the
 *    caller's `draftRef` and flags Escape in `cancelRef`; the CALLER commits on its popover
 *    close. Enter commits here; the tile NEVER commits on unmount (a spurious remount is inert).
 */

import { useRef, useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InitVital } from "@/features/campaigns/init-vital";

const inputPresent = () => screen.queryByRole("textbox") !== null;
const input = () => screen.getByRole("textbox");
const trigger = () => screen.getByRole("button");

describe("InitVital — party-card path (owns its popover)", () => {
  function Harness({ initial }: { initial: number | null }) {
    const [value, setValue] = useState<number | null>(initial);
    return <InitVital value={value} bonus={3} canEdit name="Mara" onCommit={setValue} />;
  }

  it("at rest is a chip (no input in flow); the trigger opens the floating editor", () => {
    render(<Harness initial={null} />);
    expect(inputPresent()).toBe(false);
    fireEvent.click(trigger());
    expect(inputPresent()).toBe(true);
  });

  it("REGRESSION: typing a roll then closing via the trigger re-click PERSISTS it", () => {
    render(<Harness initial={null} />);
    fireEvent.click(trigger());
    fireEvent.change(input(), { target: { value: "5" } });
    fireEvent.click(trigger()); // trigger re-click closes (ratified)
    expect(inputPresent()).toBe(false);
    fireEvent.click(trigger()); // re-open pre-fills the committed 5
    expect(input()).toHaveValue("5");
  });

  it("Escape CANCELS: the floating editor closes and the typed draft is discarded", () => {
    const onCommit = vi.fn();
    render(<InitVital value={null} bonus={3} canEdit name="Mara" onCommit={onCommit} />);
    fireEvent.click(trigger());
    fireEvent.change(input(), { target: { value: "9" } });
    fireEvent.keyDown(input(), { key: "Escape" });
    expect(inputPresent()).toBe(false);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("re-open pre-fills → unchanged close keeps it → explicit clear empties it", () => {
    render(<Harness initial={18} />);
    fireEvent.click(trigger());
    expect(input()).toHaveValue("18");
    fireEvent.click(trigger()); // close unchanged
    fireEvent.click(trigger()); // re-open
    expect(input()).toHaveValue("18");
    fireEvent.change(input(), { target: { value: "" } });
    fireEvent.click(trigger()); // close → commit empty → un-rolled
    fireEvent.click(trigger());
    expect(input()).toHaveValue("");
  });

  it("UNMOUNTING mid-edit (navigate away) does NOT commit — no stale-draft clobber", () => {
    const onCommit = vi.fn();
    const { unmount } = render(
      <InitVital value={null} bonus={3} canEdit name="Mara" onCommit={onCommit} />
    );
    fireEvent.click(trigger());
    fireEvent.change(input(), { target: { value: "12" } });
    unmount();
    expect(onCommit).not.toHaveBeenCalled();
  });
});

describe("InitVital — pip path (autoEdit; caller owns the popover + the commit)", () => {
  it("Enter COMMITS the live draft and closes (calls onDismiss)", () => {
    const onCommit = vi.fn();
    const onDismiss = vi.fn();
    const draftRef = { current: "" };
    render(
      <InitVitalPipHarness
        onCommit={onCommit}
        onDismiss={onDismiss}
        draftRef={draftRef}
      />
    );
    fireEvent.change(input(), { target: { value: "15" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith(15);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("mirrors the live draft into the caller's draftRef on every keystroke", () => {
    const draftRef = { current: "" };
    render(<InitVitalPipHarness draftRef={draftRef} />);
    fireEvent.change(input(), { target: { value: "7" } });
    expect(draftRef.current).toBe("7"); // the caller reads THIS on its popover close
  });

  it("Escape flags cancelRef (so the caller skips its close-commit) and does not commit", () => {
    const onCommit = vi.fn();
    const cancelRef = { current: false };
    render(<InitVitalPipHarness onCommit={onCommit} cancelRef={cancelRef} />);
    fireEvent.change(input(), { target: { value: "7" } });
    fireEvent.keyDown(input(), { key: "Escape" });
    expect(cancelRef.current).toBe(true);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("a spurious UNMOUNT does NOT commit (the deleted unmount-commit machinery)", () => {
    const onCommit = vi.fn();
    const draftRef = { current: "" };
    const { unmount } = render(
      <InitVitalPipHarness onCommit={onCommit} draftRef={draftRef} />
    );
    fireEvent.change(input(), { target: { value: "7" } });
    unmount(); // caller closed the popover → the tile unmounts; the CALLER owns the commit
    expect(onCommit).not.toHaveBeenCalled();
  });
});

function InitVitalPipHarness({
  onCommit = vi.fn(),
  onDismiss = vi.fn(),
  draftRef,
  cancelRef,
}: {
  onCommit?: (roll: number | null) => void;
  onDismiss?: () => void;
  draftRef?: { current: string };
  cancelRef?: { current: boolean };
}) {
  const localDraft = useRef("");
  const localCancel = useRef(false);
  return (
    <InitVital
      value={null}
      bonus={3}
      canEdit
      autoEdit
      name="Mara"
      onCommit={onCommit}
      onDismiss={onDismiss}
      draftRef={draftRef ?? localDraft}
      cancelRef={cancelRef ?? localCancel}
    />
  );
}

/**
 * BUG 3 — an in-progress edit must SURVIVE a remote `value` change (the turn pointer
 * advancing, or a peer/DM writing the subdoc). The draft is local (seeded only on open), so a
 * reactive `value` change reconciles the DISPLAY, never the live input.
 */
describe("InitVital — in-progress edit survives a remote value change (BUG 3)", () => {
  it("a `value` prop change mid-edit does NOT clobber the typed draft", () => {
    const onCommit = vi.fn();
    const draftRef = { current: "" };
    const { rerender } = render(
      <InitVital
        value={null}
        bonus={3}
        canEdit
        autoEdit
        name="Mara"
        onCommit={onCommit}
        onDismiss={vi.fn()}
        draftRef={draftRef}
        cancelRef={{ current: false }}
      />
    );
    fireEvent.change(input(), { target: { value: "1" } });
    expect(input()).toHaveValue("1");
    rerender(
      <InitVital
        value={9}
        bonus={3}
        canEdit
        autoEdit
        name="Mara"
        onCommit={onCommit}
        onDismiss={vi.fn()}
        draftRef={draftRef}
        cancelRef={{ current: false }}
      />
    );
    expect(input()).toHaveValue("1"); // not reset to "9"
    fireEvent.change(input(), { target: { value: "17" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(onCommit).toHaveBeenLastCalledWith(17);
  });
});
