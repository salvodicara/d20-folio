/**
 * Folio content molecules (M4) — public barrel.
 *
 * The three shared content molecules from the Illuminated Folio design:
 *  - UniversalCard — ONE card for spell = feature = feat = weapon = gear.
 *  - StatCard      — the "Carved Cartouche" ability medallion.
 *  - Tracker       — the resource-tracker row (pips ≤5 / pool bar >5).
 *
 * `UniversalCard` is the sole content card across all four card pages (Spells,
 * Combat, Equipment, Features).
 */

export {
  UniversalCard,
  UniversalCardFacts,
  UniversalCardDesc,
  UniversalCardHigher,
  UniversalCardFoot,
  type UniversalCardProps,
  type UniversalCardSlot,
  type UniversalCardKind,
  type VerdictOutcome,
} from "./UniversalCard";
export { StatCard, type StatCardProps } from "./StatCard";
export { Tracker, type TrackerProps, type TrackerColor } from "./Tracker";
