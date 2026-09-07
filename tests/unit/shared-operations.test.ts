import { describe, expect, it, vi } from "vitest";
import { OperationController } from "@/lib/shared/controller";

const envelope = { opId: "intent-one", uid: "owner", kind: "notes", payload: "draft" };
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
describe("shared operation lifecycle", () => {
  it("a double submit shares the same attempt; timeout is unknown until the original receipt arrives", async () => {
    vi.useFakeTimers();
    const remote = deferred<{ opId: string }>();
    const commit = vi.fn(() => remote.promise);
    const c = new OperationController(
      envelope,
      { commit, reconcile: () => Promise.resolve(null) },
      { timeoutMs: 100 }
    );
    void c.submit();
    void c.submit();
    await Promise.resolve();
    expect(commit).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(c.state.status).toBe("unknown");
    remote.resolve({ opId: "intent-one" });
    await Promise.resolve();
    await Promise.resolve();
    expect(c.state.status).toBe("acknowledged");
    expect(c.state.envelope).toEqual(envelope);
    vi.useRealTimers();
  });
  it("invalidation cancels an unsent operation and late acknowledgements cannot restore it", async () => {
    const commit = vi.fn(() => Promise.resolve({ opId: "intent-one" }));
    const c = new OperationController(envelope, {
      commit,
      reconcile: () => Promise.resolve(null),
    });
    void c.submit();
    c.invalidate();
    await Promise.resolve();
    await Promise.resolve();
    expect(commit).not.toHaveBeenCalled();
    expect(c.state.status).toBe("invalidated");
    expect(c.state.envelope).toEqual(envelope);
  });
  it("reconciles a lost response through the original receipt without a second commit", async () => {
    const commit = vi.fn(() =>
      Promise.reject(Object.assign(new Error("lost"), { code: "unavailable" }))
    );
    const receipt = { opId: "intent-one" };
    const c = new OperationController(envelope, {
      commit,
      reconcile: () => Promise.resolve(receipt),
    });
    await c.submit();
    expect(c.state.status).toBe("unknown");
    await c.retry();
    expect(c.state.status).toBe("acknowledged");
    expect(commit).toHaveBeenCalledTimes(1);
  });
});
it("ignores a late acknowledgement after context invalidation", async () => {
  const remote = deferred<{ opId: string }>();
  const c = new OperationController(envelope, {
    commit: () => remote.promise,
    reconcile: () => Promise.resolve(null),
  });
  void c.submit();
  await Promise.resolve();
  c.invalidate();
  remote.resolve({ opId: "intent-one" });
  await Promise.resolve();
  await Promise.resolve();
  expect(c.state.status).toBe("invalidated");
});
