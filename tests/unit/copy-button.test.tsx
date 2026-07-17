/**
 * CopyButton — the ONE copy-to-clipboard affordance (golden rule 3).
 *
 * Clicking copies `value` to the clipboard and fires the (pre-localized)
 * `toastMessage`. The component is i18n-agnostic; the caller passes both strings.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const showToast = vi.fn();
vi.mock("@/stores/toastStore", () => ({
  useToastStore: { getState: () => ({ showToast }) },
}));

import { CopyButton } from "@/components/shared/CopyButton";

afterEach(() => {
  vi.clearAllMocks();
});

describe("CopyButton", () => {
  it("copies the value to the clipboard and toasts the message on click", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(
      <CopyButton
        value="https://example/join/ABC123"
        toastMessage="Invite link copied"
        label="Copy"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /copy/i }));
    expect(writeText).toHaveBeenCalledWith("https://example/join/ABC123");
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Invite link copied" })
    );
  });
});
