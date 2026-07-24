/**
 * SituationalRules — the Play-tab "Rules reference" surface that MOUNTS the four
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

beforeEach(() => {
  // Both foot blocks default collapsed (a missing key = closed).
  useUIStore.setState({ playRefSections: {} });
});
afterEach(async () => {
  await i18n.changeLanguage("en");
});

describe("SituationalRules — Play-tab rules-reference surface", () => {
  it("renders all four topics with EN content + EN (feet/miles) travel units", async () => {
    await i18n.changeLanguage("en");
    const { container } = render(<SituationalRules />);
    const text = container.textContent;
    expect(text).toContain("Rules reference");
    // Cover — the retrofit that closes the data-only drift (was never rendered).
    expect(text).toContain("Half Cover");
    // Mounted + Underwater (RA-30), incl. the 2024 Piercing fact.
    expect(text).toContain("Mounted combat");
    expect(text).toContain("Underwater combat");
    expect(text).toContain("Piercing");
    // Travel pace (RA-29) with EN units through localeDistance + localeMiles.
    expect(text).toContain("400 ft per minute");
    expect(text).toContain("30 mi per day");
  });

  it("localizes every topic and travel-pace distances into Italian (D3 metric)", async () => {
    await i18n.changeLanguage("it");
    const { container } = render(<SituationalRules />);
    const text = container.textContent;
    expect(text).toContain("Regole di riferimento");
    expect(text).toContain("Copertura Parziale");
    expect(text).toContain("Combattimento in sella");
    expect(text).toContain("Combattimento subacqueo");
    // 400 ft → 120 m, 30 mi → 48 km via the D3 helpers.
    expect(text).toContain("120 m al minuto");
    expect(text).toContain("48 km al giorno");
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
