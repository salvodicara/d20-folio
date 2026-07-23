/**
 * useRealmBackdrop — the shared per-realm backdrop swap (DESIGN.md §13
 * "Per-route backdrop override").
 *
 * Pins: mounting points `--app-bg-art` at the given css-var reference (so the
 * per-theme cascade keeps resolving the sibling plate); an optional position
 * biases `--app-bg-art-position`; and unmount clears BOTH so the app-wide
 * default backdrop returns.
 */

import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useRealmBackdrop } from "@/hooks/useRealmBackdrop";

const rootStyle = () => document.documentElement.style;

describe("useRealmBackdrop", () => {
  it("sets --app-bg-art while mounted and clears it on unmount", () => {
    const { unmount } = renderHook(() =>
      useRealmBackdrop("var(--asset-compendium-scene)")
    );
    expect(rootStyle().getPropertyValue("--app-bg-art")).toBe(
      "var(--asset-compendium-scene)"
    );
    // No position given → the painter's `center top` default stays untouched.
    expect(rootStyle().getPropertyValue("--app-bg-art-position")).toBe("");
    unmount();
    expect(rootStyle().getPropertyValue("--app-bg-art")).toBe("");
  });

  it("biases the cover focal via --app-bg-art-position when given, restoring on unmount", () => {
    const { unmount } = renderHook(() =>
      useRealmBackdrop("var(--asset-compendium-scene)", "center bottom")
    );
    expect(rootStyle().getPropertyValue("--app-bg-art-position")).toBe("center bottom");
    unmount();
    expect(rootStyle().getPropertyValue("--app-bg-art-position")).toBe("");
  });
});
