/**
 * RestModal — short-rest heal preview reads EFFECTIVE CON (B8 surface wiring).
 *
 * The short-rest confirm screen previews the per-die heal as `1d{die} {conMod}`
 * with an average, where `conMod` is the CURRENT (effective) Constitution mod —
 * the SAME score the real heal engine (smart-tracker `combatAbilityScores`) uses,
 * so an Amulet of Health (CON → 19) lifts the preview to match what the rest
 * actually heals (RAW 2024, rule 6). The producing helper (`previewShortRestHeal`)
 * is pinned at the function level in `ability-score-set.test`; THIS pins the
 * surface — that `RestModal` feeds it the EFFECTIVE CON it resolves, not raw.
 *
 * Fail-before: reverting RestModal's `conMod` from `effectiveAbilityScores(...).CON`
 * to `charData.abilityScores.CON` makes the rendered preview read `1d8 -1 HP
 * (avg 4)` (raw CON 8) instead of `1d8 +4 HP (avg 9)` — and this FAILS.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RestModal } from "@/features/character/RestModal";
import { useCharacterStore } from "@/stores/characterStore";
import { MOCK_CHARACTER } from "@/lib/mock";

describe("RestModal — short-rest CON preview reads EFFECTIVE scores (B8)", () => {
  beforeEach(() => {
    useCharacterStore.setState({ character: null, loading: false, error: null });
  });

  it("per-die preview uses the effective CON mod (+4 at CON 19), not the raw mod (-1 at CON 8)", () => {
    const doc = structuredClone(MOCK_CHARACTER);
    // Low base CON (8 → mod -1) + an Amulet of Health (floors effective CON to 19,
    // mod +4). d8 hit die → avg 5 (rounded) + CON mod.
    doc.character.abilityScores = { ...doc.character.abilityScores, CON: 8 };
    doc.character.hitDieType = 8;
    doc.character.equipment = [
      { srdId: "amulet-of-health", equipped: true, attuned: true },
    ];
    useCharacterStore.setState({ character: doc, loading: false, error: null });

    render(<RestModal open={true} onClose={() => {}} />);
    // Idle → confirm-short: open the spend/confirm flow.
    fireEvent.click(screen.getByText("Short Rest"));

    // Effective CON 19 → mod +4: "1d8 +4 HP (avg 9)". Raw CON 8 would read
    // "1d8 -1 HP (avg 4)" (the fail-before). Assert BOTH the mod sign and the avg.
    expect(screen.getByText(/1d8 \+4 HP \(avg 9\)/)).toBeInTheDocument();
  });
});
