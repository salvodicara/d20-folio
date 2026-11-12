/**
 * The new UI ships dark-only for its first release (owner, 2026-11-11): on the
 * VITE_NEW_UI build the page is always dark, whatever theme is stored, so no classic
 * light token leaks into its screens. The classic build keeps the player's choice.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { useUIStore } from "@/stores/uiStore";

afterEach(() => {
  vi.unstubAllEnvs();
});

function themeAfter(newUi: boolean, theme: "light" | "system") {
  vi.stubEnv("VITE_NEW_UI", newUi ? "1" : "");
  useUIStore.getState().setTheme(theme);
  return document.documentElement.getAttribute("data-theme");
}

describe("new UI theme", () => {
  it("the new UI stays dark when light is chosen", () => {
    expect(themeAfter(true, "light")).toBe("dark");
    expect(themeAfter(true, "system")).toBe("dark");
  });

  it("the classic UI still follows the choice", () => {
    expect(themeAfter(false, "light")).toBe("light");
  });
});
