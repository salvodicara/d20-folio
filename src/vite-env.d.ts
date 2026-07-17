/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_USE_EMULATORS: string;
  /** "owner/repo" issue-tracker override (defaults in `src/lib/github-issue-state.ts`). */
  readonly VITE_GITHUB_REPO?: string;
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
