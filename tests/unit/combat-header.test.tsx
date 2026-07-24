/**
 * CombatHeader — edit-mode gating of the identity + vitals (Phase 6, #2/#41).
 *
 * The name and the AC · Init · Speed · PB vitals are sheet-DEFINITION values:
 * they render as clean read-only text in play mode and expose the inline editor
 * only when `uiStore.sheetMode === "edit"`. Editing dispatches through the shared
 * `patchCharacter` seam — asserted via the resulting characterStore state (the
 * dispatch target), not Firestore internals. Stores are the real Zustand stores
 * hydrated with MOCK_CHARACTER (Elf Bard 9; acOverride 17, speed 30).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import i18n from "@/i18n";

// CombatHeader pulls in LevelUpModal → @/lib/firestore → Firebase. Stub Firebase
// so the unit suite stays CI-pure (the env keys are unset in CI); the modal is
// closed in these tests, so nothing actually calls Firestore.
vi.mock("@/lib/firebase", () => ({ db: {} }));

import { MemoryRouter } from "react-router";
import { CombatHeader } from "@/features/character/center/CombatHeader";

/** The header navigates to the level-up ROUTE now — give it a router context. */
function renderHeader() {
  return render(
    <MemoryRouter>
      <CombatHeader />
    </MemoryRouter>
  );
}
import { useCharacterStore } from "@/stores/characterStore";
import { useUIStore } from "@/stores/uiStore";
import { useUndoStore, registerUndoable } from "@/stores/undoStore";
import { useToastStore } from "@/stores/toastStore";
import { MOCK_CHARACTER } from "@/lib/mock";
import { assertNonEmptyString } from "@/lib/non-empty-string";

function load(): void {
  useCharacterStore.setState({
    character: structuredClone(MOCK_CHARACTER),
    loading: false,
    error: null,
  });
}

beforeEach(() => {
  useUIStore.setState({ sheetMode: "play" });
  useUndoStore.setState({ characterId: null, past: [], future: [] });
  useCharacterStore.setState({
    character: null,
    loading: false,
    error: null,
    readonly: false,
  });
});

afterEach(async () => {
  // Some tests switch the UI locale; restore EN so the rest stay deterministic.
  if (i18n.language !== "en") await i18n.changeLanguage("en");
});

describe("CombatHeader — edit-mode gating", () => {
  it("renders the name + vitals as read-only text in play mode (no edit controls)", () => {
    load();
    renderHeader();
    // The name is visible as a heading…
    expect(screen.getByText("Lyra Voss")).toBeInTheDocument();
    // …but exposes no click-to-edit affordance in play mode.
    expect(
      screen.queryByRole("button", { name: /character name/i })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "AC" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Proficiency Bonus" })
    ).not.toBeInTheDocument();
  });

  it("exposes the name + every vital as an inline editor in edit mode", () => {
    load();
    useUIStore.setState({ sheetMode: "edit" });
    renderHeader();
    expect(screen.getByRole("button", { name: /character name/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "AC" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Initiative" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Speed" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Proficiency Bonus" })).toBeInTheDocument();
  });

  it("D21 — the hero seal becomes a portrait editor in edit mode only", () => {
    load();
    // Play mode: no edit-portrait affordance on the seal.
    renderHeader();
    expect(
      screen.queryByRole("button", { name: /edit portrait/i })
    ).not.toBeInTheDocument();
  });

  it("D21 — edit mode exposes the seal's add/edit portrait control", () => {
    load();
    useUIStore.setState({ sheetMode: "edit" });
    renderHeader();
    // The mock has no portrait → the seal is the 'Edit portrait' trigger (which
    // opens the file picker); the shared usePortraitCrop flow backs it.
    expect(screen.getByRole("button", { name: /edit portrait/i })).toBeInTheDocument();
  });

  it("editing the name dispatches patchCharacter({ name }) into the store", () => {
    load();
    useUIStore.setState({ sheetMode: "edit" });
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: /character name/i }));
    const input = screen.getByLabelText(/character name/i);
    fireEvent.change(input, { target: { value: "Aria Moon" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(useCharacterStore.getState().character?.character.name).toBe("Aria Moon");
  });

  it("editing AC writes an acOverride through the store seam", () => {
    load();
    useUIStore.setState({ sheetMode: "edit" });
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "AC" }));
    const input = screen.getByLabelText("AC");
    fireEvent.change(input, { target: { value: "18" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(useCharacterStore.getState().character?.character.acOverride).toBe(18);
  });

  it("the AC reset-to-auto clears the override (mock seeds acOverride 17)", () => {
    load();
    useUIStore.setState({ sheetMode: "edit" });
    renderHeader();
    // The mock pins acOverride 17 ≠ computed AC, so the override indicator + the
    // reset-to-auto control render.
    fireEvent.click(screen.getByRole("button", { name: /reset to auto/i }));
    expect(useCharacterStore.getState().character?.character.acOverride).toBeNull();
  });

  it("#67/S13 — EN edits speed in feet → pins the effective-Speed OVERRIDE (feet)", () => {
    load(); // mock speed "30", no speed grants → computed effective = 30 ft
    useUIStore.setState({ sheetMode: "edit" });
    renderHeader();
    const speed = screen.getByRole("button", { name: "Speed" });
    expect(speed).toHaveTextContent(/30\s*ft/);
    fireEvent.click(speed);
    const input = screen.getByLabelText("Speed");
    fireEvent.change(input, { target: { value: "35" } });
    fireEvent.keyDown(input, { key: "Enter" });
    // S13 — editing the vital now pins `speedOverride` (override-first, mirroring
    // AC), leaving the species BASE `speed` untouched.
    expect(useCharacterStore.getState().character?.character.speedOverride).toBe(35);
    expect(useCharacterStore.getState().character?.character.speed).toBe("30");
  });

  it("#67/S13 — IT edits speed in metres → round-trips to a stored feet OVERRIDE", async () => {
    load(); // mock speed "30" → 9 m
    await act(async () => {
      await i18n.changeLanguage("it");
    });
    useUIStore.setState({ sheetMode: "edit" });
    renderHeader();
    // Read display is metres (the aria-label is itself localized in IT, so match
    // on the displayed value instead of the English name).
    const speed = screen.getByText(/^9\s*m$/);
    fireEvent.click(speed);
    // Only the speed field is editing → the lone spinbutton.
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "12" } });
    fireEvent.keyDown(input, { key: "Enter" });
    // 12 m → 40 ft (12 / 0.3, snapped to the 5-ft grid), stored as the override.
    expect(useCharacterStore.getState().character?.character.speedOverride).toBe(40);
  });

  it("#68/U2 — no initiative-advantage mark in play mode when the character has no advantage", () => {
    load(); // Lyra (Bard 9) has no advantage-on:initiative grant
    renderHeader();
    expect(
      screen.queryByRole("img", { name: /advantage on initiative/i })
    ).not.toBeInTheDocument();
  });

  it("#68/U2/RA-25 — edit mode exposes a four-state initiative-roll toggle: auto→advantage→disadvantage→normal→auto", () => {
    load();
    useUIStore.setState({ sheetMode: "edit" });
    renderHeader();
    const toggle = screen.getByRole("button", { name: /initiative roll: auto/i });
    // auto → advantage
    fireEvent.click(toggle);
    expect(
      useCharacterStore.getState().character?.character.initiativeAdvantageOverride
    ).toBe("advantage");
    // advantage → disadvantage
    fireEvent.click(screen.getByRole("button", { name: /initiative roll: advantage/i }));
    expect(
      useCharacterStore.getState().character?.character.initiativeAdvantageOverride
    ).toBe("disadvantage");
    // disadvantage → normal (off)
    fireEvent.click(
      screen.getByRole("button", { name: /initiative roll: disadvantage/i })
    );
    expect(
      useCharacterStore.getState().character?.character.initiativeAdvantageOverride
    ).toBe("off");
    // normal → auto (null)
    fireEvent.click(screen.getByRole("button", { name: /initiative roll: normal/i }));
    expect(
      useCharacterStore.getState().character?.character.initiativeAdvantageOverride
    ).toBeNull();
  });

  it("#68/U2/RA-25 — a manual Disadvantage override shows the play-mode danger mark (Surprise)", () => {
    load();
    // Pin Disadvantage on the loaded character (a surprised player), then render play mode.
    useCharacterStore.setState((s) => {
      const doc = s.character;
      if (!doc) return s;
      return {
        character: {
          ...doc,
          character: {
            ...doc.character,
            initiativeAdvantageOverride: "disadvantage",
          },
        },
      };
    });
    renderHeader();
    expect(
      screen.getByRole("img", { name: /disadvantage on initiative/i })
    ).toBeInTheDocument();
    // Anchor to exclude the "Disadvantage…" substring match.
    expect(
      screen.queryByRole("img", { name: /^advantage on initiative/i })
    ).not.toBeInTheDocument();
  });

  it("carries NO edit toggle — the edit control lives in the fob family, not the masthead", () => {
    load();
    useUIStore.setState({ sheetMode: "edit" });
    renderHeader();
    // The masthead is pure identity + vitals on every viewport: no Edit / Editing /
    // Done pill (that's the BinderFob's / MobileSignet's ✎ coin, mounted by the cockpit).
    expect(screen.queryByRole("button", { name: /^edit$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /editing/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^done$/i })).not.toBeInTheDocument();
  });
});

describe("CombatHeader — HP element constant footprint (BUG 1)", () => {
  function load0(): void {
    const base = structuredClone(MOCK_CHARACTER);
    useCharacterStore.setState({
      character: {
        ...base,
        session: { ...base.session, hp: { ...base.session.hp, current: 0 } },
      },
      loading: false,
      error: null,
    });
  }

  it("the vitals strip is unchanged alive vs 0 HP — the HP element swaps in place, dying controls stay out of the header", () => {
    // Alive — HP renders as the slim bar → popover trigger, beside the four
    // read-only vitals.
    load();
    const { unmount } = renderHeader();
    expect(screen.getByRole("button", { name: /hit points/i })).toBeInTheDocument();
    // The vitals now render through the shared StatBadge atom: the visible label is
    // the canonical ACRONYM (Speed → SPD); the full term lives in the title/aria.
    for (const label of ["AC", "Init", "SPD", "PB"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.queryByText(/dying/i)).not.toBeInTheDocument();
    unmount();

    // 0 HP — the HP element collapses to a same-sized "0 HP · Dying" pill in the
    // SAME slot (constant footprint) that STAYS the one HP editor (RA-03: damage
    // taken while down enters here and marks death-save failures). The dying
    // CEREMONY (death saves / quick heal / roll entry) is NOT in the header; it
    // lives in the global DyingBanner. The four sibling vitals are untouched.
    load0();
    renderHeader();
    expect(screen.getByText(/dying/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /hit points/i })).toBeInTheDocument();
    expect(screen.queryByText(/death saves/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^heal$/i })).not.toBeInTheDocument();
    for (const label of ["AC", "Init", "SPD", "PB"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});

describe("CombatHeader — active buff AC reflected in the AC chip (S7 wiring)", () => {
  it("an active Mage Armor lifts the displayed AC chip from the bare body AC", () => {
    // Lyra (DEX 16, unarmored) computes AC 13; the mock pins acOverride 17. Clear
    // the override and prepare + ACTIVATE Mage Armor — the chip must now read 16
    // (13 + DEX), proving the lit while-active formula reaches the rendered AC via
    // the canonical `computeCharacterAC` seam (not just the engine in isolation).
    const base = structuredClone(MOCK_CHARACTER);
    useCharacterStore.setState({
      character: {
        ...base,
        character: {
          ...base.character,
          acOverride: null,
          spells: [...base.character.spells, { srdId: "mage-armor", prepared: true }],
        },
        session: { ...base.session, activeFeatures: ["spell-mage-armor"] },
      },
      loading: false,
      error: null,
    });
    renderHeader();
    // The AC vital sits beside its "AC" label; assert the buffed value renders.
    const acVital = screen.getByText("AC").closest(".vital");
    expect(acVital).not.toBeNull();
    expect(acVital).toHaveTextContent("16");
    expect(acVital).not.toHaveTextContent("13");
  });
});

describe("CombatHeader — the Living Sheet (Rest medallion + Level-Up ceremony)", () => {
  it("carries NO management row — Undo · Redo · Edit · ⋯ live in the fob family, not the masthead", () => {
    useUndoStore.setState({ characterId: null, past: [], future: [] });
    useToastStore.getState().clearAll();
    load();
    // Even with history on the stack, the masthead exposes none of the management
    // controls — they live in the BinderFob / MobileSignet (mounted by the cockpit).
    registerUndoable({ message: "Cast Cure Wounds" }, () => () => {}, {
      turnScoped: false,
    });
    renderHeader();
    expect(screen.queryByRole("button", { name: /^edit$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Undo:/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Redo:/ })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /more actions/i })
    ).not.toBeInTheDocument();
  });

  it("Rest is a glyph-only moon medallion trailing the HP tile (opens the Rest modal)", () => {
    load();
    const { container } = renderHeader();
    const medal = container.querySelector<HTMLButtonElement>(".rest-medal");
    expect(medal).not.toBeNull();
    // Glyph-only: the accessible name is the verb, but NO standing text renders —
    // this is what keeps the vitals row locale-stable (see the pinned test below).
    expect(medal).toHaveAccessibleName("Rest");
    expect(medal?.textContent).toBe("");
    // The hover label is the app's BRANDED folio tooltip (see the fine-pointer test
    // below), never a native browser `title` (owner: "the usual discreet tooltip").
    expect(medal).not.toHaveAttribute("title");
    // It trails HP as a same-row SIBLING in the vitals deck (data leads, its
    // control follows) — the exact placement on desktop AND phones (one rule
    // across breakpoints), so there is no wrapper: the coin is a direct child of
    // `.hdr-vitals` whose previous sibling is the HP tile.
    expect(medal?.parentElement?.classList.contains("hdr-vitals")).toBe(true);
    expect(medal?.previousElementSibling?.classList.contains("vital-hp")).toBe(true);
  });

  it("Level Up is pure availability ceremony — the lineage chip ALONE (no portrait gem)", () => {
    load(); // Lyra is Bard 9 → the chip awaits level 10
    const { container } = renderHeader();
    // The portrait level-up gem is REMOVED (owner: users won't read it) — neither
    // the corner gem nor its gold ready-halo is struck onto the seal. The chip
    // beside the lineage carries availability alone.
    expect(container.querySelector(".seal-lvl")).toBeNull();
    expect(container.querySelector(".seal-dot")).toBeNull();
    expect(container.querySelector(".seal.lvl-ready")).toBeNull();
    const chip = container.querySelector<HTMLButtonElement>(".lvl-chip");
    expect(chip).not.toBeNull();
    expect(chip).toHaveTextContent(/Level 10/);
    // Label-in-Name: the accessible name carries the verb AND contains the visible
    // "Level 10", so a screen reader hears the whole action.
    expect(chip).toHaveAccessibleName("Level up to level 10");
    // The hover label rides the branded folio tooltip, not a native `title`.
    expect(chip).not.toHaveAttribute("title");
  });

  // The Rest / Level-Up hover labels are the app's BRANDED folio Tooltip (fine
  // pointers), fed the SAME localized i18n keys the accessible name uses — never a
  // native `title` (owner ruling). jsdom can't hover a Radix portal open, so we pin
  // the invariant that survives the change: the localized label reaches the control
  // as its accessible name (which the tooltip mirrors), and no native `title` leaks.
  // The real hover render is covered by tests/e2e/living-sheet.spec.ts.
  it("names Rest + Level-Up via the branded tooltip label (localized, no native title) — EN", () => {
    load();
    const { container } = renderHeader();
    const medal = container.querySelector<HTMLButtonElement>(".rest-medal");
    const chip = container.querySelector<HTMLButtonElement>(".lvl-chip");
    expect(medal).toHaveAccessibleName("Rest");
    expect(chip).toHaveAccessibleName("Level up to level 10");
    expect(medal).not.toHaveAttribute("title");
    expect(chip).not.toHaveAttribute("title");
  });

  it("the branded-tooltip label follows the locale (IT) and stays free of native title", async () => {
    await act(async () => {
      await i18n.changeLanguage("it");
    });
    load();
    const { container } = renderHeader();
    const medal = container.querySelector<HTMLButtonElement>(".rest-medal");
    const chip = container.querySelector<HTMLButtonElement>(".lvl-chip");
    // The localized keys (character.rest / character.levelUpChipAria) drive the
    // accessible name the tooltip mirrors — proving the label is i18n-fed, not hardcoded.
    expect(medal).toHaveAccessibleName("Riposo");
    expect(chip).toHaveAccessibleName("Sali al livello 10");
    expect(medal).not.toHaveAttribute("title");
    expect(chip).not.toHaveAttribute("title");
  });

  it("omits the ENTIRE Level-Up ceremony at level 20 (the app's availability knowledge)", () => {
    const doc = structuredClone(MOCK_CHARACTER);
    doc.character.classes = doc.character.classes
      .slice(0, 1)
      .map((entry) => ({ ...entry, level: 20 }));
    useCharacterStore.setState({ character: doc, loading: false, error: null });
    const { container } = renderHeader();
    expect(container.querySelector(".seal.lvl-ready")).toBeNull();
    expect(container.querySelector(".seal-lvl")).toBeNull();
    expect(container.querySelector(".lvl-chip")).toBeNull();
    // Rest is available at every level, so the medallion survives.
    expect(container.querySelector(".rest-medal")).not.toBeNull();
  });

  // THE PINNED locale-stability test (round-3 acceptance): the vitals row must be
  // geometry-identical EN vs IT. jsdom has no layout engine, so we pin the ROOT
  // CAUSE of that stability — the row carries NO locale-varying text (the Rest
  // verb, the one thing that differed, now lives in the branded hover tooltip + aria
  // on a glyph-only coin). The real pixel-geometry pin lives in tests/e2e/living-sheet.spec.ts.
  it("PINNED — the vitals row carries no locale-varying text (glyph-only Rest)", async () => {
    const structure = (container: HTMLElement): string[] => {
      const vitals = container.querySelector(".hdr-vitals");
      return [...(vitals?.children ?? [])].map((el) => el.className);
    };

    load();
    const en = renderHeader();
    const enStructure = structure(en.container);
    const enMedalText = en.container.querySelector(".rest-medal")?.textContent;
    en.unmount();

    await act(async () => {
      await i18n.changeLanguage("it");
    });
    load();
    const it = renderHeader();
    const itStructure = structure(it.container);
    const itMedalText = it.container.querySelector(".rest-medal")?.textContent;
    it.unmount();

    // Same child boxes, same order, same classes → same geometry by construction.
    expect(itStructure).toEqual(enStructure);
    // And the coin renders zero text in BOTH locales — the invariant that makes it so.
    expect(enMedalText).toBe("");
    expect(itMedalText).toBe("");
  });
});

describe("CombatHeader — read-only mode (T4: DM views a member's sheet)", () => {
  function loadReadonly(): void {
    useCharacterStore.setState({
      character: structuredClone(MOCK_CHARACTER),
      loading: false,
      error: null,
      readonly: true,
    });
  }

  it("hides EVERY management affordance — the edit control, the Rest medallion, and the Level-Up ceremony", () => {
    loadReadonly();
    const { container } = renderHeader();
    // Identity + vitals still render (read-only).
    expect(screen.getByText("Lyra Voss")).toBeInTheDocument();
    expect(screen.getByText("AC")).toBeInTheDocument();
    // …but the owner-only management affordances are gone: the edit control
    // (which lives in the fob family anyway), the Rest medallion, and the whole
    // Level-Up ceremony (seal gem + chip).
    expect(screen.queryByRole("button", { name: /^edit$/i })).not.toBeInTheDocument();
    expect(container.querySelector(".rest-medal")).toBeNull();
    expect(container.querySelector(".seal.lvl-ready")).toBeNull();
    expect(container.querySelector(".seal-lvl")).toBeNull();
    expect(container.querySelector(".lvl-chip")).toBeNull();
  });

  it("forces play mode — even if the UI store says edit, no inline editors appear", () => {
    loadReadonly();
    useUIStore.setState({ sheetMode: "edit" });
    renderHeader();
    expect(
      screen.queryByRole("button", { name: /character name/i })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "AC" })).not.toBeInTheDocument();
  });
});

describe("CombatHeader — No-Truncation Rule on the name (DESIGN.md §3, owner 2026-06-12)", () => {
  it("the name heading carries NO ellipsis clamp — it wraps instead (a long name never becomes 'Coralino di S…')", () => {
    load();
    useCharacterStore.setState((s) =>
      s.character
        ? {
            character: {
              ...s.character,
              character: {
                ...s.character.character,
                name: assertNonEmptyString("Coralino di Sanvaldo"),
              },
            },
          }
        : s
    );
    renderHeader();
    const heading = screen.getByRole("heading", { level: 1 });
    // The Tailwind `truncate` recipe (nowrap + text-overflow: ellipsis) is the
    // forbidden mid-name clamp; the wrap recipe must be present in its place.
    expect(heading.className).not.toMatch(/\btruncate\b/);
    expect(heading.className).toMatch(/\bbreak-words\b/);
    // The identity line below the name follows the same rule.
    const identity = heading.nextElementSibling;
    expect(identity?.className ?? "").not.toMatch(/\btruncate\b/);
  });

  it("edit mode: the name renders through the quiet TEXT affordance (zero layout footprint — the edit-mode no-fold seam)", () => {
    load();
    useCharacterStore.setState((s) =>
      s.character
        ? {
            character: {
              ...s.character,
              character: {
                ...s.character.character,
                name: assertNonEmptyString("Coralino di Sanvaldo"),
              },
            },
          }
        : s
    );
    useUIStore.setState({ sheetMode: "edit" });
    renderHeader();
    // The at-rest editable name must carry the quiet TEXT recipe
    // (`[data-affordance="quiet"][data-kind="text"]` — padding/border-free, frame
    // drawn in box-shadow). With any horizontal padding on this atomic button,
    // Chromium under-measures its intrinsic width by a sub-pixel and the
    // content-sized header boxed "Coralino di Sanvaldo" onto two lines in a
    // half-empty header (owner regression 2026-06-12). The real layout pin lives
    // in tests/e2e/edit-mode.spec.ts ("Edit-mode name layout").
    const nameBtn = screen.getByRole("button", { name: /character name/i });
    expect(nameBtn).toHaveAttribute("data-affordance", "quiet");
    expect(nameBtn).toHaveAttribute("data-kind", "text");
    // The identity block owns the header's free space (grow), so the actively-
    // editing input gets real width instead of a content-collapsed box.
    const block = screen.getByRole("heading", { level: 1 }).parentElement;
    expect(block?.className ?? "").toMatch(/\bgrow\b/);
  });
});

describe("CombatHeader — the masthead is pure identity + vitals (management lives in the fob family)", () => {
  it("carries no management chrome on any viewport — just identity, vitals, and the Living-Sheet ceremony", () => {
    load();
    const { container } = renderHeader();
    // No management edit control in the masthead (BinderFob on desktop,
    // MobileSignet on mobile own Undo · Redo · Edit · ⋯ — mounted by the cockpit).
    expect(screen.queryByRole("button", { name: /^edit$/i })).not.toBeInTheDocument();
    // Identity + vitals + the Living-Sheet ceremony still render.
    expect(screen.getByText("Lyra Voss")).toBeInTheDocument();
    expect(screen.getByText("AC")).toBeInTheDocument();
    expect(container.querySelector(".rest-medal")).not.toBeNull();
  });
});
