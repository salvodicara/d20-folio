/**
 * Weapon Mastery re-picker in the Features tab (U4).
 *
 * 2024 RAW lets a martial class change one mastered weapon on a Long Rest, so —
 * like subclass maneuvers / Sorcerer metamagic / Warlock invocations — Weapon
 * Mastery is a swappable "pick N" group surfaced in the Features tab (review section
 * + edit-mode re-pick), not only at level-up. This pins that the group appears for a
 * class that has the feature and is absent for one that doesn't.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import i18n from "@/i18n";

// FeaturesTab → FeatureAddModal → CompendiumPicker may pull the Firebase-backed
// modules transitively; stub Firebase so the unit suite stays CI-pure.
vi.mock("@/lib/firebase", () => ({ db: {} }));

import { FeaturesTab } from "@/features/character/center/tabs/FeaturesTab";
import { useCharacterStore } from "@/stores/characterStore";
import { useUIStore } from "@/stores/uiStore";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CharacterDoc } from "@/types/character";
import { localizeWeaponMastery } from "@/lib/views/srd-i18n";
import { listMasterableWeapons } from "@/lib/weapon-mastery-pick";
import type { WeaponMastery } from "@/data/types";

function asFighter(): CharacterDoc {
  const base = structuredClone(MOCK_CHARACTER);
  return {
    ...base,
    character: {
      ...base.character,
      classes: [{ classId: "fighter", level: 5, weaponMasteries: ["longsword"] }],
      // The placeholder feature that signals "this character has Weapon Mastery".
      features: [{ srdId: "fighter-weapon-mastery" }],
    },
  };
}

/**
 * A Barbarian 4 with the 2 masteries already picked at L1 — the exact #30 case
 * (Santaera). RAW grants 3 mastery weapons at Barbarian 4 (the Weapon Mastery
 * column), so the re-picker must offer 3. Before the table-driven fix the count
 * was a hardcoded flat 2 and the player could never pick the 3rd.
 */
function asBarbarian4(): CharacterDoc {
  const base = structuredClone(MOCK_CHARACTER);
  return {
    ...base,
    character: {
      ...base.character,
      classes: [
        { classId: "barbarian", level: 4, weaponMasteries: ["greataxe", "handaxe"] },
      ],
      features: [{ srdId: "barbarian-weapon-mastery" }],
    },
  };
}

/**
 * A Wizard 4 who took the Weapon Master FEAT — a NON-mastery class. 2024 RAW: the
 * feat grants ONE Weapon Mastery slot of its own, so the picker must surface (max 1)
 * for a class whose own mastery column is 0. Before the feat was wired the picker
 * never appeared (the gate keyed only on the class features).
 */
function asWizardWithWeaponMasterFeat(): CharacterDoc {
  const base = structuredClone(MOCK_CHARACTER);
  return {
    ...base,
    character: {
      ...base.character,
      classes: [{ classId: "wizard", level: 4 }],
      features: [{ srdId: "weapon-master" }],
    },
  };
}

beforeEach(() => {
  useUIStore.setState({ sheetMode: "play" });
  useCharacterStore.setState({ character: null, loading: false, error: null });
});

describe("Features tab — Weapon Mastery re-picker (U4)", () => {
  it("shows the Weapon Mastery group for a Fighter (with the current pick)", () => {
    useCharacterStore.setState({ character: asFighter(), loading: false, error: null });
    render(<FeaturesTab />);
    expect(screen.getByRole("heading", { name: /weapon mastery/i })).toBeInTheDocument();
    // The current mastered weapon renders as a badge in the review section.
    expect(screen.getByText(/longsword/i)).toBeInTheDocument();
  });

  // P4 pass: these are the RAW-swappable choice groups (weapon mastery even swaps
  // on a Long Rest), so the re-pick control is reachable in BOTH modes — an unmade
  // pick was a dead end in play mode. The modal's Cancel/Save keeps commits explicit.
  it("exposes the re-pick control in play mode too (RAW-swappable choices)", () => {
    useCharacterStore.setState({ character: asFighter(), loading: false, error: null });
    const { rerender } = render(<FeaturesTab />);
    // Play mode: the control is present (a pick exists → "Change").
    expect(screen.getAllByRole("button", { name: /change/i }).length).toBeGreaterThan(0);
    useUIStore.setState({ sheetMode: "edit" });
    rerender(<FeaturesTab />);
    expect(screen.getAllByRole("button", { name: /change/i }).length).toBeGreaterThan(0);
  });

  it("labels the control 'Choose' while nothing is picked (the empty ask acts)", () => {
    const doc = asFighter();
    doc.character.classes = [{ classId: "fighter", level: 5 }];
    useCharacterStore.setState({ character: doc, loading: false, error: null });
    render(<FeaturesTab />);
    // No mastery picked yet → the empty state pairs with a "Choose" action.
    expect(screen.getByText(/nothing chosen yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^choose$/i })).toBeInTheDocument();
  });

  // REGRESSION #30 (Santaera, Barbarian 4): the re-picker must offer the
  // level-scaled count — 3 at Barbarian 4 — not a hardcoded flat 2. This pins the
  // wiring (classEntryLevel → weaponMasteryCountForClass → picker `max`/label) on
  // the actual Features-tab surface, so a count regression fails here, not in prod.
  it("offers 3 mastery picks for a Barbarian 4 (#30 scaling, was a flat 2)", () => {
    useUIStore.setState({ sheetMode: "edit" });
    useCharacterStore.setState({
      character: asBarbarian4(),
      loading: false,
      error: null,
    });
    render(<FeaturesTab />);
    // Open the weapon-mastery re-pick (the Barbarian's sole re-pick group).
    const changeButtons = screen.getAllByRole("button", { name: /change/i });
    fireEvent.click(changeButtons[changeButtons.length - 1] as HTMLElement);
    const dialog = screen.getByRole("dialog");
    // The count label is pluralized from `count` — "Choose your 3 mastery weapons".
    expect(within(dialog).getByText(/3 mastery weapons/i)).toBeInTheDocument();
  });

  // WEAPON MASTER FEAT (fail-before / pass-after): a Wizard 4 with the feat — a class
  // whose own mastery column is 0 — now surfaces the Weapon Mastery picker with EXACTLY
  // ONE slot, fed by the SAME resolver as class masteries. Before the feat was wired
  // the gate keyed only on class features, so this group never appeared.
  it("shows the Weapon Mastery group (1 slot) for a Wizard who took the Weapon Master feat", () => {
    useUIStore.setState({ sheetMode: "edit" });
    useCharacterStore.setState({
      character: asWizardWithWeaponMasterFeat(),
      loading: false,
      error: null,
    });
    render(<FeaturesTab />);
    expect(screen.getByRole("heading", { name: /weapon mastery/i })).toBeInTheDocument();
    // Nothing picked yet → the control reads "Choose".
    const chooseButtons = screen.getAllByRole("button", { name: /^choose$/i });
    fireEvent.click(chooseButtons[chooseButtons.length - 1] as HTMLElement);
    const dialog = screen.getByRole("dialog");
    // The count label is pluralized from `count` — "Choose your 1 mastery weapon".
    expect(within(dialog).getByText(/1 mastery weapon/i)).toBeInTheDocument();
  });

  it("does NOT show the Weapon Mastery group for a class without it (Bard mock)", () => {
    useCharacterStore.setState({
      character: structuredClone(MOCK_CHARACTER),
      loading: false,
      error: null,
    });
    render(<FeaturesTab />);
    expect(
      screen.queryByRole("heading", { name: /weapon mastery/i })
    ).not.toBeInTheDocument();
  });
});

/**
 * LANGUAGE-LEAK LOCK (owner feedback, IT screenshot): the Weapon Mastery picker
 * (and every other surface that shows a weapon's Mastery property) MUST resolve the
 * property name through the shared `weapon-mastery` SRD catalogue — never render the
 * raw English token ("TOPPLE", "VEX", "SLOW", …) while the rest of the UI is IT.
 *
 * This catches the leak class the locale-sweep can't: an ENGINE FACT (the stable
 * `WeaponMastery` token on the equipment data) rendered raw by a surface. We pin the
 * ONE resolver path all surfaces now share (`localizeWeaponMastery`), table-driven —
 * one row per masterable weapon — asserting the IT name is produced and the EN token
 * is NEVER the displayed label in IT.
 */
/**
 * RENDER LOCK (fail-before / pass-after): opens the actual Weapon Mastery re-pick
 * modal in the IT locale — the exact surface from the owner's screenshot — and
 * asserts the rows show the localized mastery name (e.g. "Rovesciare") and NEVER
 * the raw English token (e.g. "Topple"). Before the fix the option note rendered
 * `w.mastery` raw, so this FAILS; after the reroute through `localizeWeaponMastery`
 * it PASSES. This is the leak the locale-sweep never opened (a Features-tab modal).
 */
describe("Weapon Mastery re-pick — renders IT mastery names, not EN tokens", () => {
  beforeEach(() => {
    useUIStore.setState({ sheetMode: "edit" });
    useCharacterStore.setState({ character: null, loading: false, error: null });
  });

  afterEach(async () => {
    if (i18n.language !== "en") {
      await act(async () => {
        await i18n.changeLanguage("en");
      });
    }
  });

  it("shows the localized property name and no raw English token in the IT picker", async () => {
    await act(async () => {
      await i18n.changeLanguage("it");
    });
    useCharacterStore.setState({ character: asFighter(), loading: false, error: null });
    render(<FeaturesTab />);

    // Open the weapon-mastery re-pick (the edit-mode "Modifica"/"Change" control).
    // The Fighter has only this one re-pick group, so it's the sole such button.
    const changeButtons = screen.getAllByRole("button", { name: /modifica|change/i });
    fireEvent.click(changeButtons[changeButtons.length - 1] as HTMLElement);

    // The picker dialog is now open; scope the assertions to it.
    const dialog = await screen.findByRole("dialog");

    // The Topple weapons (e.g. Battleaxe/Greataxe/Maul/Warhammer) note "Rovesciamento"
    // in IT — the official SRD 5.2.1 name — and the raw token "Topple" must NOT appear.
    expect(within(dialog).getAllByText(/Rovesciamento/).length).toBeGreaterThan(0);
    expect(within(dialog).queryByText(/\bTopple\b/)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/\bVex\b/)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/\bSlow\b/)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/\bNick\b/)).not.toBeInTheDocument();
  });
});

describe("Weapon Mastery — no English-token leak in IT (resolver lock)", () => {
  // Every masterable SRD weapon carries one of the eight mastery tokens; the picker
  // notes each row with it. One assertion row per weapon = the full coverage matrix.
  const weapons = listMasterableWeapons();

  it("covers every masterable weapon (guards the table can't silently empty out)", () => {
    expect(weapons.length).toBeGreaterThan(0);
    // Each masterable weapon has a stable, capitalized mastery token.
    for (const w of weapons) {
      expect(typeof w.mastery).toBe("string");
    }
  });

  it.each(weapons.map((w) => [w.id, w.mastery as WeaponMastery] as const))(
    "%s — resolves the IT mastery name and never shows the raw EN token in IT",
    (_weaponId, mastery) => {
      const it = localizeWeaponMastery(mastery, "it");
      const en = localizeWeaponMastery(mastery, "en");
      // The EN label must equal the catalogue's EN name (= the raw token, capitalized).
      expect(en).toBe(mastery);
      // The leak guard: in IT the displayed label is NOT the raw English token and
      // carries no `⟦…⟧` missing-string sentinel.
      expect(it).not.toBe(mastery);
      expect(it).not.toContain("⟦");
    }
  );

  it("Topple resolves to the official IT term 'Rovesciamento'", () => {
    expect(localizeWeaponMastery("Topple", "it")).toBe("Rovesciamento");
  });
});
