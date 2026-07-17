/**
 * Weapon-facts presenter (`lib/views`) — the ONE recipe that turns a weapon's
 * structured mechanics into the render-ready facts block BOTH weapon surfaces
 * show (the combat action card in PlayTab and the inventory WeaponCard).
 *
 * Owner mandate (2026-06-12): the weapon cards on the Combat tab and the
 * Inventory tab must be EQUIVALENT — same information, same formatting, one
 * component — so any future fix propagates to both. This module is the data
 * half of that seam; `src/components/shared/WeaponFacts.tsx` is the render
 * half. Each presenter (`buildInventoryViewModel`, `localizeAction`) builds a
 * {@link WeaponFactsVM} through {@link buildWeaponFacts}; the surfaces differ
 * only in their per-surface extras (combat CTA/economy, inventory qty/weight).
 *
 * Chips carry STABLE ids (golden rule 7) — lowercase property tokens
 * ("finesse", "thrown"), category ids ("simple"/"martial"), mastery ids
 * ("vex") — so the component layer can attach the matching GlossaryTip without
 * ever branching on a localized label. A mastery chip exists ONLY when the
 * engine surfaced an OWNED mastery (the unowned case is unrepresentable here).
 *
 * Pure + framework-free: no React, no i18next — SRD content resolves through
 * `localizeSrd`/`srd-i18n` keyed by id (the pure-modules contract).
 */

import type { Locale } from "@/lib/locale";
import type { WeaponRangeSpec } from "@/lib/smart-tracker";
import type { BreakdownLine } from "@/lib/value-breakdown";
import type { RiderVM } from "@/lib/views/rider-view";
import { localeDistance, localeRangePair } from "@/lib/utils";
import { hasSrd, localizeSrd } from "@/i18n/resolver";
import { localizeWeaponCategory, localizeWeaponProperty } from "@/lib/views/srd-i18n";

/** The chip kinds the facts block renders (category → properties → masteries). */
export type WeaponChipKind = "category" | "property" | "mastery";

/** One render-ready weapon chip: a stable id + the localized label. */
export interface WeaponChipVM {
  kind: WeaponChipKind;
  /**
   * Stable lowercase token ("finesse", "martial", "vex") the component keys
   * glossary tooltips off — null for an unrecognized/custom property (the chip
   * still renders, just without a tooltip).
   */
  id: string | null;
  /** Localized display label ("Accurata", "Da Lancio (Gittata 6/18 m)"). */
  label: string;
}

/** The unified weapon facts view-model — identical on both surfaces. */
export interface WeaponFactsVM {
  /** One-handed damage formula with the modifier folded in ("1d8+3"). */
  damageOneHanded: string;
  /** Two-handed (Versatile) formula, or null for a non-versatile weapon. */
  damageTwoHanded: string | null;
  /** Stable damage-type id ("slashing") — the edge resolves `srd.damage_*`. */
  damageTypeId: string;
  /** Final to-hit bonus (raw number; the edge signs it). */
  attackBonus: number;
  /** Localized range ("5 ft / 20/60", "1,5 m", "24/96 m"), or null. */
  range: string | null;
  /** Category + property + OWNED-mastery chips, in display order. */
  chips: WeaponChipVM[];
  /**
   * Pre-localized per-source damage composition ("+3 STR · +2 Rage (active)") —
   * the `WeaponFacts` component attaches it to the damage label as a
   * `BreakdownTip`. ONE seam for both surfaces (combat card + inventory
   * card), so the tooltip can never disagree with the formula (golden rule 6).
   * Null/empty → the damage label is plain text (no popover).
   */
  breakdown: ReadonlyArray<BreakdownLine> | null;
  /**
   * Pre-localized per-source to-hit composition ("+3 STR · +2 PB · +2 Archery")
   * (#94) — the `WeaponFacts` component attaches it to the to-hit VALUE as a
   * `BreakdownTip`, exactly mirroring the damage tip. The to-hit headline derives
   * from the same parts (golden rule 6). Null/empty → plain to-hit number
   * (override-first: a pinned `attackBonusOverride` has no composition).
   */
  attackBreakdown: ReadonlyArray<BreakdownLine> | null;
  /**
   * The on-hit RIDER strip (extra damage / die manipulation / on-hit heal) — the
   * SAME render-ready tokens both weapon surfaces show (combat card + inventory
   * card), built once by `buildRiders`. The `WeaponFacts` component renders each
   * as a compact token; a consumable rider becomes tappable only on the combat
   * surface (the debit callback the card passes in). Empty → no rider strip.
   */
  riders: ReadonlyArray<RiderVM>;
  /**
   * A pre-localized on-hit REMINDER sentence the attack carries (Armorer Guardian
   * Thunder Pulse's "target has Disadvantage on attacks vs others"; Dreadnaught
   * push/pull; the unarmed-strike "d8 if not holding a weapon" gloss). Self-side,
   * informational — no resource, no RNG (golden rule 21). The `WeaponFacts`
   * component renders it as one compact "on a hit" gloss in the on-hit register,
   * beside the rider strip. Null/empty → no note line. Fed ONLY by the combat
   * surface (it's a combat-summary concept); the inventory card omits it.
   */
  onHitNote: string | null;
}

/** The structured inputs both presenters already have. */
export interface WeaponFactsInput {
  /** One-handed damage formula (override-respecting, modifier folded in). */
  damage: string;
  /** Two-handed Versatile formula (same modifier), if any. */
  versatileDamage?: string | null;
  damageType: string;
  attackBonus: number;
  /** Structured range in feet — formatted here (domain rule D3). */
  rangeSpec?: WeaponRangeSpec | null;
  /** RAW SRD property tokens ("Finesse", "Thrown (Range 20/60)", …). */
  properties?: ReadonlyArray<string>;
  /** Weapon category id ("simple" / "martial"), if known. */
  category?: string | null;
  /**
   * The weapon's mastery token ("Vex") — pass it ONLY when the character OWNS
   * it (a `classes[].weaponMasteries` pick or a free/feature mastery). The
   * chip is gated here by construction: absent input → absent chip.
   */
  mastery?: string | null;
  /** Feature-granted EXTRA masteries on this attack (Battering Roots). */
  extraMasteries?: ReadonlyArray<string>;
  /** Pre-localized per-source damage breakdown lines (from
   *  `localizeDamageBreakdown`) — surfaced on the damage label. */
  breakdown?: ReadonlyArray<BreakdownLine> | null;
  /** Pre-localized per-source to-hit breakdown lines (from `localizeBreakdown`)
   *  — surfaced on the to-hit value (#94). */
  attackBreakdown?: ReadonlyArray<BreakdownLine> | null;
  /** Render-ready on-hit rider tokens (from `buildRiders`) — the SAME strip both
   *  weapon surfaces render. Absent/empty → no rider strip. */
  riders?: ReadonlyArray<RiderVM>;
  /** A pre-localized on-hit reminder sentence (Armorer Guardian Disadvantage;
   *  unarmed-strike unburdened-d8 gloss). Absent/empty → no note line. Combat only. */
  onHitNote?: string | null;
}

/**
 * Format a structured {@link WeaponRangeSpec} into the localized range string
 * ("5 ft" / "1,5 m", "80/320 ft", "5 ft / 20/60 ft"). ONE home for the
 * formatting both surfaces show (moved from `combat-action-view` when the
 * facts block was unified — domain rule D3: unit formatting is a view concern).
 * Near/far pairs go through `localeRangePair` so the unit prints ONCE
 * ("6/18 m", never "6 m/18 m").
 */
export function formatWeaponRange(spec: WeaponRangeSpec, locale: Locale): string {
  if (spec.kind === "ranged") {
    return localeRangePair(spec.nearFt, spec.farFt, locale);
  }
  let range = localeDistance(spec.reachFt, locale);
  if (spec.thrown) {
    range = `${range} / ${localeRangePair(spec.thrown.nearFt, spec.thrown.farFt, locale)}`;
  }
  return range;
}

/**
 * The stable property-token ids, ordered for PREFIX matching ("Two-Handed
 * (unless mounted)" → "two-handed"; "Thrown (Range 20/60)" → "thrown").
 */
const PROPERTY_TOKEN_IDS = [
  "two-handed",
  "finesse",
  "light",
  "heavy",
  "reach",
  "versatile",
  "thrown",
  "ammunition",
  "loading",
  "special",
] as const;

/** Derive a property's stable token id from its raw SRD string (null = custom). */
export function weaponPropertyTokenId(prop: string): string | null {
  const lower = prop.toLowerCase();
  return PROPERTY_TOKEN_IDS.find((id) => lower.startsWith(id)) ?? null;
}

/** Localized mastery label via the ONE `weapon-mastery` catalogue path; an
 *  unknown token (defensive) falls back to itself rather than throwing. */
function masteryLabel(token: string, locale: Locale): string {
  const id = token.toLowerCase();
  return hasSrd("weapon-mastery", id, "name", locale)
    ? localizeSrd("weapon-mastery", id, "name", locale)
    : token;
}

/**
 * Build the unified weapon facts VM. Pure mapping: formulas pass through,
 * the range spec gets formatted, and the chips are assembled in the ONE
 * canonical order — category, properties (as printed on the weapon, with
 * thrown/ammunition distances localized), then the owned masteries.
 */
export function buildWeaponFacts(input: WeaponFactsInput, locale: Locale): WeaponFactsVM {
  const chips: WeaponChipVM[] = [];

  if (input.category) {
    chips.push({
      kind: "category",
      id: input.category.toLowerCase(),
      label: localizeWeaponCategory(input.category, locale),
    });
  }

  for (const prop of input.properties ?? []) {
    chips.push({
      kind: "property",
      id: weaponPropertyTokenId(prop),
      label: localizeWeaponProperty(prop, locale),
    });
  }

  const masteries = [
    ...(input.mastery ? [input.mastery] : []),
    ...(input.extraMasteries ?? []),
  ];
  for (const token of masteries) {
    const id = token.toLowerCase();
    if (chips.some((c) => c.kind === "mastery" && c.id === id)) continue;
    chips.push({ kind: "mastery", id, label: masteryLabel(token, locale) });
  }

  return {
    damageOneHanded: input.damage,
    damageTwoHanded: input.versatileDamage ?? null,
    damageTypeId: input.damageType,
    attackBonus: input.attackBonus,
    range: input.rangeSpec ? formatWeaponRange(input.rangeSpec, locale) : null,
    chips,
    breakdown: input.breakdown && input.breakdown.length > 0 ? input.breakdown : null,
    attackBreakdown:
      input.attackBreakdown && input.attackBreakdown.length > 0
        ? input.attackBreakdown
        : null,
    riders: input.riders ?? [],
    onHitNote: input.onHitNote && input.onHitNote.length > 0 ? input.onHitNote : null,
  };
}
