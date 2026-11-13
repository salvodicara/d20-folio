/**
 * «A new version is available — Reload». The service worker updates itself
 * (`registerType: "autoUpdate"`: skip waiting, claim the clients), so after a deploy the
 * new worker takes over a page that still runs the old code. That takeover is the
 * signal: a page an older worker already controlled now runs behind, and the bar offers
 * the reload. The page's very first worker taking control (a first visit) is not an
 * update. Coming back to the app (a tab left open for days) asks the browser to look
 * for a new worker, at most once a minute, so the bar appears without a navigation.
 */

/** How often coming back to the app may ask for a new worker. */
const CHECK_EVERY_MS = 60_000;

interface UpdateEnv {
  serviceWorker: {
    controller: unknown;
    addEventListener(type: "controllerchange", listener: () => void): void;
    getRegistration(): Promise<{ update(): Promise<unknown> } | undefined>;
  };
  document: {
    visibilityState: DocumentVisibilityState;
    addEventListener(type: "visibilitychange", listener: () => void): void;
  };
  now(): number;
}

export interface AppUpdateWatch {
  /** A new version is live and the bar is not closed. */
  ready: () => boolean;
  /** Close the bar until the next new version. */
  dismiss: () => void;
  subscribe: (listener: () => void) => () => void;
}

export function createAppUpdateWatch(env: UpdateEnv): AppUpdateWatch {
  let controlled = env.serviceWorker.controller != null;
  let ready = false;
  let lastCheck = -Infinity;
  const listeners = new Set<() => void>();
  const set = (next: boolean): void => {
    if (ready === next) return;
    ready = next;
    for (const listener of listeners) listener();
  };
  env.serviceWorker.addEventListener("controllerchange", () => {
    if (controlled) set(true);
    controlled = true;
  });
  env.document.addEventListener("visibilitychange", () => {
    if (env.document.visibilityState !== "visible") return;
    const now = env.now();
    if (now - lastCheck < CHECK_EVERY_MS) return;
    lastCheck = now;
    void env.serviceWorker
      .getRegistration()
      .then((registration) => registration?.update())
      .catch(() => undefined);
  });
  return {
    ready: () => ready,
    dismiss: () => set(false),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const idle: AppUpdateWatch = {
  ready: () => false,
  dismiss: () => undefined,
  subscribe: () => () => undefined,
};

/** The app's one watch; inert where there is no service worker (dev, old browsers). */
export const appUpdate: AppUpdateWatch =
  typeof navigator !== "undefined" && "serviceWorker" in navigator
    ? createAppUpdateWatch({
        serviceWorker: navigator.serviceWorker,
        document,
        now: () => Date.now(),
      })
    : idle;

/**
 * Reload once the writes still on their way are on the server, `capMs` at most. An
 * action tapped a moment before «Reload» may not have left yet (#1178); offline, the
 * writes wait in the local queue and the cap lets the reload happen anyway.
 */
export async function reloadWhenSaved(
  pendingWrites: () => Promise<void>,
  reload: () => void,
  capMs: number
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cap = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, capMs);
  });
  await Promise.race([pendingWrites().catch(() => undefined), cap]);
  clearTimeout(timer);
  reload();
}

/** The app's Reload: the Firestore writes first (their module loads on demand). */
export function reloadApp(): void {
  void reloadWhenSaved(
    () => import("@/lib/pending-writes-io").then(({ pendingWrites }) => pendingWrites()),
    () => window.location.reload(),
    3_000
  );
}
