/**
 * useDocumentTitle (D5) — the per-route browser tab title. Pins the contract:
 * a title becomes `"<title> · d20 Folio"`, an empty/absent title falls back to
 * the bare brand, and the title re-runs when the passed value changes (so a
 * locale switch that changes `t(...)` output re-titles the tab).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

afterEach(cleanup);

function Harness({ title }: { title?: string }) {
  useDocumentTitle(title);
  return null;
}

describe("useDocumentTitle", () => {
  it("suffixes a title with the brand", () => {
    render(<Harness title="Settings" />);
    expect(document.title).toBe("Settings · d20 Folio");
  });

  it("falls back to the bare brand when no title is given", () => {
    render(<Harness />);
    expect(document.title).toBe("d20 Folio");
  });

  it("falls back to the bare brand for an empty string", () => {
    render(<Harness title="" />);
    expect(document.title).toBe("d20 Folio");
  });

  it("updates when the title changes (locale switch)", () => {
    const { rerender } = render(<Harness title="Settings" />);
    expect(document.title).toBe("Settings · d20 Folio");
    rerender(<Harness title="Impostazioni" />);
    expect(document.title).toBe("Impostazioni · d20 Folio");
  });
});
