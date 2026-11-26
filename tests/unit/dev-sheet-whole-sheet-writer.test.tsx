/**
 * Under dev auth-bypass (the previews and the e2e suite) a level-up writes nothing to
 * Firestore, as `restoreCharacterSnapshot` never did there: the sheet's autosave keeps
 * the local replica. The open sheet still offers a whole-sheet writer that settles, or
 * a level-up there would fail with «The sheet is not open» (#1276).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/dev-bypass", () => ({ DEV_BYPASS_AUTH: true }));
vi.mock("@/lib/firebase", () => ({ db: {}, auth: {} }));

import { renderHook, waitFor } from "@testing-library/react";
import { useCharacterSubscription } from "@/hooks/useCharacterSubscription";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";

describe("an open dev sheet", () => {
  it("offers a whole-sheet writer that settles", async () => {
    useAuthStore.setState({ user: { uid: "mock-uid" } as never });
    renderHook(() => useCharacterSubscription("mock-1"));
    await waitFor(() => expect(useCharacterStore.getState().character).not.toBeNull());
    const writer = useCharacterStore.getState().wholeSheetWriter;
    expect(writer).not.toBeNull();
    const doc = useCharacterStore.getState().character;
    if (!writer || !doc) return;
    await expect(
      writer({ character: doc.character, session: doc.session }, doc)
    ).resolves.toBeUndefined();
  });
});
