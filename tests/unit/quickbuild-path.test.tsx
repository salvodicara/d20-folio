/**
 * Quick Start — the page that opens ALREADY COMPLETE, driven through the real
 * wizard, one table row per composed preset.
 *
 * This is the gate proof: for EVERY class, the prefilled sheet must leave the
 * wizard's own Create gate satisfied with nothing but the name outstanding. It
 * runs the actual `createRequirements` list (skills, spells, languages, lineage,
 * origin feat, background boosts, …), so a preset that fills the wrong slots —
 * or a wizard that grows a requirement the presets do not answer — fails here
 * rather than in a player's hands. It also pins the edge-case contract around
 * that page: the typed name is never touched, a sculpted sheet is never
 * silently replaced, switching path keeps the work, and a raised level re-opens
 * the gate instead of quietly minting an under-built character.
 *
 * The table is derived from `QUICKBUILD_PRESETS` (public + pack, whichever mode
 * composes), never a hand-listed set of classes.
 *
 * BLIND SPOTS: the per-preset sweep drives the GATE, not the written document —
 * one closing case follows the whole path through `handleCreate` for a single
 * preset (the rest of what creation writes is `character-creation.test.ts`).
 * Nothing here judges whether a preset's picks are GOOD, only that they work.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";

vi.mock("@/lib/firebase", () => ({}));
const createCharacter = vi.fn<(uid: string, doc: unknown) => Promise<string>>(() =>
  Promise.resolve("new-id")
);
vi.mock("@/lib/firestore", () => ({
  createCharacter: (uid: string, doc: unknown) => createCharacter(uid, doc),
}));
// The UI's entropy source, replaced by a fixed cycle so a Randomize tap is
// reproducible here; the roll itself is exercised across many seeds by
// `quickbuild-random.test.ts`.
let rollTick = 0;
vi.mock("@/lib/quickbuild-random", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/quickbuild-random")>()),
  cryptoRng: () => {
    rollTick = (rollTick * 1103515245 + 12345) % 2147483648;
    return rollTick / 2147483648;
  },
}));

import { CreationWizard } from "@/features/creation/CreationWizard";
import {
  DEFAULT_QUICKBUILD_CLASS,
  DEFAULT_QUICKBUILD_PRESET,
  QUICKBUILD_PRESETS,
} from "@/data/quickbuild";
import { className as presClassName } from "@/lib/views/creation-view";
import { useAuthStore } from "@/stores/authStore";
import { useConfirmStore } from "@/stores/confirmStore";
import type { User } from "firebase/auth";
import type { CharacterData } from "@/types/character";

// Mounting the full wizard eagerly loads all SRD data — matching the documented
// headroom in the sibling creation suites.
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

/** The "Create Character" submit button (the fixed pager seal). */
function createButton(): HTMLButtonElement {
  const btns = screen.getAllByRole("button", { name: /Create Character/i });
  return btns[btns.length - 1] as HTMLButtonElement;
}

/** The Randomize control. Matched on its EXACT name: the Quick Start path
 *  card's gloss ("…or randomize it") collides with a loose pattern. */
function randomizeButton(): HTMLElement {
  return screen.getByRole("button", { name: "Randomize" });
}

function selectValue(name: RegExp): string {
  const el = screen.getByRole("combobox", { name });
  if (!(el instanceof HTMLSelectElement)) throw new Error("expected a <select>");
  return el.value;
}

/** Pick a class on the one-page sheet (the plaque grid IS the class control). */
function pickClass(classId: string) {
  const label = presClassName(classId, "en");
  fireEvent.click(screen.getByRole("option", { name: new RegExp(`^${label}`) }));
}

const presets = Object.entries(QUICKBUILD_PRESETS);

describe("CreationWizard — Quick Start opens complete", () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: { uid: "u1", displayName: "Tester" } as unknown as User,
    });
  });
  afterEach(() => {
    useAuthStore.setState({ user: null });
    vi.restoreAllMocks();
  });

  it(
    "arrives on a finished default build — two paths, never a blank form",
    async () => {
      const { unmount } = await renderPage();
      // TWO paths, Quick Start standing.
      expect(screen.getByRole("button", { name: /Quick Start/i })).toHaveAttribute(
        "aria-pressed",
        "true"
      );
      expect(screen.getByRole("button", { name: /Guided/ })).toBeInTheDocument();
      // The page opens on the default class's ready-made build.
      expect(
        screen.getByRole("option", {
          name: new RegExp(`^${presClassName(DEFAULT_QUICKBUILD_CLASS, "en")}`),
        })
      ).toHaveAttribute("aria-selected", "true");
      expect(selectValue(/species/i)).toBe(DEFAULT_QUICKBUILD_PRESET.raceId);
      expect(selectValue(/background/i)).toBe(DEFAULT_QUICKBUILD_PRESET.backgroundId);
      expect(screen.getByText(/all spent/i)).toBeInTheDocument();
      // …with only the name outstanding.
      expect(screen.getByRole("status")).toHaveTextContent(/name/i);
      expect(createButton()).toBeDisabled();
      unmount();
    },
    SUITE_TIMEOUT
  );

  describe.each(presets)("%s", (classId, preset) => {
    it(
      "prefills the whole sheet, leaving only the name to give",
      async () => {
        const { unmount } = await renderPage();
        pickClass(classId);

        expect(selectValue(/species/i)).toBe(preset.raceId);
        expect(selectValue(/background/i)).toBe(preset.backgroundId);
        expect(screen.getByText(/all spent/i)).toBeInTheDocument();

        expect(screen.getByRole("status")).toHaveTextContent(/name/i);
        expect(createButton()).toBeDisabled();

        fireEvent.change(screen.getByPlaceholderText(/enter name/i), {
          target: { value: "Quickbuilt" },
        });
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
        expect(createButton()).not.toBeDisabled();
        unmount();
      },
      SUITE_TIMEOUT
    );
  });

  it(
    "creates the character a preset describes",
    async () => {
      await renderPage();
      pickClass("cleric");
      fireEvent.change(screen.getByPlaceholderText(/enter name/i), {
        target: { value: "Quickbuilt" },
      });
      fireEvent.click(createButton());
      await act(async () => {});

      const preset = QUICKBUILD_PRESETS.cleric;
      expect(preset).toBeDefined();
      expect(createCharacter).toHaveBeenCalledTimes(1);
      const [, doc] = createCharacter.mock.calls[0] as unknown as [
        string,
        { character: CharacterData },
      ];
      const character = doc.character;
      // The build the preset described, as PERSISTED: class, species, the
      // boosted standard array, the class + background skills, the class spells
      // and the Magic Initiate picks, and the origin languages.
      expect(character.classes).toEqual([{ classId: "cleric", level: 1 }]);
      expect(character.race).toBe(preset?.raceId);
      // WIS 15 + the background's +2; CON 14 untouched by a +1 that went to CHA.
      expect(character.abilityScores.WIS).toBe(17);
      expect(character.abilityScores.CON).toBe(14);
      for (const skill of preset?.classSkills ?? []) {
        expect(character.skills[skill]).toBe("proficient");
      }
      const spellIds = character.spells.map((s) => ("srdId" in s ? s.srdId : ""));
      for (const id of [
        ...(preset?.cantrips ?? []),
        ...(preset?.spells ?? []),
        ...(preset?.choices?.spell ?? []),
      ]) {
        expect(spellIds, `missing ${id}`).toContain(id);
      }
      expect(character.languageIds).toEqual(["common", ...(preset?.languages ?? [])]);
    },
    SUITE_TIMEOUT
  );

  // ── The edge-case contract (owner, 2026-07-30) ──────────────────────────────

  it(
    "rerolls the flavour, never the class, when Randomize is tapped",
    async () => {
      await renderPage();
      pickClass("wizard");
      fireEvent.change(screen.getByPlaceholderText(/enter name/i), {
        target: { value: "Rolled" },
      });
      const before = [selectValue(/species/i), selectValue(/background/i)].join("/");

      // Reroll until the flavour visibly moves (a draw MAY repeat itself; three
      // taps of a fixed sequence is plenty, and each one must stay creatable).
      let after = before;
      for (let tap = 0; tap < 3 && after === before; tap++) {
        fireEvent.click(randomizeButton());
        after = [selectValue(/species/i), selectValue(/background/i)].join("/");
        expect(screen.getByRole("option", { name: /^Wizard/ })).toHaveAttribute(
          "aria-selected",
          "true"
        );
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
        expect(createButton()).not.toBeDisabled();
      }
      expect(after).not.toBe(before);
    },
    SUITE_TIMEOUT
  );

  it(
    "never touches a typed name — not on a reroll, not on a class change",
    async () => {
      await renderPage();
      const named = () => screen.getByPlaceholderText(/enter name/i);
      fireEvent.change(named(), { target: { value: "Mirabel" } });

      fireEvent.click(randomizeButton());
      expect(named()).toHaveValue("Mirabel");

      // A pristine sheet is rebuilt silently — and the name still stands.
      pickClass("bard");
      expect(named()).toHaveValue("Mirabel");
      expect(screen.getByRole("option", { name: /^Bard/ })).toHaveAttribute(
        "aria-selected",
        "true"
      );
      expect(useConfirmStore.getState().open).toBe(false);
    },
    SUITE_TIMEOUT
  );

  it(
    "asks before rebuilding a SCULPTED sheet, and honours both answers",
    async () => {
      await renderPage();
      pickClass("bard");
      // A hand edit — the build is the player's now, not the preset's.
      fireEvent.change(screen.getByRole("combobox", { name: /species/i }), {
        target: { value: "orc" },
      });

      pickClass("barbarian");
      expect(useConfirmStore.getState().open).toBe(true);

      // CANCEL keeps the sculpted Bard exactly as it was.
      act(() => {
        useConfirmStore.getState().respond(false);
      });
      await act(async () => {});
      expect(selectValue(/species/i)).toBe("orc");
      expect(screen.getByRole("option", { name: /^Bard/ })).toHaveAttribute(
        "aria-selected",
        "true"
      );

      // CONFIRM replaces it wholesale with the Barbarian's ready-made build.
      pickClass("barbarian");
      act(() => {
        useConfirmStore.getState().respond(true);
      });
      await act(async () => {});
      expect(selectValue(/species/i)).toBe(QUICKBUILD_PRESETS.barbarian?.raceId);
    },
    SUITE_TIMEOUT
  );

  it(
    "keeps the whole build when the player switches path and comes back",
    async () => {
      await renderPage();
      pickClass("druid");
      fireEvent.change(screen.getByPlaceholderText(/enter name/i), {
        target: { value: "Thornwake" },
      });
      fireEvent.change(screen.getByRole("combobox", { name: /species/i }), {
        target: { value: "orc" },
      });

      fireEvent.click(screen.getByRole("button", { name: /Guided/ }));
      expect(screen.getByRole("button", { name: /Guided/ })).toHaveAttribute(
        "aria-pressed",
        "true"
      );
      // Guided never offers the reroll — it is the deliberate path.
      expect(screen.queryByRole("button", { name: "Randomize" })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /Quick Start/i }));
      expect(screen.getByPlaceholderText(/enter name/i)).toHaveValue("Thornwake");
      expect(selectValue(/species/i)).toBe("orc");
      expect(screen.getByRole("option", { name: /^Druid/ })).toHaveAttribute(
        "aria-selected",
        "true"
      );
    },
    SUITE_TIMEOUT
  );

  it(
    "blocks Create when a raised level asks for picks a level-1 build has not made",
    async () => {
      await renderPage();
      pickClass("cleric");
      fireEvent.change(screen.getByPlaceholderText(/enter name/i), {
        target: { value: "Ordained" },
      });
      expect(createButton()).not.toBeDisabled();

      // The presets are level-1 builds by charter; raising the level re-opens
      // the decisions that level brings (a subclass, more spells) and the gate
      // says so rather than quietly minting an under-built character.
      fireEvent.change(screen.getByRole("spinbutton", { name: /level/i }), {
        target: { value: "5" },
      });
      expect(createButton()).toBeDisabled();
      expect(screen.getByRole("status")).toBeInTheDocument();
    },
    SUITE_TIMEOUT
  );
});
