/**
 * Guard (§6 / §7.2): a cockpit TAB switch is center-panel view state only — it
 * must NOT re-render the persistent Left / Right HUD. Renders the real
 * `CharacterCockpit` with pass-through wrappers that count each HUD render, flips
 * a tab, and asserts the HUD render counts are unchanged.
 *
 * Firebase is mocked (so this cockpit-rendering test stays CI-pure) and the
 * character subscription is a no-op (no Firestore listener); the store is seeded
 * directly with the canonical mock.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";

vi.mock("@/lib/firebase", () => ({}));
vi.mock("@/hooks/useCharacterSubscription", () => ({
  useCharacterSubscription: () => {},
}));

const { leftSpy, rightSpy } = vi.hoisted(() => ({
  leftSpy: vi.fn(),
  rightSpy: vi.fn(),
}));

vi.mock("@/features/character/hud/LeftHud", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/features/character/hud/LeftHud")>();
  return {
    LeftHud: () => {
      leftSpy();
      return <actual.LeftHud />;
    },
  };
});
vi.mock("@/features/character/hud/RightHud", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/features/character/hud/RightHud")>();
  return {
    RightHud: () => {
      rightSpy();
      return <actual.RightHud />;
    },
  };
});

import { CharacterCockpit } from "@/features/character/CharacterCockpit";
import { useCharacterStore } from "@/stores/characterStore";
import { useUIStore } from "@/stores/uiStore";
import { MOCK_CHARACTER } from "@/lib/mock";

function renderCockpit(initialEntry = "/characters/mock-1") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/characters/:characterId" element={<CharacterCockpit />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("cockpit render isolation — a tab switch never re-renders the HUDs", () => {
  beforeEach(() => {
    leftSpy.mockClear();
    rightSpy.mockClear();
    useUIStore.setState({ sheetMode: "play" });
    useCharacterStore.setState({
      character: { ...MOCK_CHARACTER },
      loading: false,
      error: null,
    });
  });

  it("switching to another tab leaves the Left/Right HUD render count unchanged", () => {
    renderCockpit();
    const leftAtMount = leftSpy.mock.calls.length;
    const rightAtMount = rightSpy.mock.calls.length;
    expect(leftAtMount).toBeGreaterThan(0);
    expect(rightAtMount).toBeGreaterThan(0);

    // Flip the center tab (in-view STATE — Task 2 §6.2/§6.3).
    const spellsTab = screen.getByRole("tab", { name: /spells/i });
    fireEvent.click(spellsTab);
    expect(spellsTab).toHaveAttribute("aria-selected", "true");

    // The persistent rails did not re-render — the change stayed in the center.
    expect(leftSpy.mock.calls.length).toBe(leftAtMount);
    expect(rightSpy.mock.calls.length).toBe(rightAtMount);
  });

  it("switching across several REAL content tabs never re-renders the HUDs", () => {
    renderCockpit();
    const leftAtMount = leftSpy.mock.calls.length;
    const rightAtMount = rightSpy.mock.calls.length;

    // Walk through the now-real (Phase-3C) content tabs in turn — each carries a
    // full re-homed sheet view, yet the persistent rails must stay put.
    for (const name of [/spells/i, /inventory/i, /features/i, /bio/i, /combat/i]) {
      const tab = screen.getByRole("tab", { name });
      fireEvent.click(tab);
      expect(tab).toHaveAttribute("aria-selected", "true");
    }

    expect(leftSpy.mock.calls.length).toBe(leftAtMount);
    expect(rightSpy.mock.calls.length).toBe(rightAtMount);
  });

  it("toggling edit mode lights the frame WITHOUT re-rendering the HUDs (§7.2)", () => {
    const { container } = renderCockpit();
    const leftAtMount = leftSpy.mock.calls.length;
    const rightAtMount = rightSpy.mock.calls.length;

    // Flip the global edit mode (the one uiStore signal the header pill drives).
    act(() => {
      useUIStore.setState({ sheetMode: "edit" });
    });

    // The center content column lit its EDITING frame…
    expect(container.querySelector(".content")).toHaveAttribute("data-mode", "edit");
    // …yet the persistent rails did not re-render — only the shell flipped.
    expect(leftSpy.mock.calls.length).toBe(leftAtMount);
    expect(rightSpy.mock.calls.length).toBe(rightAtMount);
  });

  it("seeds the active tab from the `?tab=` deep-link at mount", () => {
    renderCockpit("/characters/mock-1?tab=spells");
    // The deep-linked tab is the one selected (in-view STATE, not a sub-route).
    expect(screen.getByRole("tab", { name: /spells/i })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByRole("tab", { name: /combat/i })).toHaveAttribute(
      "aria-selected",
      "false"
    );
  });
});
