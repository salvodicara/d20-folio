import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RestModal } from "@/features/character/RestModal";
import {
  ItemResourceCommandContext,
  type ItemResourceCommandApi,
} from "@/features/character/center/useItemResourceCommands";
import type { PreparedItemResourceBoundary } from "@/lib/item-resource-boundaries";
import type { ItemResourceRecoveryBoundary } from "@/lib/item-resource-boundaries";
import { MOCK_CHARACTER } from "@/lib/mock";
import { useCharacterStore } from "@/stores/characterStore";
import { useToastStore } from "@/stores/toastStore";

function prepared(
  kind: ItemResourceRecoveryBoundary["kind"]
): PreparedItemResourceBoundary {
  return {
    kind: "item-resource-boundary",
    trigger: { kind },
    occurrenceId: `rest-${kind}`,
    entries: [],
  };
}

function commands(
  overrides: Partial<ItemResourceCommandApi> = {}
): ItemResourceCommandApi {
  const unavailable = () => null;
  return {
    prepare: vi.fn(() => Promise.resolve(null)),
    commit: vi.fn(unavailable),
    replay: vi.fn(unavailable),
    revert: vi.fn(() => false),
    prepareBoundary: vi.fn((trigger: ItemResourceRecoveryBoundary) =>
      Promise.resolve(prepared(trigger.kind))
    ),
    commitBoundary: vi.fn((boundary: PreparedItemResourceBoundary) => ({
      prepared: boundary,
    })),
    replayBoundary: vi.fn(unavailable),
    revertBoundary: vi.fn(() => false),
    ...overrides,
  };
}

function mount(api: ItemResourceCommandApi) {
  render(
    <ItemResourceCommandContext.Provider value={api}>
      <RestModal open onClose={() => {}} />
    </ItemResourceCommandContext.Provider>
  );
}

function openLongRest() {
  fireEvent.click(screen.getByText("Long Rest"));
  fireEvent.click(screen.getByRole("button", { name: "Take Long Rest" }));
}

beforeEach(() => {
  const character = structuredClone(MOCK_CHARACTER);
  character.session.hp = { current: 5, temp: 0 };
  useCharacterStore.setState({
    character,
    readonly: false,
    loading: false,
    error: null,
  });
  useToastStore.setState({ toasts: [], timers: {} });
});

describe("RestModal typed item-resource boundary", () => {
  it("offers no rest boundary to a dead character", () => {
    const character = useCharacterStore.getState().character;
    if (!character) throw new Error("character missing");
    useCharacterStore.setState({
      character: {
        ...character,
        session: { ...character.session, deathFail: 3 },
      },
    });
    const prepareBoundary = vi.fn(() => Promise.resolve(prepared("long-rest")));

    mount(commands({ prepareBoundary }));

    expect(
      screen.getByText("You must be alive and have at least 1 HP to rest.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Long Rest")).not.toBeInTheDocument();
    expect(prepareBoundary).not.toHaveBeenCalled();
  });

  it("preflights and commits the exact Long Rest boundary before mutating rest state", async () => {
    const boundary = prepared("long-rest");
    const prepareBoundary = vi.fn(() => Promise.resolve(boundary));
    const commitBoundary = vi.fn((value: PreparedItemResourceBoundary) => {
      expect(useCharacterStore.getState().character?.session.hp.current).toBe(5);
      return { prepared: value };
    });
    mount(commands({ prepareBoundary, commitBoundary }));

    openLongRest();

    await screen.findByText("Long Rest Complete");
    expect(prepareBoundary).toHaveBeenCalledWith({ kind: "long-rest" });
    expect(commitBoundary).toHaveBeenCalledWith(boundary);
    expect(useCharacterStore.getState().character?.session.hp.current).toBeGreaterThan(5);
  });

  it("cancelling boundary input leaves every rest field untouched", async () => {
    const prepareBoundary = vi.fn(() => Promise.resolve(null));
    mount(commands({ prepareBoundary }));

    openLongRest();

    await act(() => Promise.resolve());
    expect(screen.queryByText("Long Rest Complete")).not.toBeInTheDocument();
    expect(useCharacterStore.getState().character?.session.hp.current).toBe(5);
  });

  it("rejects a stale rest preview after state changes during boundary input", async () => {
    let resolveBoundary: ((value: PreparedItemResourceBoundary) => void) | undefined;
    const prepareBoundary = vi.fn(
      () =>
        new Promise<PreparedItemResourceBoundary>((resolve) => {
          resolveBoundary = resolve;
        })
    );
    const commitBoundary = vi.fn((value: PreparedItemResourceBoundary) => ({
      prepared: value,
    }));
    mount(commands({ prepareBoundary, commitBoundary }));
    openLongRest();

    const live = useCharacterStore.getState().character;
    if (!live) throw new Error("character missing");
    act(() => {
      useCharacterStore.getState().setCharacter({
        ...live,
        session: { ...live.session, hp: { current: 7, temp: 0 } },
      });
    });
    await act(() => {
      resolveBoundary?.(prepared("long-rest"));
      return Promise.resolve();
    });

    await waitFor(() =>
      expect(
        useToastStore
          .getState()
          .toasts.some((toast) =>
            toast.message?.includes("changed while the rest was being prepared")
          )
      ).toBe(true)
    );
    expect(commitBoundary).not.toHaveBeenCalled();
    expect(useCharacterStore.getState().character?.session.hp.current).toBe(7);
    expect(screen.queryByText("Long Rest Complete")).not.toBeInTheDocument();
  });
});
