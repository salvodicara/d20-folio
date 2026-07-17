/**
 * MC-CAUSE — the filtered-absence cause line on the level-up class fork
 * (Constitution §2.7.3). The incident: the owner read the silently-filtered
 * multiclass pool as "multiclassing isn't built". The doctrine stands (illegal
 * options are FILTERED, never greyed) — but the absence now carries ONE quiet
 * localized cause line, with the per-class unmet floors behind progressive
 * disclosure. Localized assertions in BOTH locales (the live-incident strings).
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import i18n from "@/i18n";
import { MulticlassFilteredCause } from "@/features/leveling/multiclass-cause";
import { multiclassFilterReport } from "@/lib/multiclass";
import { classTables } from "@/data/classes";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { Locale } from "@/lib/locale";
import type { CharacterData } from "@/types/character";

vi.mock("@/lib/firebase", () => ({ db: {}, auth: {}, storage: {} }));

function charWith(
  classes: CharacterData["classes"],
  abilityScores: CharacterData["abilityScores"]
): CharacterData {
  return { ...MOCK_CHARACTER.character, classes, abilityScores };
}

// The MC-CAUSE incident character: Coralino — Bard 3, eligible for exactly
// Fighter/Rogue/Sorcerer/Warlock; every OTHER composed class filtered. The
// unavailable count follows the composition (8 with the content pack's
// Artificer, 7 in the public SRD-only catalogue), so it is derived from the
// composed class table, never hardcoded.
const UNAVAILABLE = classTables.length - 1 /* Bard (own) */ - 4; /* eligible */
const coralino = charWith([{ classId: "bard", level: 3 }], {
  STR: 8,
  DEX: 16,
  CON: 14,
  INT: 8,
  WIS: 10,
  CHA: 17,
});

function mount(character: CharacterData, eligibleCount: number, locale: Locale) {
  void i18n.changeLanguage(locale);
  return render(
    <MulticlassFilteredCause
      report={multiclassFilterReport(character)}
      eligibleCount={eligibleCount}
      locale={locale}
    />
  );
}

describe("MulticlassFilteredCause — the §2.7.3 cause line (EN + IT)", () => {
  it.each([
    // [locale, cause line, toggle, disclosure row (the incident's Cleric)]
    [
      "en",
      `${UNAVAILABLE} classes are unavailable: multiclassing requires 13+ in a class's primary ability.`,
      "More",
      "Cleric: requires WIS 13 (you have 10)",
    ],
    [
      "it",
      `${UNAVAILABLE} classi non sono disponibili: il multiclasse richiede 13+ nella caratteristica primaria della classe.`,
      "Dettagli",
      "Chierico: richiede SAG 13 (hai 10)",
    ],
  ] as const)(
    "Coralino (%s): quiet count line collapsed, per-class floors on demand",
    (locale, causeLine, toggleLabel, clericRow) => {
      const { container } = mount(coralino, 4, locale);
      expect(container.textContent).toContain(causeLine);
      // Collapsed by default — detail waits behind progressive disclosure.
      expect(container.textContent).not.toContain(clericRow);
      const toggle = screen.getByRole("button", { name: toggleLabel });
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute("aria-expanded", "true");
      expect(container.textContent).toContain(clericRow);
    }
  );

  it("met preconditions are NEVER stated — Monk lists only its failing half", () => {
    const { container } = mount(coralino, 4, "en");
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    // DEX 16 is met — the Monk row cites WIS alone.
    expect(container.textContent).toContain("Monk: requires WIS 13 (you have 10)");
    expect(container.textContent).not.toContain("DEX 13");
  });

  it("a character qualifying for EVERY class renders NOTHING (rule 19)", () => {
    const paragon = charWith([{ classId: "fighter", level: 3 }], {
      STR: 13,
      DEX: 13,
      CON: 13,
      INT: 13,
      WIS: 13,
      CHA: 13,
    });
    const { container } = mount(paragon, 12, "en");
    expect(container.textContent).toBe("");
  });

  it("zero eligible (own-class blocker): the closed wording + ONE own row, no echo per class", () => {
    // STR-12/DEX-12 Fighter — fails its own prereq, so EVERYTHING is closed.
    const weak = charWith([{ classId: "fighter", level: 3 }], {
      STR: 12,
      DEX: 12,
      CON: 10,
      INT: 16,
      WIS: 10,
      CHA: 10,
    });
    const { container } = mount(weak, 0, "en");
    expect(container.textContent).toContain(
      "Multiclassing is unavailable: it requires 13+ in the primary ability of your class and of the new class."
    );
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    // The own blocker row — an "any"-mode class joins its options with "or".
    expect(container.textContent).toContain(
      "Fighter: requires STR 13 (you have 12) or DEX 13 (you have 12)"
    );
    // A class closed ONLY by the own blocker carries no row of its own
    // (one attribution, never two) — Wizard's INT 16 floor is met.
    expect(container.textContent).not.toContain("Wizard:");
  });
});
