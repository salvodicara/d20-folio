/**
 * The classic Short Rest heals as the rules say for the items that change Hit Point
 * Dice healing, through the same engine function as the new Play screen
 * (`shortRestHeal`). Bug live in v0.26.0: the classic window summed the dice itself
 * and ignored the Periapt of Wound Closure ("Hit Point Dice ... restore twice the
 * number of Hit Points"), so the preview and the heal were half.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RestModal } from "@/features/character/RestModal";
import { ItemResourceCommandProvider } from "@/features/character/center/ItemResourceCommandProvider";
import { useCharacterStore } from "@/stores/characterStore";
import { MOCK_CHARACTER } from "@/lib/mock";

const store = () => useCharacterStore.getState();

function seedWithPeriapt() {
  const doc = structuredClone(MOCK_CHARACTER);
  doc.character.abilityScores.CON = 14; // +2
  doc.character.hitDieType = 8;
  doc.character.hp.max = 40;
  doc.character.equipment = [
    {
      srdId: "periapt-of-wound-closure",
      instanceId: "periapt-1",
      equipped: true,
      attuned: true,
    },
  ];
  doc.session.hp = { current: 10, temp: 0 };
  doc.session.hitDice = { used: 2 };
  useCharacterStore.setState({ character: doc, loading: false, error: null });
}

describe("classic Short Rest with the Periapt of Wound Closure", () => {
  beforeEach(() =>
    useCharacterStore.setState({
      character: null,
      loading: false,
      error: null,
      readonly: false,
    })
  );

  it("previews and heals twice the Hit Point Dice healing", async () => {
    seedWithPeriapt();
    render(
      <ItemResourceCommandProvider>
        <RestModal open onClose={() => {}} />
      </ItemResourceCommandProvider>
    );
    fireEvent.click(screen.getByText("Short Rest"));
    fireEvent.click(screen.getByRole("button", { name: "Use one more Hit Die" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Dice total" }), {
      target: { value: "6" },
    });
    // (6 + 2) × 2 = 16: 10 → 26.
    expect(screen.getByRole("status")).toHaveTextContent("10 → 26 / 40");
    fireEvent.click(screen.getByRole("button", { name: "Complete rest" }));
    await screen.findByText("Short Rest Complete");
    expect(store().character?.session.hp.current).toBe(26);
  });
});
