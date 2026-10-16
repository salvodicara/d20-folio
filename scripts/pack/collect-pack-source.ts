/**
 * Gather everything the composed content pack provides into one `PackSource`,
 * the input of `buildPackFiles` (`src/data/pack-wire.ts`). Shared by the emitter
 * (`emit-pack.ts`) and the wire-format test, so the test checks exactly what ships.
 */
import * as composedPack from "@pack";
import { packMonsters } from "@pack/monsters";
import { packMonsterArt } from "@pack/monster-art";
import { packItemArt } from "@pack/item-art";
import { packSrdEnProse } from "@pack/i18n-en-prose";
import type { PackSource } from "@/data/pack-wire";
import { LOCALES } from "@/lib/locale";
import { LAZY_SRD_KINDS } from "@/i18n/srd-en";

export async function collectPackSource(): Promise<PackSource> {
  const srd: PackSource["srd"] = {};
  const lazySrd: PackSource["lazySrd"] = {};
  for (const locale of LOCALES) {
    if (locale !== "en") srd[locale] = await composedPack.loadPackSrdCatalogues(locale);
    for (const kind of LAZY_SRD_KINDS) {
      const catalogue = await composedPack.loadPackLazySrd(locale, kind);
      if (catalogue) (lazySrd[locale] ??= {})[kind] = catalogue;
    }
  }
  return {
    exports: { ...composedPack, packMonsters, packMonsterArt, packItemArt },
    enProse: packSrdEnProse,
    srd,
    lazySrd,
  };
}
