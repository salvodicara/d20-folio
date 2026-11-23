/**
 * The inventory's shared write moves (#1230): the classic Inventory tab and the new
 * Play screen's item and coin panes both write through them. Cases come from the moves
 * themselves: one body armor at a time with AC recomputed, a quantity never below 1,
 * a removed item and its resource state back on undo, coins never below 0 and undo
 * giving back exactly what moved.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/firebase", () => ({}));
import i18n from "@/i18n";
import {
  adjustCoins,
  deleteItem,
  setItemQuantity,
  toggleEquipped,
} from "@/features/character/inventory-commands";
import { getEquipment } from "@/data/equipment";
import { computeAC } from "@/lib/compute";
import { MOCK_CHARACTER } from "@/lib/mock";
import { useCharacterStore } from "@/stores/characterStore";
import { useUndoStore } from "@/stores/undoStore";
import type { CharacterDoc } from "@/types/character";

const t = i18n.t.bind(i18n);
const live = () => useCharacterStore.getState().character as CharacterDoc;

function load(edit: (doc: CharacterDoc) => void): void {
  const doc = structuredClone(MOCK_CHARACTER);
  doc.character.weapons = [];
  doc.character.equipment = [];
  doc.character.abilityScores = { ...doc.character.abilityScores, dex: 14 };
  doc.session.currency = { pp: 0, gp: 10, ep: 0, sp: 3, cp: 0 };
  edit(doc);
  useCharacterStore.setState({ character: doc, loading: false, error: null });
}

describe("equip", () => {
  beforeEach(() => useUndoStore.getState().clear());

  it("putting armor on takes the worn armor off, and AC follows the new one", () => {
    load((doc) => {
      doc.character.equipment = [
        { srdId: "leather-armor", instanceId: "a", quantity: 1, equipped: true },
        { srdId: "chain-shirt", instanceId: "b", quantity: 1 },
      ];
    });
    toggleEquipped(1, t, { name: "Chain Shirt" });
    const [leather, shirt] = live().character.equipment;
    expect(leather?.equipped).toBeFalsy();
    expect(shirt?.equipped).toBe(true);
    // Chain Shirt: 13 + Dex (max 2) = 15
    expect(live().character.ac).toBe(15);
  });

  it("a second tap takes it off again", () => {
    load((doc) => {
      doc.character.equipment = [{ srdId: "chain-shirt", instanceId: "b", quantity: 1 }];
    });
    const c = live().character;
    const unarmored = computeAC([], c.abilityScores, getEquipment, c.features);
    toggleEquipped(0, t);
    expect(live().character.ac).not.toBe(unarmored);
    toggleEquipped(0, t);
    expect(live().character.equipment[0]?.equipped).toBeFalsy();
    expect(live().character.ac).toBe(unarmored);
  });
});

describe("quantity", () => {
  it("sets the count and never goes below 1", () => {
    load((doc) => {
      doc.character.equipment = [{ srdId: "torch", instanceId: "t", quantity: 5 }];
    });
    setItemQuantity("equipment", 0, 8);
    expect(live().character.equipment[0]?.quantity).toBe(8);
    setItemQuantity("equipment", 0, 0);
    expect(live().character.equipment[0]?.quantity).toBe(1);
  });
});

describe("remove", () => {
  it("removes the row, and undo puts it back with its resource state", () => {
    load((doc) => {
      doc.character.equipment = [
        { srdId: "torch", instanceId: "t", quantity: 1 },
        { srdId: "wand-of-web", instanceId: "w", quantity: 1 },
      ];
      doc.session.itemResources = { w: { charges: 3 } } as never;
    });
    deleteItem("equipment", 1, "Wand of Web", t);
    expect(live().character.equipment.map((r) => r.instanceId)).toEqual(["t"]);
    expect(useUndoStore.getState().undo()).toBe(true);
    expect(live().character.equipment.map((r) => r.instanceId)).toEqual(["t", "w"]);
    expect(live().session.itemResources?.w).toEqual({ charges: 3 });
  });
});

describe("coins", () => {
  it("adds and takes in one move, never below 0, and undo gives back what moved", () => {
    load(() => undefined);
    expect(adjustCoins({ gp: 5, sp: -10 }, "coins")).toBe(true);
    expect(live().session.currency).toMatchObject({ gp: 15, sp: 0 });
    expect(useUndoStore.getState().undo()).toBe(true);
    // the take was clamped at the 3 sp there were: undo returns 3, not 10
    expect(live().session.currency).toMatchObject({ gp: 10, sp: 3 });
  });

  it("an empty move does nothing", () => {
    load(() => undefined);
    expect(adjustCoins({}, "coins")).toBe(false);
    expect(adjustCoins({ gp: 0 }, "coins")).toBe(false);
  });
});
