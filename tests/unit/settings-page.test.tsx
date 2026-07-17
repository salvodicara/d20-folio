/**
 * SettingsPage — the full `/settings` page (Phase 6).
 *
 * Proves the page is a PURE VIEW over the shipped seams: it renders the wired
 * sections and dispatches each control to the SAME store/hook the dropdown uses
 * (no forked logic). The stores/hooks are mocked so the test asserts the
 * dispatch, never persistence internals.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";

const {
  navigateMock,
  setThemeMock,
  setLanguageMock,
  signOutMock,
  uiState,
  localeState,
  authState,
  isAdminState,
} = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  setThemeMock: vi.fn(),
  setLanguageMock: vi.fn(),
  signOutMock: vi.fn(() => Promise.resolve()),
  uiState: { theme: "dark" },
  localeState: { language: "en" },
  authState: {
    user: { uid: "u1", email: "tester@example.com" },
    profile: null as { displayName?: string; photoURL?: string } | null,
  },
  isAdminState: { value: false },
}));

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return { ...actual, useNavigate: () => navigateMock };
});
// authStore type-imports firebase/auth → the pure-modules guard wants a firebase
// mock; lib/auth is mocked for the signOut spy.
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({ signOut: signOutMock }));
vi.mock("@/stores/uiStore", () => ({
  useUIStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      theme: uiState.theme,
      setTheme: setThemeMock,
    }),
}));
vi.mock("@/hooks/useLocale", () => ({
  useLocale: () => ({ language: localeState.language, setLanguage: setLanguageMock }),
}));
vi.mock("@/hooks/useIsAdmin", () => ({ useIsAdmin: () => isAdminState.value }));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ user: authState.user, profile: authState.profile }),
}));

import { SettingsPage } from "@/features/account/SettingsPage";

function renderPage() {
  return render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  navigateMock.mockReset();
  setThemeMock.mockReset();
  setLanguageMock.mockReset();
  signOutMock.mockReset().mockResolvedValue(undefined);
  uiState.theme = "dark";
  localeState.language = "en";
  authState.user = { uid: "u1", email: "tester@example.com" };
  authState.profile = null;
  isAdminState.value = false;
});

describe("SettingsPage", () => {
  it("renders Appearance + Account + Sign out; Admin hidden for non-admins", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: /appearance/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^account$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
    // The signed-in identity surfaces in the Account card.
    expect(screen.getByText("tester@example.com")).toBeInTheDocument();
    // No admin section without the gate.
    expect(screen.queryByRole("heading", { name: /^admin$/i })).not.toBeInTheDocument();
  });

  it("Theme segmented dispatches setTheme", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Light Mode" }));
    expect(setThemeMock).toHaveBeenCalledWith("light");
  });

  it("Language segmented dispatches setLanguage", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "IT" }));
    expect(setLanguageMock).toHaveBeenCalledWith("it");
  });

  it("has NO in-app animations/motion toggle (motion follows the OS only)", () => {
    // Removed Owner-feedback 2026-06-07: the animations toggle is gone; motion is
    // driven purely by the OS prefers-reduced-motion setting, so the page must not
    // render a motion switch.
    renderPage();
    expect(
      screen.queryByRole("switch", { name: /enable animations/i })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("shows the Admin link ONLY for an admin, and it navigates to /admin", () => {
    isAdminState.value = true;
    renderPage();
    const adminLink = screen.getByRole("button", { name: /open admin/i });
    fireEvent.click(adminLink);
    expect(navigateMock).toHaveBeenCalledWith("/admin");
  });

  it("Sign out dispatches signOut", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect(signOutMock).toHaveBeenCalled();
  });
});
