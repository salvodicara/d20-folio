/**
 * Unit tests for Arcane Recovery (Wizard L1) — H9.
 *
 * Verified against the official IT SRD 5.2.1 (page 60) and the EN 2024
 * wikidot mirror at http://dnd2024.wikidot.com/wizard:main#Arcane-Recovery.
 * Both sources state the cap as ⌈wizard level / 2⌉ slot-levels, no slot
 * above 5th, once per Long Rest. The IT SRD's worked example (L4 wizard
 * recovers 2 slot levels — either one 2nd OR two 1sts) anchors rounding-up
 * and confirms slot-levels are additive.
 */

import { describe, it, expect } from "vitest";
import { srd } from "../_harness/loc";
import {
  arcaneRecoveryCap,
  validateArcaneRecoveryPlan,
  ARCANE_RECOVERY_MAX_SLOT_LEVEL,
} from "@/lib/arcane-recovery";
import { WIZARD_FEATURES } from "@/data/classes/wizard";

describe("arcaneRecoveryCap — ⌈level/2⌉", () => {
  it("L1 → 1 (the minimum a wizard can do)", () => {
    expect(arcaneRecoveryCap(1)).toBe(1);
  });
  it("L4 → 2 (the IT SRD page-60 worked example)", () => {
    expect(arcaneRecoveryCap(4)).toBe(2);
  });
  it("L5 → 3 (rounds UP, not down — RAW says 'arrotondato per eccesso')", () => {
    expect(arcaneRecoveryCap(5)).toBe(3);
  });
  it("L20 → 10 (max progression)", () => {
    expect(arcaneRecoveryCap(20)).toBe(10);
  });
  it("L0 / negative → 0 (defensive)", () => {
    expect(arcaneRecoveryCap(0)).toBe(0);
    expect(arcaneRecoveryCap(-3)).toBe(0);
  });
});

describe("ARCANE_RECOVERY_MAX_SLOT_LEVEL", () => {
  it("is 5 (no slot of level 6 or higher per RAW)", () => {
    expect(ARCANE_RECOVERY_MAX_SLOT_LEVEL).toBe(5);
  });
});

describe("validateArcaneRecoveryPlan", () => {
  it("L4 — one 2nd-level slot is legal (sum=2 ≤ cap=2)", () => {
    const r = validateArcaneRecoveryPlan(4, [2]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.usedLevels).toBe(2);
      expect(r.cap).toBe(2);
    }
  });

  it("L4 — two 1st-level slots is legal (the IT SRD worked example)", () => {
    const r = validateArcaneRecoveryPlan(4, [1, 1]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.usedLevels).toBe(2);
      expect(r.cap).toBe(2);
    }
  });

  it("L4 — one 3rd-level slot is illegal (sum=3 > cap=2)", () => {
    const r = validateArcaneRecoveryPlan(4, [3]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/exceeds/i);
  });

  it("rejects a 6th-level slot at any wizard level (RAW cap)", () => {
    const r = validateArcaneRecoveryPlan(20, [6]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/above .* cap/i);
  });

  it("rejects slot levels below 1", () => {
    const r = validateArcaneRecoveryPlan(10, [0]);
    expect(r.ok).toBe(false);
  });

  it("empty plan is trivially legal", () => {
    const r = validateArcaneRecoveryPlan(10, []);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.usedLevels).toBe(0);
  });
});

describe("Wizard Arcane Recovery feature wiring", () => {
  const feat = WIZARD_FEATURES.find((f) => f.id === "wizard-arcane-recovery");

  it("exists and is gained at level 1", () => {
    expect(feat).toBeDefined();
    expect(feat?.level).toBe(1);
  });

  it("carries a 1/long-rest tracker (per-use gate)", () => {
    expect(feat?.mechanics?.tracker?.total).toBe("1");
    expect(feat?.mechanics?.tracker?.recovery).toBe("long-rest");
  });

  it("declares an action so the combat panel can surface it", () => {
    const actions = feat?.mechanics?.actions ?? [];
    expect(actions.length).toBeGreaterThan(0);
  });

  it("Italian name matches the official SRD casing ('Recupero arcano', lowercase 'a')", () => {
    expect(srd("class-feature", feat?.id ?? "", "name", "it")).toBe("Recupero arcano");
  });

  it("description mentions the 1/long-rest gate in both locales", () => {
    expect(
      srd("class-feature", feat?.id ?? "", "description", "en").toLowerCase()
    ).toContain("long rest");
    expect(
      srd("class-feature", feat?.id ?? "", "description", "it").toLowerCase()
    ).toContain("riposo lungo");
  });
});
