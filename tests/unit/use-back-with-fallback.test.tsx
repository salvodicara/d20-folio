/**
 * useBackWithFallback (D4) — the canonical Back for a many-parents leaf. Pins the
 * two history branches: with history it steps back (`navigate(-1)`); on a fresh-tab
 * deep link (no prior entry) it lands on the fallback.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";

const navigateMock = vi.hoisted(() => vi.fn());
vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return { ...actual, useNavigate: () => navigateMock };
});

import { useBackWithFallback } from "@/hooks/useBackWithFallback";

function Harness({ fallback }: { fallback: string }) {
  const goBack = useBackWithFallback(fallback);
  return (
    <button type="button" onClick={goBack}>
      back
    </button>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeEach(() => navigateMock.mockReset());

describe("useBackWithFallback", () => {
  it("steps back through history when there IS history", () => {
    vi.stubGlobal("history", { length: 3 });
    const { getByRole } = render(<Harness fallback="/" />);
    fireEvent.click(getByRole("button"));
    expect(navigateMock).toHaveBeenCalledWith(-1);
  });

  it("falls back on a fresh-tab deep link (no prior entry)", () => {
    vi.stubGlobal("history", { length: 1 });
    const { getByRole } = render(<Harness fallback="/" />);
    fireEvent.click(getByRole("button"));
    expect(navigateMock).toHaveBeenCalledWith("/");
  });
});
