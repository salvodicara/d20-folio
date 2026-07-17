/**
 * collect-debug-context — gather a sanitized snapshot of the client's state to
 * attach to a bug report (OWN-37).
 *
 * This is a PURE module by design:
 *  - NO Firebase / network import (so it's unit-tested in CI with
 *    `VITE_FIREBASE_API_KEY` unset — see `tests/unit/pure-modules-guard.test.ts`).
 *  - It only READS ambient browser state (location, navigator, localStorage,
 *    serviceWorker) plus the in-memory `error-log` ring; it never mutates
 *    anything and never sends anything.
 *  - Output is plain, JSON-serializable, undefined-stripped data — ready to drop
 *    straight into a Firestore document.
 *
 * What it captures (transparency: this is exactly what the report dialog's
 * "what we'll attach" disclosure lists):
 *  - route / pathname + IDs parsed from the path (characterId, campaignId)
 *  - app version + build SHA (from Vite `define`s)
 *  - userAgent + viewport WxH
 *  - theme + locale (read from the SAME localStorage keys the app persists to)
 *  - online status, serviceWorker controller presence
 *  - the recent error-log entries
 *
 * It is deliberately TOLERANT: every read is guarded so a missing API (SSR,
 * jsdom, a locked-down browser) yields a safe default rather than throwing.
 */

import { getErrorLog, type ErrorLogEntry } from "./error-log";
import { stripUndefined } from "@/lib/strip-undefined";

/** The persisted UI store key (see `src/stores/uiStore.ts` → persist name). */
const UI_STORE_KEY = "d20-folio-ui";
/** i18next's language-detector cache key. */
const I18N_LNG_KEY = "i18nextLng";

export interface DebugContext {
  /** Full path + query, e.g. "/characters/abc123?tab=spells". */
  url: string;
  /** Pathname only, e.g. "/characters/abc123". */
  pathname: string;
  /** Parsed from the path when present (single-user scope; never the doc body). */
  characterId?: string;
  campaignId?: string;
  /** App version inlined at build time (package.json). */
  appVersion: string;
  /** Build git SHA inlined at build time ("unknown" when git was unavailable). */
  gitSha: string;
  /** Vite mode — "production" in a deployed build, "development"/"test" otherwise. */
  mode: string;
  /** Raw UA string (already non-PII; helps reproduce browser-specific bugs). */
  userAgent: string;
  /** Inner viewport, e.g. "1280x720". */
  viewport: string;
  /** Device pixel ratio (helps reproduce hi-dpi rendering bugs). */
  dpr: number;
  /** "dark" | "light" | "system" — read from the persisted UI store. */
  theme: string;
  /** "en" | "it" (or whatever i18next resolved). */
  locale: string;
  /** navigator.onLine at capture time. */
  online: boolean;
  /** Whether a service worker is actively controlling the page. */
  serviceWorker: boolean;
  /** Most-recent client errors (oldest → newest), already truncated + redacted. */
  recentErrors: ErrorLogEntry[];
  /** Capture timestamp (epoch ms). */
  capturedAt: number;
}

/** Parse `/characters/:id` and `/campaigns/:id` out of a pathname. */
function parseIds(pathname: string): { characterId?: string; campaignId?: string } {
  const out: { characterId?: string; campaignId?: string } = {};
  // Avoid matching the static `/characters/new` route as an id.
  const charMatch = /\/characters\/([^/?#]+)/.exec(pathname);
  if (charMatch?.[1] && charMatch[1] !== "new") out.characterId = charMatch[1];
  const campMatch = /\/campaigns\/([^/?#]+)/.exec(pathname);
  if (campMatch?.[1]) out.campaignId = campMatch[1];
  return out;
}

/**
 * Loosely-typed view of the global scope so our DEFENSIVE guards (a missing
 * `localStorage` / `navigator` under SSR or a locked-down browser) stay legal —
 * the DOM lib types these as always-present, which would otherwise flag every
 * guard as an "unnecessary condition". The runtime checks remain real.
 */
const g = globalThis as unknown as {
  localStorage?: Storage;
  location?: Location;
  navigator?: Navigator;
  window?: Window;
};

/** Read a JSON value out of localStorage, tolerating absent/corrupt entries. */
function readJson(key: string): unknown {
  try {
    const raw = g.localStorage?.getItem(key);
    return raw == null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** The persisted theme, read from the zustand-persist envelope `{ state, version }`. */
function readTheme(): string {
  const parsed = readJson(UI_STORE_KEY);
  if (parsed && typeof parsed === "object" && "state" in parsed) {
    const state = (parsed as { state?: unknown }).state;
    if (state && typeof state === "object" && "theme" in state) {
      const theme = (state as { theme?: unknown }).theme;
      if (typeof theme === "string") return theme;
    }
  }
  return "unknown";
}

/** The persisted locale (i18next stores the bare language string). */
function readLocale(): string {
  try {
    const raw = g.localStorage?.getItem(I18N_LNG_KEY);
    return raw && raw.trim() ? raw : "unknown";
  } catch {
    return "unknown";
  }
}

/** A non-empty string fallback for build-time defines (guards a missing define). */
function safeString(value: unknown, fallback: string): string {
  return typeof value === "string" && value ? value : fallback;
}

/**
 * Build the debug context. Pure read-only; safe to call any time. Every browser
 * read is guarded (via the loose `g` view) so a missing API never throws.
 */
export function collectDebugContext(): DebugContext {
  const loc = g.location;
  const pathname = loc?.pathname ?? "/";
  const url = loc ? `${loc.pathname}${loc.search}` : pathname;
  const nav = g.navigator;
  const win = g.window;

  const { characterId, campaignId } = parseIds(pathname);

  const ctx: DebugContext = {
    url,
    pathname,
    characterId,
    campaignId,
    // The defines are injected by Vite/Vitest; `safeString` guards a build that
    // somehow shipped without them (rather than a raw ReferenceError).
    appVersion: safeString(__APP_VERSION__, "unknown"),
    gitSha: safeString(__GIT_SHA__, "unknown"),
    mode: safeString(import.meta.env.MODE, "unknown"),
    userAgent: nav?.userAgent ?? "unknown",
    viewport: win ? `${win.innerWidth}x${win.innerHeight}` : "unknown",
    dpr: win?.devicePixelRatio ?? 1,
    theme: readTheme(),
    locale: readLocale(),
    online: nav?.onLine ?? true,
    // `navigator.serviceWorker` is undefined in non-secure contexts, so read it
    // through a loose view — the DOM lib types it as always-present.
    serviceWorker: Boolean(
      (nav as { serviceWorker?: ServiceWorkerContainer } | undefined)?.serviceWorker
        ?.controller
    ),
    recentErrors: getErrorLog(),
    capturedAt: Date.now(),
  };

  // Strip undefined so the object drops straight into Firestore (which rejects
  // `undefined`). stripUndefined returns `unknown`; one cast restores the shape
  // (it only removes absent optional keys — characterId / campaignId).
  return stripUndefined(ctx) as DebugContext;
}
