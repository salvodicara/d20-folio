import { describe, it, expect } from "vitest";
import {
  MOUNTED_COMBAT_REFERENCE,
  UNDERWATER_COMBAT_REFERENCE,
  type CombatVariantNote,
} from "@/data/combat-variants";

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
    expect(
      MOUNTED_COMBAT_REFERENCE.find((n) => n.id === "mount-dismount")?.summary.en
    ).toContain("half your Speed");
  });

  it("a controlled mount is limited to Dash, Disengage, or Dodge", () => {
    expect(
      MOUNTED_COMBAT_REFERENCE.find((n) => n.id === "controlled-mount")?.summary.en
    ).toContain("Dash, Disengage, or Dodge");
  });

  it("falling off is a DC 10 Dexterity save (2024 RAW)", () => {
    expect(
      MOUNTED_COMBAT_REFERENCE.find((n) => n.id === "falling-off")?.summary.en
    ).toContain("DC 10 Dexterity");
  });

  it("underwater melee Disadvantage is waived only for Piercing damage — the 2024 change, NOT the 2014 weapon list", () => {
    const melee = UNDERWATER_COMBAT_REFERENCE.find((n) => n.id === "melee-underwater");
    expect(melee?.summary.en).toContain("Piercing");
    // Fails-before if someone transcribes the retired 2014 named-weapon list.
    expect(melee?.summary.en.toLowerCase()).not.toContain("dagger");
  });

  it("underwater ranged attacks auto-miss beyond normal range", () => {
    expect(
      UNDERWATER_COMBAT_REFERENCE.find((n) => n.id === "ranged-underwater")?.summary.en
    ).toContain("automatically misses");
  });

  it("everything underwater resists Fire damage", () => {
    expect(
      UNDERWATER_COMBAT_REFERENCE.find((n) => n.id === "fire-resistance")?.summary.en
    ).toContain("Resistance to Fire");
  });

  it("every entry is fully bilingual (EN + IT name and summary)", () => {
    const all: readonly CombatVariantNote[] = [
      ...MOUNTED_COMBAT_REFERENCE,
      ...UNDERWATER_COMBAT_REFERENCE,
    ];
    for (const n of all) {
      expect(n.name.en).toBeTruthy();
      expect(n.name.it).toBeTruthy();
      expect(n.summary.en).toBeTruthy();
      expect(n.summary.it).toBeTruthy();
    }
  });
});
