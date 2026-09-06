import { describe, it, expect, vi } from "vitest";
import { SessionController } from "@/lib/identity/session";
import { scopedAsset } from "@/lib/identity/assets";
vi.mock("firebase/storage");
describe("authenticated bytes lifecycle", () => {
  it("does not publish bytes that arrive after revocation", async () => {
    const s = new SessionController();
    s.transition({ uid: "owner", campaignId: null, activeCharacterId: "one" });
    let resolve!: (bytes: ArrayBuffer) => void;
    const create = vi.fn(() => "blob:test");
    const pending = scopedAsset(
      () =>
        new Promise<ArrayBuffer>((r) => {
          resolve = r;
        }),
      s,
      { create, revoke: vi.fn() }
    );
    s.revoke();
    resolve(new ArrayBuffer(1));
    await expect(pending).rejects.toThrow("stale-session");
    expect(create).not.toHaveBeenCalled();
  });
  it("releases each object URL on transition and explicit disposal once", async () => {
    const s = new SessionController();
    s.transition({ uid: "owner", campaignId: null, activeCharacterId: "one" });
    const revoke = vi.fn();
    const asset = await scopedAsset(() => Promise.resolve(new ArrayBuffer(2)), s, {
      create: () => "blob:test",
      revoke,
    });
    s.revoke();
    asset.dispose();
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:test");
  });
});
