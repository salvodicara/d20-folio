import { describe, it, expect, beforeEach } from "vitest";
import { useUIStore } from "@/stores/uiStore";

const s = () => useUIStore.getState();
beforeEach(() => {
  useUIStore.setState({
    theme: "dark",
    sidebarOpen: false,
    sheetMode: "play",
  });
});

describe("uiStore", () => {
  it("setTheme updates theme and applies data-theme to <html>", () => {
    s().setTheme("light");
    expect(s().theme).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("setTheme('system') resolves to light when system is not dark (stubbed matchMedia)", () => {
    s().setTheme("system");
    expect(s().theme).toBe("system");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("toggleSidebar flips sidebarOpen", () => {
    s().toggleSidebar();
    expect(s().sidebarOpen).toBe(true);
    s().toggleSidebar();
    expect(s().sidebarOpen).toBe(false);
  });

  it("setSidebarOpen sets explicitly", () => {
    s().setSidebarOpen(true);
    expect(s().sidebarOpen).toBe(true);
  });

  it("setSheetMode + toggleSheetMode cycle play↔edit", () => {
    s().setSheetMode("edit");
    expect(s().sheetMode).toBe("edit");
    s().toggleSheetMode();
    expect(s().sheetMode).toBe("play");
    s().toggleSheetMode();
    expect(s().sheetMode).toBe("edit");
  });

  // Motion has NO in-app toggle (removed Owner-feedback 2026-06-07): the store
  // exposes no motion state/setter, and `data-motion` is a pure mirror of the OS
  // prefers-reduced-motion setting (written by the index.html boot script + the
  // uiStore listener). Guard against an in-app toggle creeping back in.
  it("exposes no in-app motion toggle", () => {
    const state = s() as unknown as Record<string, unknown>;
    expect(state.motion).toBeUndefined();
    expect(state.setMotion).toBeUndefined();
    expect(state.toggleMotion).toBeUndefined();
  });

  it("mirrors the OS reduced-motion preference onto <html> at import", () => {
    // The jsdom matchMedia stub reports no preference → data-motion="auto".
    expect(document.documentElement.getAttribute("data-motion")).toBe("auto");
  });
});
