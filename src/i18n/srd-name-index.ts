/**
 * The SRD NAME catalogues (class, subclass, race, background) of EVERY locale,
 * bundled eagerly.
 *
 * The persistence layer's read seam recognises a stored label in any language
 * ("Elfo" → `elf`, "Invocatore" → `evoker`) whatever the active locale, and the
 * roster names a character before the full SRD loads. So these four kinds ride
 * the eager bundle for every locale, not only the active one (EN is the same
 * module `srd-en.ts` already bundles). `NAME_SHARDS` is keyed by every registered
 * locale, so a new language is a type error here until its shards are wired.
 * (Static imports, not `import.meta.glob`: the node scripts load this module.)
 *
 * Locale-INDEPENDENT like `srd-en.ts`: it returns every language and never reads
 * the active locale, which is why engine-core may import it
 * (architecture-direction.guard). The public shards compose with the content
 * pack's additions (EN from `packSrdEn`, the other locales from
 * `packNameCatalogues`) and its overlay patches, exactly as the full catalogues do.
 */
import enClasses from "./en/srd/classes.json";
import enSubclasses from "./en/srd/subclasses.json";
import enRaces from "./en/srd/races.json";
import enBackgrounds from "./en/srd/backgrounds.json";
import itClasses from "./it/srd/classes.json";
import itSubclasses from "./it/srd/subclasses.json";
import itRaces from "./it/srd/races.json";
import itBackgrounds from "./it/srd/backgrounds.json";

import { SOURCE_LOCALE, type Locale } from "@/lib/locale";
import { mergeCatalogue } from "@/lib/pack-merge";
import { packNameCatalogues, packSrdEn, srdOverlay } from "@pack";
import type { SrdCatalogue } from "./srd-en";

export type NameKind = "class" | "subclass" | "race" | "background";

const NAME_SHARDS: Record<Locale, Record<NameKind, SrdCatalogue>> = {
  en: {
    class: enClasses,
    subclass: enSubclasses,
    race: enRaces,
    background: enBackgrounds,
  },
  it: {
    class: itClasses,
    subclass: itSubclasses,
    race: itRaces,
    background: itBackgrounds,
  },
};

const MERGED = new Map<string, SrdCatalogue>();

/** One locale's `kind` catalogue: public + content pack + overlay. */
export function srdNameCatalogue(locale: Locale, kind: NameKind): SrdCatalogue {
  const memo = `${locale}:${kind}`;
  let catalogue = MERGED.get(memo);
  if (!catalogue) {
    catalogue = mergeCatalogue(
      kind,
      NAME_SHARDS[locale][kind],
      locale === SOURCE_LOCALE ? packSrdEn[kind] : packNameCatalogues[locale]?.[kind],
      srdOverlay[locale]?.[kind]
    );
    MERGED.set(memo, catalogue);
  }
  return catalogue;
}
