/**
 * IconButton atom — the `.hdr-icon` ghost-icon control. Locks the contract the 5
 * migrated sites rely on: the base class, `type="button"` default, className
 * passthrough (callers tune the hover tint), and native prop forwarding.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { IconButton } from "@/components/ui/icon-button";

describe("IconButton", () => {
  it("renders a .hdr-icon button with type=button and the required label", () => {
    render(<IconButton aria-label="Close">x</IconButton>);
    const btn = screen.getByRole("button", { name: "Close" });
    expect(btn).toHaveClass("hdr-icon");
    expect(btn).toHaveAttribute("type", "button");
  });

  it("merges extra className (the caller's hover tint) and fires onClick", () => {
    const onClick = vi.fn();
    render(
      <IconButton aria-label="Remove" className="hover:text-danger" onClick={onClick}>
        x
      </IconButton>
    );
    const btn = screen.getByRole("button", { name: "Remove" });
    expect(btn).toHaveClass("hdr-icon", "hover:text-danger");
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
