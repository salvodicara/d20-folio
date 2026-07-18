/**
 * Shared types for the in-app bug / feature reporter (OWN-37).
 *
 * Kept Firebase-free so both the pure pieces (the dialog form model) and the IO
 * layer can import them. The Cloud Function (`functions/`) mirrors this shape.
 */

import type { DebugContext } from "./collect-debug-context";

/**
 * The kinds of report — also drives the GitHub label + issue-title tag. This
 * tuple is the source of truth: the dialog iterates it AND the i18n coverage
 * guard imports it to assert a `report.types.<type>` key exists in every locale,
 * so a new type can't ship without its label (golden rules 6 + 9).
 */
export const REPORT_TYPES = [
  "bug",
  "feature",
  "visual",
  "data",
  "performance",
  "other",
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

/** The severities — source of truth for the `report.severities.<sev>` keys. */
export const REPORT_SEVERITIES = ["low", "medium", "high"] as const;
export type ReportSeverity = (typeof REPORT_SEVERITIES)[number];

/** Lifecycle of a report document. */
export type ReportStatus = "new" | "opened" | "error";

/** The user-entered + auto-detected form payload (no debug context yet). */
export interface ReportForm {
  type: ReportType;
  /** The app surface the report is about — auto-detected, user-overridable. */
  screen: string;
  severity: ReportSeverity;
  title: string;
  description: string;
}

/** Hard caps on the free-text fields — one source for the dialog AND prefill builders. */
export const MAX_TITLE = 120;
export const MAX_DESCRIPTION = 2000;

/**
 * Optional pre-filled form values an entry point can park before opening the
 * reporter (e.g. the crash screen pre-fills the error + route so the report is
 * actionable with zero typing). Every field stays user-editable in the dialog.
 */
export interface ReportPrefill {
  type?: ReportType;
  severity?: ReportSeverity;
  title?: string;
  description?: string;
}

/**
 * The Firestore document shape at `/bug_reports/{id}`. `debugContext` and
 * `screenshotPath` are attached by the IO layer; `issueNumber`/`issueUrl` are
 * written BACK by the Cloud Function once the GitHub issue is created.
 */
export interface BugReportDoc extends ReportForm {
  status: ReportStatus;
  reporterUid: string;
  locale: string;
  debugContext: DebugContext;
  /** Storage path of the attached screenshot, once uploaded (admin reference). */
  screenshotPath?: string;
  /** Firebase download URL of the screenshot — rendered in the admin inbox ONLY
   *  (the privacy strip keeps it off the public issue). */
  screenshotUrl?: string;
  /** Written back by the function after the GitHub issue is created. */
  issueNumber?: number;
  issueUrl?: string;
}
