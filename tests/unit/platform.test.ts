/**
 * #42 — platform-aware shortcut labels (⌘ on Mac, Ctrl elsewhere). The palette
 * opens on both Meta+K and Ctrl+K; only the hint glyph was Mac-hardcoded.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { isMac, shortcutLabel } from "@/lib/platform";

function stubPlatform(platform: string, userAgent = ""): void {
  vi.stubGlobal("navigator", { platform, userAgent });
}

function stubUaData(platform: string): void {
  // Modern signal present — the legacy fields are deliberately misleading to prove
  // `userAgentData.platform` wins.
  vi.stubGlobal("navigator", {
    userAgentData: { platform },
    platform: "MacIntel",
    userAgent: "Mozilla/5.0 (Macintosh)",
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("platform shortcut labels (#42)", () => {
  it("uses ⌘ on macOS", () => {
    stubPlatform("MacIntel");
    expect(isMac()).toBe(true);
    expect(shortcutLabel("K")).toBe("⌘K");
  });

  it("detects iOS too", () => {
    stubPlatform("", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)");
    expect(isMac()).toBe(true);
  });

  it("uses Ctrl on Windows / Linux", () => {
    stubPlatform("Win32");
    expect(isMac()).toBe(false);
    expect(shortcutLabel("K")).toBe("Ctrl K");

    stubPlatform("Linux x86_64");
    expect(shortcutLabel("K")).toBe("Ctrl K");
  });

  it("prefers the modern userAgentData.platform when present", () => {
    // Even with a Mac legacy platform/UA, a "Windows" userAgentData wins → Ctrl.
    stubUaData("Windows");
    expect(isMac()).toBe(false);
    expect(shortcutLabel("K")).toBe("Ctrl K");

    stubUaData("macOS");
    expect(isMac()).toBe(true);
    expect(shortcutLabel("K")).toBe("⌘K");
  });

  it("falls back to the legacy probe when userAgentData is absent", () => {
    // SSR-style guard: no navigator at all → not Mac (Ctrl).
    vi.stubGlobal("navigator", undefined);
    expect(isMac()).toBe(false);
  });
});
