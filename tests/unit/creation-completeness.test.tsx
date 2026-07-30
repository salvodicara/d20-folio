/**
 * CreationWizard — B01 completeness gate (class skills · languages · spells).
 *
 * The wizard must never mint a character with ZERO class skills, ZERO origin
 * languages, or (for a caster) ZERO cantrips/prepared spells:
 * `createRequirements` — the single list that drives both the disabled Create
 * gate and the "what's left" explainer — carries an entry for each, so quick
 * mode and orb free-jumps honour the same bar the guided rail does.
 *
 * Quick Start now OPENS complete (the class's ready-made build), so each case
 * here UNDOES the thing under test — the picker's toggle-off path — and watches
 * the gate close, then re-picks and watches it open. Firebase/Firestore are
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

/** Name the character so the gate's OTHER requirement is out of the way. */
function nameIt() {
  fireEvent.change(screen.getByPlaceholderText(/enter name/i), {
    target: { value: "Borin" },
  });
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
      // The default build is a Fighter (no spells), so class skills are the
      // isolated variable once the name is given.
      nameIt();
      expect(createButton()).not.toBeDisabled();

      // Drop a class skill: the gate closes and the explainer names it.
      fireEvent.click(screen.getByRole("button", { name: /Perception/ }));
      expect(createButton()).toBeDisabled();
      expect(screen.getByText(/choose your class skills/i)).toBeInTheDocument();

      // Any legal replacement from the class pool opens it again.
      fireEvent.click(screen.getByRole("button", { name: /Acrobatics/ }));
      expect(screen.queryByText(/choose your class skills/i)).not.toBeInTheDocument();
      expect(createButton()).not.toBeDisabled();
    },
    SUITE_TIMEOUT
  );

  it(
    "a character cannot be created until its two origin languages are chosen (RA-28)",
    async () => {
      await renderPage();
      nameIt();
      expect(createButton()).not.toBeDisabled();

      // Drop one of the two origin languages the build came with.
      fireEvent.click(screen.getByRole("button", { name: /Dwarvish/ }));
      expect(createButton()).toBeDisabled();
      expect(screen.getByText(/choose your two languages/i)).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /Draconic/ }));
      expect(screen.queryByText(/choose your two languages/i)).not.toBeInTheDocument();
      expect(createButton()).not.toBeDisabled();
    },
    SUITE_TIMEOUT
  );

  it(
    "a caster must choose its spells before Create",
    async () => {
      await renderPage();
      // Choose the caster while the sheet is still pristine (a rebuild asks
      // first once the player has sculpted anything).
      fireEvent.click(screen.getByRole("option", { name: /^Cleric/ }));
      nameIt();
      // A level-1 caster arrives with its spells picked — nothing outstanding.
      expect(createButton()).not.toBeDisabled();

      // Unlearn one: read-then-choose, so the row unfolds and the explicit act
      // releases the pick. (A 0-spell caster used to be creatable — the bug
      // this pins.) The first match is the class list's own row.
      const [cantripRow] = screen.getAllByRole("button", { name: /Sacred Flame/ });
      fireEvent.click(cantripRow as HTMLElement);
      fireEvent.click(screen.getByRole("button", { name: "Remove" }));
      expect(createButton()).toBeDisabled();
      expect(
        within(screen.getByRole("status")).getByText(/choose your starting spells/i)
      ).toBeInTheDocument();

      // Learn it back and the gate opens again.
      fireEvent.click(screen.getByRole("button", { name: /Learn Sacred Flame/ }));
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(createButton()).not.toBeDisabled();
    },
    SUITE_TIMEOUT
  );

  it(
    "a non-caster never asks for spells, at any level",
    async () => {
      await renderPage();
      nameIt();
      // The default build is a Fighter; at level 3 it owes a subclass, never
      // spells — the requirement is conditional on the class actually casting.
      fireEvent.change(screen.getByRole("spinbutton", { name: /level/i }), {
        target: { value: "3" },
      });
      expect(screen.getByRole("status")).toBeInTheDocument();
      expect(screen.queryByText(/choose your starting spells/i)).not.toBeInTheDocument();
    },
    SUITE_TIMEOUT
  );
});
