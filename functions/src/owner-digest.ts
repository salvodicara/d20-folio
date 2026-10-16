/**
 * owner-digest — PURE formatting for the owner's one daily email: the accounts
 * created and the automatic error reports written since the last digest
 * (owner 2026-10-16: a digest instead of an email per sign-up; ADR-0008's
 * in-house reports by email instead of checking the admin inbox).
 *
 * New sign-ups are listed by name and email so abuse can be blocked from /admin.
 * Errors are grouped by what went wrong and say how many accounts saw each,
 * never which: those ids stay in the admin inbox.
 */
import type { MailMessage, NewUserLike } from "./owner-mail";

const ADMIN_URL = "https://d20-folio.web.app/admin";

export interface DigestReport {
  uid: string;
  event: string;
  message: string;
  createdAtMs: number;
}

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const plural = (count: number, word: string) =>
  `${count} new ${word}${count === 1 ? "" : "s"}`;

function errorLines(errors: readonly DigestReport[]): string[] {
  const groups = new Map<
    string,
    { event: string; message: string; count: number; uids: Set<string> }
  >();
  for (const report of errors) {
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
  return [...groups.values()]
    .sort((a, b) => b.count - a.count)
    .map((row) => {
      const accounts = `${row.uids.size} account${row.uids.size === 1 ? "" : "s"}`;
      return `${row.count}× ${row.event} — ${row.message} (${accounts})`;
    });
}

function signupLine(user: NewUserLike): string {
  const name = user.displayName?.trim() || "(no name)";
  const email = user.email?.trim() || "(no email)";
  return `${name} <${email}>`;
}

/** `null` when nothing is new: no email is sent. */
export function formatOwnerDigest(input: {
  signups: readonly NewUserLike[];
  errors: readonly DigestReport[];
}): MailMessage | null {
  const { signups, errors } = input;
  if (signups.length === 0 && errors.length === 0) return null;

  const headline = [
    ...(signups.length > 0 ? [plural(signups.length, "sign-up")] : []),
    ...(errors.length > 0 ? [plural(errors.length, "error")] : []),
  ].join(", ");
  const sections: Array<{ title: string; lines: string[] }> = [];
  if (signups.length > 0) {
    sections.push({ title: "New sign-ups", lines: signups.map(signupLine) });
  }
  if (errors.length > 0) {
    sections.push({ title: "New errors", lines: errorLines(errors) });
  }

  const text = [
    ...sections.flatMap((section) => [section.title, ...section.lines, ""]),
    `Admin panel (block abuse, error details): ${ADMIN_URL}`,
  ].join("\n");
  const html = [
    `<h2>d20 Folio today: ${esc(headline)}</h2>`,
    ...sections.flatMap((section) => [
      `<h3>${esc(section.title)}</h3>`,
      "<ul>",
      ...section.lines.map((line) => `<li>${esc(line)}</li>`),
      "</ul>",
    ]),
    `<p><a href="${ADMIN_URL}">Open the admin panel</a> to block abuse or read the details.</p>`,
  ].join("\n");
  return { subject: `d20 Folio today: ${headline}`, text, html };
}
