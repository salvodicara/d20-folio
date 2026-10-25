/**
 * The two rests as pure play transitions: the character in, the rested character out.
 * The store ends Concentration first where the rest does (sleep), then applies these,
 * logs the rest, persists, and fences the undo stack.
 */
import { evaluateGrants } from "@/lib/grants";
import { fadingPenaltiesAfterLongRest } from "@/lib/play/fading-penalties";
import { effectiveMaxHp } from "@/lib/aggregate-character";
import { longRestExhaustionFloor } from "@/lib/play/provisions";
import { resolveAllGrantSources } from "@/lib/resolve-grant-sources";
import {
  applyShortRestExhaustion,
  equipmentAfterLongRest,
  gainsHeroicInspirationOnLongRest,
  getShortRestRecoveries,
  resolveActiveStatesEndingOnRest,
  resolveTrackers,
} from "@/lib/smart-tracker";
import type { CharacterDoc, SessionState } from "@/types/character";
import type { CombatEvent } from "@/types/combat-log";

/** A record without the given keys; undefined when nothing is left. */
export function omitStateKeys<T>(
  record: Record<string, T> | undefined,
  keys: ReadonlySet<string>
): Record<string, T> | undefined {
  if (!record || keys.size === 0) return record;
  const kept = Object.entries(record).filter(([key]) => !keys.has(key));
  return kept.length > 0 ? Object.fromEntries(kept) : undefined;
}

/**
 * The session with its Hit Point maximum reduction ended: 2024 drains last "until
 * the target finishes a Long Rest". Shared by the legacy rest and the world rest.
 */
export function sessionAfterLongRestReduction<
  S extends Pick<SessionState, "hpMaxReduction">,
>(session: S): S {
  return session.hpMaxReduction === undefined
    ? session
    : { ...session, hpMaxReduction: undefined };
}

/** A Long Rest (Concentration already ended by the caller). */
export function longRestCharacter(character: CharacterDoc): CharacterDoc {
  // D1 — a Long Rest restores HP to the EFFECTIVE max (stored base + hp-flat boons
  // + any standing Aid), so an Aided / Draconic / Boon character wakes at full. The
  // rest ends a Hit Point maximum reduction first (Harm, a life drain).
  const max = effectiveMaxHp(
    character.character,
    sessionAfterLongRestReduction(character.session)
  );
  // RA-01 — 2024 RAW (SRD 5.2.1 Rules Glossary "Long Rest"): a Long Rest
  // restores HP, ends 1 level of Exhaustion, and regains ALL spent Hit Point
  // Dice ("you regain all lost Hit Points and all spent Hit Point Dice"). The
  // 2014 half-rule (`max(1, floor(level/2))`) is GONE. It does NOT automatically
  // clear every condition — Petrified / Diseased / persistent effects can
  // outlast a rest. Conditions are left alone here; players remove them
  // manually as the underlying cause resolves. Death saves DO reset.
  //
  // Bug fix (2026-05-28): hit-dice regain was previously missing entirely.
  // RA-01 (2026-07-11): switched from the 2014 half-rule to the 2024 all-dice
  // rule. Regression tests in character-store-rest.test.ts.
  const newHitDiceUsed = 0;
  // Exhaustion removed on a Long Rest = 1 + any `exhaustion-recovery` grant
  // (Monk Self-Restoration removes 2 instead of 1).
  const exhaustionRemoved =
    1 +
    evaluateGrants(
      resolveAllGrantSources(character.character, character.session.itemResources)
    ).exhaustionRecoveryBonus;
  // Magic-item charges with `recovery: "long-rest"` (and "dawn") restore to
  // max through the ONE shared law (`equipmentAfterLongRest`, smart-tracker),
  // the same map the canonical rest boundary applies, so the engine path and
  // this fail-closed degradation can never drift.
  const newEquipment = equipmentAfterLongRest(character.character.equipment);
  // S4 — Human's Resourceful: finishing a Long Rest auto-grants Heroic
  // Inspiration. The consumer (`gainsHeroicInspirationOnLongRest`) decides the
  // default only; override-first — the player can still toggle the chip off
  // afterward (a Long Rest never CLEARS an existing Inspiration either).
  const gainsInspiration =
    gainsHeroicInspirationOnLongRest(character) || character.session.inspiration;
  // A `manual` tracker represents a table/clock/die outcome the app cannot
  // infer (Wings of Flying's 1d12-hour cooldown, homebrew counters). A Long
  // Rest recovers every rest-based resource, but must not fabricate that
  // external event. Preserve only those spent entries; missing stays the
  // canonical zero-used state for every recoverable tracker.
  const recoveryByTracker = new Map(
    resolveTrackers(character).map((tracker) => [tracker.id, tracker] as const)
  );
  const trackers: typeof character.session.trackers = {};
  for (const [id, spent] of Object.entries(character.session.trackers)) {
    const tracker = recoveryByTracker.get(id);
    if (tracker?.recovery === "manual" || tracker?.autoRecover === false) {
      trackers[id] = spent;
      continue;
    }
    if (tracker?.longRestRecovery !== undefined) {
      const used = Math.max(0, spent.used - tracker.longRestRecovery);
      if (used > 0) trackers[id] = { used };
    }
  }
  const endedActiveKeys = new Set(resolveActiveStatesEndingOnRest(character, "long"));
  return {
    ...character,
    character: { ...character.character, equipment: newEquipment },
    session: {
      ...sessionAfterLongRestReduction(character.session),
      hp: { current: max, temp: 0 },
      hitDice: { used: newHitDiceUsed },
      spellSlots: {},
      trackers,
      concentration: "",
      concentrationCastLevel: undefined,
      concentrationConditions: undefined,
      activeFeatures: (character.session.activeFeatures ?? []).filter(
        (key) => !endedActiveKeys.has(key)
      ),
      activeSpellCastLevels: omitStateKeys(
        character.session.activeSpellCastLevels,
        endedActiveKeys
      ),
      effectTimers: omitStateKeys(character.session.effectTimers, endedActiveKeys),
      effectBoundaries: omitStateKeys(
        character.session.effectBoundaries,
        endedActiveKeys
      ),
      // Levels owed to thirst or hunger stay until a full day's water or food
      // (SRD 5.2.1 Dehydration / Malnutrition).
      exhaustion: Math.max(
        longRestExhaustionFloor(character),
        character.session.exhaustion - exhaustionRemoved
      ),
      fadingPenalties: fadingPenaltiesAfterLongRest(character.session.fadingPenalties),
      inspiration: gainsInspiration,
      // A Bardic Inspiration die lasts at most 1 hour; a Long Rest always
      // outlasts it, so the combat-state SSOT clears deterministically.
      bardicInspirationDie: "",
      deathSucc: 0,
      deathFail: 0,
    },
  };
}

/** A Short Rest. */
export function shortRestCharacter(character: CharacterDoc): CharacterDoc {
  // Determine which trackers recover on short rest and by how much
  const recoveries = getShortRestRecoveries(character);
  const oldTrackers = character.session.trackers;

  // Build new trackers object without mutation or dynamic delete
  const newTrackers: typeof oldTrackers = {};
  for (const [key, data] of Object.entries(oldTrackers)) {
    const recovery = recoveries.get(key);
    if (recovery === "all") {
      // Full recovery: omit the entry (missing === used:0)
    } else if (typeof recovery === "number") {
      // Partial recovery: reduce used by N
      const newUsed = Math.max(0, data.used - recovery);
      if (newUsed > 0) newTrackers[key] = { used: newUsed };
      // else: omit (used:0)
    } else {
      // No short-rest recovery: keep as-is
      newTrackers[key] = data;
    }
  }

  // Pact Magic slots recover on a short rest — and ONLY them. Pact slots now key
  // distinctly (`pact-<level>` via {@link slotUsageKey}), so a Short Rest restores
  // them WITHOUT touching the normal/shared pool (the B3 collision previously
  // forced a wipe of EVERY slot whenever any pact slot existed — a Sorlock's
  // normal slots came back for free on a short rest).
  const newSpellSlots = Object.fromEntries(
    Object.entries(character.session.spellSlots).filter(
      ([key]) => !key.startsWith("pact-")
    )
  );

  // S4 — Ranger's Tireless: a Short Rest reduces Exhaustion by 1 (any source
  // carrying a `recovery: "short-rest"` exhaustion grant). `applyShortRestExhaustion`
  // returns the post-rest level (current minus the recovery, floored at 0); a
  // character without the grant is unchanged.
  const newExhaustion = applyShortRestExhaustion(character);
  const endedActiveKeys = new Set(resolveActiveStatesEndingOnRest(character, "short"));

  // RAW 2024 (PHB p.235): concentration ends only on
  //   • casting another concentration spell
  //   • failing a CON save after damage
  //   • being incapacitated
  //   • dying
  // A Short Rest is light activity while awake — none of those triggers
  // fire automatically, so concentration MUST persist. (Long Rest is
  // different: sleep = incapacitated → concentration drops; that path
  // already clears it in longRest above.) Previously this branch unset
  // session.concentration which silently broke active concentration
  // spells whose duration outlasts an hour (Find Familiar, Hex,
  // Tiny Hut, etc.).
  return {
    ...character,
    session: {
      ...character.session,
      trackers: newTrackers,
      spellSlots: newSpellSlots,
      exhaustion: newExhaustion,
      activeFeatures: (character.session.activeFeatures ?? []).filter(
        (key) => !endedActiveKeys.has(key)
      ),
      activeSpellCastLevels: omitStateKeys(
        character.session.activeSpellCastLevels,
        endedActiveKeys
      ),
      effectTimers: omitStateKeys(character.session.effectTimers, endedActiveKeys),
      effectBoundaries: omitStateKeys(
        character.session.effectBoundaries,
        endedActiveKeys
      ),
      // A Short Rest lasts 1 hour, exhausting the held die's maximum duration.
      bardicInspirationDie: "",
    },
  };
}

/** What a Long Rest fades: each fading penalty's step and a restored Hit Point maximum. */
export interface LongRestFades {
  penalties: Array<{ id: string; before: number; after: number }>;
  maxHp: { before: number; after: number } | null;
}

/** What a Long Rest fades for this character, read before the rest. */
export function longRestFades(character: CharacterDoc): LongRestFades {
  const { session } = character;
  const next = fadingPenaltiesAfterLongRest(session.fadingPenalties);
  const penalties = Object.entries(session.fadingPenalties ?? {})
    .filter(([, before]) => before > 0)
    .map(([id, before]) => ({ id, before, after: next?.[id] ?? 0 }));
  return {
    penalties,
    maxHp: session.hpMaxReduction
      ? {
          before: effectiveMaxHp(character.character, session),
          after: effectiveMaxHp(
            character.character,
            sessionAfterLongRestReduction(session)
          ),
        }
      : null,
  };
}

/** Those fades as log lines of the existing kinds: where each penalty now stands, and
 *  the maximum the reduction's end restores. */
export function longRestFadeEvents(fades: LongRestFades): CombatEvent[] {
  const events: CombatEvent[] = fades.penalties.map(({ id, after }) => ({
    kind: "fading-penalty",
    penaltyId: id,
    amount: after,
  }));
  if (fades.maxHp) {
    events.push({ kind: "hp-max-reduction", reduction: 0, max: fades.maxHp.after });
  }
  return events;
}
