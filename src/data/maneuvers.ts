/**
 * Fighter maneuvers (2024 PHB — content-pack material).
 *
 * Source: http://dnd2024.wikidot.com/fighter:battle-master — every
 * maneuver's name + effect is taken from the wiki "Maneuver Options"
 * section. The 2024 list has 20 maneuvers, presented alphabetically.
 *
 * Each effect is a concise functional description (not verbatim prose).
 * `save` names the ability a target rolls against the maneuver's DC when
 * the maneuver forces a saving throw; it is omitted when the maneuver has
 * no save (DC = 8 + STR/DEX modifier + Proficiency Bonus, the player's
 * choice of STR or DEX — Combat Superiority feature).
 *
 * The maneuver-wielding Fighter subclass learns three maneuvers at level 3, then two
 * more at levels 7, 10, and 15 (per `maneuversKnownAt` in
 * `src/lib/maneuver-pick.ts`). Whenever new maneuvers are learned, one
 * known maneuver may be swapped for another.
 *
 * IT translations: maneuver names are subclass-specific and so do NOT
 * appear in the official IT SRD 5.2.1 (which excludes subclasses). The
 * effect text is anchored to verified official IT SRD 5.2.1 terminology
 * — Disimpegno (Disengage), Scatto (Dash), Spaventato (Frightened),
 * Prono (Prone), tiro salvezza su Forza (Strength save), Vantaggio /
 * Svantaggio, Reazione, Furtività (Stealth), Iniziativa, punti ferita
 * temporanei, bonus di competenza, Azione Bonus — with names translated
 * using that SRD vocabulary as the anchor where no official subclass term
 * exists (domain rule D2 cascade step 4).
 */

import type { AbilityCode } from "./types";
import { mergePack } from "@/lib/pack-merge";
import { packManeuvers } from "@pack";

/**
 * Canonical runtime list of the maneuver action-economy slots — source of truth
 * for the `combat.<slot>` i18n keys (the picker iterates it; the coverage guard
 * imports it). The {@link SrdManeuver.slot} union is derived, so the two can't
 * drift (golden rule 6). A subset of `ActionType` (no plain "action").
 */
export const MANEUVER_SLOTS = ["bonus", "reaction", "free"] as const;

export interface SrdManeuver {
  /** Slug, e.g. "trip-attack". */
  id: string;
  /**
   * The ability score the TARGET uses for the saving throw this maneuver
   * forces, if any. Omitted when the maneuver requires no save.
   */
  save?: AbilityCode;
  /**
   * Action economy the maneuver consumes when used, so a learned maneuver can
   * be surfaced as a `granted-action` (see `resolveGrantSourcesForManeuvers`):
   *  - "bonus"    — taken as a Bonus Action (Evasive Footwork, Feinting
   *    Attack, Lunging Attack, Rally).
   *  - "reaction" — taken as a Reaction (Parry, Riposte).
   *  - "free"     — no separate action: it rides an attack you're already
   *    making, replaces one of your attacks, or augments an ability
   *    check / Initiative roll. (Every maneuver still costs one Superiority
   *    Die.)
   */
  slot: (typeof MANEUVER_SLOTS)[number];
}

/**
 * Public maneuvers. The 2024 maneuver roster is PHB-only (not in SRD 5.2.1),
 * so all 20 ship in the content pack; the public catalogue is empty.
 */
const PUBLIC_MANEUVERS: SrdManeuver[] = [];

/** All maneuvers — public SRD + content pack. */
export const SRD_MANEUVERS: SrdManeuver[] = mergePack(
  "maneuver",
  PUBLIC_MANEUVERS,
  packManeuvers
);
