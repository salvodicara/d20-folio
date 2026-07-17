/**
 * AuthGuard — the route gate (N-F: blocked-user flow). Pins what a user sees in each
 * auth state, with special attention to BLOCKED: a blocked user must land on the
 * BlockedScreen — NOT the app, and NOT a redirect to /login (they ARE authenticated,
 * so bouncing them to login would loop). The firestore rules deny blocked users at
 * the data layer too (tests/rules/firestore-rules.test.ts); this covers the UI gate.
 *
 * `useAuthStore` is mocked to a controllable state object; dev-bypass is forced off
 * so the real branches run.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";

const { authState } = vi.hoisted(() => ({
  authState: {
    current: {} as {
      user: { uid: string } | null;
      initialized: boolean;
      isBlocked: boolean;
      loading: boolean;
    },
  },
}));

vi.mock("@/lib/dev-bypass", () => ({ DEV_BYPASS_AUTH: false }));
// The real authStore pulls in firebase; mock it (and firebase itself) so the
// CI-safety pure-modules guard stays satisfied and tests run with the API key unset.
vi.mock("@/lib/firebase", () => ({}));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: () => authState.current,
}));

import { AuthGuard } from "@/components/shared/AuthGuard";

function renderGuard() {
  return render(
    <MemoryRouter initialEntries={["/app"]}>
      <Routes>
        <Route element={<AuthGuard />}>
          <Route path="/app" element={<div>Protected</div>} />
        </Route>
        <Route path="/login" element={<div>LoginPage</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("AuthGuard — blocked-user flow", () => {
  it("shows the BlockedScreen for a blocked user (not the app, not a login bounce)", () => {
    authState.current = {
      user: { uid: "u1" },
      initialized: true,
      isBlocked: true,
      loading: false,
    };
    renderGuard();
    expect(screen.getByText(/account blocked/i)).toBeInTheDocument();
    // A blocked user is authenticated → must NOT be redirected to login, and must
    // NOT see the protected app.
    expect(screen.queryByText("Protected")).not.toBeInTheDocument();
    expect(screen.queryByText("LoginPage")).not.toBeInTheDocument();
  });

  it("renders the protected app for an active, authenticated user", () => {
    authState.current = {
      user: { uid: "u1" },
      initialized: true,
      isBlocked: false,
      loading: false,
    };
    renderGuard();
    expect(screen.getByText("Protected")).toBeInTheDocument();
  });

  it("redirects an unauthenticated user to /login", () => {
    authState.current = {
      user: null,
      initialized: true,
      isBlocked: false,
      loading: false,
    };
    renderGuard();
    expect(screen.getByText("LoginPage")).toBeInTheDocument();
    expect(screen.queryByText("Protected")).not.toBeInTheDocument();
  });

  it("waits (no app, no login) while auth is still initializing", () => {
    authState.current = {
      user: null,
      initialized: false,
      isBlocked: false,
      loading: true,
    };
    renderGuard();
    expect(screen.queryByText("Protected")).not.toBeInTheDocument();
    expect(screen.queryByText("LoginPage")).not.toBeInTheDocument();
  });
});
