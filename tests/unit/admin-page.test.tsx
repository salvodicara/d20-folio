/**
 * AdminPage — the re-homed, restyled admin console (Phase 6).
 *
 * Proves the move preserved behavior 1:1 and the gate folded onto the shared
 * hook: a signed-in NON-admin gets the folio access-denied screen; an admin sees
 * the stats + the user list; Block/Unblock dispatch to `setUserStatus` with the
 * right args; and the current admin's own row carries no block control
 * (can't-block-yourself). The gate (`useIsAdmin`), identity (`authStore`), and the
 * four `@/lib/firestore` io fns are mocked — the test asserts dispatch, never
 * Firestore internals (and `@/lib/firebase` is stubbed per the pure-modules guard).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { AdminCampaignSummary } from "@/lib/firestore";
import { useConfirmStore } from "@/stores/confirmStore";

const {
  navigateMock,
  isAdminState,
  authState,
  listAllUsersMock,
  setUserStatusMock,
  countCharactersPerUserMock,
  listCampaignSummariesMock,
  listBugReportsMock,
  purgeBugReportsMock,
  getClosedIssueNumbersMock,
} = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  isAdminState: { value: true },
  authState: { user: { uid: "admin-uid", email: "admin@example.com" } },
  listAllUsersMock: vi.fn(),
  setUserStatusMock: vi.fn(() => Promise.resolve()),
  countCharactersPerUserMock: vi.fn<() => Promise<Record<string, number>>>(() =>
    Promise.resolve({})
  ),
  listCampaignSummariesMock: vi.fn<() => Promise<AdminCampaignSummary[]>>(() =>
    Promise.resolve([])
  ),
  listBugReportsMock: vi.fn<() => Promise<import("@/lib/firestore").AdminBugReport[]>>(
    () => Promise.resolve([])
  ),
  purgeBugReportsMock: vi.fn<
    (
      reports: ReadonlyArray<{ id: string; screenshotPath: string | null }>
    ) => Promise<number>
  >(() => Promise.resolve(0)),
  getClosedIssueNumbersMock: vi.fn<() => Promise<ReadonlySet<number> | null>>(() =>
    Promise.resolve(new Set<number>())
  ),
}));

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return { ...actual, useNavigate: () => navigateMock };
});
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/firestore", () => ({
  listAllUsers: listAllUsersMock,
  setUserStatus: setUserStatusMock,
  countCharactersPerUser: countCharactersPerUserMock,
  listCampaignSummaries: listCampaignSummariesMock,
  listBugReports: listBugReportsMock,
  purgeBugReports: purgeBugReportsMock,
}));
vi.mock("@/lib/github-issue-state", () => ({
  getClosedIssueNumbers: getClosedIssueNumbersMock,
}));
vi.mock("@/hooks/useIsAdmin", () => ({ useIsAdmin: () => isAdminState.value }));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ user: authState.user }),
}));

import { AdminPage } from "@/features/account/AdminPage";

/** Three users: the current admin (own row), an active user, a blocked user. */
function seedUsers() {
  return [
    {
      uid: "admin-uid",
      email: "admin@example.com",
      displayName: "Admin",
      status: "active" as const,
      role: "admin" as const,
      createdAt: new Date("2024-01-01"),
      lastActiveAt: new Date("2024-06-01"),
    },
    {
      uid: "u2",
      email: "bob@example.com",
      displayName: "Bob",
      status: "active" as const,
      role: null,
      createdAt: new Date("2024-02-01"),
      lastActiveAt: new Date("2024-06-01"),
    },
    {
      uid: "u3",
      email: "eve@example.com",
      displayName: "Eve",
      status: "blocked" as const,
      role: null,
      createdAt: new Date("2024-03-01"),
      lastActiveAt: null,
    },
  ];
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  navigateMock.mockReset();
  setUserStatusMock.mockReset().mockResolvedValue(undefined);
  // Per-user metrics: Bob (u2) has 5 characters and plays both campaigns (DMing one);
  // the admin DMs one; Eve (u3) has none but is a member of one.
  countCharactersPerUserMock
    .mockReset()
    .mockResolvedValue({ "admin-uid": 3, u2: 5, u3: 0 });
  listCampaignSummariesMock.mockReset().mockResolvedValue([
    { id: "c1", dmUid: "admin-uid", members: ["admin-uid", "u2"], status: "active" },
    { id: "c2", dmUid: "u2", members: ["u2", "u3"], status: "active" },
  ]);
  listAllUsersMock.mockReset().mockResolvedValue(seedUsers());
  listBugReportsMock.mockReset().mockResolvedValue([]);
  getClosedIssueNumbersMock.mockReset().mockResolvedValue(new Set<number>());
  isAdminState.value = true;
  authState.user = { uid: "admin-uid", email: "admin@example.com" };
});

/** Three reports: an OPEN issue (#10), a CLOSED issue (#11), a STRANDED error (no issue). */
function seedReports(): import("@/lib/firestore").AdminBugReport[] {
  return [
    {
      id: "r-open",
      type: "bug",
      title: "Open report",
      description: "The tracker desyncs after resting.",
      status: "opened",
      severity: "high",
      screen: "sheet",
      reporterUid: "u2",
      locale: "en",
      debugContext: {
        pathname: "/characters/c1",
        appVersion: "0.21.0",
        recentErrors: ["TypeError: boom"],
      },
      screenshotUrl: "https://storage.example/shot.png",
      screenshotPath: "bug-reports/u2/r-open.png",
      issueUrl: "https://github.com/x/y/issues/10",
      issueNumber: 10,
      createdAt: new Date("2024-06-03"),
    },
    {
      id: "r-closed",
      type: "bug",
      title: "Closed report",
      description: "",
      status: "opened",
      severity: "low",
      screen: "sheet",
      reporterUid: "u2",
      locale: "en",
      debugContext: null,
      screenshotUrl: null,
      screenshotPath: "bug-reports/u2/r-closed.png",
      issueUrl: "https://github.com/x/y/issues/11",
      issueNumber: 11,
      createdAt: new Date("2024-06-02"),
    },
    {
      id: "r-stranded",
      type: "feature",
      title: "Stranded report",
      description: "",
      status: "error",
      severity: "medium",
      screen: "roster",
      reporterUid: "u3",
      locale: "it",
      debugContext: null,
      screenshotUrl: null,
      screenshotPath: null,
      issueUrl: null,
      issueNumber: null,
      createdAt: new Date("2024-06-01"),
    },
  ];
}

describe("AdminPage", () => {
  it("shows the folio access-denied screen for a signed-in non-admin", () => {
    isAdminState.value = false;
    renderPage();
    expect(
      screen.getByRole("heading", { name: /admin access required/i })
    ).toBeInTheDocument();
    // Never loads the user list when the gate is closed.
    expect(listAllUsersMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: /^users$/i })).not.toBeInTheDocument();
  });

  it("the access-denied 'Back to Home' returns to the roster", () => {
    isAdminState.value = false;
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /back to home/i }));
    expect(navigateMock).toHaveBeenCalledWith("/");
  });

  it("renders the stats + user list for an admin", async () => {
    renderPage();
    expect(screen.getByRole("heading", { name: /admin panel/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /overview/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^users$/i })).toBeInTheDocument();
    // The list resolves from the mocked io.
    expect(await screen.findByText("bob@example.com")).toBeInTheDocument();
    expect(screen.getByText("eve@example.com")).toBeInTheDocument();
  });

  it("shows each user's per-user metrics (characters · campaigns · DM)", async () => {
    renderPage();
    // Bob (u2): 5 characters, member of both campaigns, DMs one. The aria-labels
    // carry the full reading; the visible chips are abbreviated.
    expect(await screen.findByLabelText("Characters: 5")).toBeInTheDocument();
    expect(screen.getByLabelText("Campaigns: 2")).toBeInTheDocument();
    // Two DMs in the fixture (the admin and Bob); Eve DMs none, so no DM chip there.
    expect(screen.getAllByLabelText(/dungeon master of 1/i)).toHaveLength(2);
    // Eve (u3): no characters → a zero chip (derived, not hidden).
    expect(screen.getByLabelText("Characters: 0")).toBeInTheDocument();
  });

  it("badges a data-driven admin (role: 'admin') with the ADMIN tag", async () => {
    renderPage();
    await screen.findByText("admin@example.com");
    // Exact "ADMIN" matches the tag text, not the "Admin" displayName.
    expect(screen.getByText("ADMIN")).toBeInTheDocument();
  });

  it("blocks an active user only through the shared confirm (deliberate god-mode)", async () => {
    renderPage();
    await screen.findByText("bob@example.com");
    // Only Bob has a Block control (admin's own row is protected, Eve is blocked).
    expect(screen.getAllByRole("button", { name: /^block$/i })).toHaveLength(1);

    // Dismissing the confirm never blocks.
    fireEvent.click(screen.getByRole("button", { name: /^block$/i }));
    await waitFor(() => expect(useConfirmStore.getState().open).toBe(true));
    act(() => useConfirmStore.getState().respond(false));
    expect(setUserStatusMock).not.toHaveBeenCalled();

    // Confirming performs the block.
    fireEvent.click(screen.getByRole("button", { name: /^block$/i }));
    await waitFor(() => expect(useConfirmStore.getState().open).toBe(true));
    act(() => useConfirmStore.getState().respond(true));
    await waitFor(() => expect(setUserStatusMock).toHaveBeenCalledWith("u2", "blocked"));
  });

  it("unblocks a blocked user via setUserStatus(uid, 'active')", async () => {
    renderPage();
    await screen.findByText("eve@example.com");
    fireEvent.click(screen.getByRole("button", { name: /^unblock$/i }));
    await waitFor(() => expect(setUserStatusMock).toHaveBeenCalledWith("u3", "active"));
  });

  it("never offers a block control against the current admin's own row", async () => {
    renderPage();
    await screen.findByText("admin@example.com");
    // Three users, but only the two non-self rows expose a Block/Unblock control.
    const controls = screen.getAllByRole("button", { name: /^(block|unblock)$/i });
    expect(controls).toHaveLength(2);
    // The self-row carries the "You" tag instead.
    expect(screen.getByText(/^you$/i)).toBeInTheDocument();
  });
});

describe("AdminPage — bug inbox mirrors the open GitHub issues", () => {
  beforeEach(() => {
    purgeBugReportsMock.mockReset().mockResolvedValue(1);
    listBugReportsMock.mockResolvedValue(seedReports());
  });

  it("hides a CLOSED-issue report and cascade-purges it; keeps open + stranded ones", async () => {
    // GitHub reports issue #11 as closed.
    getClosedIssueNumbersMock.mockResolvedValue(new Set<number>([11]));
    renderPage();
    // The open report and the stranded (never-issued) report render…
    expect(await screen.findByText("Open report")).toBeInTheDocument();
    expect(screen.getByText("Stranded report")).toBeInTheDocument();
    // …but the closed one does not render at all (owner ruling).
    expect(screen.queryByText("Closed report")).not.toBeInTheDocument();
    // No "status unavailable" note when GitHub answered.
    expect(screen.queryByText(/showing all reports/i)).not.toBeInTheDocument();
    // The spent report is purged — screenshot + doc — and ONLY that one.
    await waitFor(() => expect(purgeBugReportsMock).toHaveBeenCalledTimes(1));
    const purged = purgeBugReportsMock.mock.calls[0]?.[0] ?? [];
    expect(purged.map((r) => r.id)).toEqual(["r-closed"]);
  });

  it("when GitHub state is unavailable, shows ALL reports behind a quiet note and purges NOTHING", async () => {
    // Offline / rate-limit → closure unknown.
    getClosedIssueNumbersMock.mockResolvedValue(null);
    renderPage();
    expect(await screen.findByText("Open report")).toBeInTheDocument();
    // Nothing is hidden or deleted when closure can't be confirmed.
    expect(screen.getByText("Closed report")).toBeInTheDocument();
    expect(screen.getByText("Stranded report")).toBeInTheDocument();
    expect(screen.getByText(/showing all reports/i)).toBeInTheDocument();
    expect(purgeBugReportsMock).not.toHaveBeenCalled();
  });

  it("expands a row into the private detail: description, reporter, context, screenshot", async () => {
    getClosedIssueNumbersMock.mockResolvedValue(new Set<number>([11]));
    renderPage();
    await screen.findByText("Open report");
    // Nothing private renders until the row is expanded (progressive disclosure).
    expect(screen.queryByText(/desyncs after resting/i)).not.toBeInTheDocument();

    // Two rendered rows (open + stranded), each with a Details toggle; the rows
    // sort stranded-first, so the OPEN report's toggle is the second one.
    const [, openToggle] = screen.getAllByRole("button", { name: /details/i });
    if (!openToggle) throw new Error("expected a Details toggle on the open report");
    fireEvent.click(openToggle);
    // Description + reporter identity (resolved to the user's email) + context.
    expect(await screen.findByText(/desyncs after resting/i)).toBeInTheDocument();
    // Bob's email appears in his user row AND (now) as the report's reporter line.
    expect(screen.getAllByText("bob@example.com").length).toBeGreaterThan(1);
    expect(screen.getByText(/TypeError: boom/)).toBeInTheDocument();
    // The screenshot renders inline, CORS-enabled (the opaque-cache lesson).
    const img = screen.getByRole("img", { name: /screenshot/i });
    expect(img).toHaveAttribute("src", "https://storage.example/shot.png");
    expect(img).toHaveAttribute("crossorigin", "anonymous");
    // A failed image load surfaces the explicit unavailable state, never a blank.
    fireEvent.error(img);
    expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument();
  });
});
