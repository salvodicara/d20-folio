/**
 * The ONE builder for an absolute, shareable in-app URL (golden rule 3).
 *
 * Two surfaces hand a URL to another human — the campaign invite
 * (`inviteLinkFromCode`) and a character share link (`shareLinkFor`) — and both need
 * the same SSR/test-safe origin resolution. It lives here once so a fix (a custom
 * domain, a base path) reaches both rather than one.
 */

/** `<origin><path>` on the client; the bare path where there is no `window`. */
export function appLink(path: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}${path}`;
}
