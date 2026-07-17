/**
 * Dev Mode Bypass
 *
 * When VITE_DEV_BYPASS_AUTH=true (local dev only):
 * - AuthGuard is bypassed (no login required)
 * - A fake user is injected into the auth store
 * - The mock character is loaded directly (no Firestore)
 *
 * This allows monitoring the UI without needing Firebase Auth/Firestore.
 * NEVER enable this in production.
 */

export const DEV_BYPASS_AUTH =
  import.meta.env.DEV && import.meta.env.VITE_DEV_BYPASS_AUTH === "true";

/**
 * A dev-only "Google photo" for the bypass user — a figure-on-gradient SVG data URI
 * (clearly a photo, not the tinted-initial fallback). Lets the topbar avatar AND the
 * Owner-7 party-avatar path (player-with-no-character → Google photo) render in bypass
 * mode, where the mock user otherwise has no `photoURL`.
 */
export const DEV_BYPASS_PHOTO_URL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%234a3a6a'/%3E%3Cstop offset='1' stop-color='%23c9a227'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='64' height='64' fill='url(%23g)'/%3E%3Ccircle cx='32' cy='24' r='11' fill='%23fff' opacity='0.88'/%3E%3Cpath d='M13 57c0-11 8-19 19-19s19 8 19 19z' fill='%23fff' opacity='0.88'/%3E%3C/svg%3E";
