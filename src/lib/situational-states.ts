/**
 * Situational attack facts as one-tap, turn-scoped states: the things only the
 * table can see (you can't see the target, an enemy is next to your bow, the
 * target is at long range, the fight is underwater, you are riding a mount). The
 * player lights the one that holds; it ends at the end of their turn or with a
 * second tap. Names and sentences come from the SRD reference tables
 * (`src/data/combat-variants.ts`), so the words live in one place; each state's
 * `attack` rules are what the attack cards net into their Advantage /
 * Disadvantage (`situationalAttackChips` in `src/lib/play/situations.ts`).
 */
import {
  ATTACK_SITUATION_REFERENCE,
  MOUNTED_COMBAT_REFERENCE,
  UNDERWATER_COMBAT_REFERENCE,
  type CombatVariantNote,
} from "@/data/combat-variants";
import type { BiText } from "@/data/types";
import type { GrantSource } from "@/lib/grants";
import type { Grant } from "@/lib/grant-schema";

export const SITUATION_IDS = [
  "unseen-target",
  "unseen-attacker",
  "ranged-in-melee",
  "long-range",
  "underwater",
  "mounted",
] as const;

export type SituationId = (typeof SITUATION_IDS)[number];

export type AttackKind = "melee" | "ranged";

/**
 * The narrower reach a situational clause states on a card whose attack kind the
 * sheet cannot pick for the player: a Thrown melee weapon (`thrown`), or an
 * attack that can be either (`melee` / `ranged`).
 */
export const SITUATIONAL_ATTACK_SCOPES = ["melee", "ranged", "thrown"] as const;
export type SituationalAttackScope = (typeof SITUATIONAL_ATTACK_SCOPES)[number];

/** One attack-roll clause a lit situation adds. */
export interface SituationalAttackRule {
  mode: "advantage" | "disadvantage";
  /** The attack kinds it reaches. */
  kinds: ReadonlyArray<AttackKind>;
  /** Only weapon attacks (Range, Underwater Combat). */
  weaponOnly?: true;
  /** Waived when the weapon deals this damage type (underwater melee: Piercing). */
  unlessDamageType?: string;
  /** Waived when the attacker has a Swim Speed (underwater melee). */
  unlessSwimSpeed?: true;
}

/**
 * How long a lit situation holds: an attack fact (`turn`) until the end of the
 * owner's turn; a place the whole fight happens in (`fight`: underwater, on a
 * mount) until tapped off or the encounter ends.
 */
export type SituationLasts = "turn" | "fight";

export interface SituationalState {
  id: SituationId;
  lasts: SituationLasts;
  /** The chip's name (also its grant's label). */
  label: BiText;
  /** The SRD lines this state stands for: its chip hint, in order. */
  reference: ReadonlyArray<CombatVariantNote>;
  /** The lines the sheet cannot apply, shown beside the chips while it is lit. */
  notes: ReadonlyArray<CombatVariantNote>;
  attack: ReadonlyArray<SituationalAttackRule>;
  grant: Extract<Grant, { type: "while-active" }>;
}

function line(table: ReadonlyArray<CombatVariantNote>, id: string): CombatVariantNote {
  const row = table.find((note) => note.id === id);
  if (!row) throw new Error(`situational-states: missing reference line "${id}"`);
  return row;
}

/** The stable active key a situation lights (`situation-long-range`). */
export function situationKey(id: SituationId): string {
  return `situation-${id}`;
}

function state(
  id: SituationId,
  lasts: SituationLasts,
  label: BiText,
  reference: ReadonlyArray<CombatVariantNote>,
  notes: ReadonlyArray<CombatVariantNote>,
  attack: ReadonlyArray<SituationalAttackRule>,
  grants: Extract<Grant, { type: "while-active" }>["grants"] = []
): SituationalState {
  return {
    id,
    lasts,
    label,
    reference,
    notes,
    attack,
    grant: {
      type: "while-active",
      activeKey: situationKey(id),
      label,
      // A turn fact ends at the end of the owner's turn (the current one when it
      // is theirs); a fight fact has no turn edge.
      ...(lasts === "turn"
        ? { duration: { kind: "turn-boundary", phase: "turn-end", turns: 1 } as const }
        : {}),
      grants,
    },
  };
}

const unseenTarget = line(ATTACK_SITUATION_REFERENCE, "unseen-target");
const unseenAttacker = line(ATTACK_SITUATION_REFERENCE, "unseen-attacker");
const rangedInMelee = line(ATTACK_SITUATION_REFERENCE, "ranged-in-melee");
const longRange = line(ATTACK_SITUATION_REFERENCE, "long-range");
const underwaterMelee = line(UNDERWATER_COMBAT_REFERENCE, "melee-underwater");
const underwaterRanged = line(UNDERWATER_COMBAT_REFERENCE, "ranged-underwater");
const underwaterFire = line(UNDERWATER_COMBAT_REFERENCE, "fire-resistance");
const controlledMount = line(MOUNTED_COMBAT_REFERENCE, "controlled-mount");

const BOTH: ReadonlyArray<AttackKind> = ["melee", "ranged"];

export const SITUATIONAL_STATES: ReadonlyArray<SituationalState> = [
  state(
    "unseen-target",
    "turn",
    unseenTarget.name,
    [unseenTarget],
    [],
    [{ mode: "disadvantage", kinds: BOTH }]
  ),
  state(
    "unseen-attacker",
    "turn",
    unseenAttacker.name,
    [unseenAttacker],
    [],
    [{ mode: "advantage", kinds: BOTH }]
  ),
  state(
    "ranged-in-melee",
    "turn",
    rangedInMelee.name,
    [rangedInMelee],
    [],
    [{ mode: "disadvantage", kinds: ["ranged"] }]
  ),
  state(
    "long-range",
    "turn",
    longRange.name,
    [longRange],
    [],
    [{ mode: "disadvantage", kinds: ["ranged"], weaponOnly: true }]
  ),
  state(
    "underwater",
    "fight",
    { en: "Underwater", it: "Sott'acqua" },
    [underwaterMelee, underwaterRanged, underwaterFire],
    [underwaterRanged],
    [
      {
        mode: "disadvantage",
        kinds: ["melee"],
        weaponOnly: true,
        unlessDamageType: "piercing",
        unlessSwimSpeed: true,
      },
      { mode: "disadvantage", kinds: ["ranged"], weaponOnly: true },
    ],
    [{ type: "damage-resistance", damageType: "fire" }]
  ),
  state(
    "mounted",
    "fight",
    { en: "Mounted", it: "In sella" },
    [controlledMount],
    [controlledMount],
    []
  ),
];

/** The lit situations as grant sources; an unlit one contributes nothing. */
export function resolveSituationalStateSources(
  activeKeys: ReadonlySet<string>
): GrantSource[] {
  return SITUATIONAL_STATES.filter((s) => activeKeys.has(s.grant.activeKey)).map((s) => ({
    id: s.grant.activeKey,
    grants: [s.grant],
  }));
}

/** The situations lit on the session, in table order. */
export function litSituations(session: {
  activeFeatures?: ReadonlyArray<string>;
}): SituationId[] {
  const active = session.activeFeatures ?? [];
  return SITUATIONAL_STATES.filter((s) => active.includes(s.grant.activeKey)).map(
    (s) => s.id
  );
}

export function situationalState(id: SituationId): SituationalState | undefined {
  return SITUATIONAL_STATES.find((s) => s.id === id);
}

/** The bilingual name behind a situation key, for log lines and labels. */
export function situationalStateName(key: string): BiText | undefined {
  return SITUATIONAL_STATES.find((s) => s.grant.activeKey === key)?.label;
}

/** The situations that hold for the whole fight (cleared when it ends). */
export const FIGHT_SITUATIONS: ReadonlyArray<SituationId> = SITUATIONAL_STATES.filter(
  (s) => s.lasts === "fight"
).map((s) => s.id);
