/**
 * `shareOrCopy` — native-share-or-copy fallback (golden rule 3).
 *
 * Opens the OS share sheet when `navigator.share` exists, else copies + toasts. A
 * user-cancel (`AbortError`) is swallowed silently; any OTHER rejection — or a
 * missing `share` (desktop / jsdom) — falls back to `copyWithToast`. So the copy
 * path stays the single clipboard primitive and every context still shares.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

const showToast = vi.fn();
vi.mock("@/stores/toastStore", () => ({
  useToastStore: { getState: () => ({ showToast }) },
}));

import { shareOrCopy } from "@/components/shared/copy-to-clipboard";

const PAYLOAD = {
  title: "Join The Starless Keep",
  text: "Join my campaign:",
  copiedToast: "Invite link copied",
};
const URL = "https://d20-folio.web.app/join/ABC123";

afterEach(() => {
  vi.clearAllMocks();
  // jsdom has no navigator.share by default, but a test may have added it.
  Reflect.deleteProperty(navigator, "share");
});

describe("shareOrCopy", () => {
  it("uses the native share sheet (no copy, no toast) when available", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    await shareOrCopy(URL, PAYLOAD);

    expect(share).toHaveBeenCalledWith({
      title: PAYLOAD.title,
      text: PAYLOAD.text,
      url: URL,
    });
    expect(writeText).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it("swallows a user-cancel (AbortError) without falling back to copy", async () => {
    const abort = Object.assign(new Error("cancelled"), { name: "AbortError" });
    const share = vi.fn().mockRejectedValue(abort);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    await shareOrCopy(URL, PAYLOAD);

    expect(writeText).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it("falls back to copy + toast on a non-abort share rejection", async () => {
    const share = vi.fn().mockRejectedValue(new Error("not allowed"));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    await shareOrCopy(URL, PAYLOAD);

    expect(writeText).toHaveBeenCalledWith(URL);
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: PAYLOAD.copiedToast })
    );
  });

  it("copies + toasts when navigator.share is absent (desktop / jsdom)", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    await shareOrCopy(URL, PAYLOAD);

    expect(writeText).toHaveBeenCalledWith(URL);
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: PAYLOAD.copiedToast })
    );
  });
});
