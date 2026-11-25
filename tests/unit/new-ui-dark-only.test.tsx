/**
 * The new UI ships dark-only for its first release (owner, 2026-11-11): on the
 * VITE_NEW_UI build the page is always dark, whatever theme is stored, so no classic
 * light token leaks into its screens. The classic build keeps the player's choice.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { setNewUiFrame, useUIStore } from "@/stores/uiStore";

afterEach(() => {
  vi.unstubAllEnvs();
  setNewUiFrame(false);
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

  // #1233: the new interface is a per-player choice, so the frame says it at run time.
  it("a player who turns the new interface on gets dark at once, and their theme back when off", () => {
    expect(themeAfter(false, "light")).toBe("light");
    setNewUiFrame(true);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    useUIStore.getState().setTheme("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    setNewUiFrame(false);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
});
