/**
 * useGlobalShortcuts (§3.2–3.4) — the global keyboard listener. Pins: `/` opens the
 * palette, ⌘K toggles it (even under a dialog / while typing), the `g`-prefix
 * sequences navigate via `realmTarget` (honoring tab query-memory), `g a` is
 * admin-gated, and typing targets / dialogs are ignored for the non-⌘K keys.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { recordRealmVisit } from "@/lib/realm-memory";

const { navigateMock, isAdminState } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  isAdminState: { value: false },
}));

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return { ...actual, useNavigate: () => navigateMock };
});
// useIsAdmin is fully mocked (below), so Firebase never actually loads — but the
// CI-safety guard scans the STATIC import graph, so declare the firebase mock too.
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/hooks/useIsAdmin", () => ({ useIsAdmin: () => isAdminState.value }));

import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts";

const setPaletteOpen = vi.fn();

function Harness() {
  useGlobalShortcuts({ setPaletteOpen });
  return (
    <div>
      <input data-testid="field" />
      <div data-testid="dialog" role="dialog">
        <button data-testid="in-dialog">x</button>
      </div>
    </div>
  );
}

function mount() {
  return render(
    <MemoryRouter>
      <Harness />
    </MemoryRouter>
  );
}

beforeEach(() => {
  navigateMock.mockReset();
  setPaletteOpen.mockReset();
  isAdminState.value = false;
});
afterEach(cleanup);

describe("useGlobalShortcuts — palette keys", () => {
  it("`/` opens the palette", () => {
    mount();
    fireEvent.keyDown(document.body, { key: "/" });
    expect(setPaletteOpen).toHaveBeenCalledWith(true);
  });

  it("⌘K / Ctrl+K toggles the palette (functional updater)", () => {
    mount();
    fireEvent.keyDown(document.body, { key: "k", metaKey: true });
    expect(setPaletteOpen).toHaveBeenCalledTimes(1);
    expect(typeof setPaletteOpen.mock.calls[0]?.[0]).toBe("function");
  });

  it("⌘K still fires while typing / under a dialog (the exception)", () => {
    const { getByTestId } = mount();
    fireEvent.keyDown(getByTestId("field"), { key: "k", ctrlKey: true });
    fireEvent.keyDown(getByTestId("in-dialog"), { key: "k", metaKey: true });
    expect(setPaletteOpen).toHaveBeenCalledTimes(2);
  });

  it("`/` is inert while typing and under a dialog", () => {
    const { getByTestId } = mount();
    fireEvent.keyDown(getByTestId("field"), { key: "/" });
    fireEvent.keyDown(getByTestId("in-dialog"), { key: "/" });
    expect(setPaletteOpen).not.toHaveBeenCalled();
  });
});

describe("useGlobalShortcuts — go-to sequences", () => {
  it("`g` then `2` navigates to the campaigns realm via realmTarget", () => {
    // Seed a remembered query so realmTarget (not a bare path) is provably used.
    recordRealmVisit("/campaigns", "?tab=roster");
    mount();
    fireEvent.keyDown(document.body, { key: "g" });
    fireEvent.keyDown(document.body, { key: "2" });
    expect(navigateMock).toHaveBeenCalledWith("/campaigns?tab=roster");
  });

  it("`g` then `1` navigates to Characters", () => {
    mount();
    fireEvent.keyDown(document.body, { key: "g" });
    fireEvent.keyDown(document.body, { key: "1" });
    expect(navigateMock).toHaveBeenCalledWith("/characters");
  });

  it("a lone digit (no preceding `g`) does nothing", () => {
    mount();
    fireEvent.keyDown(document.body, { key: "2" });
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("`g s` navigates to Settings", () => {
    mount();
    fireEvent.keyDown(document.body, { key: "g" });
    fireEvent.keyDown(document.body, { key: "s" });
    expect(navigateMock).toHaveBeenCalledWith("/settings");
  });

  it("`g a` is silent for a non-admin, navigates for an admin", () => {
    mount();
    fireEvent.keyDown(document.body, { key: "g" });
    fireEvent.keyDown(document.body, { key: "a" });
    expect(navigateMock).not.toHaveBeenCalled();

    isAdminState.value = true;
    cleanup();
    mount();
    fireEvent.keyDown(document.body, { key: "g" });
    fireEvent.keyDown(document.body, { key: "a" });
    expect(navigateMock).toHaveBeenCalledWith("/admin");
  });

  it("ignores sequences that start while typing in a field", () => {
    const { getByTestId } = mount();
    fireEvent.keyDown(getByTestId("field"), { key: "g" });
    fireEvent.keyDown(getByTestId("field"), { key: "2" });
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("a chord modifier voids a sequence key", () => {
    mount();
    fireEvent.keyDown(document.body, { key: "g", metaKey: true });
    fireEvent.keyDown(document.body, { key: "2" });
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
