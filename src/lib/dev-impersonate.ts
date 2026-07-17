// DEV-ONLY (remove before release): act-as-member impersonation.
/**
 * dev-impersonate — the local "act as any campaign member" sandbox override.
 *
 * GENERALIZES + REPLACES the old "view as player" boolean flag: instead of a
 * single "demote me to a player" switch, this reads a `?devActAs=<uid>` URL query
 * param so a DEV build can present the auth store AS ANY member uid — the DM seat OR
 * a player — while the REAL Firebase token (`auth.currentUser`) stays the signed-in
 * owner/admin. Every cross-member read/write the client then issues is authorized
 * server-side via the rules' `isAdmin()` branch, so the SAME real code paths run for
 * each impersonated identity.
 *
 * The param lives in the URL (NOT localStorage) ON PURPOSE: it is per-tab / per-window,
 * so the owner can open one window as the DM and others as each player against ONE
 * Firestore emulator and watch live cross-member sync — something a single global
 * localStorage flag could never do.
 *
 * `devActAsUid()` early-returns `null` unless `import.meta.env.DEV` (statically `false`
 * in any production build), so the whole helper folds to `return null` and the auth.ts
 * branch that calls it is dead-code-eliminated from the prod bundle. Pair it with the
 * `content-pack/scripts/dev-seed-sandbox.ts` emulator seed.
 */
export function devActAsUid(): string | null {
  if (!import.meta.env.DEV) return null;
  if (typeof window === "undefined") return null;
  const uid = new URLSearchParams(window.location.search).get("devActAs");
  return uid && uid.length > 0 ? uid : null;
}
