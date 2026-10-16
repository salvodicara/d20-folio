/**
 * The runtime content pack's browser adapters: Firebase Auth for the `pack`
 * claim, protected Storage for the files, the Cache API for offline, and the
 * "loading content" notice. Imported only by the runtime-mode `@pack` modules
 * (`src/data/pack-runtime*.ts`) and, lazily, by the auth listener.
 */
import { auth } from "@/lib/firebase";
import { createPackSource } from "@/platform/pack-source";
import { showPackWaiting } from "@/platform/pack-waiting";
import type { PackCore } from "@/data/pack-wire";

const VERSION: string = import.meta.env.VITE_PACK_VERSION ?? "";
const CACHE_NAME = "folio-pack";
const cacheUrl = (key: string) => `/__folio-pack/${key}`;
const STORAGE_ORIGIN =
  import.meta.env.VITE_USE_EMULATORS === "true"
    ? "http://127.0.0.1:9199"
    : "https://firebasestorage.googleapis.com";

/**
 * One pack file, with the account's ID token: the request the Storage SDK makes,
 * minus its silent two-minute retry, so a failure reaches the notice at once.
 */
async function download(name: string): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("signed out");
  const object = encodeURIComponent(`content-pack/${VERSION}/${name}`);
  const bucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET;
  const response = await fetch(`${STORAGE_ORIGIN}/v0/b/${bucket}/o/${object}?alt=media`, {
    headers: { Authorization: `Firebase ${await user.getIdToken()}` },
  });
  if (!response.ok) throw new Error(`pack ${name}: HTTP ${response.status}`);
  return response.text();
}

async function hasPackClaim(forceRefresh: boolean): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) return false;
  return (await user.getIdTokenResult(forceRefresh)).claims.pack === true;
}

const source = createPackSource({
  version: VERSION,
  currentUser: async () => {
    await auth.authStateReady();
    const user = auth.currentUser;
    return user ? { uid: user.uid, hasPackClaim } : null;
  },
  download,
  cache: {
    get: async (key) => {
      const hit = await (await caches.open(CACHE_NAME)).match(cacheUrl(key));
      return hit ? await hit.text() : undefined;
    },
    put: async (key, text) => {
      await (await caches.open(CACHE_NAME)).put(cacheUrl(key), new Response(text));
    },
  },
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  showWaiting: showPackWaiting,
});

/** The account the app booted with, and whether it got the pack. */
const boot = (async () => {
  const core = await source.loadCore();
  return { uid: auth.currentUser?.uid ?? null, core };
})();

/** The pack core for this boot (`null` = no pack for this account). */
export const runtimePackCore: Promise<PackCore | null> = boot.then(({ core }) => core);

export const readPackFile = source.readFile;

/**
 * Keep the loaded pack in step with the signed-in account. The pack is read once
 * at boot, so a change of account that changes who may see it reloads the app:
 * signing in with the claim brings the pack in, signing out takes it away (and
 * clears this device's copy).
 */
export async function packFollowsAccount(uid: string | null): Promise<void> {
  const booted = await boot;
  if (uid === booted.uid) return;
  if (booted.core) {
    await caches.delete(CACHE_NAME).catch(() => {});
    window.location.reload();
    return;
  }
  if (uid && (await hasPackClaim(true).catch(() => false))) window.location.reload();
}
