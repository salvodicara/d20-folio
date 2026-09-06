import { describe, expect, it, vi } from "vitest";
import { SessionController } from "@/lib/identity/session";
describe("identity session generation", () => {
  it("invalidates A→B→A callbacks and synchronously releases scope resources", () => {
    const s = new SessionController();
    s.transition({ uid: "a", campaignId: "c", activeCharacterId: "one" });
    const callback = vi.fn();
    const old = s.guard(callback);
    const cleanup = vi.fn();
    s.track(cleanup);
    s.transition({ uid: "b", campaignId: null, activeCharacterId: null });
    s.transition({ uid: "a", campaignId: "c", activeCharacterId: "one" });
    old("private");
    expect(callback).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledOnce();
  });
  it("fences late rejected writes and runs every cleanup even if one throws", async () => {
    const s = new SessionController();
    s.transition({ uid: "a", campaignId: null, activeCharacterId: null });
    let reject!: (error: Error) => void;
    const pending = s.runWrite(
      () =>
        new Promise<void>((_, r) => {
          reject = r;
        })
    );
    await Promise.resolve();
    const cleaned = vi.fn();
    s.track(() => {
      throw new Error("consumer-error");
    });
    s.track(cleaned);
    expect(() => s.revoke()).not.toThrow();
    reject(new Error("old-account-error"));
    await expect(pending).rejects.toThrow("stale-session");
    expect(cleaned).toHaveBeenCalledOnce();
  });
  it("cancels unsent work and rejects late acknowledgments including same uid reauthentication", async () => {
    const s = new SessionController();
    s.transition({ uid: "a", campaignId: null, activeCharacterId: null });
    const send = vi.fn();
    const pending = s.runWrite(send);
    s.revoke();
    await expect(pending).rejects.toThrow("stale-session");
    expect(send).not.toHaveBeenCalled();
    s.transition({ uid: "a", campaignId: null, activeCharacterId: null });
    let resolve!: () => void;
    const inflight = s.runWrite(
      () =>
        new Promise<void>((r) => {
          resolve = r;
        })
    );
    await Promise.resolve();
    s.revoke();
    resolve();
    await expect(inflight).rejects.toThrow("stale-session");
  });
});
