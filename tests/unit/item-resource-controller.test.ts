/**
 * The item-resource controller without React: its input prompt is a plain channel,
 * and it fails closed (nothing paid, a conflict notice) whenever the reviewed facts
 * no longer hold. The full prepare → commit → undo → redo flows are exercised
 * through the cockpit provider in the item-resource-*.test.tsx files.
 */
import { describe, expect, it, vi } from "vitest";

import {
  createItemResourceCommands,
  createItemResourceInputPrompt,
  type ItemResourceCommandPorts,
} from "@/lib/item-resource-controller";
import type { ItemResourceCommandRecipe } from "@/lib/item-resource-commands";
import { makeCharacterDoc } from "./_helpers";

const ask = [
  { kind: "recharge-roll", resourceId: "charges", roll: "1d6+1", min: 2, max: 7 },
] as never;

describe("the input prompt", () => {
  it("opens, shows what it asks, and resolves with the player's answer", async () => {
    const prompt = createItemResourceInputPrompt();
    const seen = vi.fn();
    prompt.subscribe(seen);
    const answer = prompt.request("Wand of Magic Missiles", ask);
    expect(prompt.current()).toMatchObject({
      key: 1,
      sourceName: "Wand of Magic Missiles",
    });
    const answers = new Map([["recharge-roll", 5]]) as never;
    prompt.settle(answers);
    await expect(answer).resolves.toBe(answers);
    expect(prompt.current()).toBeNull();
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it("a second request while one is open fails closed; cancelling answers null", async () => {
    const prompt = createItemResourceInputPrompt();
    const first = prompt.request("A", ask);
    await expect(prompt.request("B", ask)).resolves.toBeNull();
    expect(prompt.current()?.sourceName).toBe("A");
    prompt.settle(null);
    await expect(first).resolves.toBeNull();
  });
});

describe("the controller fails closed", () => {
  const ports = (
    over: Partial<ItemResourceCommandPorts> = {}
  ): ItemResourceCommandPorts => ({
    character: () => makeCharacterDoc({}),
    readonly: () => false,
    applyOperation: vi.fn(),
    applyOperations: vi.fn(),
    requestInput: vi.fn(),
    notifyConflict: vi.fn(),
    itemName: (id) => id,
    ...over,
  });
  const spend = {
    kind: "spend",
    identity: { itemId: "no-such-item", instanceId: "copy-1" },
  } as unknown as ItemResourceCommandRecipe;

  it("a read-only sheet prepares nothing and says nothing", async () => {
    const p = ports({ readonly: () => true });
    await expect(createItemResourceCommands(p).prepare(spend, "x")).resolves.toBeNull();
    expect(p.notifyConflict).not.toHaveBeenCalled();
  });

  it("an item without resources is a conflict, and nothing is written", async () => {
    const p = ports();
    await expect(createItemResourceCommands(p).prepare(spend, "x")).resolves.toBeNull();
    expect(p.notifyConflict).toHaveBeenCalledOnce();
    expect(p.applyOperation).not.toHaveBeenCalled();
  });
});
