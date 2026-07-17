/**
 * CreationWizard — Cleric / Magic-Initiate feat-choices regression.
 *
 * Two owner-reported CRITICAL bugs, root-caused to one defect:
 *
 *  1. "Feat Choices is buggy — you pick stuff but it doesn't show what you
 *     picked and then it gets grayed out."
 *  2. "Users can't create a Cleric."
 *
 * Root cause: `create.tsx` fed the feat's OWN in-flight spell picks back into
 * the `existingSpellIds` set that `listAvailableForSlot` uses to EXCLUDE
 * spells from each picker's pool. So a just-picked cantrip/spell immediately
 * vanished from its own picker (the "doesn't show what you picked" symptom),
 * and the Magic-Initiate (Cleric) slots — granted by the default Acolyte
 * background to EVERY new character — could never visibly reach their required
 * counts, which kept `originFeatChoicesComplete` false and the Create button
 * disabled. Cleric (whose tip steers players to the Acolyte/Cleric flow) was
 * the canonical victim, but the block hit any Acolyte-background character.
 *
 * The fix: `existingSpellIds` carries only spells from OTHER sources (the
 * class-selected cantrips/spells), and `FeatSpellChoicesPicker` always renders
 * a spell that is picked in the current slot even if it appears in the
 * exclusion set. Picked options show selected; only the OTHERS gray out once
 * the slot's limit is reached.
 *
 * These assertions FAIL on the pre-fix code and PASS after it. Pure test —
 * Firebase/Firestore are mocked so nothing loads them at module init.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";

// create.tsx imports createCharacter from @/lib/firestore (which loads
// @/lib/firebase). CI runs with VITE_FIREBASE_API_KEY unset and the
// pure-modules guard forbids loading Firebase in unit tests — mock both.
vi.mock("@/lib/firebase", () => ({}));
vi.mock("@/lib/firestore", () => ({ createCharacter: vi.fn() }));

import { CreationWizard } from "@/features/creation/CreationWizard";
import { useAuthStore } from "@/stores/authStore";
import type { User } from "firebase/auth";

async function renderPage() {
  // The wizard's `useBlocker` (leave-creation guard) needs a DATA router.
  const router = createMemoryRouter([{ path: "*", element: <CreationWizard /> }], {
    initialEntries: ["/characters/new"],
  });
  const result = render(<RouterProvider router={router} />);
  // React Router v7 uses `React.startTransition()` to dispatch router-state
  // updates on subscription (see chunk-66UKHEGQ.js line 291/329/362). Those
  // transitions may be batched across multiple scheduler ticks.  A single
  // `await act(async () => {})` flushes one microtask cycle; a second pass
  // ensures any transitions scheduled by the FIRST flush are also drained.
  // This prevents the "not wrapped in act()" warnings AND eliminates the
  // race window where pending startTransition work consumed wall-clock time
  // that the 5 s per-test budget was counting against.
  await act(async () => {});
  await act(async () => {});
  return result;
}

/** Minimal signed-in user so `handleCreate`/`canCreate` see a uid. */
function signIn() {
  useAuthStore.setState({
    user: { uid: "u1", displayName: "Tester" } as unknown as User,
  });
}

/** Find the picker ChoicePickerCard whose header text matches `re`. */
function pickerCard(re: RegExp): HTMLElement {
  const header = screen.getByText(re);
  // Walk up to the card container (the picker card wraps header + grid).
  let el: HTMLElement | null = header;
  for (let i = 0; i < 6 && el; i++) {
    if (el.querySelector("button")) return el;
    el = el.parentElement;
  }
  throw new Error(`No picker card found for ${re}`);
}

/** The "Create Character" submit button (last matching button). */
function createButton(): HTMLButtonElement {
  const btns = screen.getAllByRole("button", { name: /Create Character/i });
  return btns[btns.length - 1] as HTMLButtonElement;
}

/** A spell's `.wiz-entry` row inside a pick-list card (the F family). */
function spellRow(cardRe: RegExp, name: string): HTMLElement {
  const row = within(pickerCard(cardRe))
    .getAllByRole("button")
    .find((b) => b.classList.contains("wiz-row") && b.textContent.includes(name));
  if (!row) throw new Error(`spell row not found: ${name}`);
  return row;
}

/**
 * Pick a feat-choice spell (fb3 compact-detail rows, owner 2026-06-11):
 * the row is a dense FACT row — a tap commits directly; the prose lives
 * behind the picked row's open-book modal, never inline.
 */
function pickSpell(cardRe: RegExp, name: string): void {
  fireEvent.click(spellRow(cardRe, name));
}

/** The picked state lives on the row's `.wiz-entry` (`data-picked`). */
function entryOf(row: HTMLElement): HTMLElement {
  const entry = row.closest(".wiz-entry");
  if (!entry) throw new Error("row has no .wiz-entry");
  return entry as HTMLElement;
}

/** Choose a feat through the wizard-F morph list: open the row (read), then
 *  commit via the explicit "Choose <name>" CTA (read-then-choose). */
function chooseFeat(name: string): void {
  const row = screen
    .getAllByRole("button")
    .find((b) => b.classList.contains("wiz-row") && b.textContent.includes(name));
  if (!row) throw new Error(`feat row not found: ${name}`);
  fireEvent.click(row);
  fireEvent.click(screen.getByRole("button", { name: `Choose ${name}` }));
}

// Explicit timeout: this test mounts the full CreationWizard, which eagerly
// loads all SRD data (spells × 10 levels, class tables, feats, races,
// backgrounds). Measured render time: ~470 ms in isolation, ~1850 ms under
// coverage + full-suite parallelism (V8 instrumentation + CPU contention).
// The 5 s Vitest default is fine in isolation but can flake under the pre-push
// gate's concurrent tsc+lint+build+e2e load. 15 s is a documented, intentional
// headroom value — not a symptom-patch. See also the `act()` flush in
// `renderPage()`, which eliminates the other flake vector (router microtasks).
const SUITE_TIMEOUT = 15_000;

describe("CreationWizard — Cleric / Magic-Initiate feat-choices", () => {
  beforeEach(() => {
    signIn();
  });
  afterEach(() => {
    useAuthStore.setState({ user: null });
    vi.restoreAllMocks();
  });

  it(
    "a picked feat-choice spell stays visible and shows its selected state",
    async () => {
      await renderPage();
      // Quick mode is the default. Select Cleric (a gallery plaque = option role).
      fireEvent.click(screen.getByRole("option", { name: /^Cleric/ }));

      // The Acolyte default background grants Magic Initiate (Cleric): 2 cantrips + 1
      // L1 spell. Learn "Guidance" (read-then-Learn).
      pickSpell(/Pick 2 cantrip/i, "Guidance");

      // The row stays visible (regression for "doesn't show what you picked")
      // and wears the gold picked ceremony (`data-picked`).
      const entry = entryOf(spellRow(/Pick 2 cantrip/i, "Guidance"));
      expect(entry).toHaveAttribute("data-picked");

      // fb3 (owner 2026-06-11): spell asks are COMPACT rows — no inline prose
      // unfold; the PICKED row grows the open-book affordance whose modal is
      // the shared compendium read view (PickerDetailModal).
      expect(entry.querySelector(".wiz-read")).toBeNull();
      const book = entry.querySelector(".wiz-book");
      expect(book).not.toBeNull();
      fireEvent.click(book as HTMLElement);
      const dialog = await screen.findByRole("dialog");
      expect(dialog).toHaveTextContent(/Guidance/);
    },
    SUITE_TIMEOUT
  );

  it(
    "Cleric (default Acolyte bg) becomes creatable after the required picks",
    async () => {
      await renderPage();
      // A character name is required to create.
      fireEvent.change(screen.getByPlaceholderText(/Enter name/i), {
        target: { value: "Brother Maxim" },
      });
      fireEvent.click(screen.getByRole("option", { name: /^Cleric/ }));

      // Default race is Human → must choose a Human Versatile origin feat.
      // Pick "Savage Attacker" (no sub-choices) so we isolate the Magic-Initiate
      // slots. ("Alert" would work too — any pickless origin feat does.)
      chooseFeat("Savage Attacker");

      // Before resolving the Magic-Initiate picks, Create is disabled and the
      // origin-feat requirement is the named blocker (the "can't create a
      // Cleric" bug — the Magic-Initiate slots could never reach their counts).
      expect(createButton()).toBeDisabled();
      expect(screen.getByText(/finish your origin feat choices/i)).toBeInTheDocument();

      // Resolve: 2 cleric cantrips + 1 L1 cleric spell.
      pickSpell(/Pick 2 cantrip/i, "Guidance");
      pickSpell(/Pick 2 cantrip/i, "Sacred Flame");
      pickSpell(/Pick 1 spell/i, "Bless");

      // The Magic-Initiate feat choices are now complete, so the origin-feat
      // requirement no longer blocks Create. (B01 additionally gates the class
      // skills + spells, but this test's concern is the feat-choice unblock.)
      expect(
        screen.queryByText(/finish your origin feat choices/i)
      ).not.toBeInTheDocument();
    },
    SUITE_TIMEOUT
  );

  it(
    "a Human Versatile feat with nested choices expands INSIDE its entry, attributed",
    async () => {
      await renderPage();
      fireEvent.click(screen.getByRole("option", { name: /^Cleric/ }));

      // Choose Magic Initiate (Wizard) as the Human Versatile origin feat: its
      // nested spell choices open in the entry's OWN asks column (the entry is
      // the attribution — wizard-F one-body commit; owner round 6).
      chooseFeat("Magic Initiate (Wizard)");
      const entry = document.querySelector('[data-fid="magic-initiate-wizard"]');
      expect(entry).toHaveAttribute("data-chosen");
      const asks = entry?.querySelector(".wiz-asks");
      expect(asks).not.toBeNull();
      // Hosting the feat's own slots (2 Wizard cantrips + 1 L1 Wizard spell)…
      expect(asks).toHaveTextContent(/Pick 2/);
      expect(asks).toHaveTextContent(/Pick 1/);
      // …while the BACKGROUND feat's (Acolyte → Magic Initiate Cleric) slots
      // stay OUTSIDE the entry, in the shared feature-choices section.
      expect(asks).not.toHaveTextContent(/Magic Initiate \(Cleric\)/);
      expect(screen.getByText("Feature Choices")).toBeInTheDocument();
    },
    SUITE_TIMEOUT
  );

  it(
    "picking past a full slot auto-replaces the oldest pick (FIFO), no dead-ends",
    async () => {
      await renderPage();
      fireEvent.click(screen.getByRole("option", { name: /^Cleric/ }));

      // Fill the 2-cantrip slot.
      pickSpell(/Pick 2 cantrip/i, "Guidance");
      pickSpell(/Pick 2 cantrip/i, "Sacred Flame");

      // Pick a THIRD cantrip — instead of being blocked, it drops the OLDEST (Guidance).
      pickSpell(/Pick 2 cantrip/i, "Light");

      // Guidance's row is no longer picked; Light's is.
      expect(entryOf(spellRow(/Pick 2 cantrip/i, "Guidance"))).not.toHaveAttribute(
        "data-picked"
      );
      expect(entryOf(spellRow(/Pick 2 cantrip/i, "Light"))).toHaveAttribute(
        "data-picked"
      );
    },
    SUITE_TIMEOUT
  );
});
