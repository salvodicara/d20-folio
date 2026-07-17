/**
 * RA-02 — the Short Rest heals by a ROLL-ENTRY, not a fabricated average.
 *
 * 2024 RAW (SRD 5.2.1 "Short Rest"): for each Hit Die spent, "roll the die and
 * add your Constitution modifier". Before RA-02 the modal applied
 * `previewShortRestHeal(...).avg` — a fabricated die total, violating golden rule
 * 21. Now the confirm-short phase shows the shared Second Wind `HealRollEntry`:
 * the player rolls Nd{hitDie} externally, enters the result, and taps to heal
 * enteredRoll + N×CON (min 1/die). This pins the WIRING: the entered roll (NOT an
 * average) is what heals.
 *
 * Fail-before: the old `handleShortRestConfirm` applied the d8 AVERAGE (≈5) + CON,
 * so a 1-die spend healed ≈7 regardless of the entry — this test enters 6 and
 * asserts exactly 6 + CON, which the average path could never produce.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RestModal } from "@/features/character/RestModal";
import { useCharacterStore } from "@/stores/characterStore";
import { MOCK_CHARACTER } from "@/lib/mock";

const store = () => useCharacterStore.getState();

describe("RestModal — RA-02 short-rest roll-entry", () => {
  beforeEach(() => {
    useCharacterStore.setState({ character: null, loading: false, error: null });
  });

  function seed() {
    const doc = structuredClone(MOCK_CHARACTER);
    doc.character.abilityScores = { ...doc.character.abilityScores, CON: 14 }; // mod +2
    doc.character.hitDieType = 8;
    doc.session.hp = { current: 10, temp: 0 };
    doc.session.hitDice = { used: 2 };
    useCharacterStore.setState({ character: doc, loading: false, error: null });
    return doc;
  }

  it("heals the ENTERED roll + CON per die (never the average) and spends the dice", () => {
    seed();
    render(<RestModal open={true} onClose={() => {}} />);
    fireEvent.click(screen.getByText("Short Rest")); // idle → confirm-short

    // Spend one Hit Die → the roll-entry appears.
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    expect(screen.getByText(/Roll 1d8, then apply/)).toBeInTheDocument();

    // Enter a roll of 6 (raise from the min of 1 five times), then apply.
    const raise = screen.getByRole("button", { name: /Raise roll/i });
    for (let i = 0; i < 5; i++) fireEvent.click(raise);
    fireEvent.click(screen.getByRole("button", { name: /Heal & rest/i }));

    // Healed EXACTLY 6 (entered) + 2 (CON) = 8 → 10 → 18. The old average path
    // would have healed ≈5 + 2 = 7 → 17 no matter what was entered.
    expect(store().character?.session.hp.current).toBe(18);
    // The die was spent (used 2 → 3).
    expect(store().character?.session.hitDice.used).toBe(3);
  });

  it("floors the batch at 1 HP per die (min-1 fold) with a very negative CON", () => {
    const doc = structuredClone(MOCK_CHARACTER);
    doc.character.abilityScores = { ...doc.character.abilityScores, CON: 4 }; // mod -3
    doc.character.hitDieType = 8;
    doc.session.hp = { current: 10, temp: 0 };
    doc.session.hitDice = { used: 2 };
    useCharacterStore.setState({ character: doc, loading: false, error: null });

    render(<RestModal open={true} onClose={() => {}} />);
    fireEvent.click(screen.getByText("Short Rest"));
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    // Apply at the default roll of 1: 1 + (-3) = -2, floored to 1 (min per die).
    fireEvent.click(screen.getByRole("button", { name: /Heal & rest/i }));
    expect(store().character?.session.hp.current).toBe(11); // 10 + 1
  });

  it("keeps the roll-entry Cancel a quiet ghost, in line with the sibling steps (no tall boxy stretch)", () => {
    // Regression: the roll-entry Cancel used to stretch to the tall HealRollEntry
    // block. It stays the shared quiet `ghost` treatment, sitting after a flex-1
    // roll-entry so the action row mirrors the long-rest step's primary+cancel
    // grammar (the `align-items` fix lives in .rest-action-row).
    seed();
    render(<RestModal open={true} onClose={() => {}} />);
    fireEvent.click(screen.getByText("Short Rest"));
    fireEvent.click(screen.getByRole("button", { name: "+" }));

    const cancel = screen.getByRole("button", { name: /^Cancel$/i });
    expect(cancel.className).toMatch(/\bghost\b/);
    const row = cancel.closest(".rest-action-row");
    expect(row).not.toBeNull();
    // The roll-entry is the flex-1 "primary" slot; Cancel is its sibling.
    expect(row?.querySelector(".flex-1 .heal-roll-entry")).not.toBeNull();
  });

  it("a rest with NO dice spent resets trackers without healing (no roll-entry)", () => {
    seed();
    render(<RestModal open={true} onClose={() => {}} />);
    fireEvent.click(screen.getByText("Short Rest"));
    // No roll-entry with 0 dice selected — the plain Take Short Rest button shows.
    expect(screen.queryByText(/Roll .*, then apply/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Take Short Rest/i }));
    expect(store().character?.session.hp.current).toBe(10); // unchanged
    expect(store().character?.session.hitDice.used).toBe(2); // no dice spent
  });
});
