/**
 * SavesChecksPanel — the in-combat "Saves & Checks" read-out (workstream B).
 *
 * Two guards:
 *  (b) the panel shows the DEX save number + its on-demand breakdown disclosure,
 *      and surfaces the crimson auto-fail mark under Paralyzed;
 *  (c) rule-21 — the panel is HONEST: it shows ONLY modifiers + breakdowns. There
 *      is NO roll button, NO d20, NO DC field, NO target/enemy, NO RNG affordance.
 *      The player rolls their own die.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import i18n from "@/i18n";
// The panel reads the character store only; no Firebase. Mock it defensively so
// no transitive import touches the (unset-in-CI) env keys.
vi.mock("@/lib/firebase", () => ({}));
import { SavesChecksPanel } from "@/features/character/center/tabs/SavesChecksPanel";
import { useCharacterStore } from "@/stores/characterStore";
import { MOCK_CHARACTER } from "@/lib/mock";
import { deriveSavesAndChecks } from "@/lib/views/saves-checks-view";
import type { CharacterDoc } from "@/types/character";

function fmtMod(n: number): string {
  return n >= 0 ? `+${n}` : `−${Math.abs(n)}`;
}

function load(mutate: (doc: CharacterDoc) => void = () => {}): CharacterDoc {
  const doc = structuredClone(MOCK_CHARACTER);
  mutate(doc);
  useCharacterStore.setState({
    character: doc,
    loading: false,
    error: null,
    readonly: false,
  });
  return doc;
}

/** The <li> row whose label starts with `name`. */
function rowFor(container: HTMLElement, name: string): HTMLElement | undefined {
  return Array.from(container.querySelectorAll<HTMLElement>("li")).find((li) =>
    li.textContent.startsWith(name)
  );
}

describe("SavesChecksPanel — (b) shows the numbers + breakdown + auto-fail", () => {
  beforeEach(async () => {
    if (i18n.language !== "en") await i18n.changeLanguage("en");
    useCharacterStore.setState({ character: null, loading: false, error: null });
    cleanup();
  });

  it("shows the DEX save number and its on-demand breakdown disclosure", () => {
    const doc = load();
    const data = deriveSavesAndChecks(doc.character, doc.session);
    const dex = data.saves.find((s) => s.id === "DEX");
    if (!dex?.breakdownParts) throw new Error("expected a DEX save with a breakdown");
    // Precondition: the mock's DEX save is proficient → ≥2 sources → a real tip.
    expect(dex.breakdownParts.length).toBeGreaterThan(1);

    const { container } = render(<SavesChecksPanel />);
    const row = rowFor(container, i18n.t("abilities.DEX"));
    expect(row).toBeDefined();
    // The DEX save modifier reads on the row…
    expect(row?.textContent).toContain(fmtMod(dex.bonus));
    // …behind the SAME `BreakdownTip` on-demand disclosure the rail uses (a quiet
    // glossary-term trigger — tap to reveal the mod · PB composition).
    expect(row?.querySelector(".glossary-term")).not.toBeNull();
  });

  it("marks the auto-failed saves crimson under Paralyzed (STR + DEX)", () => {
    load((d) => {
      d.session.conditions = ["paralyzed"];
    });
    const { container } = render(<SavesChecksPanel />);
    // Paralyzed auto-fails STR + DEX saves → a crimson mark on each of those rows.
    const marks = container.querySelectorAll(".sc-autofail");
    expect(marks.length).toBe(2);
    const strRow = rowFor(container, i18n.t("abilities.STR"));
    expect(strRow?.querySelector(".sc-autofail")).not.toBeNull();
    // The mark names the gating condition (informational — the number still reads).
    expect(strRow?.querySelector(".sc-autofail")?.getAttribute("title")).toMatch(
      /Paralyzed/i
    );
  });

  it("clears the auto-fail marks when the condition is removed (override-first)", () => {
    load((d) => {
      d.session.conditions = [];
    });
    const { container } = render(<SavesChecksPanel />);
    expect(container.querySelectorAll(".sc-autofail").length).toBe(0);
  });
});

describe("SavesChecksPanel — (c) rule-21 honesty: no dice/roll/DC affordance", () => {
  beforeEach(async () => {
    if (i18n.language !== "en") await i18n.changeLanguage("en");
    useCharacterStore.setState({ character: null, loading: false, error: null });
    cleanup();
  });

  it("has NO input or select (no DC field, no roll-entry, no target picker)", () => {
    load();
    const { container } = render(<SavesChecksPanel />);
    expect(container.querySelectorAll("input, select").length).toBe(0);
  });

  it("every interactive button is a breakdown disclosure — never a roll/commit", () => {
    load();
    const { container } = render(<SavesChecksPanel />);
    const buttons = Array.from(container.querySelectorAll("button"));
    // The only buttons are the `BreakdownTip` triggers (quiet glossary-term
    // disclosures). A roll/attack/commit button would fail this.
    for (const b of buttons) {
      expect(b.className).toContain("glossary-term");
    }
  });

  it("the panel body never shows a d20, a DC, or a target/enemy", () => {
    load((d) => {
      // Even under a condition (the richest state) the read-out stays modifier-only.
      d.session.conditions = ["paralyzed"];
    });
    const { container } = render(<SavesChecksPanel />);
    // Read the rows body (excludes the summary's honest "roll your own die" hint).
    const body = container.querySelector(".grid");
    const text = body?.textContent ?? "";
    expect(text).not.toMatch(/\bd20\b/i);
    expect(text).not.toMatch(/\bDC\b/);
    expect(text).not.toMatch(/\broll\b/i);
    expect(text).not.toMatch(/\btarget\b/i);
  });
});
