import { it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { SessionController } from "@/lib/identity/session";
import { useLibraryOperation } from "@/features/library/useLibraryOperation";
function setup() {
  const session = new SessionController();
  session.transition({
    uid: "operation-owner",
    campaignId: null,
    activeCharacterId: null,
  });
  return session;
}
it("persists invalidation for a recovered unsent operation across A→B→A", () => {
  const session = setup(),
    envelope = {
      kind: "library-offer",
      scope: session.scope(),
      uid: "operation-owner",
      opId: "recover",
    };
  const key = "folio-library-operation:operation-owner:recover";
  sessionStorage.setItem(key, JSON.stringify({ envelope, invalidated: false }));
  const hook = renderHook(() =>
    useLibraryOperation({} as never, session, "recover", () => {})
  );
  act(() => {
    session.transition({ uid: "other", campaignId: null, activeCharacterId: null });
    session.transition({
      uid: "operation-owner",
      campaignId: null,
      activeCharacterId: null,
    });
  });
  expect(
    (JSON.parse(sessionStorage.getItem(key) ?? "null") as { invalidated: boolean })
      .invalidated
  ).toBe(true);
  hook.unmount();
});
it("storage cleanup failure cannot turn an acknowledged server commit into unknown", async () => {
  const session = setup(),
    envelope = {
      kind: "library-offer",
      scope: session.scope(),
      uid: "operation-owner",
      opId: "saved",
    };
  const onAck = vi.fn();
  const repository = {
    commit: () => Promise.resolve({ operation: envelope, revision: 1 }),
    reconcile: () => Promise.resolve(null),
  };
  const hook = renderHook(() =>
    useLibraryOperation(repository as never, session, "cleanup", onAck)
  );
  const remove = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
    throw new Error("storage unavailable");
  });
  await act(async () => {
    await hook.result.current.run(() => envelope as never);
  });
  expect(hook.result.current.state?.status).toBe("acknowledged");
  expect(onAck).toHaveBeenCalledOnce();
  remove.mockRestore();
  hook.unmount();
});
