/**
 * B24 — the Italian Disengage-verdict chip used the orphan abbreviation "AA" (no
 * IT D&D term expands to it; the app's own IT copy always spells out "Attacco/i
 * di Opportunità" and recognizes "AdO" as the short form). Regression-locks the
 * fix: the IT `verdict_base-disengage` string must read "No AdO", never the
 * dangling "AA" — and, generally, must never leak the bare "AA" token (which a
 * future edit reverting the fix would reintroduce).
 */
import { describe, it, expect } from "vitest";
import enCombat from "@/i18n/en/ui/combat.json";
import itCombat from "@/i18n/it/ui/combat.json";

describe("i18n combat.json — Disengage verdict abbreviation (B24)", () => {
  it("IT resolves to the correct 'AdO' short form, matching EN's 'OA'", () => {
    expect(enCombat.combat["verdict_base-disengage"]).toBe("No OA");
    expect(itCombat.combat["verdict_base-disengage"]).toBe("No AdO");
  });

  it("never regresses to the orphan 'AA' abbreviation", () => {
    expect(itCombat.combat["verdict_base-disengage"]).not.toMatch(/\bAA\b/);
  });
});
