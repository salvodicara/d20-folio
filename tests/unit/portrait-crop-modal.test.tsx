/**
 * PortraitCropModal — shell regression (P4 bio pass).
 *
 * The crop dialog's body is fixed-height (crop stage + zoom slider + actions),
 * but the shell mounted at the default 88vh tier, leaving a huge dead void
 * below the actions. Pins the content-hugging `compact` tier.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PortraitCropModal } from "@/components/shared/PortraitCropModal";

describe("PortraitCropModal", () => {
  it("hugs its content (compact shell, never the fixed 88vh tier)", () => {
    render(
      <PortraitCropModal
        open
        imageSrc="blob:portrait"
        onConfirm={() => {}}
        onClose={() => {}}
      />
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.classList.contains("modal")).toBe(true);
    // max-h-[88vh] (the cap) stays; the fixed h-[88vh] tier must not.
    expect(dialog.classList.contains("h-[88vh]")).toBe(false);
  });
});
