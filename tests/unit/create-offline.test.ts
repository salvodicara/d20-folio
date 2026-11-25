// @vitest-environment jsdom
/**
 * Creating a character never waits for the server (#1283), and never loses the draft.
 * Offline, the create opens the new sheet at once; the built character is kept on the
 * device until the server confirms it. A refused create says so and offers to create it
 * again from the kept draft.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  queued: [] as Array<{
    payload: unknown;
    settle: { ok: () => void; fail: (e: Error) => void };
  }>,
  nextId: 1,
}));
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/firestore", () => ({
  queueCreateCharacter: (_uid: string, payload: unknown) => {
    const settle: { ok: () => void; fail: (e: Error) => void } = {
      ok: () => undefined,
      fail: () => undefined,
    };
    const written = new Promise<void>((resolve, reject) => {
      settle.ok = resolve;
      settle.fail = reject;
    });
    h.queued.push({ payload, settle });
    return Promise.resolve({ id: `char-${h.nextId++}`, written });
  },
}));

import { createCharacterOffline, keptDrafts } from "@/features/creation/create-offline";
import { useToastStore } from "@/stores/toastStore";

const payload = { character: { name: "Bren" }, session: {} } as never;
const t = (key: string) => key;

beforeEach(() => {
  localStorage.clear();
  h.queued.length = 0;
  h.nextId = 1;
  useToastStore.setState({ toasts: [] });
});

describe("createCharacterOffline", () => {
  it("returns the new id at once while the server has not answered, and keeps the draft", async () => {
    const open = vi.fn();
    const id = await createCharacterOffline({ uid: "u1", payload, open, t });
    expect(id).toBe("char-1");
    expect(keptDrafts("u1").map((d) => d.id)).toEqual(["char-1"]);
  });

  it("forgets the draft once the server confirms", async () => {
    await createCharacterOffline({ uid: "u1", payload, open: vi.fn(), t });
    h.queued[0]?.settle.ok();
    await vi.waitFor(() => expect(keptDrafts("u1")).toEqual([]));
  });

  it("a refused create says so and offers to create it again from the kept draft", async () => {
    const open = vi.fn();
    await createCharacterOffline({ uid: "u1", payload, open, t });
    h.queued[0]?.settle.fail(new Error("denied"));
    await vi.waitFor(() => expect(useToastStore.getState().toasts).toHaveLength(1));
    const toast = useToastStore.getState().toasts[0];
    expect(toast?.message).toBe("character.notSaved");
    toast?.action?.run();
    await vi.waitFor(() => expect(open).toHaveBeenCalledWith("char-2"));
    expect(h.queued[1]?.payload).toBe(payload);
    expect(keptDrafts("u1").map((d) => d.id)).toEqual(["char-2"]);
  });
});
