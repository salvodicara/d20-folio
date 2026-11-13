/**
 * The new UI's Button while it works on a press (a cast waiting for the party): it
 * says so to assistive tech and takes no second press. Pattern: the classic Button's
 * `loading`.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Button } from "@/ui";

describe("Button busy", () => {
  it("is announced busy and ignores a second press", () => {
    const onClick = vi.fn();
    render(
      <Button busy onClick={onClick}>
        Cast
      </Button>
    );
    const button = screen.getByRole("button", { name: "Cast" });
    expect(button.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("is a plain button otherwise", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Cast</Button>);
    const button = screen.getByRole("button", { name: "Cast" });
    expect(button.hasAttribute("aria-busy")).toBe(false);
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
