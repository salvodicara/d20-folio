import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "path";
import { runI18nChecks } from "./scripts/i18n/check-i18n.ts";
import { fsAllowRoots, packAliasTarget } from "./scripts/content-pack-mode.ts";

// i18n build-time LEAK-LOCK (`docs/ARCHITECTURE.md` → i18n-completeness lock 6): fail `vite build` RED on
// ANY untranslated string. Runs the ONE shared detector set (`scripts/i18n/` —
// the same module the parity/dedup unit guards import, so the leak logic can never
// drift between "fails the build" and "fails CI"). Build-only (`apply: "build"`)
// so it never touches the dev server or HMR — the cost is paid once, where it
// guards the bundle a user actually receives (golden rule 14).
function i18nLeakLock(): Plugin {
  return {
    name: "i18n-leak-lock",
    apply: "build",
    buildStart() {
      const problems = runI18nChecks();
      if (problems.length) {
        this.error(
          "i18n leak-lock FAILED — the build cannot ship an untranslated string:\n\n" +
            problems.map((p) => "  • " + p).join("\n") +
            "\n\nFix the leak (translate via the IT SRD 5.2.1 cascade — never leave " +
            "IT == English), or add the missing key to BOTH en/it ui/<group>.json shards."
        );
      }
    },
  };
}

// The app version (shown discreetly in the footer colophon, D41) — read from
// package.json at build time and inlined via `define` so there's no runtime import.
const pkgVersion = (
  JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8")) as {
    version: string;
  }
).version;

// The build's git commit (OWN-37) — attached to a bug report so a maintainer
// knows exactly which build a user filed against. Resolved at config time with a
// SAFE fallback chain: an explicit env (CI sets GITHUB_SHA) → `git rev-parse` →
// "unknown" if git is unavailable (e.g. a source tarball). Never breaks the build.
function resolveGitSha(): string {
  const envSha = process.env.VITE_GIT_SHA ?? process.env.GITHUB_SHA;
  if (envSha) return envSha.slice(0, 12);
  try {
    return execSync("git rev-parse --short=12 HEAD", {
      cwd: path.dirname(new URL(import.meta.url).pathname),
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkgVersion),
    __GIT_SHA__: JSON.stringify(resolveGitSha()),
  },
  plugins: [
    i18nLeakLock(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      // Off by default in dev (the SW would intercept HMR + stale-cache the dev
      // bundle). The portrait-export E2E sets VITE_PWA_DEV=true so the dev server
      // serves the REAL Workbox SW — the only way to exercise the no-cors-img →
      // opaque-runtime-cache → export-fetch path against the real `/src` export
      // code (the owner's bug runs ONLY with the SW active). Scoped to that one
      // harness; normal `pnpm dev` and every other E2E are unaffected.
      devOptions: { enabled: process.env.VITE_PWA_DEV === "true", type: "module" },
      includeAssets: ["icons/*.png", "og-image.png"],
      manifest: {
        name: "d20 Folio",
        short_name: "d20 Folio",
        description:
          "A modern D&D 2024 character sheet manager with SRD database, cloud sync, and party features.",
        theme_color: "#0c0a07",
        background_color: "#0c0a07",
        display: "standalone",
        scope: "/",
        start_url: "/",
        // The gilt-d20-on-umber-crest emblem (OWN-27). PNGs are the install icons
        // (broadest launcher support); the maskable variant is a SQUARE full-bleed
        // umber so the launcher applies its own mask with the d20 kept in the safe
        // zone; a scalable SVG is offered last for crisp rendering where supported.
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/icons/icon-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "/icons/icon-512.svg",
            sizes: "any",
            type: "image/svg+xml",
          },
        ],
      },
      workbox: {
        // `webp` included (#59 F14) — the app-wide candlelit backdrop, parchment
        // texture, login + campaign art are all .webp; excluding them broke
        // offline-first (the shell loaded but its art 404'd offline / was evictable).
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,woff2}"],
        // The PDF-export chunk (renderer + embedded fonts + pdf-lib + fontkit, ~1.3
        // MiB) is a rare, lazily-imported action — keep it OUT of the eager precache
        // so most users never download it. It is runtime-cached on first export (the
        // CacheFirst rule below), so offline export still works after one online use.
        globIgnores: [
          "**/character-pdf-*.js",
          // The variable-font packages (Cinzel/Alegreya) reference EVERY script
          // subset from one index.css (unicode-range keeps browsers on
          // latin/latin-ext for EN+IT) — keep the never-rendered subsets out of
          // the offline precache (~190 KiB of cyrillic/greek/vietnamese woff2).
          "**/alegreya-cyrillic*",
          "**/alegreya-greek*",
          "**/alegreya-vietnamese*",
        ],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // 4 MiB — bundle is ~2.1 MiB
        runtimeCaching: [
          {
            // the lazily-loaded PDF-export chunk (excluded from precache above)
            urlPattern: /\/assets\/character-pdf-.*\.js$/,
            handler: "CacheFirst",
            options: {
              cacheName: "pdf-export-cache",
              expiration: { maxEntries: 6, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "gstatic-fonts-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          // PERF1 — character portraits live in Firebase Storage. Without a runtime
          // cache the roster re-fetched each JPEG on every navigation, so a portrait
          // "took a while to appear". StaleWhileRevalidate serves the cached image
          // INSTANTLY (and offline) on repeat visits while refreshing it in the
          // background, so a re-uploaded portrait still updates next load.
          //
          // statuses: [0, 200] — the display <img> is NO-CORS, so its response is
          // OPAQUE (status 0); caching it is what gives offline + instant-repeat
          // portraits. The JSON export never touches this cache: it reads portrait
          // bytes through the Storage SDK (`portraitToDataUrl` in lib/storage), whose
          // token-less request can't share a cache key with the display URL. Keeping
          // the <img> no-cors avoids the deploy-transition CORS breakage a crossOrigin
          // display request causes.
          {
            urlPattern: /^https:\/\/firebasestorage\.googleapis\.com\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "portrait-image-cache",
              expiration: {
                maxEntries: 200, // a large roster + party snapshots
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                purgeOnQuotaError: true,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          // The signed-in user's Google profile photo (topbar + account avatar) —
          // same class of user image, same instant-on-repeat treatment.
          {
            urlPattern: /^https:\/\/(lh3|lh4|lh5|lh6)\.googleusercontent\.com\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "profile-photo-cache",
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 30,
                purgeOnQuotaError: true,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // The content-pack seam (docs/ARCHITECTURE.md): the private pack when
      // present/enabled, else the typed-empty stub (the SRD-only build).
      "@pack": packAliasTarget(),
    },
  },
  // The dev server serves modules by REAL path; allow the pack's real
  // directory (a symlink into the private content repo — the vitest lanes
  // instead resolve with preserveSymlinks, vitest.config.ts).
  server: { fs: { allow: fsAllowRoots() } },
  build: {
    // CODE-SPLIT — split the SRD database, the Firebase SDK, and React-vendor
    // code into their own long-cacheable chunks. The dynamic-import shape on
    // each sheet route is preserved (sheet pages still lazy-load via
    // React.lazy in router.tsx), so this is an additive split: every chunk
    // remains synchronously importable, just in a separate file the browser
    // can cache independently and parallel-fetch.
    rollupOptions: {
      output: {
        // Rolldown (Vite 8's bundler) requires manualChunks as a function.
        // Pattern: bucket modules by their pathname; everything else falls
        // through to the default chunking heuristic.
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (/[\\/]firebase[\\/]/.test(id)) return "firebase";
            if (/[\\/](react|react-dom|react-router|i18next|zustand)[\\/]/.test(id))
              return "react-vendor";
            // Radix Dialog + its scroll-lock/focus-scope closure (react-remove-scroll,
            // react-style-singleton, aria-hidden, use-sidecar, focus-scope, …) is the
            // heavy runtime behind the folio modal shell. The global confirm modal
            // (`ConfirmDialog`, mounted eagerly in the app shell) makes it eager-
            // REACHABLE, but it must NOT inline into the ENTRY chunk — keep it in its
            // own cacheable, parallel-fetched `modal-shell` chunk (the rolldown
            // heuristic split it out on its own until a graph-shape change inlined it,
            // ballooning the entry past its ceiling). See bundle-budget.guard.test.ts.
            if (/[\\/]@radix-ui[\\/]react-dialog[\\/]/.test(id)) return "modal-shell";
            return undefined;
          }
          // The first-party modal shell that wraps Radix Dialog — co-locate it with
          // its vendor runtime in the `modal-shell` chunk (see above) so the eager
          // global confirm modal never drags the dialog stack into the entry chunk.
          if (
            /[\\/]src[\\/]components[\\/]shared[\\/]ModalShell\.tsx$/.test(id) ||
            /[\\/]src[\\/]components[\\/]ui[\\/]modal-head\.tsx$/.test(id)
          )
            return "modal-shell";
          // The cockpit COMBAT ENGINE + its presenters (smart-tracker, the combat /
          // level-up / inventory view-models, the per-step pick resolvers). It is
          // eager-REACHABLE only through cockpit-only store actions (e.g.
          // `recoverTrackerByAltCost` → `resolveTrackers`), so — exactly like
          // `modal-shell` above — it must NOT inline into the ENTRY chunk: the id-storage
          // refactor changed the module graph and the rolldown heuristic pulled this
          // ~230 KB engine into the entry script, ballooning it past its ceiling. Pin it
          // to its own cacheable, parallel-fetched chunk so the roster landing's entry
          // script never carries the cockpit engine. `srd-i18n` is deliberately NOT here
          // (the roster needs its class/race name resolvers eagerly). See
          // bundle-budget.guard.test.ts.
          if (
            /[\\/]src[\\/]lib[\\/]smart-tracker\.ts$/.test(id) ||
            /[\\/]src[\\/]lib[\\/]views[\\/](combat-action-view|tracker-view|rider-view|weapon-facts-view|cunning-strike-view|inventory-view|level-up-view)\.ts$/.test(
              id
            ) ||
            /[\\/]src[\\/]lib[\\/](invocation-pick|maneuver-pick|metamagic-pick|weapon-mastery-pick|signature-spells-pick|spell-mastery-pick|subclass-spellcasting|fighting-style|spell-combat-castable)\.ts$/.test(
              id
            )
          )
            return "cockpit-engine";
          // Content-pack data rides the SAME domain chunks as its public
          // counterpart (below), so the composed build's chunk shape mirrors
          // the pre-split one. Pack i18n/fixtures stay on the default
          // heuristic (EN merges eagerly via srd-en; IT + fixtures stay lazy).
          if (/[\\/]content-pack[\\/]data[\\/]/.test(id)) {
            if (
              /[\\/]data[\\/](races|backgrounds|background-equipment|names)\.ts$/.test(id)
            )
              return "srd-identity";
            if (
              /[\\/]data[\\/]classes[\\/]/.test(id) ||
              /[\\/]data[\\/]classes\.ts$/.test(id)
            )
              return "srd-classes";
            if (/[\\/]data[\\/](feats|maneuvers)\.ts$/.test(id))
              return "srd-class-options";
            return "srd-content";
          }
          // SRD database — DOMAIN-SPLIT (was one ~1.9 MB / 450 KB-gzip monolith).
          // A single chunk forced every route that touched ANY datum (e.g. the
          // roster, which needs only class/race/background NAMES via srd-i18n) to
          // download the whole SRD, including the heavy spell + magic-item corpora.
          // Splitting by domain lets each route pull only what it imports and the
          // browser parallel-fetch + independently cache each piece.
          if (/[\\/]src[\\/]data[\\/]/.test(id)) {
            // Light "identity" data the ROSTER glance needs (species/background
            // NAMES via srd-i18n). Kept in its own chunk so the landing page never
            // downloads the heavy spell/magic-item corpora. Rolldown keeps it
            // separate because the roster reaches it WITHOUT the cockpit-only data
            // (a distinct reachability signature — same reason srd-classes splits).
            // Conditions are the ONE datum the always-eager character store needs
            // (condition effects). Keep them in a tiny standalone chunk so the
            // store doesn't drag races/backgrounds onto the initial bundle.
            if (/[\\/]data[\\/]conditions\.ts$/.test(id)) return "srd-conditions";
            if (/[\\/]data[\\/](races|backgrounds|cover)\.ts$/.test(id))
              return "srd-identity";
            if (/[\\/]data[\\/]classes[\\/]/.test(id)) return "srd-classes"; // class tables + features
            if (/[\\/]data[\\/](feats|invocations|maneuvers|metamagic)\.ts$/.test(id))
              return "srd-class-options"; // feats + class-option pools
            // Heavy cockpit/compendium-only content: spells + magic-items +
            // equipment/weapons/armor/gear + the index files. The roster never
            // imports any of this, so it never pays for it.
            return "srd-content";
          }
          return undefined;
        },
      },
    },
    // Splits above land each chunk well under the prior 500 KB warning;
    // raise the threshold a touch to silence post-split warnings for chunks
    // that still legitimately near the boundary.
    chunkSizeWarningLimit: 600,
  },
});
