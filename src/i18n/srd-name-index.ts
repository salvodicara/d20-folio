/**
 * The SRD NAME catalogues (class, subclass, race, background) the name index
 * (`src/data/srd-names.ts`) reads, per locale.
 *
 * A locale's names are available once its SRD set is in the registry (EN always,
 * the active locale from boot), or once {@link loadNameLocales} has fetched its
 * four name shards on demand. That on-demand path is the read seam's: a stored
 * label in a language that isn't loaded ("Elfo" in an English session) makes the
 * seam await the other locales' names before it parses, so the label still
 * resolves to its id while only the active locale's names ride the startup
 * bundle. The shards are the same modules the locale loader splits, so the
 * on-demand fetch adds no file.
 *
 * Locale-INDEPENDENT like `srd-en.ts`: it serves every language it holds and
 * never reads the active locale, which is why engine-core may import it
 * (architecture-direction.guard). The fetched shards compose with the content
 * pack's additions and overlay patches, exactly as the full catalogues do.
 */
// `./srd-en` first: it enters the `@pack` ↔ `srd-en` cycle from the side that
// initialises (as the app entry does), so a fresh import of this module works.
import { hasSrdLocale, srdCatalogues, type SrdCatalogue } from "./srd-en";
import { LOCALES, type Locale } from "@/lib/locale";
import { mergeCatalogue } from "@/lib/pack-merge";
import { loadPackSrdCatalogues, srdOverlay } from "@pack";

export type NameKind = "class" | "subclass" | "race" | "background";

type NameShards = Record<NameKind, SrdCatalogue>;

const json = (m: { default: unknown }): SrdCatalogue => m.default as SrdCatalogue;

/**
 * Each locale's name shards, fetched on demand. Keyed by every registered locale
 * (a new language is a type error here until its shards are wired); `null` for
 * the source locale, whose catalogues are always in the registry.
 */
const NAME_SHARD_LOADERS: Record<Locale, (() => Promise<NameShards>) | null> = {
  en: null,
  it: async () => {
    const [classes, subclasses, races, backgrounds] = await Promise.all([
      import("./it/srd/classes.json"),
      import("./it/srd/subclasses.json"),
      import("./it/srd/races.json"),
      import("./it/srd/backgrounds.json"),
    ]);
    return {
      class: json(classes),
      subclass: json(subclasses),
      race: json(races),
      background: json(backgrounds),
    };
  },
};

/** Locales whose names were fetched on demand (not via a full locale load). */
const FETCHED = new Map<Locale, NameShards>();

/** The locales whose names are available right now. */
export function nameLocales(): Locale[] {
  return LOCALES.filter((locale) => hasSrdLocale(locale) || FETCHED.has(locale));
}

/** One locale's `kind` catalogue, or `undefined` while its names aren't loaded. */
export function srdNameCatalogue(
  locale: Locale,
  kind: NameKind
): SrdCatalogue | undefined {
  return srdCatalogues(locale)?.[kind] ?? FETCHED.get(locale)?.[kind];
}

let inflight: Promise<void> | null = null;

/** Fetch the names of every locale not loaded yet (deduped; resolves when done). */
export function loadNameLocales(): Promise<void> {
  const missing = LOCALES.filter((locale) => !nameLocales().includes(locale));
  if (missing.length === 0) return Promise.resolve();
  inflight ??= Promise.all(
    missing.map(async (locale) => {
      const load = NAME_SHARD_LOADERS[locale];
      if (!load) return;
      const [shards, pack] = await Promise.all([load(), loadPackSrdCatalogues(locale)]);
      const merged = {} as NameShards;
      for (const kind of Object.keys(shards) as NameKind[]) {
        merged[kind] = mergeCatalogue(
          kind,
          shards[kind],
          pack[kind],
          srdOverlay[locale]?.[kind]
        );
      }
      FETCHED.set(locale, merged);
    })
  )
    .then(() => undefined)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
