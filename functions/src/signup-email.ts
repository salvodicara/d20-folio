/**
 * signup-email — PURE formatting for the new-user notification email (OWN-38).
 *
 * Free of `nodemailer` / `firebase-admin` so it's unit-testable. The trigger in
 * `index.ts` reads the `/users/{uid}` doc, builds the message here, and sends it.
 */

const ADMIN_URL = "https://d20-folio.web.app/admin";

export interface NewUserLike {
  uid: string;
  email?: string;
  displayName?: string;
  /** ISO string or human timestamp (the trigger formats the Firestore value). */
  createdAt?: string;
}

export interface MailMessage {
  subject: string;
  text: string;
  html: string;
}

/** Escape the few characters that matter in an HTML text node. */
function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Build the owner-notification email for a freshly registered user. */
export function formatSignupEmail(user: NewUserLike): MailMessage {
  const name = user.displayName?.trim() || "(no name)";
  const email = user.email?.trim() || "(no email)";
  const when = user.createdAt ?? new Date().toISOString();

  const subject = `New d20 Folio sign-up: ${name}`;

  const text = [
    "A new user just registered for d20 Folio.",
    "",
    `Name:    ${name}`,
    `Email:   ${email}`,
    `UID:     ${user.uid}`,
    `When:    ${when}`,
    "",
    `Admin panel (block abuse fast): ${ADMIN_URL}`,
  ].join("\n");

  const html = [
    "<h2>New d20 Folio sign-up</h2>",
    "<p>A new user just registered.</p>",
    "<table cellpadding='4' style='border-collapse:collapse'>",
    `<tr><td><strong>Name</strong></td><td>${esc(name)}</td></tr>`,
    `<tr><td><strong>Email</strong></td><td>${esc(email)}</td></tr>`,
    `<tr><td><strong>UID</strong></td><td><code>${esc(user.uid)}</code></td></tr>`,
    `<tr><td><strong>When</strong></td><td>${esc(when)}</td></tr>`,
    "</table>",
    `<p><a href="${ADMIN_URL}">Open the admin panel</a> to block abuse fast.</p>`,
  ].join("\n");

  return { subject, text, html };
}

// ── SMTP config resolution (pure — the fail-loud branch is testable here) ────

export interface MailConfig {
  host: string;
  user: string;
  pass: string;
  from: string;
  to: string;
}

/**
 * Resolve the SMTP config from the secret values. Returns `null` when the
 * config is incomplete — the trigger error-logs LOUDLY and returns without
 * throwing (a thrown error would retry on every new sign-up). `MAIL_HOST`
 * defaults to Gmail and `MAIL_FROM` to the user; `OWNER_EMAIL` has NO
 * fallback — the secret is the only source of the destination.
 */
export function resolveMailConfig(secrets: {
  host: string;
  user: string;
  pass: string;
  from: string;
  to: string;
}): MailConfig | null {
  const host = secrets.host || "smtp.gmail.com";
  const from = secrets.from || secrets.user;
  if (!secrets.user || !secrets.pass || !secrets.to) return null;
  return { host, user: secrets.user, pass: secrets.pass, from, to: secrets.to };
}
