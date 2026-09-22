/** The physical-roll preview uses effective CON, including equipped items. */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RestModal } from "@/features/character/RestModal";
import { ItemResourceCommandProvider } from "@/features/character/center/ItemResourceCommandProvider";
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

    render(
      <ItemResourceCommandProvider>
        <RestModal open={true} onClose={() => {}} />
      </ItemResourceCommandProvider>
    );
    // Idle → confirm-short: open the spend/confirm flow.
    fireEvent.click(screen.getByText("Short Rest"));

    fireEvent.click(screen.getByRole("button", { name: "Use one more Hit Die" }));
    expect(screen.getByText("+4")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Dice total" }), {
      target: { value: "6" },
    });
    // The preview adds the effective +4 to the physical 6, never the raw -1.
    expect(screen.getByRole("status")).toHaveTextContent(
      `${doc.session.hp.current} → ${doc.session.hp.current + 10}`
    );
  });
});
