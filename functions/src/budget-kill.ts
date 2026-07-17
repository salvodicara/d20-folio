/**
 * budget-kill — the PURE decision logic behind the `onBudgetAlert` kill-switch
 * (SAFE-01, the zero-budget hard guarantee).
 *
 * The Cloud Function (`index.ts`) does the IO (decode the Pub/Sub message, read the
 * project's current billing state, detach the billing account via the Cloud Billing
 * API); these helpers hold the branchy, safety-relevant DECISION so it can be
 * unit-tested WITHOUT any Google Cloud call (mirroring how `issue-format.ts` /
 * `signup-email.ts` / `delete-user-plan.ts` keep their logic pure). No Firebase / no
 * Cloud imports.
 *
 * The doctrine (Google's documented "disable billing to stop usage" pattern): a
 * Cloud Billing budget publishes a JSON notification to a Pub/Sub topic; when the
 * ACTUAL accumulated cost exceeds the budget amount we detach billing to force spend
 * to zero. We act ONLY on real cost overrun — never on a forecast. The forecast
 * alert still carries the ACTUAL `costAmount`, so comparing `costAmount > budgetAmount`
 * naturally ignores forecast thresholds (a forecast can trip while actual cost is
 * still under budget → no action).
 */

/**
 * The subset of the Cloud Billing budget Pub/Sub notification payload we reason over
 * (schema version "1.0"). The budget publishes more fields (`currencyCode`,
 * `costIntervalStart`, threshold-exceeded markers); we only need the two amounts plus
 * the display name for logging. All fields are optional — a malformed/partial payload
 * must resolve to "no action", never crash.
 */
export interface BudgetNotification {
  budgetDisplayName?: string;
  costAmount?: number;
  budgetAmount?: number;
  currencyCode?: string;
  /** Set when an actual-cost threshold tripped. */
  alertThresholdExceeded?: number;
  /** Set when a FORECAST threshold tripped — deliberately ignored (see module doc). */
  forecastThresholdExceeded?: number;
}

/** Coerce to a finite number or undefined (rejects NaN/Infinity/strings/null). */
function finiteNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/**
 * Defensively parse the decoded Pub/Sub JSON into a `BudgetNotification`. Returns
 * `null` for anything that isn't an object (so the caller can log-and-skip rather than
 * throw on a garbage message). Number fields that aren't finite numbers become
 * `undefined` → treated as "unknown" → no action.
 */
export function parseBudgetNotification(raw: unknown): BudgetNotification | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return {
    budgetDisplayName:
      typeof o.budgetDisplayName === "string" ? o.budgetDisplayName : undefined,
    costAmount: finiteNumber(o.costAmount),
    budgetAmount: finiteNumber(o.budgetAmount),
    currencyCode: typeof o.currencyCode === "string" ? o.currencyCode : undefined,
    alertThresholdExceeded: finiteNumber(o.alertThresholdExceeded),
    forecastThresholdExceeded: finiteNumber(o.forecastThresholdExceeded),
  };
}

/** The kill-switch verdict + a human-readable reason for loud logging. */
export interface KillDecision {
  disable: boolean;
  reason: string;
}

/**
 * THE decision: detach billing IFF the actual accumulated cost strictly exceeds the
 * budget amount. Everything else (unparseable payload, missing amounts, non-positive
 * budget, cost still within budget, a forecast-only trip) is a no-op with a stated
 * reason. Strict `>` so hitting the budget exactly does not yet fire (the alert at
 * 100% is the warning; over-budget is the trigger).
 */
export function decideBudgetKill(n: BudgetNotification | null): KillDecision {
  if (!n) {
    return { disable: false, reason: "unparseable or empty budget notification" };
  }
  const { costAmount, budgetAmount } = n;
  if (costAmount === undefined || budgetAmount === undefined) {
    return {
      disable: false,
      reason: "missing costAmount/budgetAmount — cannot compare (no action)",
    };
  }
  if (budgetAmount <= 0) {
    return {
      disable: false,
      reason: `non-positive budgetAmount (${budgetAmount}) — no action`,
    };
  }
  if (costAmount > budgetAmount) {
    return {
      disable: true,
      reason: `ACTUAL cost ${costAmount} exceeds budget ${budgetAmount} — detaching billing`,
    };
  }
  return {
    disable: false,
    reason: `cost ${costAmount} within budget ${budgetAmount} — no action (forecasts ignored)`,
  };
}
