/**
 * A dialog's list closes on the panel: the actions bar draws its rule only while the
 * body scrolls under it (owner, 2026-11-07: no divider under the last row).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import { Dialog } from "@/ui/Dialog";

let bodyOverflows = false;
const scrollHeight = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollHeight"
);

describe("Dialog footer rule", () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.open = false;
    };
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get(this: HTMLElement) {
        return this.classList.contains("f-bd") && bodyOverflows ? 900 : 0;
      },
    });
  });
  afterEach(() => {
    if (scrollHeight)
      Object.defineProperty(HTMLElement.prototype, "scrollHeight", scrollHeight);
  });

  const open = () =>
    render(
      <Dialog
        open
        onClose={() => {}}
        title="T"
        closeLabel="Close"
        actions={<button>OK</button>}
      >
        <p>row</p>
      </Dialog>
    ).container.ownerDocument.querySelector("dialog.f-dlg");

  it("draws no rule when the whole list fits", () => {
    bodyOverflows = false;
    expect(open()?.hasAttribute("data-scrolls")).toBe(false);
  });

  it("draws the rule while the body scrolls under the actions", () => {
    bodyOverflows = true;
    expect(open()?.hasAttribute("data-scrolls")).toBe(true);
  });
});
