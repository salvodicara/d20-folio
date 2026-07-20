/**
 * PortraitLightbox (D21) — the full-screen portrait overlay.
 *
 * The owner reported "opening it from Bio has broken z-index (things show above
 * it)". Root cause: it rendered INLINE in the Bio DOM at `z-[200]` — trapped by an
 * ancestor stacking context AND below the folio modal layer (`--z-modal` = 2000).
 * The fix renders it through a body PORTAL on `--z-modal`, so no local stacking
 * context can bury it. This pins the portal + the z-layer + the close affordances.
 *
 * It is backed by Radix `Dialog` — the SAME primitive every other overlay uses — so
 * it shares the ONE ref-counted body scroll-lock (react-remove-scroll) instead of
 * hand-rolling a competing `document.body.style.overflow` lock (a golden-rule-6
 * violation that could strand the body scroll state and freeze the page when a
 * dialog was also open). The scroll-lock section below pins that it NEVER writes
 * `document.body.style.overflow` itself and coexists with a dialog's lock.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { PortraitLightbox } from "@/components/shared/PortraitLightbox";

const SRC = "blob:portrait";

afterEach(cleanup);

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

    // The Radix dialog surface (the backdrop) sits on the modal z-layer (not the
    // old raw z-[200]).
    const dialog = screen.getByRole("dialog");
    expect(dialog.style.zIndex).toBe("var(--z-modal)");
  });

  it("closes on Escape and on the close button; clicking the image does not", () => {
    const onClose = vi.fn();
    render(<PortraitLightbox open src={SRC} name="Lyra" onClose={onClose} />);
    // Clicking the image must NOT close (stopPropagation); the backdrop does.
    fireEvent.click(screen.getByRole("img", { name: "Lyra" }));
    expect(onClose).not.toHaveBeenCalled();

    // Radix drives ESC dismissal (funnelled to onClose via onOpenChange).
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    const close = screen.getByRole("button", { name: /close/i });
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("PortraitLightbox — shared scroll-lock (no hand-rolled body overflow)", () => {
  it("never writes document.body.style.overflow itself (delegates to the shared lock)", () => {
    expect(document.body.style.overflow).toBe("");
    const { rerender } = render(
      <PortraitLightbox open src={SRC} name="Lyra" onClose={() => {}} />
    );
    // The old hand-rolled lock set `document.body.style.overflow = "hidden"` here;
    // the shared react-remove-scroll lock (via Radix) owns body scroll instead, so
    // the lightbox leaves the inline style untouched.
    expect(document.body.style.overflow).toBe("");
    rerender(<PortraitLightbox open={false} src={SRC} name="Lyra" onClose={() => {}} />);
    expect(document.body.style.overflow).toBe("");
  });

  it("coexists with an open Dialog's lock without stranding the body scroll state", () => {
    // A dialog owns the shared ref-counted lock first.
    render(
      <RadixDialog.Root open>
        <RadixDialog.Portal>
          <RadixDialog.Content aria-describedby={undefined}>
            <RadixDialog.Title>dialog</RadixDialog.Title>
            <p>body</p>
          </RadixDialog.Content>
        </RadixDialog.Portal>
      </RadixDialog.Root>
    );
    const baseline = document.body.style.overflow;

    // Opening the lightbox ON TOP of it must not clobber the shared lock…
    const { rerender } = render(
      <PortraitLightbox open src={SRC} name="Lyra" onClose={() => {}} />
    );
    expect(document.body.style.overflow).toBe(baseline);

    // …and closing it must not strand the body (the dialog is still open).
    rerender(<PortraitLightbox open={false} src={SRC} name="Lyra" onClose={() => {}} />);
    expect(document.body.style.overflow).toBe(baseline);
  });
});
