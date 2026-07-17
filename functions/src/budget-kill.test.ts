import { describe, it, expect } from "vitest";
import {
  parseBudgetNotification,
  decideBudgetKill,
  type BudgetNotification,
} from "./budget-kill";

describe("parseBudgetNotification — defensive payload parsing", () => {
  it("extracts the amounts + display name from a well-formed payload", () => {
    const n = parseBudgetNotification({
      budgetDisplayName: "d20-folio £1 cap",
      costAmount: 1.23,
      budgetAmount: 1,
      currencyCode: "GBP",
      alertThresholdExceeded: 1.0,
    });
    expect(n).toEqual({
      budgetDisplayName: "d20-folio £1 cap",
      costAmount: 1.23,
      budgetAmount: 1,
      currencyCode: "GBP",
      alertThresholdExceeded: 1.0,
      forecastThresholdExceeded: undefined,
    });
  });

  it("returns null for non-object payloads (garbage message → log-and-skip)", () => {
    expect(parseBudgetNotification(null)).toBeNull();
    expect(parseBudgetNotification(undefined)).toBeNull();
    expect(parseBudgetNotification("not json")).toBeNull();
    expect(parseBudgetNotification(42)).toBeNull();
  });

  it("drops non-finite / wrong-typed numeric fields to undefined (never NaN)", () => {
    const n = parseBudgetNotification({
      costAmount: "1.5", // string, not number
      budgetAmount: Number.NaN,
    });
    expect(n?.costAmount).toBeUndefined();
    expect(n?.budgetAmount).toBeUndefined();
  });
});

describe("decideBudgetKill — the kill-switch verdict", () => {
  const notify = (over: Partial<BudgetNotification> = {}): BudgetNotification => ({
    budgetDisplayName: "cap",
    costAmount: 0.5,
    budgetAmount: 1,
    ...over,
  });

  it("DISABLES when actual cost strictly exceeds the budget", () => {
    const d = decideBudgetKill(notify({ costAmount: 1.01, budgetAmount: 1 }));
    expect(d.disable).toBe(true);
    expect(d.reason).toMatch(/exceeds budget/);
  });

  it("does NOT disable at exactly the budget (100% is the warning, not the trigger)", () => {
    expect(decideBudgetKill(notify({ costAmount: 1, budgetAmount: 1 })).disable).toBe(
      false
    );
  });

  it("does NOT disable while cost is under budget — a forecast trip is ignored", () => {
    // A forecast alert still carries the ACTUAL costAmount (here still under budget),
    // so comparing actual cost vs budget naturally ignores the forecast threshold.
    const d = decideBudgetKill(
      notify({ costAmount: 0.4, budgetAmount: 1, forecastThresholdExceeded: 1.0 })
    );
    expect(d.disable).toBe(false);
    expect(d.reason).toMatch(/forecasts ignored/);
  });

  it("does NOT disable when either amount is missing (cannot compare)", () => {
    expect(decideBudgetKill(notify({ costAmount: undefined })).disable).toBe(false);
    expect(decideBudgetKill(notify({ budgetAmount: undefined })).disable).toBe(false);
  });

  it("does NOT disable on a non-positive budget amount (guards a bad budget config)", () => {
    expect(decideBudgetKill(notify({ costAmount: 5, budgetAmount: 0 })).disable).toBe(
      false
    );
  });

  it("does NOT disable on a null (unparseable) notification", () => {
    const d = decideBudgetKill(null);
    expect(d.disable).toBe(false);
    expect(d.reason).toMatch(/unparseable/);
  });

  it("end-to-end: a real over-budget payload parses then disables", () => {
    const raw = {
      budgetDisplayName: "d20-folio £1 cap",
      costAmount: 1.07,
      budgetAmount: 1,
      currencyCode: "GBP",
      alertThresholdExceeded: 1.0,
    };
    expect(decideBudgetKill(parseBudgetNotification(raw)).disable).toBe(true);
  });
});
