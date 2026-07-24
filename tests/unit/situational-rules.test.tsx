/**
 * SituationalRules — the Play-tab "Rules Reference" surface that MOUNTS the four
 * pure-reference tables (Cover = M8, Mounted/Underwater = RA-30, Travel Pace =
 * RA-29) a player looks up at the table. This is the render wiring the tables
 * were authored for; it pins that all four topics render, both locales resolve,
 * and travel-pace distances localize through the D3 helpers (feet + miles).
 */
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import i18n from "@/i18n";
import { SituationalRules } from "@/features/character/center/tabs/SituationalRules";
import { useUIStore } from "@/stores/uiStore";
import enCombat from "@/i18n/en/ui/combat.json";
import itCombat from "@/i18n/it/ui/combat.json";
import enAlgorithm from "@/i18n/en/ui/algorithm.json";
import itAlgorithm from "@/i18n/it/ui/algorithm.json";

beforeEach(() => {
  // Both foot blocks default collapsed (a missing key = closed).
  useUIStore.setState({ playRefSections: {} });
});
afterEach(async () => {
  await i18n.changeLanguage("en");
});

// The folio's section headers are Title Case throughout ("Action Log", "Base
// Actions", "Potions & Gear", "Long Rest", "Combat Algorithm"): every word but the
// short function words is capitalized.
const MINOR_EN = new Set([
  "a",
  "an",
  "and",
  "at",
  "for",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "vs",
]);
const MINOR_IT = new Set([
  "a",
  "al",
  "che",
  "da",
  "dei",
  "del",
  "della",
  "delle",
  "di",
  "e",
  "il",
  "in",
  "la",
  "le",
  "lo",
  "o",
  "per",
  "un",
  "una",
]);
function isTitleCase(title: string, minor: ReadonlySet<string>): boolean {
  return title
    .split(/\s+/)
    .every((w, i) => i === 0 || minor.has(w.toLowerCase()) || /^[^\p{Ll}]/u.test(w));
}

// REGRESSION (post-sweep E) — the two Play-foot disclosure headers disagreed:
// "Combat Algorithm" (Title Case) sat next to "Rules Reference" (sentence case),
// and IT mirrored the mismatch. Both now follow the folio convention, both locales.
describe("Play-foot section headers share the folio's Title-Case convention", () => {
  it.each([
    ["en", enCombat.combat.rulesReference, enAlgorithm.algorithm.title, MINOR_EN],
    ["it", itCombat.combat.rulesReference, itAlgorithm.algorithm.title, MINOR_IT],
  ])("%s", (_locale, rules, algorithmTitle, minor) => {
    const headers = [
      rules.title,
      algorithmTitle,
      // The topic cards inside the panel are headers too — same convention.
      rules.cover,
      rules.mounted,
      rules.underwater,
      rules.travel,
    ];
    expect(headers.filter((h) => !isTitleCase(h, minor))).toEqual([]);
  });
});

describe("SituationalRules — Play-tab rules-reference surface", () => {
  it("renders all four topics with EN content + EN (feet/miles) travel units", async () => {
    await i18n.changeLanguage("en");
    const { container } = render(<SituationalRules />);
    const text = container.textContent;
    expect(text).toContain("Rules Reference");
    // Cover — the retrofit that closes the data-only drift (was never rendered).
    expect(text).toContain("Half Cover");
    // Mounted + Underwater (RA-30), incl. the 2024 Piercing fact.
    expect(text).toContain("Mounted Combat");
    expect(text).toContain("Underwater Combat");
    expect(text).toContain("Piercing");
    // Travel pace (RA-29) with EN units through localeDistance + localeMiles.
    expect(text).toContain("400 ft per minute");
    expect(text).toContain("30 mi per day");
  });

  it("localizes every topic and travel-pace distances into Italian (D3 metric)", async () => {
    await i18n.changeLanguage("it");
    const { container } = render(<SituationalRules />);
    const text = container.textContent;
    expect(text).toContain("Regole di Riferimento");
    expect(text).toContain("Copertura Parziale");
    expect(text).toContain("Combattimento in Sella");
    expect(text).toContain("Combattimento Subacqueo");
    // 400 ft → 120 m, 30 mi → 48 km via the D3 helpers.
    expect(text).toContain("120 m al minuto");
    expect(text).toContain("48 km al giorno");
  });

  // REGRESSION (post-sweep D) — the 2x2 topic grid stretched every card to the
  // TALLEST card's height, so the short Cover card left a large empty hole in the
  // top-left cell. The cards are content-sized (`items-start`), never stretched.
  it("sizes each topic card to its own content (no stretched-cell dead space)", async () => {
    await i18n.changeLanguage("en");
    const { container } = render(<SituationalRules />);
    const grid = container.querySelector(".section-detail .grid");
    expect(grid).not.toBeNull();
    expect(grid?.className).toContain("items-start");
  });

  it("is collapsed by default — the header toggle reads unexpanded", async () => {
    await i18n.changeLanguage("en");
    const { container } = render(<SituationalRules />);
    const toggle = screen.getByRole("button", { name: /show rules reference/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(container.querySelector(".section-detail-wrap")).not.toHaveAttribute(
      "data-open"
    );
  });

  it("blooms the whole body in place when the header is clicked", async () => {
    await i18n.changeLanguage("en");
    const { container } = render(<SituationalRules />);
    fireEvent.click(screen.getByRole("button", { name: /show rules reference/i }));
    const toggle = screen.getByRole("button", { name: /hide rules reference/i });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(container.querySelector(".section-detail-wrap")).toHaveAttribute("data-open");
  });
});
