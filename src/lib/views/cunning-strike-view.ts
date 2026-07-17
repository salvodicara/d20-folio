/**
 * Cunning Strike presenter (`lib/views`) — the ONE recipe that turns the engine's
 * resolved Rogue **Cunning Strike** catalogue (`resolveCunningStrikeOptions`)
 * into the render-ready tokens the combat attack card shows beside its riders.
 *
 * Cunning Strike options are NOT on-hit damage riders (so they don't fit
 * {@link RiderVM}); they are a per-attack PICKER of tactical effects each paid
 * for by forgoing Sneak Attack dice. The engine models Sneak Attack as a single
 * once-per-turn USE (the `rogue-sneak-attack` tracker, `total: 1`), so the
 * explicit tap spends that one use — the dice "cost" is the informational price
 * the player applies when rolling (no dice, ever). An option is LEGAL only while
 * the Sneak Attack use is unspent AND its dice cost ≤ the Rogue's Sneak Attack
 * dice (constrained input — golden rule 20); the consumer never auto-spends.
 *
 * Pure + framework-free: no React, no i18next — names/descriptions resolve
 * through the injected-locale `localizeText` (the `lib/views/` localization seam).
 * The ability + condition WORDS resolve through the same view helpers every other
 * surface uses; the save DC stays a number.
 */

import type { Locale } from "@/lib/locale";
import type { ResolvedCunningStrikeOption } from "@/lib/smart-tracker";
import type { LocText } from "@/lib/loc-text";
import { localizeText } from "@/lib/views/srd-i18n";
import { conditionLabel } from "@/lib/views/tracker-view";
import { abilityLabel } from "@/lib/views/level-up-view";

/** One render-ready Cunning Strike option token. */
export interface CunningStrikeVM {
  /** Stable catalogue-unique key (`poison`, `trip`, …) — React key + branch id. */
  optionId: string;
  /** The owning feature's stable id (provenance). */
  sourceId: string;
  /** Localized option name ("Trip", "Poison"). */
  name: string;
  /** The same option name as a localizable {@link LocText} reference — stored in the
   *  combat-log rider-use event so the row re-localizes (golden rule 7). */
  nameLoc: LocText;
  /** Localized option description (the tooltip body). */
  description: string;
  /** Sneak Attack dice forgone to add this effect (the informational price). */
  cost: number;
  /**
   * The save the option forces, or null when it forces none. `ability` is the
   * localized ability abbreviation ("DEX"); `dc` is the concrete save DC — the
   * component composes the localized "DEX save · DC 13" line (so "DC" stays a
   * translatable APP string, never baked into the engine output).
   */
  save: { ability: string; dc: number } | null;
  /** Localized condition the option can impose ("Prone"), or null. */
  condition: string | null;
  /**
   * Whether the option can be applied right now: the Sneak Attack use is unspent
   * AND the dice cost is within the Rogue's Sneak Attack dice. A consumer disables
   * an illegal option (constrained input) — the engine never auto-spends.
   */
  legal: boolean;
}

/** The runtime facts the legality check reads (locale-free). */
export interface CunningStrikeContext {
  /** Whether the once-per-turn Sneak Attack use is still available. */
  sneakAttackAvailable: boolean;
  /** The Rogue's total Sneak Attack dice (⌈level/2⌉) — the dice budget. */
  sneakAttackDice: number;
}

/**
 * Build the render-ready Cunning Strike tokens from the resolved engine options.
 * Order is preserved (the engine already sorted by cost, then optionId). Empty
 * input → empty output (the card shows no Cunning Strike strip).
 */
export function buildCunningStrikeOptions(
  options: ReadonlyArray<ResolvedCunningStrikeOption>,
  ctx: CunningStrikeContext,
  locale: Locale
): CunningStrikeVM[] {
  return options.map((o) => ({
    optionId: o.optionId,
    sourceId: o.sourceId,
    name: localizeText(o.name, locale),
    nameLoc: o.name,
    description: localizeText(o.description, locale),
    cost: o.cost,
    save:
      o.saveAbility && o.saveDc != null
        ? { ability: abilityLabel(o.saveAbility, locale), dc: o.saveDc }
        : null,
    condition: o.condition ? conditionLabel(o.condition, locale) : null,
    legal: ctx.sneakAttackAvailable && o.cost <= ctx.sneakAttackDice,
  }));
}
