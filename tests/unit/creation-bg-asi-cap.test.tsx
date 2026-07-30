/**
 * B19 — Background ASI cap in Creation.
 *
 * The creation `BgAsiPicker` passed `cap={Infinity}` to the shared ASI tiles,
 * overriding their `cap=20` default. So a score already at 20 (reachable via
 * Manual entry) stayed pickable and `effectiveScores` saved 22 with no clamp —
 * an illegal score every other ASI path rejects. Fix: use the default cap (20)
 * and clamp each boosted ability to `Math.min(20, …)`, matching level-up.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";

const { createMock } = vi.hoisted(() => ({
  createMock: vi.fn<(uid: string, data: unknown) => Promise<string>>(),
}));
vi.mock("@/lib/firebase", () => ({ db: {}, auth: {}, storage: {} }));
vi.mock("@/lib/firestore", () => ({ createCharacter: createMock }));

import { BgAsiPicker } from "@/features/creation/steps/AbilitiesStep";
import { CreationWizard } from "@/features/creation/CreationWizard";
import { useAuthStore } from "@/stores/authStore";
import type { AbilityCode } from "@/data/types";
import type { CharacterData } from "@/types/character";
import type { User } from "firebase/auth";

const SUITE_TIMEOUT = 15_000;

const BASE: Record<AbilityCode, number> = {
  STR: 10,
  DEX: 10,
  CON: 10,
  INT: 10,
  WIS: 10,
  CHA: 20,
};

describe("BgAsiPicker — the 20 cap is respected (B19)", () => {
  it("a tile whose eligible ability is already at 20 is unpickable", () => {
    const onToggle = vi.fn();
    render(
      <BgAsiPicker
        baseScores={BASE}
        mode="+2/+1"
        choices={{}}
        // CHA is eligible AND already at 20 → the ONLY thing that may disable it
        // is the score cap, not ineligibility.
        abilityOptions={["STR", "DEX", "CHA"]}
        backgroundName="Tester"
        onSwitchMode={vi.fn()}
        onToggle={onToggle}
        isValid={false}
      />
    );
    const chaTile = screen
      .getAllByRole("button")
      .find((b) => /CHA|CAR/.test(b.textContent));
    // Pre-fix (cap=Infinity) this tile stayed enabled and a click pushed CHA
    // to 22; post-fix it is capped/disabled.
    expect(chaTile).toBeDisabled();
    fireEvent.click(chaTile as HTMLElement);
    expect(onToggle).not.toHaveBeenCalled();
  });
});

describe("CreationWizard — a background ASI never saves a score past 20 (B19)", () => {
  beforeEach(() => {
    createMock.mockReset();
    createMock.mockResolvedValue("new-id");
    useAuthStore.setState({
      user: { uid: "u1", displayName: "Tester" } as unknown as User,
    });
  });
  afterEach(() => {
    useAuthStore.setState({ user: null });
  });

  async function renderPage() {
    const router = createMemoryRouter([{ path: "*", element: <CreationWizard /> }], {
      initialEntries: ["/characters/new"],
    });
    render(<RouterProvider router={router} />);
    await act(async () => {});
    await act(async () => {});
  }

  it(
    "a Manual base 19 receiving a +2 boost is clamped to 20 on save",
    async () => {
      await renderPage();
      // The page opens on the default Human Fighter of Soldier stock — a
      // non-caster whose only outstanding requirement is the name. The boosts
      // arrive assigned (+2 STR / +1 CON), so this case only has to move STR
      // out of point-buy range and re-place the +2 on it.
      fireEvent.change(screen.getByPlaceholderText(/enter name/i), {
        target: { value: "Borin" },
      });
      // Release the +2 before switching methods, then set STR to 19 by hand (a
      // value point-buy cannot reach).
      fireEvent.click(screen.getByRole("button", { name: /^STR15/ }));
      fireEvent.click(screen.getByRole("button", { name: /^Manual$/ }));
      fireEvent.change(screen.getByRole("spinbutton", { name: "Strength" }), {
        target: { value: "19" },
      });
      // Background ASI (+2/+1). Soldier boosts STR/DEX/CON — the +1 is still on
      // CON from the opening build; put the +2 back on STR (base 19 → would be
      // 21 unclamped).
      fireEvent.click(screen.getByRole("button", { name: /^STR19/ }));

      fireEvent.click(screen.getByRole("button", { name: /create character/i }));
      await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));

      const created = createMock.mock.calls[0]?.[1] as { character: CharacterData };
      // Pre-fix this saved 21 (19 + 2, unclamped). The 2024 cap holds at 20.
      expect(created.character.abilityScores.STR).toBe(20);
      // The +1 landed normally (CON 14 from the opening build → 15).
      expect(created.character.abilityScores.CON).toBe(15);
    },
    SUITE_TIMEOUT
  );
});
