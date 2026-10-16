/**
 * Pure play logic for the situational attack states (`situational-states.ts`):
 * light or clear one until a turn edge, and resolve what the lit ones do to one
 * attack card's roll. The character in, the next session out; no store, no i18n.
 */
import {
  FIGHT_SITUATIONS,
  SITUATIONAL_STATES,
  situationKey,
  type AttackKind,
  type SituationId,
  type SituationalAttackScope,
} from "@/lib/situational-states";
import type { LocText } from "@/lib/loc-text";
import type { CharacterDoc, SessionState } from "@/types/character";
import { setActiveState } from "./states";
import { setLight } from "./light";

export type SituationUntil = { round: number; phase: "turn-start" | "turn-end" };

/**
 * Light (or clear) one situation, or null when it already is. `until` is the
 * owner-turn edge a turn fact ends at; without one (a fight fact, or no turn to
 * end) it stays until tapped off. The situations can hold together.
 */
export function setSituation(
  doc: CharacterDoc,
  id: SituationId,
  lit: boolean,
  until: SituationUntil | undefined
): SessionState | null {
  const key = situationKey(id);
  // A situation declares no round countdown, so the lit round is never read.
  const session = setActiveState(doc, key, lit, 0);
  if (!session || !lit || !until) return session;
  return {
    ...session,
    effectBoundaries: {
      ...(session.effectBoundaries ?? {}),
      [key]: { round: until.round, phase: until.phase },
    },
  };
}

/** Clear the fight-long situations (Underwater, Mounted) and the light level when
 * the encounter ends, or null when none is lit. */
export function endFightSituations(doc: CharacterDoc): SessionState | null {
  let session: SessionState | null = null;
  for (const id of FIGHT_SITUATIONS) {
    session =
      setSituation({ ...doc, session: session ?? doc.session }, id, false, undefined) ??
      session;
  }
  return setLight({ ...doc, session: session ?? doc.session }, null) ?? session;
}

/** One situational attack clause, in the advantage-chip shape the cards net
 * (`AdvantageChip` in `lib/views/sheet-view`, which the engine does not import). */
export interface SituationalAttackChip {
  sourceId: string;
  mode: "advantage" | "disadvantage";
  rollType: "attack";
  vs: "attack";
  description: LocText;
  scope?: SituationalAttackScope;
}

/** What the sheet knows about one attack card. */
export interface AttackCardFacts {
  source: "spell" | "weapon" | "feature";
  /** Melee or ranged; absent when the card can be either. */
  attackMode?: AttackKind;
  /** A melee weapon with the Thrown property (its attack can be a ranged one). */
  throwable?: boolean;
  /** The card's damage type id ("piercing"). */
  damageType?: string;
}

/** The Unarmed Strike action row's stable id (`smart-tracker`). */
const UNARMED_STRIKE_ID = "unarmed-strike";

/** The facts a resolved action card carries for the situational rules. */
export function attackCardFacts(action: {
  id: string;
  source: AttackCardFacts["source"];
  summary: { attackMode?: AttackKind; throwable?: true; damageType?: string };
}): AttackCardFacts {
  const { attackMode, throwable, damageType } = action.summary;
  return {
    // The Unarmed Strike row sits with the weapons, but it is no weapon (SRD
    // "Unarmed Strike"): a weapon-only rule (Underwater, Range) never reaches it.
    source: action.id === UNARMED_STRIKE_ID ? "feature" : action.source,
    ...(attackMode ? { attackMode } : {}),
    ...(throwable ? { throwable } : {}),
    ...(damageType ? { damageType } : {}),
  };
}

/** The attack kinds a card's roll can be. */
function cardKinds(card: AttackCardFacts): AttackKind[] {
  if (card.attackMode === "ranged") return ["ranged"];
  if (card.attackMode === "melee")
    return card.throwable ? ["melee", "ranged"] : ["melee"];
  return ["melee", "ranged"];
}

/**
 * The lit situations' attack clauses for one card, as advantage chips: a clause
 * that reaches every attack the card can make is blanket (it nets into the card's
 * verdict); one that reaches only some states its scope ("if thrown", "on ranged
 * attacks"); one that reaches none is dropped.
 */
export function situationalAttackChips(
  lit: ReadonlyArray<SituationId>,
  card: AttackCardFacts,
  attacker: { hasSwimSpeed: boolean }
): SituationalAttackChip[] {
  const kinds = cardKinds(card);
  const chips: SituationalAttackChip[] = [];
  for (const situation of SITUATIONAL_STATES) {
    if (!lit.includes(situation.id)) continue;
    for (const mode of ["advantage", "disadvantage"] as const) {
      const reached = kinds.filter((kind) =>
        situation.attack.some(
          (rule) =>
            rule.mode === mode &&
            rule.kinds.includes(kind) &&
            (!rule.weaponOnly || card.source === "weapon") &&
            !(rule.unlessSwimSpeed && attacker.hasSwimSpeed) &&
            !(rule.unlessDamageType && rule.unlessDamageType === card.damageType)
        )
      );
      if (reached.length === 0) continue;
      const scope: SituationalAttackScope | undefined =
        reached.length === kinds.length
          ? undefined
          : reached[0] === "ranged"
            ? card.throwable
              ? "thrown"
              : "ranged"
            : "melee";
      chips.push({
        sourceId: situation.grant.activeKey,
        mode,
        rollType: "attack",
        vs: "attack",
        description: situation.label,
        ...(scope ? { scope } : {}),
      });
    }
  }
  return chips;
}
