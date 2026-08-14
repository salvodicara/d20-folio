import type { CastSourceOverrides } from "@/lib/grants";
import type { ResolvedAction } from "@/lib/smart-tracker";

/** Locale-free spell facts that can be replaced by the physical casting source. */
export interface CastSourceProfile {
  saveDC?: number;
  attackBonus?: number;
  concentration: boolean;
  maxRounds?: number;
}

/** Resolve level-gated source effects before the cast option reaches the UI.
 * Other source facts remain available below the threshold. */
export function resolveCastSourceOverridesForLevel(
  overrides: CastSourceOverrides | undefined,
  level: number
): CastSourceOverrides | undefined {
  if (!overrides?.activeEffect?.minLevel) return overrides;
  if (level >= overrides.activeEffect.minLevel) return overrides;
  const eligible: CastSourceOverrides = { ...overrides };
  delete eligible.activeEffect;
  return Object.keys(eligible).length > 0 ? eligible : undefined;
}

/** Apply only explicitly declared source facts, preserving every other spell fact. */
export function applyCastSourceOverrides(
  base: CastSourceProfile,
  overrides?: CastSourceOverrides
): CastSourceProfile {
  if (!overrides) return base;
  return {
    ...base,
    ...(overrides.saveDC !== undefined ? { saveDC: overrides.saveDC } : {}),
    ...(overrides.attackBonus !== undefined
      ? { attackBonus: overrides.attackBonus }
      : {}),
    ...(overrides.concentration !== undefined
      ? { concentration: overrides.concentration }
      : {}),
    ...(overrides.maxRounds !== undefined ? { maxRounds: overrides.maxRounds } : {}),
  };
}

/** Project a source profile back onto the combat action without disturbing its
 * damage, targeting, components, or other spell-owned facts. */
export function applyCastSourceOverridesToAction(
  action: ResolvedAction,
  overrides?: CastSourceOverrides,
  activeKey?: string
): ResolvedAction {
  if (!overrides) return action;
  const profile = applyCastSourceOverrides(
    {
      concentration: action.concentration,
      ...(action.summary.saveDC !== undefined ? { saveDC: action.summary.saveDC } : {}),
      ...(action.summary.attackBonus !== undefined
        ? { attackBonus: action.summary.attackBonus }
        : {}),
      ...(action.standingEffect?.maxRounds !== undefined
        ? { maxRounds: action.standingEffect.maxRounds }
        : action.activeDurationRounds !== undefined
          ? { maxRounds: action.activeDurationRounds }
          : {}),
    },
    overrides
  );
  const sourceDuration = overrides.maxRounds;

  return {
    ...action,
    concentration: profile.concentration,
    summary: {
      ...action.summary,
      ...(action.summary.saveDC !== undefined && profile.saveDC !== undefined
        ? { saveDC: profile.saveDC }
        : {}),
      ...(action.summary.attackBonus !== undefined && profile.attackBonus !== undefined
        ? { attackBonus: profile.attackBonus }
        : {}),
      ...(overrides.targetCreatureTypes && action.summary.targeting
        ? {
            targeting: {
              ...action.summary.targeting,
              creatureTypes: overrides.targetCreatureTypes,
            },
          }
        : {}),
    },
    ...(action.standingEffect && sourceDuration !== undefined
      ? {
          standingEffect: {
            ...action.standingEffect,
            maxRounds: sourceDuration,
          },
        }
      : {}),
    ...(overrides.activeEffect
      ? {
          activatesKey: overrides.activeEffect.activeKey,
          activeTurnBoundary: {
            phase: overrides.activeEffect.duration.phase,
            turns: overrides.activeEffect.duration.turns,
          },
        }
      : activeKey && sourceDuration !== undefined && !action.standingEffect
        ? { activatesKey: activeKey, activeDurationRounds: sourceDuration }
        : {}),
  };
}
