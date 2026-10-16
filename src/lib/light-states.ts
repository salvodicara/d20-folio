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
import type { BiText } from "@/data/types";
import type { GrantSource } from "@/lib/grants";
import type { Grant } from "@/lib/grant-schema";

export const LIGHT_LEVELS = ["dim", "darkness"] as const;
export type LightLevel = (typeof LIGHT_LEVELS)[number];

/** How obscured what you try to see is. */
export type SightObscurement = "lightly-obscured" | "heavily-obscured";

/** The stable active key a light level lights (`light-dim`). */
export function lightStateKey(level: LightLevel): string {
  return `light-${level}`;
}

function referenceName(id: string): BiText {
  const row = VISION_REFERENCE.find((note) => note.id === id);
  if (!row) throw new Error(`light-states: missing reference line "${id}"`);
  return row.name;
}

const LABELS: Record<LightLevel, BiText> = {
  dim: referenceName("dim-light"),
  darkness: referenceName("darkness"),
};

/** Dim Light reads as Bright Light with Darkvision; Darkness as Dim Light. */
export function sightUnder(
  level: LightLevel,
  darkvisionFt: number
): SightObscurement | null {
  const darkvision = darkvisionFt > 0;
  if (level === "dim") return darkvision ? null : "lightly-obscured";
  return darkvision ? "lightly-obscured" : "heavily-obscured";
}

const OBSCUREMENT_GRANTS: Record<
  SightObscurement,
  Extract<Grant, { type: "while-active" }>["grants"]
> = {
  "lightly-obscured": [
    {
      type: "disadvantage-on",
      rollType: "check",
      vs: "perception",
      description: {
        en: "Wisdom (Perception) checks to see (Lightly Obscured)",
        it: "Prove di Saggezza (Percezione) per vedere (Leggermente Oscurato)",
      },
    },
  ],
  "heavily-obscured": [
    {
      type: "disadvantage-on",
      rollType: "attack",
      scope: "all",
      vs: "attack",
      description: {
        en: "Attack rolls (Blinded for sight: Darkness)",
        it: "Tiri per colpire (Accecato per la vista: Oscurità)",
      },
    },
  ],
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

/** The lit light level as a grant source, its rules set by the Darkvision range. */
export function resolveLightStateSources(
  activeKeys: ReadonlySet<string>,
  darkvisionFt: number
): GrantSource[] {
  return LIGHT_LEVELS.filter((level) => activeKeys.has(lightStateKey(level))).map(
    (level) => {
      const sight = sightUnder(level, darkvisionFt);
      return {
        id: lightStateKey(level),
        grants: [
          {
            type: "while-active",
            activeKey: lightStateKey(level),
            label: LABELS[level],
            grants: sight ? OBSCUREMENT_GRANTS[sight] : [],
          },
        ],
      };
    }
  );
}

/** The bilingual name behind a light key, for log lines and labels. */
export function lightStateName(key: string): BiText | undefined {
  const level = LIGHT_LEVELS.find((l) => lightStateKey(l) === key);
  return level ? LABELS[level] : undefined;
}

export function lightLevelName(level: LightLevel): BiText {
  return LABELS[level];
}
