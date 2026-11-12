/**
 * A floor on Hit Point Die faces in the Short Rest (a feature that counts a 1 or 2
 * as a 3): the rest asks the faces, one per die, and heals by the floored faces plus
 * CON per die.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RestModal } from "@/features/character/RestModal";
import { ItemResourceCommandProvider } from "@/features/character/center/ItemResourceCommandProvider";
import { useCharacterStore } from "@/stores/characterStore";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CustomFeature } from "@/types/character";
import { customInstanceId } from "./__helpers__/custom-items";

const recovery: CustomFeature = {
  custom: true,
  title: "Hearty Recovery",
  emoji: "*",
  source: "Homebrew",
  tags: [],
  contentBlocks: [],
  grants: [{ type: "hit-die-floor", floorBelow: 2, floorTo: 3 }],
  instanceId: customInstanceId("powerful-recovery"),
};

function seed() {
  const doc = structuredClone(MOCK_CHARACTER);
  doc.character.abilityScores.CON = 14;
  doc.character.hitDieType = 8;
  doc.character.hp.max = 30;
  doc.character.features = [...doc.character.features, recovery];
  doc.session.hp = { current: 10, temp: 0 };
  doc.session.hitDice = { used: 0 };
  useCharacterStore.setState({
    character: doc,
    loading: false,
    error: null,
    readonly: false,
  });
}

describe("Short Rest with a floor on Hit Point Die faces", () => {
  beforeEach(() => useCharacterStore.setState({ character: null }));

  it("asks the faces and heals 1+5 as 3+5, plus CON per die", () => {
    seed();
    render(
      <ItemResourceCommandProvider>
        <RestModal open onClose={() => {}} />
      </ItemResourceCommandProvider>
    );
    fireEvent.click(screen.getByText("Short Rest"));
    const more = screen.getByRole("button", { name: "Use one more Hit Die" });
    fireEvent.click(more);
    fireEvent.click(more);
    const faces = screen.getByRole("textbox", { name: "Dice faces" });
    fireEvent.change(faces, { target: { value: "1+5" } });
    expect(screen.getByText("Counted: 3 + 5 = 8")).toBeInTheDocument();
    // 10 + (8 + 2 × 2) = 22.
    expect(
      screen.getAllByRole("status").some((el) => /10 → 22 \/ 30/.test(el.textContent))
    ).toBe(true);
  });
});
