/**
 * CreationWizard — create-success navigation parity (routing-coherence fix).
 *
 * Bug A was a stale URL: the wizard navigated to `/characters/:id/combat`, a
 * route that no longer exists (cockpit tabs are in-view `?tab=` state, not a
 * `/combat` sub-route), so finishing creation 404'd. This pins that a successful
 * quick-create lands on the bare cockpit URL `/characters/:id`.
 *
 * The wizard opens in quick mode with Fighter pre-selected, so the minimal path
 * to `handleCreate` is: type a name → Create. `createCharacter` and the router
 * navigate are mocked so the test never touches Firestore or the real history.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";

const { createMock, navigateMock } = vi.hoisted(() => ({
  createMock: vi.fn<(uid: string, data: unknown) => Promise<string>>(),
  navigateMock: vi.fn(),
}));

vi.mock("@/lib/firebase", () => ({ db: {}, auth: {}, storage: {} }));
vi.mock("@/lib/firestore", () => ({ createCharacter: createMock }));
vi.mock("react-router", async (orig) => ({
  ...(await orig<typeof import("react-router")>()),
  useNavigate: () => navigateMock,
}));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (selector: (s: { user: { uid: string } | null }) => unknown) =>
    selector({ user: { uid: "u1" } }),
}));

import { createMemoryRouter, RouterProvider } from "react-router";
import { CreationWizard } from "@/features/creation/CreationWizard";
import { useConfirmStore } from "@/stores/confirmStore";
import { evaluateGrants } from "@/lib/grants";
import { resolveAllGrantSources } from "@/lib/resolve-grant-sources";
import type { CharacterData } from "@/types/character";
import i18n from "@/i18n";

// The wizard uses `useBlocker` (the leave-creation guard), which requires a DATA
// router — wrap it in a createMemoryRouter, not the legacy <MemoryRouter>.
function renderWizard() {
  const router = createMemoryRouter([{ path: "*", element: <CreationWizard /> }], {
    initialEntries: ["/characters/new"],
  });
  return render(<RouterProvider router={router} />);
}

describe("CreationWizard — create-success navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createMock.mockResolvedValue("new-id");
  });

  it("lands on the cockpit at /characters/:id (no /combat segment)", async () => {
    renderWizard();
    // Quick mode + Fighter are the defaults. Clear the origin-pick gates so the
    // remaining required choices are the name + the Soldier's tool pick: a
    // lineage-free Dwarf species (off the default Human, which needs an origin-feat
    // pick) + a Soldier background (whose Savage Attacker feat carries no
    // sub-choices, unlike Acolyte's).
    fireEvent.change(screen.getByPlaceholderText(/enter name/i), {
      target: { value: "Borin" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: /species/i }), {
      target: { value: "dwarf" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: /background/i }), {
      target: { value: "soldier" },
    });
    // Soldier's 2024 tool proficiency is "Choose one kind of Gaming Set" — a
    // required creation pick now. Pick the Dice Set.
    fireEvent.click(await screen.findByRole("button", { name: /Dice Set/ }));
    // D5 — the background ability boosts are required too (+2 STR / +1 DEX).
    fireEvent.click(screen.getByRole("button", { name: /^STR10/ }));
    fireEvent.click(screen.getByRole("button", { name: /^DEX10/ }));
    // B01 — the two Fighter class skills are a create requirement (Athletics /
    // Intimidation come from Soldier, so they're excluded from the class pool).
    fireEvent.click(screen.getByRole("button", { name: /Acrobatics/ }));
    fireEvent.click(screen.getByRole("button", { name: /Animal Handling/ }));
    fireEvent.click(screen.getByRole("button", { name: /create character/i }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/characters/new-id"));
    // Guard the regression explicitly: never the old /combat sub-route.
    expect(navigateMock).not.toHaveBeenCalledWith("/characters/new-id/combat");

    // EQUIP wiring — the wizard merges the chosen class + background Option-A
    // packages and credits the summed starting gold (no more hardcoded 0 GP).
    // Fighter A grants chain-mail/greatsword/flail/8 javelins/dungeoneer's pack
    // + 4 GP; Soldier A grants spear/shortbow/healer's kit/quiver/… + 14 GP.
    const created = createMock.mock.calls[0]?.[1] as {
      character: {
        weapons: Array<{ srdId: string; quantity?: number }>;
        equipment: Array<{ srdId?: string; equipped?: boolean }>;
      };
      session: { currency: { gp: number } };
    };
    expect(created.session.currency.gp).toBe(18); // 4 (Fighter A) + 14 (Soldier A)
    const weaponIds = created.character.weapons.map((w) => w.srdId);
    expect(weaponIds).toEqual(
      expect.arrayContaining(["greatsword", "flail", "javelin", "spear", "shortbow"])
    );
    // Armor is worn by default so AC is right immediately.
    const chainMail = created.character.equipment.find((e) => e.srdId === "chain-mail");
    expect(chainMail?.equipped).toBe(true);
  });

  it("a Monk's tool-proficiency pick yields BOTH the proficiency AND the chosen tool item", async () => {
    renderWizard();
    // Quick mode shows every step in one form. Switch to Monk (role=option
    // plaque), pick a non-Human species + a sub-choice-free background.
    fireEvent.click(screen.getByRole("option", { name: /^Monk/ }));
    fireEvent.change(screen.getByRole("combobox", { name: /species/i }), {
      target: { value: "dwarf" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: /background/i }), {
      target: { value: "soldier" },
    });
    fireEvent.change(screen.getByPlaceholderText(/enter name/i), {
      target: { value: "Kai" },
    });
    // The Monk's level-1 "Artisan's Tools or Musical Instrument" choice surfaces
    // in the FeatureChoicesSection — pick Smith's Tools. The Soldier background's
    // own "Choose one kind of Gaming Set" choice surfaces alongside it (two tool
    // choices from two sources coexist) — pick the Dice Set so Create is enabled.
    fireEvent.click(await screen.findByRole("button", { name: /Smith's Tools/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Dice Set/ }));
    // D5 — assign the required background ability boosts (+2 DEX / +1 CON).
    fireEvent.click(screen.getByRole("button", { name: /^DEX10/ }));
    fireEvent.click(screen.getByRole("button", { name: /^CON10/ }));
    // B01 — the two Monk class skills are a create requirement.
    fireEvent.click(screen.getByRole("button", { name: /Acrobatics/ }));
    fireEvent.click(screen.getByRole("button", { name: /History/ }));
    fireEvent.click(screen.getByRole("button", { name: /create character/i }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    const created = createMock.mock.calls[0]?.[1] as { character: CharacterData };
    // (1) the chosen tool's ITEM is in the package EXACTLY ONCE — the
    // `fromToolChoice` marker is the SOLE path (no separate append), so it is
    // never double-added (golden rule 6). This is the no-double-add regression:
    // before the single-source fix, the marker-expansion + the old `chosenToolItems`
    // append would have produced smiths-tools ×2.
    const smithsRows = created.character.equipment.filter(
      (e) => "srdId" in e && e.srdId === "smiths-tools"
    );
    expect(smithsRows).toHaveLength(1);
    expect(smithsRows[0]?.quantity ?? 1).toBe(1);
    // (2) BOTH tool CHOICES are recorded as STABLE IDS in `toolChoices`, keyed by
    // the namespaced source slot — the class (Monk) pick AND the background
    // (Soldier "Gaming Set") pick — never as a baked free-text string (rules 6 + 7).
    expect(created.character.toolChoices?.["class:monk::tool-slot-0"]).toEqual([
      "smiths-tools",
    ]);
    expect(created.character.toolChoices?.["soldier::tool-slot-0"]).toEqual(["dice-set"]);
    // The MANUAL id list stays EMPTY — a choice pick is never baked there.
    expect(created.character.toolProficiencyIds).toEqual([]);
    // (3) the chosen tool PROFICIENCY DERIVES from the stored ids (single source).
    const agg = evaluateGrants(resolveAllGrantSources(created.character));
    expect([...agg.toolProficiencies]).toContain("Smith's Tools");
    expect([...agg.toolProficiencies]).toContain("Dice Set");
  });

  it("explains EVERY unmet requirement when Create is disabled — not just the name (N-A)", () => {
    renderWizard();
    // Quick mode defaults: Human Fighter, no name → several blockers at once. The
    // old UI only ever surfaced "name"; the explainer must list them all.
    expect(screen.getByText(/almost ready/i)).toBeInTheDocument();
    expect(screen.getByText(/name your character/i)).toBeInTheDocument();
    // A Human's origin feat is a blocker too (the bug: it used to show nothing).
    expect(screen.getByText(/human origin feat/i)).toBeInTheDocument();
    // Filling one requirement removes only that row; the rest persist.
    fireEvent.change(screen.getByPlaceholderText(/enter name/i), {
      target: { value: "Borin" },
    });
    expect(screen.queryByText(/name your character/i)).not.toBeInTheDocument();
    expect(screen.getByText(/human origin feat/i)).toBeInTheDocument();
  });

  it("the all-gold equipment option names its purse on the tab", () => {
    renderWizard();
    // Fighter's option C is the 155 gp gold-only alternative — the tab says so
    // without the player having to click through every option.
    expect(screen.getByRole("button", { name: /Option C · 155 gp/ })).toBeInTheDocument();
    // Gear options keep the bare label (one tab per source fork: class + bg).
    expect(screen.getAllByRole("button", { name: /^Option A$/ }).length).toBeGreaterThan(
      0
    );
  });

  it("the HP-mode badge equals the summary card's HP (per-level grants included)", () => {
    renderWizard();
    // A Dwarf Fighter at L1: d10 max (10) + CON 0 + Dwarven Toughness (+1/level)
    // = 11. The average badge must say 11 too — never the die-only 10 beside a
    // summary card reading 11 (one source, golden rule 6).
    fireEvent.change(screen.getByRole("combobox", { name: /species/i }), {
      target: { value: "dwarf" },
    });
    expect(screen.getByText("11 HP")).toBeInTheDocument();
    expect(screen.queryByText("10 HP")).not.toBeInTheDocument();
  });

  it("D5 — the background ability boosts are a create requirement until assigned", () => {
    renderWizard();
    // Unassigned boosts block Create and are named in the explainer.
    expect(screen.getByText(/background ability boosts/i)).toBeInTheDocument();
    // §2.7.3 — the disabled trio carries its one-line cause: the background
    // names WHICH three abilities it boosts.
    expect(
      screen.getByText(/Acolyte boosts Intelligence, Wisdom, or Charisma\./)
    ).toBeInTheDocument();
    // Assign +2 INT / +1 WIS (Acolyte's eligible trio is INT/WIS/CHA).
    fireEvent.click(screen.getByRole("button", { name: /^INT10/ }));
    fireEvent.click(screen.getByRole("button", { name: /^WIS10/ }));
    expect(screen.queryByText(/background ability boosts/i)).not.toBeInTheDocument();
  });

  it("the guided background gallery filters by name, skill, and origin feat", () => {
    renderWizard();
    fireEvent.click(screen.getAllByRole("button", { name: /guided/i })[0] as HTMLElement);
    fireEvent.click(screen.getByRole("button", { name: "Background" }));
    const search = screen.getByPlaceholderText(/search backgrounds/i);
    // By name.
    fireEvent.change(search, { target: { value: "soldier" } });
    expect(screen.getByRole("option", { name: /Soldier/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Acolyte/ })).not.toBeInTheDocument();
    // By granted origin feat ("Alert" — Criminal), accent/case-insensitive.
    fireEvent.change(search, { target: { value: "alert" } });
    expect(screen.getByRole("option", { name: /Criminal/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Soldier/ })).not.toBeInTheDocument();
  });

  it("the origin-feat blocker jumps to the SPELLS step when the open picks are spells", () => {
    renderWizard();
    // Guided mode; defaults are Fighter + Acolyte, whose Magic Initiate (Cleric)
    // feat asks spell picks — those pickers live on the Spells step, so the
    // review explainer's jump must land there (never the background dead-end).
    fireEvent.click(screen.getAllByRole("button", { name: /guided/i })[0] as HTMLElement);
    fireEvent.change(screen.getByPlaceholderText(/enter name/i), {
      target: { value: "Borin" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    fireEvent.click(screen.getByRole("button", { name: /origin feat choices/i }));
    expect(
      screen.getByRole("heading", { name: /choose your spells/i })
    ).toBeInTheDocument();
  });

  it("the review recap attributes each choice to its step and jumps back on tap (§2.4)", () => {
    renderWizard();
    fireEvent.click(screen.getAllByRole("button", { name: /guided/i })[0] as HTMLElement);
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(screen.getByText(/your choices/i)).toBeInTheDocument();
    // The background row carries the choice AND its granted feat, attributed.
    const bgRow = screen.getByRole("button", {
      name: /Acolyte · Magic Initiate \(Cleric\)/,
    });
    // The skills row lists the background-granted proficiencies.
    expect(
      screen.getByRole("button", { name: /Insight · Religion/ })
    ).toBeInTheDocument();
    // One tap = back on the owning step.
    fireEvent.click(bgRow);
    expect(
      screen.getByRole("heading", { name: /choose your background/i })
    ).toBeInTheDocument();
  });
});

describe("CreationWizard — the journey derives from the class (C4)", () => {
  it("a non-caster shows NO Spells orb; switching to a caster morphs it in", () => {
    const router = createMemoryRouter([{ path: "*", element: <CreationWizard /> }], {
      initialEntries: ["/characters/new"],
    });
    render(<RouterProvider router={router} />);
    // Guided mode exposes the orb row.
    fireEvent.click(screen.getAllByRole("button", { name: /guided/i })[0] as HTMLElement);
    // Soldier background (no spell-granting feat) + default Fighter = non-caster.
    fireEvent.click(screen.getByRole("button", { name: "Background" }));
    fireEvent.click(screen.getByRole("option", { name: /Soldier/ }));
    expect(screen.queryByRole("button", { name: "Spells" })).toBeNull();
    // Switching the class to Wizard derives the Spells step back in.
    fireEvent.click(screen.getByRole("button", { name: "Class" }));
    fireEvent.click(screen.getByRole("option", { name: /^Wizard/ }));
    expect(screen.getByRole("button", { name: "Spells" })).toBeInTheDocument();
  });
});

// ─── the background skill meta re-localizes on a locale flip (rule 9 wiring) ───
// Regression for the `localizeSkill` useCallback rewire: the background option's
// skill meta (`PlaqueCard` gloss) is derived through the injected `localizeSkill`
// inside a memo. `localizeSkill` now closes over `t` via useCallback([t]) and the
// memo depends on it, so a locale flip (which changes `t` AND `i18n.language`)
// must re-localize the meta. If the memo failed to recompute, the IT step would
// show stale English skill names — the exact leak the old eslint-disable masked.

describe("CreationWizard — background skill meta re-localizes on locale flip", () => {
  afterEach(async () => {
    if (i18n.language !== "en") await i18n.changeLanguage("en");
  });

  /** Acolyte's skill-meta gloss text — the card gloss naming its skills
   *  (Insight/Religion in EN, Intuizione/Religione in IT). */
  function acolyteGloss(): string {
    const all = Array.from(document.querySelectorAll<HTMLElement>(".wiz-card-gloss"));
    const hit = all.find((el) => /Insight|Intuizione/.test(el.textContent));
    return hit?.textContent ?? "";
  }

  it("flips Insight/Religion -> Intuizione/Religione when the locale changes EN->IT", async () => {
    if (i18n.language !== "en") {
      await act(async () => {
        await i18n.changeLanguage("en");
      });
    }
    renderWizard();
    // Guided mode exposes the orb row; open the Background step.
    fireEvent.click(screen.getAllByRole("button", { name: /guided/i })[0] as HTMLElement);
    fireEvent.click(screen.getByRole("button", { name: "Background" }));

    // EN: the meta reads the English skill names.
    const en = acolyteGloss();
    expect(en).toMatch(/Insight/);
    expect(en).toMatch(/Religion/);
    expect(en).not.toMatch(/Intuizione/);

    // Flip the active locale; both `t` and `i18n.language` change together, so
    // the memo's `localizeSkill` dependency changes identity and it recomputes.
    await act(async () => {
      await i18n.changeLanguage("it");
    });

    const it = acolyteGloss();
    expect(it).toMatch(/Intuizione/);
    expect(it).toMatch(/Religione/);
    expect(it).not.toMatch(/Insight/);
  });
});

describe("CreationWizard — leave-creation guard (useBlocker, dirty-gated — A1)", () => {
  beforeEach(() => vi.clearAllMocks());

  function mountWithRoster() {
    const router = createMemoryRouter(
      [
        { path: "/characters/new", element: <CreationWizard /> },
        { path: "/characters", element: <div>Roster</div> },
      ],
      { initialEntries: ["/characters/new"] }
    );
    render(<RouterProvider router={router} />);
    return router;
  }

  /** Make the wizard DIRTY (the guard only arms once something is invested). */
  function typeAName() {
    fireEvent.change(screen.getByPlaceholderText(/enter name/i), {
      target: { value: "Borin" },
    });
  }

  it("A1 — a PRISTINE wizard never blocks: leaving just navigates (no trap)", async () => {
    const confirmSpy = vi
      .spyOn(useConfirmStore.getState(), "confirm")
      .mockResolvedValue(false);
    const router = mountWithRoster();
    act(() => {
      void router.navigate("/characters");
    });
    await waitFor(() => expect(screen.getByText("Roster")).toBeInTheDocument());
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("blocks navigating away mid-creation and prompts to discard; declining stays put", async () => {
    // The user declines the prompt → the blocker resets and the wizard stays mounted.
    const confirmSpy = vi
      .spyOn(useConfirmStore.getState(), "confirm")
      .mockResolvedValue(false);
    const router = mountWithRoster();
    typeAName();
    // Attempt to leave (a different pathname triggers the blocker).
    act(() => {
      void router.navigate("/characters");
    });
    // The leave-guard fired and asked to confirm the discard.
    await waitFor(() => expect(confirmSpy).toHaveBeenCalledTimes(1));
    // Declined → navigation never completes; still on the wizard, Roster never mounts.
    await waitFor(() => expect(router.state.location.pathname).toBe("/characters/new"));
    expect(screen.queryByText("Roster")).not.toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it("lets the navigation through when the discard is confirmed", async () => {
    // The user confirms → the blocker proceeds and the destination mounts.
    const confirmSpy = vi
      .spyOn(useConfirmStore.getState(), "confirm")
      .mockResolvedValue(true);
    const router = mountWithRoster();
    typeAName();
    act(() => {
      void router.navigate("/characters");
    });
    await waitFor(() => expect(confirmSpy).toHaveBeenCalledTimes(1));
    // Confirmed → the blocker proceeds and the destination route mounts.
    await waitFor(() => expect(screen.getByText("Roster")).toBeInTheDocument());
    expect(router.state.location.pathname).toBe("/characters");
    confirmSpy.mockRestore();
  });
});
