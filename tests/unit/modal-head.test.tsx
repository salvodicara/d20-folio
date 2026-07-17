/**
 * ModalHead atom — the ONE branded modal header shared by both modal primitives
 * (`ModalShell` controlled-close + `ui/dialog.tsx` Radix-Close). Locks the
 * contract both rely on: the rubric/title/subtitle render, the title is the
 * dialog's accessible name, and the close mode switches on `onClose`.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { ModalHead, ModalBody, ModalFoot } from "@/components/ui/modal-head";

function Host({ children }: { children: React.ReactNode }) {
  return (
    <RadixDialog.Root open>
      <RadixDialog.Content>{children}</RadixDialog.Content>
    </RadixDialog.Root>
  );
}

describe("ModalHead", () => {
  it("renders the rubric, title (as the dialog name) and subtitle", () => {
    render(
      <Host>
        <ModalHead rubric="History" title="Snapshots" subtitle="3 saved" />
      </Host>
    );
    // The title doubles as the Radix Dialog.Title → the dialog's accessible name.
    expect(screen.getByRole("dialog", { name: "Snapshots" })).toBeInTheDocument();
    expect(screen.getByText("History")).toHaveClass("modal-rubric");
    expect(screen.getByText("3 saved")).toBeInTheDocument();
  });

  it("the title WRAPS — never ellipsized (owner 2026-06-11: the leave-confirm cut its title)", () => {
    render(
      <Host>
        <ModalHead title="Abbandonare il passaggio di livello?" />
      </Host>
    );
    // Regression: `truncate` (overflow:hidden + ellipsis + nowrap) on the title
    // cut "Abbandonare il passaggio di liv…" at modal-sm width. The dialog's one
    // identifying line must always be fully legible.
    const title = screen.getByText("Abbandonare il passaggio di livello?");
    expect(title.classList.contains("truncate")).toBe(false);
  });

  it("controlled mode: `onClose` renders a plain button that fires the handler", () => {
    const onClose = vi.fn();
    render(
      <Host>
        <ModalHead title="Add Spell" closeLabel="Close" onClose={onClose} />
      </Host>
    );
    const close = screen.getByRole("button", { name: "Close" });
    expect(close).toHaveClass("modal-close");
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("uncontrolled mode: omitting `onClose` still renders a labelled close control", () => {
    render(
      <Host>
        <ModalHead title="Report" closeLabel="Dismiss" />
      </Host>
    );
    // Radix Dialog.Close is a <button> carrying the same class + label.
    expect(screen.getByRole("button", { name: "Dismiss" })).toHaveClass("modal-close");
  });
});

describe("ModalBody / ModalFoot", () => {
  it("ModalBody is a .modal-body that forwards native props (e.g. onKeyDown)", () => {
    const onKeyDown = vi.fn();
    render(
      <ModalBody data-testid="b" onKeyDown={onKeyDown}>
        body
      </ModalBody>
    );
    const el = screen.getByTestId("b");
    expect(el).toHaveClass("modal-body");
    // The scroll region is keyboard-focusable so non-pointer users can reach and
    // arrow-scroll it (axe `scrollable-region-focusable`).
    expect(el).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(el, { key: "ArrowDown" });
    expect(onKeyDown).toHaveBeenCalledTimes(1);
  });

  it("ModalFoot is a .modal-foot that merges className", () => {
    render(
      <ModalFoot data-testid="f" className="justify-between">
        actions
      </ModalFoot>
    );
    expect(screen.getByTestId("f")).toHaveClass("modal-foot", "justify-between");
  });
});
