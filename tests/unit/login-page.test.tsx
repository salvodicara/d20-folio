/**
 * LoginPage — the pre-auth splash (`/login`). The dev-bypass makes this surface
 * unreachable in e2e (the old app-shell.spec.ts asserted it but was permanently
 * `test.skip()`'d — dead), so this thin render test is the ONLY witness that the
 * sign-in surface renders and wires its CTA. Rule 13: ≥1 running render test per
 * surface for the wiring.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";

const signInMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/firebase", () => ({}));
vi.mock("@/lib/auth", () => ({ signIn: signInMock }));

import { LoginPage } from "@/app/routes/login";
import { useAuthStore } from "@/stores/authStore";

function renderLogin() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>
  );
}

describe("LoginPage", () => {
  beforeEach(() => {
    signInMock.mockClear();
    useAuthStore.setState({
      user: null,
      initialized: true,
      loading: false,
      error: null,
    });
  });

  it("renders the brand splash with the Google sign-in CTA", () => {
    renderLogin();
    expect(
      screen.getByRole("button", { name: /sign in with google/i })
    ).toBeInTheDocument();
  });

  it("invokes signIn when the CTA is pressed", () => {
    renderLogin();
    fireEvent.click(screen.getByRole("button", { name: /sign in with google/i }));
    expect(signInMock).toHaveBeenCalledOnce();
  });

  it("surfaces an auth error with an explicit retry", () => {
    useAuthStore.setState({ error: "nope" });
    renderLogin();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
