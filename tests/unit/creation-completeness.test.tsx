/**
 * CreationWizard — B01 completeness gate (class skills + spells).
 *
 * The wizard used to let Quick Start mint a character with ZERO class skills
 * and (for casters) ZERO cantrips/prepared spells: `createRequirements` — the
 * single list that drives both the disabled Create gate and the "what's left"
 * explainer — had no `skills`/`spells` entry, and the guided Spells-step Next
 * only checked cantrips (never the leveled/prepared count). The guided Skills
 * step DID gate skills, so this was purely a quick-mode / free-jump gap plus a
 * loose spells gate.
 *
 * These assertions FAIL on the pre-fix code (Create enabled with 0 skills; the
 * spells requirement never renders) and PASS after it. Firebase/Firestore are
 * mocked so nothing loads them at module init.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";

vi.mock("@/lib/firebase", () => ({}));
vi.mock("@/lib/firestore", () => ({ createCharacter: vi.fn() }));

import { CreationWizard } from "@/features/creation/CreationWizard";
import { useAuthStore } from "@/stores/authStore";
import type { User } from "firebase/auth";

// Mounting the full wizard eagerly loads all SRD data — matches the documented
// headroom in create-cleric-feat-choices.test.tsx.
const SUITE_TIMEOUT = 15_000;

async function renderPage() {
  const router = createMemoryRouter([{ path: "*", element: <CreationWizard /> }], {
    initialEntries: ["/characters/new"],
  });
  const result = render(<RouterProvider router={router} />);
  await act(async () => {});
  await act(async () => {});
  return result;
}

function signIn() {
  useAuthStore.setState({
    user: { uid: "u1", displayName: "Tester" } as unknown as User,
  });
}

/** The "Create Character" submit button (last matching button — the fixed bar). */
function createButton(): HTMLButtonElement {
  const btns = screen.getAllByRole("button", { name: /Create Character/i });
  return btns[btns.length - 1] as HTMLButtonElement;
}

describe("CreationWizard — B01 completeness gate", () => {
  beforeEach(() => {
    signIn();
  });
  afterEach(() => {
    useAuthStore.setState({ user: null });
    vi.restoreAllMocks();
  });

  it(
    "a non-caster cannot be created until its class skills are chosen",
    async () => {
      await renderPage();
      // Dwarf (no origin feat / lineage) + Soldier (Savage Attacker carries no
      // sub-choices) + Fighter (non-caster) isolates the CLASS-skills gate.
      fireEvent.change(screen.getByPlaceholderText(/enter name/i), {
        target: { value: "Borin" },
      });
      fireEvent.change(screen.getByRole("combobox", { name: /species/i }), {
        target: { value: "dwarf" },
      });
      fireEvent.change(screen.getByRole("combobox", { name: /background/i }), {
        target: { value: "soldier" },
      });
      // Everything else a Dwarf/Soldier/Fighter needs: Soldier's "Choose one
      // kind of Gaming Set" tool pick (Dice Set) and the background ability
      // boosts (+2 STR / +1 DEX). Fighter has no spells, so class skills are the
      // LAST thing left.
      fireEvent.click(await screen.findByRole("button", { name: /Dice Set/ }));
      fireEvent.click(screen.getByRole("button", { name: /^STR10/ }));
      fireEvent.click(screen.getByRole("button", { name: /^DEX10/ }));

      // Two Fighter class skills are still unpicked → Create is BLOCKED and the
      // explainer names it. (Pre-fix: Create was ENABLED here — the bug.)
      expect(createButton()).toBeDisabled();
      expect(screen.getByText(/choose your class skills/i)).toBeInTheDocument();

      // Pick the two class skills (Athletics is a Soldier bg skill, so it is
      // excluded from the class pool — pick two that remain).
      fireEvent.click(screen.getByRole("button", { name: /Acrobatics/ }));
      fireEvent.click(screen.getByRole("button", { name: /Animal Handling/ }));

      // RA-28 — the origin +2 languages also gate Create; pick two so the skills
      // requirement is the isolated variable under test.
      fireEvent.click(screen.getByRole("button", { name: /Draconic/ }));
      fireEvent.click(screen.getByRole("button", { name: /Dwarvish/ }));

      // The requirement clears and Create unlocks.
      expect(screen.queryByText(/choose your class skills/i)).not.toBeInTheDocument();
      expect(createButton()).not.toBeDisabled();
    },
    SUITE_TIMEOUT
  );

  it(
    "a character cannot be created until its two origin languages are chosen (RA-28)",
    async () => {
      await renderPage();
      // Same lineage-free / sub-choice-free setup as the class-skills test.
      fireEvent.change(screen.getByPlaceholderText(/enter name/i), {
        target: { value: "Borin" },
      });
      fireEvent.change(screen.getByRole("combobox", { name: /species/i }), {
        target: { value: "dwarf" },
      });
      fireEvent.change(screen.getByRole("combobox", { name: /background/i }), {
        target: { value: "soldier" },
      });
      fireEvent.click(await screen.findByRole("button", { name: /Dice Set/ }));
      fireEvent.click(screen.getByRole("button", { name: /^STR10/ }));
      fireEvent.click(screen.getByRole("button", { name: /^DEX10/ }));
      // Finish the class skills so LANGUAGES is the isolated variable.
      fireEvent.click(screen.getByRole("button", { name: /Acrobatics/ }));
      fireEvent.click(screen.getByRole("button", { name: /Animal Handling/ }));

      // No languages picked → Create BLOCKED and the explainer names it.
      expect(createButton()).toBeDisabled();
      expect(screen.getByText(/choose your two languages/i)).toBeInTheDocument();

      // Pick the two origin languages from the standard table.
      fireEvent.click(screen.getByRole("button", { name: /Draconic/ }));
      fireEvent.click(screen.getByRole("button", { name: /Dwarvish/ }));

      // The requirement clears and Create unlocks.
      expect(screen.queryByText(/choose your two languages/i)).not.toBeInTheDocument();
      expect(createButton()).not.toBeDisabled();
    },
    SUITE_TIMEOUT
  );

  it(
    "a caster must choose its spells before Create; a non-caster has no spells requirement",
    async () => {
      await renderPage();
      // A caster (Cleric) surfaces the spells requirement in the explainer.
      // (Pre-fix: no such requirement existed, so a 0-spell caster could be
      // created.)
      fireEvent.click(screen.getByRole("option", { name: /^Cleric/ }));
      const needs = screen.getByRole("status");
      expect(within(needs).getByText(/choose your starting spells/i)).toBeInTheDocument();

      // Switching to a non-caster removes the spells requirement — it is
      // conditional on the class actually casting.
      fireEvent.click(screen.getByRole("option", { name: /^Fighter/ }));
      expect(
        within(screen.getByRole("status")).queryByText(/choose your starting spells/i)
      ).not.toBeInTheDocument();
    },
    SUITE_TIMEOUT
  );
});
