/**
 * A4 — Declarative SRD effect model.
 *
 * The uniform way for feats, race traits, class features, magic items,
 * invocations, metamagic, and backgrounds to declare their mechanical
 * effects as data (a `grants: Grant[]` field). A single evaluator walks
 * the character and aggregates every applicable grant into the
 * `AggregatedGrants` view the sheet reads. This is the ONLY path between
 * SRD data and the rendered mechanics — `grants[]` + an evaluator branch
 * + a consumer (golden rule 5); the declarative model is complete.
 *
 * The old regex parsers it replaced (`deriveSenses` / `deriveResistances`)
 * are deleted. Downstream consumers that turn the aggregate into concrete
 * numbers (`featAsi`, `effectiveWalkingSpeedFt`, the `attacksPerAction` reads, …)
 * read FROM this aggregate — they no longer parse English.
 */

import type {
  AbilityCode,
  ActionEconomyCategory,
  ActionType,
  BiText,
  ClassId,
  ConditionId,
  CreatureType,
  CreatureSize,
  DamageSource,
  FeatCategory,
  SpellSchool,
  WeaponCategory,
  WeaponMastery,
  WeaponType,
} from "@/data/types";
import type { DamageType } from "@/types/damage";
import {
  arraySchema,
  exactConformer,
  refSchema,
  type ExactSchemaContext,
} from "@/lib/exact-schema";
import {
  GRANT_SCHEMA,
  type Grant as SchemaGrant,
  type GrantSchemaCustomTypes,
} from "@/lib/grant-schema";
import type { ProficiencyToken } from "@/types/ids";
import { asProficiencyToken } from "@/lib/proficiency-tokens";
import type { SrdKind } from "@/i18n/srd-en";
import { srdEn } from "@/i18n/srd-en";
import { srdKey, srdGrantSegment } from "@/i18n/srd-key";
import type { LocText } from "@/lib/loc-text";
import { srdText, litText } from "@/lib/loc-text";
import type { CombatEffectBindings } from "@/types/combat-effect";
import {
  conformResourceSpec,
  makeItemResourceIdentity,
  type ItemResourceIdentity,
} from "@/lib/resources";
import type { ResourceSpec } from "@/types/resource";

/**
 * PS-J — the closed vocabulary of scopes an attack-side effect can target.
 * Only "all" can fold into the global attack verdict; narrower scopes remain
 * explicit card facts.
 */
export const ATTACK_CLAUSE_SCOPES = [
  "all",
  "marked",
  "cursed",
  "vowed",
  "missed",
  "untaken",
  "strength",
  "strDex",
  "sorcery",
] as const;

export type AttackClauseScope = (typeof ATTACK_CLAUSE_SCOPES)[number];
export type MarkedTargetScope = Extract<AttackClauseScope, "marked" | "cursed">;

/**
 * The declarative mechanics language, inferred from the exact runtime schema.
 * Adding a kind or field happens in GRANT_SCHEMA once; the conformer and public
 * type change together.
 */
export type Grant = SchemaGrant;

type GrantSchemaRefs = { readonly grant: Grant };

function conformProficiencyToken(value: unknown): ProficiencyToken | null {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 256 &&
    value !== "__proto__" &&
    value !== "constructor" &&
    value !== "prototype"
    ? asProficiencyToken(value)
    : null;
}

const GRANT_SCHEMA_CONTEXT: ExactSchemaContext<GrantSchemaCustomTypes, GrantSchemaRefs> =
  {
    customs: {
      "proficiency-token": conformProficiencyToken,
      "resource-spec": conformResourceSpec,
    },
    refs: { grant: GRANT_SCHEMA },
  };

const GRANTS_SCHEMA = arraySchema(refSchema<"grant", Grant>("grant"));

/** Strict, canonical authoring boundary for one declarative mechanic. */
const conformGrantExact = exactConformer(GRANT_SCHEMA, GRANT_SCHEMA_CONTEXT);

export function conformGrant(value: unknown): Readonly<Grant> | null {
  return conformGrantExact(value);
}

/** Strict, canonical authoring boundary for an ordered list of mechanics. */
const conformGrantsExact = exactConformer(GRANTS_SCHEMA, GRANT_SCHEMA_CONTEXT);

export function conformGrants(value: unknown): readonly Readonly<Grant>[] | null {
  return conformGrantsExact(value);
}

type GrantOf<Kind extends Grant["type"]> = Extract<Grant, { readonly type: Kind }>;

/** Public helper types remain projections of the one Grant schema. */
export type ScopedSlotLevelFormula = GrantOf<"scoped-extra-spell-slot">["levelFormula"];
export type ScopedSlotSpellScope = GrantOf<"scoped-extra-spell-slot">["scope"];
export type WhileActiveDuration = NonNullable<GrantOf<"while-active">["duration"]>;
export type EffectBoundAmount = Exclude<GrantOf<"regen-at-turn-start">["amount"], string>;
export type CastLevelScaling = NonNullable<
  GrantOf<"damage-retaliation">["castLevelScaling"]
>;
export type WhileActiveAfterEffect = NonNullable<GrantOf<"while-active">["afterEffect"]>;

/** Resolve a timed state's effective lifetime from the slot that created it. */
export function whileActiveDurationAtCastLevel(
  duration: WhileActiveDuration | undefined,
  castLevel: number | undefined
): WhileActiveDuration | undefined {
  if (duration?.kind !== "timed" || castLevel === undefined) return duration;
  const tier = duration.byCastLevel?.reduce<
    NonNullable<typeof duration.byCastLevel>[number] | undefined
  >(
    (best, candidate) =>
      candidate.minLevel <= castLevel &&
      (best === undefined || candidate.minLevel > best.minLevel)
        ? candidate
        : best,
    undefined
  );
  return tier
    ? {
        ...duration,
        minutes: tier.minutes,
        maxRounds: tier.maxRounds,
      }
    : duration;
}

// ─── Source rows that may carry a `grants` field ────────────────────────────

/** Anything with a SRD id, an EN/IT name, and optionally a grants array. */
export interface GrantSource {
  id: string;
  /**
   * Optional inline display name — set ONLY on synthetic/runtime sources that
   * carry no catalogue `ref`. SRD sources localize their name off the catalogue
   * via `ref` (R6+R3 SLICE 7c/7d), so they omit it. Not read by the evaluator.
   */
  name?: BiText;
  grants?: ReadonlyArray<Grant>;
  /**
   * The source's stable i18n-catalogue reference `{ kind, key }` (R6+R3 SLICE
   * 7c). The evaluator extends `ref.key` with each grant's `.grants.<seg>` path
   * (see {@link srdGrantSegment}) to key that grant's localizable strings, so the
   * aggregate carries a {@link LocText} `srd` ref instead of materialized BiText.
   * Omitted for sources whose grants carry no localizable strings, or for
   * runtime-built sources that supply their own `lit`/`custom` text; the
   * evaluator then falls back to an engine literal. SRD feature/equipment/
   * invocation/maneuver/background/magic-item sources set it.
   */
  ref?: { kind: SrdKind; key: string };
  /** Physical magic-item attribution. `id` is the per-instance runtime source;
   * `ref.key` remains the catalogue id used for localization. */
  item?: { itemId: string; instanceId: string };
  /** Immutable facts captured when a remote standing effect was created. Omitted
   * for ordinary catalogue/build sources. */
  runtime?: {
    castLevel?: number;
    bindings?: CombatEffectBindings;
  };
}

/** Bind an authored toggle key to one physical item copy without decoding ids. */
export function resolveGrantActiveKey(
  source: Pick<GrantSource, "id" | "item">,
  authoredKey: string
): string {
  return source.item ? `${source.id}:${authoredKey}` : authoredKey;
}

// ─── Aggregated effects after evaluation ────────────────────────────────────

/**
 * Non-walking speed value — number of feet, or a walking-speed-relative
 * sentinel: `"equal-to-walking"` (= your Speed) or `"twice-walking"` (= 2× your
 * Speed). The sentinels resolve at render time in `resolveNonWalkingSpeed`.
 */
export type NonWalkingSpeed = number | "equal-to-walking" | "twice-walking";

/** A pending player choice surfaced by `evaluateGrants`. */
export type PendingChoice =
  | {
      sourceId: string;
      kind: "ability-score";
      abilities: ReadonlyArray<AbilityCode>;
      amount: number;
      cap?: number;
    }
  | {
      sourceId: string;
      kind: "skill-proficiency";
      options: ReadonlyArray<string>;
      amount: number;
    }
  | {
      sourceId: string;
      kind: "expertise";
      amount: number;
    }
  | {
      sourceId: string;
      kind: "language";
      options: ReadonlyArray<string>;
      amount: number;
    }
  | {
      sourceId: string;
      kind: "tool-proficiency";
      options: ReadonlyArray<string>;
      amount: number;
    }
  | {
      sourceId: string;
      kind: "cantrip";
      classSpellList?: ClassId;
      amount: number;
      /** Pin casting ability for picks made through this slot. */
      spellAbility?: AbilityCode;
    }
  | {
      sourceId: string;
      kind: "spell";
      classSpellList?: ClassId;
      /** choice-spell-multi-list: union of allowed class lists (Magical Secrets). */
      classSpellLists?: ReadonlyArray<ClassId>;
      maxLevel: number;
      amount: number;
      /** Pin casting ability for picks made through this slot. */
      spellAbility?: AbilityCode;
      /**
       * Restrict the pool to Ritual-tagged spells across all class lists
       * (Pact of the Tome's Book of Shadows). The picker filters on
       * `spell.ritual === true`.
       */
      ritualOnly?: boolean;
      /**
       * Restrict the pool to one school of magic (`spell.school ===
       * spellSchool`). Wizard School Savant features. The picker filters on it.
       */
      spellSchool?: SpellSchool;
      /**
       * Restrict the pool to ANY of several schools (Fey-Touched's
       * "Divination or Enchantment"). The picker filters on membership.
       */
      spellSchools?: ReadonlyArray<SpellSchool>;
      /**
       * The picks land in the Wizard's spellbook (`prepared:false`), not as
       * always-prepared spells. Wizard School Savant features.
       */
      toSpellbook?: boolean;
    }
  | {
      /**
       * Skilled-style "pick N skills OR tools" pending pick. The picker
       * UI surfaces a unified pool. Used by `lib/feat-skill-tool-choices.ts`
       * to resolve into character.skills / character.toolProficiencies.
       */
      sourceId: string;
      kind: "skill-or-tool-proficiency";
      amount: number;
    }
  | {
      /**
       * **Choice-feat** pending pick (origin-feat grant). The source grants a
       * whole feat of choice from `category` (Lessons of the First Ones / Human
       * Versatile → "origin"). The picker (`feat-feat-choices.ts`) enumerates
       * the eligible feats of that category and resolves each pick into a feat
       * ref on `character.features`. `amount` is how many feats to pick (1 for
       * every current case).
       */
      sourceId: string;
      kind: "feat";
      category: FeatCategory;
      amount: number;
    };

/**
 * The exact payment owner a bounded slotless capability debits — a session
 * TRACKER (feature/feat/species free casts, legacy item pools) or one physical
 * item copy's typed RESOURCE (the per-instance identity the evaluator composes
 * from the equipped source and the grant's declared `resourceCost`).
 */
export type ResourcePayment =
  | ({ kind: "item-resource" } & ItemResourceIdentity)
  | { kind: "tracker"; trackerId: string };

/**
 * One level-gated free-cast capacity step (`capacityByLevel`): at character
 * level ≥ `minLevel` the step's formula/fixed count replaces the base
 * `chargesFormula`/`chargesPerRest` pair. Highest eligible `minLevel` wins.
 */
export type FreeCastCapacityStep = NonNullable<
  GrantOf<"free-cast-spell">["capacityByLevel"]
>[number];

interface FreeCastEntryBase {
  /** Attribution/tracker key: the (possibly per-spell) capability id. */
  sourceId: string;
  spellId: string;
  /** Allowed cast levels and their per-cast charge cost; omitted = base level. */
  castLevels?: ReadonlyArray<{ level: number; cost: number }>;
  casterAbility?: AbilityCode;
  minLevel?: number;
  castOverrides?: CastSourceOverrides;
}

/**
 * A free-cast grant resolved against its source, discriminated on the exact
 * `payment` owner: the tracker arm carries the resolved per-rest cap fields
 * the tracker consumers read; the item arm's capacity/recovery live on the
 * physical resource itself (`resolveItemResourceAvailability`).
 */
export type FreeCastEntry =
  | (FreeCastEntryBase & {
      payment: Extract<ResourcePayment, { kind: "item-resource" }>;
    })
  | (FreeCastEntryBase & {
      payment: Extract<ResourcePayment, { kind: "tracker" }>;
      chargesPerRest: number;
      rest: "short" | "long";
      chargesFormula?: string;
      capacityByLevel?: ReadonlyArray<FreeCastCapacityStep>;
    });

/**
 * D4 — a free-cast-FROM-LIST grant resolved against its source: a GUIDED pool the
 * player picks a spell from at cast time (Cleric Divine Intervention → any Cleric
 * spell ≤ 5th, 1/Long Rest, no slot). Unlike {@link FreeCastEntry} (one fixed
 * spell), the spell is the player's choice within the pool — a class list
 * (`spellList` ≤ `maxSpellLevel`) OR a fixed set (`spellIds`, War God's
 * Blessing). `payment` is the exact owner the cast debits; the tracker arm's
 * cap fields stay optional (omitted = inferred from the debited tracker).
 */
interface FreeCastFromListEntryBase {
  sourceId: string;
  spellList?: string;
  maxSpellLevel?: number;
  /** A fixed pool of stable spell ids (mutually exclusive with `spellList`). */
  spellIds?: readonly string[];
  /** Per-spell charge costs (spellId → charges); absent spells cost 1. */
  spellCosts?: Readonly<Record<string, number>>;
  casterAbility?: AbilityCode;
  castOverrides?: CastSourceOverrides;
  /** Per-rest cap; omitted = the debited payment owner's resolved total. */
  chargesPerRest?: number;
  /** Rest cadence the cap recovers on; omitted = the debited tracker's. */
  rest?: "short" | "long";
}

export type FreeCastFromListEntry =
  | (FreeCastFromListEntryBase & {
      payment: Extract<ResourcePayment, { kind: "item-resource" }>;
    })
  | (FreeCastFromListEntryBase & {
      payment: Extract<ResourcePayment, { kind: "tracker" }>;
    });

/** Typed facts a cast source changes without forking the underlying spell. */
export interface CastSourceOverrides {
  saveDC?: number;
  attackBonus?: number;
  concentration?: boolean;
  maxRounds?: number;
  /** Legal creature types for this physical casting source. The resolver gates
   * selectable targets from this typed set; it never parses the spell prose. */
  targetCreatureTypes?: ReadonlyArray<CreatureType>;
  /** A source-only state established after this cast. `minLevel` is resolved
   * before the option reaches the cast UI, so an ineligible source cannot arm it. */
  activeEffect?: {
    activeKey: string;
    minLevel?: number;
    duration: Extract<WhileActiveDuration, { kind: "turn-boundary" }>;
  };
}

/**
 * An at-will (unbounded, slotless) self-cast grant resolved against its source.
 * Unlike {@link FreeCastEntry} there is no charge cap — the spell can be cast
 * any number of times at its base level without expending a slot. `sourceId`
 * is the originating feature (an Eldritch Invocation) so the UI can attribute
 * the at-will row; `casterAbility` pins the spellcasting ability for the cast.
 */
export interface AtWillCastEntry {
  sourceId: string;
  spellId: string;
  casterAbility?: AbilityCode;
  /**
   * When the source maximizes the spell's Temporary HP instead of rolling
   * (Fiendish Vigor → False Life), the already-resolved flat maximized total
   * (2d4+4 → 12). Absent for a normal slotless at-will cast. Override-first —
   * a value the player applies; the engine never auto-sets HP.
   */
  autoMaxTempHp?: number;
}

/**
 * Maximize a dice formula into its highest deterministic total — every `NdX`
 * term becomes `N*X` (its top face) and every flat `±K` term is summed in.
 * Pure, no RNG: it computes the maximum a roll could produce, used by the
 * `at-will-cast-spell` auto-max-temp-HP path (Fiendish Vigor → False Life's
 * `"2d4+4"` → `2*4 + 4 = 12`). Whitespace-tolerant; an unparseable formula
 * yields 0. NEVER rolls — this is the ceiling, not a sample.
 */
export function maximizeDiceFormula(formula: string): number {
  let total = 0;
  // Match every signed term: a dice term (`2d4`) or a flat integer (`4`).
  const termRe = /([+-]?)\s*(\d+)(?:d(\d+))?/g;
  let m: RegExpExecArray | null;
  while ((m = termRe.exec(formula)) !== null) {
    const sign = m[1] === "-" ? -1 : 1;
    const count = Number(m[2]);
    const faces = m[3] === undefined ? undefined : Number(m[3]);
    // A dice term contributes count × top-face; a flat term contributes count.
    const value = faces === undefined ? count : count * faces;
    total += sign * value;
  }
  return total;
}

/**
 * An aggregated `scoped-extra-spell-slot` grant resolved against its source.
 * A bonus, upcast-capable spell slot whose level scales with character level,
 * restricted to a scoped pool of prepared spells. The smart-tracker creates a
 * 1-use expend/regain counter on the source feature with the `recovery`
 * cadence; the cast-option consumer resolves the live level + eligible pool.
 */
export interface ScopedExtraSlotEntry {
  sourceId: string;
  levelFormula: ScopedSlotLevelFormula;
  scope: ScopedSlotSpellScope;
  recovery: "short-or-long" | "short" | "long";
}

/** A casting modifier scoped per class (or globally). */
export interface CastingModifierEntry {
  amount: number;
  scope: "all" | ClassId;
}

/**
 * A spell-damage bonus the character can add to one damage roll of a qualifying
 * spell (Draconic Sorcery Elemental Affinity → +CHA mod on a spell that deals
 * the chosen draconic damage type). `damageTypes` is the triggering set (empty =
 * any damaging spell). `value` is `"modifier"` (add `ability`'s modifier, floored
 * at `min`) or a flat number. `scope` narrows the casting class. `cantripOnly`
 * restricts the bonus to cantrips (spell level 0 — Cleric Potent Spellcasting);
 * `oncePerTurn` is the informational "one damage roll / once per turn" limiter.
 * The consumer (`resolveSpellDamageBonus`) resolves the modifier per spell at
 * render. Both flags are present only when set (default-omitted) so existing
 * type-keyed entries keep their lean shape.
 */
export interface SpellDamageBonusEntry {
  damageTypes: ReadonlyArray<DamageType>;
  ability?: AbilityCode;
  value: "modifier" | number;
  min: number;
  scope: "all" | ClassId;
  cantripOnly?: boolean;
  oncePerTurn?: boolean;
  /** Restrict to spells of these SCHOOLS (Evoker Empowered Evocation → evocation). */
  schools?: ReadonlyArray<string>;
}

/** Outcome-driven damage rules for qualifying spells (Evoker Potent Cantrip). */
export interface SpellDamageOutcomeEntry {
  scope: "all" | ClassId;
  cantripOnly: boolean;
  damageOnMiss?: "half";
  damageOnSave?: "half";
}

/**
 * A bonus added to the Hit Points a HEALING SPELL restores (the healing
 * counterpart of {@link SpellDamageBonusEntry}). `amount` is the flat base;
 * `perSpellLevel` adds the cast slot level; `minSpellLevel` gates the spell
 * level (cantrips excluded when ≥1); `scope` restricts to a class's spell list.
 * The consumer (`resolveHealBonus`) sums every matching entry per cast.
 */
export interface HealBonusEntry {
  amount: number;
  perSpellLevel: boolean;
  minSpellLevel: number;
  scope: "all" | ClassId;
}

export interface SelfHealOnOtherEntry {
  amount: number;
  perSpellLevel: boolean;
  minSpellLevel: number;
  scope: "all" | ClassId;
}

export interface MaximizeSpellHealingEntry {
  minSpellLevel: number;
  scope: "all" | ClassId;
}

/**
 * An ALTERNATE damage type a damaging spell may deal — the player's choice each
 * cast (the type-swap counterpart of {@link SpellDamageBonusEntry}, which adds a
 * number). `toType` is the offered type (Great Old One Psychic Spells → Psychic);
 * `scope` restricts it to one casting class's spell list ("warlock") or "all".
 * The consumer (`resolveSpellDamageTypeOverrides`) returns every in-scope
 * alternate type; the smart-tracker folds them into the spell's damage-type
 * CHOICE chip (reusing the existing multi/choice rendering) so the player picks
 * the original type or the override per cast. The engine never auto-swaps.
 */
export interface SpellDamageTypeOverrideEntry {
  toType: DamageType;
  scope: "all" | ClassId;
}

/**
 * A component-waiver: the caster may cast spells of the given `schools` (empty =
 * any) without the listed `waive` components, scoped to one casting class or
 * "all" (Great Old One Psychic Spells: Enchantment/Illusion Warlock spells
 * without V/S). The consumer (`resolveComponentWaiver`) returns the waived
 * components for a given spell; the smart-tracker marks them on the verdict.
 */
export interface ComponentWaiverEntry {
  schools: ReadonlyArray<string>;
  waive: ReadonlyArray<"v" | "s" | "m">;
  scope: "all" | ClassId;
}

/**
 * A spell-damage bonus targeted at ONE specific cantrip by SRD id (Warlock's
 * Agonizing Blast → +CHA mod to the chosen cantrip's damage rolls; repeatable,
 * one entry per chosen cantrip). `spellId` is the resolved chosen cantrip.
 * `value` is `"modifier"` (add `ability`'s modifier, floored at `min`) or a flat
 * number. The consumer (`resolveCantripDamageBonus`) sums every entry whose
 * `spellId` matches the cantrip being rendered, per cantrip, at render time.
 */
export interface CantripDamageBonusEntry {
  spellId: string;
  ability?: AbilityCode;
  value: "modifier" | number;
  min: number;
}

/**
 * A non-damage on-hit effect rider targeted at ONE specific cantrip by SRD id
 * (Warlock's Repelling Blast → on a hit with the chosen attack-roll cantrip,
 * push a Large-or-smaller creature up to 10 ft; repeatable, one entry per
 * chosen cantrip). `spellId` is the resolved chosen cantrip. The `effect`
 * discriminant selects the rider clause; `"forced-movement"` carries
 * `direction` ("push"/"pull"), `distanceFt`, and `maxTargetSize` (the largest
 * size the rider can move). The consumer (`resolveCantripForcedMovement`)
 * returns the matching rider for the cantrip being rendered.
 */
export interface CantripEffectRiderEntry {
  spellId: string;
  effect: "forced-movement";
  direction: "push" | "pull";
  distanceFt: number;
  maxTargetSize: CreatureSize;
}

/**
 * A range bonus targeted at ONE specific cantrip by SRD id, scaling by a class's
 * level (Warlock's Eldritch Spear → +30 ft × Warlock level to the chosen damaging
 * cantrip's range; repeatable, one entry per chosen cantrip). `spellId` is the
 * resolved chosen cantrip; `bonusPerLevel` is the per-level feet (30) and
 * `scalesWith` the class whose level multiplies it. The consumer
 * (`resolveCantripRangeBonus`) sums `bonusPerLevel × level` across every entry
 * whose `spellId` matches the cantrip being rendered, per cantrip, at render.
 */
export interface CantripRangeBonusEntry {
  spellId: string;
  bonusPerLevel: number;
  scalesWith: ClassId;
}

/**
 * A flat to-hit bonus on weapon attack rolls, scoped to ranged / melee / any
 * weapons (Archery fighting style → `{ amount: 2, scope: "ranged" }`). The
 * consumer (`resolveActions` weapon rows) sums the `amount`s of every entry
 * whose `scope` applies to the weapon and adds the total to the computed
 * attack bonus. Override-first: skipped when the player pins a per-weapon
 * `attackBonusOverride`.
 */
export interface WeaponAttackBonusEntry {
  /**
   * The to-hit bonus, carried UNRESOLVED: a flat number, OR the ability-derived
   * `{ ability, min }` variant (Sacred Weapon → +CHA mod, min +1). The evaluator
   * has no character/ability scores, so the consumer
   * (`resolveWeaponAttackBonuses` in smart-tracker) resolves the ability variant
   * per weapon — mirroring how `weaponDamageBonuses` carries `number | "PB" |
   * sourceKey` for the consumer to resolve.
   */
  amount: number | { ability: AbilityCode; min?: number };
  scope: "any" | "ranged" | "melee";
  /**
   * Source feature/feat id (provenance). The to-hit breakdown attributes each
   * bonus to the entity that grants it (Archery → the Archery feat) by its
   * ONE catalogue name (golden rule 6) — the SAME pattern `weapon-damage-bonus`
   * carries for the damage breakdown. `resolveWeaponAttackBonuses` (smart-tracker)
   * resolves it to the feature's name `LocText`.
   */
  sourceId: string;
  /**
   * The wrapping `while-active` toggle id when the grant arrived through one
   * (Sacred Weapon → `paladin-devotion-sacred-weapon`) — so the to-hit breakdown
   * can mark the bonus as a conditional, currently-active source. Mirrors
   * `weaponDamageBonuses.whileActiveKey` (Rage).
   */
  whileActiveKey?: string;
}

/**
 * A manipulation of how a weapon's OWN damage dice are rolled / what its base
 * damage is (Great Weapon Fighting floor, Savage Attacker reroll-keep-higher,
 * Two-Weapon Fighting off-hand modifier, Unarmed Fighting Unarmed Strike). The
 * normalised view the attack-row consumer reads — every field is already a
 * concrete value (defaults applied). `sourceId` attributes it to its feature.
 * The engine NEVER rolls dice; the consumer surfaces these as annotations /
 * damage-formula adjustments the player applies when they roll externally.
 */
export interface DamageDieModifierEntry {
  sourceId: string;
  mode: "floor" | "reroll-keep-higher" | "offhand-ability-mod" | "unarmed-strike";
  appliesTo: "weapon" | "two-handed-melee" | "light-melee" | "unarmed";
  /** "floor": highest die face replaced (Great Weapon Fighting → 2). */
  floorBelow?: number;
  /** "floor": value a floored face becomes (Great Weapon Fighting → 3). */
  floorTo?: number;
  /** "reroll-keep-higher": once-per-turn limiter (Savage Attacker). */
  oncePerTurn?: boolean;
  /** "unarmed-strike": base die when holding a weapon/shield (1d6). */
  baseDie?: string;
  /** "unarmed-strike": upgraded die when unburdened (1d8). */
  unburdenedDie?: string;
  /** "unarmed-strike": die dealt to a Grappled creature each turn (1d4). */
  grappleDie?: string;
  /** "unarmed-strike" / "offhand-ability-mod": the ability modifier added. */
  abilityMod?: AbilityCode;
  /** "unarmed-strike": the Unarmed Strike's damage type. */
  damageType?: DamageType;
}

/** A typed AC formula candidate (the highest applicable result wins at render). */
export interface AcFormula {
  sourceId: string;
  base: number;
  bonuses: ReadonlyArray<AbilityCode>;
  condition: "no-armor" | "no-armor-no-shield" | "always" | "while-active";
  shieldBonus: number;
  /**
   * Present ONLY for a `while-active` formula — the toggle key that gates it
   * (Circle of the Moon Circle Forms → `druid-moon-circle-forms`). Lets the AC
   * consumer (and the UI) attribute the form-AC candidate to its toggle.
   */
  activeKey?: string;
}

/**
 * L11 — an activatable feature the player can toggle on/off during play
 * (Bladesong, Innate Sorcery, Rage, …). Surfaced regardless of state so the
 * UI can render a toggle; `active` reflects the current session active-set.
 */
export interface ActivatableGroup {
  key: string;
  /** Catalogue-authored key retained when `key` is bound to an item instance. */
  authoredKey?: string;
  sourceId: string;
  label: LocText;
  active: boolean;
}

/**
 * L12 — a single-select variant chooser surfaced by a `choice-grant-bundle`
 * grant (Circle of the Land terrain, etc.). The UI renders one selector per
 * `bundleKey`; `selected` is the current session pick (null = unchosen).
 */
export interface GrantBundle {
  bundleKey: string;
  sourceId: string;
  label: LocText;
  options: ReadonlyArray<{ id: string; label: LocText }>;
  selected: string | null;
  /** Mirrors the grant's `choiceFrequency`; defaults to `"rest"` when absent. */
  choiceFrequency: "creation" | "rest";
}

/**
 * A **choice-resistance** slot surfaced by a `choice-resistance` grant (Boon of
 * Energy Resistance, etc.). The UI renders a multi-select of `options` capped at
 * `amount`; `selected` is the current re-selectable session pick (the validated,
 * deduped, capped subset of `options` already merged into `damageResistances`).
 * `choiceKey` is the `session.grantBundleChoices` key the picker writes back to.
 */
export interface ChoiceResistance {
  choiceKey: string;
  sourceId: string;
  label: LocText;
  options: ReadonlyArray<DamageType>;
  amount: number;
  selected: ReadonlyArray<DamageType>;
}

/**
 * Parse a `choice-resistance` session value (a comma-separated list of
 * `DamageType` tokens stored at `session.grantBundleChoices[choiceKey]`) into a
 * validated pick list: keeps only tokens that appear in `options`, dedupes
 * (first occurrence wins), and caps the result at `amount`. A `null`/`undefined`
 * value, blank tokens, and out-of-list tokens all drop out — so an over-long or
 * tampered value can never grant more or different resistances than the slot
 * allows. Pure (no I/O); the evaluator and any picker UI share it.
 */
export function parseChoiceResistanceValue(
  raw: string | null | undefined,
  options: ReadonlyArray<DamageType>,
  amount: number
): DamageType[] {
  if (raw == null) return [];
  const allowed = new Set<DamageType>(options);
  const picks: DamageType[] = [];
  const seen = new Set<DamageType>();
  for (const token of raw.split(",")) {
    const t = token.trim() as DamageType;
    if (!allowed.has(t) || seen.has(t)) continue;
    seen.add(t);
    picks.push(t);
    if (picks.length >= amount) break;
  }
  return picks;
}

/**
 * The catalogue ref a grant's localizable strings resolve under (R6+R3 SLICE
 * 7c): the source's `{ kind, key }` extended with this grant's `.grants.<seg>`
 * path. `undefined` for sources with no catalogue ref (synthetic/test sources, or
 * runtime sources that supply their own literal text) — the evaluator then falls
 * back to {@link litText} over the grant's inline BiText, preserving behaviour.
 */
type GrantRef = { kind: SrdKind; key: string } | undefined;

/**
 * Build a {@link LocText} for ONE field of a grant: an `srd` catalogue reference
 * when the grant carries a `ref` (a real SRD source), else an engine literal over
 * the grant's inline `BiText` (synthetic/test sources). The `srd` path NEVER
 * reads the BiText, so the data strip deleted it from real SRD sources; the
 * inline `lit` survives ONLY on synthetic/runtime grants (so it's optional).
 */
export function grantField(ref: GrantRef, field: string, lit?: BiText): LocText {
  return ref ? srdText(ref.kind, ref.key, field) : litText(lit ?? EMPTY_BITEXT);
}

/** Fallback BiText for a synthetic grant that carries neither a `ref` nor inline text. */
const EMPTY_BITEXT: BiText = { en: "", it: "" };

/**
 * PS-J — the `scope` slice an adv/dis clause carries into the aggregate: present
 * ONLY when the clause is an ATTACK clause narrower than "every attack roll"
 * ({@link AdvantageClause.scope}). `"all"` is dropped so a consumer testing
 * `scope === undefined` reads exactly one thing: this clause nets into the
 * card's verdict.
 */
function narrowedScope(g: Extract<Grant, { type: "advantage-on" | "disadvantage-on" }>): {
  scope?: AttackClauseScope;
} {
  return g.rollType === "attack" && g.scope !== "all" ? { scope: g.scope } : {};
}

/**
 * The catalogue ref of a source's top-level grant at `index` — the same
 * `<sourceKey>.grants.<seg>` the evaluator computes. Exported so the (deliberate)
 * second bundle-collector (`feature-choices.collectGrantBundles`) keys its labels
 * IDENTICALLY to the aggregate, never re-deriving the path math.
 */
export function topGrantRef(src: GrantSource, g: Grant, index: number): GrantRef {
  if (!src.ref) return undefined;
  return {
    kind: src.ref.kind,
    key: srdKey(src.ref.key, srdGrantSegment(grantSegmentArgs(g), index)),
  };
}

/** Exported companion to {@link topGrantRef} for bundle OPTION label refs. */
export function bundleOptionRef(parent: GrantRef, optionId: string): GrantRef {
  return optionGrantRef(parent, optionId);
}

/**
 * The canonical ENGLISH value of a grant field — a FACT (not display): the
 * catalogue EN via `srdEn` when the grant carries a `ref`, else the inline
 * BiText's `.en`. Used where the engine needs the English name as a token
 * (weapon-proficiency match, prone-note label) that survives the data strip.
 */
export function grantFieldEn(ref: GrantRef, field: string, lit?: BiText): string {
  return (ref ? srdEn(ref.kind, ref.key, field) : undefined) ?? lit?.en ?? "";
}

/**
 * Whether an OPTIONAL grant field is present — true when the catalogue carries it
 * (the grant has a `ref` and `srdEn(field)` resolves) OR an inline `lit` BiText is
 * supplied (synthetic/runtime grant). The presence gate survives the data strip:
 * a `granted-action`'s `description`/`trigger` is emitted whenever the catalogue
 * has it, not only when the (now-stripped) inline BiText exists.
 */
export function hasGrantField(ref: GrantRef, field: string, lit?: BiText): boolean {
  return Boolean((ref ? srdEn(ref.kind, ref.key, field) : undefined) ?? lit);
}

/**
 * Compose a child grant's catalogue ref from its parent grant's `ref` by
 * appending the child's `.grants.<seg>` segment (for `while-active` /
 * `choice-grant-bundle` inner grants) — mirroring the codemod's nested path.
 * `undefined` parent → `undefined` child (the literal fallback propagates).
 */
function childGrantRef(parent: GrantRef, child: Grant, index: number): GrantRef {
  if (!parent) return undefined;
  return {
    kind: parent.kind,
    key: srdKey(parent.key, srdGrantSegment(grantSegmentArgs(child), index)),
  };
}

/** Compose a bundle OPTION's catalogue ref (`<grantKey>.options.<optionId>`). */
function optionGrantRef(parent: GrantRef, optionId: string): GrantRef {
  if (!parent) return undefined;
  return { kind: parent.kind, key: srdKey(parent.key, "options", optionId) };
}

/** The id/name args `srdGrantSegment` needs, read off any Grant shape. */
function grantSegmentArgs(g: Grant): { id?: string; optionId?: string; nameEn?: string } {
  // PRIM grants carry their stable id under a kind-specific field (`auraId`,
  // `copyId`); treat it as the catalogue `id` so localizable
  // strings key on a STABLE id (golden rule 7), never the array index.
  const primId =
    g.type === "aura" ? g.auraId : g.type === "copy-to-2nd-target" ? g.copyId : undefined;
  return {
    ...("id" in g && g.id ? { id: g.id } : primId ? { id: primId } : {}),
    ...("optionId" in g && typeof g.optionId === "string"
      ? { optionId: g.optionId }
      : {}),
    ...("name" in g && g.name ? { nameEn: g.name.en } : {}),
  };
}

/**
 * ARCHITECTURE.md combat model — a feat/feature/invocation-granted action surfaced on
 * the Combat page (Shield reaction, at-will invocation, …). `sourceId` is the
 * originating feature so the UI can attribute it.
 */
export interface GrantedAction {
  sourceId: string;
  name: LocText;
  slot: ActionType;
  description?: LocText;
  cost?: GrantOf<"granted-action">["cost"];
  trigger?: LocText;
  /** Ability a TARGET saves against (when the action forces a save). */
  saveAbility?: AbilityCode;
}

/**
 * A weapon a feature manifests (Soulknife's Psychic Blades). The normalised
 * aggregate view the attack-row consumer reads — `sourceId` is the originating
 * feature so the UI can attribute it. Fields mirror the grant; defaults are
 * already resolved (`masteryIsFree`/`proficient` are concrete booleans).
 */
export interface ManifestedWeapon {
  sourceId: string;
  id: string;
  name: LocText;
  /** Canonical English name — a FACT used for the weapon-proficiency match. */
  nameEn: string;
  category: WeaponCategory;
  weaponType: WeaponType;
  damageDie: string;
  damageType: DamageType;
  properties: ReadonlyArray<string>;
  mastery?: WeaponMastery;
  /** True when the mastery use does NOT count against Weapon Mastery picks. */
  masteryIsFree: boolean;
  /** Whether the manifested weapon is wielded with proficiency (default true). */
  proficient: boolean;
  bonusAction?: {
    name: LocText;
    slot: ActionType;
    damageDie: string;
  };
}

/**
 * A natural-weapon attack row a TRANSFORMATION form grants while active (Wild
 * Shape beast bite, Starry Form Archer attack, Armorer Thunder Pulse). The
 * normalised aggregate view the attack-row consumer (`resolveFormAttacks`)
 * reads — `activeKey` is the wrapping `while-active` toggle (so the UI can name
 * the form), `sourceId` the originating feature (so the UI can attribute it).
 * Only present in the aggregate while its form toggle is lit (the evaluator
 * collects it inside the active `while-active` branch). Distinct from a
 * `ManifestedWeapon` (always-on once the feature is owned) — a form attack
 * retracts the moment the form is toggled off.
 */
export interface FormAttack {
  sourceId: string;
  /** The wrapping `while-active` toggle id (the lit form). */
  activeKey: string;
  id: string;
  name: LocText;
  category: WeaponCategory;
  weaponType: WeaponType;
  damageDie: string;
  /** S12b — the form-attack die keyed by threshold level (Stars Archer
   *  `{ 3: "1d8", 10: "2d8" }`); `resolveFormAttacks` resolves it at the
   *  character's level, falling back to `damageDie`. Omit for a flat die. */
  damageDieByLevel?: Readonly<Record<number, string>>;
  damageType: DamageType;
  properties: ReadonlyArray<string>;
  /** Fixed attack/damage ability (Armorer INT); omitted → derive from STR/DEX. */
  attackAbility?: AbilityCode;
  /** Whether the form attack is wielded with proficiency (default true). */
  proficient: boolean;
  /** A once-per-turn extra-damage rider on a hit (Infiltrator Lightning Launcher
   *  +1d6 Lightning). `resolveFormAttacks` folds it into `summary.extraDamage`. */
  oncePerTurnExtra?: { dice: string; damageType: DamageType };
  /** An on-hit self-side reminder ({@link LocText} ref — Guardian Disadvantage,
   *  Dreadnaught push/pull), sourced from the grant's `<ref>.note` catalogue key.
   *  Omitted when the form weapon carries no reminder. Routed to `summary.effect`. */
  note?: LocText;
}

/**
 * A conjured **pact weapon** (Warlock's Pact of the Blade) resolved against its
 * source. Unlike a `ManifestedWeapon` (a fixed weapon profile), this declares
 * only the rules of the bond — the actual weapon form is a player choice the
 * consumer resolves override-first from the session `pactWeaponConfig`.
 */
export interface PactWeapon {
  sourceId: string;
  id: string;
  name: LocText;
  /** Ability used for attack + damage rolls (CHA for Pact of the Blade). */
  attackAbility: AbilityCode;
  /** Elemental damage types the player may switch the weapon to deal. */
  damageTypeChoices: ReadonlyArray<DamageType>;
  /** Whether the bonded weapon counts as a Spellcasting Focus. */
  isFocus: boolean;
  /** Action economy of conjuring the weapon (Bonus Action). */
  conjureSlot: ActionType;
  /** Default conjured-blade die when the player hasn't configured one. */
  defaultDamageDie: string;
  /** Default conjured-blade damage type (its "normal" type). */
  defaultDamageType: DamageType;
}

/**
 * An on-hit extra-damage rider that fires only with a Warlock's conjured pact
 * weapon (Eldritch Smite, Lifedrinker). Resolved against its source; the
 * consumer (`resolvePactWeaponAttacks`) scales the dice by the warlock's
 * pact-slot level when `scalesPerSlotLevel` is set and attaches it to the
 * pact-weapon attack row. Override-first — never auto-spends a slot / Hit Die.
 */
export interface PactWeaponRider {
  sourceId: string;
  id: string;
  name: LocText;
  /** Canonical English name — a FACT used for the rider's prone-note label. */
  nameEn: string;
  /** Extra-damage die (base AND per-slot-level die when `scalesPerSlotLevel`). */
  dice: string;
  /** Fixed damage type (mutually exclusive with `damageTypeChoices`). */
  damageType?: DamageType;
  /** Player-selectable damage types (mutually exclusive with `damageType`). */
  damageTypeChoices?: ReadonlyArray<DamageType>;
  /** Paid for by expending a Pact Magic spell slot (Eldritch Smite). */
  costsPactSlot: boolean;
  /** Die multiplied by the spent slot's level (Eldritch Smite). */
  scalesPerSlotLevel: boolean;
  /** Secondary Prone effect on the target (Eldritch Smite, Huge or smaller). */
  prone?: "huge-or-smaller";
  /** Lets you expend a Hit Die to heal on the hit (Lifedrinker). */
  healFromHitDie: boolean;
}

/**
 * A Rogue Cunning Strike option in the character's known catalogue (base L5
 * Poison/Trip/Withdraw, Devious Strikes Daze/Knock Out/Obscure, plus subclass
 * adders). `cost` is the number of Sneak Attack dice forgone; `save` (when set)
 * is the ability the TARGET rolls against — the consumer resolves the DC.
 */
export interface CunningStrikeOption {
  sourceId: string;
  optionId: string;
  name: LocText;
  cost: number;
  description: LocText;
  save?: AbilityCode;
  condition?: ConditionId;
}

/**
 * An aggregated `tracker-alt-recovery` grant: an alternate cost to restore a
 * use of `targetTracker` by spending `amount` units from `fromTracker`.
 */
export interface TrackerAltRecoveryEntry {
  targetTracker: string;
  amount: number;
  fromTracker: string;
}

/**
 * A resolved resource-conversion (PRIM-resource-conversion) — the authored
 * converter plus its source attribution. The cost-engine
 * (`planResourceConversion`) plans the concrete spend/produce ops.
 */
export type ResourceConversionEntry = { sourceId: string } & Omit<
  GrantOf<"resource-conversion">,
  "type"
>;

/**
 * A familiar-enhancement bundle (`familiar-enhancement`) resolved against its
 * source — the buffs a feature layers on a summoned familiar (Warlock
 * Investment of the Chain Master). Carries the declared deltas verbatim; the
 * consumer (`resolveFamiliarEnhancements`) merges these across sources and
 * stamps the owner-derived save DC. Every benefit is optional (a source may
 * confer any subset).
 */
export interface FamiliarEnhancement {
  sourceId: string;
  extraSpeedFt?: number;
  extraSpeedModes?: ReadonlyArray<"fly" | "swim" | "climb">;
  bonusActionAttack?: boolean;
  damageTypeConversion?: ReadonlyArray<DamageType>;
  usesOwnerSaveDc?: boolean;
  reactionResistance?: boolean;
}

/** A conditional advantage/disadvantage clause. */
export interface AdvantageClause {
  sourceId: string;
  rollType: "save" | "check" | "attack" | "initiative";
  vs: string;
  description: LocText;
  /**
   * FRONTIER-S3 — `true` when this clause applies only during combat ROUND 1
   * (Assassinate's first-round attack advantage). The turn/round consumer gates
   * it on `round === 1`; absent = a permanent clause.
   */
  round1?: boolean;
  /**
   * Carries the wrapping `while-active` toggle (when any — Rage's STR advantage,
   * Reckless Attack, Innate Sorcery) so the chip can mark itself as a
   * conditional, currently-active source ("· active"), exactly as
   * `weaponDamageBonuses.whileActiveKey` does. Absent = an unconditional clause.
   */
  whileActiveKey?: string;
  /**
   * PS-J — for an ATTACK clause whose reach is NARROWER than "every attack roll
   * you can make right now": the {@link AttackClauseScope} the card must STATE
   * instead of asserting a verdict. Absent = the clause is blanket and nets into
   * the card's Adv./Disadv. gloss (`"all"` never travels — the evaluator drops
   * it, so "absent" has exactly one meaning). Condition-built clauses
   * (`condition-effects`) omit it: the 2024 condition set was triaged by RA-32,
   * whose one scoped member (Grappled) states its exclusion in the turn-limiter
   * sentence instead.
   */
  scope?: AttackClauseScope;
  /** Target-bound one-shot policy. Passive clauses omit it. */
  consume?: "next" | "each";
}

/**
 * A resolved roll-floor (Rogue Reliable Talent): treat a d20 roll below `floor`
 * as `floor`, on `rollType` rolls gated by `appliesTo`. The consumer surfaces it
 * as a passive note (engine rolls no dice).
 */
export interface RollFloorClause {
  sourceId: string;
  rollType: "check" | "save" | "attack";
  floor: number;
  appliesTo: "proficient" | "all";
  description: LocText;
  /**
   * Carries the wrapping `while-active` toggle (when any — Circle of Stars
   * Starry Form, Clockwork Trance of Order) so the passive note can mark itself
   * as a conditional, currently-active source ("· active"), exactly as
   * `weaponDamageBonuses.whileActiveKey` does. Absent = an unconditional floor.
   */
  whileActiveKey?: string;
}

/** A resolved physical die adjustment. Dice stay table-entered; the stable
 * source id and consume policy make target-bound one-shot effects reversible. */
export interface RollDieAdjustmentClause {
  sourceId: string;
  rollType: "check" | "save" | "attack";
  operation: "add" | "subtract";
  dice: string;
  consume: "next" | "each";
}

/**
 * A resolved SELF-side downside (Barbarian Reckless Attack): while in effect,
 * attack rolls AGAINST the character have Advantage. The consumer surfaces it as
 * a defensive note framed as a Disadv. — no enemy modeling, no dice.
 */
export interface IncomingAttackClause {
  sourceId: string;
  description: LocText;
  /**
   * Carries the wrapping `while-active` toggle (Reckless Attack) so the note can
   * mark itself "· active" — mirrors `RollFloorClause.whileActiveKey`. Absent =
   * an unconditional downside.
   */
  whileActiveKey?: string;
}

/**
 * A Temporary-HP grant resolved against its source. `formula` is the
 * unresolved tracker-formula string ("CHA+level", "PB", "level"); the consumer
 * (`smart-tracker`) resolves it to a concrete number and surfaces a manual
 * "Gain N temporary HP" entry. Override-first — never auto-applied.
 */
export interface TempHpEntry {
  sourceId: string;
  formula: string;
  trigger?: LocText;
  slot?: ActionType;
}

/**
 * A resolved aura/emanation (PRIM-aura/emanation). Carries the source id +
 * radius + who it affects + the structured effect; the presenter (`auraVMs`)
 * composes a readable note. Informational — no battlefield model.
 */
/**
 * Canonical runtime list of who an aura affects — source of truth for the
 * `character.auraAffects_<affects>` i18n keys. The {@link AuraAffects} union (used
 * on both the `"aura"` grant and {@link AuraClause}) is derived from this tuple, so
 * a new audience widens the type and the guard sees it (golden rule 6).
 */
export const AURA_AFFECTS = [
  "allies",
  "enemies",
  "allies-and-self",
  "all-in-range",
] as const;
export type AuraAffects = (typeof AURA_AFFECTS)[number];

export interface AuraClause {
  sourceId: string;
  auraId: string;
  radius: number | "variable";
  radiusByLevel?: Readonly<Record<number, number>>;
  affects: AuraAffects;
  effect: Extract<Grant, { type: "aura" }>["effect"];
  description?: LocText;
}

/**
 * A resolved spell-die-augment (PRIM-spell-die-augment). The consumer
 * (`resolveSpellDieAugment`) rewrites a spell's `damageDice` die size.
 */
export interface SpellDieAugmentEntry {
  spellId: string;
  fromDie: number;
  toDie: number;
}

/**
 * A resolved copy-to-2nd-target rider (PRIM-copy-to-2nd-target). Informational —
 * the presenter (`copyTargetVMs`) surfaces the bilingual `effect` on the feature.
 */
export interface CopyToTargetClause {
  sourceId: string;
  copyId: string;
  appliesToFeature?: string;
  effect: LocText;
}

/** A condition immunity that applies only when one exact modeled source tries
 * to apply the condition. Stable source ids keep this generic and data-driven. */
export interface SourceConditionImmunity {
  condition: ConditionId;
  sourceId: string;
}

/** The normalised view a renderer/consumer reads. */
export interface AggregatedGrants {
  // Senses
  darkvisionFt: number;
  blindsightFt: number;
  tremorsenseFt: number;
  truesightFt: number;
  /**
   * "See Invisible" range in feet — see Invisible creatures within this range
   * that aren't behind Total Cover (Aberrant Sorcery Revelation in Flesh). 0
   * when not granted. Distinct from `truesightFt` (Truesight also pierces
   * illusions / shapechangers / the Ethereal Plane).
   */
  seeInvisibleFt: number;
  /** True when any source lets the character breathe both air and water. */
  airAndWaterBreathing: boolean;

  // Defensive
  /** Set of canonical 2024 damage types the character resists permanently. */
  damageResistances: ReadonlySet<DamageType>;
  /** True when one active source grants resistance to every damage type. */
  allDamageResistance: boolean;
  damageImmunities: ReadonlySet<DamageType>;
  damageVulnerabilities: ReadonlySet<DamageType>;
  conditionImmunities: ReadonlySet<ConditionId>;
  sourceConditionImmunities: readonly SourceConditionImmunity[];
  /** True while any active grant forbids casting spells. */
  spellcastingBlocked: boolean;
  /** True while any active grant forbids maintaining Concentration. */
  concentrationBlocked: boolean;
  /** True while active effects forbid regaining Hit Points. */
  healingBlocked: boolean;
  /**
   * Damage SOURCES the character resists (Abjurer Spell Resistance → `"spell"`).
   * Orthogonal to `damageResistances` (which keys on `DamageType`): a source
   * resistance halves the damage no matter the element, so it lives in its own
   * set the defenses consumer renders alongside the element resistances.
   */
  damageSourceResistances: ReadonlySet<DamageSource>;
  /**
   * FLAT incoming-damage reductions (`flat-damage-reduction` — Heavy Armor
   * Master's −PB on Bludgeoning/Piercing/Slashing while in Heavy armor). Each
   * entry is a self-side informational defense line (the engine does no damage
   * math); the consumer (`deriveFlatDamageReductions`) resolves the `"PB"`
   * sentinel + the wearing-state gate before display. Merge: `[list]`.
   */
  flatDamageReductions: ReadonlyArray<{
    damageTypes: ReadonlyArray<DamageType>;
    amount: number | "PB";
    trigger: "attack";
    condition?: "wearing-heavy-armor";
    sourceId: string;
  }>;
  /** Active Evasion-style save-damage rewrites, source-attributed. */
  saveDamageRules: ReadonlyArray<{
    ability: AbilityCode;
    requiresDamageOnSuccess: "half";
    onSuccess: "none";
    onFailure: "half";
    sourceId: string;
  }>;

  // Movement
  /** Additive walking-speed bonus (post-armor, pre-exhaustion). */
  speedBonusFt: number;
  /**
   * Conditional walking-speed bonuses keyed by wearing-state gate (currently
   * only `"no-heavy-armor"` → Ranger Roving). The consumer
   * (`effectiveWalkingSpeedFt`) adds the matching bucket only when its gate
   * holds. Empty when no gated grant applies.
   */
  conditionalSpeedBonusFt: Readonly<Partial<Record<"no-heavy-armor", number>>>;
  /**
   * Walking-speed bonus that applies ONLY on the character's first combat turn
   * (Gloom Stalker Dread Ambusher's Ambusher's Leap → +10 ft). The SPEED
   * counterpart of the `advantage-on { round1 }` gate: the consumer
   * (`effectiveWalkingSpeedFt`) adds it only when passed `round === 1`, then it
   * auto-clears from round 2+. Summed across `round1`-flagged `speed` grants; 0
   * when none apply.
   */
  round1SpeedBonusFt: number;
  /**
   * Round-1 save-gated damage-DOUBLER notes (Assassin Death Strike). One entry per
   * source; the consumer resolves the DC via `featureSaveDc` and the UI shows it
   * only in combat round 1. DISPLAY-ONLY — the engine never doubles anything.
   */
  round1DamageDoubles: ReadonlyArray<{
    sourceId: string;
    saveAbility: AbilityCode;
    saveDcAbility: AbilityCode;
  }>;
  /** `null` if no non-walking speed is granted; otherwise the max value seen. */
  flySpeed: NonWalkingSpeed | null;
  swimSpeed: NonWalkingSpeed | null;
  climbSpeed: NonWalkingSpeed | null;
  /**
   * Multiplier applied to the effective walking Speed (Boots of Speed → 2).
   * Default 1 (no multiplier). MAX across `speed-multiplier` grants — multipliers
   * never stack in RAW. The consumer (`effectiveWalkingSpeedFt`) multiplies
   * `(base + speedBonusFt)` by this BEFORE subtracting flat exhaustion / armor
   * penalties.
   */
  speedMultiplier: number;
  /**
   * Walking-Speed FLOOR in feet (Boots of Striding and Springing → 30). Default
   * 0 (no floor). MAX across `speed-floor` grants — floors never stack. The
   * consumer (`effectiveWalkingSpeedFt`) applies it LAST, raising the effective
   * walking Speed to at least this value ("Speed becomes N unless higher").
   */
  speedFloorFt: number;
  /** Tightest active walking-Speed ceiling; `null` means no ceiling. */
  speedCapFt: number | null;

  // Derived stats
  /** Sum of AC bonuses from items / class features. */
  acBonus: number;
  /** Every Unarmored-Defense-style AC formula candidate. */
  acFormulas: ReadonlyArray<AcFormula>;
  /**
   * Raised Medium-armor DEX-to-AC cap (Medium Armor Master → 3 when DEX 16+).
   * `null` when no source overrides it (the RAW default of 2 applies). `cap` is
   * the new ceiling; `minDex` is the DEX SCORE required for it to apply (16 for
   * Medium Armor Master). MAX `cap` wins across grants. `computeAC` reads this
   * and substitutes `cap` for the hard-coded 2 only when the character's DEX
   * score is at least `minDex`.
   */
  mediumArmorDexCap: { cap: number; minDex: number } | null;
  /** HP bonus per character level (Tough = 2, Dwarven Toughness = 1, …). */
  hpPerLevel: number;
  /**
   * Ability-modifier AC bonuses (Bladesong: +INT mod, min 1). Feature-only —
   * the consumer (`effectiveAC`) adds `max(abilityModifier(ability), min)` per
   * entry. Kept separate from the flat `acBonus` so it can't double-count the
   * item-AC pass in `computeAC`.
   */
  acBonusAbilities: ReadonlyArray<{ ability: AbilityCode; min: number }>;
  /** One-shot flat HP bonus (Boon of Fortitude, Draconic Resilience). */
  hpFlat: number;
  /**
   * The per-source attribution of {@link hpFlat} — ONE entry per `hp-flat` grant,
   * stamped with its SOURCE catalogue `ref` (the feat/feature/item/spell `{kind,
   * key}`, an ID — never a display string, golden rule 7) and signed `amount`.
   * Pushed at the SAME seam `hpFlat` accumulates, so it INHERITS the identical
   * recursion + `while-active` descent: a standing Aid (`hp-flat:5` inside a
   * `while-active` block) appears here iff its toggle lifts `hpFlat`. The Max-HP
   * breakdown tip MAPS these (localizing each `ref` → its source name at the view
   * edge) instead of re-walking the grant sources top-level only, so the tip rows
   * sum to EXACTLY `hpFlat` by construction (`sum(amount) === hpFlat`).
   */
  hpFlatParts: ReadonlyArray<{ ref: { kind: SrdKind; key: string }; amount: number }>;
  /** Lowest natural d20 that crits on a weapon attack (default 20; min wins). */
  critThreshold: number;
  /**
   * Lowest natural d20 that a DEATH SAVING THROW counts as a 20 (Champion
   * Survivor "Defy Death", default 20; min wins). Distinct from `critThreshold`
   * (weapon attacks). Consumed by `deathSaveOutcome(roll, deathSaveCritThreshold)`.
   */
  deathSaveCritThreshold: number;
  /**
   * Start-of-turn HP-regain riders (Champion Survivor Heroic Rally). One entry
   * per source; the consumer (`resolveStartOfTurnRegen`) resolves the amount +
   * guard. `requiresMinHp` defaults to `true`.
   */
  startOfTurnRegen: ReadonlyArray<{
    sourceId: string;
    amount: string;
    condition: "bloodied" | "always";
    requiresMinHp: boolean;
    /** Redirect the amount to TEMPORARY HP (Heroism), not healing. Default false. */
    asTempHp: boolean;
  }>;
  /**
   * Critical-hit movement riders (Champion Remarkable Athlete). One entry per
   * source; the consumer (`resolveOnCritMovement`) resolves the distance.
   */
  onCritMovement: ReadonlyArray<{
    sourceId: string;
    fraction: "half" | "full";
    ignoresOpportunityAttacks: boolean;
  }>;
  /**
   * Replace-attack-with-cast riders (Eldritch Knight War Magic / Improved War
   * Magic). One entry per source; the consumer (`resolveReplaceAttackWithCast`)
   * caps `attacks` at the character's `attacksPerAction`.
   */
  replaceAttackWithCast: ReadonlyArray<{
    sourceId: string;
    attacks: number;
    classSpellList: string;
    minSpellLevel: number;
    maxSpellLevel: number;
    castTime: "action";
  }>;
  /**
   * General Unarmed-Strike damage upgrades (Monk Martial Arts, College of Dance
   * Bardic Damage). The consumer (`effectiveUnarmedStrike`) picks the best die.
   */
  unarmedStrikeDice: ReadonlyArray<{
    die: string;
    attackAbility?: AbilityCode;
    damageAbility?: AbilityCode;
    damageType: DamageType;
    /**
     * Source-feature id (provenance) — the consumer resolves a deferred
     * `"classSpecific:<key>"` die against THIS feature's OWNING class at the
     * character's level IN that class (Monk Martial Arts → Monk level), never the
     * primary class read at the total character level (multiclass-correct).
     */
    sourceId: string;
  }>;
  /**
   * Melee weapon reach extensions (Barbarian World Tree Battering Roots). The
   * attack-row consumer widens the reach + surfaces the extra masteries for
   * weapons matching `appliesTo`.
   */
  weaponReachBonuses: ReadonlyArray<{
    bonusFt: number;
    appliesTo: "heavy-or-versatile" | "all-melee";
    extraMasteries: ReadonlyArray<string>;
  }>;
  /**
   * Spell-slot → tracker-use conversions (Bard Font of Inspiration). One entry
   * per source; the consumer (`getSpellSlotTrackerRecovery`) resolves available
   * slot levels + post-recovery used counts.
   */
  spellSlotTrackerRecoveries: ReadonlyArray<{
    trackerId: string;
    usesPerSlot: number;
    sourceId: string;
  }>;
  /**
   * Initiative-trigger tracker top-ups (Bard Superior Inspiration). One entry
   * per source; the consumer (`getInitiativeTrackerTopUps`) resolves the
   * per-tracker floor.
   */
  initiativeTrackerTopUps: ReadonlyArray<{
    trackerId: string;
    upTo: number;
    sourceId: string;
  }>;
  /**
   * At-0-HP interrupts ("drop to 1 instead": Relentless Endurance / Undying
   * Sentinel / Boon of Misty Escape). One entry per granting source, carrying
   * the 1/rest `trackerId` it debits. Consumed by `resolveAtZeroHpInterrupts`,
   * which offers the prompt only when the tracker has an unspent use.
   */
  atZeroHpInterrupts: ReadonlyArray<{ trackerId: string; sourceId: string }>;
  /** Resource declarations contributed by effective grant sources. */
  resources: ReadonlyArray<{ sourceId: string; spec: ResourceSpec }>;
  /** Persistent one-shot HP floors, carrying the active key so the owning effect can
   * be consumed instead of spending a character tracker. */
  zeroHpFloors: ReadonlyArray<{
    sourceId: string;
    activeKey: string;
    hitPoints: number;
  }>;
  /**
   * Number of EXTRA weapon attacks granted with a single Attack action (the
   * "Extra Attack" feature). 0 when no source grants it. MAX across `extra-attack`
   * grants — Extra Attack features never stack (multiclass), and Devouring Blade
   * UPGRADES Thirsting Blade. Total attacks = `1 + max(extraAttacks, classTable
   * extraAttacks)`; the `attacksPerAction` consumer resolves that.
   */
  extraAttacks: number;
  /** Additional turn-economy slots, including any data-declared restrictions. */
  extraActions: ReadonlyArray<{
    sourceId: string;
    slot: "action" | "bonus";
    count: number;
    allowedActions?: ReadonlyArray<ActionEconomyCategory>;
    maxAttacks?: number;
  }>;
  /** True when an active effect prevents actions for the current turn. */
  turnEconomyBlocked: boolean;
  /**
   * `true` when a source lets the character give themself Heroic Inspiration at
   * the start of each combat turn if they lack it (Champion Heroic Warrior,
   * L10). STATE remains the existing `SessionState.inspiration` boolean — this
   * is only a marker for the (UI-owned) renderer to show the affordance. OR.
   */
  heroicInspirationAtTurnStart: boolean;
  /**
   * `true` when a source grants Heroic Inspiration on finishing a Long Rest
   * (Human Resourceful). STATE remains the existing `SessionState.inspiration`
   * boolean — this is the aggregate the Long Rest consumer reads to auto-grant
   * Inspiration. Merge: OR. See `gainsHeroicInspirationOnLongRest`.
   */
  heroicInspirationOnLongRest: boolean;
  /** Attunement-slot cap (default 3; Artificer raises it — max wins). */
  attunementSlots: number;
  /** Extra Exhaustion levels removed on a Long Rest beyond the default 1 (sum). */
  exhaustionRecoveryBonus: number;
  /**
   * Exhaustion levels removed on a SHORT Rest (Ranger Tireless → 1). A genuine
   * extra channel (RAW removes none on a Short Rest), kept separate from the
   * long-rest bonus. Sum; 0 by default. Consumed by `getShortRestExhaustionRecovery`.
   */
  exhaustionRecoveryShortRest: number;
  /**
   * Ability-score FLOORS from active sources (Amulet of Health → CON 19, …).
   * Max value per ability; abilities with no floor are absent. The consumer
   * takes `max(baseScore, floor)` — see `effectiveAbilityScores`.
   */
  abilityScoreFloors: Readonly<Partial<Record<AbilityCode, number>>>;
  /**
   * ADDITIVE ability-score bonuses from MAGIC-ITEM sources ONLY (Belt of
   * Dwarvenkind +2 CON, the +2 Ioun stones, …), summed per ability and CLAMPED
   * to each grant's `cap` (RAW "to a maximum of 20"). This is the LIVE render
   * channel: `effectiveAbilityScores(base, floors, itemAbilityScoreBonus)` adds
   * it AFTER the floor, so every combat/cast/display surface agrees (rule 6).
   *
   * Source-kind filtered to `magic-item` BY CONSTRUCTION: feat/class/race/
   * background additive ASIs are BAKED into the stored `character.abilityScores`
   * at creation/level-up (`applyFeatAsi`) and would double-count if re-added —
   * they can NEVER enter this channel because they never carry a magic-item
   * `gref.kind`. Equip/attune-gated via the L2 equipment grant seam.
   */
  itemAbilityScoreBonus: Readonly<Record<AbilityCode, number>>;
  /**
   * The resulting-SCORE ceiling per ability for {@link itemAbilityScoreBonus}
   * (RAW "to a maximum of 20" — Belt of Dwarvenkind/Ioun stones cap at 20). The
   * TIGHTEST cap among contributing item grants; absent ⇒ that ability is
   * uncapped. `effectiveAbilityScores` clamps `base + bonus` to this AFTER
   * adding the bonus (so a base CON already at/over the cap gains nothing).
   */
  itemAbilityScoreCap: Readonly<Partial<Record<AbilityCode, number>>>;
  /** Bumps to the spell save DC per scope. */
  spellSaveDcBonus: ReadonlyArray<CastingModifierEntry>;
  /** Bumps to the spell attack bonus per scope. */
  spellAttackBonus: ReadonlyArray<CastingModifierEntry>;
  /**
   * Ability-modifier-based bonuses applied to ALL saving throws — each
   * contributes `max(abilityModifier(ability), min)` (the consumer resolves
   * the modifier). Paladin Aura of Protection: `{ ability: "CHA", min: 1 }`.
   */
  saveBonusAbilities: ReadonlyArray<{ ability: AbilityCode; min: number }>;
  /** Flat numeric bonus applied to ALL saving throws (sum of flat grants). */
  saveBonusFlat: number;
  /**
   * Per-ability-SCOPED save bonuses — each rides ONLY the save whose ability
   * equals `appliesToSave` (Circle of the Moon "Increased Toughness" → +WIS mod
   * to CON saves only). Kept OUT of the all-saves lists so it never leaks onto
   * unrelated saves. The consumer (`resolveSaveBonus`) folds in the entries
   * matching the requested save: an `ability` entry contributes
   * `max(abilityModifier(ability), min)`, otherwise its flat `amount`.
   */
  saveBonusByAbility: ReadonlyArray<{
    appliesToSave: AbilityCode;
    ability?: AbilityCode;
    min: number;
    amount: number;
  }>;
  /**
   * Ability-modifier-based bonuses applied ONLY to a Constitution saving throw
   * made to MAINTAIN CONCENTRATION (Bladesinger Bladesong "Focus" → +INT mod).
   * Each contributes `max(abilityModifier(ability), min)`; resolved by the
   * consumer (`resolveConcentrationSaveBonus`). Kept separate from
   * `saveBonusAbilities` so it never rides unrelated CON saves.
   */
  concentrationSaveBonusAbilities: ReadonlyArray<{ ability: AbilityCode; min: number }>;
  /**
   * Flat numeric bonus applied ONLY to the Constitution saving throw made to
   * maintain Concentration (sum of flat `concentration-save-bonus` grants).
   */
  concentrationSaveBonusFlat: number;
  /**
   * Scoped ability-check bonuses. Each entry rides a `appliesTo` scope (a skill
   * id, `"<ABILITY>-checks"`, or `"all-checks"`); `value` is `"modifier"` (add
   * `ability`'s modifier, floored at `min`) or a flat number. The Skills
   * consumer (`skillBonus` + `resolveAbilityCheckBonus`) resolves and sums the
   * matching entries per skill. Fey Wanderer's Otherworldly Glamour:
   * `{ appliesTo: "CHA-checks", ability: "WIS", value: "modifier", min: 1 }`.
   */
  abilityCheckBonuses: ReadonlyArray<{
    appliesTo: string;
    ability?: AbilityCode;
    value: "modifier" | number;
    min: number;
  }>;
  /** Optional alternate abilities for named skill checks. */
  skillAbilityOptions: ReadonlyArray<{
    skills: ReadonlyArray<string>;
    ability: AbilityCode;
  }>;
  /** Ability modifiers added to Initiative (consumer resolves each). */
  initiativeBonusAbilities: ReadonlyArray<AbilityCode>;
  /** Flat numeric bonus added to Initiative. */
  initiativeBonusFlat: number;
  /**
   * Self-contained extra-damage riders on weapon attacks (Radiant Strikes, …).
   * `dice` is the fixed / L1 value; `diceByLevel`, when present, is the
   * level-keyed scaling map (Berserker Frenzy) the consumer resolves at the
   * character's level.
   */
  damageRiders: ReadonlyArray<{
    dice?: string;
    diceByLevel?: Readonly<Record<number, string>>;
    /** Flat PB extra-damage sentinel (a species revelation form) — the consumer
     *  resolves it to a `+N` flat amount; mutually exclusive with `dice`. */
    amount?: "PB" | { kind: "class-level"; classId: ClassId };
    round1?: true;
    /** Gate: the rider is offered only while this tracker has an unspent use. */
    requiresRiderTrackerId?: string;
    /** Marks a per-hit "vs a specific marked/cursed creature" rider (Hunter's
     *  Mark / Hex) — the consumer surfaces it as a DISPLAY-ONLY chip labeled "vs
     *  marked / cursed target" (never auto-summed); the token drives the localized
     *  label at the render edge. Absent → an always-applies rider. */
    vsMarkedTarget?: MarkedTargetScope;
    /** Concrete fallback (the fixed type or the first declared choice). */
    damageType: DamageType | "same-as-weapon";
    /** Every type the player may choose for this rider when resolving the hit. */
    damageTypeChoices?: ReadonlyArray<DamageType>;
    appliesTo:
      | "melee-weapon"
      | "weapon"
      | "weapon-or-unarmed"
      | "unarmed"
      | "finesse-or-ranged-weapon"
      | "one-handed-melee"
      | "attack-or-spell";
    oncePerTurn: boolean;
    addAbilityMod?: AbilityCode;
    /** Each use spends one unit of this tracker (Psionic Energy Dice). */
    resourceCost?: { trackerId: string };
    /**
     * Source-feature id (provenance) — the consumer resolves a `diceByLevel`
     * scaling threshold against THIS feature's OWNING class at the character's
     * level IN that class (Ranger Colossus Slayer → Ranger level 11), never the
     * total character level (multiclass-correct). Absent for non-class sources
     * (the consumer then falls back to total level).
     */
    sourceId?: string;
    /**
     * Carries the wrapping `while-active` toggle (when any — Barbarian Rage's
     * Brutal Strike, Divine Favor) so the rider chip can mark itself as a
     * conditional, currently-active source ("· active"), exactly as
     * `weaponDamageBonuses.whileActiveKey` does. Absent = an unconditional rider.
     */
    whileActiveKey?: string;
  }>;
  /**
   * Flat bonuses added to the DAMAGE roll of scope-matching weapon attacks
   * (`weapon-damage-bonus` — Barbarian Rage Damage). The consumer
   * (`resolveWeaponDamageBonuses` in smart-tracker) resolves a `sourceKey`
   * against the source feature's OWNING class table at the character's level in
   * that class, and folds the sum into the weapon's damage modifier.
   * `whileActiveKey` carries the wrapping `while-active` toggle (when any) so
   * the damage breakdown can mark the bonus as a conditional, currently-active
   * source ("+2 Rage · active").
   */
  weaponDamageBonuses: ReadonlyArray<{
    amount?: number | "PB";
    sourceKey?: string;
    scope: "any" | "ranged" | "melee" | "strength" | "heavy";
    sourceId: string;
    whileActiveKey?: string;
  }>;
  /**
   * Static bonuses addable to one damage roll of a qualifying spell (Draconic
   * Sorcery Elemental Affinity → +CHA mod on a spell that deals the chosen
   * draconic damage type). Each entry rides a `damageTypes` trigger set (empty =
   * any damaging spell) and a casting-class `scope`. The consumer
   * (`resolveSpellDamageBonus`) resolves the modifier per spell at render.
   */
  spellDamageBonuses: ReadonlyArray<SpellDamageBonusEntry>;
  /** Deterministic miss/save damage consequences applied by the combat resolver. */
  spellDamageOutcomes: ReadonlyArray<SpellDamageOutcomeEntry>;
  /**
   * Bonuses added to the Hit Points a HEALING SPELL restores (Cleric Disciple of
   * Life: +2 + spell level). The consumer (`resolveHealBonus`) resolves the
   * amount per cast at render and appends it to the heal verdict.
   */
  healBonuses: ReadonlyArray<HealBonusEntry>;
  selfHealOnOther: ReadonlyArray<SelfHealOnOtherEntry>;
  maximizeSpellHealing: ReadonlyArray<MaximizeSpellHealingEntry>;
  /**
   * Alternate damage types a damaging spell may deal at the player's choice
   * (Great Old One Psychic Spells → Psychic). The consumer
   * (`resolveSpellDamageTypeOverrides`) returns every in-scope alternate type;
   * the smart-tracker folds them into the spell's damage-type choice chip.
   */
  spellDamageTypeOverrides: ReadonlyArray<SpellDamageTypeOverrideEntry>;
  /**
   * Alternate damage types the character's Unarmed Strike may deal at the player's
   * choice (Monk Empowered Strikes → Force). The smart-tracker folds these into
   * the Unarmed Strike row's damage-type choice chip.
   */
  unarmedStrikeDamageTypeOptions: ReadonlyArray<DamageType>;
  /**
   * Component waivers (Great Old One Psychic Spells: cast Enchantment/Illusion
   * Warlock spells without V/S). The consumer (`resolveComponentWaiver`) returns
   * the components a given spell may drop; the smart-tracker marks them.
   */
  componentWaivers: ReadonlyArray<ComponentWaiverEntry>;
  /**
   * Static bonuses targeted at ONE specific cantrip by SRD id (Warlock's
   * Agonizing Blast → +CHA mod to the chosen damaging cantrip's damage rolls).
   * Repeatable — one entry per chosen cantrip. The consumer
   * (`resolveCantripDamageBonus`) resolves the modifier per cantrip at render,
   * matching on `spellId`. Distinct from `spellDamageBonuses`, which is
   * damage-type keyed (any qualifying spell) rather than a single named cantrip.
   */
  cantripDamageBonuses: ReadonlyArray<CantripDamageBonusEntry>;
  /**
   * Non-damage on-hit effect riders targeted at ONE specific cantrip by SRD id
   * (Warlock's Repelling Blast → push a Large-or-smaller creature up to 10 ft
   * on a hit with the chosen attack-roll cantrip). Repeatable — one entry per
   * chosen cantrip. The consumer (`resolveCantripForcedMovement`) returns the
   * matching forced-movement rider per cantrip at render, keyed on `spellId`.
   * Sibling of `cantripDamageBonuses`, for effects that aren't numeric damage.
   */
  cantripEffectRiders: ReadonlyArray<CantripEffectRiderEntry>;
  /**
   * Per-level range bonuses targeted at ONE specific cantrip by SRD id (Warlock's
   * Eldritch Spear → +30 ft × Warlock level to the chosen damaging cantrip's
   * range). Repeatable — one entry per chosen cantrip. The consumer
   * (`resolveCantripRangeBonus`) multiplies `bonusPerLevel` by the supplied class
   * level and sums per cantrip at render, matching on `spellId`. Sibling of
   * `cantripEffectRiders`, for the range clause rather than forced movement.
   */
  cantripRangeBonuses: ReadonlyArray<CantripRangeBonusEntry>;
  /**
   * Feature-GRANTED weapon-attack cantrips (`weapon-attack-cantrip`) — known
   * cantrips (True Strike) whose effect is a spellcasting-ability weapon attack
   * with a Radiant/weapon damage-type choice + level-scaled extra Radiant.
   * Deduped by `spellId` (first source wins). The smart-tracker action-summary
   * consumer reads these (and the `weaponAttackCantrip` field on the SRD spell
   * data of cantrips the character knows normally) so the combat card surfaces
   * the spellcasting-ability attack bonus, the damage-type options, and the
   * scaled extra damage instead of a stale melee spell attack.
   */
  weaponAttackCantrips: ReadonlyArray<WeaponAttackCantripEntry>;

  // Proficiencies / expertise / languages / tools
  saveProficiencies: ReadonlySet<AbilityCode>;
  skillProficiencies: ReadonlySet<string>;
  expertiseSkills: ReadonlySet<string>;
  /**
   * Jack-of-all-Trades — true when some source grants half-proficiency in every
   * otherwise-unproficient skill (Bard L2). The skill consumer fills the half
   * at render; it is NEVER baked into stored `skills` (#57). Merge: OR.
   */
  halfProficiencyAllSkills: boolean;
  languages: ReadonlySet<string>;
  toolProficiencies: ReadonlySet<string>;
  /** Feature-granted weapon proficiencies as {@link ProficiencyToken} ids
   *  (category `martial-weapons`, group `longswords`, or `pact-weapon`). */
  weaponProficiencies: ReadonlySet<ProficiencyToken>;
  /** Feature-granted armor/shield proficiencies as {@link ProficiencyToken} ids. */
  armorProficiencies: ReadonlySet<ProficiencyToken>;
  /**
   * Abilities usable for weapon attack/damage rolls in place of STR/DEX
   * (Bladesong → INT; Battle Smith → INT for magic weapons). The attack-row
   * resolver uses the best applicable ability.
   */
  weaponAttackAbilities: ReadonlyArray<{
    ability: AbilityCode;
    magicOnly: boolean;
    weaponScope?: "monk-melee";
    /** Monk Martial Arts die upgrade for the scoped weapons (replaces the printed
     *  die when larger) — a fixed/deferred die resolved against `sourceId`'s
     *  owning class+level. */
    dieUpgrade?: string;
    /** The GRANTING feature's id — ALWAYS present (the grant-apply seam takes it
     *  as a required argument). Resolves a deferred `classSpecific:<key>` die
     *  against its owning class+level, AND names the rule when this entry's
     *  ability swap wins the attack roll (the breakdown why layer). */
    sourceId: string;
  }>;
  /**
   * Flat to-hit bonuses on weapon attack rolls, scoped ranged / melee / any
   * (Archery fighting style → `{ amount: 2, scope: "ranged" }`). The attack-row
   * consumer sums the `amount`s of the entries whose `scope` applies to the
   * weapon being resolved and adds the total to the computed attack bonus.
   * Override-first (skipped when a per-weapon `attackBonusOverride` is pinned).
   */
  weaponAttackBonuses: ReadonlyArray<WeaponAttackBonusEntry>;
  /**
   * Manipulations of a weapon's OWN damage dice (Great Weapon Fighting floor,
   * Savage Attacker reroll-keep-higher, Two-Weapon Fighting off-hand modifier,
   * Unarmed Fighting Unarmed Strike). Each entry rides a scoped `appliesTo`; the
   * attack-row consumer reads it and applies the relevant `mode` to the matching
   * weapon rows (an annotation, an off-hand damage-formula change, or an emitted
   * Unarmed Strike row). The engine never rolls dice. Override-first.
   */
  damageDieModifiers: ReadonlyArray<DamageDieModifierEntry>;

  // Spell grants
  /** Always-prepared spell IDs (Domain spells, Magic Initiate, …). */
  alwaysPrepared: ReadonlyArray<string>;
  /** Per-spell ritual access (not the class-wide "any ritual" — see below). */
  ritualSpells: ReadonlySet<string>;
  /** Class lists from which any prepared/known ritual spell is castable. */
  ritualAnyClasses: ReadonlySet<ClassId>;
  /** Resource-backed slotless casts of specific spells. */
  freeCasts: ReadonlyArray<FreeCastEntry>;
  /**
   * D4 — slotless casts FROM A LIST (a guided picker over a class spell list
   * ≤ a level cap): Cleric Divine Intervention. The spell is the player's choice
   * at cast time, gated by `spellList` ≤ `maxSpellLevel`; the cast debits the
   * exact canonical cost declared by the capability.
   */
  freeCastFromList: ReadonlyArray<FreeCastFromListEntry>;
  /**
   * At-will (unbounded, slotless) self-casts of specific spells (Warlock's
   * at-will Eldritch Invocations). Deduped by `spellId` (first source wins).
   * The cast-options consumer surfaces each as an at-will row at the spell's
   * base level — no tracker, no per-rest cap.
   */
  atWillCasts: ReadonlyArray<AtWillCastEntry>;
  /**
   * Bonus, upcast-capable spell slots restricted to a scoped spell pool and
   * prepared spell set. Each entry carries its level formula, scope, and
   * canonical resource selector. Collected as a list (one per source).
   */
  scopedExtraSlots: ReadonlyArray<ScopedExtraSlotEntry>;

  // Conditional advantage/disadvantage chips
  advantages: ReadonlyArray<AdvantageClause>;
  disadvantages: ReadonlyArray<AdvantageClause>;
  /** Roll floors (Rogue Reliable Talent): treat a d20 below `floor` as `floor`. */
  rollFloors: ReadonlyArray<RollFloorClause>;
  /** Physical add/subtract dice attached to a roll (Mind Sliver: next save −1d4). */
  rollDieAdjustments: ReadonlyArray<RollDieAdjustmentClause>;
  /**
   * SELF-side downsides (Barbarian Reckless Attack): while in effect, attack
   * rolls AGAINST the character have Advantage. Rendered as a defensive Disadv.
   * note — a reminder, not enemy modeling.
   */
  incomingAttackAdvantages: ReadonlyArray<IncomingAttackClause>;
  /**
   * SELF-side BENEFITS (Blur): while in effect, attack rolls AGAINST the
   * character have Disadvantage. Rendered as a defensive Advantage note — a
   * reminder, not enemy modeling. The mirror of `incomingAttackAdvantages`.
   */
  incomingAttackDisadvantages: ReadonlyArray<IncomingAttackClause>;
  /**
   * SELF-side defensive reminder LINES (Mirror Image's duplicates). Bilingual
   * prose surfaced in the rail's Defenses section — a reminder, never damage math
   * (golden rule 21). Mechanically representable defenses use typed grants instead.
   */
  defenseNotes: ReadonlyArray<IncomingAttackClause>;

  // ── PRIM batch (2026-06-10) ──────────────────────────────────────────────
  /**
   * PRIM-aura/emanation — persistent radius effects (Wrath of the Sea, Starry
   * Form constellations, Smite of Protection, Rod of Alertness). Informational:
   * the presenter (`auraVMs`) renders a readable rider per entry.
   */
  auras: ReadonlyArray<AuraClause>;
  /**
   * PRIM-spell-die-augment — per-spell damage-die upgrades (Foe Slayer:
   * Hunter's Mark d6→d10). The consumer (`resolveSpellDieAugment`) re-sizes the
   * matching spell's `damageDice`.
   */
  spellDieAugments: ReadonlyArray<SpellDieAugmentEntry>;
  /**
   * PRIM-copy-to-2nd-target — riders that duplicate an effect onto a second
   * creature (some heritage feats, Bewitching Magic). Informational notes.
   */
  copyToTargets: ReadonlyArray<CopyToTargetClause>;
  /**
   * PRIM-resource-conversion — converters that PRODUCE a resource from another
   * (Font of Magic Creating/Converting Spell Slots, Nature Magician, Magical
   * Cunning). One entry per grant; the consumer (`conversionOptionVMs` +
   * `planResourceConversion`) resolves the legal choices and plans the ops.
   */
  resourceConversions: ReadonlyArray<ResourceConversionEntry>;
  /** PRIM-item-bound-bonus has NO aggregate field of its own — its `ac` /
   * `saves` / `spell-attack-and-save-dc` bonuses fold into the existing
   * `acBonus` / `saveBonusFlat` / `spellSaveDcBonus`+`spellAttackBonus`
   * accumulators (single source of truth), and its `weapon-attack-and-damage`
   * bonus is read at the weapon layer (`resolveItemBoundWeaponBonus`).
   */
  /**
   * L11 — every `while-active` toggle seen, with its current active state.
   * The UI renders a toggle per group; when `active`, that group's inner
   * grants have already been merged into the fields above.
   */
  activatableGroups: ReadonlyArray<ActivatableGroup>;

  /**
   * L12 — single-select variant choosers (`choice-grant-bundle`). The UI
   * renders a selector per entry; the selected option's grants have already
   * been merged into the fields above.
   */
  grantBundles: ReadonlyArray<GrantBundle>;

  /**
   * **Choice-resistance** slots (`choice-resistance`). The UI renders a
   * multi-select per entry; the current `selected` picks have already been
   * merged into `damageResistances` above (so the defenses consumer needs no
   * extra wiring). Re-selectable — Boon of Energy Resistance re-chooses each
   * Long Rest.
   */
  choiceResistances: ReadonlyArray<ChoiceResistance>;

  /**
   * ARCHITECTURE.md combat model — feat/feature/invocation-granted actions for the
   * Combat page (Shield reaction, at-will invocations, …).
   */
  grantedActions: ReadonlyArray<GrantedAction>;

  /**
   * Weapons a feature manifests (Soulknife Psychic Blades). Each becomes one
   * (or two — main + bonus-action second blade) attack rows on the Combat page
   * via `resolveManifestedWeaponAttacks`; their to-hit/damage is computed from
   * the character's scores like a carried weapon. Distinct from a carried
   * `SrdWeaponRef`/`CustomWeapon` (not in `character.weapons`) and from a
   * generic `grantedAction` (these have a full weapon stat profile).
   */
  manifestedWeapons: ReadonlyArray<ManifestedWeapon>;

  /**
   * Form-swap natural-weapon attack rows from the character's ACTIVE
   * transformation forms (Druid Wild Shape beast bite, Stars Druid Starry Form
   * attack, Artificer Armorer Thunder Pulse / Lightning Launcher). ONLY the
   * rows from currently-lit forms are present (the evaluator collects them
   * inside the active `while-active` branch), so this array empties the moment
   * every form is toggled off. Each becomes one attack row via
   * `resolveFormAttacks`; its to-hit/damage is computed from the character's
   * scores like a carried weapon. Override-first via
   * `session.manifestedWeaponOverrides` (the shared session weapon-swap store).
   */
  formAttacks: ReadonlyArray<FormAttack>;

  /**
   * Conjured pact weapons (Warlock Pact of the Blade). Each becomes one
   * configurable conjured-weapon attack row via `resolvePactWeaponAttacks` —
   * attack + damage use the declared `attackAbility` (CHA), and the player
   * picks the weapon form / damage type override-first from `pactWeaponConfig`.
   * Distinct from a `manifestedWeapon` (fixed profile) and a carried weapon.
   */
  pactWeapons: ReadonlyArray<PactWeapon>;

  /**
   * On-hit pact-weapon riders (Eldritch Smite, Lifedrinker) — extra-damage
   * riders that fire only with the conjured pact weapon. Deduped by `id`
   * (first source wins). The consumer (`resolvePactWeaponAttacks`) resolves
   * slot-level scaling and attaches each to the pact-weapon attack row.
   */
  pactWeaponRiders: ReadonlyArray<PactWeaponRider>;

  /**
   * Familiar-enhancement bundles (`familiar-enhancement`) — buffs a feature
   * layers on a summoned familiar (Warlock Investment of the Chain Master).
   * Deduped by source id (first source wins). The consumer
   * (`resolveFamiliarEnhancements`) merges the deltas across sources and stamps
   * the owner's spell save DC; distinct from `companion`-backed stat blocks
   * (Steel Defender / Beast Master), whose form is feature-declared.
   */
  familiarEnhancements: ReadonlyArray<FamiliarEnhancement>;

  /**
   * Find Familiar SPECIAL-form ids (`familiar-forms`) — the forms a feature adds
   * to the base CR-0-Beast pool (Warlock Pact of the Chain). Set-union across
   * sources. The consumer (`resolveFamiliarForms`, `lib/familiar.ts`) joins these
   * ids to the corpus LAZILY; the eager aggregate carries ids only.
   */
  familiarFormIds: ReadonlySet<string>;

  /**
   * Temporary-HP grants (Dark One's Blessing, Adrenaline Rush, Defensive
   * Field, …). Each carries the unresolved `formula` + originating source; the
   * consumer resolves it and surfaces a manual "Gain N temporary HP" entry.
   * Override-first — the engine never auto-applies temp HP.
   */
  tempHpGrants: ReadonlyArray<TempHpEntry>;

  /**
   * Rogue Cunning Strike catalogue — every option an effective character knows
   * (base L5, Devious Strikes L14, plus subclass adders). Deduped by `optionId`
   * (first source wins). The consumer (`resolveCunningStrikeOptions`) resolves
   * the save DC against the character.
   */
  cunningStrikeOptions: ReadonlyArray<CunningStrikeOption>;

  /**
   * Cross-feature alternate-recovery grants (`tracker-alt-recovery`). Each
   * entry overlays an alternate "spend N from a pool to restore a use" cost
   * onto another feature's tracker (Sorcery Incarnate → Innate Sorcery). The
   * smart-tracker consumer (`resolveTrackers`) applies the last matching entry
   * per `targetTracker` onto the resolved `ResolvedTracker.altRecoveryCost`.
   */
  trackerAltRecoveries: ReadonlyArray<TrackerAltRecoveryEntry>;

  /**
   * Pending player choices. The level-up wizard reads this list to know
   * which pickers to surface (ability ASI sub-picker, skill picker, etc.).
   */
  pendingChoices: ReadonlyArray<PendingChoice>;
}

/**
 * An aggregated `weapon-attack-cantrip` grant — a feature-granted known cantrip
 * (True Strike) that resolves to a spellcasting-ability weapon attack with a
 * Radiant/weapon damage-type choice + level-scaled extra Radiant. The consumer
 * (`resolveWeaponAttackCantrip`) reads the same shape whether it comes from this
 * aggregate or from the SRD spell's `weaponAttackCantrip` field.
 */
export interface WeaponAttackCantripEntry {
  sourceId: string;
  spellId: string;
  useSpellcastingAbility: boolean;
  damageTypeChoice: DamageType;
  extraDamageByLevel: Readonly<Record<number, string>>;
  extraDamageType: DamageType;
}

/** Identity / empty aggregate — useful for the no-grants base case. */
export function emptyAggregate(): AggregatedGrants {
  return {
    darkvisionFt: 0,
    blindsightFt: 0,
    tremorsenseFt: 0,
    truesightFt: 0,
    seeInvisibleFt: 0,
    airAndWaterBreathing: false,
    damageResistances: new Set(),
    allDamageResistance: false,
    damageImmunities: new Set(),
    damageVulnerabilities: new Set(),
    conditionImmunities: new Set(),
    sourceConditionImmunities: [],
    spellcastingBlocked: false,
    concentrationBlocked: false,
    healingBlocked: false,
    damageSourceResistances: new Set(),
    flatDamageReductions: [],
    saveDamageRules: [],
    speedBonusFt: 0,
    conditionalSpeedBonusFt: {},
    round1SpeedBonusFt: 0,
    round1DamageDoubles: [],
    flySpeed: null,
    swimSpeed: null,
    climbSpeed: null,
    speedMultiplier: 1,
    speedFloorFt: 0,
    speedCapFt: null,
    acBonus: 0,
    acBonusAbilities: [],
    acFormulas: [],
    mediumArmorDexCap: null,
    hpPerLevel: 0,
    hpFlat: 0,
    hpFlatParts: [],
    critThreshold: 20,
    deathSaveCritThreshold: 20,
    startOfTurnRegen: [],
    onCritMovement: [],
    replaceAttackWithCast: [],
    unarmedStrikeDice: [],
    weaponReachBonuses: [],
    spellSlotTrackerRecoveries: [],
    initiativeTrackerTopUps: [],
    atZeroHpInterrupts: [],
    resources: [],
    zeroHpFloors: [],
    extraAttacks: 0,
    extraActions: [],
    turnEconomyBlocked: false,
    heroicInspirationAtTurnStart: false,
    heroicInspirationOnLongRest: false,
    attunementSlots: 3,
    exhaustionRecoveryBonus: 0,
    exhaustionRecoveryShortRest: 0,
    abilityScoreFloors: {},
    itemAbilityScoreBonus: { STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 },
    itemAbilityScoreCap: {},
    spellSaveDcBonus: [],
    spellAttackBonus: [],
    saveBonusAbilities: [],
    saveBonusFlat: 0,
    saveBonusByAbility: [],
    concentrationSaveBonusAbilities: [],
    concentrationSaveBonusFlat: 0,
    abilityCheckBonuses: [],
    skillAbilityOptions: [],
    initiativeBonusAbilities: [],
    initiativeBonusFlat: 0,
    damageRiders: [],
    weaponDamageBonuses: [],
    spellDamageBonuses: [],
    spellDamageOutcomes: [],
    healBonuses: [],
    selfHealOnOther: [],
    maximizeSpellHealing: [],
    spellDamageTypeOverrides: [],
    unarmedStrikeDamageTypeOptions: [],
    componentWaivers: [],
    cantripDamageBonuses: [],
    cantripEffectRiders: [],
    cantripRangeBonuses: [],
    weaponAttackCantrips: [],
    saveProficiencies: new Set(),
    skillProficiencies: new Set(),
    expertiseSkills: new Set(),
    halfProficiencyAllSkills: false,
    languages: new Set(),
    toolProficiencies: new Set(),
    weaponProficiencies: new Set(),
    armorProficiencies: new Set(),
    weaponAttackAbilities: [],
    weaponAttackBonuses: [],
    damageDieModifiers: [],
    alwaysPrepared: [],
    ritualSpells: new Set(),
    ritualAnyClasses: new Set(),
    freeCasts: [],
    freeCastFromList: [],
    atWillCasts: [],
    scopedExtraSlots: [],
    advantages: [],
    disadvantages: [],
    rollFloors: [],
    rollDieAdjustments: [],
    incomingAttackAdvantages: [],
    incomingAttackDisadvantages: [],
    defenseNotes: [],
    auras: [],
    spellDieAugments: [],
    copyToTargets: [],
    resourceConversions: [],
    activatableGroups: [],
    grantBundles: [],
    choiceResistances: [],
    grantedActions: [],
    manifestedWeapons: [],
    formAttacks: [],
    pactWeapons: [],
    pactWeaponRiders: [],
    familiarEnhancements: [],
    familiarFormIds: new Set(),
    tempHpGrants: [],
    cunningStrikeOptions: [],
    trackerAltRecoveries: [],
    pendingChoices: [],
  };
}

/**
 * Merge two non-walking speed values, taking the larger. The walking-relative
 * sentinels rank above any plausible numeric value because they resolve to a
 * multiple of the walking speed at render time (which is always ≥ 25 ft RAW):
 * `"twice-walking"` (2×) > `"equal-to-walking"` (1×) > numeric feet.
 *
 * Pure — no character context. The render-time resolver in `derive-sheet-views`
 * actually substitutes the walking speed.
 */
function maxNonWalking(
  current: NonWalkingSpeed | null,
  incoming: NonWalkingSpeed
): NonWalkingSpeed {
  if (current === null) return incoming;
  // `"twice-walking"` dominates everything (largest render value).
  if (current === "twice-walking" || incoming === "twice-walking") {
    return "twice-walking";
  }
  if (current === "equal-to-walking" || incoming === "equal-to-walking") {
    return "equal-to-walking";
  }
  return current >= incoming ? current : incoming;
}

/**
 * Exhaustiveness guard for the {@link Grant} discriminated union — the single
 * data↔logic seam. Mirrors `cost-engine.ts`'s `assertNever`: because every
 * `Grant` member is handled by the `applyGrant` switch, the compiler narrows
 * the `default` arm's argument to `never`. Adding a 55th `Grant` kind without a
 * matching `case` then becomes a COMPILE error here instead of a silent
 * runtime drop (no aggregate field written). Grants only ever originate from
 * static SRD data, so the throw is unreachable in normal operation.
 */
function assertNever(x: never): never {
  throw new Error(`Unhandled grant kind: ${JSON.stringify(x)}`);
}

/**
 * Count the INDEPENDENTLY-trackable free-cast spells a source grants at its TOP
 * level: each fixed `free-cast-spell` plus each chosen `choice-spell` that carries
 * a `freeCastSource`. When ≥ 2, every such spell needs its OWN per-spell tracker
 * (RAW "cast EACH of these spells once per rest") so they don't collapse onto one
 * deadlocking counter; ≤ 1 keeps the bare source-id counter (already correct).
 * The single source of truth shared by the grant evaluator, the chosen-spell
 * stamp (`feat-spell-choices`), and the derived rail rows (`smart-tracker`).
 */
export function countTopLevelFreeCasts(grants: ReadonlyArray<Grant> | undefined): number {
  let n = 0;
  for (const g of grants ?? []) {
    if (g.type === "free-cast-spell") n += 1;
    else if (g.type === "choice-spell" && g.freeCastSource) n += 1;
  }
  return n;
}

/**
 * The tracker key a free-cast spell debits: PER-SPELL `${sourceId}:${spellId}`
 * when `multi` (the source grants ≥ 2 free-casts → independent counters), else the
 * bare `sourceId`. Used by every reader/writer of a free-cast tracker so the key
 * can never drift across the cast gate, the spend, the rail row, and recovery.
 */
export function freeCastTrackerKey(
  sourceId: string,
  spellId: string,
  multi: boolean
): string {
  return multi ? `${sourceId}:${spellId}` : sourceId;
}

// ─── Evaluator ──────────────────────────────────────────────────────────────

/**
 * Walk every supplied source row and aggregate its grants into a single
 * `AggregatedGrants`. Sources can come from any of: race traits, feats,
 * class features, equipped magic items, invocations, metamagic, backgrounds.
 *
 * Mutating helper inside; returns a frozen-ish (read-only-typed) result.
 *
 * `activeKeys` (L11) is the session's current active-feature set. A
 * `while-active` grant's inner grants merge into the aggregate only when its
 * `activeKey` is in this set; defaulting to empty means "nothing toggled on",
 * so conditional buffs never over-report when the caller has no session.
 *
 * `bundleChoices` (L12) maps a `choice-grant-bundle`'s `bundleKey` to the
 * selected option id; the selected option's grants merge in. Unselected
 * bundles contribute nothing.
 */
export function evaluateGrants(
  sources: ReadonlyArray<GrantSource>,
  activeKeys: ReadonlySet<string> = new Set(),
  bundleChoices: ReadonlyMap<string, string> = new Map(),
  context: { conditions?: ReadonlySet<string>; level?: number } = {}
): AggregatedGrants {
  // Senses
  let darkvisionFt = 0;
  // D6 — additive darkvision (Gloom Stalker Umbral Sight): summed separately, then
  // folded onto the max base range at finalize so a species' darkvision + Umbral
  // Sight stacks (60 + 60 = 120) instead of merging to 60.
  let darkvisionBonusFt = 0;
  let blindsightFt = 0;
  let tremorsenseFt = 0;
  let truesightFt = 0;
  let seeInvisibleFt = 0;
  let airAndWaterBreathing = false;

  // Defensive
  const damageResistances = new Set<DamageType>();
  let allDamageResistance = false;
  const damageImmunities = new Set<DamageType>();
  const damageVulnerabilities = new Set<DamageType>();
  const conditionImmunities = new Set<ConditionId>();
  const sourceConditionImmunities = new Map<string, SourceConditionImmunity>();
  let spellcastingBlocked = false;
  let concentrationBlocked = false;
  let healingBlocked = false;
  const damageSourceResistances = new Set<DamageSource>();
  const flatDamageReductions: AggregatedGrants["flatDamageReductions"][number][] = [];
  const saveDamageRules: AggregatedGrants["saveDamageRules"][number][] = [];

  // Movement
  let speedBonusFt = 0;
  const conditionalSpeedBonusFt: Partial<Record<"no-heavy-armor", number>> = {};
  let round1SpeedBonusFt = 0;
  const round1DamageDoubles: AggregatedGrants["round1DamageDoubles"][number][] = [];
  let flySpeed: NonWalkingSpeed | null = null;
  let swimSpeed: NonWalkingSpeed | null = null;
  let climbSpeed: NonWalkingSpeed | null = null;
  let speedMultiplier = 1;
  let speedFloorFt = 0;
  let speedCapFt: number | null = null;

  // Derived stats
  let acBonus = 0;
  const acBonusAbilities: { ability: AbilityCode; min: number }[] = [];
  const acFormulas: AcFormula[] = [];
  let mediumArmorDexCap: { cap: number; minDex: number } | null = null;
  let hpPerLevel = 0;
  let hpFlat = 0;
  const hpFlatParts: AggregatedGrants["hpFlatParts"][number][] = [];
  let critThreshold = 20;
  let deathSaveCritThreshold = 20;
  const startOfTurnRegen: AggregatedGrants["startOfTurnRegen"][number][] = [];
  const onCritMovement: AggregatedGrants["onCritMovement"][number][] = [];
  const replaceAttackWithCast: AggregatedGrants["replaceAttackWithCast"][number][] = [];
  const unarmedStrikeDice: AggregatedGrants["unarmedStrikeDice"][number][] = [];
  const weaponReachBonuses: AggregatedGrants["weaponReachBonuses"][number][] = [];
  const spellSlotTrackerRecoveries: AggregatedGrants["spellSlotTrackerRecoveries"][number][] =
    [];
  const initiativeTrackerTopUps: AggregatedGrants["initiativeTrackerTopUps"][number][] =
    [];
  const atZeroHpInterrupts: AggregatedGrants["atZeroHpInterrupts"][number][] = [];
  const resources: AggregatedGrants["resources"][number][] = [];
  const zeroHpFloors: AggregatedGrants["zeroHpFloors"][number][] = [];
  let extraAttacks = 0;
  const extraActions: AggregatedGrants["extraActions"][number][] = [];
  let turnEconomyBlocked = false;
  let heroicInspirationAtTurnStart = false;
  let heroicInspirationOnLongRest = false;
  let attunementSlots = 3;
  let exhaustionRecoveryBonus = 0;
  let exhaustionRecoveryShortRest = 0;
  const abilityScoreFloors: Partial<Record<AbilityCode, number>> = {};
  const itemAbilityScoreBonus: Record<AbilityCode, number> = {
    STR: 0,
    DEX: 0,
    CON: 0,
    INT: 0,
    WIS: 0,
    CHA: 0,
  };
  // Tightest resulting-SCORE ceiling per ability among contributing item
  // `ability-score` grants (RAW "to a maximum of 20"). Applied against the
  // actual base by `effectiveAbilityScores`; absent ⇒ no cap.
  const itemAbilityScoreCap: Partial<Record<AbilityCode, number>> = {};
  const spellSaveDcBonus: CastingModifierEntry[] = [];
  const spellAttackBonus: CastingModifierEntry[] = [];
  const saveBonusAbilities: { ability: AbilityCode; min: number }[] = [];
  let saveBonusFlat = 0;
  const saveBonusByAbility: {
    appliesToSave: AbilityCode;
    ability?: AbilityCode;
    min: number;
    amount: number;
  }[] = [];
  const concentrationSaveBonusAbilities: { ability: AbilityCode; min: number }[] = [];
  let concentrationSaveBonusFlat = 0;
  const abilityCheckBonuses: {
    appliesTo: string;
    ability?: AbilityCode;
    value: "modifier" | number;
    min: number;
  }[] = [];
  const skillAbilityOptions: AggregatedGrants["skillAbilityOptions"][number][] = [];
  const initiativeBonusAbilities: AbilityCode[] = [];
  let initiativeBonusFlat = 0;
  const damageRiders: AggregatedGrants["damageRiders"][number][] = [];
  const weaponDamageBonuses: AggregatedGrants["weaponDamageBonuses"][number][] = [];
  const spellDamageBonuses: SpellDamageBonusEntry[] = [];
  const spellDamageOutcomes: SpellDamageOutcomeEntry[] = [];
  const healBonuses: HealBonusEntry[] = [];
  const selfHealOnOther: SelfHealOnOtherEntry[] = [];
  const maximizeSpellHealing: MaximizeSpellHealingEntry[] = [];
  const spellDamageTypeOverrides: SpellDamageTypeOverrideEntry[] = [];
  const unarmedStrikeDamageTypeOptions: DamageType[] = [];
  const componentWaivers: ComponentWaiverEntry[] = [];
  const cantripDamageBonuses: CantripDamageBonusEntry[] = [];
  const cantripEffectRiders: CantripEffectRiderEntry[] = [];
  const cantripRangeBonuses: CantripRangeBonusEntry[] = [];
  const weaponAttackCantrips: WeaponAttackCantripEntry[] = [];

  // Proficiencies
  const saveProficiencies = new Set<AbilityCode>();
  const skillProficiencies = new Set<string>();
  const expertiseSkills = new Set<string>();
  let halfProficiencyAllSkills = false;
  const languages = new Set<string>();
  const toolProficiencies = new Set<string>();
  const weaponProficiencies = new Set<ProficiencyToken>();
  const armorProficiencies = new Set<ProficiencyToken>();
  const weaponAttackAbilities: {
    ability: AbilityCode;
    magicOnly: boolean;
    weaponScope?: "monk-melee";
    dieUpgrade?: string;
    sourceId: string;
  }[] = [];
  const weaponAttackBonuses: WeaponAttackBonusEntry[] = [];
  const damageDieModifiers: DamageDieModifierEntry[] = [];

  // Spell grants
  const alwaysPrepared: string[] = [];
  const ritualSpells = new Set<string>();
  const ritualAnyClasses = new Set<ClassId>();
  const freeCasts: FreeCastEntry[] = [];
  const freeCastFromList: FreeCastFromListEntry[] = [];
  const atWillCasts: AtWillCastEntry[] = [];
  const scopedExtraSlots: ScopedExtraSlotEntry[] = [];

  // Sources that grant MORE THAN ONE free-cast spell (a fixed `free-cast-spell`
  // + a chosen `choice-spell.freeCastSource`, or several Spells of the Mark).
  // Only these need PER-SPELL tracker keys so each spell is independently 1/rest
  // (RAW "cast EACH once"); a single-free-cast source keeps the bare source-id
  // counter that already worked. Magic items never split (shared charge pool).
  const multiFreeCastSourceIds = new Set<string>();
  for (const src of sources) {
    if (src.ref?.kind === "magic-item") continue;
    if (countTopLevelFreeCasts(src.grants) >= 2) multiFreeCastSourceIds.add(src.id);
  }

  // Advantage / disadvantage chips
  const advantages: AdvantageClause[] = [];
  const disadvantages: AdvantageClause[] = [];
  const rollFloors: RollFloorClause[] = [];
  const rollDieAdjustments: RollDieAdjustmentClause[] = [];
  const incomingAttackAdvantages: IncomingAttackClause[] = [];
  const incomingAttackDisadvantages: IncomingAttackClause[] = [];
  const defenseNotes: IncomingAttackClause[] = [];

  // PRIM batch (2026-06-10)
  const auras: AuraClause[] = [];
  const spellDieAugments: SpellDieAugmentEntry[] = [];
  const copyToTargets: CopyToTargetClause[] = [];
  const resourceConversions: ResourceConversionEntry[] = [];

  // Activatable toggles (L11)
  const activatableGroups: ActivatableGroup[] = [];

  // Single-select variant choosers (L12)
  const grantBundles: GrantBundle[] = [];

  // Choice-resistance slots (pick-N re-selectable damage resistances)
  const choiceResistances: ChoiceResistance[] = [];

  // Granted actions (ARCHITECTURE.md combat model)
  const grantedActions: GrantedAction[] = [];

  // Manifested weapons (Soulknife Psychic Blades) — deduped by id.
  const manifestedWeapons: ManifestedWeapon[] = [];

  // Form-swap attack rows (Wild Shape / Arcane Armor / Starry Form) — only the
  // rows from ACTIVE forms land here (collected inside the active `while-active`
  // branch). Deduped by id.
  const formAttacks: FormAttack[] = [];

  // Conjured pact weapons (Pact of the Blade) — deduped by sourceId.
  const pactWeapons: PactWeapon[] = [];

  // On-hit pact-weapon riders (Eldritch Smite, Lifedrinker) — deduped by id.
  const pactWeaponRiders: PactWeaponRider[] = [];

  // Familiar-enhancement bundles (Investment of the Chain Master) — deduped by sourceId.
  const familiarEnhancements: FamiliarEnhancement[] = [];
  const familiarFormIds = new Set<string>();

  // Cunning Strike catalogue (deduped by optionId — first source wins)
  const cunningStrikeOptions: CunningStrikeOption[] = [];

  // Temporary-HP grants (override-first — never auto-applied)
  const tempHpGrants: TempHpEntry[] = [];

  // Cross-feature alternate-recovery grants (Sorcery Incarnate → Innate Sorcery)
  const trackerAltRecoveries: TrackerAltRecoveryEntry[] = [];

  // Pending choices (player-resolved)
  const pendingChoices: PendingChoice[] = [];

  /**
   * Merge a single grant into the aggregate. Extracted as a closure (over the
   * mutable accumulators above) so `while-active` can recurse into its inner
   * grants without duplicating the switch. `sourceId` is the originating
   * feature/item id (recursed grants inherit their wrapper's source). `gref` is
   * THIS grant's catalogue ref (`<sourceKey>.grants.<seg>`) — the localizable
   * strings the aggregate emits key under it (R6+R3 SLICE 7c). `sourceRef` is the
   * SOURCE's catalogue ref (`{kind, key}` of the feat/feature/item/spell, an ID),
   * inherited UNCHANGED through recursion — used to attribute the per-source
   * `hp-flat` breakdown row to its source NAME (so a while-active Aid row inherits
   * the same descent as `hpFlat`). `activeKey` is set ONLY when the grant came from
   * inside a `while-active` block, so toggle-gated aggregates (the `ac-formula`
   * candidates) can be stamped with the toggle.
   */
  function applyGrant(
    g: Grant,
    sourceId: string,
    gref: GrantRef,
    sourceRef: { kind: SrdKind; key: string } | undefined,
    activeKey?: string,
    runtime?: GrantSource["runtime"],
    item?: GrantSource["item"]
  ): void {
    switch (g.type) {
      // ── Senses ──────────────────────────────────────────────────────
      case "darkvision":
        if (g.range > darkvisionFt) darkvisionFt = g.range;
        break;
      case "darkvision-bonus":
        // D6 — additive: SUMS atop the max base range (Umbral Sight +60).
        darkvisionBonusFt += g.amount;
        break;
      case "blindsight":
        if (g.range > blindsightFt) blindsightFt = g.range;
        break;
      case "tremorsense":
        if (g.range > tremorsenseFt) tremorsenseFt = g.range;
        break;
      case "truesight":
        if (g.range > truesightFt) truesightFt = g.range;
        break;
      case "see-invisible":
        if (g.range > seeInvisibleFt) seeInvisibleFt = g.range;
        break;
      case "air-and-water-breathing":
        airAndWaterBreathing = true;
        break;

      // ── Defensive ───────────────────────────────────────────────────
      case "damage-resistance":
        damageResistances.add(g.damageType);
        break;
      case "all-damage-resistance":
        allDamageResistance = true;
        break;
      case "damage-transfer":
        // The persistent-damage reducer owns this because it needs the exact
        // effect-source combatant, which a sheet-wide aggregate intentionally lacks.
        break;
      case "damage-retaliation":
        // The persistent-hit reducer owns this because it needs the exact incoming
        // attacker and this effect occurrence's snapshotted cast level.
        break;
      case "damage-immunity":
        damageImmunities.add(g.damageType);
        break;
      case "damage-vulnerability":
        damageVulnerabilities.add(g.damageType);
        break;
      case "condition-immunity":
        if (g.sourceId) {
          sourceConditionImmunities.set(`${g.condition}\u0000${g.sourceId}`, {
            condition: g.condition,
            sourceId: g.sourceId,
          });
        } else {
          conditionImmunities.add(g.condition);
        }
        break;
      case "damage-resistance-source":
        // Resistance keyed to a damage SOURCE (Abjurer Spell Resistance →
        // "spell"). Set-union per source, orthogonal to the per-DamageType set.
        damageSourceResistances.add(g.source);
        break;
      case "flat-damage-reduction":
        // FLAT incoming-damage reduction (Heavy Armor Master's −PB on B/P/S
        // while in Heavy armor). Recorded verbatim; the consumer resolves the
        // "PB" sentinel + the wearing-state gate before the defenses rail
        // renders it and before the RA-05 damage-intake math subtracts it.
        flatDamageReductions.push({
          damageTypes: g.damageTypes,
          amount: g.amount,
          trigger: g.trigger,
          ...(g.condition ? { condition: g.condition } : {}),
          sourceId,
        });
        break;
      case "save-damage-rule":
        if (g.suppressedByConditions?.some((id) => context.conditions?.has(id))) break;
        saveDamageRules.push({
          ability: g.ability,
          requiresDamageOnSuccess: g.requiresDamageOnSuccess,
          onSuccess: g.onSuccess,
          onFailure: g.onFailure,
          sourceId,
        });
        break;

      // ── Movement ────────────────────────────────────────────────────
      case "speed":
        if (g.round1) {
          // Round-1-only (Ambusher's Leap) — sum into its own bucket; the
          // consumer adds it only when in combat round 1.
          round1SpeedBonusFt += g.amount;
        } else if (g.condition) {
          // Gated on a wearing-state — sum into its conditional bucket; the
          // consumer applies it only when the gate holds.
          conditionalSpeedBonusFt[g.condition] =
            (conditionalSpeedBonusFt[g.condition] ?? 0) + g.amount;
        } else {
          speedBonusFt += g.amount;
        }
        break;
      case "fly-speed":
        flySpeed = maxNonWalking(flySpeed, g.amount);
        break;
      case "swim-speed":
        swimSpeed = maxNonWalking(swimSpeed, g.amount);
        break;
      case "climb-speed":
        climbSpeed = maxNonWalking(climbSpeed, g.amount);
        break;
      case "speed-multiplier":
        // MAX factor wins — multipliers never stack (two doublings ≠ ×4).
        if (g.factor > speedMultiplier) speedMultiplier = g.factor;
        break;
      case "speed-floor":
        // MAX floor wins — floors never stack ("Speed becomes N unless higher").
        if (g.minFt > speedFloorFt) speedFloorFt = g.minFt;
        break;
      case "speed-cap":
        if (speedCapFt === null || g.maxFt < speedCapFt) speedCapFt = g.maxFt;
        break;

      // ── Derived stats ───────────────────────────────────────────────
      case "ac-bonus":
        if (g.ability) {
          acBonusAbilities.push({ ability: g.ability, min: g.min ?? 0 });
        } else {
          acBonus += g.amount ?? 0;
        }
        break;
      case "ac-formula":
        acFormulas.push({
          sourceId,
          base: g.base,
          bonuses: g.bonuses,
          condition: g.condition,
          shieldBonus: g.shieldBonus ?? 0,
          // Toggle-gated formulas (Circle of the Moon Circle Forms) carry the
          // `while-active` key that produced them; always-on formulas don't.
          ...(activeKey === undefined ? {} : { activeKey }),
        });
        break;
      case "medium-armor-dex-cap": {
        // MAX cap wins; the lowest minDex among the winning caps gates it
        // (most generous benefit). Default minDex 16 per Medium Armor Master.
        const minDex = g.minDex ?? 16;
        if (mediumArmorDexCap === null || g.cap > mediumArmorDexCap.cap) {
          mediumArmorDexCap = { cap: g.cap, minDex };
        } else if (g.cap === mediumArmorDexCap.cap && minDex < mediumArmorDexCap.minDex) {
          mediumArmorDexCap = { cap: g.cap, minDex };
        }
        break;
      }
      case "hp-per-level":
        hpPerLevel += g.amount;
        break;
      case "hp-flat": {
        const amount = g.castLevelScaling
          ? g.amount +
            Math.max(
              0,
              (runtime?.castLevel ?? g.castLevelScaling.baseLevel) -
                g.castLevelScaling.baseLevel
            ) *
              g.castLevelScaling.perLevel
          : g.amount;
        hpFlat += amount;
        // Attribute at the source of truth: the breakdown tip MAPS these instead
        // of re-walking sources, so it inherits the exact while-active descent
        // `hpFlat` gets (Aid's `hp-flat:5` lands here only when its toggle is lit)
        // and `sum(amount) === hpFlat` holds by construction (golden rule 6).
        // `sourceRef` is the source NAME ref (the same the old top-level walk used).
        if (sourceRef) hpFlatParts.push({ ref: sourceRef, amount });
        break;
      }
      case "attunement-slots":
        if (g.amount > attunementSlots) attunementSlots = g.amount;
        break;
      case "exhaustion-recovery":
        if (g.recovery === "short-rest") {
          exhaustionRecoveryShortRest += g.amount;
        } else {
          exhaustionRecoveryBonus += g.amount;
        }
        break;
      case "resource":
        resources.push({ sourceId, spec: g.spec });
        break;
      case "crit-range":
        // The most generous (lowest) threshold wins.
        if (g.threshold < critThreshold) critThreshold = g.threshold;
        break;
      case "death-save-crit-range":
        // The most generous (lowest) threshold wins (mirrors `crit-range`).
        if (g.threshold < deathSaveCritThreshold) deathSaveCritThreshold = g.threshold;
        break;
      case "regen-at-turn-start": {
        const amount =
          typeof g.amount === "string" ? g.amount : runtime?.bindings?.[g.amount.binding];
        if (amount === undefined) break;
        startOfTurnRegen.push({
          sourceId,
          amount: String(amount),
          condition: g.condition,
          requiresMinHp: g.requiresMinHp ?? true,
          asTempHp: g.asTempHp ?? false,
        });
        break;
      }
      case "on-crit-movement-rider":
        onCritMovement.push({
          sourceId,
          fraction: g.fraction,
          ignoresOpportunityAttacks: g.ignoresOpportunityAttacks ?? true,
        });
        break;
      case "replace-attack-with-cast":
        replaceAttackWithCast.push({
          sourceId,
          attacks: g.attacks,
          classSpellList: g.classSpellList,
          minSpellLevel: g.minSpellLevel ?? 0,
          maxSpellLevel: g.maxSpellLevel,
          castTime: g.castTime,
        });
        break;
      case "unarmed-strike-die":
        unarmedStrikeDice.push({
          die: g.die,
          ...(g.attackAbility ? { attackAbility: g.attackAbility } : {}),
          ...(g.damageAbility ? { damageAbility: g.damageAbility } : {}),
          damageType: g.damageType,
          sourceId,
        });
        break;
      case "weapon-reach-bonus":
        weaponReachBonuses.push({
          bonusFt: g.bonusFt,
          appliesTo: g.appliesTo,
          extraMasteries: g.extraMasteries ?? [],
        });
        break;
      case "spell-slot-tracker-recovery":
        spellSlotTrackerRecoveries.push({
          trackerId: g.trackerId,
          usesPerSlot: g.usesPerSlot ?? 1,
          sourceId,
        });
        break;
      case "initiative-tracker-topup":
        initiativeTrackerTopUps.push({
          trackerId: g.trackerId,
          upTo: g.upTo,
          sourceId,
        });
        break;
      case "at-zero-hp-interrupt":
        atZeroHpInterrupts.push({ trackerId: g.trackerId, sourceId });
        break;
      case "zero-hp-floor":
        if (activeKey) {
          zeroHpFloors.push({ sourceId, activeKey, hitPoints: g.hitPoints });
        }
        break;
      case "extra-attack":
        // Extra Attack never stacks (multiclass) and Devouring Blade UPGRADES
        // Thirsting Blade — the most extra attacks granted wins.
        if (g.count > extraAttacks) extraAttacks = g.count;
        break;
      case "heroic-inspiration-at-turn-start":
        heroicInspirationAtTurnStart = true;
        break;
      case "heroic-inspiration-on-rest":
        heroicInspirationOnLongRest = true;
        break;
      case "ability-score-set": {
        // Floor: keep the highest value seen per ability ("no effect if your
        // score is already higher" is resolved against the base by the consumer).
        const prev = abilityScoreFloors[g.ability] ?? 0;
        if (g.value > prev) abilityScoreFloors[g.ability] = g.value;
        break;
      }
      case "ability-score": {
        // ADDITIVE ability bonus. ONLY magic-item sources fold into the live
        // render channel — feat/class/race/background ASIs are already BAKED
        // into the stored scores (`applyFeatAsi`), so re-adding them here would
        // double-count. `gref.kind` is the originating source's SRD kind,
        // preserved through `while-active` / `choice-grant-bundle` recursion by
        // `childGrantRef`/`optionGrantRef` (so a bundled Ioun-Stone +2 still
        // reads `magic-item`). A non-item `ability-score` grant is a no-op here
        // (its effect is already in the stored base — golden rule 2).
        if (gref?.kind === "magic-item") {
          itemAbilityScoreBonus[g.ability] += g.amount;
          // The grant's `cap` is the resulting SCORE ceiling (RAW "to a maximum
          // of 20"), NOT a bonus ceiling — it must clamp `base + bonus`, and
          // `base` is unknown here. So carry the TIGHTEST cap per ability for
          // `effectiveAbilityScores` to apply against the actual base.
          if (g.cap != null) {
            const prev = itemAbilityScoreCap[g.ability];
            itemAbilityScoreCap[g.ability] = prev == null ? g.cap : Math.min(prev, g.cap);
          }
        }
        break;
      }
      case "spell-save-dc-bonus":
        spellSaveDcBonus.push({ amount: g.amount, scope: g.scope });
        break;
      case "spell-attack-bonus":
        spellAttackBonus.push({ amount: g.amount, scope: g.scope });
        break;
      case "save-bonus":
        if (g.suppressedByConditions?.some((id) => context.conditions?.has(id))) break;
        if (g.appliesToSave) {
          // SCOPED — rides only the named ability's saves. An ability entry
          // resolves `max(mod, min)` at render (amount 0); a flat entry carries
          // its `amount` (no `ability` key so the consumer takes the flat path).
          if (g.ability) {
            saveBonusByAbility.push({
              appliesToSave: g.appliesToSave,
              ability: g.ability,
              min: g.min ?? 0,
              amount: 0,
            });
          } else {
            saveBonusByAbility.push({
              appliesToSave: g.appliesToSave,
              min: g.min ?? 0,
              amount: g.amount ?? 0,
            });
          }
        } else if (g.ability) {
          saveBonusAbilities.push({ ability: g.ability, min: g.min ?? 0 });
        } else {
          saveBonusFlat += g.amount ?? 0;
        }
        break;
      case "concentration-save-bonus":
        if (g.ability) {
          concentrationSaveBonusAbilities.push({ ability: g.ability, min: g.min ?? 0 });
        } else {
          concentrationSaveBonusFlat += g.amount ?? 0;
        }
        break;
      case "ability-check-bonus":
        abilityCheckBonuses.push({
          appliesTo: g.appliesTo,
          ...(g.ability ? { ability: g.ability } : {}),
          value: g.value ?? "modifier",
          min: g.min ?? 0,
        });
        break;
      case "skill-ability-option":
        skillAbilityOptions.push({ skills: g.skills, ability: g.ability });
        break;
      case "initiative-bonus":
        if (g.ability) {
          initiativeBonusAbilities.push(g.ability);
        } else {
          initiativeBonusFlat += g.amount ?? 0;
        }
        break;
      case "damage-rider": {
        const damageTypeChoices = g.damageTypeChoices;
        const damageType = g.damageType ?? damageTypeChoices?.[0];
        if (!damageType) break;
        damageRiders.push({
          ...(g.dice !== undefined ? { dice: g.dice } : {}),
          ...(g.diceByLevel ? { diceByLevel: g.diceByLevel } : {}),
          ...(g.amount ? { amount: g.amount } : {}),
          ...(g.round1 ? { round1: true as const } : {}),
          ...(g.requiresRiderTrackerId
            ? { requiresRiderTrackerId: g.requiresRiderTrackerId }
            : {}),
          ...(g.vsMarkedTarget ? { vsMarkedTarget: g.vsMarkedTarget } : {}),
          damageType,
          ...(damageTypeChoices ? { damageTypeChoices } : {}),
          appliesTo: g.appliesTo,
          oncePerTurn: g.oncePerTurn ?? false,
          ...(g.addAbilityMod ? { addAbilityMod: g.addAbilityMod } : {}),
          ...(g.resourceCost ? { resourceCost: g.resourceCost } : {}),
          sourceId,
          // `activeKey` (set when this rider arrived through a `while-active`
          // block) marks the chip as a conditional, currently-active source —
          // mirrors `weapon-damage-bonus` below (Rage Damage · active).
          ...(activeKey ? { whileActiveKey: activeKey } : {}),
        });
        break;
      }
      case "weapon-damage-bonus":
        // `activeKey` (the applyGrant param) is the wrapping `while-active`
        // toggle when this grant arrived through one — recorded so the damage
        // breakdown can mark the bonus as a conditional source (Rage · active).
        weaponDamageBonuses.push({
          ...(g.amount !== undefined ? { amount: g.amount } : {}),
          ...(g.sourceKey ? { sourceKey: g.sourceKey } : {}),
          scope: g.scope,
          sourceId,
          ...(activeKey ? { whileActiveKey: activeKey } : {}),
        });
        break;
      case "spell-damage-bonus":
        spellDamageBonuses.push({
          damageTypes: g.damageTypes,
          ...(g.ability ? { ability: g.ability } : {}),
          value: g.value ?? "modifier",
          min: g.min ?? 0,
          scope: g.scope ?? "all",
          ...(g.cantripOnly ? { cantripOnly: true } : {}),
          ...(g.oncePerTurn ? { oncePerTurn: true } : {}),
          ...(g.schools ? { schools: g.schools } : {}),
        });
        break;
      case "spell-damage-outcome":
        spellDamageOutcomes.push({
          scope: g.scope ?? "all",
          cantripOnly: g.cantripOnly ?? false,
          ...(g.damageOnMiss ? { damageOnMiss: g.damageOnMiss } : {}),
          ...(g.damageOnSave ? { damageOnSave: g.damageOnSave } : {}),
        });
        break;
      case "heal-bonus":
        healBonuses.push({
          amount: g.amount,
          perSpellLevel: g.perSpellLevel ?? false,
          minSpellLevel: g.minSpellLevel ?? 0,
          scope: g.scope ?? "all",
        });
        break;
      case "self-heal-on-other":
        selfHealOnOther.push({
          amount: g.amount,
          perSpellLevel: g.perSpellLevel ?? false,
          minSpellLevel: g.minSpellLevel ?? 0,
          scope: g.scope ?? "all",
        });
        break;
      case "maximize-spell-healing":
        maximizeSpellHealing.push({
          minSpellLevel: g.minSpellLevel ?? 0,
          scope: g.scope ?? "all",
        });
        break;
      case "spell-damage-type-override":
        spellDamageTypeOverrides.push({
          toType: g.toType,
          scope: g.scope ?? "all",
        });
        break;
      case "unarmed-strike-damage-type-option":
        if (!unarmedStrikeDamageTypeOptions.includes(g.toType)) {
          unarmedStrikeDamageTypeOptions.push(g.toType);
        }
        break;
      case "component-waiver":
        componentWaivers.push({
          schools: g.schools ?? [],
          waive: g.waive,
          scope: g.scope ?? "all",
        });
        break;
      case "cantrip-damage-bonus": {
        // Resolve which cantrip the bonus targets: an explicit `spellId` wins;
        // else the player's pick (`grantBundleChoices[choiceKey]`); else the
        // fact's `defaultSpellId` fallback (Eldritch Blast for Agonizing Blast).
        const chosen =
          g.spellId ??
          (g.choiceKey ? bundleChoices.get(g.choiceKey) : undefined) ??
          g.defaultSpellId;
        // No target resolvable → the grant contributes nothing (defensive).
        if (chosen) {
          cantripDamageBonuses.push({
            spellId: chosen,
            ...(g.ability ? { ability: g.ability } : {}),
            value: g.value ?? "modifier",
            min: g.min ?? 0,
          });
        }
        break;
      }
      case "cantrip-effect-rider": {
        // Resolve the targeted cantrip exactly like `cantrip-damage-bonus`: an
        // explicit `spellId` wins; else the player's pick
        // (`grantBundleChoices[choiceKey]`); else the `defaultSpellId` fallback
        // (Eldritch Blast for Repelling Blast). No target → contributes nothing.
        const chosen =
          g.spellId ??
          (g.choiceKey ? bundleChoices.get(g.choiceKey) : undefined) ??
          g.defaultSpellId;
        if (chosen) {
          cantripEffectRiders.push({
            spellId: chosen,
            effect: g.effect,
            direction: g.direction,
            distanceFt: g.distanceFt,
            maxTargetSize: g.maxTargetSize,
          });
        }
        break;
      }
      case "cantrip-range-bonus": {
        // Resolve the targeted cantrip exactly like `cantrip-effect-rider`: an
        // explicit `spellId` wins; else the player's pick
        // (`grantBundleChoices[choiceKey]`); else the `defaultSpellId` fallback
        // (Eldritch Blast for Eldritch Spear). No target → contributes nothing.
        // The class-level scaling is recorded (bonusPerLevel × scalesWith level)
        // and resolved per cantrip at render by `resolveCantripRangeBonus`.
        const chosen =
          g.spellId ??
          (g.choiceKey ? bundleChoices.get(g.choiceKey) : undefined) ??
          g.defaultSpellId;
        if (chosen) {
          cantripRangeBonuses.push({
            spellId: chosen,
            bonusPerLevel: g.bonusPerLevel,
            scalesWith: g.scalesWith,
          });
        }
        break;
      }
      case "weapon-attack-cantrip":
        // Dedupe by spellId — the same weapon-attack cantrip granted by two
        // sources resolves identically; first source wins (keeps attribution).
        if (!weaponAttackCantrips.some((w) => w.spellId === g.spellId)) {
          weaponAttackCantrips.push({
            sourceId,
            spellId: g.spellId,
            useSpellcastingAbility: g.useSpellcastingAbility,
            damageTypeChoice: g.damageTypeChoice,
            extraDamageByLevel: g.extraDamageByLevel,
            extraDamageType: g.extraDamageType,
          });
        }
        break;

      // ── Proficiencies ───────────────────────────────────────────────
      case "save-proficiency":
        saveProficiencies.add(g.ability);
        break;
      case "skill-proficiency":
        skillProficiencies.add(g.skill);
        break;
      case "expertise":
        expertiseSkills.add(g.skill);
        break;
      case "half-proficiency-all-skills":
        halfProficiencyAllSkills = true;
        break;
      case "language":
        languages.add(g.language);
        break;
      case "tool-proficiency":
        toolProficiencies.add(g.tool);
        break;
      case "weapon-proficiency":
        weaponProficiencies.add(g.proficiency);
        break;
      case "armor-proficiency":
        armorProficiencies.add(g.proficiency);
        break;
      case "weapon-attack-ability":
        weaponAttackAbilities.push({
          ability: g.ability,
          magicOnly: g.magicOnly ?? false,
          ...(g.weaponScope ? { weaponScope: g.weaponScope } : {}),
          ...(g.dieUpgrade ? { dieUpgrade: g.dieUpgrade } : {}),
          // Carried unconditionally (not only for a die upgrade): a swap that
          // WINS the attack roll names its rule in the breakdown why layer.
          sourceId,
        });
        break;
      case "weapon-attack-bonus":
        // To-hit bonus on weapon attacks (Archery → +2 ranged; Sacred Weapon →
        // +CHA mod (min +1) while lit). Collected as a list; the consumer sums
        // the entries whose scope applies to the weapon. Merge: SUM (two
        // same-scope sources stack into the to-hit). `amount` is carried
        // UNRESOLVED (the ability variant needs the character — resolved in the
        // consumer); `sourceId` names the granting entity by its ONE catalogue
        // key (golden rule 6); `activeKey` records the wrapping `while-active`
        // toggle (when any) so the breakdown can mark it as a conditional source.
        weaponAttackBonuses.push({
          amount: g.amount,
          scope: g.scope,
          sourceId,
          ...(activeKey ? { whileActiveKey: activeKey } : {}),
        });
        break;
      case "damage-die-modifier":
        // Manipulation of a weapon's own damage dice (Great Weapon Fighting
        // floor / Savage Attacker reroll / Two-Weapon Fighting off-hand mod /
        // Unarmed Fighting Unarmed Strike). Collected as a list; the attack-row
        // consumer applies the relevant `mode` to the matching weapon rows.
        // Carry every field through unresolved (the evaluator has no weapon /
        // ability scores); spread optional keys only when present so the
        // aggregate stays minimal and parity tests can use `toEqual`.
        damageDieModifiers.push({
          sourceId,
          mode: g.mode,
          appliesTo: g.appliesTo,
          ...(g.floorBelow !== undefined ? { floorBelow: g.floorBelow } : {}),
          ...(g.floorTo !== undefined ? { floorTo: g.floorTo } : {}),
          ...(g.oncePerTurn !== undefined ? { oncePerTurn: g.oncePerTurn } : {}),
          ...(g.baseDie !== undefined ? { baseDie: g.baseDie } : {}),
          ...(g.unburdenedDie !== undefined ? { unburdenedDie: g.unburdenedDie } : {}),
          ...(g.grappleDie !== undefined ? { grappleDie: g.grappleDie } : {}),
          ...(g.abilityMod !== undefined ? { abilityMod: g.abilityMod } : {}),
          ...(g.damageType !== undefined ? { damageType: g.damageType } : {}),
        });
        break;

      // ── Spell grants ────────────────────────────────────────────────
      case "always-prepared-spell":
        if (!alwaysPrepared.includes(g.spellId)) alwaysPrepared.push(g.spellId);
        break;
      case "ritual-casting":
        ritualSpells.add(g.spellId);
        break;
      case "ritual-casting-any":
        ritualAnyClasses.add(g.classSpellList);
        break;
      case "free-cast-spell": {
        // A typed item's grant (`resourceCost`) pays from the equipped physical
        // copy's declared resource — the exact per-instance address is composed
        // here so no consumer ever parses a source id. Fail-closed: without a
        // bound physical copy there is no payment owner, so no cast surfaces.
        if (g.resourceCost) {
          if (!item) break;
          freeCasts.push({
            sourceId,
            spellId: g.spellId,
            payment: {
              kind: "item-resource",
              ...makeItemResourceIdentity(
                item.itemId,
                item.instanceId,
                g.resourceCost.resourceId
              ),
            },
            ...(g.castLevels ? { castLevels: g.castLevels } : {}),
            ...(g.casterAbility ? { casterAbility: g.casterAbility } : {}),
            ...(g.minLevel != null ? { minLevel: g.minLevel } : {}),
            ...(g.castOverrides ? { castOverrides: g.castOverrides } : {}),
          });
          break;
        }
        // When a source grants MULTIPLE free-cast spells, each is INDEPENDENTLY
        // tracked — RAW "cast EACH of these spells once per <rest>". So a
        // multi-free-cast feat keys its tracker PER-SPELL `${sourceId}:${spellId}`
        // (the set `multiFreeCastSourceIds` flags those sources); a single-free-
        // cast source keeps the bare `sourceId`. An item source keys the shared
        // catalogue-id charge pool. Composed once by `freeCastTrackerKey`.
        const trackerId = freeCastTrackerKey(
          item?.itemId ?? sourceId,
          g.spellId,
          multiFreeCastSourceIds.has(sourceId)
        );
        freeCasts.push({
          sourceId: trackerId,
          spellId: g.spellId,
          payment: { kind: "tracker", trackerId },
          chargesPerRest: g.chargesPerRest ?? 1,
          ...(g.chargesFormula ? { chargesFormula: g.chargesFormula } : {}),
          ...(g.capacityByLevel ? { capacityByLevel: g.capacityByLevel } : {}),
          ...(g.castLevels ? { castLevels: g.castLevels } : {}),
          rest: g.rest ?? "long",
          ...(g.casterAbility ? { casterAbility: g.casterAbility } : {}),
          ...(g.minLevel != null ? { minLevel: g.minLevel } : {}),
          ...(g.castOverrides ? { castOverrides: g.castOverrides } : {}),
        });
        break;
      }
      case "free-cast-from-list": {
        // Same two payment dialects as `free-cast-spell`: a typed item resource
        // (exact per-copy address) or a shared tracker — defaulting to the
        // source feature's own tracker (Divine Intervention) / the item's
        // catalogue-id charge pool, so the cast debits the SAME shared pool.
        if (g.resourceCost) {
          if (!item) break;
          freeCastFromList.push({
            sourceId,
            payment: {
              kind: "item-resource",
              ...makeItemResourceIdentity(
                item.itemId,
                item.instanceId,
                g.resourceCost.resourceId
              ),
            },
            ...(g.spellList ? { spellList: g.spellList } : {}),
            ...(g.maxSpellLevel != null ? { maxSpellLevel: g.maxSpellLevel } : {}),
            ...(g.spellIds ? { spellIds: g.spellIds } : {}),
            ...(g.spellCosts ? { spellCosts: g.spellCosts } : {}),
            ...(g.casterAbility ? { casterAbility: g.casterAbility } : {}),
            ...(g.castOverrides ? { castOverrides: g.castOverrides } : {}),
          });
          break;
        }
        freeCastFromList.push({
          sourceId,
          payment: {
            kind: "tracker",
            trackerId: g.trackerId ?? item?.itemId ?? sourceId,
          },
          ...(g.spellList ? { spellList: g.spellList } : {}),
          ...(g.maxSpellLevel != null ? { maxSpellLevel: g.maxSpellLevel } : {}),
          ...(g.spellIds ? { spellIds: g.spellIds } : {}),
          ...(g.spellCosts ? { spellCosts: g.spellCosts } : {}),
          ...(g.chargesPerRest != null ? { chargesPerRest: g.chargesPerRest } : {}),
          ...(g.rest ? { rest: g.rest } : {}),
          ...(g.casterAbility ? { casterAbility: g.casterAbility } : {}),
          ...(g.castOverrides ? { castOverrides: g.castOverrides } : {}),
        });
        break;
      }
      case "at-will-cast-spell":
        // Deduped by spellId — two sources granting the same at-will cast
        // still yield a single at-will row (first source wins).
        if (!atWillCasts.some((e) => e.spellId === g.spellId)) {
          atWillCasts.push({
            sourceId,
            spellId: g.spellId,
            casterAbility: g.casterAbility,
            // Fiendish Vigor: casting this way maximizes the spell's temp HP
            // instead of rolling. Resolve the declared formula deterministically
            // (no RNG) so the aggregate carries the concrete maximized total.
            ...(g.autoMaxTempHpFormula !== undefined
              ? { autoMaxTempHp: maximizeDiceFormula(g.autoMaxTempHpFormula) }
              : {}),
          });
        }
        break;
      case "scoped-extra-spell-slot":
        scopedExtraSlots.push({
          sourceId,
          levelFormula: g.levelFormula,
          scope: g.scope,
          recovery: g.recovery,
        });
        break;

      // ── Advantage / disadvantage clauses ────────────────────────────
      case "advantage-on":
        if (g.suppressedByConditions?.some((id) => context.conditions?.has(id))) break;
        // `activeKey` (set when this clause arrived through a `while-active`
        // block) marks the chip as a conditional, currently-active source —
        // mirrors `weapon-damage-bonus` (Rage's STR advantage · active).
        advantages.push({
          sourceId,
          rollType: g.rollType,
          vs: g.vs,
          description: grantField(gref, "description", g.description),
          ...(g.round1 ? { round1: true } : {}),
          ...(activeKey ? { whileActiveKey: activeKey } : {}),
          ...narrowedScope(g),
        });
        break;
      case "disadvantage-on":
        disadvantages.push({
          sourceId,
          rollType: g.rollType,
          vs: g.vs,
          description: grantField(gref, "description", g.description),
          ...(activeKey ? { whileActiveKey: activeKey } : {}),
          ...(g.consume ? { consume: g.consume } : {}),
          ...narrowedScope(g),
        });
        break;
      case "round1-damage-double":
        // Round-1 save-gated damage-doubler note (Death Strike) — carry the ability
        // pair; the consumer resolves the DC + the UI shows it only in combat round 1.
        round1DamageDoubles.push({
          sourceId,
          saveAbility: g.saveAbility,
          saveDcAbility: g.saveDcAbility,
        });
        break;
      case "roll-floor":
        rollFloors.push({
          sourceId,
          rollType: g.rollType,
          floor: g.floor,
          appliesTo: g.appliesTo,
          description: grantField(gref, "description", g.description),
          ...(activeKey ? { whileActiveKey: activeKey } : {}),
        });
        break;
      case "roll-die-adjustment":
        rollDieAdjustments.push({
          sourceId,
          rollType: g.rollType,
          operation: g.operation,
          dice: g.dice,
          consume: g.consume,
        });
        break;
      case "incoming-attack-advantage":
        // SELF-side downside (Reckless Attack): when it arrives through a
        // `while-active` block, `activeKey` marks it "· active" — same as the
        // advantage chips it mirrors.
        incomingAttackAdvantages.push({
          sourceId,
          description: grantField(gref, "description", g.description),
          ...(activeKey ? { whileActiveKey: activeKey } : {}),
        });
        break;
      case "incoming-attack-disadvantage":
        // SELF-side BENEFIT (Blur): attacks against you have Disadvantage. When it
        // arrives through a `while-active` block (Blur is a Concentration spell),
        // `activeKey` marks it "· active" — the mirror of the downside above.
        incomingAttackDisadvantages.push({
          sourceId,
          description: grantField(gref, "description", g.description),
          ...(activeKey ? { whileActiveKey: activeKey } : {}),
        });
        break;
      case "defense-note":
        // SELF-side defensive reminder line (Warding Bond's shared-damage /
        // resistance posture). Prose only; the engine computes nothing from it.
        defenseNotes.push({
          sourceId,
          description: grantField(gref, "description", g.description),
          ...(activeKey ? { whileActiveKey: activeKey } : {}),
        });
        break;

      // ── PRIM batch (2026-06-10) ─────────────────────────────────────
      case "aura":
        auras.push({
          sourceId,
          auraId: g.auraId,
          radius: g.radius,
          ...(g.radiusByLevel && { radiusByLevel: g.radiusByLevel }),
          affects: g.affects,
          effect: g.effect,
          ...(g.description && {
            description: grantField(gref, "description", g.description),
          }),
        });
        break;
      case "spell-die-augment": {
        // Largest `toDie` wins when two sources target the same spell.
        const existing = spellDieAugments.find((e) => e.spellId === g.spellId);
        if (existing) {
          if (g.toDie > existing.toDie) {
            existing.toDie = g.toDie;
            existing.fromDie = g.fromDie;
          }
        } else {
          spellDieAugments.push({
            spellId: g.spellId,
            fromDie: g.fromDie,
            toDie: g.toDie,
          });
        }
        break;
      }
      case "copy-to-2nd-target":
        copyToTargets.push({
          sourceId,
          copyId: g.copyId,
          ...(g.appliesToFeature && { appliesToFeature: g.appliesToFeature }),
          effect: grantField(gref, "effect", g.effect),
        });
        break;
      case "resource-conversion":
        resourceConversions.push({
          sourceId,
          conversionId: g.conversionId,
          produces: g.produces,
          ...(g.fromTracker && { fromTracker: g.fromTracker }),
          ...(g.toTracker && { toTracker: g.toTracker }),
          ...(g.perUnitSlotLevels !== undefined && {
            perUnitSlotLevels: g.perUnitSlotLevels,
          }),
          ...(g.costTable && { costTable: g.costTable }),
          ...(g.maxSlotLevel !== undefined && { maxSlotLevel: g.maxSlotLevel }),
        });
        break;
      case "item-bound-bonus":
        // INTENTIONALLY un-aggregated. A `weapon-attack-and-damage` bonus rides
        // ONLY its owning weapon's row, so the weapon-layer consumer
        // (`resolveItemBoundWeaponBonus`) reads the item's grants directly —
        // aggregating it would smear the +N across every attack. The case exists
        // to keep the switch exhaustive (no silent fall-through).
        break;

      // ── Pending choices (level-up wizard pickers) ───────────────────
      case "choice-ability-score":
        pendingChoices.push({
          sourceId,
          kind: "ability-score",
          abilities: g.abilities,
          amount: g.amount,
          cap: g.cap,
        });
        break;
      case "choice-skill-proficiency":
        pendingChoices.push({
          sourceId,
          kind: "skill-proficiency",
          options: g.options,
          amount: g.amount,
        });
        break;
      case "choice-expertise":
        pendingChoices.push({
          sourceId,
          kind: "expertise",
          amount: g.amount,
        });
        break;
      case "choice-language":
        pendingChoices.push({
          sourceId,
          kind: "language",
          options: g.options,
          amount: g.amount,
        });
        break;
      case "choice-tool-proficiency":
        pendingChoices.push({
          sourceId,
          kind: "tool-proficiency",
          options: g.options,
          amount: g.amount,
        });
        break;
      case "choice-skill-or-tool-proficiency":
        pendingChoices.push({
          sourceId,
          kind: "skill-or-tool-proficiency",
          amount: g.amount,
        });
        break;
      case "choice-cantrip":
        pendingChoices.push({
          sourceId,
          kind: "cantrip",
          classSpellList: g.classSpellList,
          amount: g.amount,
          spellAbility: g.spellAbility,
        });
        break;
      case "choice-spell":
        pendingChoices.push({
          sourceId,
          kind: "spell",
          classSpellList: g.classSpellList,
          classSpellLists: g.classSpellLists,
          maxLevel: g.maxLevel,
          amount: g.amount,
          spellAbility: g.spellAbility,
          ritualOnly: g.ritualOnly,
          spellSchool: g.spellSchool,
          spellSchools: g.spellSchools,
          toSpellbook: g.toSpellbook,
        });
        break;

      case "choice-feat":
        // Origin-feat grant (Lessons of the First Ones / Human Versatile):
        // surface a pending feat pick so the picker can prompt the player. The
        // chosen feat is resolved into a `character.features` ref by
        // `feat-feat-choices.ts`; from there the existing feat pipeline applies
        // its grants/tracker/actions — this grant is a CHOICE seam, not an
        // aggregate of effects.
        pendingChoices.push({
          sourceId,
          kind: "feat",
          category: g.category,
          amount: g.amount,
        });
        break;

      // ── Activatable / conditional grants (L11) ──────────────────────
      case "while-active": {
        if (g.minLevel !== undefined && (context.level ?? 0) < g.minLevel) break;
        const key = resolveGrantActiveKey({ id: sourceId, item }, g.activeKey);
        const active = activeKeys.has(key);
        activatableGroups.push({
          key,
          ...(item ? { authoredKey: g.activeKey } : {}),
          sourceId,
          label: grantField(gref, "label", g.label),
          active,
        });
        if (active) {
          for (let i = 0; i < g.grants.length; i++) {
            const inner = g.grants[i];
            if (!inner) continue;
            // One level only — a nested while-active is ignored (its buff
            // would need its own toggle; data declares toggles flat).
            if (inner.type === "while-active") continue;
            applyGrant(
              inner,
              sourceId,
              childGrantRef(gref, inner, i),
              sourceRef,
              key,
              runtime,
              item
            );
          }
        }
        break;
      }

      // ── Single-select variant chooser (L12) ───────────────────────────
      case "choice-grant-bundle": {
        const selected = bundleChoices.get(g.bundleKey) ?? null;
        grantBundles.push({
          bundleKey: g.bundleKey,
          sourceId,
          label: grantField(gref, "label", g.label),
          options: g.options.map((o) => ({
            id: o.id,
            label: grantField(optionGrantRef(gref, o.id), "label", o.label),
          })),
          selected,
          choiceFrequency: g.choiceFrequency ?? "rest",
        });
        if (selected !== null) {
          const chosen = g.options.find((o) => o.id === selected);
          const optionRef = optionGrantRef(gref, selected);
          const innerGrants = chosen?.grants ?? [];
          for (let j = 0; j < innerGrants.length; j++) {
            const inner = innerGrants[j];
            if (!inner) continue;
            // One level only — nested choosers are ignored.
            if (inner.type === "choice-grant-bundle") {
              continue;
            }
            // A `free-cast-spell` inside a multi-spell bundle option (2024 species
            // Legacy: "cast EACH of these spells once per Long Rest without a
            // slot") needs its OWN charge counter — the free-cast is keyed by
            // `sourceId`, so a per-spell suffix gives Hellish Rebuke and Darkness
            // independent 1/LR uses instead of sharing one. (This is the bundle
            // analogue of the `multiFreeCastSourceIds` rule the top-level
            // `free-cast-spell` case applies; it pre-suffixes here so the case —
            // which only re-suffixes ids in that set — leaves it untouched.) Other
            // inner grants keep the bundle's source id (they aggregate flatly).
            const innerSourceId =
              inner.type === "free-cast-spell"
                ? `${sourceId}:${inner.spellId}`
                : sourceId;
            applyGrant(
              inner,
              innerSourceId,
              childGrantRef(optionRef, inner, j),
              sourceRef,
              // Inherit the wrapping `while-active` toggle (when any): a bundle
              // nested in a lit form (Armorer's Armor Model inside the donned
              // Arcane Armor) carries `activeKey` so a `form-attack` in the chosen
              // option stays gated by BOTH the toggle AND the model choice. Plain
              // (un-nested) bundles pass `undefined`, unchanged.
              activeKey,
              runtime,
              item
            );
          }
        }
        break;
      }

      // ── Choice-resistance (pick N damage resistances, re-selectable) ───
      case "choice-resistance": {
        // Picks are re-selectable session state stored at
        // `grantBundleChoices[choiceKey]` as a comma-separated DamageType list.
        const picks = parseChoiceResistanceValue(
          bundleChoices.get(g.choiceKey),
          g.options,
          g.amount
        );
        // Each validated pick gains Resistance — set-union into the SAME field
        // the fixed `damage-resistance` grant feeds, so the defenses consumer
        // needs no extra code.
        for (const dt of picks) damageResistances.add(dt);
        // Surface the slot so a picker UI can show the constrained list + picks.
        choiceResistances.push({
          choiceKey: g.choiceKey,
          sourceId,
          label: grantField(gref, "label", g.label),
          options: g.options,
          amount: g.amount,
          selected: picks,
        });
        break;
      }

      // ── Granted action (ARCHITECTURE.md combat model) ──────────────────────────
      case "granted-action":
        grantedActions.push({
          sourceId,
          name: grantField(gref, "name", g.name),
          slot: g.slot,
          ...(hasGrantField(gref, "description", g.description)
            ? { description: grantField(gref, "description", g.description) }
            : {}),
          cost: g.cost,
          ...(hasGrantField(gref, "trigger", g.trigger)
            ? { trigger: grantField(gref, "trigger", g.trigger) }
            : {}),
          saveAbility: g.saveAbility,
        });
        break;

      // ── Manifested weapon (Soulknife Psychic Blades) ──────────────────
      case "manifested-weapon":
        // Dedupe by id — the same feature can't usefully manifest the same
        // weapon twice; first source wins (keeps its attribution).
        if (!manifestedWeapons.some((w) => w.id === g.id)) {
          manifestedWeapons.push({
            sourceId,
            id: g.id,
            name: grantField(gref, "name", g.name),
            nameEn: grantFieldEn(gref, "name", g.name),
            category: g.category,
            weaponType: g.weaponType,
            damageDie: g.damageDie,
            damageType: g.damageType,
            properties: g.properties,
            ...(g.mastery ? { mastery: g.mastery } : {}),
            masteryIsFree: g.masteryIsFree ?? false,
            proficient: g.proficient ?? true,
            ...(g.bonusAction
              ? {
                  bonusAction: {
                    name: grantField(
                      gref
                        ? { kind: gref.kind, key: srdKey(gref.key, "bonusAction") }
                        : undefined,
                      "name",
                      g.bonusAction.name
                    ),
                    slot: g.bonusAction.slot,
                    damageDie: g.bonusAction.damageDie,
                  },
                }
              : {}),
          });
        }
        break;

      // ── Form attack (Wild Shape / Arcane Armor / Starry Form) ──────────
      case "form-attack":
        // A form attack is meaningful ONLY while its form toggle is lit — it
        // MUST sit inside a `while-active` block, so `activeKey` is the wrapping
        // toggle the evaluator stamped on recursion. An always-on `form-attack`
        // (no wrapping toggle, `activeKey === undefined`) is a data error: skip
        // it rather than leak a permanent natural weapon. Dedupe by id (first
        // source wins, keeping attribution).
        if (activeKey !== undefined && !formAttacks.some((f) => f.id === g.id)) {
          formAttacks.push({
            sourceId,
            activeKey,
            id: g.id,
            name: grantField(gref, "name", g.name),
            category: g.category,
            weaponType: g.weaponType,
            damageDie: g.damageDie,
            ...(g.damageDieByLevel ? { damageDieByLevel: g.damageDieByLevel } : {}),
            damageType: g.damageType,
            properties: g.properties,
            ...(g.attackAbility ? { attackAbility: g.attackAbility } : {}),
            proficient: g.proficient ?? true,
            ...(g.oncePerTurnExtra ? { oncePerTurnExtra: g.oncePerTurnExtra } : {}),
            // A localizable on-hit reminder is carried iff the catalogue has the
            // `<ref>.note` key (mirrors how `granted-action` emits its catalogue
            // `description` from presence, not an inline value — GR7).
            ...(hasGrantField(gref, "note") ? { note: grantField(gref, "note") } : {}),
          });
        }
        break;

      // ── Pact weapon (Warlock Pact of the Blade) ───────────────────────
      case "pact-weapon":
        // Dedupe by sourceId — a character has at most one pact-weapon bond
        // (re-conjuring ends the previous bond). First source wins.
        if (!pactWeapons.some((w) => w.sourceId === sourceId)) {
          pactWeapons.push({
            sourceId,
            id: g.id,
            name: grantField(gref, "name", g.name),
            attackAbility: g.attackAbility,
            damageTypeChoices: g.damageTypeChoices,
            isFocus: g.isFocus,
            conjureSlot: g.conjureSlot,
            defaultDamageDie: g.defaultDamageDie,
            defaultDamageType: g.defaultDamageType,
          });
          // The bond grants proficiency with the conjured weapon AND lets you
          // use the spellcasting ability for attack/damage. Fold both into the
          // existing seams so a CARRIED weapon the Warlock bonds with benefits
          // identically (Equipment proficiency union + best-of attack ability).
          // The `pact-weapon` TOKEN localizes from the catalogue (no EN leak).
          weaponProficiencies.add(asProficiencyToken("pact-weapon"));
          if (
            !weaponAttackAbilities.some(
              (wa) => wa.ability === g.attackAbility && !wa.magicOnly
            )
          ) {
            weaponAttackAbilities.push({
              ability: g.attackAbility,
              magicOnly: false,
              sourceId,
            });
          }
        }
        break;

      // ── Pact-weapon rider (Eldritch Smite, Lifedrinker) ───────────────
      case "pact-weapon-rider":
        // Dedupe by id (the invocation slug). First source wins — a Warlock
        // never has two copies of the same Pact-of-the-Blade rider.
        if (!pactWeaponRiders.some((r) => r.id === g.id)) {
          pactWeaponRiders.push({
            sourceId,
            id: g.id,
            name: grantField(gref, "name", g.name),
            nameEn: grantFieldEn(gref, "name", g.name),
            dice: g.dice,
            ...(g.damageType ? { damageType: g.damageType } : {}),
            ...(g.damageTypeChoices ? { damageTypeChoices: g.damageTypeChoices } : {}),
            costsPactSlot: g.costsPactSlot ?? false,
            scalesPerSlotLevel: g.scalesPerSlotLevel ?? false,
            ...(g.prone ? { prone: g.prone } : {}),
            healFromHitDie: g.healFromHitDie ?? false,
          });
        }
        break;

      // ── Familiar enhancement (Investment of the Chain Master) ─────────
      case "familiar-enhancement":
        // Dedupe by sourceId — a character never carries the same familiar-
        // enhancement feature twice; first source wins (keeps its attribution).
        if (!familiarEnhancements.some((f) => f.sourceId === sourceId)) {
          familiarEnhancements.push({
            sourceId,
            ...(g.extraSpeedFt != null ? { extraSpeedFt: g.extraSpeedFt } : {}),
            ...(g.extraSpeedModes ? { extraSpeedModes: g.extraSpeedModes } : {}),
            ...(g.bonusActionAttack != null
              ? { bonusActionAttack: g.bonusActionAttack }
              : {}),
            ...(g.damageTypeConversion
              ? { damageTypeConversion: g.damageTypeConversion }
              : {}),
            ...(g.usesOwnerSaveDc != null ? { usesOwnerSaveDc: g.usesOwnerSaveDc } : {}),
            ...(g.reactionResistance != null
              ? { reactionResistance: g.reactionResistance }
              : {}),
          });
        }
        break;

      // ── Familiar special forms (Pact of the Chain) ────────────────────
      case "familiar-forms":
        // Set-union across sources — a caster could theoretically gain the
        // pool from more than one feature; the ids dedupe naturally.
        for (const id of g.monsterIds) familiarFormIds.add(id);
        break;

      // ── Cunning Strike option (Rogue catalogue) ───────────────────────
      case "cunning-strike-option":
        // Dedupe by optionId — a character can pick up the same effect from
        // more than one source only conceptually; the catalogue lists each
        // once (first source wins, keeping its attribution).
        if (!cunningStrikeOptions.some((o) => o.optionId === g.optionId)) {
          cunningStrikeOptions.push({
            sourceId,
            optionId: g.optionId,
            name: grantField(gref, "name", g.name),
            cost: g.cost,
            description: grantField(gref, "description", g.description),
            ...(g.save ? { save: g.save } : {}),
            ...(g.condition ? { condition: g.condition } : {}),
          });
        }
        break;

      // ── Temporary HP grant (override-first — never auto-applied) ──────
      case "temp-hp":
        tempHpGrants.push({
          sourceId,
          formula: g.formula,
          ...(hasGrantField(gref, "trigger", g.trigger)
            ? { trigger: grantField(gref, "trigger", g.trigger) }
            : {}),
          slot: g.slot,
        });
        break;

      // ── Cross-feature alternate-recovery cost (Sorcery Incarnate) ─────
      case "tracker-alt-recovery":
        trackerAltRecoveries.push({
          targetTracker: g.targetTracker,
          amount: g.amount,
          fromTracker: g.fromTracker,
        });
        break;

      // ── Extra economy-slot grant (B6 — Action Surge / Haste) ──────────
      case "extra-action":
        extraActions.push({
          sourceId,
          slot: g.slot,
          count: g.count,
          ...(g.allowedActions ? { allowedActions: g.allowedActions } : {}),
          ...(g.maxAttacks !== undefined ? { maxAttacks: g.maxAttacks } : {}),
        });
        break;
      case "turn-economy-block":
        turnEconomyBlocked = true;
        break;
      case "spellcasting-blocked":
        spellcastingBlocked = true;
        break;
      case "concentration-blocked":
        concentrationBlocked = true;
        break;
      case "healing-blocked":
        healingBlocked = true;
        break;

      // ── Exhaustiveness guard — a future un-cased Grant kind is a compile
      //    error (g narrows to `never` here only if all members are handled). ─
      default:
        assertNever(g);
    }
  }

  for (const src of sources) {
    const grants = src.grants ?? [];
    for (let i = 0; i < grants.length; i++) {
      const g = grants[i];
      if (!g) continue;
      const gref: GrantRef = src.ref
        ? {
            kind: src.ref.kind,
            key: srdKey(src.ref.key, srdGrantSegment(grantSegmentArgs(g), i)),
          }
        : undefined;
      applyGrant(g, src.id, gref, src.ref, undefined, src.runtime, src.item);
    }
  }

  return {
    // D6 — final darkvision = max BASE range (merge) + summed additive bonus
    // (Umbral Sight). With no base, the bonus still grants its own range (RAW:
    // "Darkvision 60 ft; if you already have Darkvision, its range increases by
    // 60 ft") — `0 + bonus` covers that case naturally.
    darkvisionFt: darkvisionFt + darkvisionBonusFt,
    blindsightFt,
    tremorsenseFt,
    truesightFt,
    seeInvisibleFt,
    airAndWaterBreathing,
    damageResistances,
    allDamageResistance,
    damageImmunities,
    damageVulnerabilities,
    conditionImmunities,
    sourceConditionImmunities: [...sourceConditionImmunities.values()],
    spellcastingBlocked,
    concentrationBlocked,
    healingBlocked,
    damageSourceResistances,
    flatDamageReductions,
    saveDamageRules,
    speedBonusFt,
    conditionalSpeedBonusFt,
    round1SpeedBonusFt,
    round1DamageDoubles,
    flySpeed,
    swimSpeed,
    climbSpeed,
    speedMultiplier,
    speedFloorFt,
    speedCapFt,
    acBonus,
    acBonusAbilities,
    acFormulas,
    mediumArmorDexCap,
    hpPerLevel,
    hpFlat,
    hpFlatParts,
    critThreshold,
    deathSaveCritThreshold,
    startOfTurnRegen,
    onCritMovement,
    replaceAttackWithCast,
    unarmedStrikeDice,
    weaponReachBonuses,
    spellSlotTrackerRecoveries,
    initiativeTrackerTopUps,
    atZeroHpInterrupts,
    resources,
    zeroHpFloors,
    extraAttacks,
    extraActions,
    turnEconomyBlocked,
    heroicInspirationAtTurnStart,
    heroicInspirationOnLongRest,
    attunementSlots,
    exhaustionRecoveryBonus,
    exhaustionRecoveryShortRest,
    abilityScoreFloors,
    itemAbilityScoreBonus,
    itemAbilityScoreCap,
    spellSaveDcBonus,
    spellAttackBonus,
    saveBonusAbilities,
    saveBonusFlat,
    saveBonusByAbility,
    concentrationSaveBonusAbilities,
    concentrationSaveBonusFlat,
    abilityCheckBonuses,
    skillAbilityOptions,
    initiativeBonusAbilities,
    initiativeBonusFlat,
    damageRiders,
    weaponDamageBonuses,
    spellDamageBonuses,
    spellDamageOutcomes,
    healBonuses,
    selfHealOnOther,
    maximizeSpellHealing,
    spellDamageTypeOverrides,
    unarmedStrikeDamageTypeOptions,
    componentWaivers,
    cantripDamageBonuses,
    cantripEffectRiders,
    cantripRangeBonuses,
    weaponAttackCantrips,
    saveProficiencies,
    skillProficiencies,
    expertiseSkills,
    halfProficiencyAllSkills,
    languages,
    toolProficiencies,
    weaponProficiencies,
    armorProficiencies,
    weaponAttackAbilities,
    weaponAttackBonuses,
    damageDieModifiers,
    alwaysPrepared,
    ritualSpells,
    ritualAnyClasses,
    freeCasts,
    freeCastFromList,
    atWillCasts,
    scopedExtraSlots,
    advantages,
    disadvantages,
    rollFloors,
    rollDieAdjustments,
    incomingAttackAdvantages,
    incomingAttackDisadvantages,
    defenseNotes,
    auras,
    spellDieAugments,
    copyToTargets,
    resourceConversions,
    activatableGroups,
    grantBundles,
    choiceResistances,
    grantedActions,
    manifestedWeapons,
    formAttacks,
    pactWeapons,
    pactWeaponRiders,
    familiarEnhancements,
    familiarFormIds,
    tempHpGrants,
    cunningStrikeOptions,
    trackerAltRecoveries,
    pendingChoices,
  };
}
