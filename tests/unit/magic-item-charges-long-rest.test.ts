/**
 * Regression: magic items with `charges` recover to max on a Long Rest.
 *
 * Wands, staves, scrolls and other charged items typically restore "at
 * dawn" (RAW 2024 wand wording — Wand of Magic Missiles: "regains 1d6+1
 * expended charges daily at dawn"). For the player the practical trigger
 * is the Long Rest action. Previously the longRest store action restored
 * HP, spell slots, trackers and hit dice but left equipment charges
 * untouched — a 1-charge wand stayed at 0 forever.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { useCharacterStore } from "@/stores/characterStore";
import { makeCharacterDoc } from "./_helpers";

describe("longRest — magic-item charges recovery", () => {
  beforeEach(() => {
    useCharacterStore.setState({ character: null });
  });

  it("restores charges on items with recovery === 'long-rest'", () => {
    const char = makeCharacterDoc();
    char.character.equipment = [
      ...char.character.equipment,
      {
        custom: true,
        name: "Wand of Magic Missiles",
        notes: "",
        quantity: 1,
        equipped: false,
        charges: { current: 0, max: 7, recovery: "long-rest" },
      },
    ];
    useCharacterStore.getState().setCharacter(char);
    useCharacterStore.getState().longRest();
    const after = useCharacterStore.getState().character;
    const wand = after?.character.equipment.find(
      (e) => "custom" in e && e.name === "Wand of Magic Missiles"
    );
    expect(wand && "charges" in wand && wand.charges?.current).toBe(7);
  });

  it("does not bump charges that are already at max (idempotent)", () => {
    const char = makeCharacterDoc();
    char.character.equipment = [
      ...char.character.equipment,
      {
        custom: true,
        name: "Staff of Power",
        notes: "",
        quantity: 1,
        equipped: false,
        charges: { current: 5, max: 5, recovery: "long-rest" },
      },
    ];
    useCharacterStore.getState().setCharacter(char);
    useCharacterStore.getState().longRest();
    const after = useCharacterStore.getState().character;
    const staff = after?.character.equipment.find(
      (e) => "custom" in e && e.name === "Staff of Power"
    );
    expect(staff && "charges" in staff && staff.charges?.current).toBe(5);
  });

  it("leaves charges with unrecognized recovery untouched", () => {
    const char = makeCharacterDoc();
    char.character.equipment = [
      ...char.character.equipment,
      {
        custom: true,
        name: "Daily Cooldown Trinket",
        notes: "",
        quantity: 1,
        equipped: false,
        // Anything other than the documented "long-rest" recovery is left
        // alone — those items are restored by their own (TBD) trigger.
        charges: {
          current: 0,
          max: 3,
          recovery: "manual" as unknown as "long-rest",
        },
      },
    ];
    useCharacterStore.getState().setCharacter(char);
    useCharacterStore.getState().longRest();
    const after = useCharacterStore.getState().character;
    const trinket = after?.character.equipment.find(
      (e) => "custom" in e && e.name === "Daily Cooldown Trinket"
    );
    expect(trinket && "charges" in trinket && trinket.charges?.current).toBe(0);
  });

  it("leaves items without a charges block untouched", () => {
    const char = makeCharacterDoc();
    const before = char.character.equipment.length;
    useCharacterStore.getState().setCharacter(char);
    useCharacterStore.getState().longRest();
    const after = useCharacterStore.getState().character;
    expect(after?.character.equipment).toHaveLength(before);
  });
});
