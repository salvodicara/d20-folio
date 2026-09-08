import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useLibraryOperation } from "@/features/library/useLibraryOperation";
import { SessionController } from "@/lib/identity/session";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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
it("a delayed local acknowledgment cannot erase a newer pending intent", async () => {
  const session = new SessionController();
  session.transition({ uid: "owner", campaignId: null, activeCharacterId: null });
  const first = {
    uid: "owner",
    opId: "first",
    scope: session.scope(),
    baseRevision: 0,
    authority: { characterRevision: null, assignment: null, campaignRevision: null },
  };
  const second = { ...first, opId: "second" };
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const repository = {
    commit: vi.fn((operation: typeof first) =>
      operation.opId === "first"
        ? Promise.resolve({ operation, revision: 1 })
        : new Promise<{ operation: typeof first; revision: number }>(() => {})
    ),
    reconcile: () => Promise.resolve(null),
  };
  const view = renderHook(() =>
    useLibraryOperation(repository, session, "race", () => held)
  );
  await act(async () => {
    await view.result.current.run(() => first);
  });
  act(() => {
    void view.result.current.run(() => second);
  });
  await waitFor(() => expect(repository.commit).toHaveBeenCalledTimes(2));
  await act(async () => {
    release();
    await held;
  });
  expect(
    JSON.parse(sessionStorage.getItem("folio-library-operation:owner:race") ?? "null")
  ).toEqual({ envelope: second, invalidated: false });
});

it.each([false, true])(
  "reconciles an invalidated committed receipt and retires only that envelope (newer=%s)",
  async (newer) => {
    const session = new SessionController();
    session.transition({ uid: "owner", campaignId: null, activeCharacterId: null });
    const envelope = {
      uid: "owner",
      opId: "committed",
      scope: session.scope(),
      baseRevision: 0,
      authority: { characterRevision: null, assignment: null, campaignRevision: null },
    };
    const key = "folio-library-operation:owner:invalidated-receipt";
    sessionStorage.setItem(key, JSON.stringify({ envelope, invalidated: true }));
    const next = { envelope: { ...envelope, opId: "newer" }, invalidated: false };
    const repository = {
      commit: vi.fn(() => Promise.resolve({ operation: envelope, revision: 1 })),
      reconcile: vi.fn(() => Promise.resolve({ operation: envelope, revision: 1 })),
    };
    const ack = vi.fn(() => {
      if (newer) sessionStorage.setItem(key, JSON.stringify(next));
    });
    const view = renderHook(() =>
      useLibraryOperation(repository, session, "invalidated-receipt", ack)
    );
    await act(async () => {
      expect(await view.result.current.reviewSettled()).toBe(false);
    });
    expect(ack).toHaveBeenCalledTimes(1);
    expect(repository.commit).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(key)).toBe(newer ? JSON.stringify(next) : null);
  }
);

it("preserves incompatible pending bytes and blocks sends until explicit recovery", async () => {
  const session = new SessionController();
  session.transition({ uid: "owner", campaignId: null, activeCharacterId: null });
  const envelope = {
    uid: "owner",
    opId: "new",
    scope: session.scope(),
    baseRevision: 0,
    authority: { characterRevision: null, assignment: null, campaignRevision: null },
  };
  const key = "folio-library-operation:owner:broken";
  sessionStorage.setItem(key, "{broken");
  const repository = {
    commit: vi.fn(() => Promise.resolve({ operation: envelope, revision: 0 })),
    reconcile: vi.fn(() => Promise.resolve(null)),
  };
  const view = renderHook(() =>
    useLibraryOperation(repository, session, "broken", () => {})
  );
  await act(async () => {
    await view.result.current.run(() => envelope);
  });
  expect(repository.commit).not.toHaveBeenCalled();
  expect(sessionStorage.getItem(key)).toBe("{broken");
  expect(view.result.current.recoveryOriginal).toBe("{broken");
});

it("can retry a storage failure before any envelope or remote send", async () => {
  const session = new SessionController();
  session.transition({ uid: "owner", campaignId: null, activeCharacterId: null });
  const envelope = {
    uid: "owner",
    opId: "new",
    scope: session.scope(),
    baseRevision: 0,
    authority: { characterRevision: null, assignment: null, campaignRevision: null },
  };
  const repository = {
    commit: vi.fn(() => Promise.resolve({ operation: envelope, revision: 0 })),
    reconcile: vi.fn(() => Promise.resolve(null)),
  };
  const view = renderHook(() =>
    useLibraryOperation(repository, session, "storage", () => {})
  );
  const write = vi
    .spyOn(Object.getPrototypeOf(sessionStorage) as Storage, "setItem")
    .mockImplementation(() => {
      throw Error("full");
    });
  await act(async () => {
    await view.result.current.run(() => envelope);
  });
  expect(repository.commit).not.toHaveBeenCalled();
  expect(view.result.current.error).toBe(true);
  write.mockRestore();
  await act(async () => {
    await view.result.current.retryStorage();
  });
  expect(view.result.current.error).toBe(false);
  await act(async () => {
    await view.result.current.run(() => envelope);
  });
  expect(repository.commit).toHaveBeenCalledOnce();
});

it("quarantines a recovered envelope that fails its domain codec", async () => {
  const session = new SessionController();
  session.transition({ uid: "owner", campaignId: null, activeCharacterId: null });
  const envelope = {
    uid: "owner",
    opId: "broken",
    scope: session.scope(),
    baseRevision: 0,
    authority: { characterRevision: null, assignment: null, campaignRevision: null },
  };
  const key = "folio-library-operation:owner:codec",
    original = JSON.stringify({ envelope, invalidated: false });
  sessionStorage.setItem(key, original);
  const repository = {
    validateRecovered: () => {
      throw Error("invalid-creation");
    },
    commit: vi.fn(() => Promise.resolve({ operation: envelope, revision: 0 })),
    reconcile: vi.fn(() => Promise.resolve(null)),
  };
  const view = renderHook(() =>
    useLibraryOperation(repository, session, "codec", () => {})
  );
  await act(async () => {
    await view.result.current.run(() => envelope);
  });
  expect(repository.commit).not.toHaveBeenCalled();
  expect(view.result.current.recoveryOriginal).toBe(original);
  expect(sessionStorage.getItem(key)).toBe(original);
});
it("reports silently failed receipt cleanup without changing the acknowledged server result", async () => {
  const session = new SessionController();
  session.transition({ uid: "owner", campaignId: null, activeCharacterId: null });
  const envelope = {
    uid: "owner",
    opId: "op",
    scope: session.scope(),
    baseRevision: 0,
    authority: { characterRevision: null, assignment: null, campaignRevision: null },
  };
  const repository = {
    commit: vi.fn(() => Promise.resolve({ operation: envelope, revision: 0 })),
    reconcile: vi.fn(() => Promise.resolve(null)),
  };
  const view = renderHook(() =>
    useLibraryOperation(repository, session, "cleanup-noop", () => {})
  );
  const remove = vi
    .spyOn(Object.getPrototypeOf(sessionStorage) as Storage, "removeItem")
    .mockImplementation(() => {});
  await act(async () => {
    await view.result.current.run(() => envelope);
  });
  expect(view.result.current.state?.status).toBe("acknowledged");
  expect(view.result.current.error).toBe(true);
  remove.mockRestore();
  await act(async () => {
    await view.result.current.retryStorage();
  });
  expect(view.result.current.error).toBe(false);
  expect(repository.commit).toHaveBeenCalledOnce();
  expect(sessionStorage.getItem("folio-library-operation:owner:cleanup-noop")).toBeNull();
});
