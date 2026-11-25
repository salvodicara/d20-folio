/**
 * The new UI's confirm (#1230): while the new shell is mounted, a confirm asked
 * through the app's one store is drawn as a new-UI pane and the classic dialog stands
 * down; «Continue» answers no, «Discard» answers yes; without the new shell the
 * classic dialog draws it as before.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { NewConfirm } from "@/app/NewConfirm";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useConfirmStore } from "@/stores/confirmStore";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
  };
});
afterEach(() =>
  useConfirmStore.setState({ open: false, options: null, _resolve: null, newHost: false })
);

const ask = () => {
  let answer: boolean | undefined;
  act(() => {
    void useConfirmStore
      .getState()
      .confirm({
        title: "Leave?",
        message: "Lost.",
        confirmLabel: "Discard",
        cancelLabel: "Continue",
        tone: "danger",
      })
      .then((v) => (answer = v));
  });
  return () => answer;
};

describe("NewConfirm", () => {
  it("draws the prompt as a new-UI pane; the classic one stands down", async () => {
    render(
      <div className="fui">
        <NewConfirm />
        <ConfirmDialog />
      </div>
    );
    const answer = ask();
    expect(screen.getAllByText("Lost.")).toHaveLength(1);
    expect(screen.getByRole("dialog").classList.contains("f-dlg")).toBe(true);
    const discard = screen.getByRole("button", { name: "Discard" });
    expect(discard.getAttribute("data-kind")).toBe("danger");
    fireEvent.click(discard);
    await act(async () => Promise.resolve());
    expect(answer()).toBe(true);
  });

  it("«Continue» answers no", async () => {
    render(<NewConfirm />);
    const answer = ask();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await act(async () => Promise.resolve());
    expect(answer()).toBe(false);
  });

  it("without the new shell the classic dialog draws it", () => {
    render(<ConfirmDialog />);
    ask();
    expect(screen.getByText("Lost.")).toBeTruthy();
  });
});
