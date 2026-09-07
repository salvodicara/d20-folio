import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useLibraryOperation } from "@/features/library/useLibraryOperation";
import { SessionController } from "@/lib/identity/session";
afterEach(() => {
  cleanup();
  sessionStorage.clear();
});
it("retains the exact receipt intent when local acknowledgment processing fails", async () => {
  const session = new SessionController();
  session.transition({ uid: "owner", campaignId: null, activeCharacterId: null });
  const envelope = {
    uid: "owner",
    opId: "one",
    scope: session.scope(),
    baseRevision: 0,
    authority: { characterRevision: null, assignment: null, campaignRevision: null },
  };
  const repository = {
    commit: vi.fn(() => Promise.resolve({ operation: envelope, revision: 1 })),
    reconcile: vi.fn(() => Promise.resolve(null)),
  };
  const view = renderHook(() =>
    useLibraryOperation(repository, session, "recovery", () => {
      throw Error("storage");
    })
  );
  await act(async () => {
    await view.result.current.run(() => envelope);
  });
  await waitFor(() => expect(view.result.current.error).toBe(true));
  expect(
    JSON.parse(sessionStorage.getItem("folio-library-operation:owner:recovery") ?? "null")
  ).toEqual({ envelope, invalidated: false });
});
