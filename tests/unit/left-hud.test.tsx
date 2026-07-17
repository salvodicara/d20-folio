/**
 * LeftHud — the identity rail (re-home target of the retired Abilities page).
 *
 * Covers what the Left HUD owns: the six Carved-Cartouche ability medallions
 * (scores + modifiers, the saving throw folded into each), the caster face, the
 * progressive skills list, and the Senses block (passive perception + darkvision).
 * Every number is engine-derived; this asserts the rendered display on
 * MOCK_CHARACTER (Elf Bard 9 — CHA 20 caster, DEX 16, STR 8, darkvision 60). The
 * proficiencies/defenses half of the old page lives in the Right HUD
 * (`resource-rail.test`); HP/exhaustion in their own panels.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { LeftHud } from "@/features/character/hud/LeftHud";
import { useCharacterStore } from "@/stores/characterStore";
import { useUIStore } from "@/stores/uiStore";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CharacterDoc } from "@/types/character";

function load(doc: CharacterDoc = structuredClone(MOCK_CHARACTER)): void {
  useCharacterStore.setState({ character: doc, loading: false, error: null });
}

describe("LeftHud", () => {
  beforeEach(() => {
    useUIStore.setState({ sheetMode: "play" });
    useCharacterStore.setState({ character: null, loading: false, error: null });
  });

  it("renders nothing without a character", () => {
    const { container } = render(<LeftHud />);
    expect(container.firstChild).toBeNull();
  });

  it("renders all six ability medallions with engine-derived modifiers", () => {
    load();
    const { container } = render(<LeftHud />);
    const cards = container.querySelectorAll(".statcard");
    expect(cards).toHaveLength(6);
    const mods = [...container.querySelectorAll(".sc-mod")].map((n) => n.textContent);
    // CHA 20 → +5, DEX 16 → +3, STR 8 → −1 (typographic minus U+2212).
    expect(mods).toContain("+5");
    expect(mods).toContain("+3");
    expect(mods.some((m) => /[-−]1/.test(m))).toBe(true);
  });

  it("D48 — lays the 6 medallions out in a 2-column grid of fatter cards", () => {
    load();
    const { container } = render(<LeftHud />);
    // 6 medallions in a 2-col grid = 3 rows of WIDER cards (was a slim 3-col grid);
    // each card puts the modifier + score gem on one row (the .sc-modrow).
    const grid = container.querySelector(".statcard")?.closest(".grid");
    expect(grid?.className).toContain("grid-cols-2");
    expect(grid?.querySelectorAll(".statcard")).toHaveLength(6);
    expect(grid?.querySelectorAll(".sc-modrow")).toHaveLength(6);
  });

  it("marks exactly the spellcasting ability as the caster face", () => {
    load();
    const { container } = render(<LeftHud />);
    const casters = container.querySelectorAll(".statcard.caster");
    expect(casters).toHaveLength(1);
    // Lyra's caster ability is CHA → its medallion carries the CHA short label.
    expect(casters[0]?.textContent).toMatch(/CHA/i);
  });

  it("folds the saving throw into every medallion (bonus shown for proficient saves)", () => {
    load();
    const { container } = render(<LeftHud />);
    // Every medallion carries the folded save line…
    expect(container.querySelectorAll(".sc-saveline")).toHaveLength(6);
    // …and the proficient saves (Bard → DEX + CHA) surface their bonus.
    expect(container.querySelectorAll(".sc-save-rest.on").length).toBeGreaterThanOrEqual(
      1
    );
  });

  it("renders the skills list (engine-derived, alpha sorted)", () => {
    load();
    render(<LeftHud />);
    // A skill present for every character; proves the skills rail renders.
    expect(screen.getByText("Perception")).toBeInTheDocument();
    expect(screen.getByText("Stealth")).toBeInTheDocument();
  });

  it("surfaces Senses — passive perception + the Elf mock's darkvision", () => {
    load();
    render(<LeftHud />);
    expect(screen.getByText(/Passive Perception/i)).toBeInTheDocument();
    // Elf → darkvision 60 ft (locale-formatted).
    expect(screen.getByText(/Darkvision/i)).toBeInTheDocument();
    expect(screen.getByText(/60 ft/i)).toBeInTheDocument();
  });

  // ── B1: condition-consequence projection (auto-fail save mark) ────────────
  describe("auto-fail save mark (B1)", () => {
    it("shows no auto-fail mark when no condition gates saves", () => {
      // The mock carries Frightened (disadvantage, but NO auto-fail) — so no
      // medallion shows the crimson auto-fail chip.
      load();
      const { container } = render(<LeftHud />);
      expect(container.querySelector(".sc-autofail")).toBeNull();
      expect(container.querySelectorAll(".statcard[data-autofail]")).toHaveLength(0);
    });

    it("marks the STR + DEX medallions auto-fail under Stunned (and names the cause)", () => {
      const doc = structuredClone(MOCK_CHARACTER);
      doc.session.conditions = ["stunned"];
      load(doc);
      const { container } = render(<LeftHud />);
      // Stunned auto-fails STR + DEX saves → exactly two medallions carry the mark.
      const marked = container.querySelectorAll(".statcard[data-autofail]");
      expect(marked).toHaveLength(2);
      const chips = container.querySelectorAll(".sc-autofail");
      expect(chips).toHaveLength(2);
      expect(chips[0]?.textContent).toMatch(/auto-fail/i);
      // The chip names the gating condition for screen-reader / hover detail.
      const titles = [...marked].map((m) =>
        m.querySelector(".sc-autofail")?.getAttribute("title")
      );
      expect(titles.every((tl) => /Stunned/i.test(tl ?? ""))).toBe(true);
      expect(titles.some((tl) => /Strength/i.test(tl ?? ""))).toBe(true);
      expect(titles.some((tl) => /Dexterity/i.test(tl ?? ""))).toBe(true);
    });

    it("clears the mark when the gating condition is removed (override-first)", () => {
      const doc = structuredClone(MOCK_CHARACTER);
      doc.session.conditions = [];
      load(doc);
      const { container } = render(<LeftHud />);
      expect(container.querySelector(".sc-autofail")).toBeNull();
    });
  });

  // ── Override system (#12): skills + saves ─────────────────────────────────
  describe("override editors (#12)", () => {
    it("shows skills + saves as read-only text in play mode (no override editors)", () => {
      load();
      render(<LeftHud />);
      // No inline editor affordance, and the edit-only Saving Throws section is
      // absent in play mode (saves stay folded into the medallions).
      expect(
        screen.queryByRole("button", { name: /stealth bonus/i })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { name: /^saving throws$/i })
      ).not.toBeInTheDocument();
    });

    it("exposes per-skill + per-save override editors in edit mode", () => {
      load();
      useUIStore.setState({ sheetMode: "edit" });
      render(<LeftHud />);
      expect(screen.getByRole("button", { name: /stealth bonus/i })).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: /^saving throws$/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /dexterity saving throw bonus/i })
      ).toBeInTheDocument();
    });

    it("setting a skill bonus writes skillBonusOverrides through the seam", () => {
      load();
      useUIStore.setState({ sheetMode: "edit" });
      render(<LeftHud />);
      fireEvent.click(screen.getByRole("button", { name: /stealth bonus/i }));
      const input = screen.getByLabelText(/stealth bonus/i);
      fireEvent.change(input, { target: { value: "12" } });
      fireEvent.keyDown(input, { key: "Enter" });
      expect(
        useCharacterStore.getState().character?.character.skillBonusOverrides?.stealth
      ).toBe(12);
    });

    it("setting a save bonus writes savingThrowBonusOverrides through the seam", () => {
      load();
      useUIStore.setState({ sheetMode: "edit" });
      render(<LeftHud />);
      fireEvent.click(
        screen.getByRole("button", { name: /dexterity saving throw bonus/i })
      );
      const input = screen.getByLabelText(/dexterity saving throw bonus/i);
      fireEvent.change(input, { target: { value: "9" } });
      fireEvent.keyDown(input, { key: "Enter" });
      expect(
        useCharacterStore.getState().character?.character.savingThrowBonusOverrides?.DEX
      ).toBe(9);
    });

    it("reset-to-auto clears a set skill override (back to engine value)", () => {
      const doc = structuredClone(MOCK_CHARACTER);
      doc.character.skillBonusOverrides = { stealth: 99 };
      load(doc);
      useUIStore.setState({ sheetMode: "edit" });
      render(<LeftHud />);
      // The Stealth row now shows an override indicator + a reset control.
      const row = screen
        .getByRole("button", { name: /stealth bonus/i })
        .closest("li") as HTMLElement;
      fireEvent.click(within(row).getByRole("button", { name: /reset to auto/i }));
      expect(
        useCharacterStore.getState().character?.character.skillBonusOverrides?.stealth
      ).toBeUndefined();
    });
  });
});

// ── B8: the medallion save bonus folds the Aura against EFFECTIVE scores ──────
// A Paladin (Aura of Protection → +CHA mod, min 1, on EVERY save) wearing an
// Ioun Stone of Leadership (CHA +2). Base CHA 14 (mod +2) → effective 16
// (mod +3), so the Aura adds +3, not +2 — both above the min-1 floor, so the
// boost is visible. This pins the SURFACE wiring (LeftHud passes the EFFECTIVE
// scores it already holds into `flatSaveBonus`, not raw). Reverting LeftHud's
// `flatSaveBonus(aggregate, effectiveScores)` to a raw map makes the WIS
// medallion show +5 and this FAILS.
describe("LeftHud save bonus reads EFFECTIVE scores (B8)", () => {
  beforeEach(() => {
    useUIStore.setState({ sheetMode: "play" });
    useCharacterStore.setState({ character: null, loading: false, error: null });
  });

  function iounPaladin(): CharacterDoc {
    const doc = structuredClone(MOCK_CHARACTER);
    doc.character.classes = [
      { classId: "paladin", subclassId: "oath-of-devotion", level: 6 },
    ];
    doc.character.abilityScores = { ...doc.character.abilityScores, CHA: 14 };
    doc.character.savingThrows = ["WIS", "CHA"];
    doc.character.features = [{ srdId: "paladin-aura-of-protection" }];
    doc.character.equipment = [{ srdId: "ioun-stone", equipped: true, attuned: true }];
    doc.session.grantBundleChoices = { "ioun-stone-type": "leadership" };
    return doc;
  }

  it("the WIS medallion's folded save shows +6 (Aura at eff CHA 16 → +3), not +5 (raw +2)", () => {
    useCharacterStore.setState({
      character: iounPaladin(),
      loading: false,
      error: null,
    });
    render(<LeftHud />);
    // The WIS medallion is the <button> whose aria-label names Wisdom; its folded
    // save line = PB(3) + WIS mod(MOCK +0) + Aura(eff CHA 16 → +3) = +6.
    const wisCard = screen.getByRole("button", { name: /Wisdom .*saving throw/i });
    expect(within(wisCard).getByText("+6")).toBeInTheDocument();
  });
});
