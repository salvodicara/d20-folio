/**
 * SettingsDropdown — the topbar account/quick-settings menu (Phase 6 reconcile).
 *
 * Proves the reconcile + D17: the redundant "Characters" entry is GONE, a
 * "Settings" link → /settings is present, the admin entry is gated by the shared
 * `useIsAdmin`, and the two fast-access toggles (theme · language) dispatch to the
 * SAME seams the full page uses (theme via uiStore, language via useLocale). Motion
 * is NO LONGER duplicated here — it lives only on the Settings page (D17).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";

const {
  navigateMock,
  setThemeMock,
  toggleLanguageMock,
  signOutMock,
  openReportMock,
  uiState,
  localeState,
  authState,
  isAdminState,
} = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  setThemeMock: vi.fn(),
  toggleLanguageMock: vi.fn(),
  signOutMock: vi.fn(() => Promise.resolve()),
  openReportMock: vi.fn(),
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
  useLocale: () => ({
    language: localeState.language,
    toggleLanguage: toggleLanguageMock,
  }),
}));
vi.mock("@/hooks/useIsAdmin", () => ({ useIsAdmin: () => isAdminState.value }));
// The report entry hands off to the shared after-paint launcher (html2canvas);
// mock it so the menu test stays pure + fast.
vi.mock("@/features/report/open-report", () => ({
  openReportAfterPaint: openReportMock,
}));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ user: authState.user, profile: authState.profile }),
}));

import { SettingsDropdown } from "@/components/sheet/SettingsDropdown";

/** Render and open the menu (the trigger is the account avatar). */
function open(current: "settings" | "admin" | null = null) {
  render(
    <MemoryRouter>
      <SettingsDropdown current={current} />
    </MemoryRouter>
  );
  fireEvent.click(screen.getByRole("button", { name: /account/i }));
}

beforeEach(() => {
  navigateMock.mockReset();
  setThemeMock.mockReset();
  toggleLanguageMock.mockReset();
  signOutMock.mockReset().mockResolvedValue(undefined);
  openReportMock.mockReset();
  uiState.theme = "dark";
  localeState.language = "en";
  authState.user = { uid: "u1", email: "tester@example.com" };
  authState.profile = null;
  isAdminState.value = false;
});

describe("SettingsDropdown — reconcile", () => {
  it("name + avatar are one clickable trigger that opens the menu (owner 2026-06-07)", () => {
    authState.profile = { displayName: "Lyra Voss" };
    render(
      <MemoryRouter>
        <SettingsDropdown current={null} />
      </MemoryRouter>
    );
    const trigger = screen.getByRole("button", { name: /account/i });
    // The display name lives INSIDE the trigger button (not a sibling), so the
    // whole name+avatar combo is the single click target.
    expect(trigger).toHaveTextContent("Lyra Voss");
    // Menu is closed until the (combined) trigger is clicked.
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("drops the redundant 'Characters' entry", () => {
    open();
    expect(
      screen.queryByRole("menuitem", { name: /characters/i })
    ).not.toBeInTheDocument();
  });

  it("adds a 'Settings' link that navigates to /settings", () => {
    open();
    const settings = screen.getByRole("menuitem", { name: /settings/i });
    fireEvent.click(settings);
    expect(navigateMock).toHaveBeenCalledWith("/settings");
  });

  it("gates the Admin entry on useIsAdmin", () => {
    open();
    expect(screen.queryByRole("menuitem", { name: /admin/i })).not.toBeInTheDocument();
  });

  it("shows the Admin entry for an admin and navigates to /admin", () => {
    isAdminState.value = true;
    open();
    fireEvent.click(screen.getByRole("menuitem", { name: /admin/i }));
    expect(navigateMock).toHaveBeenCalledWith("/admin");
  });

  it("the quick theme toggle still dispatches to the store (dark → light)", () => {
    open();
    fireEvent.click(screen.getByRole("menuitem", { name: /dark mode/i }));
    expect(setThemeMock).toHaveBeenCalledWith("light");
  });

  it("the quick language toggle delegates to the shared useLocale", () => {
    open();
    fireEvent.click(screen.getByRole("menuitem", { name: /language/i }));
    expect(toggleLanguageMock).toHaveBeenCalled();
  });

  it("does NOT carry a motion toggle (removed app-wide — motion follows the OS)", () => {
    open();
    // The account menu keeps only the two fast-access toggles (theme · language).
    // The animations toggle was removed entirely (Owner-feedback 2026-06-07);
    // motion is driven purely by the OS prefers-reduced-motion setting.
    expect(
      screen.queryByRole("menuitemcheckbox", { name: /motion/i })
    ).not.toBeInTheDocument();
  });

  it("Sign out dispatches signOut", () => {
    open();
    fireEvent.click(screen.getByRole("menuitem", { name: /sign out/i }));
    expect(signOutMock).toHaveBeenCalled();
  });

  it("carries a quiet 'Report a bug' entry that closes the menu and opens the reporter", () => {
    open();
    fireEvent.click(screen.getByRole("menuitem", { name: /report a bug/i }));
    // The menu closes FIRST (the after-paint deferral then captures the page,
    // not the open menu), and the shared launcher is invoked once.
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(openReportMock).toHaveBeenCalledTimes(1);
  });
});

describe("SettingsDropdown — the account-ring anchor (D2 / D3)", () => {
  it("lights the trigger when the current surface is a ring page", () => {
    render(
      <MemoryRouter>
        <SettingsDropdown current="settings" />
      </MemoryRouter>
    );
    const trigger = screen.getByRole("button", { name: /account/i });
    expect(trigger).toHaveAttribute("data-current", "true");
    expect(trigger).toHaveAttribute("aria-current", "true");
  });

  it("does NOT light the trigger off the ring", () => {
    render(
      <MemoryRouter>
        <SettingsDropdown current={null} />
      </MemoryRouter>
    );
    const trigger = screen.getByRole("button", { name: /account/i });
    expect(trigger).not.toHaveAttribute("data-current");
    expect(trigger).not.toHaveAttribute("aria-current");
  });

  it("marks the Settings row current on /settings (one grammar with the palette)", () => {
    open("settings");
    expect(screen.getByRole("menuitem", { name: /settings/i })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  it("marks the Admin row current on /admin (admin only)", () => {
    isAdminState.value = true;
    open("admin");
    expect(screen.getByRole("menuitem", { name: /admin/i })).toHaveAttribute(
      "aria-current",
      "page"
    );
    // …and the Settings row is NOT current when Admin is.
    expect(screen.getByRole("menuitem", { name: /settings/i })).not.toHaveAttribute(
      "aria-current"
    );
  });
});

describe("SettingsDropdown — no-truncation trigger name (owner 2026-06-12)", () => {
  it("renders the FULL name (xl slot) and the first name (lg slot) — never a mid-name ellipsis", () => {
    authState.profile = { displayName: "Salvatore Di Cara" };
    render(
      <MemoryRouter>
        <SettingsDropdown current={null} />
      </MemoryRouter>
    );
    const trigger = screen.getByRole("button", { name: /account/i });
    const slots = trigger.querySelectorAll(".acct-trigger-name");
    expect(slots).toHaveLength(2);
    expect(slots[0]?.textContent).toBe("Salvatore"); // tight band: first name only
    expect(slots[1]?.textContent).toBe("Salvatore Di Cara"); // wide: full, natural width
  });

  it("email fallback shows the local part in the tight band, the full address wide", () => {
    authState.profile = null;
    render(
      <MemoryRouter>
        <SettingsDropdown current={null} />
      </MemoryRouter>
    );
    const trigger = screen.getByRole("button", { name: /account/i });
    const slots = trigger.querySelectorAll(".acct-trigger-name");
    expect(slots[0]?.textContent).toBe("tester");
    expect(slots[1]?.textContent).toBe("tester@example.com");
  });

  it("the .acct-trigger-name recipe carries NO truncation (no max-width / text-overflow)", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles/folio.css"), "utf8");
    const block = /\.acct-trigger-name\s*\{[^}]*\}/.exec(css)?.[0] ?? "";
    expect(block).not.toBe("");
    expect(block).not.toMatch(/text-overflow|max-width/);
  });
});
