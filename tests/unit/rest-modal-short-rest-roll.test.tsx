/** Short-rest input must distinguish dice spent, physical rolls and final HP. */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RestModal } from "@/features/character/RestModal";
import { ItemResourceCommandProvider } from "@/features/character/center/ItemResourceCommandProvider";
import { useCharacterStore } from "@/stores/characterStore";
import { MOCK_CHARACTER } from "@/lib/mock";

const store = () => useCharacterStore.getState();
const addDie = () =>
  fireEvent.click(screen.getByRole("button", { name: "Use one more Hit Die" }));
const rollField = () => screen.getByRole("spinbutton", { name: "Dice total" });
const confirm = () => screen.getByRole("button", { name: "Complete rest" });
const enterRoll = (value: string) => fireEvent.change(rollField(), { target: { value } });

function openRest() {
  render(
    <ItemResourceCommandProvider>
      <RestModal open onClose={() => {}} />
    </ItemResourceCommandProvider>
  );
  fireEvent.click(screen.getByText("Short Rest"));
}

function seed(con = 14) {
  const doc = structuredClone(MOCK_CHARACTER);
  doc.character.abilityScores.CON = con;
  doc.character.hitDieType = 8;
  doc.character.hp.max = 30;
  doc.session.hp = { current: 10, temp: 0 };
  doc.session.hitDice = { used: 2 };
  useCharacterStore.setState({ character: doc, loading: false, error: null });
  return doc;
}

describe("RestModal — clear short-rest input", () => {
  beforeEach(() =>
    useCharacterStore.setState({
      character: null,
      loading: false,
      error: null,
      readonly: false,
    })
  );

  it("requires a real roll and previews the entered total plus CON, not an average", async () => {
    seed();
    openRest();
    addDie();
    expect(rollField()).toHaveValue(null);
    expect(rollField()).toHaveAccessibleDescription("Roll 1d8 · without Constitution");
    expect(confirm()).toBeDisabled();
    expect(store().character?.session.hitDice.used).toBe(2);
    enterRoll("6");
    expect(screen.getByText("Constitution (added)")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("10 → 18 / 30");
    fireEvent.click(confirm());
    await screen.findByText("Short Rest Complete");
    expect(store().character?.session.hp.current).toBe(18);
    expect(store().character?.session.hitDice.used).toBe(3);
  });

  it("clears the old roll when the dice count changes and adds CON once per die", async () => {
    seed();
    openRest();
    addDie();
    enterRoll("6");
    addDie();
    expect(rollField()).toHaveValue(null);
    expect(rollField()).toHaveAccessibleDescription("Roll 2d8 · without Constitution");
    expect(confirm()).toBeDisabled();
    enterRoll("12");
    fireEvent.click(confirm());
    await waitFor(() => expect(store().character?.session.hp.current).toBe(26));
    expect(store().character?.session.hitDice.used).toBe(4);
  });

  it.each(["0", "9", "1.5"])(
    "rejects an impossible d8 roll (%s) without changing resources",
    (value) => {
      seed();
      openRest();
      addDie();
      enterRoll(value);
      expect(rollField()).toHaveAttribute("aria-invalid", "true");
      expect(rollField()).toHaveAccessibleDescription(/Enter a whole number from 1 to 8/);
      expect(confirm()).toBeDisabled();
      expect(store().character?.session.hp.current).toBe(10);
      expect(store().character?.session.hitDice.used).toBe(2);
    }
  );

  it("previews and applies the same minimum heal with negative CON", async () => {
    seed(4);
    openRest();
    addDie();
    enterRoll("1");
    expect(screen.getByRole("status")).toHaveTextContent("10 → 11 / 30");
    fireEvent.click(confirm());
    await waitFor(() => expect(store().character?.session.hp.current).toBe(11));
  });

  it("caps the preview and committed healing at maximum HP", async () => {
    const doc = seed();
    doc.session.hp.current = 28;
    openRest();
    addDie();
    enterRoll("8");
    expect(screen.getByRole("status")).toHaveTextContent("28 → 30 / 30");
    fireEvent.click(confirm());
    await waitFor(() => expect(store().character?.session.hp.current).toBe(30));
  });

  it("cancels without spending dice or healing, and reopens with no pending input", () => {
    seed();
    openRest();
    addDie();
    enterRoll("6");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(store().character?.session.hp.current).toBe(10);
    expect(store().character?.session.hitDice.used).toBe(2);
    fireEvent.click(screen.getByText("Short Rest"));
    expect(screen.queryByRole("spinbutton", { name: "Dice total" })).toBeNull();
    addDie();
    expect(rollField()).toHaveValue(null);
  });

  it("allows a rest without healing when all Hit Dice are spent", async () => {
    const doc = seed();
    doc.character.hitDiceTotalOverride = 2;
    openRest();
    expect(screen.getByRole("button", { name: "Use one more Hit Die" })).toBeDisabled();
    expect(screen.queryByRole("spinbutton", { name: "Dice total" })).toBeNull();
    expect(
      screen.getByText("No healing · recover short-rest resources")
    ).toBeInTheDocument();
    expect(store().character?.session.trackers["bard-bardic-inspiration"]?.used).toBe(2);
    fireEvent.click(confirm());
    await screen.findByText("Short Rest Complete");
    expect(store().character?.session.hp.current).toBe(10);
    expect(store().character?.session.hitDice.used).toBe(2);
    expect(
      store().character?.session.trackers["bard-bardic-inspiration"]?.used ?? 0
    ).toBe(0);
  });
});
