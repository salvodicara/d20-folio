/**
 * ModalShell a11y contract (Phase-6 T2): the shared modal primitive is backed by
 * Radix Dialog, so it must now satisfy the one accessible-modal contract its
 * pre-Radix form lacked — an accessible name from the visible title, ESC
 * dismissal, initial focus moved INTO the dialog (the trap), and `aria-modal`.
 * Closed → renders nothing.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ModalShell } from "@/components/shared/ModalShell";

function open(onClose = vi.fn()) {
  render(
    <ModalShell open onClose={onClose} title="Add Spell">
      <div className="modal-body">
        <input aria-label="search" />
        <button type="button">Pick</button>
      </div>
    </ModalShell>
  );
  return onClose;
}

describe("ModalShell — accessible modal contract", () => {
  it("renders nothing while closed", () => {
    const { container } = render(
      <ModalShell open={false} onClose={() => {}} title="Add Spell">
        <p>hidden</p>
      </ModalShell>
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("is a dialog named by its visible title", () => {
    open();
    // Radix marks the Content `role="dialog"` and wires `aria-labelledby` to the
    // visible `.modal-title` (its Dialog.Title) — that is the accessible name.
    // (Radix relies on the live focus trap rather than `aria-modal`.)
    expect(screen.getByRole("dialog")).toHaveAccessibleName(/add spell/i);
  });

  it("moves initial focus INTO the dialog on open (the focus trap is live)", async () => {
    open();
    const dialog = screen.getByRole("dialog");
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
  });

  it("closes on Escape", async () => {
    const onClose = open();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("closes when the header close button is pressed", () => {
    const onClose = open();
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // Regression (v0.16.3): a navigable overlay arms hardware-Back by pushing an
  // `overlay-history` sentinel; a confirm-tier dialog (`backDismiss={false}`)
  // must NOT — its stray retirement `history.back()` raced a flow's
  // useBlocker resolution and broke the level-up leave-guard + bio class-cancel.
  it("pushes a Back sentinel when navigable, none when backDismiss is false", () => {
    const push = vi.spyOn(window.history, "pushState");
    const { unmount } = render(
      <ModalShell open onClose={() => {}} title="Add Spell">
        <div className="modal-body" />
      </ModalShell>
    );
    expect(push).toHaveBeenCalledTimes(1); // sentinel pushed for a normal overlay
    unmount();

    push.mockClear();
    render(
      <ModalShell open backDismiss={false} onClose={() => {}} title="Change build?">
        <div className="modal-body" />
      </ModalShell>
    );
    expect(push).not.toHaveBeenCalled(); // confirm-tier opts out of Back entirely
  });
});
