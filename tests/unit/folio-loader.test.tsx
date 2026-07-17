/**
 * FolioLoader — the unified gilt-d20 loading idiom. Pins the delay behaviour (the DIE
 * shows nothing for the warm/sub-second case → no flash), the settling-marker contract
 * (the WRAPPER mounts immediately — the shell's `:has(.folio-loader)` footer rule
 * reads it to keep the SiteFooter out of the frame while content composes), and the
 * a11y contract (role=status + a localized label). The canvas itself no-ops in jsdom
 * (no 2D context); the 3D draw is covered by d20-icosahedron.test.ts.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render } from "@testing-library/react";
import { FolioLoader } from "@/components/shared/FolioLoader";

beforeEach(() => {
  vi.useFakeTimers();
  // jsdom has no canvas 2D context; the spinner gracefully no-ops when it's null.
  // Stub it so the suite output stays clean (and we exercise the no-context path).
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("FolioLoader", () => {
  it("mounts the settling-marker wrapper immediately, but no die before the delay (no fast-load flash)", () => {
    const { container } = render(<FolioLoader variant="region" delay={250} />);
    // The wrapper is there from the first frame — it reserves the region height
    // and keeps the shell footer hidden while the page composes…
    const el = container.querySelector(".folio-loader");
    expect(el).not.toBeNull();
    expect(el?.getAttribute("role")).toBe("status");
    // …but the die waits out the delay, so a warm load still flashes nothing.
    expect(container.querySelector("canvas.d20-loader")).toBeNull();
    act(() => void vi.advanceTimersByTime(120));
    expect(container.querySelector("canvas.d20-loader")).toBeNull();
    act(() => void vi.advanceTimersByTime(200));
    expect(container.querySelector("canvas.d20-loader")).not.toBeNull();
  });

  it("delay=0 shows the die immediately (auth bootstrap — continues the boot splash)", () => {
    const { container } = render(<FolioLoader variant="fullscreen" delay={0} />);
    const el = container.querySelector(".folio-loader.fl-fullscreen");
    expect(el).not.toBeNull();
    expect(el?.getAttribute("role")).toBe("status");
    expect(container.querySelector("canvas.d20-loader")).not.toBeNull();
  });

  it("carries an accessible label", () => {
    const { container, getByText } = render(
      <FolioLoader delay={0} label="Joining campaign…" />
    );
    expect(container.querySelector(".folio-loader")).not.toBeNull();
    expect(getByText("Joining campaign…")).toBeInTheDocument();
  });

  it("clears its delay timer on unmount (no late die, no leak)", () => {
    const { container, unmount } = render(<FolioLoader delay={250} />);
    unmount();
    act(() => void vi.advanceTimersByTime(400));
    expect(container.querySelector(".folio-loader")).toBeNull();
  });
});

describe("the settling-footer contract (nav-feel — no mid-load footer jump)", () => {
  // jsdom cannot evaluate `:has()`, so pin the SOURCE invariant: while any
  // FolioLoader is mounted the shell must keep the SiteFooter out of the frame.
  // Without this rule a cold load pins the footer to the viewport bottom under
  // the tumbling die, then the arriving content shoves it off (CLS ≈ 0.08 on a
  // deep-linked sheet).
  const here = dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(resolve(here, "../../src/styles/folio.css"), "utf8");

  it("folio.css hides .site-footer while a .folio-loader is mounted", () => {
    const rule = css.match(
      /\.app-canvas:has\(\.folio-loader\)\s+\.site-footer\s*\{([^}]*)\}/
    );
    expect(rule, "the :has(.folio-loader) footer rule must exist").not.toBeNull();
    expect(rule?.[1]).toMatch(/visibility:\s*hidden/);
  });
});
