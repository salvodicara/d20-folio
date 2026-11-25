// @vitest-environment jsdom
/**
 * Drafts survive a reload (E4 item 6, the DDB Quickbuilder pattern). Device-local
 * working state, never a stored character: localStorage per account, a small schema
 * version so an older client's draft is dropped, never misread; blocked storage just
 * loses the convenience; cleared on «Create», on a saved level-up and on sign-out.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearAccountDrafts,
  clearCreationDraft,
  clearLevelUpDraft,
  loadCreationDraft,
  loadLevelUpDraft,
  saveCreationDraft,
  saveLevelUpDraft,
} from "@/lib/local-draft";
import { initialCreationDraft } from "@/lib/creation/draft";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("the creation draft", () => {
  it("round-trips per account, and another account never sees it", () => {
    const draft = { ...initialCreationDraft(), name: "Selene", classId: "cleric" };
    saveCreationDraft("u1", draft);
    expect(loadCreationDraft("u1")).toEqual(draft);
    expect(loadCreationDraft("u2")).toBeNull();
    clearCreationDraft("u1");
    expect(loadCreationDraft("u1")).toBeNull();
  });

  it("an older client's draft (other version) or a broken one is dropped", () => {
    localStorage.setItem("folio.creationDraft.u1", JSON.stringify({ v: 0, draft: {} }));
    expect(loadCreationDraft("u1")).toBeNull();
    localStorage.setItem("folio.creationDraft.u1", "{not json");
    expect(loadCreationDraft("u1")).toBeNull();
  });

  it("blocked storage only loses the convenience", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => saveCreationDraft("u1", initialCreationDraft())).not.toThrow();
    expect(loadCreationDraft("u1")).toBeNull();
  });
});

describe("the level-up draft", () => {
  it("is kept per character for the level it was made at, never for another level", () => {
    saveLevelUpDraft("u1", "c1", { fromLevel: 4, classId: "bard", answers: { x: 1 } });
    expect(loadLevelUpDraft("u1", "c1", 4)).toEqual({
      classId: "bard",
      answers: { x: 1 },
    });
    expect(loadLevelUpDraft("u1", "c1", 5)).toBeNull();
    expect(loadLevelUpDraft("u1", "c2", 4)).toBeNull();
    clearLevelUpDraft("u1", "c1");
    expect(loadLevelUpDraft("u1", "c1", 4)).toBeNull();
  });
});

describe("sign-out", () => {
  it("clears that account's drafts only", () => {
    saveCreationDraft("u1", initialCreationDraft());
    saveLevelUpDraft("u1", "c1", { fromLevel: 4, classId: "bard", answers: {} });
    saveCreationDraft("u2", initialCreationDraft());
    clearAccountDrafts("u1");
    expect(loadCreationDraft("u1")).toBeNull();
    expect(loadLevelUpDraft("u1", "c1", 4)).toBeNull();
    expect(loadCreationDraft("u2")).not.toBeNull();
  });
});

describe("the creation screen keeps its draft across a reload", () => {
  it("a choice made, the screen remounted (a reload): the choice is still there", async () => {
    const { renderHook, act } = await import("@testing-library/react");
    const { useCreationDraft } = await import("@/features/creation/use-creation-draft");
    const { useAuthStore } = await import("@/stores/authStore");
    useAuthStore.setState({ user: { uid: "u1" } as never });
    const first = renderHook(() => useCreationDraft());
    act(() => first.result.current[1]({ type: "selectClass", classId: "druid" }));
    first.unmount();
    const second = renderHook(() => useCreationDraft());
    expect(second.result.current[0].classId).toBe("druid");
    clearCreationDraft("u1");
    second.unmount();
    expect(renderHook(() => useCreationDraft()).result.current[0].classId).not.toBe(
      "druid"
    );
    useAuthStore.setState({ user: null });
  });
});
