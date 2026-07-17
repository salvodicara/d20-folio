/**
 * useIsAdmin — the single shared admin gate.
 *
 * Returns `true` only when the signed-in user's Firestore profile carries
 * `role: "admin"`. This is DATA-DRIVEN: the same `role` field is the server-side
 * source of truth in `firestore.rules` (its `isAdmin()` reads the user doc), so
 * the client gate and the enforced rules can never drift, and nothing
 * admin-related is baked into the client bundle.
 *
 * The profile loads into `authStore` right after sign-in; until it resolves
 * `role` is undefined, so the gate is closed by default — admin-only affordances
 * can never flash for a normal user. Granting admin is out-of-band (Firestore
 * console / an admin script); the client never writes `role` (the users `update`
 * rule is admin-only and `create` forbids self-assigning it).
 *
 * ADMIN1 — under dev-bypass (local-only superuser mode; statically `false` in any
 * production build) the gate is OPEN, so admin-only paths are testable locally
 * without a real admin sign-in.
 */

import { useAuthStore } from "@/stores/authStore";
import { DEV_BYPASS_AUTH } from "@/lib/dev-bypass";
import { devActAsUid } from "@/lib/dev-impersonate";

export function useIsAdmin(): boolean {
  const role = useAuthStore((s) => s.profile?.role);
  // DEV-ONLY (remove before release): the act-as-member sandbox (`?devActAs=<uid>`,
  // see `dev-impersonate.ts`) needs NO branch here for the EMULATOR path — it sets
  // the impersonated profile's `role` to `undefined` in `initAuthListener`, so a
  // player impersonation already falls through to a closed gate below, and a DM
  // impersonation gets its DM powers from `dmUid === uid`, not from this admin flag.
  // Under dev-BYPASS the gate is normally OPEN (local superuser, ADMIN1) — but an
  // act-as impersonation must CLOSE it, or the admin override would hand every
  // impersonated player DM powers and the bypass hub could never be seen as a player.
  if (DEV_BYPASS_AUTH) return devActAsUid() === null;
  return role === "admin";
}
