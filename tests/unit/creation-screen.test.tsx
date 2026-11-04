/**
 * The new creation screen never picks a background silently: the summary says «—»
 * and «Next» waits until the player picks one.
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import { CreationScreen } from "@/domains/creation/ui/CreationScreen";

describe("CreationScreen", () => {
  it("a background is the player's pick: «—» and a waiting Next until then", () => {
    render(
      <MemoryRouter>
        <CreationScreen />
      </MemoryRouter>
    );
    const summary = () =>
      screen.getByText("Background", { selector: "dt" }).parentElement as HTMLElement;
    expect(within(summary()).getByText("—")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    const next = screen.getByRole("button", { name: "Next" });
    expect(next.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /^Acolyte/ }));
    expect(within(summary()).getByText("Acolyte")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Next" }).getAttribute("aria-disabled")
    ).toBeNull();
  });
});
