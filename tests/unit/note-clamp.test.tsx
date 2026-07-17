/**
 * NoteClamp — the ONE bounded-preview recipe for indefinitely-growing prose
 * (CAMPAIGN-NOTES-UX: shared notes, session summaries, chronicle chapters).
 *
 * jsdom has no layout, so the overflow verdict is driven by mocking the
 * `scrollHeight` / `clientHeight` getters. The contract (owner, 2026-06-12):
 *   - fits the cap            → no affordance at all (honest blank);
 *   - overflows by a SLIVER   → STILL no affordance — the content renders
 *     unclamped (a "Show more" that reveals a fraction of a scene-break
 *     separator is pure friction);
 *   - overflows meaningfully  → clamped with a "Show more" that expands in
 *     place and a "Show less" that folds back.
 *
 * In jsdom `getComputedStyle` yields no line-height/font-size, so the
 * component's threshold resolves through its constant fallback:
 * 3 lines × 24px = 72px of hidden content.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NoteClamp } from "@/components/shared/NoteClamp";

function mockGeometry(scrollHeight: number, clientHeight: number): void {
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(scrollHeight);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(clientHeight);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("NoteClamp", () => {
  it("renders short content untouched — no affordance, no clamp marker", () => {
    mockGeometry(100, 100); // content fits the cap
    const { container } = render(
      <NoteClamp>
        <p>short note</p>
      </NoteClamp>
    );
    expect(screen.getByText("short note")).toBeInTheDocument();
    // The bound only ENGAGES past the threshold: no toggle, no cap, no fade.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(container.querySelector("[data-collapsed]")).toBeNull();
  });

  it("renders sliver overflow UNCLAMPED — the owner's part-of-a-separator case", () => {
    // The owner's chronicle chapter: the reading cap hid only ~a scene-break
    // separator block (2 × --sp-8 margins + 1px hairline ≈ 65px) — under the
    // 72px jsdom threshold (3 lines). "Show more" would reveal nothing, so the
    // body must render exactly like the short-note path: uncapped, no button.
    mockGeometry(485, 420);
    const { container } = render(
      <NoteClamp variant="reading">
        <p>a chapter that barely overflows</p>
      </NoteClamp>
    );
    expect(screen.getByText("a chapter that barely overflows")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(container.querySelector("[data-collapsed]")).toBeNull();
  });

  it("clamps meaningfully-overflowing content and expands / collapses in place", () => {
    mockGeometry(900, 168); // content far past the cap (hidden 732px ≥ 72px)
    const { container } = render(
      <NoteClamp>
        <p>a very long note</p>
      </NoteClamp>
    );
    const root = container.querySelector(".note-clamp");
    // Collapsed + meaningful overflow → the cap and the fade are active.
    expect(root).toHaveAttribute("data-collapsed");

    const toggle = screen.getByRole("button", { name: /show more/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle.getAttribute("aria-controls")).toBeTruthy();

    // Expand: the cap lifts (data-collapsed drops) and the toggle flips.
    fireEvent.click(toggle);
    expect(root).not.toHaveAttribute("data-collapsed");
    const less = screen.getByRole("button", { name: /show less/i });
    expect(less).toHaveAttribute("aria-expanded", "true");

    // Collapse back: the cap re-engages and "Show more" returns.
    fireEvent.click(less);
    expect(root).toHaveAttribute("data-collapsed");
    expect(screen.getByRole("button", { name: /show more/i })).toBeInTheDocument();
  });

  it("drops the affordance when collapsed content no longer overflows", () => {
    mockGeometry(900, 168);
    const { container, rerender } = render(
      <NoteClamp>
        <p>long</p>
      </NoteClamp>
    );
    fireEvent.click(screen.getByRole("button", { name: /show more/i }));
    // The note was edited down under the cap while expanded…
    mockGeometry(100, 100);
    fireEvent.click(screen.getByRole("button", { name: /show less/i }));
    rerender(
      <NoteClamp>
        <p>now short</p>
      </NoteClamp>
    );
    // …so collapsing re-measures and the affordance disappears entirely.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(container.querySelector("[data-collapsed]")).toBeNull();
  });
});
