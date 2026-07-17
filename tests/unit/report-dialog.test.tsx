/**
 * ReportDialog — the in-app bug/feature reporter (OWN-37).
 *
 * Exercises the on-rails form: open via the global `reportOpen` flag, the screen
 * auto-detection, the required-title guard, a successful submit (mocked IO), the
 * "opened as #NN" upgrade, the screenshot keep/remove toggle, and the error path.
 * Firebase is mocked (the dialog transitively imports report-io → firebase), and
 * the IO layer + screenshot orchestrator are stubbed so no network runs.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { submitMock, subscribeMock, takeShotMock, takePrefillMock } = vi.hoisted(() => ({
  submitMock: vi.fn(),
  subscribeMock: vi.fn(),
  takeShotMock: vi.fn(),
  takePrefillMock: vi.fn(),
}));

// The dialog imports report-io which imports @/lib/firebase — mock it so CI (no
// VITE_FIREBASE_API_KEY) doesn't crash at module load (pure-modules guard).
vi.mock("@/lib/firebase", () => ({}));
vi.mock("@/features/report/report-io", () => ({
  submitReport: submitMock,
  subscribeToReport: subscribeMock,
}));
vi.mock("@/features/report/open-report", () => ({
  takePendingScreenshot: takeShotMock,
  takePendingPrefill: takePrefillMock,
}));

import { ReportDialog } from "@/features/report/ReportDialog";
import { useUIStore } from "@/stores/uiStore";
import { useAuthStore } from "@/stores/authStore";
import type { User } from "firebase/auth";

// The dialog is router-free (mounted at the app root, outside the router, so the
// crash screens can open it) — it reads `window.location.pathname` once on open.
function openDialog(path = "/characters/abc123") {
  window.history.pushState({}, "", path);
  useUIStore.setState({ reportOpen: true });
  useAuthStore.setState({ user: { uid: "u-1" } as User });
  return render(<ReportDialog />);
}

describe("ReportDialog", () => {
  beforeEach(() => {
    submitMock.mockReset();
    subscribeMock.mockReset();
    takeShotMock.mockReset();
    takePrefillMock.mockReset();
    subscribeMock.mockReturnValue(() => undefined);
    takeShotMock.mockReturnValue(null);
    takePrefillMock.mockReturnValue(null);
    useUIStore.setState({ reportOpen: false });
    useAuthStore.setState({ user: null });
    window.history.pushState({}, "", "/");
  });

  it("does not render when closed", () => {
    useUIStore.setState({ reportOpen: false });
    render(<ReportDialog />);
    expect(screen.queryByText("Report a bug or suggest an idea")).toBeNull();
  });

  it("renders the on-rails form when opened", () => {
    openDialog();
    expect(screen.getByText("Report a bug or suggest an idea")).toBeInTheDocument();
    // Type segmented control offers Bug + Idea.
    expect(screen.getByRole("button", { name: "Bug" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Idea" })).toBeInTheDocument();
    // Severity offers Low/Medium/High.
    expect(screen.getByRole("button", { name: "High" })).toBeInTheDocument();
  });

  it("auto-detects the current screen as the default", () => {
    openDialog("/compendium?type=spell");
    expect(screen.getByLabelText("Where?")).toHaveValue("compendium");
  });

  it("blocks submit until a title is entered", () => {
    openDialog();
    const send = screen.getByRole("button", { name: "Send report" });
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Summary"), {
      target: { value: "DC is wrong" },
    });
    expect(send).toBeEnabled();
  });

  it("flags the required Summary only after it is touched, not on open", () => {
    openDialog();
    const summary = screen.getByLabelText("Summary");
    // Pristine on open: shows its help, NOT the required error, and is not flagged
    // invalid (the disabled Send button is the affordance while it's empty).
    expect(screen.getByText("One line: what's the gist?")).toBeInTheDocument();
    expect(summary).not.toHaveAttribute("aria-invalid", "true");
    // Leaving the empty field surfaces the required error.
    fireEvent.blur(summary);
    expect(
      screen.getByText("Add a short summary so we can find it.")
    ).toBeInTheDocument();
    expect(summary).toHaveAttribute("aria-invalid", "true");
    // Typing clears it again.
    fireEvent.change(summary, { target: { value: "DC is wrong" } });
    expect(summary).not.toHaveAttribute("aria-invalid", "true");
  });

  it("submits the report and shows the sent state, then the issue number", async () => {
    submitMock.mockResolvedValue({ reportId: "r-1" });
    // Capture the write-back callback so we can simulate the function's update. A
    // holder object (vs. a bare `let`) keeps TS from narrowing it to `null`.
    type ProgressCb = (p: { issueNumber?: number; issueUrl?: string }) => void;
    const held: { cb: ProgressCb | null } = { cb: null };
    subscribeMock.mockImplementation((_id: string, cb: ProgressCb) => {
      held.cb = cb;
      return () => undefined;
    });

    openDialog();
    fireEvent.change(screen.getByLabelText("Summary"), {
      target: { value: "DC is wrong" },
    });
    fireEvent.change(screen.getByLabelText("Details"), {
      target: { value: "Steps: open sheet" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send report" }));

    await waitFor(() => expect(screen.getByText("Thank you!")).toBeInTheDocument());
    expect(submitMock).toHaveBeenCalledOnce();
    const call = submitMock.mock.calls[0] as [{ title: string }, string, string, unknown];
    expect(call[0].title).toBe("DC is wrong");
    expect(call[1]).toBe("u-1");

    // Simulate the Cloud Function writing the issue number back.
    expect(held.cb).not.toBeNull();
    held.cb?.({ issueNumber: 42, issueUrl: "https://github.com/x/y/issues/42" });
    await waitFor(() =>
      expect(screen.getByText("Opened as issue #42.")).toBeInTheDocument()
    );
  });

  it("shows an error message when submit fails", async () => {
    submitMock.mockRejectedValue(new Error("network down"));
    openDialog();
    fireEvent.change(screen.getByLabelText("Summary"), {
      target: { value: "broken" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send report" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("network down")
    );
  });

  it("toggles the screenshot keep/remove affordance when one was captured", () => {
    takeShotMock.mockReturnValue({
      blob: new Blob(["x"], { type: "image/png" }),
      dataUrl: "data:image/png;base64,AAAA",
      width: 800,
      height: 600,
    });
    openDialog();
    // Thumbnail visible + a Remove button.
    expect(screen.getByAltText("Screenshot of your current screen")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    // Now offers to re-attach.
    expect(
      screen.getByRole("button", { name: "Attach screenshot again" })
    ).toBeInTheDocument();
  });

  it("reveals the debug-context disclosure on demand", () => {
    openDialog();
    expect(screen.queryByText("Browser")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "What we'll attach" }));
    expect(screen.getByText("Browser")).toBeInTheDocument();
  });

  it("initializes from a parked crash prefill and is immediately submittable", () => {
    // The crash-screen entry parks a prefill before flipping the flag; the form
    // claims it on mount so reporting a crash needs ZERO typing.
    takePrefillMock.mockReturnValue({
      type: "bug",
      severity: "high",
      title: "TypeError: boom",
      description: "/characters/abc123\nTypeError: boom\nat Boom (app.js:1:1)",
    });
    openDialog();
    expect(screen.getByLabelText("Summary")).toHaveValue("TypeError: boom");
    expect(screen.getByLabelText("Details")).toHaveValue(
      "/characters/abc123\nTypeError: boom\nat Boom (app.js:1:1)"
    );
    // Title prefilled → Send is enabled with no further input.
    expect(screen.getByRole("button", { name: "Send report" })).toBeEnabled();
    // Severity prefill landed on the segmented control.
    expect(screen.getByRole("button", { name: "High" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });
});
