/**
 * Passwordless sign-in by email link, the second way in next to Google (Phase 5).
 *
 * Firebase's flow: send a link that returns to `/login`, remember the address on
 * this device, and finish when the player comes back through the link. Opened on
 * another device, the address is not remembered, so the player types it again.
 * Every outcome is a named result the login screen turns into a message.
 *
 * Pure over injected deps; `auth.ts` wires the Firebase calls.
 */

/** Where this device remembers the address the link was sent to. */
export const EMAIL_FOR_SIGN_IN_KEY = "folio.emailForSignIn";

export interface EmailLinkDeps {
  /** The site's origin; the link returns to `${origin}/login`. */
  origin: string;
  send: (
    email: string,
    settings: { url: string; handleCodeInApp: true }
  ) => Promise<void>;
  isSignInLink: (href: string) => boolean;
  /** Signs in (and creates the profile on a first sign-in); rejects with an auth code. */
  complete: (email: string, href: string) => Promise<void>;
  storage: {
    get: (key: string) => string | null;
    set: (key: string, value: string) => void;
    remove: (key: string) => void;
  };
}

export type SendResult = "sent" | "invalid-email" | "send-failed";
export type CompleteResult =
  | "signed-in"
  | "not-a-link"
  | "needs-email"
  | "invalid-link"
  | "wrong-email"
  | "failed";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

function errorCode(error: unknown): string {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : "";
}

export function createEmailLinkSignIn(deps: EmailLinkDeps) {
  async function sendLink(input: string): Promise<SendResult> {
    const email = normalize(input);
    if (!EMAIL.test(email)) return "invalid-email";
    try {
      await deps.send(email, { url: `${deps.origin}/login`, handleCodeInApp: true });
    } catch {
      return "send-failed";
    }
    deps.storage.set(EMAIL_FOR_SIGN_IN_KEY, email);
    return "sent";
  }

  async function completeFromUrl(
    href: string,
    typedEmail?: string
  ): Promise<CompleteResult> {
    if (!deps.isSignInLink(href)) return "not-a-link";
    const email = typedEmail
      ? normalize(typedEmail)
      : deps.storage.get(EMAIL_FOR_SIGN_IN_KEY);
    if (!email) return "needs-email";
    try {
      await deps.complete(email, href);
    } catch (error) {
      const code = errorCode(error);
      if (code === "auth/invalid-email") return "wrong-email";
      if (code === "auth/invalid-action-code" || code === "auth/expired-action-code") {
        return "invalid-link";
      }
      return "failed";
    }
    deps.storage.remove(EMAIL_FOR_SIGN_IN_KEY);
    return "signed-in";
  }

  return { sendLink, completeFromUrl };
}
