/**
 * The ONE engine gate for SPELL rows (golden rule 6): decide on TAP whether a
 * cast is engine-executable, shared by the Spells tab's cast CTA and the Play
 * board's spell cards (Shield's reaction card included) so the two surfaces
 * can never split the dispatch truth.
 *
 * Conservative by design — a cast whose legacy commit carries semantics the
 * engine mirror does not own yet stays legacy: item-pool/free-cast payments,
 * metamagic-capable casters, maintainer rows, use-applies, a
 * condition-blocked economy slot, a spent Reaction, and the once-per-turn
 * leveled-slot rule. Pact-slot casts dispatch engine (the kernel's
 * `spell-slot` selector admits the pact pool and the commit mirrors the
 * legacy `pact-<level>` counter), and so do standing-effect casts whose
 * active key lands on the caster (Hex's mark included — the marked creature
 * is table-abstract in solo play, exactly like the legacy collapse).
 * Casting a concentration spell while one is
 * HELD dispatches engine ONLY when the held spell is engine-owned (the world
 * holds its occurrence and agrees with the session field): the dispatcher then
 * runs the shared swap confirm and, on yes, ends the held spell through the
 * canonical `setConcentration("")` motion before the clean cast — two exact
 * journal actions. A legacy-held concentration keeps the legacy swap path,
 * which owns its teardown.
 */

import { turnEconomyKey } from "@/features/character/center/combat-hydration";
import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { concentrationValue } from "@/lib/concentration";
import { economyActionCategory, type EconomyActionCategory } from "@/lib/combat-economy";
import { resolveConditionEffects } from "@/lib/condition-effects";
import { effectiveSessionConditions } from "@/lib/effective-conditions";
import {
  characterTrackerSeeds,
  characterWorldState,
  engineConcentrationHandle,
} from "@/lib/mechanics-world-store";
import { transcribeSpell } from "@/lib/mechanics-transcription";
import { resolveSpellCastOptions } from "@/lib/views/spell-cast-sources";
import { useCombatStore } from "@/stores/combatStore";
import type { CombatAction } from "@/lib/views/combat-action-view";
import type { Locale } from "@/lib/locale";
import type { LocText } from "@/lib/loc-text";
import type { SrdSpellData } from "@/data/types";
import type { CharacterDoc } from "@/types/character";

/** One approved engine cast: the flow inputs plus the legacy economy mirror. */
export interface EngineSpellCastRequest {
  /** Non-null when this cast REPLACES a held concentration spell: the caller
   *  runs the shared swap confirm BEFORE mounting the engine flow. */
  readonly concentrationSwap: { readonly heldSpellId: string } | null;
  readonly economy: {
    readonly actionId: string;
    readonly economyCategory: EconomyActionCategory | null;
    readonly nameLoc?: LocText;
    readonly slot: "action" | "bonus" | "reaction" | "free";
    readonly spellLevel: number;
    readonly triggersAttack: boolean;
  };
  readonly hasAttack: boolean;
  readonly spellId: string;
  readonly spellName: string;
}

export interface EngineSpellGateInput {
  readonly action: Readonly<CombatAction>;
  /** The cast-source badge labels `resolveSpellCastOptions` decorates with. */
  readonly badges: { readonly mastery: string; readonly signature: string };
  readonly character: Readonly<CharacterDoc>;
  readonly locale: Locale;
  /** True inside a SHARED campaign encounter — engine dispatch stays closed
   *  there (the encounter runtime owns those turns). Solo combat is open. */
  readonly sheetCombat: boolean;
  readonly spell: Readonly<SrdSpellData>;
  readonly spellName: string;
  readonly uid: string | null;
}

export function engineSpellCastRequest(
  input: Readonly<EngineSpellGateInput>
): EngineSpellCastRequest | null {
  const { action, character, locale, spell, spellName, uid } = input;
  if (input.sheetCombat) return null;
  const combatState = useCombatStore.getState();
  const turnKey = turnEconomyKey(
    useCombatStatusStore.getState().status,
    character.id,
    combatState.round
  );
  const slotSpentThisTurn =
    combatState.spellSlotCastTurnKey === turnKey &&
    combatState.spellSlotCastsThisTurn >= 1;
  const blockedSlots = resolveConditionEffects(
    effectiveSessionConditions(character.session)
  ).blockedSlots;
  const gatedSlot =
    action.type === "action" || action.type === "bonus" || action.type === "reaction"
      ? action.type
      : null;
  const reactionSpent = action.type === "reaction" && combatState.reactionUsed;
  // Every cast option must be a real spell slot (standard OR pact — the
  // kernel's `spell-slot` selector admits both pools and the commit mirrors
  // each pool's own legacy counter); free-cast and item-pool sources still
  // resolve through the legacy option flow, which owns those payments.
  const plainOptionsOnly =
    spell.level === 0 ||
    resolveSpellCastOptions(character, spell.id, spell.level, true, locale, {
      mastery: input.badges.mastery,
      signature: input.badges.signature,
    }).every((option) => option.kind === undefined || option.kind === "slot");
  const plainCast =
    action.castPoolSourceId === undefined &&
    !reactionSpent &&
    // A MAINTAINER row re-runs an already-established recurring effect
    // without paying again (Call Lightning's re-fire). Dispatching it as a
    // NEW engine cast would double-cast; the engine twin is the armed
    // root-pulse phase on the world's own occurrence (EnginePulseStrip /
    // `useMechanicsPulse`), which only exists when the CAST itself went
    // through the engine. A legacy-established effect keeps its legacy
    // maintainer — by construction, never by gap.
    action.maintainsActiveKey === undefined &&
    // A standing whose mechanics belong to a SELECTED creature that is not
    // the caster (`excludeSelf` — Warding Bond) stays legacy: the solo world
    // models no other creature to carry the grant, and the legacy path owns
    // the target prompt. A caster-owned standing (Hex's active key + mark,
    // recipient-selected buffs the solo collapse lights on the caster)
    // dispatches engine — the transcription is the final arbiter.
    action.standingEffect?.excludeSelf !== true &&
    // Defensive: SPELL rows never carry use-applies today (those are
    // race-trait/invocation/feature rows); if one ever does, its
    // deterministic side effect is applied by the legacy commit loop the
    // engine does not mirror, so it must stay legacy until transcribed.
    (action.useEffects?.length ?? 0) === 0 &&
    !(gatedSlot !== null && blockedSlots.has(gatedSlot)) &&
    plainOptionsOnly &&
    !(spell.level > 0 && slotSpentThisTurn) &&
    character.character.classes.every(
      (entry) => (entry.metamagicChoices?.length ?? 0) === 0
    );
  if (!plainCast) return null;
  // Concentration while concentrating: engine only when the HELD spell is
  // engine-owned and the world agrees with the session field, so the canonical
  // kernel end can release it at swap-confirm. Anything else stays legacy.
  let concentrationSwap: EngineSpellCastRequest["concentrationSwap"] = null;
  const held = character.session.concentration;
  if (spell.concentration && held !== "") {
    if (uid === null) return null;
    const world = characterWorldState(
      character,
      uid,
      character.character.hp.max,
      {},
      characterTrackerSeeds(character)
    );
    const handle = world === null ? null : engineConcentrationHandle(world);
    if (
      handle === null ||
      handle.spellId === null ||
      concentrationValue(handle.spellId) !== held
    ) {
      return null;
    }
    if (handle.spellId !== spell.id) {
      concentrationSwap = { heldSpellId: handle.spellId };
    }
  }
  const transcription = transcribeSpell(spell);
  if (!transcription.program) return null;
  return {
    concentrationSwap,
    economy: {
      actionId: action.id,
      economyCategory: economyActionCategory(action),
      nameLoc: action.nameLoc,
      slot:
        action.type === "bonus"
          ? "bonus"
          : action.type === "action"
            ? "action"
            : action.type === "reaction"
              ? "reaction"
              : "free",
      spellLevel: spell.level,
      triggersAttack:
        action.summary.attackBonus != null || action.summary.saveAbility != null,
    },
    hasAttack: spell.attackType !== undefined,
    spellId: spell.id,
    spellName,
  };
}
