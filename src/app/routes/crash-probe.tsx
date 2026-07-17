/**
 * CrashProbe — a DEV-ONLY route element that throws on render.
 *
 * The two error screens (the in-shell region `errorElement` and the fullscreen
 * root net) are real user-facing surfaces — they carry recovery actions AND the
 * pre-filled crash-report entry — but they were unreachable by any harness, so
 * they had ZERO a11y/visual/locale coverage. This probe makes them drivable
 * (golden rule 15: build the seam): `/_crash` throws inside the in-shell error
 * net (region fallback, nav survives); `/_crash-root` throws directly under the
 * root net (fullscreen fallback).
 *
 * Both routes are mounted behind `import.meta.env.DEV` in router.tsx, so they
 * do not exist in the production bundle — Vite folds the condition at build time.
 */
export function CrashProbe(): never {
  throw new Error("Crash probe: forced render error (dev-only)");
}
