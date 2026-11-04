/**
 * The new creation screen never picks a background silently: the summary says «—»
 * and «Next» waits until the player picks one. The same holds for a species and its
 * own choices (an Elf's lineage, spellcasting ability and Keen Senses), and the abilities step opens on the class's
 * suggested scores with the background's +2/+1 already placed.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import { suggestedScores } from "@/domains/creation/creation-view";
import { CreationScreen } from "@/domains/creation/ui/CreationScreen";
import { useAuthStore } from "@/stores/authStore";

const { createCharacterMock, navigateMock } = vi.hoisted(() => ({
  createCharacterMock: vi.fn(() => Promise.resolve("new-id")),
  navigateMock: vi.fn(),
}));
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/firestore", () => ({ createCharacter: createCharacterMock }));
vi.mock("react-router", async (orig) => ({
  ...(await orig<typeof import("react-router")>()),
  useNavigate: () => navigateMock,
}));

describe("CreationScreen", () => {
  it("a background is the player's pick: «—» and a waiting Next until then", () => {
    render(
      <MemoryRouter>
        <CreationScreen />
      </MemoryRouter>
    );
    const summary = () =>
      screen.getByText("Background", { selector: "dt" }).parentElement as HTMLElement;
    expect(within(summary()).getByText("—")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    const next = screen.getByRole("button", { name: "Next" });
    expect(next.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /^Acolyte/ }));
    expect(within(summary()).getByText("Acolyte")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Next" }).getAttribute("aria-disabled")
    ).toBeNull();
  });

  it("a species, then its lineage, before Next; abilities open on the suggested scores", () => {
    render(
      <MemoryRouter>
        <CreationScreen />
      </MemoryRouter>
    );
    const next = () => screen.getByRole("button", { name: "Next" });
    fireEvent.click(screen.getByRole("button", { name: "Cleric" }));
    fireEvent.click(next());
    fireEvent.click(screen.getByRole("button", { name: /^Acolyte/ }));
    fireEvent.click(next());
    const summary = () =>
      screen.getByText("Species", { selector: "dt" }).parentElement as HTMLElement;
    expect(within(summary()).getByText("—")).toBeTruthy();
    expect(next().getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /^Elf/ }));
    expect(within(summary()).getByText("Elf")).toBeTruthy();
    expect(next().getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "High Elf" }));
    // Then the spellcasting ability its lineage spells use, and Keen Senses.
    expect(next().getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText("Choose your species spellcasting ability.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Wisdom" }));
    expect(next().getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText("Finish the species choices to continue.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Perception" }));
    expect(next().getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(next());
    // The class's ready-made scores, highest first, with the background's +2/+1 placed.
    const scores = Object.values(suggestedScores("fighter")).sort((a, b) => b - a);
    expect(screen.getByText(`Suggested: ${scores.join(", ")}`)).toBeTruthy();
    expect(
      screen.getAllByRole("button", { pressed: true }).map((b) => b.textContent)
    ).toEqual(expect.arrayContaining(["Suggested", "+2 / +1"]));
    expect(next().getAttribute("aria-disabled")).toBeNull();
  });

  it("walks all six steps to a ready-made Riepilogo, and «Create» saves it", async () => {
    useAuthStore.setState({ user: { uid: "u1", displayName: "Tester" } as never });
    render(
      <MemoryRouter>
        <CreationScreen />
      </MemoryRouter>
    );
    const next = () => screen.getByRole("button", { name: "Next" });
    fireEvent.click(screen.getByRole("button", { name: "Cleric" }));
    fireEvent.click(next());
    fireEvent.click(screen.getByRole("button", { name: /^Acolyte/ }));
    fireEvent.click(next());
    fireEvent.click(screen.getByRole("button", { name: /^Dwarf/ }));
    fireEvent.click(next());
    fireEvent.click(next());
    // Equipaggiamento: the class package is chosen, and the Armor Class shows.
    expect(screen.getByText(/^Armor Class \d+$/)).toBeTruthy();
    // The Cleric's Divine Order is asked first, and Next waits for it.
    expect(next().getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText("Finish the class choices to continue.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Protector" }));
    expect(next().getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(next());
    // Riepilogo: the class's ready-made spells, and only the name is owed.
    expect(screen.getByText(/Guidance/)).toBeTruthy();
    const create = screen.getByRole("button", { name: "Create character" });
    expect(create.getAttribute("aria-disabled")).toBe("true");
    fireEvent.change(screen.getByLabelText("Character Name"), {
      target: { value: "Selene" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Selene" }));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/characters/new-id"));
    expect(createCharacterMock).toHaveBeenCalledWith("u1", expect.anything());
    useAuthStore.setState({ user: null });
  }, 15_000);

  it("«Quick build»: a class, a species and a name make a complete character", async () => {
    useAuthStore.setState({ user: { uid: "u1", displayName: "Tester" } as never });
    createCharacterMock.mockClear();
    render(
      <MemoryRouter initialEntries={["/characters/new?rapid=1"]}>
        <CreationScreen />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: "Wizard" }));
    fireEvent.click(screen.getByRole("button", { name: /^Elf/ }));
    fireEvent.change(screen.getByLabelText("Character Name"), {
      target: { value: "Lia" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Lia" }));
    await waitFor(() => expect(createCharacterMock).toHaveBeenCalled());
    const [, payload] = createCharacterMock.mock.calls[0] as unknown as [
      string,
      {
        character: {
          classes: { classId: string }[];
          race: string;
          speciesSpellAbility?: string;
        };
      },
    ];
    expect(payload.character.classes[0]?.classId).toBe("wizard");
    expect(payload.character.race).toBe("elf");
    // The Elf's lineage spells' ability, picked the class's way (a Wizard: INT).
    expect(payload.character.speciesSpellAbility).toBe("INT");
    useAuthStore.setState({ user: null });
  }, 15_000);
});
