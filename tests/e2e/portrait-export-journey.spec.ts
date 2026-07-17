/**
 * Portrait round-trip journey — the OWNER'S EXACT REPRO, in a real browser WITH
 * the service worker active (the only condition under which the old bug occurred).
 *
 * The full loop, with the app's REAL units at every step:
 *   1. IMPORT a character JSON with NO portrait (`parseCharacter`);
 *   2. UPLOAD a portrait — the real `uploadPortraitFromBase64` (canvas compression →
 *      `uploadBytes` → `getDownloadURL`) against an emulated Firebase-Storage REST
 *      endpoint, yielding a real tokenized download URL;
 *   3. DISPLAY it as `PortraitImg` does — a NO-CORS `<img>` — so the Workbox runtime
 *      cache stores an OPAQUE (unreadable) response under that exact URL;
 *   4. a FRESH page load (the staleness dimension: memory is gone, only the SW
 *      cache still holds the opaque display entry);
 *   5. EXPORT from the roster path (`buildCharacterExport`) — the portrait MUST
 *      embed as base64. Structurally it always does: the bytes are read through the
 *      Storage SDK (`portraitToDataUrl` → `getBlob`), a token-less request that can
 *      never be served the opaque display-cache entry;
 *   6. RE-IMPORT the exported JSON and prove the portrait DISPLAYS again.
 *
 * Why a live SW (not the dev server the rest of the suite uses): the opaque-cache
 * entry exists ONLY when the real Workbox SW handles the no-cors image request. This
 * spec runs under the `portrait-sw` Playwright projects — a dev server started with
 * `VITE_PWA_DEV=true`, so the REAL generated SW (with the `firebasestorage.*`
 * StaleWhileRevalidate `statuses:[0,200]` portrait cache) is active over the REAL
 * `/src` code. Storage is fulfilled by Playwright CONTEXT routing (only context-level
 * routing intercepts SW-originated requests) with realistic CORS semantics — so the
 * opaqueness comes, exactly as in production, from the no-cors REQUEST mode.
 *
 * Determinism: each test mints a UNIQUE download token, so the tokenized display URL
 * never bleeds between runs (`--repeat-each`, retries).
 */
import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const PNG_BYTES = readFileSync(
  fileURLToPath(new URL("./fixtures/portrait.png", import.meta.url))
);
const PNG_DATA_URL = `data:image/png;base64,${PNG_BYTES.toString("base64")}`;

/**
 * HONEST LIMIT — what this spec does NOT cover: the REAL bucket's CORS config.
 * This emulated endpoint always answers with permissive CORS headers, so the spec
 * stayed green while the production bucket had NO CORS configuration and the SDK's
 * `getBlob` XHR was browser-blocked (the owner's 2026-06-10 repro: ACAO header
 * absent → `net::ERR_FAILED 200 (OK)` → SDK retry loop → no download). Bucket CORS
 * is INFRA, not app code; it is applied + verified OUTSIDE any test, via
 * `scripts/set-storage-cors.mjs` (before/after config print) + a curl OPTIONS/GET
 * preflight against the real bucket asserting `access-control-allow-origin`.
 */
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
  "access-control-allow-headers": "*",
};

/** A unique download token per test so the SW cache is pristine per run. */
function freshToken(): string {
  return `tok-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

/**
 * Emulate the Firebase-Storage REST protocol at the CONTEXT level (only context
 * routing intercepts requests the SERVICE WORKER originates):
 *   - OPTIONS                  → CORS preflight (the SDK's custom headers trigger one);
 *   - POST                     → `uploadBytes` multipart upload → object metadata;
 *   - GET without `alt=media`  → `getDownloadURL` metadata (carries `downloadTokens`);
 *   - GET with `alt=media`     → the image bytes (the display `<img>` AND the SDK read).
 *
 * `serveImage: false` turns every non-preflight response into a 404 (object gone —
 * non-retryable, unlike a 5xx the SDK would back off on for minutes): the "genuinely
 * unreadable portrait" case that must surface to the user, never drop silently.
 */
async function routeStorage(
  page: Page,
  token: string,
  serveImage = true
): Promise<{ urls: () => string[] }> {
  const seen: string[] = [];
  await page.context().route("**/firebasestorage.googleapis.com/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: CORS_HEADERS });
      return;
    }
    seen.push(request.url());
    if (!serveImage) {
      await route.fulfill({
        status: 404,
        headers: CORS_HEADERS,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: 404, message: "Not Found." } }),
      });
      return;
    }
    const url = new URL(request.url());
    if (request.method() === "GET" && url.searchParams.get("alt") === "media") {
      await route.fulfill({
        status: 200,
        headers: {
          ...CORS_HEADERS,
          "content-type": "image/png",
          "cache-control": "public, max-age=86400",
        },
        body: PNG_BYTES,
      });
      return;
    }
    // Upload (POST) and getDownloadURL (GET) both resolve to object metadata.
    await route.fulfill({
      status: 200,
      headers: CORS_HEADERS,
      contentType: "application/json",
      body: JSON.stringify({
        name: "users/u1/portraits/c1.jpeg",
        bucket: "d20-folio.firebasestorage.app",
        contentType: "image/jpeg",
        downloadTokens: token,
      }),
    });
  });
  return { urls: () => [...seen] };
}

/**
 * Boot the SW-controlled page. The first visit registers + activates the SW but
 * isn't yet controlled (no `controller`); a SECOND full navigation lands on a page
 * the SW controls. A full `goto` (not `reload`) is used deliberately — it is stable
 * against the dev server's HMR/SW-update churn that would otherwise destroy a
 * mid-test execution context. Robust across `--repeat-each`.
 */
async function bootControlledPage(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "load" });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.goto("/", { waitUntil: "load" });
  await page.waitForFunction(() => navigator.serviceWorker.controller != null, null, {
    timeout: 20000,
  });
}

/**
 * Page-load 1 — upload + display, with the REAL units. Serialized as a string so the
 * function body carries no closure (Playwright serializes it): the real
 * `uploadPortraitFromBase64` (canvas → uploadBytes → getDownloadURL) mints the
 * download URL, then a NO-CORS `<img>` (what `PortraitImg` renders) displays it and
 * the Workbox SWR cache is polled until the OPAQUE entry lands (the put is async).
 */
const RUN_UPLOAD_AND_DISPLAY = `
  async (pngDataUrl) => {
    const storage = await import("/src/lib/storage.ts");
    const downloadUrl = await storage.uploadPortraitFromBase64("u1", "c1", pngDataUrl);
    const displayed = await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img.naturalWidth > 0);
      img.onerror = () => resolve(false);
      img.src = downloadUrl; // NO crossOrigin → no-cors → opaque SW-cache entry
    });
    let opaqueCached = false;
    for (let i = 0; i < 50 && !opaqueCached; i++) {
      for (const n of await caches.keys()) {
        const resp = await (await caches.open(n)).match(downloadUrl);
        if (resp && resp.type === "opaque") opaqueCached = true;
      }
      if (!opaqueCached) await new Promise((r) => setTimeout(r, 100));
    }
    return { downloadUrl, displayed, opaqueCached };
  }
`;

/**
 * Page-load 2 — export + re-import, with the REAL units. The seed parse IS the
 * owner's step 1 (import a character JSON with NO portrait); the doc then carries
 * the uploaded portrait URL + a crop, exactly like the owner's character. The
 * re-imported base64 is rendered into an `<img>` to prove the portrait DISPLAYS.
 */
const RUN_EXPORT_AND_REIMPORT = `
  async (url) => {
    const io = await import("/src/lib/character-io.ts");
    const seed = io.parseCharacter(JSON.stringify({
      schema: 3,
      build: {
        name: "Owner Hero", race: "human",
        classes: [{ classId: "fighter", level: 1 }], background: "soldier",
        abilities: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
      },
      state: {},
    }));
    if (!seed.success) return { error: "seed parse failed: " + seed.error };
    const crop = { x: 11, y: 22, width: 55, height: 66 };
    const doc = {
      id: "c1", createdAt: new Date(0), updatedAt: new Date(0),
      ...seed.doc, portraitUrl: url, portraitCrop: crop,
    };
    const exported = await io.buildCharacterExport(doc);
    const env = JSON.parse(exported.json);
    const re = io.parseCharacter(exported.json);
    let redisplayed = false;
    if (re.success && re.portraitBase64) {
      redisplayed = await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img.naturalWidth > 0);
        img.onerror = () => resolve(false);
        img.src = re.portraitBase64;
      });
    }
    return {
      portraitDropped: exported.portraitDropped,
      embeddedPortrait: (env.meta && env.meta.portrait) || null,
      embeddedCrop: (env.meta && env.meta.portraitCrop) || null,
      reimportedLen: re.success ? (re.portraitBase64 || "").length : 0,
      reimportedCrop: re.success ? re.portraitCrop : null,
      redisplayed,
    };
  }
`;

interface UploadResult {
  downloadUrl: string;
  displayed: boolean;
  opaqueCached: boolean;
}

interface ExportResult {
  error?: string;
  portraitDropped?: boolean;
  embeddedPortrait?: string | null;
  embeddedCrop?: unknown;
  reimportedLen?: number;
  reimportedCrop?: unknown;
  redisplayed?: boolean;
}

test("full loop: upload → no-cors display poisons SW cache → FRESH page load → export embeds base64 → re-import displays", async ({
  page,
}) => {
  const token = freshToken();
  const storage = await routeStorage(page, token, true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await bootControlledPage(page);

  // LOAD 1 — upload (real canvas + Storage protocol) and display (no-cors <img>).
  const uploaded: UploadResult = await page.evaluate(
    `(${RUN_UPLOAD_AND_DISPLAY})(${JSON.stringify(PNG_DATA_URL)})`
  );
  expect(uploaded.downloadUrl, "upload minted a tokenized download URL").toContain(
    `token=${token}`
  );
  expect(uploaded.displayed, "the uploaded portrait displayed (no-cors img)").toBe(true);
  // The old bug's precondition genuinely holds: the SW cached an OPAQUE entry.
  expect(
    uploaded.opaqueCached,
    "SW cached an opaque portrait entry under the display URL"
  ).toBe(true);

  // LOAD 2 — the STALENESS dimension: a fresh navigation; nothing about the
  // portrait survives in memory, only the SW's opaque display entry remains.
  await page.goto("/", { waitUntil: "load" });

  const result: ExportResult = await page.evaluate(
    `(${RUN_EXPORT_AND_REIMPORT})(${JSON.stringify(uploaded.downloadUrl)})`
  );
  if (result.error) throw new Error(result.error);

  // THE FIX: the export embeds the base64 portrait DESPITE the opaque cache.
  expect(
    result.embeddedPortrait,
    "export embedded the base64 portrait (the owner's bug — empty before the fix)"
  ).toMatch(/^data:image\//);
  expect(result.embeddedCrop, "the framing crop rides with the image").toEqual({
    x: 11,
    y: 22,
    width: 55,
    height: 66,
  });
  expect(result.portraitDropped, "a readable portrait must not be reported dropped").toBe(
    false
  );
  // Re-import recovers the bytes + crop, and the portrait DISPLAYS again.
  expect(
    result.reimportedLen ?? 0,
    "re-import recovered the portrait bytes"
  ).toBeGreaterThan(100);
  expect(result.reimportedCrop).toEqual({ x: 11, y: 22, width: 55, height: 66 });
  expect(result.redisplayed, "the re-imported portrait renders in an <img>").toBe(true);

  // STRUCTURAL pin: the export read the bytes through the Storage SDK — a
  // token-less `alt=media` request that cannot share a cache key with the
  // tokenized display URL, so the opaque entry is unreachable by construction.
  const sdkReads = storage
    .urls()
    .filter((u) => u.includes("alt=media") && !u.includes("token="));
  expect(sdkReads.length, "the SDK's token-less read hit Storage").toBeGreaterThan(0);
});

test("genuinely unreadable portrait (object gone) → export ships and reports the drop (NEVER silent)", async ({
  page,
}) => {
  // Storage 404s everything — the residual failure path the toast covers
  // (`roster.exportPortraitDropped`): offline, or the Storage object was deleted.
  await routeStorage(page, freshToken(), false);
  await bootControlledPage(page);

  const url =
    "https://firebasestorage.googleapis.com/v0/b/d20-folio.firebasestorage.app/o/" +
    `users%2Fu1%2Fportraits%2Fc1.jpeg?alt=media&token=${freshToken()}`;
  const result: ExportResult = await page.evaluate(
    `(${RUN_EXPORT_AND_REIMPORT})(${JSON.stringify(url)})`
  );
  if (result.error) throw new Error(result.error);

  // The file still ships (a faceless export beats a failed export)…
  expect(Boolean(result.embeddedPortrait), "no portrait could be embedded").toBe(false);
  // …but the drop is REPORTED so the UI surfaces it (roster.exportPortraitDropped).
  expect(
    result.portraitDropped,
    "an unreadable portrait must be reported, never silent"
  ).toBe(true);
});
