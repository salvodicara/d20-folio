/**
 * diagnostics-digest — PURE formatting for the owner's daily email of new
 * automatic error reports (ADR-0008's in-house diagnostics; owner 2026-10-16:
 * keep them, and be told by email instead of checking the admin inbox).
 *
 * The email groups reports by what went wrong and says how many accounts saw it,
 * never which: account ids stay in the admin inbox.
 */
import type { MailMessage } from "./signup-email";

const ADMIN_URL = "https://d20-folio.web.app/admin";

export interface DigestReport {
  uid: string;
  event: string;
  message: string;
  createdAtMs: number;
  appVersion?: string;
}

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** `null` when there is nothing new: no email is sent. */
export function formatDiagnosticsDigest(
  reports: readonly DigestReport[]
): MailMessage | null {
  if (reports.length === 0) return null;

  const groups = new Map<
    string,
    { event: string; message: string; count: number; uids: Set<string> }
  >();
  for (const report of reports) {
    const key = `${report.event}\u0000${report.message}`;
    const group = groups.get(key) ?? {
      event: report.event,
      message: report.message,
      count: 0,
      uids: new Set<string>(),
    };
    group.count += 1;
    group.uids.add(report.uid);
    groups.set(key, group);
  }
  const rows = [...groups.values()].sort((a, b) => b.count - a.count);
  const line = (row: (typeof rows)[number]) => {
    const accounts = `${row.uids.size} account${row.uids.size === 1 ? "" : "s"}`;
    return `${row.count}× ${row.event} — ${row.message} (${accounts})`;
  };

  const errors = `${reports.length} new error${reports.length === 1 ? "" : "s"}`;
  const kinds = `${rows.length} kind${rows.length === 1 ? "" : "s"}`;
  const subject = `d20 Folio: ${errors} (${kinds})`;
  const text = [
    `Folio recorded ${errors} since the last digest.`,
    "",
    ...rows.map(line),
    "",
    `Details, per account, in the admin inbox: ${ADMIN_URL}`,
  ].join("\n");
  const html = [
    `<h2>d20 Folio: ${esc(errors)}</h2>`,
    "<ul>",
    ...rows.map((row) => `<li>${esc(line(row))}</li>`),
    "</ul>",
    `<p><a href="${ADMIN_URL}">Open the admin inbox</a> for the details.</p>`,
  ].join("\n");
  return { subject, text, html };
}
