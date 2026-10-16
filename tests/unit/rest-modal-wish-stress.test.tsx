/**
 * Wish Stress lasts "until you finish a Long Rest" (SRD 5.2.1 Wish). The Long Rest
 * an owner takes from the rest dialog runs through the world boundary, which kept
 * the state lit: after the rest the rail still showed Wish Stress and every spell
 * still asked for 1d10 Necrotic per level. The dialog's rest now ends it.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "firebase/auth";

import i18n from "@/i18n";
import { RestModal } from "@/features/character/RestModal";
import {
  ItemResourceCommandContext,
  type ItemResourceCommandApi,
} from "@/features/character/center/useItemResourceCommands";
import type {
  ItemResourceRecoveryBoundary,
  PreparedItemResourceBoundary,
} from "@/lib/item-resource-boundaries";
import { MOCK_CHARACTER } from "@/lib/mock";
import { WISH_STRESS_STATE, isWishStressed } from "@/lib/wish-state";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import { useToastStore } from "@/stores/toastStore";

/** An owner's item-resource commands, so the rest runs through the world boundary. */
function commands(): ItemResourceCommandApi {
  const unavailable = () => null;
  const prepared = (
    kind: ItemResourceRecoveryBoundary["kind"]
  ): PreparedItemResourceBoundary => ({
    kind: "item-resource-boundary",
    trigger: { kind },
    occurrenceId: `rest-${kind}`,
    entries: [],
  });
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

beforeEach(async () => {
  const character = structuredClone(MOCK_CHARACTER);
  character.session.activeFeatures = [WISH_STRESS_STATE.activeKey];
  useCharacterStore.setState({ character, readonly: false, loading: false, error: null });
  useAuthStore.setState({ user: { uid: "owner" } as User });
  useToastStore.setState({ toasts: [], timers: {} });
  await i18n.changeLanguage("en");
});

describe("Long Rest from the rest dialog", () => {
  it("ends Wish Stress", async () => {
    const session = useCharacterStore.getState().character?.session;
    expect(session && isWishStressed(session)).toBe(true);
    render(
      <ItemResourceCommandContext.Provider value={commands()}>
        <RestModal open onClose={() => {}} />
      </ItemResourceCommandContext.Provider>
    );
    fireEvent.click(screen.getByText("Long Rest"));
    fireEvent.click(screen.getByRole("button", { name: "Complete rest" }));
    await screen.findByText("Long Rest Complete");
    const after = useCharacterStore.getState().character?.session;
    expect(after?.world).toBeDefined();
    expect(after && isWishStressed(after)).toBe(false);
  });
});
