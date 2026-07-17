/**
 * NotFoundPage (C1) — the recoverable 404 on the `path="*"` catch-all.
 * Pins that it renders the localized hero and that its CTA navigates back to
 * the canonical roster at /characters.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { NotFoundPage } from "@/app/routes/not-found";

const navigateMock = vi.fn();
vi.mock("react-router", async (orig) => ({
  ...(await orig<typeof import("react-router")>()),
  useNavigate: () => navigateMock,
}));

describe("NotFoundPage", () => {
  it("renders the 404 hero with its title and a back-to-characters CTA", () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>
    );
    expect(screen.getByText("404")).toBeInTheDocument();
    expect(screen.getByText("This page is off the map")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /back to your characters/i })
    ).toBeInTheDocument();
  });

  it("navigates to /characters when the CTA is pressed", () => {
    navigateMock.mockClear();
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: /back to your characters/i }));
    expect(navigateMock).toHaveBeenCalledWith("/characters");
  });
});
