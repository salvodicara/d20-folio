/**
 * Wizard Spell Mastery (L18) + Signature Spells (L20) re-pickers, out of level-up (U4).
 *
 * An eligible wizard can re-pick both on the Spells tab in edit mode; the picks set
 * `wizardSpellMastery` / `wizardSignatureSpell` flags on the spellbook refs (asserted
 * via the characterStore). Hidden in play mode, for non-wizards, and below level.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WizardSpellChoices } from "@/features/character/center/tabs/WizardSpellChoices";
import { useCharacterStore } from "@/stores/characterStore";
import { useUIStore } from "@/stores/uiStore";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CharacterDoc } from "@/types/character";

function wizard(level: number): CharacterDoc {
  const base = structuredClone(MOCK_CHARACTER);
  return {
    ...base,
    character: {
      ...base.character,
      classes: [{ classId: "wizard", level: level }],
      // A spellbook with an L1, L2 and two L3 SRD spells to pick from.
      spells: [
        { srdId: "magic-missile" },
        { srdId: "misty-step" },
        { srdId: "fireball" },
        { srdId: "counterspell" },
      ],
    },
  };
}

function load(doc: CharacterDoc | null, mode: "play" | "edit" = "edit"): void {
  useUIStore.setState({ sheetMode: mode });
  useCharacterStore.setState({ character: doc, loading: false, error: null });
}

beforeEach(() => {
  useUIStore.setState({ sheetMode: "play" });
  useCharacterStore.setState({ character: null, loading: false, error: null });
});

describe("WizardSpellChoices (U4)", () => {
  it("shows both Spell Mastery and Signature Spells for a Wizard 20 in edit mode", () => {
    load(wizard(20), "edit");
    render(<WizardSpellChoices />);
    expect(screen.getByText(/spell mastery/i)).toBeInTheDocument();
    expect(screen.getByText(/signature spells/i)).toBeInTheDocument();
  });

  it("shows ONLY Spell Mastery at level 18 (signature is L20)", () => {
    load(wizard(18), "edit");
    render(<WizardSpellChoices />);
    expect(screen.getByText(/spell mastery/i)).toBeInTheDocument();
    expect(screen.queryByText(/signature spells/i)).not.toBeInTheDocument();
  });

  it("is hidden in play mode and for non-wizards", () => {
    load(wizard(20), "play");
    const { rerender } = render(<WizardSpellChoices />);
    expect(screen.queryByText(/spell mastery/i)).not.toBeInTheDocument();
    // Non-wizard (the Bard mock) in edit mode → also hidden.
    load(structuredClone(MOCK_CHARACTER), "edit");
    rerender(<WizardSpellChoices />);
    expect(screen.queryByText(/spell mastery/i)).not.toBeInTheDocument();
  });

  it("picking a 1st-level spell flags it as wizardSpellMastery in the spellbook", () => {
    load(wizard(20), "edit");
    render(<WizardSpellChoices />);
    // The L1 picker contains Magic Missile; selecting it sets the flag.
    fireEvent.click(screen.getByRole("button", { name: /magic missile/i }));
    const spells = useCharacterStore.getState().character?.character.spells ?? [];
    const mm = spells.find((s) => "srdId" in s && s.srdId === "magic-missile");
    expect(mm && "wizardSpellMastery" in mm && mm.wizardSpellMastery).toBe(true);
  });

  it("picking two 3rd-level spells flags them as signature + always-prepared", () => {
    load(wizard(20), "edit");
    render(<WizardSpellChoices />);
    fireEvent.click(screen.getByRole("button", { name: /^fireball/i }));
    fireEvent.click(screen.getByRole("button", { name: /counterspell/i }));
    const spells = useCharacterStore.getState().character?.character.spells ?? [];
    const fb = spells.find((s) => "srdId" in s && s.srdId === "fireball");
    const cs = spells.find((s) => "srdId" in s && s.srdId === "counterspell");
    expect(fb && "wizardSignatureSpell" in fb && fb.wizardSignatureSpell).toBe(true);
    expect(fb && "alwaysPrepared" in fb && fb.alwaysPrepared).toBe(true);
    expect(cs && "wizardSignatureSpell" in cs && cs.wizardSignatureSpell).toBe(true);
  });
});
