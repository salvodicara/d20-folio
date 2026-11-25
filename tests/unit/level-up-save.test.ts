/**
 * A level-up never waits for the server (#1276). Offline, a Firestore write promise
 * settles only when the server answers; the wizard must finish at once anyway, with the
 * PRE-level snapshot queued before the level is applied, and the whole-sheet write sent
 * through the sheet's ordered queue after the play writer's own write.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeCharacterDoc } from "@tests/unit/_helpers";
import type { CharacterDoc } from "@/types/character";

const h = vi.hoisted(() => ({
  events: [] as string[],
  snapshotOf: null as null | { character: unknown },
}));

vi.mock("@/lib/firebase", () => ({ db: {}, auth: {} }));
vi.mock("@/lib/firestore", () => ({
  queueCharacterSnapshot: (
    _uid: string,
    _id: string,
    _modules: unknown,
    data: { character: unknown }
  ) => {
    h.events.push("snapshot");
    h.snapshotOf = data;
    return { id: "snap", written: new Promise<void>(() => undefined) };
  },
}));

import { applyLevelUp, revertRefusedLevelUp } from "@/features/leveling/level-up-save";
import { useCharacterStore } from "@/stores/characterStore";

const never = (): Promise<void> => new Promise<void>(() => undefined);

let before: CharacterDoc;
let after: CharacterDoc;

beforeEach(() => {
  h.events.length = 0;
  h.snapshotOf = null;
  before = { ...makeCharacterDoc(), id: "c1" };
  after = {
    ...before,
    character: { ...before.character, hp: { ...before.character.hp, max: 99 } },
  };
  useCharacterStore.getState().setCharacter(before);
});

describe("applyLevelUp", () => {
  it("offline (the server never answers), the level is applied at once", async () => {
    const writer = vi.fn(() => {
      h.events.push("whole-sheet");
      return never();
    });
    useCharacterStore.getState().setWholeSheetWriter(writer);

    const queued = await applyLevelUp({ uid: "u1", before, after });

    expect(useCharacterStore.getState().character?.character).toBe(after.character);
    expect(queued.written).toBeInstanceOf(Promise);
    await Promise.resolve();
    expect(writer).toHaveBeenCalledTimes(1);
  });

  it("queues the PRE-level snapshot before it applies the level, then the whole sheet", async () => {
    useCharacterStore.getState().setWholeSheetWriter(() => {
      h.events.push(
        useCharacterStore.getState().character?.character === after.character
          ? "whole-sheet after apply"
          : "whole-sheet BEFORE apply"
      );
      return never();
    });
    await applyLevelUp({ uid: "u1", before, after });
    await Promise.resolve();
    expect(h.snapshotOf?.character).toBe(before.character);
    expect(h.events).toEqual(["snapshot", "whole-sheet after apply"]);
  });

  it("with no open sheet nothing is applied", async () => {
    useCharacterStore.getState().setWholeSheetWriter(null);
    await expect(applyLevelUp({ uid: "u1", before, after })).rejects.toThrow();
    expect(useCharacterStore.getState().character?.character).toBe(before.character);
    expect(h.events).toEqual([]);
  });

  it("a refusal surfaces through `written`", async () => {
    useCharacterStore
      .getState()
      .setWholeSheetWriter(() => Promise.reject(new Error("denied")));
    const queued = await applyLevelUp({ uid: "u1", before, after });
    await expect(queued.written).rejects.toThrow("denied");
  });
});

describe("revertRefusedLevelUp", () => {
  it("puts the old sheet back while the sheet still shows the level-up", () => {
    useCharacterStore.getState().setCharacter(after);
    expect(revertRefusedLevelUp(before, after)).toBe(true);
    expect(useCharacterStore.getState().character?.character).toBe(before.character);
  });

  it("leaves a sheet edited since alone", () => {
    const edited = { ...after, character: { ...after.character, quote: "since" } };
    useCharacterStore.getState().setCharacter(edited);
    expect(revertRefusedLevelUp(before, after)).toBe(false);
    expect(useCharacterStore.getState().character?.character).toBe(edited.character);
  });
});
