/**
 * owner-mail — the owner email's shared shapes and SMTP config resolution, PURE
 * (free of `nodemailer` / `firebase-admin`) so it is unit-testable. The daily
 * digest (`owner-digest.ts`) formats; `index.ts` sends.
 */

export interface NewUserLike {
  uid: string;
  email?: string;
  displayName?: string;
}

export interface MailMessage {
  subject: string;
  text: string;
  html: string;
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
