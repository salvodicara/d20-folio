import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
// SLICE 8: i18n bootstrap is async/lazy. Render tests assert across BOTH locales
// (the locale sweep), so eagerly load EN + IT up front — the suite sees every
// locale synchronously, exactly as before the split.
import { i18nReady, ensureLocale } from "@/i18n";
await i18nReady;
await ensureLocale("it");

// Radix FocusScope schedules a `setTimeout(0)` on unmount that dispatches a
// synthetic focus (autofocus-out) event on its container
// (@radix-ui/react-focus-scope/dist/index.mjs). testing-library's auto-cleanup
// unmounts synchronously but does NOT flush that pending macrotask; under
// full-suite load the timer can fire AFTER this file's jsdom realm is torn down,
// landing in the NEXT file's realm — where the cross-realm Event is no longer an
// `instanceof Event`, so `dispatchEvent` throws an unhandled TypeError and Vitest
// exits 1 (all assertions still pass). Fix the leak at the source: unmount
// explicitly (idempotent alongside auto-cleanup, robust to hook ordering), then
// drain one macrotask so FocusScope's own `setTimeout(0)` fires HARMLESSLY in
// THIS realm. A second `setTimeout(0)` queued after cleanup is guaranteed to run
// behind FocusScope's, so the leaked timer is always flushed — never suppressed.
afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 0));
});

// jsdom does not implement ResizeObserver; Radix's Popper (Popover / Tooltip
// positioning) reads it on open. A minimal no-op stub lets those overlays mount
// under test (they don't assert layout — only presence/behaviour).
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}

// jsdom does not implement window.scrollTo (creation finish scrolls the new sheet to
// the top); stub it so that path doesn't log "Not implemented" under test.
if (typeof window !== "undefined") {
  window.scrollTo = () => {};
}

// jsdom does not implement Element.scrollIntoView; the command palette scrolls the
// roving keyboard highlight into view. A no-op stub lets those flows run under test.
if (
  typeof Element !== "undefined" &&
  typeof Element.prototype.scrollIntoView !== "function"
) {
  Element.prototype.scrollIntoView = () => {};
}

// jsdom does not implement matchMedia; provide a minimal stub so modules that
// read it at import time (e.g. uiStore theme handling) work under test.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
}

// jsdom's localStorage.setItem is non-functional under this vitest config
// (see the `--localstorage-file` warning), which breaks zustand `persist`
// stores. Back it with a working in-memory implementation when unusable.
if (typeof window !== "undefined") {
  let usable = false;
  try {
    window.localStorage.setItem("__probe__", "1");
    window.localStorage.removeItem("__probe__");
    usable = true;
  } catch {
    // localStorage probe failed → fall through to the in-memory shim
  }
  if (!usable) {
    const m = new Map<string, string>();
    const ls = {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
      clear: () => m.clear(),
      key: (i: number) => Array.from(m.keys())[i] ?? null,
      get length() {
        return m.size;
      },
    };
    try {
      Object.defineProperty(window, "localStorage", { value: ls, configurable: true });
      Object.defineProperty(globalThis, "localStorage", {
        value: ls,
        configurable: true,
      });
    } catch {
      /* leave as-is if the environment forbids redefining */
    }
  }
}
