/**
 * Undoing an older action undoes only that action (owner, 2026-11-02): in production
 * too, `dispatch`'s undo goes through the play log, so an earlier act's undo leaves
 * every later act in place. Before, production restored the whole sheet from before
 * the act, wiping what came after.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCharacterStore } from "@/stores/characterStore";
import { makeCharacterDoc } from "./_helpers";

const live = () => {
  const doc = useCharacterStore.getState().character;
  if (!doc) throw new Error("no character");
  return doc;
};

beforeEach(() => {
  vi.stubEnv("DEV", false);
  useCharacterStore.setState({
    character: makeCharacterDoc(
      { classId: "fighter", level: 5 },
      { hp: { current: 30, temp: 0 } }
    ),
    readonly: false,
    loading: false,
    error: null,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  useCharacterStore.setState({ character: null });
});

describe("undoing an older action, in production", () => {
  it("undoes only that action; the later one stays", () => {
    const undoExhaustion = useCharacterStore
      .getState()
      .dispatch({ kind: "set-exhaustion", level: 1 });
    useCharacterStore.getState().dispatch({ kind: "set-temp-hp", temp: 5 });
    expect(live().session.exhaustion).toBe(1);
    expect(live().session.hp.temp).toBe(5);

    undoExhaustion?.();
    expect(live().session.exhaustion).toBe(0);
    expect(live().session.hp.temp).toBe(5);
  });
});
