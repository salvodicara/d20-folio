/**
 * Result-list cap (PERF) — the shared picker list mounts at most `RESULT_CAP` rows
 * on a large pool, with a truthful "refine to see more" footer carrying the FULL
 * total. This is a rendering-cost fix: it must NEVER lie about how many entries
 * exist, must keep the real count, and must localize the footer (EN + IT).
 *
 * Driven through the REAL hook + list over the SRD spell pool (>60 entries, eager
 * so it holds in BOTH build modes), so a regression in the cap wiring fails here.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import i18n from "@/i18n";
import { useCompendiumPicker } from "@/features/compendium/picker/useCompendiumPicker";
import { CompendiumResultList } from "@/features/compendium/picker/ResultList";
import { spellSpec } from "@/features/compendium/picker";
import { spells } from "@/data/spells";

const CAP = 60;

function Harness({ query = "" }: { query?: string }) {
  const picker = useCompendiumPicker(spellSpec, { mode: "browse", initialQuery: query });
  return <CompendiumResultList picker={picker} spec={spellSpec} />;
}

afterEach(async () => {
  await i18n.changeLanguage("en");
});

describe("CompendiumResultList — result cap", () => {
  it("mounts at most CAP rows on the full (over-cap) pool", async () => {
    await i18n.changeLanguage("en");
    expect(spells.length).toBeGreaterThan(CAP); // guard the fixture is actually large
    const { container } = render(<Harness />);
    expect(container.querySelectorAll(".pick-row").length).toBe(CAP);
  });

  it("keeps the truthful FULL count and shows the refine footer with the total", async () => {
    await i18n.changeLanguage("en");
    render(<Harness />);
    // The count line reflects the full pool, not the capped 60…
    expect(
      screen.getByText(new RegExp(`${spells.length}\\s+items`, "i"))
    ).toBeInTheDocument();
    // …and the footer names the total explicitly, so nothing is hidden silently.
    const footer = screen.getByRole("status");
    expect(footer.textContent).toMatch(/refine to see more/i);
    expect(footer.textContent).toContain(String(spells.length));
  });

  it("localizes the footer in Italian", async () => {
    await i18n.changeLanguage("it");
    render(<Harness />);
    const footer = screen.getByRole("status");
    expect(footer.textContent).toMatch(/affina/i);
    expect(footer.textContent).toContain(String(spells.length));
  });

  it("no cap footer when the result set fits under the cap", async () => {
    await i18n.changeLanguage("en");
    // A specific query trims the pool well under 60.
    render(<Harness query="fireball" />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button").length).toBeLessThan(CAP);
  });
});
