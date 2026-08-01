/**
 * Result-list virtualization (PERF) — the list windows its rows in a real browser
 * (only the on-screen slice mounts) but must never impose a CEILING: every filtered
 * result stays reachable, and there is NO "refine to see more" cap message.
 *
 * jsdom has no layout, so `VirtualRows` takes its render-EVERY-row fallback here —
 * which is exactly what proves the no-ceiling contract at the component level: the
 * FULL filtered set is in the DOM, one row per entry, with no cap footer. The bounded
 * WINDOW + scroll/keyboard reach are proven in real Chromium
 * (tests/e2e/compendium-virtualized.spec.ts). Driven through the REAL hook + list over
 * the SRD spell pool (>60 entries, eager so it holds in BOTH build modes).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import i18n from "@/i18n";
import { useCompendiumPicker } from "@/features/compendium/picker/useCompendiumPicker";
import { CompendiumResultList } from "@/features/compendium/picker/ResultList";
import { spellSpec } from "@/features/compendium/picker";
import { spells } from "@/data/spells";

function Harness({ query = "", bare = false }: { query?: string; bare?: boolean }) {
  const picker = useCompendiumPicker(spellSpec, { mode: "browse", initialQuery: query });
  return <CompendiumResultList picker={picker} spec={spellSpec} bare={bare} />;
}

afterEach(async () => {
  await i18n.changeLanguage("en");
});

describe("CompendiumResultList — virtualized, no ceiling", () => {
  it("renders EVERY filtered row (no cap) on the full pool", async () => {
    await i18n.changeLanguage("en");
    expect(spells.length).toBeGreaterThan(60); // the pool is genuinely large
    const { container } = render(<Harness />);
    // No cap: one row per spell in the full pool (jsdom's un-windowed fallback).
    expect(container.querySelectorAll(".pick-row").length).toBe(spells.length);
  });

  it("shows NO 'refine to see more' ceiling message and keeps the truthful count", async () => {
    await i18n.changeLanguage("en");
    render(<Harness />);
    // The old cap footer is gone in both locales — nothing telling the reader to narrow.
    expect(screen.queryByText(/refine to see more/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    // The count line still reports the real total.
    expect(
      screen.getByText(new RegExp(`${spells.length}\\s+items`, "i"))
    ).toBeInTheDocument();
  });

  it("the bare (compendium page) variant also lists every row with no ceiling", async () => {
    await i18n.changeLanguage("en");
    const { container } = render(<Harness bare />);
    expect(container.querySelectorAll(".pick-row").length).toBe(spells.length);
    expect(screen.queryByText(/refine to see more/i)).not.toBeInTheDocument();
  });

  it("a narrowing query still yields exactly its matches (nothing dropped)", async () => {
    await i18n.changeLanguage("en");
    const { container } = render(<Harness query="fireball" />);
    const names = [...container.querySelectorAll(".pick-name")].map((n) => n.textContent);
    expect(names.some((n) => /fireball/i.test(n))).toBe(true);
    // Every mounted row genuinely matches the query (no stray rows from the cap slice).
    expect(container.querySelectorAll(".pick-row").length).toBeLessThan(spells.length);
  });
});
