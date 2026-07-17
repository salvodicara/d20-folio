/**
 * error-log — a tiny in-memory ring buffer of the most recent client errors
 * (OWN-37). When a player files a bug report, the last few errors that fired in
 * their session are the single most useful signal a maintainer can have — so we
 * keep a rolling, PII-light log of `console.error`, `window.onerror`, and
 * unhandled promise rejections.
 *
 * Design constraints:
 *  - PURE-ish: NO Firebase / network import. It only touches `globalThis`
 *    (console + window). This keeps `collect-debug-context.ts` — which reads the
 *    buffer — unit-testable in CI without Firebase env vars (pure-modules guard).
 *  - Bounded: a fixed-size ring (default 15). Old entries are dropped, so the
 *    buffer can never grow without bound across a long session.
 *  - PII-light: messages are truncated to a hard cap and we store ONLY the
 *    stringified message (never arbitrary object graphs, DOM nodes, or stack
 *    frames that could carry user data). We also drop anything that looks like a
 *    token/email via a light redaction pass.
 *  - Idempotent install: `installErrorLog()` wraps the console / window hooks
 *    exactly once even if called twice (HMR, double-mount under StrictMode).
 *
 * It does NOT replace the real console — it chains: the original `console.error`
 * still runs, so devtools behavior is unchanged.
 */

/** A single captured error: when it happened + a truncated, redacted message. */
export interface ErrorLogEntry {
  /** Epoch milliseconds the entry was captured. */
  t: number;
  /** Where it came from — console.error, a window error, or a rejection. */
  source: "console" | "window" | "unhandledrejection";
  /** Truncated, redacted message (never an object graph). */
  message: string;
}

/** Hard cap on a single message's length — keeps Firestore docs tiny + PII-light. */
const MAX_MESSAGE_LEN = 300;
/** How many entries the ring holds. */
const DEFAULT_CAPACITY = 15;

let capacity = DEFAULT_CAPACITY;
let buffer: ErrorLogEntry[] = [];
let installed = false;

/**
 * Light redaction so an error string that happens to embed a credential or
 * email never lands in a report. This is best-effort hygiene, not security:
 *  - bearer-ish tokens (long base64url / JWT-like runs) → `[redacted]`
 *  - email addresses → `[email]`
 */
function redact(text: string): string {
  return text
    .replace(/\b[A-Za-z0-9._-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[email]")
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, "[redacted]");
}

/** Coerce any thrown/console argument into a short, safe string. */
function toMessage(args: unknown[]): string {
  const parts = args.map((a) => {
    if (a == null) return String(a);
    if (typeof a === "string") return a;
    if (a instanceof Error) return `${a.name}: ${a.message}`;
    if (typeof a === "number" || typeof a === "boolean") return String(a);
    // Avoid serializing big/cyclic object graphs — a shallow tag is plenty.
    try {
      const json = JSON.stringify(a);
      return typeof json === "string" ? json : Object.prototype.toString.call(a);
    } catch {
      return Object.prototype.toString.call(a);
    }
  });
  const joined = redact(parts.join(" "));
  return joined.length > MAX_MESSAGE_LEN
    ? `${joined.slice(0, MAX_MESSAGE_LEN - 1)}…`
    : joined;
}

/** Push an entry, evicting the oldest once the ring is full. */
function record(source: ErrorLogEntry["source"], args: unknown[]): void {
  const message = toMessage(args);
  if (!message) return;
  // React-Compiler-safe: this is an explicit side-effecting log call, never run
  // during render. `Date.now()` here is intentional (we want the real clock).
  buffer.push({ t: Date.now(), source, message });
  if (buffer.length > capacity) buffer.shift();
}

/**
 * Install the global capture hooks exactly once. Safe to call from app startup
 * (e.g. `main.tsx`). Returns an uninstall function (mostly for tests).
 *
 * @param opts.capacity override the ring size (default 15).
 */
export function installErrorLog(opts?: { capacity?: number }): () => void {
  if (opts?.capacity && opts.capacity > 0) capacity = opts.capacity;
  if (installed) return () => undefined;
  installed = true;

  // Guard for non-DOM environments (the module may be imported in a unit test
  // that never touches the window).
  const hasWindow = typeof window !== "undefined";

  // Chain console.error — keep the original behavior, then record.
  const originalConsoleError = console.error.bind(console);
  const patchedConsoleError = (...args: unknown[]): void => {
    record("console", args);
    originalConsoleError(...args);
  };
  console.error = patchedConsoleError as typeof console.error;

  const onError = (event: ErrorEvent): void => {
    record("window", [event.message || event.error || "window error"]);
  };
  const onRejection = (event: PromiseRejectionEvent): void => {
    record("unhandledrejection", [event.reason ?? "unhandled rejection"]);
  };

  if (hasWindow) {
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
  }

  return () => {
    if (console.error === patchedConsoleError) console.error = originalConsoleError;
    if (hasWindow) {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    }
    installed = false;
  };
}

/** A defensive copy of the current ring, oldest → newest. */
export function getErrorLog(): ErrorLogEntry[] {
  return buffer.slice();
}

/** Clear the ring (used by tests; harmless in app code). */
export function clearErrorLog(): void {
  buffer = [];
}
