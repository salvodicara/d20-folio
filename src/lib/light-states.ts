/**
 * Light as a one-tap state (SRD 5.2.1 rules glossary "Dim Light", "Darkness",
 * "Lightly Obscured", "Heavily Obscured", "Darkvision"): the player lights the level
 * they are in (or looking into); what it does depends on their Darkvision. Dim Light
 * is Lightly Obscured (Disadvantage on Wisdom (Perception) checks to see, so the
 * passive Perception drops by 5); Darkness is Heavily Obscured (Blinded for sight:
 * attack rolls have Disadvantage). Darkvision lifts each level one step. It holds
 * until tapped off or the encounter ends. The sentences live in `VISION_REFERENCE`.
 */
import { VISION_REFERENCE } from "@/data/combat-variants";
import type { GrantSource } from "@/lib/grants";
import type { Grant } from "@/lib/grant-schema";
import { srdText, type LocText } from "@/lib/loc-text";

export const LIGHT_LEVELS = ["dim", "darkness"] as const;
export type LightLevel = (typeof LIGHT_LEVELS)[number];

/** How obscured what you try to see is. */
export type SightObscurement = "lightly-obscured" | "heavily-obscured";

/** The stable active key a light level lights (`light-dim`). */
export function lightStateKey(level: LightLevel): string {
  return `light-${level}`;
}

function referenceKey(id: string): string {
  const row = VISION_REFERENCE.find((note) => note.id === id);
  if (!row) throw new Error(`light-states: missing reference line "${id}"`);
  return row.key;
}

function referenceName(id: string): LocText {
  return srdText("rule", referenceKey(id), "name");
}

const LABELS: Record<LightLevel, LocText> = {
  dim: referenceName("dim-light"),
  darkness: referenceName("darkness"),
};

/**
 * The light a creature looks into: a light level the player taps, or the magical
 * Darkness a spell makes (the Darkness spell), which ordinary Darkvision can't lift.
 */
export type SightLevel = LightLevel | "magical-darkness";

/** What a creature can see with, in feet (0 or absent: it doesn't have that sense). */
export interface SightProfile {
  darkvisionFt: number;
  blindsightFt?: number;
  truesightFt?: number;
  /** Sees normally in any Darkness, magical included (Devil's Sight). */
  magicalDarknessSightFt?: number;
}

/**
 * How obscured a light level is for this sight (SRD 5.2.1 rules glossary). The sheet
 * keeps no distances, so a sense counts as reaching what the player looks at:
 *   - Blindsight and Truesight perceive through any Darkness;
 *   - Devil's Sight sees normally in Dim Light and in any Darkness;
 *   - Darkvision reads Dim Light as Bright and Darkness as Dim, but not magical Darkness.
 */
export function sightUnder(
  level: SightLevel,
  profile: SightProfile
): SightObscurement | null {
  const has = (feet: number | undefined) => (feet ?? 0) > 0;
  if (has(profile.blindsightFt) || has(profile.truesightFt)) return null;
  if (has(profile.magicalDarknessSightFt)) return null;
  const darkvision = has(profile.darkvisionFt);
  if (level === "dim") return darkvision ? null : "lightly-obscured";
  if (level === "darkness") return darkvision ? "lightly-obscured" : "heavily-obscured";
  return "heavily-obscured";
}

/**
 * What each obscurement does to the player's own rolls. Its words key in the
 * `rule` catalogue under the light level it reads as (Lightly Obscured is sight
 * in Dim Light, Heavily Obscured sight in Darkness): `vision.<id>.grants.0.grants.<i>`.
 */
const OBSCUREMENT: Record<
  SightObscurement,
  { referenceId: string; grants: Extract<Grant, { type: "while-active" }>["grants"] }
> = {
  "lightly-obscured": {
    referenceId: "dim-light",
    grants: [{ type: "disadvantage-on", rollType: "check", vs: "perception" }],
  },
  "heavily-obscured": {
    referenceId: "darkness",
    grants: [{ type: "disadvantage-on", rollType: "attack", scope: "all", vs: "attack" }],
  },
};

/** The light level lit on the session, if any. */
export function litLightLevel(session: {
  activeFeatures?: ReadonlyArray<string>;
}): LightLevel | null {
  const active = session.activeFeatures ?? [];
  return LIGHT_LEVELS.find((level) => active.includes(lightStateKey(level))) ?? null;
}

/** Whether any light level is lit among these keys. */
export function anyLightLit(activeKeys: ReadonlySet<string>): boolean {
  return LIGHT_LEVELS.some((level) => activeKeys.has(lightStateKey(level)));
}

/** The lit light level as a grant source, its rules set by the character's sight. */
export function resolveLightStateSources(
  activeKeys: ReadonlySet<string>,
  profile: SightProfile
): GrantSource[] {
  return LIGHT_LEVELS.filter((level) => activeKeys.has(lightStateKey(level))).map(
    (level) => {
      const sight = sightUnder(level, profile);
      const obscurement = sight ? OBSCUREMENT[sight] : undefined;
      return {
        id: lightStateKey(level),
        label: LABELS[level],
        ...(obscurement
          ? { ref: { kind: "rule", key: referenceKey(obscurement.referenceId) } as const }
          : {}),
        grants: [
          {
            type: "while-active",
            activeKey: lightStateKey(level),
            grants: obscurement?.grants ?? [],
          },
        ],
      };
    }
  );
}

/** The name behind a light key, for log lines and labels. */
export function lightStateName(key: string): LocText | undefined {
  const level = LIGHT_LEVELS.find((l) => lightStateKey(l) === key);
  return level ? LABELS[level] : undefined;
}

export function lightLevelName(level: LightLevel): LocText {
  return LABELS[level];
}

/** Who is looking: their conditions and their senses. */
export interface Viewer {
  conditions: ReadonlyArray<string>;
  sight: SightProfile;
  /** Sees Invisible creatures and objects (See Invisibility, Truesight's own). */
  seeInvisibleFt?: number;
}

/** What is looked at: its conditions (Invisible). */
export interface Seen {
  conditions?: ReadonlyArray<string>;
}

/** What the table knows about the scene: the light where the source is, when known
 *  ("bright", a light level, or magical Darkness). */
export interface SightContext {
  light?: SightLevel | "bright";
}

/**
 * Whether `viewer` can see `source` (2024 rules glossary: Blinded, Invisible,
 * Heavily Obscured; Blindsight and Truesight perceive through them, See Invisibility
 * sees the Invisible, Darkvision and Devil's Sight lift Darkness by `sightUnder`).
 * `false` and `true` are what the facts say; `undefined` means they don't say enough
 * (the light is unknown and nothing else decides): the table answers, by hand.
 */
export function canSee(
  viewer: Viewer,
  source: Seen,
  ctx: SightContext = {}
): boolean | undefined {
  const has = (feet: number | undefined) => (feet ?? 0) > 0;
  const perceives = has(viewer.sight.blindsightFt) || has(viewer.sight.truesightFt);
  if (viewer.conditions.includes("blinded")) return perceives;
  if (
    source.conditions?.includes("invisible") &&
    !perceives &&
    !has(viewer.seeInvisibleFt)
  ) {
    return false;
  }
  if (ctx.light === undefined) return undefined;
  if (ctx.light === "bright") return true;
  return sightUnder(ctx.light, viewer.sight) !== "heavily-obscured";
}
