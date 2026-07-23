/**
 * i18n bootstrap — async, lazy-per-locale (R6+R3 SLICE 8).
 *
 * The app loads ONLY the active locale's catalogues at startup:
 *  - the `ui/*.json` shards (merged into the single runtime `common` namespace);
 *  - the `srd/*.json` display catalogues (registered into the `srd-en.ts`
 *    registry the resolver reads).
 * Switching language lazy-loads the OTHER locale's catalogues on demand (the
 * `changeLanguage` wrapper below awaits the load before flipping the language, so
 * a render never sees a raw key). EN is the exception on BOTH axes — it is the
 * canonical FALLBACK for facts AND chrome, so it is ALWAYS loaded:
 *  - EN **srd** is statically bundled in `srd-en.ts` as the canonical FACTS source
 *    the Grant engine parses in any locale;
 *  - EN **common** (the `ui` namespace) is force-loaded in `bootstrap()` (below)
 *    whenever the active locale isn't EN, so prod `fallbackLng: "en"` is actually
 *    functional for ui keys AND any EN canonical chrome ref (`uiText`) safely
 *    resolves in any session.
 * So an EN user pays only EN; an IT user pays EN srd + EN ui + IT ui (no IT-side
 * duplication of facts). See `docs/ARCHITECTURE.md` i18n section.
 *
 * ## i18n completeness LOCKS (`docs/ARCHITECTURE.md`) — UNCHANGED
 * In dev/test a missing key is a BUG: `missingKeyHandler` THROWS and `fallbackLng`
 * is DISABLED, so a missing IT key can NEVER silently render English. In PROD the
 * same bug must never crash a live user, so prod keeps `fallbackLng: "en"` and a
 * NON-throwing handler. The throwing SRD resolver (`localizeSrd`) is similarly
 * unchanged — once a locale is loaded, every lookup resolves exactly as before.
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { asLocale, type Locale } from "@/lib/locale";
import {
  registerSrdCatalogues,
  hasSrdLocale,
  hasSrdKind,
  loadedSrdLocales,
  markLazySrdKindResident,
  registerLazySrdKind,
  residentLazySrdKinds,
  type LazySrdKind,
} from "./srd-en";
import { loadUiResources, loadSrdCatalogues, loadLazySrdKind } from "./loaders";

const isProd = import.meta.env.PROD;

/** Locales whose `ui` namespace has been added to i18next (avoid re-adding). */
const uiLoaded = new Set<Locale>();
/** In-flight `ensureLocale` promises, deduped so a double-call shares one load. */
const inflight = new Map<Locale, Promise<void>>();
/** In-flight `ensureSrdKind` promises, deduped per kind (the ensureLocale pattern). */
const inflightKind = new Map<LazySrdKind, Promise<void>>();

/**
 * Idempotently load a locale's catalogues (ui shards + non-EN srd) and register
 * them (i18next `common` bundle + the srd registry). Resolves once the locale is
 * fully usable. EN srd is statically bundled, so for EN this only loads the ui
 * shards. Concurrent calls for the same locale share one in-flight load.
 */
export function ensureLocale(locale: Locale): Promise<void> {
  if (uiLoaded.has(locale) && hasSrdLocale(locale)) return Promise.resolve();
  const existing = inflight.get(locale);
  if (existing) return existing;
  const task = (async () => {
    const [ui] = await Promise.all([
      loadUiResources(locale),
      hasSrdLocale(locale)
        ? Promise.resolve()
        : loadSrdCatalogues(locale).then((cats) => registerSrdCatalogues(locale, cats)),
    ]);
    // Carry every RESIDENT lazy kind (the lazy SRD-kind tier) into this
    // newly-arriving locale so a language switch AFTER the bestiary was opened
    // lands with the corpus already resolvable — the "load before flip"
    // guarantee, extended to the lazy tier (srd-en.ts). Runs after the srd set is
    // registered so `registerLazySrdKind` has a locale set to attach to.
    await Promise.all(
      residentLazySrdKinds()
        .filter((kind) => !hasSrdKind(locale, kind))
        .map(async (kind) =>
          registerLazySrdKind(locale, kind, await loadLazySrdKind(locale, kind))
        )
    );
    if (!uiLoaded.has(locale)) {
      // `deep: true` keeps any already-present keys; we own the whole bundle so a
      // plain add is fine — but deep+overwrite is safest if re-bootstrapped.
      i18n.addResourceBundle(locale, "common", ui, true, true);
      uiLoaded.add(locale);
    }
  })();
  inflight.set(locale, task);
  void task.finally(() => inflight.delete(locale));
  return task;
}

/**
 * Idempotently load a LAZY SRD kind (e.g. `monster`) for EVERY currently-loaded
 * locale and mark it resident, so (a) later `ensureLocale` calls carry it to
 * newly-arriving locales and (b) an already-switched IT session resolves it
 * immediately. In-flight calls dedupe per kind (the `ensureLocale` pattern). The
 * one seam every lazy-kind consumer awaits (the compendium specs barrel's TLA).
 */
export function ensureSrdKind(kind: LazySrdKind): Promise<void> {
  markLazySrdKindResident(kind); // BEFORE any await (race-proof vs ensureLocale)
  const existing = inflightKind.get(kind);
  if (existing) return existing;
  const task = Promise.all(
    loadedSrdLocales()
      .filter((locale) => !hasSrdKind(locale, kind))
      .map(async (locale) =>
        registerLazySrdKind(locale, kind, await loadLazySrdKind(locale, kind))
      )
  ).then(() => undefined);
  inflightKind.set(kind, task);
  void task.finally(() => inflightKind.delete(kind));
  return task;
}

/**
 * Initialize i18next with NO eager resources, detect the active locale, then load
 * ONLY that locale's catalogues before resolving. The app awaits this promise
 * (`i18nReady`) before its first render so no surface ever renders a raw key.
 */
async function bootstrap(): Promise<typeof i18n> {
  await i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      // Resources are added lazily per locale (see `ensureLocale`) — none eager.
      resources: {},
      partialBundledLanguages: true,
      fallbackLng: isProd ? "en" : false,
      supportedLngs: ["en", "it"],
      defaultNS: "common",
      ns: ["common"],
      returnNull: false,
      saveMissing: true,
      parseMissingKeyHandler: (key) => `⟦${key}⟧`,
      missingKeyHandler: (lngs, ns, key) => {
        const msg = `[i18n] missing key "${key}" in namespace "${ns}" for locale(s) ${lngs.join(", ")}`;
        if (isProd) {
          console.error(msg);
          return;
        }
        throw new Error(msg);
      },
      interpolation: { escapeValue: false },
      detection: {
        order: ["localStorage", "navigator"],
        caches: ["localStorage"],
      },
    });
  await ensureLocale(asLocale(i18n.language));
  // EN `common` is the canonical FALLBACK chrome — always load it (like EN srd)
  // so prod `fallbackLng: "en"` resolves ui keys for real AND any EN canonical
  // chrome ref (`uiText` → `localizeText(..., "en")`) is resolvable in an IT
  // session. EN itself needs no second load (already done above).
  if (asLocale(i18n.language) !== "en") {
    await ensureLocale("en");
  }
  // Keep `<html lang>` honest: mirror the active locale onto the document root so
  // assistive tech, the browser, and SEO see the language actually rendered (the
  // static `lang="en"` in index.html would otherwise lie for an IT user) — and so
  // browser translators correctly skip same-language pages and offer translation
  // only when the user's language genuinely differs. Fires now for the initial
  // locale and on every in-app language switch. (Translation is ALLOWED; the
  // crash class it used to trigger is absorbed by `src/lib/dom-resilience.ts` —
  // issue #24.) Guarded for non-DOM (test) envs.
  const syncDocumentLang = (lng: string): void => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = asLocale(lng);
    }
  };
  syncDocumentLang(i18n.language);
  i18n.on("languageChanged", syncDocumentLang);
  return i18n;
}

/**
 * Resolves when i18next is initialized AND the active locale's catalogues are
 * loaded — the app gates its first render on this (see `main.tsx`). Tests await it
 * too (and additionally `ensureLocale("it")` for IT-render specs).
 */
export const i18nReady: Promise<typeof i18n> = bootstrap();

/**
 * Switch the active language, lazy-loading its catalogues FIRST so the flip never
 * renders a raw key. The single seam every UI language toggle goes through
 * (`useLocale`). Returns once the language is live.
 */
export async function changeLanguage(locale: Locale): Promise<void> {
  await ensureLocale(locale);
  await i18n.changeLanguage(locale);
}

export default i18n;
