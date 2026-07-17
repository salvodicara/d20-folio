/**
 * Beast catalogue index — the CR-indexed Polymorph / True Polymorph form store.
 *
 * Pure data accessors over {@link BEASTS} (ids + numbers; names resolve through
 * the `beasts` srd catalogue). Mirrors the `spellIndex` / `getSpellById` shape.
 */
import type { BeastStatBlock } from "@/data/types";
import { mergePack } from "@/lib/pack-merge";
import { packBeasts } from "@pack";
import { BEASTS as PUBLIC_BEASTS } from "./beasts";

/** All beast forms — public SRD + content pack. */
export const BEASTS: ReadonlyArray<BeastStatBlock> = mergePack(
  "beast",
  PUBLIC_BEASTS,
  packBeasts
);

/** id → stat block, built once. */
const BEAST_INDEX: ReadonlyMap<string, BeastStatBlock> = new Map(
  BEASTS.map((b) => [b.id, b])
);

/** The Beast stat block for `id`, or `undefined` when unknown. */
export function getBeast(id: string): BeastStatBlock | undefined {
  return BEAST_INDEX.get(id);
}

/**
 * Every Beast form with `cr ≤ cap`, sorted by CR then id — the Polymorph CR
 * gate (a caster may take a form of CR ≤ their level; the picker reads this).
 */
export function beastsByMaxCR(cap: number): ReadonlyArray<BeastStatBlock> {
  return BEASTS.filter((b) => b.cr <= cap).sort(
    (a, b) => a.cr - b.cr || a.id.localeCompare(b.id)
  );
}
