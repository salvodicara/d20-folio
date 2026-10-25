/**
 * A homebrew weapon with charges (the Mace of Terror's shape: 3 charges, 1d3 back at
 * dawn) spends and recovers them through the real store, like a catalogue wand does.
 * The store used to look the copy up among equipment rows only, so a weapon's spend
 * was rejected; it now resolves the copy with `exactItemCopy` (weapons included).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { itemResourceSpend } from "@/lib/item-resource-commands";
import { createItemResourceCommands } from "@/lib/item-resource-controller";
import { makeItemResourceIdentity } from "@/lib/resources";
import { useCharacterStore } from "@/stores/characterStore";
import type { CustomWeapon } from "@/types/character";
import { customInstanceId } from "./__helpers__/custom-items";
import { makeCharacterDoc } from "./_helpers";

const DREAD_MACE: CustomWeapon = {
  custom: true,
  name: "Dread Mace",
  quantity: 1,
  damageDie: "1d6",
  damageType: "bludgeoning",
  attackStat: "STR",
  properties: "",
  attuned: true,
  instanceId: customInstanceId("Dread Mace"),
  mechanics: {
    rarity: "rare",
    type: "weapon",
    attunement: true,
    resources: [
      {
        kind: "counter",
        id: "charges",
        unit: "charges",
        capacity: { kind: "fixed", amount: 3 },
        initial: { kind: "full" },
        recoveries: [
          {
            trigger: { kind: "dawn" },
            amount: { kind: "entered-roll", roll: { dice: 1, sides: 3 } },
          },
        ],
      },
    ],
  },
};

const id = DREAD_MACE.instanceId;
const identity = makeItemResourceIdentity(id, id, "charges");
const store = () => useCharacterStore.getState();
const commands = (answer = 2) =>
  createItemResourceCommands({
    character: () => store().character,
    readonly: () => false,
    applyOperation: (item, binding, operation) =>
      store().applyItemResourceOperation(item, binding, operation),
    applyOperations: (entries) => store().applyItemResourceOperations(entries),
    requestInput: (_name, requests) =>
      Promise.resolve(new Map(requests.map((r) => [r.kind, answer]))),
    notifyConflict: () => {
      throw new Error("conflict");
    },
    itemName: () => "Dread Mace",
  });
const current = () =>
  store().character?.session.itemResources?.[id]?.resources.charges?.current;

beforeEach(() => {
  useCharacterStore.setState({
    character: makeCharacterDoc({ classId: "fighter", level: 5, weapons: [DREAD_MACE] }),
    readonly: false,
    loading: false,
    error: null,
    parentPersistenceFlush: null,
  });
});

describe("a homebrew weapon's charges through the store", () => {
  it("spends one", async () => {
    const api = commands();
    const prepared = await api.prepare(itemResourceSpend(identity, 1), "Dread Mace");
    if (!prepared) throw new Error("not prepared");
    expect(api.commit(prepared)).not.toBeNull();
    expect(current()).toBe(2);
  });

  it("recovers at dawn through the same batch", async () => {
    const api = commands();
    const spent = await api.prepare(itemResourceSpend(identity, 3), "Dread Mace");
    if (!spent) throw new Error("not prepared");
    api.commit(spent);
    const dawn = await commands(2).prepareBoundary({ kind: "dawn" });
    if (!dawn) throw new Error("no dawn boundary");
    expect(api.commitBoundary(dawn)).not.toBeNull();
    expect(current()).toBe(2);
  });
});
