/**
 * ShareButton — the ONE native-share affordance (golden rule 3), the twin of
 * CopyButton.
 *
 * Pins the two platform branches at the BUTTON: the Web Share sheet when the
 * platform has one (and then NO clipboard write and NO toast — the sheet is the
 * feedback), the clipboard + toast when it does not. The component stays
 * i18n-agnostic: every string is the caller's.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const showToast = vi.fn();
vi.mock("@/stores/toastStore", () => ({
  useToastStore: { getState: () => ({ showToast }) },
}));

import { ShareButton } from "@/components/shared/ShareButton";

const LINK = "https://example/join/ABC123";

function renderButton(disabled?: boolean) {
  render(
    <ShareButton
      value={LINK}
      title="Join Lost Mine on d20 Folio"
      text="Join my D&D campaign:"
      copiedToast="Invite link copied"
      label="Share"
      disabled={disabled}
    />
  );
  return screen.getByRole("button", { name: /share/i });
}

/** Stub the clipboard sink jsdom does not provide. */
function stubClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
  return writeText;
}

afterEach(() => {
  vi.clearAllMocks();
  Reflect.deleteProperty(navigator, "share");
});

describe("ShareButton", () => {
  it("opens the platform share sheet when there is one — no copy, no toast", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    const writeText = stubClipboard();

    fireEvent.click(renderButton());

    await waitFor(() =>
      expect(share).toHaveBeenCalledWith({
        title: "Join Lost Mine on d20 Folio",
        text: "Join my D&D campaign:",
        url: LINK,
      })
    );
    expect(writeText).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it("falls back to the clipboard + toast where there is no share sheet", async () => {
    const writeText = stubClipboard();
    fireEvent.click(renderButton());
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(LINK));
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Invite link copied" })
    );
  });

  it("stays visible but inert when disabled (a revoked link)", () => {
    const writeText = stubClipboard();
    const button = renderButton(true);
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(writeText).not.toHaveBeenCalled();
  });
});
