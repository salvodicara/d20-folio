/**
 * useRosterActions — the data layer behind a roster card's overflow menu
 * (Phase 6). These tests prove the ORCHESTRATION the card delegates to: the
 * clone payload, the dev-bypass guard for clone, confirm-gated delete, the
 * retire/restore status writes, and the JSON export. The shipped io
 * (createCharacter / updateCharacter / deleteCharacter / downloadCharacterJSON)
 * and the confirm/toast/auth stores are mocked so the hook is tested in
 * isolation and never touches Firestore.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { CharacterDoc } from "@/types/character";
import { MOCK_CHARACTER } from "@/lib/mock";

const {
  createMock,
  updateMock,
  deleteMock,
  getFullMock,
  downloadMock,
  confirmMock,
  showToastMock,
  bypassState,
} = vi.hoisted(() => ({
  createMock: vi.fn<(uid: string, data: Partial<CharacterDoc>) => Promise<string>>(),
  updateMock:
    vi.fn<(uid: string, id: string, data: Partial<CharacterDoc>) => Promise<void>>(),
  deleteMock: vi.fn<(uid: string, id: string) => Promise<void>>(),
  // Export + Clone re-read the FULL character (the roster list is a projection, #106).
  getFullMock: vi.fn<(uid: string, id: string) => Promise<CharacterDoc | null>>(),
  downloadMock: vi.fn<(doc: CharacterDoc) => Promise<{ portraitDropped: boolean }>>(),
  confirmMock: vi.fn<() => Promise<boolean>>(),
  showToastMock: vi.fn(),
  // Mutable holder so a single test can flip the dev-bypass flag; the hook
  // reads DEV_BYPASS_AUTH at call time via this getter (ESM live binding).
  bypassState: { on: false },
}));

// The hook reaches Firestore transitively (use-roster-actions → firestore →
// firebase); the pure-modules guard requires a firebase-path mock to exempt it.
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/firestore", () => ({
  createCharacter: createMock,
  updateCharacter: updateMock,
  getFullCharacter: getFullMock,
}));
// Delete goes through the feature-layer orchestrator (detach-from-campaigns THEN
// cascade-delete) — the engine `deleteCharacter` is no longer called directly, so
// the hook depends on this, not on `@/lib/firestore.deleteCharacter`.
vi.mock("@/features/roster/delete-character", () => ({
  deleteCharacterAndDetach: deleteMock,
}));
vi.mock("@/lib/character-io", () => ({ downloadCharacterJSON: downloadMock }));
vi.mock("@/lib/dev-bypass", () => ({
  get DEV_BYPASS_AUTH() {
    return bypassState.on;
  },
}));
vi.mock("@/stores/confirmStore", () => ({
  useConfirmStore: { getState: () => ({ confirm: confirmMock }) },
}));
vi.mock("@/stores/toastStore", () => ({
  useToastStore: { getState: () => ({ showToast: showToastMock }) },
}));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (selector: (s: { user: { uid: string } | null }) => unknown) =>
    selector({ user: { uid: "u1" } }),
}));

import { useRosterActions, useLoadExample } from "@/features/roster/use-roster-actions";
import { rosterProjectionFromDoc } from "@/lib/character-cache";

/** The roster card receives the SRD-free PROJECTION (Layer 2). Export/clone re-read
 *  the full doc via the mocked `getFullCharacter` (seeded to {@link fullDoc}). */
function makeDoc(
  overrides: { id?: string; status?: CharacterDoc["status"] } = {}
): ReturnType<typeof rosterProjectionFromDoc> {
  return rosterProjectionFromDoc({
    ...MOCK_CHARACTER,
    id: overrides.id ?? "src-1",
    ...(overrides.status ? { status: overrides.status } : {}),
  });
}

/** The FULL doc the mocked `getFullCharacter` returns for export/clone. */
const fullDoc: CharacterDoc = { ...MOCK_CHARACTER, id: "src-1" };

beforeEach(() => {
  createMock.mockReset().mockResolvedValue("new-id");
  updateMock.mockReset().mockResolvedValue(undefined);
  deleteMock.mockReset().mockResolvedValue(undefined);
  getFullMock.mockReset().mockResolvedValue(fullDoc);
  downloadMock.mockReset().mockResolvedValue({ portraitDropped: false });
  confirmMock.mockReset();
  showToastMock.mockReset();
  bypassState.on = false;
});

describe("useRosterActions — clone", () => {
  it("creates a renamed, portrait-less, active copy preserving session (no campaign carry-over)", async () => {
    const doc = makeDoc();
    const { result } = renderHook(() => useRosterActions(doc));

    await act(() => result.current.clone());

    // Clone re-reads the FULL character (the roster card holds only the projection)
    // so the copy is faithful, not a truncated husk (#106).
    expect(getFullMock).toHaveBeenCalledWith("u1", "src-1");
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({
        status: "active",
        portraitUrl: null,
        portraitCrop: null,
        shareId: null,
        session: fullDoc.session, // verbatim from the re-read full doc — faithful
      })
    );
    // The clone is a brand-new id no campaign references — it must NOT carry any
    // campaign reference (membership lives on the campaign doc; the field is gone).
    const payload = createMock.mock.calls[0]?.[1];
    expect(payload).not.toHaveProperty("campaignId");
    // The clone is renamed — read the captured payload type-safely (a nested
    // `expect.objectContaining` here would surface an `any`).
    expect(payload?.character?.name).toBe("Lyra Voss (Copy)");
    expect(showToastMock).toHaveBeenCalled();
  });

  it("is a NO-OP under dev-bypass (createCharacter does not self-guard)", async () => {
    bypassState.on = true;
    const { result } = renderHook(() => useRosterActions(makeDoc()));

    await act(() => result.current.clone());

    expect(createMock).not.toHaveBeenCalled();
    expect(showToastMock).toHaveBeenCalled(); // the preview-unavailable notice
  });
});

describe("useRosterActions — delete", () => {
  it("cascade-deletes only after the confirm resolves true", async () => {
    confirmMock.mockResolvedValue(true);
    const { result } = renderHook(() => useRosterActions(makeDoc({ id: "del-1" })));

    await act(() => result.current.remove());

    expect(confirmMock).toHaveBeenCalledWith(expect.objectContaining({ tone: "danger" }));
    expect(deleteMock).toHaveBeenCalledWith("u1", "del-1");
  });

  it("does nothing when the confirm is cancelled (no undo path rebuilt)", async () => {
    confirmMock.mockResolvedValue(false);
    const { result } = renderHook(() => useRosterActions(makeDoc()));

    await act(() => result.current.remove());

    expect(deleteMock).not.toHaveBeenCalled();
  });
});

describe("useRosterActions — retire / restore", () => {
  it("retire writes status 'retired'", async () => {
    const { result } = renderHook(() => useRosterActions(makeDoc({ id: "r-1" })));
    await act(() => result.current.retire());
    expect(updateMock).toHaveBeenCalledWith("u1", "r-1", { status: "retired" });
  });

  it("restore writes status 'active'", async () => {
    const { result } = renderHook(() => useRosterActions(makeDoc({ id: "r-2" })));
    await act(() => result.current.restore());
    expect(updateMock).toHaveBeenCalledWith("u1", "r-2", { status: "active" });
  });
});

describe("useRosterActions — export", () => {
  it("downloads the character JSON for the re-read FULL doc (not the projection)", async () => {
    const doc = makeDoc();
    const { result } = renderHook(() => useRosterActions(doc));
    await act(() => result.current.exportJson());
    // Export re-reads the full character (the projection omits abilityScores/
    // equipment/spells, #106) and serializes THAT, never the truncated list item.
    expect(getFullMock).toHaveBeenCalledWith("u1", "src-1");
    expect(downloadMock).toHaveBeenCalledWith(fullDoc);
  });

  it("stays quiet on a clean export (the download IS the feedback)", async () => {
    downloadMock.mockResolvedValue({ portraitDropped: false });
    const { result } = renderHook(() => useRosterActions(makeDoc()));
    await act(() => result.current.exportJson());
    expect(showToastMock).not.toHaveBeenCalled();
  });

  it("surfaces a toast when the portrait was dropped — never silent (the owner's bug)", async () => {
    downloadMock.mockResolvedValue({ portraitDropped: true });
    const { result } = renderHook(() => useRosterActions(makeDoc()));
    await act(() => result.current.exportJson());
    // The file still downloaded, but the user is told its face couldn't be embedded.
    expect(showToastMock).toHaveBeenCalledTimes(1);
  });
});

describe("useLoadExample (admin)", () => {
  it("creates a fresh, portrait-less copy of the bundled example under its real name", async () => {
    const { result } = renderHook(() => useLoadExample());

    await act(() => result.current());

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({
        status: "active",
        portraitUrl: null,
        // The bundled example's play state, verbatim.
        session: MOCK_CHARACTER.session,
      })
    );
    // Loaded under the example's own name — no "(Example)" suffix (read the
    // payload type-safely — a nested objectContaining would surface an `any`).
    const payload = createMock.mock.calls[0]?.[1];
    expect(payload?.character?.name).toBe(MOCK_CHARACTER.character.name);
    expect(payload?.character?.name).not.toMatch(/\(Example\)/);
    expect(showToastMock).toHaveBeenCalled();
  });

  it("is a NO-OP under dev-bypass (createCharacter does not self-guard)", async () => {
    bypassState.on = true;
    const { result } = renderHook(() => useLoadExample());

    await act(() => result.current());

    expect(createMock).not.toHaveBeenCalled();
    expect(showToastMock).toHaveBeenCalled(); // the preview-unavailable notice
  });
});
