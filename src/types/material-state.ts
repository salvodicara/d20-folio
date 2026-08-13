import type {
  ArmorCategory,
  CreatureSize,
  CreatureType,
  WeaponCategory,
  WeaponMastery,
  WeaponType,
} from "@/data/types";
import type { AbilityCode } from "@/types/ability";
import type { ActionJournal, JournalAction } from "@/types/action-journal";
import type { ExhaustionLevel } from "@/types/condition";
import type { DamageDefenseProfile, DamageType } from "@/types/damage";
import type { DiceFormula } from "@/types/dice-formula";
import type { MechanicOccurrence, OccurrenceState } from "@/types/mechanic-occurrence";
import type {
  CharacterMaterialRef,
  ClockRef,
  EntityRef,
  InventoryGenerationRef,
  OccurrenceGenerationRef,
} from "@/types/mechanics-reference";
import type {
  CountResourceCell,
  CurrencyDenomination,
  ResourceCell,
  ResourceDie,
  ResourceSpec,
} from "@/types/resource";
import type { CreatureVitals, ObjectVitals } from "@/types/vitals";
import type { WeaponCapabilities } from "@/types/weapon-property";
import type { TurnEconomyState } from "@/types/turn-economy";

export type { CountResourceCell, ResourceCell } from "@/types/resource";

export const MATERIAL_STATE_SCHEMA = 4 as const;

export interface MaterialJournalFields extends ActionJournal {
  actions: readonly JournalAction[];
}

export interface MaterialOccurrenceFields extends OccurrenceState {
  occurrences: Record<string, MechanicOccurrence>;
}

export interface CharacterResources {
  pools: Record<string, ResourceCell>;
  standardSpellSlots: Record<string, CountResourceCell>;
  pactSpellSlot: CountResourceCell | null;
  hitDice: Partial<Record<ResourceDie, CountResourceCell>>;
  currency: Record<CurrencyDenomination, CountResourceCell>;
}

export interface CustomWeaponMechanics {
  category: WeaponCategory;
  type: WeaponType;
  damageFormula: DiceFormula;
  damageType: DamageType;
  capabilities: WeaponCapabilities;
  mastery: WeaponMastery | null;
}

export interface CustomArmorMechanics {
  category: ArmorCategory;
  baseArmorClass: number;
  addsDexterity: boolean;
  dexterityCap: number | null;
  strengthRequirement: number | null;
  stealthDisadvantage: boolean;
}

/** Stable facts for an uncatalogued item; mutable ownership lives on its instance. */
export interface CustomItemDefinition {
  name: string;
  description: string;
  emoji: string;
  category: "weapon" | "armor" | "gear";
  weightLb: number | null;
  armorClassBonus: number;
  consumable: boolean;
  potionFormula: DiceFormula | null;
  resources: Record<string, ResourceSpec>;
  weapon: CustomWeaponMechanics | null;
  armor: CustomArmorMechanics | null;
}

export type ItemDefinition =
  | { kind: "catalogue"; itemId: string }
  | { kind: "custom"; definition: CustomItemDefinition };

export interface ItemInstanceOverrides {
  name: string | null;
  armorClass: number | null;
  attackBonus: number | null;
  damageFormula: DiceFormula | null;
  damageType: DamageType | null;
}

export interface MaterialTag {
  label: string;
  color: string;
}

export interface InventoryInstance {
  ordinal: number;
  definition: ItemDefinition;
  quantity: CountResourceCell;
  equipped: boolean;
  attuned: boolean;
  notes: string;
  tags: MaterialTag[];
  ownerOccurrence: OccurrenceGenerationRef | null;
  overrides: ItemInstanceOverrides;
  resources: Record<string, ResourceCell>;
  disposition: "magical" | "nonmagical";
  enchantment: InventoryGenerationRef | null;
}

export interface CustomCreatureDefinition {
  name: string;
  creatureType: CreatureType;
  size: CreatureSize;
  armorClass: number;
  hitPointMaximum: number;
  speedFt: number;
  proficiencyBonus: number;
  abilityScores: Record<AbilityCode, number>;
  savingThrowBonuses: Partial<Record<AbilityCode, number>>;
}

export type CreatureEntityTemplate =
  | { kind: "catalogue-companion"; sourceId: string; variantId: string }
  | {
      kind: "catalogue-monster";
      monsterId: string;
      creatureTypeOverride: CreatureType | null;
    }
  | { kind: "custom"; definition: CustomCreatureDefinition };

export interface EntityStatOverrides {
  armorClass: number | null;
  hitPointMaximum: number | null;
  speedFt: number | null;
  initiativeBonus: number | null;
}

interface MaterialEntityBase {
  ordinal: number;
  controller: EntityRef | null;
  ownerOccurrence: OccurrenceGenerationRef | null;
  availability: "present" | "dismissed";
  label: string;
  resources: Record<string, ResourceCell>;
}

export interface CreatureMaterialEntity extends MaterialEntityBase {
  kind: "creature";
  template: CreatureEntityTemplate;
  vitals: CreatureVitals;
  exhaustion: ExhaustionLevel;
  overrides: EntityStatOverrides;
}

export interface CustomObjectDefinition {
  name: string;
  size: CreatureSize;
  armorClass: number;
  hitPointMaximum: number;
  damageDefenseProfile: DamageDefenseProfile;
  magical: boolean;
  materials: readonly ObjectMaterial[];
}

export type ObjectMaterial =
  | { kind: "adamantine" }
  | { kind: "bone" }
  | { kind: "cloth" }
  | { kind: "crystal" }
  | { kind: "glass" }
  | { kind: "ice" }
  | { kind: "iron" }
  | { kind: "mithral" }
  | { kind: "paper" }
  | { kind: "rope" }
  | { kind: "steel" }
  | { kind: "stone" }
  | { kind: "wood" }
  | { kind: "custom"; materialId: string };

export type ObjectEntityTemplate =
  | { kind: "catalogue-object"; objectId: string }
  | {
      kind: "inventory-item";
      owner: CharacterMaterialRef;
      instanceId: string;
      instanceOrdinal: number;
    }
  | { kind: "custom"; definition: CustomObjectDefinition };

export interface ObjectStatOverrides {
  size: CreatureSize | null;
  armorClass: number | null;
  hitPointMaximum: number | null;
  /** Null means derived; a profile is one explicit, complete table override. */
  damageDefenseProfile: DamageDefenseProfile | null;
  magical: boolean | null;
  materials: readonly ObjectMaterial[] | null;
}

export interface ObjectMaterialEntity extends MaterialEntityBase {
  kind: "object";
  template: ObjectEntityTemplate;
  vitals: ObjectVitals;
  overrides: ObjectStatOverrides;
}

export type MaterialEntity = CreatureMaterialEntity | ObjectMaterialEntity;

export interface MaterialTimeline {
  /** Changes only when a timeline is deliberately replaced; ordinary time never resets it. */
  epoch: number;
  /** Absolute, user-observed elapsed play time. */
  elapsedSeconds: number;
  /** First unused identity for a rest/day-phase observation on this timeline. */
  nextBoundaryOrdinal: number;
}

export interface CharacterClockBinding {
  /** Clock used for newly created absolute-duration rules. */
  timeline: ClockRef;
  /** Exact active combat generation, or null while locally idle. */
  encounter: ClockRef | null;
}

export interface ActionPreferences {
  pinnedActionIds: string[];
  unpinnedActionIds: string[];
}

export interface EncounterParticipant {
  ordinal: number;
  combatant: EntityRef;
  economy: TurnEconomyState;
  initiativeRoll: number | null;
  skipped: boolean;
}

export interface EncounterState {
  epoch: number;
  nextCombatantOrdinal: number;
  participants: Record<string, EncounterParticipant>;
  phase: "initiative" | "turns";
  round: number;
  order: string[];
  currentCombatantId: string | null;
}

/** The one coordinator shape used by both character and campaign material roots. */
export interface MaterialCoordinator {
  /** First unused ordinal reserved for externally allocated controlled-entity ids. */
  nextEntityOrdinal: number;
  entities: Record<string, MaterialEntity>;
  nextEncounterEpoch: number;
  encounter: EncounterState | null;
  timeline: MaterialTimeline;
}

/** Current physical play state at `/users/{uid}/characters/{characterId}/combat/state`. */
export interface CharacterMaterialState
  extends MaterialJournalFields, MaterialOccurrenceFields, MaterialCoordinator {
  schema: typeof MATERIAL_STATE_SCHEMA;
  buildRevision: number;
  vitals: CreatureVitals;
  exhaustion: ExhaustionLevel;
  heroicInspiration: boolean;
  bardicInspirationDie: 6 | 8 | 10 | 12 | null;
  resources: CharacterResources;
  selections: Record<string, string | string[]>;
  preferences: ActionPreferences;
  notes: string;
  nextInventoryOrdinal: number;
  inventory: Record<string, InventoryInstance>;
  clockBinding: CharacterClockBinding;
}

/** Persistent campaign mechanics coordinator at `/campaigns/{campaignId}/combat/state`. */
export interface SharedMaterialState
  extends MaterialJournalFields, MaterialOccurrenceFields, MaterialCoordinator {
  schema: typeof MATERIAL_STATE_SCHEMA;
}

export type CharacterMaterialParseResult =
  | { ok: true; value: Readonly<CharacterMaterialState> }
  | { ok: false };

export type SharedMaterialParseResult =
  | { ok: true; value: Readonly<SharedMaterialState> }
  | { ok: false };
