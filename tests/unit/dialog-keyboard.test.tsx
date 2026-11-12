/**
 * A dialog (a bottom sheet on a phone) rises above the on-screen keyboard (phone pass,
 * 2026-11-12: the d20 field of a check sat under it). The keyboard is read from the
 * visual viewport: what it covers at the bottom becomes the sheet's `--kb` offset, and
 * the field being typed in is scrolled into the part still visible.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act, render } from "@testing-library/react";

import { Dialog } from "@/ui";

class FakeViewport extends EventTarget {
  height = 844;
  offsetTop = 0;
}

afterEach(() => {
  Object.defineProperty(window, "visualViewport", {
    value: undefined,
    configurable: true,
  });
});

describe("Dialog and the keyboard", () => {
  it("lifts by what the keyboard covers, and back down when it closes", () => {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.open = true;
    };
    const vv = new FakeViewport();
    Object.defineProperty(window, "visualViewport", { value: vv, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 844, configurable: true });
    Element.prototype.scrollIntoView = () => {};
    const { container } = render(
      <Dialog open onClose={() => {}} title="Check" closeLabel="Close">
        <input aria-label="d20" />
      </Dialog>
    );
    const dlg = container.ownerDocument.querySelector("dialog") as HTMLDialogElement;
    expect(dlg.style.getPropertyValue("--kb")).toBe("0px");
    act(() => {
      vv.height = 544;
      vv.dispatchEvent(new Event("resize"));
    });
    expect(dlg.style.getPropertyValue("--kb")).toBe("300px");
    act(() => {
      vv.height = 844;
      vv.dispatchEvent(new Event("resize"));
    });
    expect(dlg.style.getPropertyValue("--kb")).toBe("0px");
  });
});
