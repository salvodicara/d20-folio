/**
 * usePWAInstall — the install-prompt capture hook.
 *
 * Pins the item-(a) fix: dismissal is PERSISTED to localStorage, so once the user
 * waves the install banner away it stays away across a "refresh" (a fresh hook
 * mount) AND across a later `beforeinstallprompt`. The old volatile `useState` in
 * PWABanner reset on every reload, resurrecting the banner.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, renderHook } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// saveStore wires its status callbacks into the Firestore save pipeline at module
// load; mock the seam so this CI-pure test never touches Firebase (guard rule).
vi.mock("@/lib/firestore", () => ({ saveStatusCallbacks: {} }));

import { usePWAInstall } from "@/hooks/usePWAInstall";
import { PWABanner } from "@/components/shared/PWABanner";
import { useSaveStore } from "@/stores/saveStore";

const KEY = "d20-folio-pwa-install-dismissed";

/** Fire a `beforeinstallprompt` so `canInstall` can become true. */
function fireBeforeInstallPrompt(): void {
  const e = new Event("beforeinstallprompt") as Event & {
    prompt?: () => Promise<void>;
    userChoice?: Promise<{ outcome: string; platform: string }>;
  };
  e.prompt = () => Promise.resolve();
  e.userChoice = Promise.resolve({ outcome: "dismissed", platform: "web" });
  window.dispatchEvent(e);
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("usePWAInstall", () => {
  it("offers install after beforeinstallprompt, then hides it permanently on dismiss", () => {
    const { result } = renderHook(() => usePWAInstall());
    expect(result.current.canInstall).toBe(false);

    act(() => fireBeforeInstallPrompt());
    expect(result.current.canInstall).toBe(true);

    act(() => result.current.dismissInstall());
    expect(result.current.canInstall).toBe(false);
    expect(window.localStorage.getItem(KEY)).toBe("true");
  });

  it("stays dismissed across a refresh (fresh mount) and a later prompt event", () => {
    window.localStorage.setItem(KEY, "true");

    // A fresh mount == a page refresh: the persisted flag must seed `dismissed`.
    const { result } = renderHook(() => usePWAInstall());
    expect(result.current.canInstall).toBe(false);

    // Even a brand-new beforeinstallprompt must NOT resurrect the banner.
    act(() => fireBeforeInstallPrompt());
    expect(result.current.canInstall).toBe(false);
  });
});

describe("PWABanner viewport anchoring", () => {
  it("the offline strip is FIXED to the viewport bottom on every breakpoint", () => {
    // PWABanner mounts AFTER the router (App.tsx), so a static banner lands at
    // the END of the document, below the footer, where desktop users never see
    // "You are offline". The wrapper must stay viewport-fixed with NO
    // static-at-md escape hatch (the regression this pins: `md:static`). The
    // positioning now lives in the `.pwa-dock` folio recipe — pin BOTH the
    // class on the wrapper and the recipe's `position: fixed` in folio.css.
    act(() => useSaveStore.getState().setOnline(false));
    try {
      const { container } = render(<PWABanner />);
      const wrapper = container.firstElementChild;
      expect(wrapper).not.toBeNull();
      expect(wrapper?.className).toContain("pwa-dock");

      const folio = readFileSync(
        resolve(__dirname, "../../src/styles/folio.css"),
        "utf8"
      );
      const recipe = folio.slice(folio.indexOf(".pwa-dock {"));
      expect(recipe).toContain("position: fixed");
      // The phone lift: the dock clears the realm-switcher bottom-nav whenever
      // that nav is mounted, so the nav stays tappable while offline.
      expect(folio).toContain("body:has(.m-nav) .pwa-dock");
    } finally {
      act(() => useSaveStore.getState().setOnline(true));
    }
  });

  it("publishes --pwa-banner-h while visible and removes it when hidden", () => {
    // The footer-occlusion fix (owner, 2026-06-10): the dock's measured height
    // is published on <html> so the AppShell reserves matching bottom padding —
    // the footer is pushed ABOVE the strip instead of being covered by it. The
    // variable must vanish when the banner hides, collapsing the padding.
    const rootStyle = document.documentElement.style;
    act(() => useSaveStore.getState().setOnline(false));
    try {
      const { unmount } = render(<PWABanner />);
      // jsdom has no layout: offsetHeight is 0, but the PRESENCE/lifecycle of
      // the variable is the contract (real height comes from ResizeObserver).
      expect(rootStyle.getPropertyValue("--pwa-banner-h")).toMatch(/^\d+px$/);
      unmount();
      expect(rootStyle.getPropertyValue("--pwa-banner-h")).toBe("");
    } finally {
      act(() => useSaveStore.getState().setOnline(true));
    }
  });

  it("clears --pwa-banner-h when the app comes back online (banner hides)", () => {
    const rootStyle = document.documentElement.style;
    act(() => useSaveStore.getState().setOnline(false));
    try {
      render(<PWABanner />);
      expect(rootStyle.getPropertyValue("--pwa-banner-h")).not.toBe("");
      act(() => useSaveStore.getState().setOnline(true));
      expect(rootStyle.getPropertyValue("--pwa-banner-h")).toBe("");
    } finally {
      act(() => useSaveStore.getState().setOnline(true));
    }
  });
});
