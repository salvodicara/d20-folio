/**
 * RouteErrorBoundary — the React Router `errorElement` regression.
 *
 * A route that throws during render must surface the themed, RECOVERABLE folio
 * fallback (reload + back-to-characters) instead of React Router's bare default
 * "Unexpected Application Error!" screen — the white screen the owner hit when a
 * malformed character doc crashed the roster (2026-06-08).
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { RouteErrorBoundary } from "@/components/shared/RouteErrorBoundary";

function Boom(): never {
  throw new Error("kaboom-from-render");
}

describe("RouteErrorBoundary (route errorElement)", () => {
  it("renders a recoverable fallback when a route throws on render", () => {
    const router = createMemoryRouter(
      [
        {
          path: "/",
          element: <Boom />,
          errorElement: <RouteErrorBoundary variant="region" />,
        },
      ],
      { initialEntries: ["/"] }
    );
    render(<RouterProvider router={router} />);

    // The themed fallback — NOT React Router's bare default error screen.
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    // Recovery affordances: reload the app + walk back to the roster.
    expect(screen.getByRole("button", { name: /reload app/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /back to my characters/i })
    ).toBeInTheDocument();
    // The crash-report entry rides the SAME shared fallback (one recipe, both
    // boundaries): the route error screen also offers the pre-filled reporter.
    expect(
      screen.getByRole("button", { name: /report this problem/i })
    ).toBeInTheDocument();
    // The underlying error message is surfaced (in the collapsed details).
    expect(screen.getByText(/kaboom-from-render/)).toBeInTheDocument();
  });
});
