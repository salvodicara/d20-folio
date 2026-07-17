/**
 * AppShell — the ONE persistent Suspense boundary around the routed <Outlet>.
 *
 * Structural pin for the navigation-feel fix. The heavy routes are `React.lazy`, and
 * React.lazy ALWAYS suspends on a FRESH boundary's first render — so a per-route
 * `<Suspense>` (the retired `router.tsx` `suspend()` wrapper) blanked the content then
 * flashed the loader on the first eager→lazy leg (roster→campaigns). The single
 * boundary now lives in AppShell, above the <Outlet>, so it stays mounted across every
 * navigation and the previous page keeps painting until the next chunk resolves.
 *
 * This pins the boundary's PLACEMENT — the fact that must not regress:
 *   • a route element that suspends is CAUGHT (render does not throw) — only a Suspense
 *     boundary AROUND the Outlet can catch a suspension that reaches this far; without
 *     one it would propagate past the shell and crash the render;
 *   • the shell chrome renders OUTSIDE the boundary, so it never unmounts while a route
 *     loads;
 *   • a resolved route renders its content THROUGH the same Outlet.
 * The loader's timed appearance (its ~250ms delay) is a browser-verified frame concern:
 * jsdom does not flush a Suspense fallback's passive effects, so its delay timer never
 * fires here — asserting the visible d20 belongs to the real-Chromium frame check.
 */

import { describe, it, expect, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import { use, useEffect, type ReactNode } from "react";
import { AppShell } from "@/app/AppShell";
import { useUIStore } from "@/stores/uiStore";

// Isolate the shell to its structural skeleton: the chrome children reach firebase /
// heavy graphs transitively and are irrelevant to the boundary placement, so stub them
// to bare markers. The one thing left real is the <Suspense> AppShell wraps its
// <Outlet> in — what this test exercises.
vi.mock("@/lib/firebase", () => ({ db: {}, auth: {}, storage: {} }));
vi.mock("@/app/shell/Topbar", () => ({
  Topbar: () => <div data-testid="chrome-topbar">topbar</div>,
}));
vi.mock("@/app/shell/CommandPalette", () => ({ CommandPalette: () => null }));
vi.mock("@/app/shell/MobileBottomNav", () => ({ MobileBottomNav: () => null }));
vi.mock("@/app/shell/SiteFooter", () => ({ SiteFooter: () => null }));
vi.mock("@/app/shell/DevActAsDock", () => ({ DevActAsDock: () => null }));
vi.mock("@/app/ScrollRestorer", () => ({ ScrollRestorer: () => null }));
vi.mock("@/features/roster/ImportCharacterHost", () => ({
  ImportCharacterHost: () => null,
}));
vi.mock("@/app/route-prefetch", () => ({ prefetchLikelyRoutes: () => {} }));
vi.mock("@/features/campaigns/global-combat", () => ({
  GlobalCombatMount: () => null,
}));
// A lifecycle probe standing in for the lazy `?` shortcuts sheet, so the sticky-mount
// test below can assert the shell KEEPS it mounted after close (a conditional unmount
// tore it down the same tick, so Radix's exit animation never played — the sheet
// snapped away while every other overlay fades out).
const sheetLifecycle = vi.hoisted(() => ({ unmounts: 0 }));
vi.mock("@/components/shared/ShortcutsSheet", () => ({
  ShortcutsSheet: () => {
    useEffect(() => {
      return () => {
        sheetLifecycle.unmounts++;
      };
    }, []);
    return <div data-testid="shortcuts-sheet-probe" />;
  },
}));

// A route element that suspends forever (a promise that never resolves), standing in
// for a lazy chunk that has not yet loaded.
const FOREVER = new Promise<never>(() => {});
function Suspends(): never {
  use(FOREVER);
  throw new Error("unreachable");
}

function renderShell(element: ReactNode) {
  return render(
    <MemoryRouter initialEntries={["/x"]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/x" element={element} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe("AppShell — persistent Suspense boundary around <Outlet>", () => {
  it("catches a suspending route (does not crash) while chrome stays mounted", () => {
    // If AppShell did NOT wrap its Outlet in Suspense, this suspension would propagate
    // past the shell with no boundary and render() would throw. It doesn't — the
    // boundary caught it — and the chrome, rendered outside the boundary, is present.
    const { getByTestId } = renderShell(<Suspends />);
    expect(getByTestId("chrome-topbar")).toBeInTheDocument();
  });

  it("passes a resolved route's content through the same Outlet", () => {
    const { getByText, getByTestId } = renderShell(<div>route content</div>);
    expect(getByTestId("chrome-topbar")).toBeInTheDocument();
    expect(getByText("route content")).toBeInTheDocument();
  });

  it("keeps the `?` shortcuts sheet MOUNTED after close (sticky mount — the exit animation must get to play)", async () => {
    const { findByTestId, getByTestId, queryByTestId } = renderShell(
      <div>route content</div>
    );
    // Off the eager path: nothing mounts until the first open.
    expect(queryByTestId("shortcuts-sheet-probe")).toBeNull();
    act(() => {
      useUIStore.setState({ shortcutsOpen: true });
    });
    expect(await findByTestId("shortcuts-sheet-probe")).toBeInTheDocument();
    // Closing flips the store flag but must NOT unmount the sheet subtree — the
    // sheet itself drives its Radix Dialog off `shortcutsOpen`, and only a
    // still-mounted dialog can run its data-state="closed" exit animation.
    act(() => {
      useUIStore.setState({ shortcutsOpen: false });
    });
    expect(getByTestId("shortcuts-sheet-probe")).toBeInTheDocument();
    expect(sheetLifecycle.unmounts).toBe(0);
  });
});
