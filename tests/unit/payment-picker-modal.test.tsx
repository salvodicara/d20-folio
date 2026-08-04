/**
 * PaymentPickerModal — every legal resource is a whole-row action, the declared
 * default gets the restrained gilt treatment, and unaffordable choices remain
 * visible but inert so the player understands why an alternative is unavailable.
 */

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PaymentPickerModal } from "@/components/sheet/PaymentPickerModal";

const request = {
  actionName: "Wild Companion",
  rows: [
    {
      index: 0,
      label: "Wild Shape",
      remaining: "3/3",
      affordable: true,
      primary: true,
    },
    {
      index: 1,
      label: "Spell slot (level 1+)",
      remaining: null,
      affordable: false,
      primary: false,
    },
  ],
};

describe("PaymentPickerModal", () => {
  it("renders nothing without a request", () => {
    render(
      <PaymentPickerModal request={null} onConfirm={() => {}} onCancel={() => {}} />
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("names the dialog and visually identifies only the declared default", () => {
    render(
      <PaymentPickerModal request={request} onConfirm={() => {}} onCancel={() => {}} />
    );
    const dialog = screen.getByRole("dialog", { name: /how to pay for wild companion/i });
    const primary = within(dialog).getByRole("button", {
      name: /default cost.*wild shape/i,
    });
    const alternate = within(dialog).getByRole("button", {
      name: /alternate cost.*spell slot/i,
    });

    expect(primary).toHaveClass("cl-payment-primary");
    expect(alternate).not.toHaveClass("cl-payment-primary");
    expect(alternate).toBeDisabled();
  });

  it("commits an affordable row and cancels without choosing", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <PaymentPickerModal request={request} onConfirm={onConfirm} onCancel={onCancel} />
    );
    const dialog = screen.getByRole("dialog");

    fireEvent.click(within(dialog).getByRole("button", { name: /default cost/i }));
    expect(onConfirm).toHaveBeenCalledWith(0);

    const cancelButtons = within(dialog).getAllByRole("button", { name: /^cancel$/i });
    const cancelButton = cancelButtons.at(-1);
    if (!cancelButton) throw new Error("Payment dialog has no cancel action");
    fireEvent.click(cancelButton);
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
