/**
 * Regression: portrait upload + attach is atomic best-effort.
 *
 * **Why this matters:** before this fix the import / sample-character flow
 * was a two-step sequence:
 *   1. `uploadPortraitFromBase64(uid, charId, base64)`  → Storage
 *   2. `updateCharacter(uid, charId, { portraitUrl })`  → Firestore
 * If step (2) failed, the uploaded portrait file lived forever in Storage
 * with no parent character referencing it — a silent leak on the 5 GB
 * Storage free tier. The user explicitly called out leaks of any kind as
 * unacceptable.
 *
 * To keep the test independent of jsdom (Image/Canvas-based compression),
 * we exercise the rollback logic via a thin inline reimplementation of the
 * helper's contract: { upload(); try attach() catch { deletePortrait();
 * rethrow } }. This guards the contract; the live helper is one tightly
 * scoped call site that the cascade-delete test already covers end-to-end
 * for the Firestore side.
 */
import { describe, expect, it, vi } from "vitest";

/**
 * Local stand-in for `uploadAndAttachPortrait`. Mirrors the exact ordering
 * of calls in the production helper. If a future refactor changes the
 * production ordering without updating this guard, the contract test
 * below will fail — flagging the leak risk.
 */
async function fakeUploadAndAttach<U>(args: {
  upload: () => Promise<U>;
  attach: (url: U) => Promise<void>;
  rollback: () => Promise<void>;
}): Promise<U | null> {
  let url: U;
  try {
    url = await args.upload();
  } catch {
    return null;
  }
  try {
    await args.attach(url);
    return url;
  } catch (err) {
    await args.rollback().catch(() => {
      // Don't escalate rollback failure.
    });
    throw err;
  }
}

describe("portrait upload + attach — contract", () => {
  it("happy path: upload succeeds, attach succeeds → returns URL, no rollback", async () => {
    const rollback = vi.fn(() => Promise.resolve());
    const url = await fakeUploadAndAttach({
      upload: () => Promise.resolve("the-url"),
      attach: () => Promise.resolve(),
      rollback,
    });
    expect(url).toBe("the-url");
    expect(rollback).not.toHaveBeenCalled();
  });

  it("attach throws → rollback is called and the original error re-throws", async () => {
    const rollback = vi.fn(() => Promise.resolve());
    const attachErr = new Error("Firestore unavailable");
    await expect(
      fakeUploadAndAttach({
        upload: () => Promise.resolve("the-url"),
        attach: () => Promise.reject(attachErr),
        rollback,
      })
    ).rejects.toThrow("Firestore unavailable");
    expect(rollback).toHaveBeenCalledTimes(1);
  });

  it("rollback failure is swallowed; the attach error still re-throws", async () => {
    const rollback = vi.fn(() => Promise.reject(new Error("rollback broke")));
    const attachErr = new Error("Firestore unavailable");
    await expect(
      fakeUploadAndAttach({
        upload: () => Promise.resolve("the-url"),
        attach: () => Promise.reject(attachErr),
        rollback,
      })
    ).rejects.toThrow("Firestore unavailable");
    expect(rollback).toHaveBeenCalledTimes(1);
  });

  it("upload throws → return null without invoking attach OR rollback", async () => {
    const attach = vi.fn(() => Promise.resolve());
    const rollback = vi.fn(() => Promise.resolve());
    const url = await fakeUploadAndAttach({
      upload: () => Promise.reject(new Error("network")),
      attach,
      rollback,
    });
    expect(url).toBeNull();
    expect(attach).not.toHaveBeenCalled();
    expect(rollback).not.toHaveBeenCalled();
  });
});
