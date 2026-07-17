/**
 * PortraitLightbox (D21) — the full-screen portrait overlay.
 *
 * The owner reported "opening it from Bio has broken z-index (things show above
 * it)". Root cause: it rendered INLINE in the Bio DOM at `z-[200]` — trapped by an
 * ancestor stacking context AND below the folio modal layer (`--z-modal` = 2000).
 * The fix renders it through a PORTAL to <body> and sits it on `--z-modal`, so no
 * local stacking context can bury it. This pins the portal + the z-layer + the
 * close affordances.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PortraitLightbox } from "@/components/shared/PortraitLightbox";

const SRC = "blob:portrait";

describe("PortraitLightbox", () => {
  it("renders nothing when closed", () => {
    render(<PortraitLightbox open={false} src={SRC} name="Lyra" onClose={() => {}} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders nothing when there is no src (lettered fallback isn't lightboxed)", () => {
    render(<PortraitLightbox open src="" name="Lyra" onClose={() => {}} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("portals the overlay to <body> on the folio modal z-layer", () => {
    const { container } = render(
      <PortraitLightbox open src={SRC} name="Lyra" onClose={() => {}} />
    );
    // Portal escape: the overlay is NOT inside the component's own container.
    const img = screen.getByRole("img", { name: "Lyra" });
    expect(container.contains(img)).toBe(false);
    expect(document.body.contains(img)).toBe(true);

    // The backdrop sits on the modal z-layer (not the old raw z-[200]).
    const backdrop = img.closest("div");
    expect(backdrop?.style.zIndex).toBe("var(--z-modal)");
  });

  it("closes on backdrop click and on Escape", () => {
    const onClose = vi.fn();
    render(<PortraitLightbox open src={SRC} name="Lyra" onClose={onClose} />);
    // Clicking the image must NOT close (stopPropagation); the backdrop does.
    fireEvent.click(screen.getByRole("img", { name: "Lyra" }));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    const close = screen.getByRole("button", { name: /close/i });
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
