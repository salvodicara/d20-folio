import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReportPrefill } from "@/features/report/types";

const { openReportMock } = vi.hoisted(() => ({ openReportMock: vi.fn() }));

// The crash entry routes through the shared open-report seam (uiStore +
// html2canvas); mock it so this test stays pure and we can assert the prefill.
vi.mock("@/features/report/open-report", () => ({
  openReport: openReportMock,
}));

import { ErrorBoundary, SectionErrorFallback } from "@/components/shared/ErrorBoundary";

function Boom(): ReactNode {
  throw new Error("boom-xyz");
}

beforeEach(() => {
  openReportMock.mockReset();
});

describe("ErrorBoundary", () => {
  it("renders children when nothing throws", () => {
    render(
      <ErrorBoundary>
        <div>safe content</div>
      </ErrorBoundary>
    );
    expect(screen.getByText("safe content")).toBeInTheDocument();
  });

  it("renders an alert fallback and surfaces the error message when a child throws", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/boom-xyz/)).toBeInTheDocument();
    spy.mockRestore();
  });

  it("offers 'Report this problem', opening the reporter PRE-FILLED with the crash", () => {
    // The moment of failure is the moment of intent: the fallback's report entry
    // must produce an actionable report with zero typing — bug · high · the error
    // headline as title + description. The crash ROUTE is deliberately absent:
    // the prefill publishes verbatim to the PUBLIC issue and routes carry
    // character/campaign ids — admins read the route privately via debugContext.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    window.history.pushState({}, "", "/characters/abc123");
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    fireEvent.click(screen.getByRole("button", { name: /report this problem/i }));
    expect(openReportMock).toHaveBeenCalledTimes(1);
    const [prefill] = openReportMock.mock.calls[0] as [ReportPrefill];
    expect(prefill.type).toBe("bug");
    expect(prefill.severity).toBe("high");
    expect(prefill.title).toContain("boom-xyz");
    expect(prefill.description).toContain("boom-xyz");
    expect(prefill.description).not.toContain("/characters/abc123");
    spy.mockRestore();
  });
});

describe("ErrorBoundary — per-section fault isolation (Layer 4)", () => {
  it("a custom `fallback` REPLACES the full fallback (compact section notice)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary
        fallback={(error, reset) => (
          <SectionErrorFallback error={error} onReset={reset} />
        )}
      >
        <Boom />
      </ErrorBoundary>
    );
    // The compact section notice rendered (its alert + the section message)…
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/this section couldn.t be shown/i)).toBeInTheDocument();
    // …and NOT the big full-screen title (that's the whole-surface fallback).
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
    spy.mockRestore();
  });

  it("ISOLATES one failed section — siblings keep rendering (no whole-surface wipe)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    // Two sibling sections; only the first throws. The surface degrades that one
    // section to its notice while the OTHER section renders normally.
    render(
      <div>
        <ErrorBoundary
          fallback={(error, reset) => (
            <SectionErrorFallback error={error} onReset={reset} />
          )}
        >
          <Boom />
        </ErrorBoundary>
        <ErrorBoundary
          fallback={(error, reset) => (
            <SectionErrorFallback error={error} onReset={reset} />
          )}
        >
          <div>healthy section</div>
        </ErrorBoundary>
      </div>
    );
    expect(screen.getByText(/this section couldn.t be shown/i)).toBeInTheDocument();
    expect(screen.getByText("healthy section")).toBeInTheDocument();
    spy.mockRestore();
  });
});
