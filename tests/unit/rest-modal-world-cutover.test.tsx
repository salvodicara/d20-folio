/**
 * RestModal cutover wiring: with an authenticated owner the modal's confirm
 * routes through the canonical rest boundary (`restThroughWorld`), so a Long
 * Rest persists the character's mechanics world (`session.world`) with the
 * rest action committed on it, while the summary and the legacy session facts
 * stay exactly what the legacy flow produced. Without an owner the modal
 * degrades fail-closed to the legacy rest (covered by the existing
 * rest-modal suites, which run unauthenticated).
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RestModal } from "@/features/character/RestModal";
import {
  ItemResourceCommandContext,
  type ItemResourceCommandApi,
} from "@/features/character/center/useItemResourceCommands";
import type { PreparedItemResourceBoundary } from "@/lib/item-resource-boundaries";
import type { ItemResourceRecoveryBoundary } from "@/lib/item-resource-boundaries";
import { characterTrackerSeeds, characterWorldState } from "@/lib/mechanics-world-store";
import { MOCK_CHARACTER } from "@/lib/mock";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import { useToastStore } from "@/stores/toastStore";
import type { User } from "firebase/auth";

const UID = "test-uid";

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

function commands(): ItemResourceCommandApi {
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
  };
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
  useAuthStore.setState({ user: { uid: UID } as User });
  useToastStore.setState({ toasts: [], timers: {} });
});

describe("RestModal canonical-world cutover", () => {
  it("commits the Long Rest onto the persisted mechanics world", async () => {
    render(
      <ItemResourceCommandContext.Provider value={commands()}>
        <RestModal open onClose={() => {}} />
      </ItemResourceCommandContext.Provider>
    );

    fireEvent.click(screen.getByText("Long Rest"));
    fireEvent.click(screen.getByRole("button", { name: "Take Long Rest" }));
    await screen.findByText("Long Rest Complete");

    const doc = useCharacterStore.getState().character;
    if (!doc) throw new Error("character missing");
    // The engine path ran: the world was seeded, the rest action committed on
    // it (revision advanced past zero), and the rest evidence allocated the
    // timeline's boundary ordinal.
    expect(doc.session.world).toBeDefined();
    const world = characterWorldState(
      doc,
      UID,
      doc.character.hp.max,
      {},
      characterTrackerSeeds(doc)
    );
    expect(world).not.toBeNull();
    expect(world?.revision).toBeGreaterThan(0);
    expect(world?.timeline.nextBoundaryOrdinal).toBe(2);
    expect(world?.vitals.hitPoints.current).toBe(doc.character.hp.max);
    // The legacy reads stay truthful through the mirror.
    expect(doc.session.hp.current).toBe(doc.character.hp.max);
    expect(doc.session.hitDice.used).toBe(0);
  });
});
