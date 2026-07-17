/**
 * The GR10 boundary read-normalizers — the bounded one-way seam that conforms a
 * not-yet-migrated stored value so the new id-ref/LocText combat-log view + the strict
 * concentration resolver can never crash on legacy data (the do-not-ship verify gap).
 * Pure functions → unit-tested directly (golden rule 13).
 */
import { describe, it, expect } from "vitest";
import { normalizeLogEntry } from "@/lib/sanitize-session";
import {
  normalizeStoredConcentration,
  normalizeConcentrationRef,
  normalizeLogEntryConcentration,
} from "@/lib/concentration";
import type { LogEntry } from "@/types/character";
import type { CombatEvent } from "@/types/combat-log";
import type { ConcentrationRef } from "@/types/ids";

describe("normalizeLogEntry — legacy combat-log boundary", () => {
  it("conforms a legacy action-use (actionName, no action) to a `custom` LocText — never a missing `action`", () => {
    const out = normalizeLogEntry({
      event: {
        kind: "action-use",
        actionName: "Hypnotic Pattern",
        effect: "spell-cast",
        slot: "action",
      },
      ts: 1,
      id: "a",
    });
    expect(out?.event).toMatchObject({
      kind: "action-use",
      action: { custom: "Hypnotic Pattern" },
    });
    expect((out?.event as Record<string, unknown>).actionName).toBeUndefined();
  });

  it("conforms a legacy rider-use (actionName + riderName) to custom action + rider", () => {
    const out = normalizeLogEntry({
      event: {
        kind: "rider-use",
        actionName: "Longsword",
        riderName: "Psionic Strike",
        effect: "damage",
      },
      ts: 1,
      id: "r",
    });
    expect(out?.event).toMatchObject({
      kind: "rider-use",
      action: { custom: "Longsword" },
      rider: { custom: "Psionic Strike" },
    });
  });

  it("passes a CURRENT id-ref event through unchanged", () => {
    const event = {
      kind: "action-use",
      action: { srd: { kind: "spell", key: "bless", field: "name" } },
      effect: "spell-cast",
      slot: "action",
    };
    expect(normalizeLogEntry({ event, ts: 2, id: "c" })?.event).toEqual(event);
  });

  it("converts a pre-events frozen-text entry to a `legacy` event (history stays visible)", () => {
    const out = normalizeLogEntry({
      text: "Used Bless",
      type: "spell-cast",
      ts: 3,
      id: "l",
    });
    expect(out?.event).toMatchObject({ kind: "legacy", text: "Used Bless" });
  });

  it("drops an unsalvageable entry → null", () => {
    expect(normalizeLogEntry(null)).toBeNull();
    expect(normalizeLogEntry({ ts: 1, id: "x" })).toBeNull();
  });
});

describe("concentration boundary — never feeds the strict resolver a bare name", () => {
  it("normalizeStoredConcentration: '' stays '', a valid id / `custom:` pass through, a bare NAME is `custom:`-marked", () => {
    expect(normalizeStoredConcentration("")).toBe("");
    expect(normalizeStoredConcentration(undefined)).toBe("");
    expect(normalizeStoredConcentration(42)).toBe("");
    expect(normalizeStoredConcentration("hypnotic-pattern")).toBe("hypnotic-pattern");
    expect(normalizeStoredConcentration("custom:My Hex")).toBe("custom:My Hex");
    expect(normalizeStoredConcentration("Invisibilità")).toBe("custom:Invisibilità");
  });

  it("normalizeConcentrationRef: the log-event variant — never '', a bare NAME → `custom:`", () => {
    expect(normalizeConcentrationRef("hypnotic-pattern")).toBe("hypnotic-pattern");
    expect(normalizeConcentrationRef("custom:X")).toBe("custom:X");
    expect(normalizeConcentrationRef("Hypnotic Pattern")).toBe("custom:Hypnotic Pattern");
  });
});

describe("normalizeLogEntryConcentration — SRD-aware log boundary (codec + IDB read paths)", () => {
  const concEntry = (spell: string): LogEntry => ({
    event: { kind: "concentration-start", spell: spell as ConcentrationRef },
    ts: 1,
    id: "c",
  });

  it("conforms a bare spell NAME on a concentration event → `custom:` (never hits the strict resolver)", () => {
    expect(
      normalizeLogEntryConcentration(concEntry("Hypnotic Pattern")).event
    ).toMatchObject({
      kind: "concentration-start",
      spell: "custom:Hypnotic Pattern",
    });
  });

  it("passes a valid spell id / already-`custom:` value through unchanged", () => {
    expect(
      normalizeLogEntryConcentration(concEntry("hypnotic-pattern")).event
    ).toMatchObject({
      spell: "hypnotic-pattern",
    });
    expect(
      normalizeLogEntryConcentration(concEntry("custom:My Hex")).event
    ).toMatchObject({
      spell: "custom:My Hex",
    });
  });

  it("is an identity no-op for a non-concentration event (same reference back)", () => {
    const action: LogEntry = {
      event: {
        kind: "action-use",
        action: { custom: "X" },
        effect: "spell-cast",
      } as CombatEvent,
      ts: 1,
      id: "a",
    };
    expect(normalizeLogEntryConcentration(action)).toBe(action);
  });
});
