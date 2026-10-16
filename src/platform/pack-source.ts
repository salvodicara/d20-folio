/**
 * Where the runtime content pack comes from, and who gets it.
 *
 * An account gets the private pack only with the `pack` auth claim. Its files
 * are immutable per version, so the cache answers first and the network fills
 * it; after the first load the app works offline. For an allowlisted account a
 * failed download is retried for as long as it takes, behind a loading notice:
 * the owner's rule is that they never play with a silently stripped pack.
 *
 * Pure orchestration over injected deps; the Firebase and browser adapters live
 * in `pack-firebase.ts`.
 */
import { decodeJson, type PackCore } from "@/data/pack-wire";

export interface PackSourceDeps {
  /** The pack version this build was made with (`VITE_PACK_VERSION`). */
  version: string;
  /** The signed-in account, once auth has restored it; `null` when signed out. */
  currentUser: () => Promise<{
    uid: string;
    /** Rejects when the claim cannot be read (offline with an expired token). */
    hasPackClaim: (forceRefresh: boolean) => Promise<boolean>;
  } | null>;
  /** One file from the protected pack folder; rejects on any failure. */
  download: (name: string) => Promise<string>;
  cache: {
    get: (key: string) => Promise<string | undefined>;
    put: (key: string, text: string) => Promise<void>;
  };
  wait: (ms: number) => Promise<void>;
  /** Show or hide the "loading content" notice. */
  showWaiting: (waiting: boolean) => void;
}

export interface PackSourceHandle {
  /** The pack's core for an allowlisted account, else `null`. */
  loadCore: () => Promise<PackCore | null>;
  /** Any other pack file, decoded. Only valid after `loadCore` returned a core. */
  readFile: (name: string) => Promise<unknown>;
  /** Settles once every file is in the cache (after `loadCore`). */
  prefetched: Promise<void>;
}

const MAX_BACKOFF_MS = 30_000;

export function createPackSource(deps: PackSourceDeps): PackSourceHandle {
  let failing = 0;
  let markPrefetched: () => void = () => {};
  const prefetched = new Promise<void>((resolve) => (markPrefetched = resolve));

  /** Cache first, then the network, retrying behind the notice until it lands. */
  async function readText(name: string): Promise<string> {
    const key = `${deps.version}/${name}`;
    const cached = await deps.cache.get(key).catch(() => undefined);
    if (cached !== undefined) return cached;
    let waiting = false;
    for (let attempt = 0; ; attempt++) {
      try {
        const text = await deps.download(name);
        await deps.cache.put(key, text).catch(() => {});
        if (waiting && --failing === 0) deps.showWaiting(false);
        return text;
      } catch {
        if (!waiting) {
          waiting = true;
          if (failing++ === 0) deps.showWaiting(true);
        }
        await deps.wait(Math.min(1_000 * 2 ** attempt, MAX_BACKOFF_MS));
      }
    }
  }

  /**
   * Whether the account holds the `pack` claim. Offline with an expired token the
   * claim cannot be read: then this device's last answer for the account decides,
   * and with none the question is retried behind the notice.
   */
  async function isAllowed(
    user: NonNullable<Awaited<ReturnType<PackSourceDeps["currentUser"]>>>
  ) {
    const memoryKey = `claim:${user.uid}`;
    const ask = async (fresh: boolean) => user.hasPackClaim(fresh).catch(() => undefined);
    let allowed = (await ask(false)) || (await ask(true));
    if (allowed === undefined) {
      const remembered = await deps.cache.get(memoryKey).catch(() => undefined);
      if (remembered !== undefined) return remembered === "yes";
      let waiting = false;
      for (let attempt = 0; allowed === undefined; attempt++) {
        if (!waiting) {
          waiting = true;
          if (failing++ === 0) deps.showWaiting(true);
        }
        await deps.wait(Math.min(1_000 * 2 ** attempt, MAX_BACKOFF_MS));
        allowed = await ask(true);
      }
      if (--failing === 0) deps.showWaiting(false);
    }
    await deps.cache.put(memoryKey, allowed ? "yes" : "no").catch(() => {});
    return allowed;
  }

  async function loadCore(): Promise<PackCore | null> {
    const user = await deps.currentUser();
    if (!user) return null;
    if (!(await isAllowed(user))) return null;
    const core = decodeJson(await readText("core.json")) as PackCore;
    void prefetchAll(core).finally(markPrefetched);
    return core;
  }

  async function prefetchAll(core: PackCore): Promise<void> {
    const names = [
      "en-prose.json",
      ...core.index.srd.map((locale) => `srd-${locale}.json`),
      ...core.index.lazySrd.map(([locale, kind]) => `lazy-${kind}-${locale}.json`),
    ];
    await Promise.all(names.map((name) => readText(name)));
  }

  return {
    loadCore,
    readFile: async (name) => decodeJson(await readText(name)),
    prefetched,
  };
}
