import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CharacterDoc } from "@/types/character";
import type { CombatState } from "@/types/combat-state";
import { makeCharacterDoc } from "@tests/unit/_helpers";
import { sessionToCombatState } from "@/lib/combat-state";

const { parentSubscribe, combatSubscribe } = vi.hoisted(() => ({
  parentSubscribe: vi.fn<
    (
      uid: string,
      charId: string,
      callback: (doc: CharacterDoc | null) => void,
      onError?: (error: Error) => void
    ) => () => void
  >(() => () => {}),
  combatSubscribe: vi.fn<
    (
      uid: string,
      charId: string,
      callback: (state: CombatState | null) => void,
      onError?: (error: Error) => void
    ) => () => void
  >(() => () => {}),
}));

vi.mock("@/lib/dev-bypass", () => ({ DEV_BYPASS_AUTH: false }));
vi.mock("@/lib/firestore", () => ({ subscribeToCharacter: parentSubscribe }));
vi.mock("@/lib/combat-state-io", () => ({
  subscribeCombatState: combatSubscribe,
  writeCombatState: vi.fn(),
}));
vi.mock("@/features/campaigns/useMemberCharacterDocs", () => ({
  resolveDevDoc: vi.fn(),
}));
vi.mock("@/lib/log-persistence", () => ({
  saveLogToIDB: vi.fn(() => Promise.resolve()),
  clearLogFromIDB: vi.fn(() => Promise.resolve()),
}));

import { useMemberCharacterSubscription } from "@/features/campaigns/useMemberCharacterSubscription";
import { useCharacterStore } from "@/stores/characterStore";

function markedDoc(): CharacterDoc {
  return { ...makeCharacterDoc(), id: "c2", playStateVersion: 1 };
}

function child(): CombatState {
  return sessionToCombatState(markedDoc().session);
}

function parentCb(): (doc: CharacterDoc | null) => void {
  const callback = parentSubscribe.mock.calls.at(-1)?.[2];
  if (!callback) throw new Error("parent callback missing");
  return callback;
}

function combatCb(): (state: CombatState | null) => void {
  const callback = combatSubscribe.mock.calls.at(-1)?.[2];
  if (!callback) throw new Error("combat callback missing");
  return callback;
}

function parentErrorCb(): (error: Error) => void {
  const callback = parentSubscribe.mock.calls.at(-1)?.[3];
  if (!callback) throw new Error("parent error callback missing");
  return callback;
}

function combatErrorCb(): (error: Error) => void {
  const callback = combatSubscribe.mock.calls.at(-1)?.[3];
  if (!callback) throw new Error("combat error callback missing");
  return callback;
}

function publishValidPair(): void {
  act(() => combatCb()(child()));
  act(() => parentCb()(markedDoc()));
  expect(useCharacterStore.getState().character?.id).toBe("c2");
}

beforeEach(() => {
  parentSubscribe.mockClear();
  combatSubscribe.mockClear();
  useCharacterStore.setState({
    character: null,
    loading: false,
    error: null,
    readonly: false,
  });
});

describe("useMemberCharacterSubscription — v1 ownership gate", () => {
  it("waits for the child when the marked parent arrives first", () => {
    renderHook(() => useMemberCharacterSubscription("u2", "c2"));
    act(() => parentCb()(markedDoc()));
    expect(useCharacterStore.getState().character).toBeNull();

    act(() => combatCb()(child()));
    expect(useCharacterStore.getState().character?.id).toBe("c2");
    expect(useCharacterStore.getState().readonly).toBe(true);
    expect(useCharacterStore.getState().loading).toBe(false);
  });

  it("waits for the parent when the child arrives first", () => {
    renderHook(() => useMemberCharacterSubscription("u2", "c2"));
    act(() => combatCb()(child()));
    expect(useCharacterStore.getState().character).toBeNull();

    act(() => parentCb()(markedDoc()));
    expect(useCharacterStore.getState().character?.id).toBe("c2");
    expect(useCharacterStore.getState().readonly).toBe(true);
  });

  it("fails closed when a marked member child is absent", () => {
    renderHook(() => useMemberCharacterSubscription("u2", "c2"));
    act(() => parentCb()(markedDoc()));
    act(() => combatCb()(null));

    expect(useCharacterStore.getState().character).toBeNull();
    expect(useCharacterStore.getState().error).toContain("missing-v1-combat-state");
    expect(useCharacterStore.getState().loading).toBe(false);
  });

  it("clears a previously loaded marked member when its child disappears", () => {
    renderHook(() => useMemberCharacterSubscription("u2", "c2"));
    publishValidPair();

    act(() => combatCb()(null));

    expect(useCharacterStore.getState()).toMatchObject({
      character: null,
      readonly: true,
      loading: false,
    });
    expect(useCharacterStore.getState().error).toContain("missing-v1-combat-state");
  });

  it("clears a previously loaded marked member when its child becomes malformed", () => {
    renderHook(() => useMemberCharacterSubscription("u2", "c2"));
    publishValidPair();

    act(() => combatErrorCb()(new Error("Invalid combat state: invalid-combat-state")));

    expect(useCharacterStore.getState()).toMatchObject({
      character: null,
      readonly: true,
      loading: false,
      error: "Invalid combat state: invalid-combat-state",
    });
  });

  it("clears a previously loaded marked member when its parent parser fails", () => {
    renderHook(() => useMemberCharacterSubscription("u2", "c2"));
    publishValidPair();

    act(() => parentErrorCb()(new Error("invalid parent envelope")));

    expect(useCharacterStore.getState()).toMatchObject({
      character: null,
      readonly: true,
      loading: false,
      error: "invalid parent envelope",
    });
  });
});
