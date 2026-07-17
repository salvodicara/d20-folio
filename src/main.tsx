import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Self-hosted folio fonts (offline-first, zero network) — The Gilded Plate,
// wired to --font-title (Cinzel) / --font-display + --font-body (Alegreya) /
// --font-numeric (Source Serif 4). P3 PERF: the app is EN + IT (both
// latin-script), so only the latin + latin-ext woff2 may enter the Workbox
// precache. The VARIABLE packages' index.css lists every subset per @font-face
// unicode-range (browsers only ever download latin/latin-ext); the unused
// subsets are kept out of the precache by the vite.config.ts globIgnores.
// Cinzel — the ceremonial titling face (variable wght; latin + latin-ext only).
import "@fontsource-variable/cinzel/index.css";
// Alegreya — content headings + body prose (variable wght + its variable italic).
import "@fontsource-variable/alegreya/index.css";
import "@fontsource-variable/alegreya/wght-italic.css";
// Source Serif 4 — numbers / stats / uppercase labels: 400/600 (static,
// per-subset CSS so the unused subsets are never referenced at all).
import "@fontsource/source-serif-4/latin-400.css";
import "@fontsource/source-serif-4/latin-ext-400.css";
import "@fontsource/source-serif-4/latin-600.css";
import "@fontsource/source-serif-4/latin-ext-600.css";
// react-easy-crop's required stylesheet — provides the cropper's absolute /
// contain layout. Without it the container resolves to 0/NaN dimensions and
// the cropper throws on render (white-screening the app). MUST be imported.
import "react-easy-crop/react-easy-crop.css";
import "./index.css";
// SLICE 8: i18n bootstrap is ASYNC + lazy-per-locale — gate the first render on
// `i18nReady` (i18next initialized + the active locale's catalogues loaded) so no
// surface ever paints a raw key. The inline boot-splash in index.html stays
// visible until then.
import { i18nReady } from "./i18n";
// Initialize save store (connects save status callbacks)
import "./stores/saveStore";
import { installDomResilience } from "./lib/dom-resilience";
import { recoverFromChunkPreloadError, CHUNK_RELOAD_FLAG } from "./lib/chunk-recovery";
import { installErrorLog } from "./features/report/error-log";
import { App } from "./App";

// DOM-boundary resilience adapters (issue #24): tolerant removeChild/insertBefore
// wrappers so external DOM mutation (browser auto-translate, grammar/password
// extensions) can never crash a React commit. MUST install BEFORE the first
// React render — the wrappers have to be on Node.prototype before any commit
// runs (the render below is gated behind i18nReady, so this always precedes it).
installDomResilience();

// Boot-resilience (the 2026-07-09 "Clear site data" incident): after the service
// worker's precache is wiped mid-session, a lazy route chunk `import()` can 404, which
// Vite surfaces as `vite:preloadError`. When the one-shot reload is issued,
// `preventDefault` stops Vite's default rethrow (so the error doesn't white-screen
// before the reload lands); when the latch is already armed (this session already
// tried), the error propagates normally → the ErrorBoundary crash screen, never a
// silently-dead route (see `chunk-recovery.ts`).
window.addEventListener("vite:preloadError", (event) => {
  if (recoverFromChunkPreloadError(() => window.location.reload(), sessionStorage)) {
    event.preventDefault();
  }
});

// Start capturing the rolling error-log ring as early as possible (OWN-37) so a
// bug report filed later can attach the recent console/window errors. Pure (no
// network); chains the original console.error so devtools behavior is unchanged.
installErrorLog();

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element not found");

/** How long after boot the chunk-reload latch clears — must outlive the first lazy
 *  route loads (see the comment at the clear below). */
const CHUNK_RELOAD_LATCH_CLEAR_MS = 15_000;

void i18nReady.then(() => {
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>
  );

  // Belt-and-braces boot-splash teardown: rendering into #root already replaces
  // the inline boot splash, but remove any stray `.boot-splash` node after the
  // first paint so a cold start can never leave the d20 splash lingering.
  requestAnimationFrame(() => {
    document.querySelectorAll(".boot-splash").forEach((node) => node.remove());
  });

  // A successful boot restores the one-shot chunk-reload recovery budget so a LATER
  // preload failure (after a future update) can recover once too — but DELAYED well
  // past the first lazy route loads: route chunks fail POST-boot (the shell renders
  // fine, then the navigation `import()` 404s), so clearing the latch at first paint
  // would re-arm the reload for an immediately-refailing chunk and loop
  // (reload → boot OK → clear → same chunk fails → reload → …). Within this window a
  // second failure keeps the latch and falls through to the ErrorBoundary instead.
  setTimeout(() => {
    sessionStorage.removeItem(CHUNK_RELOAD_FLAG);
  }, CHUNK_RELOAD_LATCH_CLEAR_MS);
});
