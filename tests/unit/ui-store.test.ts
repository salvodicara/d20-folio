import { describe, it, expect, beforeEach } from "vitest";
import { useUIStore } from "@/stores/uiStore";

const s = () => useUIStore.getState();
beforeEach(() => {
  useUIStore.setState({
    sidebarOpen: false,
    sheetMode: "play",
    playRefSections: {},
  });
});

describe("uiStore", () => {
  // The app is dark only (owner 2026-10-16): no theme state or setter, and
  // <html> carries data-theme="dark" from import on.
  it("pins data-theme=dark and exposes no theme switcher", () => {
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    const state = s() as unknown as Record<string, unknown>;
    expect(state.setTheme).toBeUndefined();
  });

  it("ignores a theme persisted by an older build", async () => {
    localStorage.setItem(
      "d20-folio-ui",
      JSON.stringify({ state: { theme: "light", sheetMode: "edit" }, version: 0 })
    );
    await useUIStore.persist.rehydrate();
    expect(s().sheetMode).toBe("edit");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("does not persist a theme", () => {
    s().setSheetMode("edit");
    const raw = localStorage.getItem("d20-folio-ui");
    const persisted = JSON.parse(raw as string) as { state: Record<string, unknown> };
    expect(persisted.state.theme).toBeUndefined();
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

  it("setPlayRefOpen records a Play-tab section's open/closed state (default closed)", () => {
    // A missing key is CLOSED — both foot blocks default collapsed.
    expect(s().playRefSections.playbook).toBeUndefined();
    s().setPlayRefOpen("playbook", true);
    expect(s().playRefSections.playbook).toBe(true);
    // Independent per section id, and toggling back closes it.
    s().setPlayRefOpen("rules", true);
    s().setPlayRefOpen("playbook", false);
    expect(s().playRefSections).toEqual({ playbook: false, rules: true });
  });

  it("persists playRefSections to localStorage so a fold survives a reload", () => {
    s().setPlayRefOpen("rules", true);
    const raw = localStorage.getItem("d20-folio-ui");
    expect(raw).toBeTruthy();
    const persisted = JSON.parse(raw as string) as {
      state: { playRefSections?: Record<string, boolean> };
    };
    expect(persisted.state.playRefSections?.rules).toBe(true);
  });
});
