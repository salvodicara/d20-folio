import { describe, it, expect } from "vitest";
import {
  ATTACK_SITUATION_REFERENCE,
  MOUNTED_COMBAT_REFERENCE,
  UNDERWATER_COMBAT_REFERENCE,
  VISION_REFERENCE,
  type CombatVariantNote,
} from "@/data/combat-variants";
import { LOCALES } from "@/lib/locale";
import { srd } from "@tests/_harness/loc";

/** The English sentence of a reference line, from the `rule` catalogue. */
function summaryEn(table: readonly CombatVariantNote[], id: string): string {
  const note = table.find((n) => n.id === id);
  return note ? srd("rule", note.key, "summary", "en") : "";
}

/** RA-30 — Authoritative-values guard for the Mounted/Underwater combat references. */
describe("Combat-variant references (RA-30)", () => {
  it("Mounted Combat lists the five 2024 SRD rule lines in order", () => {
    expect(MOUNTED_COMBAT_REFERENCE.map((n) => n.id)).toEqual([
      "eligible-mount",
      "mount-dismount",
      "controlled-mount",
      "independent-mount",
      "falling-off",
    ]);
  });

  it("Underwater Combat lists the three 2024 SRD rule lines in order", () => {
    expect(UNDERWATER_COMBAT_REFERENCE.map((n) => n.id)).toEqual([
      "melee-underwater",
      "ranged-underwater",
      "fire-resistance",
    ]);
  });

  it("mounting costs half Speed", () => {
    expect(summaryEn(MOUNTED_COMBAT_REFERENCE, "mount-dismount")).toContain(
      "half your Speed"
    );
  });

  it("a controlled mount is limited to Dash, Disengage, or Dodge", () => {
    expect(summaryEn(MOUNTED_COMBAT_REFERENCE, "controlled-mount")).toContain(
      "Dash, Disengage, or Dodge"
    );
  });

  it("falling off is a DC 10 Dexterity save (2024 RAW)", () => {
    expect(summaryEn(MOUNTED_COMBAT_REFERENCE, "falling-off")).toContain(
      "DC 10 Dexterity"
    );
  });

  it("underwater melee Disadvantage is waived only for Piercing damage — the 2024 change, NOT the 2014 weapon list", () => {
    const melee = summaryEn(UNDERWATER_COMBAT_REFERENCE, "melee-underwater");
    expect(melee).toContain("Piercing");
    // Fails-before if someone transcribes the retired 2014 named-weapon list.
    expect(melee.toLowerCase()).not.toContain("dagger");
  });

  it("underwater ranged attacks auto-miss beyond normal range", () => {
    expect(summaryEn(UNDERWATER_COMBAT_REFERENCE, "ranged-underwater")).toContain(
      "automatically misses"
    );
  });

  it("everything underwater resists Fire damage", () => {
    expect(summaryEn(UNDERWATER_COMBAT_REFERENCE, "fire-resistance")).toContain(
      "Resistance to Fire"
    );
  });

  it.each(LOCALES)("every line has its name and summary in %s", (locale) => {
    const all: readonly CombatVariantNote[] = [
      ...MOUNTED_COMBAT_REFERENCE,
      ...UNDERWATER_COMBAT_REFERENCE,
      ...ATTACK_SITUATION_REFERENCE,
      ...VISION_REFERENCE,
    ];
    for (const n of all) {
      expect(srd("rule", n.key, "name", locale), n.key).toBeTruthy();
      expect(srd("rule", n.key, "summary", locale), n.key).toBeTruthy();
    }
  });
});
