/**
 * #1320 — the blocking «a new version is needed» screen. It shows only once the shape
 * gate is closed, says honestly what happened to the unsaved edits, has no way to
 * dismiss it, and never reloads on its own. A reload that still finds the sheet newer
 * than the app says «not ready yet» instead of looping.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ShapeGateScreen } from "@/app/ShapeGateScreen";
import {
  closeShapeGate,
  resetShapeGateForTests,
  settleShapeGateRescue,
} from "@/lib/shape-gate";

const reload = vi.fn();

beforeEach(() => {
  resetShapeGateForTests();
  sessionStorage.clear();
  reload.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("the shape gate screen", () => {
  it("is not there while the gate is open", () => {
    render(<ShapeGateScreen reload={reload} />);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("with no unsaved edits: asks for a reload, with no close button", () => {
    render(<ShapeGateScreen reload={reload} />);
    act(() => closeShapeGate({ rescue: "none" }));
    const dialog = screen.getByRole("alertdialog", { name: /new version/i });
    expect(dialog).toHaveTextContent(/reload to keep playing/i);
    expect(screen.queryByRole("button", { name: /close/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^reload$/i }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("while the copy is written, the reload waits", () => {
    render(<ShapeGateScreen reload={reload} />);
    act(() => closeShapeGate({ rescue: "saving" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      /keeping your unsaved changes/i
    );
    expect(screen.getByRole("button", { name: /^reload$/i })).toBeDisabled();
  });

  it("a kept copy says so, and offers the reload", () => {
    render(<ShapeGateScreen reload={reload} />);
    act(() => {
      closeShapeGate({ rescue: "saving" });
      settleShapeGateRescue("kept");
    });
    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      /kept on this device.*apply them/i
    );
    expect(screen.getByRole("button", { name: /^reload$/i })).toBeEnabled();
  });

  it("a copy that could NOT be kept says so plainly and never reloads by itself", () => {
    vi.useFakeTimers();
    render(<ShapeGateScreen reload={reload} />);
    act(() => {
      closeShapeGate({ rescue: "saving" });
      settleShapeGateRescue("failed");
    });
    expect(screen.getByRole("alertdialog")).toHaveTextContent(/could not be kept/i);
    act(() => {
      vi.advanceTimersByTime(60 * 60 * 1000);
    });
    expect(reload).not.toHaveBeenCalled();
  });

  it("a reload that still finds a newer sheet says «not ready yet», not the same loop", () => {
    sessionStorage.setItem("folio.shapeReloadAt", String(Date.now()));
    render(<ShapeGateScreen reload={reload} />);
    act(() => closeShapeGate({ rescue: "none" }));
    expect(
      screen.getByRole("alertdialog", { name: /isn.t ready yet/i })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("the reload marks itself, so the next pass can tell", () => {
    render(<ShapeGateScreen reload={reload} />);
    act(() => closeShapeGate({ rescue: "none" }));
    fireEvent.click(screen.getByRole("button", { name: /^reload$/i }));
    expect(sessionStorage.getItem("folio.shapeReloadAt")).not.toBeNull();
  });
});
