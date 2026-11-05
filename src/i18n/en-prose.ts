/**
 * The public SRD's lazy English prose: display-only fields (the one-line `gist`)
 * that no engine code reads. They live in `en/srd-prose/<kind>.json`, outside the
 * statically bundled `en/srd/` catalogues (`srd-en.ts`), and join the EN registry
 * after first paint with the pack's prose (`ensureEnProse` in `./index.ts`), so the
 * eager download stays the same size. Other locales keep these fields in their own
 * `srd/` catalogues, which load lazily anyway.
 */
import type { SrdCatalogue, SrdKind } from "./srd-en";
import enSpells from "./en/srd-prose/spells.json";
import enFeats from "./en/srd-prose/feats.json";
import enMagicItems from "./en/srd-prose/magic-items.json";
import enEquipment from "./en/srd-prose/equipment.json";

export const publicSrdEnProse: Partial<Record<SrdKind, SrdCatalogue>> = {
  spell: enSpells,
  feat: enFeats,
  "magic-item": enMagicItems,
  equipment: enEquipment,
};
