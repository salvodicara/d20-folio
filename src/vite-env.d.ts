/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_USE_EMULATORS: string;
  /** "1" shows the new UI (design-system stories at /ui, then the new screens). */
  readonly VITE_NEW_UI?: string;
  /** `runtime` in the production build: the pack is downloaded, not bundled. */
  readonly VITE_CONTENT_PACK?: string;
  /** The runtime pack's content hash (its Storage folder), set by the deploy. */
  readonly VITE_PACK_VERSION?: string;
  /** "owner/repo" issue-tracker override (defaults in `src/lib/github-issue-state.ts`). */
  readonly VITE_GITHUB_REPO?: string;
  /**
   * reCAPTCHA Enterprise (score) site key for Firebase App Check (`src/lib/firebase.ts`). Unset in
   * dev/CI/e2e/forks — App Check only initializes when this is a non-empty string.
   * See docs/BUG_REPORTING.md → "App Check rollout runbook".
   */
  readonly VITE_APPCHECK_SITE_KEY?: string;
  /** Set to "true" to arm the App Check debug-token escape hatch (dev/CI/e2e only). */
  readonly VITE_APPCHECK_DEBUG?: string;
  /** "true" once the combat/spends rules are deployed (cross-device hits ledger). */
  readonly VITE_PEER_SPENDS_LEDGER?: string;
  /** "true" once the v0.26.0 combat-effect rules are deployed (feature target states,
   *  zones, a condition's save DC). */
  readonly VITE_COMBAT_EFFECTS_V26?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** App version, inlined at build time from package.json (see vite.config `define`). */
declare const __APP_VERSION__: string;

/**
 * Build's git commit (short SHA), inlined at build time (see vite.config
 * `define`). "unknown" when git is unavailable. Attached to bug reports (OWN-37).
 */
declare const __GIT_SHA__: string;
