/**
 * Companions on the Play screen: each creature the character has on the field
 * (`buildCompanionCardViews`: class companions, and summons while they last), with its
 * Hit Points and AC, and its attacks as rows like the character's own. «Attacca» opens
 * the same damage tray (`companionAttackPlan`), and a hit applies what the attack does
 * beyond damage (`companionHitEffects`, Web Bolt's Speed 0).
 */
import { classFeatureIndex } from "@/data/classes";
import { getSpellById } from "@/data/spells";
import type { CompanionAttack, CompanionStatBlock } from "@/data/types";
import { selectCompanionVariant } from "@/lib/compute";
import type { Locale } from "@/lib/locale";
import { companionAttackEffects } from "@/lib/play/companion-attack";
import type { DamageTrayPlan } from "@/lib/play/damage-tray";
import { buildCompanionCardViews } from "@/lib/views/companion-row-view";
import type { CharacterDoc } from "@/types/character";
import type { ActiveCombatEffect, CombatantRef } from "@/types/combat-effect";
import type { DamageType } from "@/types/damage";

export interface PlayCompanionAttack {
  id: string;
  name: string;
  hit: number;
  /** Dice and the localized damage type, as the card shows it. */
  damage: string;
  damageType: DamageType;
  /** Melee reach or, `ranged`, the range, in feet. */
  reachFt: number;
  ranged: boolean;
  rider?: string;
  /** The catalogue attack, for what a hit does beyond damage. */
  catalogue: CompanionAttack | null;
}

export interface PlayCompanion {
  key: string;
  name: string;
  kind?: string;
  /** The summoning spell, when a spell brought it (Giant Insect). */
  spellId: string | null;
  hp: { current: number; max: number };
  ac: number;
  fallen: boolean;
  attacks: PlayCompanionAttack[];
}

/** The stat block a companion comes from (its spell's, or its class feature's). */
function blockOf(sourceId: string): CompanionStatBlock | undefined {
  return getSpellById(sourceId)?.companion ?? classFeatureIndex.get(sourceId)?.companion;
}

export function playCompanions(
  doc: CharacterDoc,
  locale: Locale,
  t: (key: string) => string
): PlayCompanion[] {
  return buildCompanionCardViews(doc, locale, t)
    .filter((card) => !card.suppressed)
    .map((card) => {
      const sourceId = card.groupId ?? card.featureId;
      const block = blockOf(sourceId);
      const active = block
        ? selectCompanionVariant(block, doc.session.companionVariant?.[sourceId])
        : undefined;
      return {
        key: card.featureId,
        name: card.label,
        ...(card.kind ? { kind: card.kind } : {}),
        spellId: getSpellById(sourceId) ? sourceId : null,
        hp: { current: card.current ?? card.hpMax, max: card.hpMax },
        ac: card.ac,
        fallen: card.fallen === true,
        attacks: card.attacks.map((attack) => {
          const catalogue = active?.attacks?.find((a) => a.id === attack.id) ?? null;
          return {
            id: attack.id,
            name: attack.name,
            hit: attack.attackBonus,
            damage: attack.damage,
            damageType: catalogue?.damageType ?? "bludgeoning",
            reachFt: attack.reachFt,
            ranged: attack.ranged,
            ...(attack.rider ? { rider: attack.rider } : {}),
            catalogue,
          };
        }),
      };
    });
}

/** The damage tray's plan for a companion's attack: a hit, its damage type, a melee
 *  attack can knock out. */
export function companionAttackPlan(
  attack: Pick<PlayCompanionAttack, "damageType" | "ranged">,
  targets: string[]
): DamageTrayPlan {
  return {
    effect: "damage",
    damageType: attack.damageType,
    attack: { onMiss: "none" },
    ...(attack.ranged ? {} : { melee: true as const }),
    targets,
  };
}

/** What one hit of a summoned companion's attack puts on its target beyond damage. */
export function companionHitEffects(
  companion: Pick<PlayCompanion, "spellId">,
  attack: Pick<PlayCompanionAttack, "catalogue">,
  hit: {
    actor: CombatantRef;
    target: CombatantRef;
    round: number;
    effectId: (i: number) => string;
  }
): ActiveCombatEffect[] {
  if (!companion.spellId || !attack.catalogue) return [];
  return companionAttackEffects({
    spellId: companion.spellId,
    attack: attack.catalogue,
    ...hit,
  });
}
