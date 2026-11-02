/**
 * The chest's writes, undos and pickup collection over an in-memory stand-in for
 * Firestore (the rules side runs in tests/rules/chest.emulator).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, Record<string, unknown>>();

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => {
  const writer = () => ({
    set: (ref: { path: string }, data: Record<string, unknown>) => {
      store.set(ref.path, structuredClone(data));
    },
    update: (ref: { path: string }, fields: Record<string, unknown>) => {
      store.set(ref.path, { ...store.get(ref.path), ...fields });
    },
    delete: (ref: { path: string }) => {
      store.delete(ref.path);
    },
  });
  return {
    doc: (_db: unknown, ...path: string[]) => ({ path: path.join("/") }),
    collection: (_db: unknown, ...path: string[]) => ({ path: path.join("/") }),
    serverTimestamp: () => "now",
    increment: (n: number) => ({ increment: n }),
    arrayUnion: (...items: unknown[]) => ({ union: items }),
    arrayRemove: (...items: unknown[]) => ({ remove: items }),
    onSnapshot: vi.fn(),
    query: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    writeBatch: () => ({ ...writer(), commit: () => Promise.resolve() }),
    runTransaction: async (_db: unknown, run: (txn: unknown) => Promise<unknown>) =>
      run({
        ...writer(),
        get: (ref: { path: string }) => {
          const data = store.get(ref.path);
          return Promise.resolve({
            exists: () => data !== undefined,
            data: () => (data ? structuredClone(data) : undefined),
          });
        },
      }),
  };
});

import { collectPickups, putInChest, takeFromChest } from "@/features/campaigns/chest-io";
import type { ChestItem, Pickup } from "@/types/campaign";

const under = (prefix: string) =>
  [...store]
    .filter(([key]) => key.startsWith(`campaigns/camp/${prefix}/`))
    .map(([, v]) => v);
const potion = { srdId: "potion-of-healing" };

beforeEach(() => store.clear());

describe("the chest", () => {
  it("an item put in comes back out with the undo", async () => {
    const undo = await putInChest("camp", { uid: "brann", item: potion, quantity: 2 });
    expect(under("chest")).toMatchObject([{ item: potion, quantity: 2 }]);
    expect(under("chestLog")).toHaveLength(1);
    expect(await undo?.()).toBe(true);
    expect(under("chest")).toEqual([]);
    expect(under("chestLog")).toEqual([]);
  });

  it("a take leaves the rest and waits for the taker; its undo puts it back", async () => {
    await putInChest("camp", { uid: "brann", item: potion, quantity: 3 });
    const stack = under("chest")[0] as unknown as ChestItem;
    const undo = await takeFromChest("camp", {
      uid: "kaela",
      chestItemId: stack.id,
      quantity: 1,
    });
    expect(under("chest")).toMatchObject([{ quantity: 2 }]);
    expect(under("pickups")).toMatchObject([{ ownerUid: "kaela", quantity: 1 }]);
    expect(await undo?.()).toBe(true);
    expect(under("chest")).toMatchObject([{ quantity: 3 }]);
    expect(under("pickups")).toEqual([]);
  });

  it("once the taker's sheet collected it, the take stays", async () => {
    await putInChest("camp", { uid: "brann", item: potion, quantity: 1 });
    const stack = under("chest")[0] as unknown as ChestItem;
    const undo = await takeFromChest("camp", {
      uid: "kaela",
      chestItemId: stack.id,
      quantity: 1,
    });
    const delivered: Pickup[] = [];
    const waiting = under("pickups") as unknown as Pickup[];
    expect(await collectPickups("camp", "kaela", waiting, (p) => delivered.push(p))).toBe(
      1
    );
    expect(delivered).toMatchObject([{ item: potion, quantity: 1 }]);
    expect(await undo?.()).toBe(false);
    expect(under("chest")).toEqual([]);
  });

  it("a pickup is collected once, by its owner only", async () => {
    await putInChest("camp", { uid: "brann", item: potion, quantity: 1 });
    const stack = under("chest")[0] as unknown as ChestItem;
    await takeFromChest("camp", { uid: "kaela", chestItemId: stack.id, quantity: 1 });
    const waiting = under("pickups") as unknown as Pickup[];
    expect(await collectPickups("camp", "brann", waiting, () => {})).toBe(0);
    expect(await collectPickups("camp", "kaela", waiting, () => {})).toBe(1);
    expect(await collectPickups("camp", "kaela", waiting, () => {})).toBe(0);
  });

  it("a stack someone emptied meanwhile cannot be taken from", async () => {
    expect(
      await takeFromChest("camp", { uid: "kaela", chestItemId: "gone", quantity: 1 })
    ).toBeNull();
  });
});
