/**
 * Roles as Auth custom claims (Phase 5). The `/users/{uid}` doc stays the record an
 * admin edits (`role: "admin"`, `status: "blocked"`); this mirrors those two facts
 * into the account's token claims, so `firestore.rules` and `storage.rules` read
 * `request.auth.token` instead of a `get()` of the user doc on every request.
 *
 * Only the exact values the rules check become claims; every other claim on the
 * account is kept. A claim reaches the rules when the client's ID token refreshes
 * (at most an hour); a block also revokes the refresh tokens.
 *
 * The one-off backfill (`scripts/backfill-role-claims.ts`) mirrors `roleClaimsFor`
 * (a scripts-lane parity test pins the two).
 */

export interface RoleClaims {
  role?: "admin";
  status?: "blocked";
}

type Claims = Record<string, unknown>;

/** The claims a user doc grants: only `role: "admin"` and `status: "blocked"` count. */
export function roleClaimsFor(user: Claims | undefined): RoleClaims {
  return {
    ...(user?.role === "admin" ? { role: "admin" as const } : {}),
    ...(user?.status === "blocked" ? { status: "blocked" as const } : {}),
  };
}

/** The account's claims with ours set to `claims`: role and status replaced, the rest kept. */
export function withRoleClaims(existing: Claims | undefined, claims: RoleClaims): Claims {
  const { role: _role, status: _status, ...others } = existing ?? {};
  void _role;
  void _status;
  return { ...others, ...claims };
}

const sorted = (claims: Claims): string =>
  JSON.stringify(Object.entries(claims).sort(([a], [b]) => a.localeCompare(b)));

export function sameClaims(a: Claims, b: Claims): boolean {
  return sorted(a) === sorted(b);
}

/** The slice of the Admin SDK's Auth the sync needs (a fake in tests). */
export interface ClaimsAuth {
  getUser(uid: string): Promise<{ customClaims?: Claims }>;
  setCustomUserClaims(uid: string, claims: Claims): Promise<void>;
  revokeRefreshTokens(uid: string): Promise<void>;
}

export type SyncResult = "unchanged" | "updated" | "no-account";

/**
 * The `users/{uid}` write trigger: when the doc's role or status changed, set the
 * matching claims. Idempotent (a retried event finds the claims already set), and an
 * account already deleted from Auth is not an error.
 */
export async function syncRoleClaims(
  auth: ClaimsAuth,
  uid: string,
  before: Claims | undefined,
  after: Claims | undefined
): Promise<SyncResult> {
  const claims = roleClaimsFor(after);
  if (sameClaims({ ...roleClaimsFor(before) }, { ...claims })) return "unchanged";
  let current: Claims;
  try {
    current = (await auth.getUser(uid)).customClaims ?? {};
  } catch (err) {
    if ((err as { code?: unknown }).code === "auth/user-not-found") return "no-account";
    throw err;
  }
  const next = withRoleClaims(current, claims);
  if (sameClaims(current, next)) return "unchanged";
  await auth.setCustomUserClaims(uid, next);
  if (claims.status === "blocked" && current.status !== "blocked") {
    await auth.revokeRefreshTokens(uid);
  }
  return "updated";
}
