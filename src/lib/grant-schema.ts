/**
 * Schema-first Grant authoring language.
 *
 * This exact runtime schema is the single structural source for every Grant kind;
 * the public Grant type is inferred below. Composite entries refer
 * back to the root through the named "grant" reference, so nested authored
 * mechanics are validated with the same grammar instead of a permissive escape.
 */
import {
  arraySchema,
  bindExactSchemaOutput,
  booleanSchema,
  customSchema,
  discriminatedUnionSchema,
  literalSchema,
  numberSchema,
  objectSchema,
  recordSchema,
  refSchema,
  stringSchema,
  unionSchema,
  type InferExactSchema,
} from "@/lib/exact-schema";
import { DAMAGE_TYPE_SCHEMA } from "@/types/damage";
import { ALL_REACTION_TRIGGERS } from "@/data/types";
import type { ProficiencyToken } from "@/types/ids";
import type { ResourceSpec } from "@/types/resource";
import { LOCALES, type Locale } from "@/lib/locale";
import { DETECTION_TARGETS } from "@/lib/rules/detection-targets";

const RESOURCE_SPEC_SCHEMA = customSchema<"resource-spec", ResourceSpec>("resource-spec");

/** Inline text in every registered language (`LocaleText`): one field per locale. */
const LOCALE_TEXT_SCHEMA = objectSchema(
  Object.fromEntries(LOCALES.map((locale) => [locale, stringSchema])) as Record<
    Locale,
    typeof stringSchema
  >
);

/**
 * The one physical-payment pointer a grant on a MAGIC ITEM may carry: the id of
 * a resource declared in the owning item's `resources` catalogue block. The
 * evaluator composes the concrete per-copy payment address from the equipped
 * instance; the grant itself never embeds a physical copy id.
 */
const ITEM_RESOURCE_COST_SCHEMA = objectSchema({
  resourceId: stringSchema,
});

/** Rest cadence a tracker-backed capability recovers on. */
const REST_CADENCE_SCHEMA = unionSchema([literalSchema("long"), literalSchema("short")]);

/**
 * Item-provided cast levels and their charge costs (Wand of Magic Missiles:
 * levels 1–3 for 1–3 charges). Omit for the ordinary base-level one-charge cast.
 */
const CAST_LEVELS_SCHEMA = arraySchema(
  objectSchema({
    cost: numberSchema,
    level: numberSchema,
  })
);

/** The creature types a weapon's extra damage can be limited to. */
const RIDER_CREATURE_TYPE_SCHEMA = unionSchema([
  literalSchema("aberration"),
  literalSchema("beast"),
  literalSchema("celestial"),
  literalSchema("construct"),
  literalSchema("dragon"),
  literalSchema("elemental"),
  literalSchema("fey"),
  literalSchema("fiend"),
  literalSchema("giant"),
  literalSchema("humanoid"),
  literalSchema("monstrosity"),
  literalSchema("ooze"),
  literalSchema("plant"),
  literalSchema("undead"),
]);

const CASTING_ABILITY_SCHEMA = unionSchema([
  literalSchema("STR"),
  literalSchema("DEX"),
  literalSchema("CON"),
  literalSchema("INT"),
  literalSchema("WIS"),
  literalSchema("CHA"),
]);

const CAST_SOURCE_OVERRIDES_SCHEMA = objectSchema(
  {},
  {
    activeEffect: objectSchema(
      {
        activeKey: stringSchema,
        duration: objectSchema({
          kind: literalSchema("turn-boundary"),
          phase: unionSchema([literalSchema("turn-start"), literalSchema("turn-end")]),
          turns: numberSchema,
        }),
      },
      { minLevel: numberSchema }
    ),
    attackBonus: numberSchema,
    concentration: booleanSchema,
    maxRounds: numberSchema,
    saveDC: numberSchema,
    targetCreatureTypes: arraySchema(
      unionSchema([
        literalSchema("aberration"),
        literalSchema("beast"),
        literalSchema("celestial"),
        literalSchema("construct"),
        literalSchema("dragon"),
        literalSchema("elemental"),
        literalSchema("fey"),
        literalSchema("fiend"),
        literalSchema("giant"),
        literalSchema("humanoid"),
        literalSchema("monstrosity"),
        literalSchema("ooze"),
        literalSchema("plant"),
        literalSchema("undead"),
      ])
    ),
  }
);

const GRANT_SCHEMA_DEFINITION = discriminatedUnionSchema("type", {
  darkvision: objectSchema({
    range: numberSchema,
    type: literalSchema("darkvision"),
  }),
  "darkvision-bonus": objectSchema({
    amount: numberSchema,
    type: literalSchema("darkvision-bonus"),
  }),
  blindsight: objectSchema({
    range: numberSchema,
    type: literalSchema("blindsight"),
  }),
  tremorsense: objectSchema({
    range: numberSchema,
    type: literalSchema("tremorsense"),
  }),
  truesight: objectSchema({
    range: numberSchema,
    type: literalSchema("truesight"),
  }),
  /** See Invisible creatures and objects within `range` feet; no `range` means no
   * distance limit, only line of sight (See Invisibility). */
  "see-invisible": objectSchema(
    {
      type: literalSchema("see-invisible"),
    },
    {
      range: numberSchema,
    }
  ),
  /** Sense the presence of `what` within `range` feet (Detect Magic: magic, 30 ft). */
  detection: objectSchema({
    range: numberSchema,
    type: literalSchema("detection"),
    what: unionSchema(DETECTION_TARGETS.map((id) => literalSchema(id))),
  }),
  /** X-ray vision: solid objects within this range look transparent (Ring of X-ray Vision). */
  "x-ray": objectSchema({
    range: numberSchema,
    type: literalSchema("x-ray"),
  }),
  "air-and-water-breathing": objectSchema({
    type: literalSchema("air-and-water-breathing"),
  }),
  /** Count as one size larger for carrying capacity and push/drag/lift. */
  "carry-as-larger-size": objectSchema({
    type: literalSchema("carry-as-larger-size"),
  }),
  "damage-resistance": objectSchema({
    damageType: DAMAGE_TYPE_SCHEMA,
    type: literalSchema("damage-resistance"),
  }),
  "all-damage-resistance": objectSchema({
    type: literalSchema("all-damage-resistance"),
  }),
  "damage-transfer": objectSchema({
    to: literalSchema("effect-source"),
    type: literalSchema("damage-transfer"),
  }),
  "damage-retaliation": objectSchema(
    {
      amount: numberSchema,
      damageType: DAMAGE_TYPE_SCHEMA,
      type: literalSchema("damage-retaliation"),
    },
    {
      castLevelScaling: objectSchema({
        baseLevel: numberSchema,
        perLevel: numberSchema,
      }),
    }
  ),
  "damage-immunity": objectSchema({
    damageType: DAMAGE_TYPE_SCHEMA,
    type: literalSchema("damage-immunity"),
  }),
  "damage-vulnerability": objectSchema({
    damageType: DAMAGE_TYPE_SCHEMA,
    type: literalSchema("damage-vulnerability"),
  }),
  "condition-immunity": objectSchema(
    {
      condition: unionSchema([
        literalSchema("blinded"),
        literalSchema("charmed"),
        literalSchema("deafened"),
        literalSchema("exhaustion"),
        literalSchema("frightened"),
        literalSchema("grappled"),
        literalSchema("incapacitated"),
        literalSchema("invisible"),
        literalSchema("paralyzed"),
        literalSchema("petrified"),
        literalSchema("poisoned"),
        literalSchema("prone"),
        literalSchema("restrained"),
        literalSchema("stunned"),
        literalSchema("unconscious"),
      ]),
      type: literalSchema("condition-immunity"),
    },
    {
      sourceId: stringSchema,
    }
  ),
  /**
   * While its `while-active` state is lit, you have this condition, and ending the
   * condition ends the state (Potion of Invisibility). Read by the condition seam
   * (`effectiveSessionConditions`), never the aggregate, so a condition the state
   * gives can never feed back into the grants that compute it.
   */
  "state-condition": objectSchema({
    condition: unionSchema([
      literalSchema("blinded"),
      literalSchema("charmed"),
      literalSchema("deafened"),
      literalSchema("frightened"),
      literalSchema("grappled"),
      literalSchema("incapacitated"),
      literalSchema("invisible"),
      literalSchema("paralyzed"),
      literalSchema("petrified"),
      literalSchema("poisoned"),
      literalSchema("prone"),
      literalSchema("restrained"),
      literalSchema("stunned"),
      literalSchema("unconscious"),
    ]),
    type: literalSchema("state-condition"),
  }),
  "spellcasting-blocked": objectSchema({
    type: literalSchema("spellcasting-blocked"),
  }),
  "concentration-blocked": objectSchema({
    type: literalSchema("concentration-blocked"),
  }),
  "healing-blocked": objectSchema({
    type: literalSchema("healing-blocked"),
  }),
  "damage-resistance-source": objectSchema({
    source: unionSchema([literalSchema("spell"), literalSchema("ranged-weapon")]),
    type: literalSchema("damage-resistance-source"),
  }),
  "flat-damage-reduction": objectSchema(
    {
      amount: unionSchema([numberSchema, literalSchema("PB")]),
      damageTypes: arraySchema(DAMAGE_TYPE_SCHEMA),
      trigger: literalSchema("attack"),
      type: literalSchema("flat-damage-reduction"),
    },
    {
      condition: literalSchema("wearing-heavy-armor"),
    }
  ),
  "save-damage-rule": objectSchema(
    {
      ability: unionSchema([
        literalSchema("STR"),
        literalSchema("DEX"),
        literalSchema("CON"),
        literalSchema("INT"),
        literalSchema("WIS"),
        literalSchema("CHA"),
      ]),
      onFailure: literalSchema("half"),
      onSuccess: literalSchema("none"),
      requiresDamageOnSuccess: literalSchema("half"),
      type: literalSchema("save-damage-rule"),
    },
    {
      suppressedByConditions: arraySchema(
        unionSchema([
          literalSchema("blinded"),
          literalSchema("charmed"),
          literalSchema("deafened"),
          literalSchema("exhaustion"),
          literalSchema("frightened"),
          literalSchema("grappled"),
          literalSchema("incapacitated"),
          literalSchema("invisible"),
          literalSchema("paralyzed"),
          literalSchema("petrified"),
          literalSchema("poisoned"),
          literalSchema("prone"),
          literalSchema("restrained"),
          literalSchema("stunned"),
          literalSchema("unconscious"),
        ])
      ),
    }
  ),
  "choice-resistance": objectSchema(
    {
      amount: numberSchema,
      choiceKey: stringSchema,
      options: arraySchema(DAMAGE_TYPE_SCHEMA),
      type: literalSchema("choice-resistance"),
    },
    {
      label: LOCALE_TEXT_SCHEMA,
    }
  ),
  speed: objectSchema(
    {
      amount: numberSchema,
      type: literalSchema("speed"),
    },
    {
      condition: literalSchema("no-heavy-armor"),
      round1: booleanSchema,
    }
  ),
  "fly-speed": objectSchema({
    amount: unionSchema([
      numberSchema,
      literalSchema("equal-to-walking"),
      literalSchema("twice-walking"),
    ]),
    type: literalSchema("fly-speed"),
  }),
  "swim-speed": objectSchema({
    amount: unionSchema([
      numberSchema,
      literalSchema("equal-to-walking"),
      literalSchema("twice-walking"),
    ]),
    type: literalSchema("swim-speed"),
  }),
  "climb-speed": objectSchema({
    amount: unionSchema([
      numberSchema,
      literalSchema("equal-to-walking"),
      literalSchema("twice-walking"),
    ]),
    type: literalSchema("climb-speed"),
  }),
  "speed-multiplier": objectSchema({
    factor: numberSchema,
    type: literalSchema("speed-multiplier"),
  }),
  "speed-floor": objectSchema({
    minFt: numberSchema,
    type: literalSchema("speed-floor"),
  }),
  "speed-cap": objectSchema({
    maxFt: numberSchema,
    type: literalSchema("speed-cap"),
  }),
  "ac-bonus": objectSchema(
    {
      type: literalSchema("ac-bonus"),
    },
    {
      ability: unionSchema([
        literalSchema("STR"),
        literalSchema("DEX"),
        literalSchema("CON"),
        literalSchema("INT"),
        literalSchema("WIS"),
        literalSchema("CHA"),
      ]),
      amount: numberSchema,
      /** Holds only while wearing no armor and no shield (Bracers of Defense), or
       *  only while wearing Light/Medium/Heavy armor (Defense fighting style). */
      condition: unionSchema([
        literalSchema("no-armor-no-shield"),
        literalSchema("armored"),
      ]),
      min: numberSchema,
    }
  ),
  "hp-per-level": objectSchema({
    amount: numberSchema,
    type: literalSchema("hp-per-level"),
  }),
  "ability-score": objectSchema(
    {
      ability: unionSchema([
        literalSchema("STR"),
        literalSchema("DEX"),
        literalSchema("CON"),
        literalSchema("INT"),
        literalSchema("WIS"),
        literalSchema("CHA"),
      ]),
      amount: numberSchema,
      type: literalSchema("ability-score"),
    },
    {
      cap: numberSchema,
    }
  ),
  "crit-range": objectSchema({
    threshold: numberSchema,
    type: literalSchema("crit-range"),
  }),
  "death-save-crit-range": objectSchema({
    threshold: numberSchema,
    type: literalSchema("death-save-crit-range"),
  }),
  "regen-at-turn-start": objectSchema(
    {
      amount: unionSchema([
        stringSchema,
        objectSchema({
          binding: literalSchema("spellcastingModifier"),
        }),
      ]),
      condition: unionSchema([literalSchema("bloodied"), literalSchema("always")]),
      type: literalSchema("regen-at-turn-start"),
    },
    {
      asTempHp: booleanSchema,
      requiresMinHp: booleanSchema,
    }
  ),
  "on-crit-movement-rider": objectSchema(
    {
      fraction: unionSchema([literalSchema("half"), literalSchema("full")]),
      type: literalSchema("on-crit-movement-rider"),
    },
    {
      ignoresOpportunityAttacks: booleanSchema,
    }
  ),
  "replace-attack-with-cast": objectSchema(
    {
      attacks: numberSchema,
      castTime: literalSchema("action"),
      classSpellList: stringSchema,
      maxSpellLevel: numberSchema,
      type: literalSchema("replace-attack-with-cast"),
    },
    {
      minSpellLevel: numberSchema,
    }
  ),
  "unarmed-strike-die": objectSchema(
    {
      damageType: DAMAGE_TYPE_SCHEMA,
      die: stringSchema,
      type: literalSchema("unarmed-strike-die"),
    },
    {
      // "spellcasting": the ability of the spell that grants it (Alter Self).
      attackAbility: unionSchema([
        literalSchema("STR"),
        literalSchema("DEX"),
        literalSchema("CON"),
        literalSchema("INT"),
        literalSchema("WIS"),
        literalSchema("CHA"),
        literalSchema("spellcasting"),
      ]),
      damageAbility: unionSchema([
        literalSchema("STR"),
        literalSchema("DEX"),
        literalSchema("CON"),
        literalSchema("INT"),
        literalSchema("WIS"),
        literalSchema("CHA"),
        literalSchema("spellcasting"),
      ]),
    }
  ),
  "weapon-reach-bonus": objectSchema(
    {
      appliesTo: unionSchema([
        literalSchema("heavy-or-versatile"),
        literalSchema("all-melee"),
      ]),
      bonusFt: numberSchema,
      type: literalSchema("weapon-reach-bonus"),
    },
    {
      extraMasteries: arraySchema(stringSchema),
    }
  ),
  /**
   * Expend a spell slot to recover uses of a tracker (Bard Font of
   * Inspiration). `usesPerSlot` defaults to 1 in the aggregate.
   */
  "spell-slot-tracker-recovery": objectSchema(
    {
      trackerId: stringSchema,
      type: literalSchema("spell-slot-tracker-recovery"),
    },
    {
      usesPerSlot: numberSchema,
    }
  ),
  /**
   * Top a tracker back UP to a floor when Initiative is rolled (Bard Superior
   * Inspiration). `upTo` only raises — never reduces a higher count.
   */
  "initiative-tracker-topup": objectSchema({
    trackerId: stringSchema,
    type: literalSchema("initiative-tracker-topup"),
    upTo: numberSchema,
  }),
  "extra-attack": objectSchema({
    count: numberSchema,
    type: literalSchema("extra-attack"),
  }),
  "extra-action": objectSchema(
    {
      count: numberSchema,
      slot: unionSchema([literalSchema("action"), literalSchema("bonus")]),
      type: literalSchema("extra-action"),
    },
    {
      allowedActions: arraySchema(
        unionSchema([
          literalSchema("attack"),
          literalSchema("dash"),
          literalSchema("disengage"),
          literalSchema("hide"),
          literalSchema("utilize"),
        ])
      ),
      maxAttacks: numberSchema,
    }
  ),
  "turn-economy-block": objectSchema({
    type: literalSchema("turn-economy-block"),
  }),
  "heroic-inspiration-at-turn-start": objectSchema({
    type: literalSchema("heroic-inspiration-at-turn-start"),
  }),
  "heroic-inspiration-on-rest": objectSchema({
    type: literalSchema("heroic-inspiration-on-rest"),
  }),
  /**
   * At-0-HP interrupt: when the character would drop to 0 HP they may instead
   * drop to 1, debiting the named 1/rest tracker (Orc Relentless Endurance).
   */
  "at-zero-hp-interrupt": objectSchema({
    trackerId: stringSchema,
    type: literalSchema("at-zero-hp-interrupt"),
  }),
  "zero-hp-floor": objectSchema({
    hitPoints: numberSchema,
    type: literalSchema("zero-hp-floor"),
  }),
  "hp-flat": objectSchema(
    {
      amount: numberSchema,
      type: literalSchema("hp-flat"),
    },
    {
      adjustsCurrentHp: booleanSchema,
      castLevelScaling: objectSchema({
        baseLevel: numberSchema,
        perLevel: numberSchema,
      }),
    }
  ),
  "attunement-slots": objectSchema({
    amount: numberSchema,
    type: literalSchema("attunement-slots"),
  }),
  /**
   * EXTRA Exhaustion levels removed on a rest. `"long-rest"` (default) adds
   * beyond the default 1 removed on a Long Rest (Monk Self-Restoration);
   * `"short-rest"` is a genuine extra channel (Ranger Tireless). The two
   * channels aggregate into separate fields and never mix.
   */
  "exhaustion-recovery": objectSchema(
    {
      amount: numberSchema,
      type: literalSchema("exhaustion-recovery"),
    },
    {
      recovery: unionSchema([literalSchema("long-rest"), literalSchema("short-rest")]),
    }
  ),
  /** Declare a reusable pool once; actions, casts, and effects only select it. */
  resource: objectSchema({
    spec: RESOURCE_SPEC_SCHEMA,
    type: literalSchema("resource"),
  }),
  "ability-score-set": objectSchema({
    ability: unionSchema([
      literalSchema("STR"),
      literalSchema("DEX"),
      literalSchema("CON"),
      literalSchema("INT"),
      literalSchema("WIS"),
      literalSchema("CHA"),
    ]),
    type: literalSchema("ability-score-set"),
    value: numberSchema,
  }),
  "ac-formula": objectSchema(
    {
      base: numberSchema,
      bonuses: arraySchema(
        unionSchema([
          literalSchema("STR"),
          literalSchema("DEX"),
          literalSchema("CON"),
          literalSchema("INT"),
          literalSchema("WIS"),
          literalSchema("CHA"),
        ])
      ),
      condition: unionSchema([
        literalSchema("always"),
        literalSchema("no-armor"),
        literalSchema("no-armor-no-shield"),
        literalSchema("while-active"),
      ]),
      type: literalSchema("ac-formula"),
    },
    {
      shieldBonus: numberSchema,
    }
  ),
  "medium-armor-dex-cap": objectSchema(
    {
      cap: numberSchema,
      type: literalSchema("medium-armor-dex-cap"),
    },
    {
      minDex: numberSchema,
    }
  ),
  "choice-ability-score": objectSchema(
    {
      abilities: arraySchema(
        unionSchema([
          literalSchema("STR"),
          literalSchema("DEX"),
          literalSchema("CON"),
          literalSchema("INT"),
          literalSchema("WIS"),
          literalSchema("CHA"),
        ])
      ),
      amount: numberSchema,
      type: literalSchema("choice-ability-score"),
    },
    {
      cap: numberSchema,
    }
  ),
  "choice-skill-proficiency": objectSchema({
    amount: numberSchema,
    options: arraySchema(stringSchema),
    type: literalSchema("choice-skill-proficiency"),
  }),
  "choice-expertise": objectSchema({
    amount: numberSchema,
    type: literalSchema("choice-expertise"),
  }),
  "choice-skill-or-tool-proficiency": objectSchema({
    amount: numberSchema,
    type: literalSchema("choice-skill-or-tool-proficiency"),
  }),
  "choice-language": objectSchema({
    amount: numberSchema,
    options: arraySchema(stringSchema),
    type: literalSchema("choice-language"),
  }),
  "choice-tool-proficiency": objectSchema({
    amount: numberSchema,
    options: arraySchema(stringSchema),
    type: literalSchema("choice-tool-proficiency"),
  }),
  "choice-cantrip": objectSchema(
    {
      amount: numberSchema,
      type: literalSchema("choice-cantrip"),
    },
    {
      classSpellList: unionSchema([
        literalSchema("artificer"),
        literalSchema("barbarian"),
        literalSchema("bard"),
        literalSchema("cleric"),
        literalSchema("druid"),
        literalSchema("fighter"),
        literalSchema("monk"),
        literalSchema("paladin"),
        literalSchema("ranger"),
        literalSchema("rogue"),
        literalSchema("sorcerer"),
        literalSchema("warlock"),
        literalSchema("wizard"),
      ]),
      spellAbility: unionSchema([
        literalSchema("STR"),
        literalSchema("DEX"),
        literalSchema("CON"),
        literalSchema("INT"),
        literalSchema("WIS"),
        literalSchema("CHA"),
      ]),
      spellAbilityChoice: arraySchema(
        unionSchema([
          literalSchema("STR"),
          literalSchema("DEX"),
          literalSchema("CON"),
          literalSchema("INT"),
          literalSchema("WIS"),
          literalSchema("CHA"),
        ])
      ),
    }
  ),
  "choice-spell": objectSchema(
    {
      amount: numberSchema,
      maxLevel: numberSchema,
      type: literalSchema("choice-spell"),
    },
    {
      classSpellList: unionSchema([
        literalSchema("artificer"),
        literalSchema("barbarian"),
        literalSchema("bard"),
        literalSchema("cleric"),
        literalSchema("druid"),
        literalSchema("fighter"),
        literalSchema("monk"),
        literalSchema("paladin"),
        literalSchema("ranger"),
        literalSchema("rogue"),
        literalSchema("sorcerer"),
        literalSchema("warlock"),
        literalSchema("wizard"),
      ]),
      classSpellLists: arraySchema(
        unionSchema([
          literalSchema("artificer"),
          literalSchema("barbarian"),
          literalSchema("bard"),
          literalSchema("cleric"),
          literalSchema("druid"),
          literalSchema("fighter"),
          literalSchema("monk"),
          literalSchema("paladin"),
          literalSchema("ranger"),
          literalSchema("rogue"),
          literalSchema("sorcerer"),
          literalSchema("warlock"),
          literalSchema("wizard"),
        ])
      ),
      /**
       * When set, every spell picked through this slot is also free-castable
       * via the named feature's tracker (a free-cast heritage feat → 1/Long Rest
       * slotless cast of the chosen spell). The choice resolver stamps it onto
       * the spell ref's `freeCastSource`.
       */
      freeCastSource: objectSchema({
        rest: REST_CADENCE_SCHEMA,
        sourceId: stringSchema,
        usesPerRest: numberSchema,
      }),
      recurringPerSpellLevel: unionSchema([
        literalSchema("artificer"),
        literalSchema("barbarian"),
        literalSchema("bard"),
        literalSchema("cleric"),
        literalSchema("druid"),
        literalSchema("fighter"),
        literalSchema("monk"),
        literalSchema("paladin"),
        literalSchema("ranger"),
        literalSchema("rogue"),
        literalSchema("sorcerer"),
        literalSchema("warlock"),
        literalSchema("wizard"),
      ]),
      ritualOnly: booleanSchema,
      spellAbility: unionSchema([
        literalSchema("STR"),
        literalSchema("DEX"),
        literalSchema("CON"),
        literalSchema("INT"),
        literalSchema("WIS"),
        literalSchema("CHA"),
      ]),
      spellAbilityChoice: arraySchema(
        unionSchema([
          literalSchema("STR"),
          literalSchema("DEX"),
          literalSchema("CON"),
          literalSchema("INT"),
          literalSchema("WIS"),
          literalSchema("CHA"),
        ])
      ),
      spellSchool: unionSchema([
        literalSchema("abjuration"),
        literalSchema("conjuration"),
        literalSchema("divination"),
        literalSchema("enchantment"),
        literalSchema("evocation"),
        literalSchema("illusion"),
        literalSchema("necromancy"),
        literalSchema("transmutation"),
      ]),
      spellSchools: arraySchema(
        unionSchema([
          literalSchema("abjuration"),
          literalSchema("conjuration"),
          literalSchema("divination"),
          literalSchema("enchantment"),
          literalSchema("evocation"),
          literalSchema("illusion"),
          literalSchema("necromancy"),
          literalSchema("transmutation"),
        ])
      ),
      toSpellbook: booleanSchema,
    }
  ),
  "choice-feat": objectSchema({
    amount: numberSchema,
    category: unionSchema([
      literalSchema("origin"),
      literalSchema("general"),
      literalSchema("fighting-style"),
      literalSchema("epic-boon"),
      literalSchema("heritage"),
      literalSchema("planar-pact"),
      literalSchema("dark-gift"),
    ]),
    type: literalSchema("choice-feat"),
  }),
  "weapon-attack-ability": objectSchema(
    {
      ability: unionSchema([
        literalSchema("STR"),
        literalSchema("DEX"),
        literalSchema("CON"),
        literalSchema("INT"),
        literalSchema("WIS"),
        literalSchema("CHA"),
      ]),
      type: literalSchema("weapon-attack-ability"),
    },
    {
      dieUpgrade: stringSchema,
      magicOnly: booleanSchema,
      weaponScope: literalSchema("monk-melee"),
    }
  ),
  "weapon-attack-bonus": objectSchema({
    amount: unionSchema([
      numberSchema,
      objectSchema(
        {
          ability: unionSchema([
            literalSchema("STR"),
            literalSchema("DEX"),
            literalSchema("CON"),
            literalSchema("INT"),
            literalSchema("WIS"),
            literalSchema("CHA"),
          ]),
        },
        {
          min: numberSchema,
        }
      ),
    ]),
    scope: unionSchema([
      literalSchema("any"),
      literalSchema("ranged"),
      literalSchema("melee"),
    ]),
    type: literalSchema("weapon-attack-bonus"),
  }),
  "weapon-damage-bonus": objectSchema(
    {
      scope: unionSchema([
        literalSchema("any"),
        literalSchema("ranged"),
        literalSchema("melee"),
        literalSchema("strength"),
        literalSchema("heavy"),
      ]),
      type: literalSchema("weapon-damage-bonus"),
    },
    {
      amount: unionSchema([numberSchema, literalSchema("PB")]),
      sourceKey: stringSchema,
    }
  ),
  "save-proficiency": objectSchema({
    ability: unionSchema([
      literalSchema("STR"),
      literalSchema("DEX"),
      literalSchema("CON"),
      literalSchema("INT"),
      literalSchema("WIS"),
      literalSchema("CHA"),
    ]),
    type: literalSchema("save-proficiency"),
  }),
  "skill-proficiency": objectSchema({
    skill: stringSchema,
    type: literalSchema("skill-proficiency"),
  }),
  expertise: objectSchema({
    skill: stringSchema,
    type: literalSchema("expertise"),
  }),
  "half-proficiency-all-skills": objectSchema({
    type: literalSchema("half-proficiency-all-skills"),
  }),
  language: objectSchema({
    language: stringSchema,
    type: literalSchema("language"),
  }),
  "tool-proficiency": objectSchema({
    tool: stringSchema,
    type: literalSchema("tool-proficiency"),
  }),
  "weapon-proficiency": objectSchema({
    proficiency: customSchema<"proficiency-token", ProficiencyToken>("proficiency-token"),
    type: literalSchema("weapon-proficiency"),
  }),
  "armor-proficiency": objectSchema({
    proficiency: customSchema<"proficiency-token", ProficiencyToken>("proficiency-token"),
    type: literalSchema("armor-proficiency"),
  }),
  "always-prepared-spell": objectSchema(
    {
      spellId: stringSchema,
      type: literalSchema("always-prepared-spell"),
    },
    {
      minLevel: numberSchema,
      spellAbility: unionSchema([
        literalSchema("STR"),
        literalSchema("DEX"),
        literalSchema("CON"),
        literalSchema("INT"),
        literalSchema("WIS"),
        literalSchema("CHA"),
      ]),
      spellAbilitySource: literalSchema("species"),
    }
  ),
  /**
   * One fixed slotless cast, bounded N×/rest. Two payment dialects: a
   * tracker-backed capability (`chargesPerRest` + `rest` — feats, race traits,
   * class features), or a typed physical item's declared resource
   * (`resourceCost` — the evaluator composes the exact per-copy payment from
   * the equipped instance). Exactly one dialect is authored per grant.
   */
  "free-cast-spell": objectSchema(
    {
      spellId: stringSchema,
      type: literalSchema("free-cast-spell"),
    },
    {
      /** The cadence is known, but its recovered amount requires table input. */
      autoRecover: literalSchema(false),
      /** Level-gated capacity steps; the highest eligible `minLevel` wins. */
      capacityByLevel: arraySchema(
        objectSchema(
          {
            chargesPerRest: numberSchema,
            minLevel: numberSchema,
          },
          {
            chargesFormula: stringSchema,
          }
        )
      ),
      castLevels: CAST_LEVELS_SCHEMA,
      castOverrides: CAST_SOURCE_OVERRIDES_SCHEMA,
      casterAbility: CASTING_ABILITY_SCHEMA,
      /** Scaled charge count ("PB", "WIS", …); overrides `chargesPerRest`. */
      chargesFormula: stringSchema,
      chargesPerRest: numberSchema,
      /** Fixed partial amount recovered at the rest/dawn boundary. */
      longRestRecovery: numberSchema,
      minLevel: numberSchema,
      resourceCost: ITEM_RESOURCE_COST_SCHEMA,
      rest: REST_CADENCE_SCHEMA,
    }
  ),
  /**
   * A slotless cast chosen from a class list or stable fixed spell set. The
   * same two payment dialects as `free-cast-spell`: a shared tracker
   * (`trackerId`, defaulting to the source feature) or a typed physical item
   * resource (`resourceCost`).
   */
  "free-cast-from-list": objectSchema(
    {
      type: literalSchema("free-cast-from-list"),
    },
    {
      /** The cadence is known, but its recovered amount requires table input. */
      autoRecover: literalSchema(false),
      castOverrides: CAST_SOURCE_OVERRIDES_SCHEMA,
      casterAbility: CASTING_ABILITY_SCHEMA,
      /** Per-rest cap; omit to infer it from the debited tracker's total. */
      chargesPerRest: numberSchema,
      /** Fixed partial amount recovered at the rest/dawn boundary. */
      longRestRecovery: numberSchema,
      maxSpellLevel: numberSchema,
      resourceCost: ITEM_RESOURCE_COST_SCHEMA,
      rest: REST_CADENCE_SCHEMA,
      /** Per-spell charge costs (spellId → charges); absent spells cost 1. */
      spellCosts: recordSchema("string", numberSchema),
      spellIds: arraySchema(stringSchema),
      spellList: stringSchema,
      /** The tracker id to debit per use; defaults to the source feature id. */
      trackerId: stringSchema,
    }
  ),
  "at-will-cast-spell": objectSchema(
    {
      spellId: stringSchema,
      type: literalSchema("at-will-cast-spell"),
    },
    {
      autoMaxTempHpFormula: stringSchema,
      casterAbility: unionSchema([
        literalSchema("STR"),
        literalSchema("DEX"),
        literalSchema("CON"),
        literalSchema("INT"),
        literalSchema("WIS"),
        literalSchema("CHA"),
      ]),
    }
  ),
  "ritual-casting": objectSchema({
    spellId: stringSchema,
    type: literalSchema("ritual-casting"),
  }),
  "ritual-casting-any": objectSchema({
    classSpellList: unionSchema([
      literalSchema("artificer"),
      literalSchema("barbarian"),
      literalSchema("bard"),
      literalSchema("cleric"),
      literalSchema("druid"),
      literalSchema("fighter"),
      literalSchema("monk"),
      literalSchema("paladin"),
      literalSchema("ranger"),
      literalSchema("rogue"),
      literalSchema("sorcerer"),
      literalSchema("warlock"),
      literalSchema("wizard"),
    ]),
    type: literalSchema("ritual-casting-any"),
  }),
  "scoped-extra-spell-slot": objectSchema({
    levelFormula: unionSchema([
      objectSchema({
        cap: numberSchema,
        kind: literalSchema("half-level-round-up"),
      }),
      objectSchema({
        kind: literalSchema("fixed"),
        level: numberSchema,
      }),
    ]),
    /** Rest cadence the 1-use slot regains on (the smart-tracker's counter). */
    recovery: unionSchema([
      literalSchema("short-or-long"),
      literalSchema("short"),
      literalSchema("long"),
    ]),
    scope: literalSchema("heritage-feat-spells"),
    type: literalSchema("scoped-extra-spell-slot"),
  }),
  "spell-save-dc-bonus": objectSchema({
    amount: numberSchema,
    scope: unionSchema([
      literalSchema("artificer"),
      literalSchema("barbarian"),
      literalSchema("bard"),
      literalSchema("cleric"),
      literalSchema("druid"),
      literalSchema("fighter"),
      literalSchema("monk"),
      literalSchema("paladin"),
      literalSchema("ranger"),
      literalSchema("rogue"),
      literalSchema("sorcerer"),
      literalSchema("warlock"),
      literalSchema("wizard"),
      literalSchema("all"),
    ]),
    type: literalSchema("spell-save-dc-bonus"),
  }),
  "spell-attack-bonus": objectSchema({
    amount: numberSchema,
    scope: unionSchema([
      literalSchema("artificer"),
      literalSchema("barbarian"),
      literalSchema("bard"),
      literalSchema("cleric"),
      literalSchema("druid"),
      literalSchema("fighter"),
      literalSchema("monk"),
      literalSchema("paladin"),
      literalSchema("ranger"),
      literalSchema("rogue"),
      literalSchema("sorcerer"),
      literalSchema("warlock"),
      literalSchema("wizard"),
      literalSchema("all"),
    ]),
    type: literalSchema("spell-attack-bonus"),
  }),
  "save-bonus": objectSchema(
    {
      type: literalSchema("save-bonus"),
    },
    {
      ability: unionSchema([
        literalSchema("STR"),
        literalSchema("DEX"),
        literalSchema("CON"),
        literalSchema("INT"),
        literalSchema("WIS"),
        literalSchema("CHA"),
      ]),
      amount: numberSchema,
      appliesToSave: unionSchema([
        literalSchema("STR"),
        literalSchema("DEX"),
        literalSchema("CON"),
        literalSchema("INT"),
        literalSchema("WIS"),
        literalSchema("CHA"),
      ]),
      min: numberSchema,
      suppressedByConditions: arraySchema(
        unionSchema([
          literalSchema("blinded"),
          literalSchema("charmed"),
          literalSchema("deafened"),
          literalSchema("exhaustion"),
          literalSchema("frightened"),
          literalSchema("grappled"),
          literalSchema("incapacitated"),
          literalSchema("invisible"),
          literalSchema("paralyzed"),
          literalSchema("petrified"),
          literalSchema("poisoned"),
          literalSchema("prone"),
          literalSchema("restrained"),
          literalSchema("stunned"),
          literalSchema("unconscious"),
        ])
      ),
    }
  ),
  "concentration-save-bonus": objectSchema(
    {
      type: literalSchema("concentration-save-bonus"),
    },
    {
      ability: unionSchema([
        literalSchema("STR"),
        literalSchema("DEX"),
        literalSchema("CON"),
        literalSchema("INT"),
        literalSchema("WIS"),
        literalSchema("CHA"),
      ]),
      amount: numberSchema,
      min: numberSchema,
    }
  ),
  "ability-check-bonus": objectSchema(
    {
      appliesTo: stringSchema,
      type: literalSchema("ability-check-bonus"),
    },
    {
      ability: unionSchema([
        literalSchema("STR"),
        literalSchema("DEX"),
        literalSchema("CON"),
        literalSchema("INT"),
        literalSchema("WIS"),
        literalSchema("CHA"),
      ]),
      min: numberSchema,
      value: unionSchema([numberSchema, literalSchema("modifier")]),
    }
  ),
  "skill-ability-option": objectSchema({
    ability: unionSchema([
      literalSchema("STR"),
      literalSchema("DEX"),
      literalSchema("CON"),
      literalSchema("INT"),
      literalSchema("WIS"),
      literalSchema("CHA"),
    ]),
    skills: arraySchema(stringSchema),
    type: literalSchema("skill-ability-option"),
  }),
  "initiative-bonus": objectSchema(
    {
      type: literalSchema("initiative-bonus"),
    },
    {
      ability: unionSchema([
        literalSchema("STR"),
        literalSchema("DEX"),
        literalSchema("CON"),
        literalSchema("INT"),
        literalSchema("WIS"),
        literalSchema("CHA"),
      ]),
      amount: numberSchema,
    }
  ),
  /**
   * Display-side extra damage attached to a qualifying hit. A rider has either
   * one fixed/weapon-derived damage type or a non-empty per-hit choice, never
   * both; the schema branches encode that exclusivity directly.
   */
  "damage-rider": unionSchema([
    objectSchema(
      {
        appliesTo: unionSchema([
          literalSchema("melee-weapon"),
          literalSchema("weapon"),
          literalSchema("weapon-or-unarmed"),
          literalSchema("unarmed"),
          literalSchema("finesse-or-ranged-weapon"),
          literalSchema("one-handed-melee"),
          literalSchema("attack-or-spell"),
        ]),
        damageType: unionSchema([DAMAGE_TYPE_SCHEMA, literalSchema("same-as-weapon")]),
        type: literalSchema("damage-rider"),
      },
      {
        addAbilityMod: unionSchema([
          literalSchema("STR"),
          literalSchema("DEX"),
          literalSchema("CON"),
          literalSchema("INT"),
          literalSchema("WIS"),
          literalSchema("CHA"),
        ]),
        amount: unionSchema([
          literalSchema("PB"),
          objectSchema({
            classId: unionSchema([
              literalSchema("artificer"),
              literalSchema("barbarian"),
              literalSchema("bard"),
              literalSchema("cleric"),
              literalSchema("druid"),
              literalSchema("fighter"),
              literalSchema("monk"),
              literalSchema("paladin"),
              literalSchema("ranger"),
              literalSchema("rogue"),
              literalSchema("sorcerer"),
              literalSchema("warlock"),
              literalSchema("wizard"),
            ]),
            kind: literalSchema("class-level"),
          }),
        ]),
        dice: stringSchema,
        diceByLevel: recordSchema("number", stringSchema),
        oncePerTurn: booleanSchema,
        /** Gate: the rider is offered only while this tracker has an unspent use. */
        requiresRiderTrackerId: stringSchema,
        /** Each use spends one unit of this tracker (Psionic Energy Dice). */
        resourceCost: objectSchema({
          trackerId: stringSchema,
        }),
        round1: literalSchema(true),
        vsMarkedTarget: unionSchema([literalSchema("marked"), literalSchema("cursed")]),
      }
    ),
    objectSchema(
      {
        appliesTo: unionSchema([
          literalSchema("melee-weapon"),
          literalSchema("weapon"),
          literalSchema("weapon-or-unarmed"),
          literalSchema("unarmed"),
          literalSchema("finesse-or-ranged-weapon"),
          literalSchema("one-handed-melee"),
          literalSchema("attack-or-spell"),
        ]),
        damageTypeChoices: arraySchema(DAMAGE_TYPE_SCHEMA, 1),
        type: literalSchema("damage-rider"),
      },
      {
        addAbilityMod: unionSchema([
          literalSchema("STR"),
          literalSchema("DEX"),
          literalSchema("CON"),
          literalSchema("INT"),
          literalSchema("WIS"),
          literalSchema("CHA"),
        ]),
        amount: unionSchema([
          literalSchema("PB"),
          objectSchema({
            classId: unionSchema([
              literalSchema("artificer"),
              literalSchema("barbarian"),
              literalSchema("bard"),
              literalSchema("cleric"),
              literalSchema("druid"),
              literalSchema("fighter"),
              literalSchema("monk"),
              literalSchema("paladin"),
              literalSchema("ranger"),
              literalSchema("rogue"),
              literalSchema("sorcerer"),
              literalSchema("warlock"),
              literalSchema("wizard"),
            ]),
            kind: literalSchema("class-level"),
          }),
        ]),
        dice: stringSchema,
        diceByLevel: recordSchema("number", stringSchema),
        oncePerTurn: booleanSchema,
        /** Gate: the rider is offered only while this tracker has an unspent use. */
        requiresRiderTrackerId: stringSchema,
        /** Each use spends one unit of this tracker (Psionic Energy Dice). */
        resourceCost: objectSchema({
          trackerId: stringSchema,
        }),
        round1: literalSchema(true),
        vsMarkedTarget: unionSchema([literalSchema("marked"), literalSchema("cursed")]),
      }
    ),
  ]),
  "spell-damage-bonus": objectSchema(
    {
      damageTypes: arraySchema(DAMAGE_TYPE_SCHEMA),
      type: literalSchema("spell-damage-bonus"),
    },
    {
      ability: unionSchema([
        literalSchema("STR"),
        literalSchema("DEX"),
        literalSchema("CON"),
        literalSchema("INT"),
        literalSchema("WIS"),
        literalSchema("CHA"),
      ]),
      cantripOnly: booleanSchema,
      min: numberSchema,
      oncePerTurn: booleanSchema,
      schools: arraySchema(stringSchema),
      scope: unionSchema([
        literalSchema("artificer"),
        literalSchema("barbarian"),
        literalSchema("bard"),
        literalSchema("cleric"),
        literalSchema("druid"),
        literalSchema("fighter"),
        literalSchema("monk"),
        literalSchema("paladin"),
        literalSchema("ranger"),
        literalSchema("rogue"),
        literalSchema("sorcerer"),
        literalSchema("warlock"),
        literalSchema("wizard"),
        literalSchema("all"),
      ]),
      value: unionSchema([numberSchema, literalSchema("modifier")]),
    }
  ),
  "spell-damage-outcome": objectSchema(
    {
      type: literalSchema("spell-damage-outcome"),
    },
    {
      cantripOnly: booleanSchema,
      damageOnMiss: literalSchema("half"),
      damageOnSave: literalSchema("half"),
      scope: unionSchema([
        literalSchema("artificer"),
        literalSchema("barbarian"),
        literalSchema("bard"),
        literalSchema("cleric"),
        literalSchema("druid"),
        literalSchema("fighter"),
        literalSchema("monk"),
        literalSchema("paladin"),
        literalSchema("ranger"),
        literalSchema("rogue"),
        literalSchema("sorcerer"),
        literalSchema("warlock"),
        literalSchema("wizard"),
        literalSchema("all"),
      ]),
    }
  ),
  "heal-bonus": objectSchema(
    {
      amount: numberSchema,
      type: literalSchema("heal-bonus"),
    },
    {
      minSpellLevel: numberSchema,
      perSpellLevel: booleanSchema,
      scope: unionSchema([
        literalSchema("artificer"),
        literalSchema("barbarian"),
        literalSchema("bard"),
        literalSchema("cleric"),
        literalSchema("druid"),
        literalSchema("fighter"),
        literalSchema("monk"),
        literalSchema("paladin"),
        literalSchema("ranger"),
        literalSchema("rogue"),
        literalSchema("sorcerer"),
        literalSchema("warlock"),
        literalSchema("wizard"),
        literalSchema("all"),
      ]),
    }
  ),
  "self-heal-on-other": objectSchema(
    {
      amount: numberSchema,
      type: literalSchema("self-heal-on-other"),
    },
    {
      minSpellLevel: numberSchema,
      perSpellLevel: booleanSchema,
      scope: unionSchema([
        literalSchema("artificer"),
        literalSchema("barbarian"),
        literalSchema("bard"),
        literalSchema("cleric"),
        literalSchema("druid"),
        literalSchema("fighter"),
        literalSchema("monk"),
        literalSchema("paladin"),
        literalSchema("ranger"),
        literalSchema("rogue"),
        literalSchema("sorcerer"),
        literalSchema("warlock"),
        literalSchema("wizard"),
        literalSchema("all"),
      ]),
    }
  ),
  "maximize-spell-healing": objectSchema(
    {
      type: literalSchema("maximize-spell-healing"),
    },
    {
      minSpellLevel: numberSchema,
      scope: unionSchema([
        literalSchema("artificer"),
        literalSchema("barbarian"),
        literalSchema("bard"),
        literalSchema("cleric"),
        literalSchema("druid"),
        literalSchema("fighter"),
        literalSchema("monk"),
        literalSchema("paladin"),
        literalSchema("ranger"),
        literalSchema("rogue"),
        literalSchema("sorcerer"),
        literalSchema("warlock"),
        literalSchema("wizard"),
        literalSchema("all"),
      ]),
    }
  ),
  "spell-damage-type-override": objectSchema(
    {
      toType: DAMAGE_TYPE_SCHEMA,
      type: literalSchema("spell-damage-type-override"),
    },
    {
      scope: unionSchema([
        literalSchema("artificer"),
        literalSchema("barbarian"),
        literalSchema("bard"),
        literalSchema("cleric"),
        literalSchema("druid"),
        literalSchema("fighter"),
        literalSchema("monk"),
        literalSchema("paladin"),
        literalSchema("ranger"),
        literalSchema("rogue"),
        literalSchema("sorcerer"),
        literalSchema("warlock"),
        literalSchema("wizard"),
        literalSchema("all"),
      ]),
    }
  ),
  "unarmed-strike-damage-type-option": objectSchema({
    toType: DAMAGE_TYPE_SCHEMA,
    type: literalSchema("unarmed-strike-damage-type-option"),
  }),
  "component-waiver": objectSchema(
    {
      type: literalSchema("component-waiver"),
      waive: arraySchema(
        unionSchema([literalSchema("v"), literalSchema("s"), literalSchema("m")])
      ),
    },
    {
      schools: arraySchema(stringSchema),
      scope: unionSchema([
        literalSchema("artificer"),
        literalSchema("barbarian"),
        literalSchema("bard"),
        literalSchema("cleric"),
        literalSchema("druid"),
        literalSchema("fighter"),
        literalSchema("monk"),
        literalSchema("paladin"),
        literalSchema("ranger"),
        literalSchema("rogue"),
        literalSchema("sorcerer"),
        literalSchema("warlock"),
        literalSchema("wizard"),
        literalSchema("all"),
      ]),
    }
  ),
  "cantrip-damage-bonus": objectSchema(
    {
      type: literalSchema("cantrip-damage-bonus"),
    },
    {
      ability: unionSchema([
        literalSchema("STR"),
        literalSchema("DEX"),
        literalSchema("CON"),
        literalSchema("INT"),
        literalSchema("WIS"),
        literalSchema("CHA"),
      ]),
      choiceKey: stringSchema,
      defaultSpellId: stringSchema,
      min: numberSchema,
      spellId: stringSchema,
      value: unionSchema([numberSchema, literalSchema("modifier")]),
    }
  ),
  "cantrip-effect-rider": objectSchema(
    {
      direction: unionSchema([literalSchema("push"), literalSchema("pull")]),
      distanceFt: numberSchema,
      effect: literalSchema("forced-movement"),
      maxTargetSize: unionSchema([
        literalSchema("Tiny"),
        literalSchema("Small"),
        literalSchema("Medium"),
        literalSchema("Large"),
        literalSchema("Huge"),
        literalSchema("Gargantuan"),
      ]),
      type: literalSchema("cantrip-effect-rider"),
    },
    {
      choiceKey: stringSchema,
      defaultSpellId: stringSchema,
      spellId: stringSchema,
    }
  ),
  "cantrip-range-bonus": objectSchema(
    {
      bonusPerLevel: numberSchema,
      scalesWith: unionSchema([
        literalSchema("artificer"),
        literalSchema("barbarian"),
        literalSchema("bard"),
        literalSchema("cleric"),
        literalSchema("druid"),
        literalSchema("fighter"),
        literalSchema("monk"),
        literalSchema("paladin"),
        literalSchema("ranger"),
        literalSchema("rogue"),
        literalSchema("sorcerer"),
        literalSchema("warlock"),
        literalSchema("wizard"),
      ]),
      type: literalSchema("cantrip-range-bonus"),
    },
    {
      choiceKey: stringSchema,
      defaultSpellId: stringSchema,
      spellId: stringSchema,
    }
  ),
  "weapon-attack-cantrip": objectSchema({
    damageTypeChoice: DAMAGE_TYPE_SCHEMA,
    extraDamageByLevel: recordSchema("number", stringSchema),
    extraDamageType: DAMAGE_TYPE_SCHEMA,
    spellId: stringSchema,
    type: literalSchema("weapon-attack-cantrip"),
    useSpellcastingAbility: booleanSchema,
  }),
  "damage-die-modifier": objectSchema(
    {
      appliesTo: unionSchema([
        literalSchema("weapon"),
        literalSchema("unarmed"),
        literalSchema("two-handed-melee"),
        literalSchema("light-melee"),
      ]),
      mode: unionSchema([
        literalSchema("floor"),
        literalSchema("reroll-keep-higher"),
        literalSchema("offhand-ability-mod"),
        literalSchema("unarmed-strike"),
      ]),
      type: literalSchema("damage-die-modifier"),
    },
    {
      abilityMod: unionSchema([
        literalSchema("STR"),
        literalSchema("DEX"),
        literalSchema("CON"),
        literalSchema("INT"),
        literalSchema("WIS"),
        literalSchema("CHA"),
      ]),
      baseDie: stringSchema,
      damageType: DAMAGE_TYPE_SCHEMA,
      floorBelow: numberSchema,
      floorTo: numberSchema,
      grappleDie: stringSchema,
      oncePerTurn: booleanSchema,
      unburdenedDie: stringSchema,
    }
  ),
  "advantage-on": unionSchema([
    objectSchema(
      {
        rollType: unionSchema([
          literalSchema("save"),
          literalSchema("check"),
          literalSchema("initiative"),
        ]),
        type: literalSchema("advantage-on"),
        vs: stringSchema,
      },
      {
        description: LOCALE_TEXT_SCHEMA,
        round1: booleanSchema,
        suppressedByConditions: arraySchema(
          unionSchema([
            literalSchema("blinded"),
            literalSchema("charmed"),
            literalSchema("deafened"),
            literalSchema("exhaustion"),
            literalSchema("frightened"),
            literalSchema("grappled"),
            literalSchema("incapacitated"),
            literalSchema("invisible"),
            literalSchema("paralyzed"),
            literalSchema("petrified"),
            literalSchema("poisoned"),
            literalSchema("prone"),
            literalSchema("restrained"),
            literalSchema("stunned"),
            literalSchema("unconscious"),
          ])
        ),
      }
    ),
    objectSchema(
      {
        rollType: literalSchema("attack"),
        scope: unionSchema([
          literalSchema("strength"),
          literalSchema("all"),
          literalSchema("marked"),
          literalSchema("cursed"),
          literalSchema("vowed"),
          literalSchema("missed"),
          literalSchema("untaken"),
          literalSchema("strDex"),
          literalSchema("sorcery"),
        ]),
        type: literalSchema("advantage-on"),
        vs: stringSchema,
      },
      {
        description: LOCALE_TEXT_SCHEMA,
        round1: booleanSchema,
        suppressedByConditions: arraySchema(
          unionSchema([
            literalSchema("blinded"),
            literalSchema("charmed"),
            literalSchema("deafened"),
            literalSchema("exhaustion"),
            literalSchema("frightened"),
            literalSchema("grappled"),
            literalSchema("incapacitated"),
            literalSchema("invisible"),
            literalSchema("paralyzed"),
            literalSchema("petrified"),
            literalSchema("poisoned"),
            literalSchema("prone"),
            literalSchema("restrained"),
            literalSchema("stunned"),
            literalSchema("unconscious"),
          ])
        ),
      }
    ),
  ]),
  "disadvantage-on": unionSchema([
    objectSchema(
      {
        rollType: unionSchema([
          literalSchema("save"),
          literalSchema("check"),
          literalSchema("initiative"),
        ]),
        type: literalSchema("disadvantage-on"),
        vs: stringSchema,
      },
      {
        consume: unionSchema([literalSchema("next"), literalSchema("each")]),
        description: LOCALE_TEXT_SCHEMA,
      }
    ),
    objectSchema(
      {
        rollType: literalSchema("attack"),
        scope: unionSchema([
          literalSchema("strength"),
          literalSchema("all"),
          literalSchema("marked"),
          literalSchema("cursed"),
          literalSchema("vowed"),
          literalSchema("missed"),
          literalSchema("untaken"),
          literalSchema("strDex"),
          literalSchema("sorcery"),
        ]),
        type: literalSchema("disadvantage-on"),
        vs: stringSchema,
      },
      {
        consume: unionSchema([literalSchema("next"), literalSchema("each")]),
        description: LOCALE_TEXT_SCHEMA,
      }
    ),
  ]),
  "round1-damage-double": objectSchema({
    saveAbility: unionSchema([
      literalSchema("STR"),
      literalSchema("DEX"),
      literalSchema("CON"),
      literalSchema("INT"),
      literalSchema("WIS"),
      literalSchema("CHA"),
    ]),
    saveDcAbility: unionSchema([
      literalSchema("STR"),
      literalSchema("DEX"),
      literalSchema("CON"),
      literalSchema("INT"),
      literalSchema("WIS"),
      literalSchema("CHA"),
    ]),
    type: literalSchema("round1-damage-double"),
  }),
  "roll-floor": objectSchema(
    {
      appliesTo: unionSchema([literalSchema("all"), literalSchema("proficient")]),
      floor: numberSchema,
      rollType: unionSchema([
        literalSchema("attack"),
        literalSchema("save"),
        literalSchema("check"),
      ]),
      type: literalSchema("roll-floor"),
    },
    {
      /** Only rolls of this ability (Glibness: Charisma checks). Absent = any. */
      ability: unionSchema([
        literalSchema("STR"),
        literalSchema("DEX"),
        literalSchema("CON"),
        literalSchema("INT"),
        literalSchema("WIS"),
        literalSchema("CHA"),
      ]),
      description: LOCALE_TEXT_SCHEMA,
    }
  ),
  "roll-die-adjustment": objectSchema(
    {
      consume: unionSchema([literalSchema("next"), literalSchema("each")]),
      dice: stringSchema,
      operation: unionSchema([literalSchema("add"), literalSchema("subtract")]),
      rollType: unionSchema([
        literalSchema("attack"),
        literalSchema("save"),
        literalSchema("check"),
      ]),
      type: literalSchema("roll-die-adjustment"),
    },
    {
      /** A check die scoped to one skill id (Guidance). Absent = every check. */
      appliesTo: stringSchema,
    }
  ),
  "incoming-attack-advantage": objectSchema(
    {
      type: literalSchema("incoming-attack-advantage"),
    },
    {
      description: LOCALE_TEXT_SCHEMA,
    }
  ),
  "incoming-attack-disadvantage": objectSchema(
    {
      type: literalSchema("incoming-attack-disadvantage"),
    },
    {
      description: LOCALE_TEXT_SCHEMA,
    }
  ),
  "defense-note": objectSchema(
    {
      type: literalSchema("defense-note"),
    },
    {
      description: LOCALE_TEXT_SCHEMA,
    }
  ),
  /**
   * Toggle-gated mechanics. Every nested grant re-enters the root schema, so an
   * active form has the same exact grammar as a top-level mechanic. Evaluation
   * deliberately ignores nested while-active toggles; authoring still validates
   * the whole tree at the persistence boundary.
   */
  "while-active": objectSchema(
    {
      activeKey: stringSchema,
      grants: arraySchema(refSchema("grant")),
      type: literalSchema("while-active"),
    },
    {
      /**
       * An equipped magic item's explicit activation contract. Magic items do
       * not own `mechanics.actions`, so this is the one declarative bridge that
       * lets the shared action/tracker/undo pipeline surface their activated
       * property. `tracker` is the item's legacy session pool (keyed by item
       * id); `resourceCost` instead points at a typed resource declared in the
       * item's `resources` block (the evaluator composes the per-copy payment).
       */
      activation: objectSchema(
        {
          action: unionSchema([
            literalSchema("action"),
            literalSchema("bonus"),
            literalSchema("reaction"),
            literalSchema("free"),
          ]),
        },
        {
          resourceCost: ITEM_RESOURCE_COST_SCHEMA,
          /**
           * Each use after the first before a Long Rest costs this saving throw; a
           * failure gains `exhaustion` levels (Ring of X-ray Vision: DC 15 CON, 1).
           * The uses are counted by `lib/play/reuse-save.ts`.
           */
          reuseSave: objectSchema({
            ability: CASTING_ABILITY_SCHEMA,
            dc: numberSchema,
            exhaustion: numberSchema,
          }),
          tracker: objectSchema(
            {
              recovery: unionSchema([
                literalSchema("long-rest"),
                literalSchema("short-rest"),
                literalSchema("short-or-long-rest"),
                literalSchema("dawn"),
                literalSchema("per-turn"),
                literalSchema("manual"),
              ]),
              total: stringSchema,
            },
            {
              autoRecover: literalSchema(false),
              isPool: booleanSchema,
              longRestRecovery: numberSchema,
              unit: unionSchema([
                literalSchema("hp"),
                literalSchema("points"),
                literalSchema("use"),
                literalSchema("uses"),
                literalSchema("dice"),
                literalSchema("treats"),
              ]),
            }
          ),
        }
      ),
      afterEffect: objectSchema({
        duration: objectSchema({
          kind: literalSchema("target-turn-boundary"),
          phase: unionSchema([literalSchema("turn-start"), literalSchema("turn-end")]),
          turns: numberSchema,
        }),
        grants: arraySchema(refSchema("grant")),
      }),
      duration: unionSchema([
        objectSchema(
          {
            kind: literalSchema("maintained"),
            maintainedBy: arraySchema(
              unionSchema([literalSchema("attack"), literalSchema("bonus-extend")])
            ),
          },
          {
            endsEarlyOn: arraySchema(stringSchema),
            maxMinutes: numberSchema,
            maxRounds: numberSchema,
          }
        ),
        objectSchema(
          {
            kind: literalSchema("timed"),
            minutes: numberSchema,
          },
          {
            byCastLevel: arraySchema(
              objectSchema({
                maxRounds: numberSchema,
                minLevel: numberSchema,
                minutes: numberSchema,
              })
            ),
            endsEarlyOn: arraySchema(stringSchema),
            maxRounds: numberSchema,
          }
        ),
        objectSchema({
          kind: literalSchema("turn-boundary"),
          phase: unionSchema([literalSchema("turn-start"), literalSchema("turn-end")]),
          turns: numberSchema,
        }),
      ]),
      label: LOCALE_TEXT_SCHEMA,
      minLevel: numberSchema,
      recipient: unionSchema([literalSchema("caster"), literalSchema("selected")]),
      targetScope: unionSchema([literalSchema("marked"), literalSchema("cursed")]),
    }
  ),
  /**
   * One selected option contributes its recursively validated grants. Multiple
   * features may share a bundleKey, while nested choice bundles remain ignored
   * by evaluation to preserve the product's single-level chooser contract.
   */
  "choice-grant-bundle": objectSchema(
    {
      bundleKey: stringSchema,
      options: arraySchema(
        objectSchema(
          {
            grants: arraySchema(refSchema("grant")),
            id: stringSchema,
          },
          {
            label: LOCALE_TEXT_SCHEMA,
          }
        )
      ),
      type: literalSchema("choice-grant-bundle"),
    },
    {
      choiceFrequency: unionSchema([literalSchema("creation"), literalSchema("rest")]),
      label: LOCALE_TEXT_SCHEMA,
    }
  ),
  "granted-action": objectSchema(
    {
      slot: unionSchema([
        literalSchema("action"),
        literalSchema("bonus"),
        literalSchema("reaction"),
        literalSchema("free"),
      ]),
      type: literalSchema("granted-action"),
    },
    {
      /** Omitted means at-will/no payment; present, it debits a feature tracker. */
      cost: objectSchema(
        {
          kind: literalSchema("tracker"),
          trackerId: stringSchema,
        },
        {
          amount: numberSchema,
        }
      ),
      description: LOCALE_TEXT_SCHEMA,
      id: stringSchema,
      name: LOCALE_TEXT_SCHEMA,
      saveAbility: unionSchema([
        literalSchema("STR"),
        literalSchema("DEX"),
        literalSchema("CON"),
        literalSchema("INT"),
        literalSchema("WIS"),
        literalSchema("CHA"),
      ]),
      trigger: LOCALE_TEXT_SCHEMA,
      /** A structured trigger token, worded by `combat.reactionTrigger_<token>`. */
      reactionTrigger: unionSchema(
        ALL_REACTION_TRIGGERS.map((token) => literalSchema(token))
      ),
    }
  ),
  "manifested-weapon": objectSchema(
    {
      category: unionSchema([literalSchema("simple"), literalSchema("martial")]),
      damageDie: stringSchema,
      damageType: DAMAGE_TYPE_SCHEMA,
      id: stringSchema,
      properties: arraySchema(stringSchema),
      type: literalSchema("manifested-weapon"),
      weaponType: unionSchema([literalSchema("ranged"), literalSchema("melee")]),
    },
    {
      bonusAction: objectSchema(
        {
          damageDie: stringSchema,
          slot: unionSchema([
            literalSchema("action"),
            literalSchema("bonus"),
            literalSchema("reaction"),
            literalSchema("free"),
          ]),
        },
        {
          name: LOCALE_TEXT_SCHEMA,
        }
      ),
      mastery: unionSchema([
        literalSchema("Cleave"),
        literalSchema("Graze"),
        literalSchema("Nick"),
        literalSchema("Push"),
        literalSchema("Sap"),
        literalSchema("Slow"),
        literalSchema("Topple"),
        literalSchema("Vex"),
      ]),
      masteryIsFree: booleanSchema,
      name: LOCALE_TEXT_SCHEMA,
      proficient: booleanSchema,
    }
  ),
  "form-attack": objectSchema(
    {
      category: unionSchema([literalSchema("simple"), literalSchema("martial")]),
      damageDie: stringSchema,
      damageType: DAMAGE_TYPE_SCHEMA,
      id: stringSchema,
      properties: arraySchema(stringSchema),
      type: literalSchema("form-attack"),
      weaponType: unionSchema([literalSchema("ranged"), literalSchema("melee")]),
    },
    {
      attackAbility: unionSchema([
        literalSchema("STR"),
        literalSchema("DEX"),
        literalSchema("CON"),
        literalSchema("INT"),
        literalSchema("WIS"),
        literalSchema("CHA"),
      ]),
      damageDieByLevel: recordSchema("number", stringSchema),
      name: LOCALE_TEXT_SCHEMA,
      oncePerTurnExtra: objectSchema({
        damageType: DAMAGE_TYPE_SCHEMA,
        dice: stringSchema,
      }),
      proficient: booleanSchema,
    }
  ),
  "pact-weapon": objectSchema(
    {
      attackAbility: unionSchema([
        literalSchema("STR"),
        literalSchema("DEX"),
        literalSchema("CON"),
        literalSchema("INT"),
        literalSchema("WIS"),
        literalSchema("CHA"),
      ]),
      conjureSlot: unionSchema([
        literalSchema("action"),
        literalSchema("bonus"),
        literalSchema("reaction"),
        literalSchema("free"),
      ]),
      damageTypeChoices: arraySchema(DAMAGE_TYPE_SCHEMA),
      defaultDamageDie: stringSchema,
      defaultDamageType: DAMAGE_TYPE_SCHEMA,
      id: stringSchema,
      isFocus: booleanSchema,
      type: literalSchema("pact-weapon"),
    },
    {
      name: LOCALE_TEXT_SCHEMA,
    }
  ),
  /**
   * On-hit extra-damage rider that fires ONLY with the conjured pact weapon
   * (Eldritch Smite, Lifedrinker) — distinct from the generic `damage-rider`,
   * which rides every weapon attack. Exactly one of `damageType` /
   * `damageTypeChoices` is authored.
   */
  "pact-weapon-rider": objectSchema(
    {
      dice: stringSchema,
      id: stringSchema,
      type: literalSchema("pact-weapon-rider"),
    },
    {
      /** Paid for by expending a Pact Magic spell slot (Eldritch Smite). */
      costsPactSlot: booleanSchema,
      damageType: DAMAGE_TYPE_SCHEMA,
      damageTypeChoices: arraySchema(DAMAGE_TYPE_SCHEMA),
      /** Lets you expend a Hit Die to heal on the hit (Lifedrinker). */
      healFromHitDie: booleanSchema,
      name: LOCALE_TEXT_SCHEMA,
      /** Secondary Prone effect on the target (Eldritch Smite). */
      prone: literalSchema("huge-or-smaller"),
      /** Base die PLUS one die per slot level (Eldritch Smite). */
      scalesPerSlotLevel: booleanSchema,
    }
  ),
  "familiar-enhancement": objectSchema(
    {
      type: literalSchema("familiar-enhancement"),
    },
    {
      bonusActionAttack: booleanSchema,
      damageTypeConversion: arraySchema(DAMAGE_TYPE_SCHEMA),
      extraSpeedFt: numberSchema,
      extraSpeedModes: arraySchema(
        unionSchema([literalSchema("fly"), literalSchema("swim"), literalSchema("climb")])
      ),
      reactionResistance: booleanSchema,
      usesOwnerSaveDc: booleanSchema,
    }
  ),
  "familiar-forms": objectSchema({
    monsterIds: arraySchema(stringSchema),
    type: literalSchema("familiar-forms"),
  }),
  /**
   * A Rogue Cunning Strike option: rides on a Sneak Attack hit and is paid for
   * by forgoing `cost` Sneak Attack dice. `save` is the ability the TARGET
   * rolls against (the concrete DC is character-derived by the consumer).
   */
  "cunning-strike-option": objectSchema(
    {
      cost: numberSchema,
      optionId: stringSchema,
      type: literalSchema("cunning-strike-option"),
    },
    {
      condition: unionSchema([
        literalSchema("blinded"),
        literalSchema("charmed"),
        literalSchema("deafened"),
        literalSchema("exhaustion"),
        literalSchema("frightened"),
        literalSchema("grappled"),
        literalSchema("incapacitated"),
        literalSchema("invisible"),
        literalSchema("paralyzed"),
        literalSchema("petrified"),
        literalSchema("poisoned"),
        literalSchema("prone"),
        literalSchema("restrained"),
        literalSchema("stunned"),
        literalSchema("unconscious"),
      ]),
      description: LOCALE_TEXT_SCHEMA,
      name: LOCALE_TEXT_SCHEMA,
      save: unionSchema([
        literalSchema("STR"),
        literalSchema("DEX"),
        literalSchema("CON"),
        literalSchema("INT"),
        literalSchema("WIS"),
        literalSchema("CHA"),
      ]),
    }
  ),
  "temp-hp": objectSchema(
    {
      formula: stringSchema,
      type: literalSchema("temp-hp"),
    },
    {
      slot: unionSchema([
        literalSchema("action"),
        literalSchema("bonus"),
        literalSchema("reaction"),
        literalSchema("free"),
      ]),
      trigger: LOCALE_TEXT_SCHEMA,
    }
  ),
  /**
   * Adds an ALTERNATE recovery cost to ANOTHER feature's tracker: when
   * `targetTracker` is exhausted, a use can still be activated by spending
   * `amount` units from `fromTracker` (Sorcery Incarnate → Innate Sorcery).
   */
  "tracker-alt-recovery": objectSchema({
    amount: numberSchema,
    fromTracker: stringSchema,
    targetTracker: stringSchema,
    type: literalSchema("tracker-alt-recovery"),
  }),
  aura: objectSchema(
    {
      affects: unionSchema([
        literalSchema("allies"),
        literalSchema("enemies"),
        literalSchema("allies-and-self"),
        literalSchema("all-in-range"),
      ]),
      auraId: stringSchema,
      effect: unionSchema([
        objectSchema(
          {
            damageType: DAMAGE_TYPE_SCHEMA,
            dice: stringSchema,
            kind: literalSchema("save-damage"),
            saveAbility: unionSchema([
              literalSchema("STR"),
              literalSchema("DEX"),
              literalSchema("CON"),
              literalSchema("INT"),
              literalSchema("WIS"),
              literalSchema("CHA"),
            ]),
          },
          {
            maxTargetSize: unionSchema([
              literalSchema("Tiny"),
              literalSchema("Small"),
              literalSchema("Medium"),
              literalSchema("Large"),
              literalSchema("Huge"),
              literalSchema("Gargantuan"),
            ]),
            pushFt: numberSchema,
          }
        ),
        objectSchema(
          {
            damageType: DAMAGE_TYPE_SCHEMA,
            dice: stringSchema,
            kind: literalSchema("ranged-attack"),
            rangeFt: numberSchema,
          },
          {
            diceByLevel: recordSchema("number", stringSchema),
          }
        ),
        objectSchema(
          {
            dice: stringSchema,
            kind: literalSchema("heal"),
          },
          {
            diceByLevel: recordSchema("number", stringSchema),
          }
        ),
        objectSchema({
          amount: numberSchema,
          kind: literalSchema("ac-bonus"),
        }),
        objectSchema({
          formula: stringSchema,
          kind: literalSchema("temp-hp"),
        }),
        objectSchema({
          kind: literalSchema("half-cover"),
        }),
        objectSchema({
          appliesTo: literalSchema("ability-and-concentration"),
          floor: numberSchema,
          kind: literalSchema("roll-floor"),
        }),
      ]),
      radius: unionSchema([numberSchema, literalSchema("variable")]),
      type: literalSchema("aura"),
    },
    {
      description: LOCALE_TEXT_SCHEMA,
      radiusByLevel: recordSchema("number", numberSchema),
    }
  ),
  "spell-die-augment": objectSchema({
    fromDie: numberSchema,
    spellId: stringSchema,
    toDie: numberSchema,
    type: literalSchema("spell-die-augment"),
  }),
  "copy-to-2nd-target": objectSchema(
    {
      copyId: stringSchema,
      type: literalSchema("copy-to-2nd-target"),
    },
    {
      appliesToFeature: stringSchema,
      effect: LOCALE_TEXT_SCHEMA,
    }
  ),
  /**
   * PRIM-resource-conversion: spend resource A to PRODUCE resource B — the
   * converter the alt-recovery seam can't express. Variants by `produces`:
   * `"spell-slot"` (Font of Magic Creating Spell Slots via `costTable`, Nature
   * Magician via `perUnitSlotLevels`), `"pact-slot"` (Magical Cunning /
   * Eldritch Master un-expending Pact Magic slots), and `"sorcery-points"`
   * (Font of Magic Converting Spell Slots). The cost-engine
   * (`planResourceConversion`) plans the concrete spend/produce ops;
   * override-first — never auto-converted.
   */
  "resource-conversion": objectSchema(
    {
      conversionId: stringSchema,
      produces: unionSchema([
        literalSchema("spell-slot"),
        literalSchema("pact-slot"),
        literalSchema("sorcery-points"),
      ]),
      type: literalSchema("resource-conversion"),
    },
    {
      /** Font of Magic: produced-slot-level → { cost, minLevel }. */
      costTable: arraySchema(
        objectSchema({
          cost: numberSchema,
          minLevel: numberSchema,
          slotLevel: numberSchema,
        })
      ),
      fromTracker: stringSchema,
      /** Max produced slot level (Font of Magic = 5). */
      maxSlotLevel: numberSchema,
      /** Nature Magician: each spent unit = this many spell levels. */
      perUnitSlotLevels: numberSchema,
      toTracker: stringSchema,
    }
  ),
  "item-bound-bonus": objectSchema({
    amount: numberSchema,
    target: literalSchema("weapon-attack-and-damage"),
    type: literalSchema("item-bound-bonus"),
  }),
  /**
   * A falling creature descends at most `feetPerRound` feet per round and takes no
   * damage from the fall when it lands (Feather Fall: 60 feet per round).
   */
  "slowed-fall": objectSchema({
    feetPerRound: numberSchema,
    type: literalSchema("slowed-fall"),
  }),
  /**
   * Extra damage on a hit with THIS magic weapon only (Vicious Weapon's 2d6, Frost
   * Brand's 1d6 Cold, Mace of Disruption's 2d6 Radiant vs Fiends and Undead). Like
   * `item-bound-bonus` it rides only the weapon row the item is bound to
   * (`enchantItemId`), never every attack; inside a `while-active` it rides only
   * while a held copy of the item has that state lit (Flame Tongue ablaze).
   */
  "item-bound-damage-rider": objectSchema(
    {
      damageType: unionSchema([DAMAGE_TYPE_SCHEMA, literalSchema("same-as-weapon")]),
      dice: stringSchema,
      type: literalSchema("item-bound-damage-rider"),
    },
    {
      /** Not against these creature types (Sword of Life Stealing: no Constructs
       *  or Undead). */
      excludeCreatureTypes: arraySchema(RIDER_CREATURE_TYPE_SCHEMA),
      /** Only when the d20 of the attack roll shows a 20 (Sword of Sharpness's
       *  extra 14 Slashing). A plain number in `dice` is a fixed amount. */
      onRoll20: literalSchema(true),
      targetCreatureTypes: arraySchema(RIDER_CREATURE_TYPE_SCHEMA),
    }
  ),
  /**
   * Critical Hits against the wearer become normal hits (Adamantine Armor): the
   * hit's extra dice and a Critical Hit's two Death Saving Throw failures at 0 HP.
   */
  "critical-hit-immunity": objectSchema({
    type: literalSchema("critical-hit-immunity"),
  }),
  /**
   * Worn armor loses one of its drawbacks (Mithral Armor): its Disadvantage on
   * Dexterity (Stealth) checks, or its Strength requirement's −10 ft Speed.
   */
  "armor-penalty-waiver": objectSchema({
    penalty: unionSchema([
      literalSchema("stealth-disadvantage"),
      literalSchema("strength-requirement"),
    ]),
    type: literalSchema("armor-penalty-waiver"),
  }),
  /** A dying creature stabilizes on its own (Periapt of Wound Closure). */
  "auto-stabilize": objectSchema({
    type: literalSchema("auto-stabilize"),
  }),
  /**
   * Hit Point Dice spent to heal restore more: `double` doubles the HP restored
   * (Periapt of Wound Closure); `maximum` restores each die's maximum (Potion of
   * Vitality).
   */
  "hit-dice-healing": objectSchema({
    rule: unionSchema([literalSchema("double"), literalSchema("maximum")]),
    type: literalSchema("hit-dice-healing"),
  }),
  /**
   * Studying the item raises an ability score for good, up to `cap` (Manual of
   * Bodily Health: Constitution +2, to a maximum of 30). Never a standing bonus:
   * the increase is written into the stored score once, so it stays after the
   * book is gone (`studyItemAbilityScores`).
   */
  "permanent-ability-increase": objectSchema({
    ability: CASTING_ABILITY_SCHEMA,
    amount: numberSchema,
    cap: numberSchema,
    type: literalSchema("permanent-ability-increase"),
  }),
  /**
   * Incoming damage of these types is reduced by a rolled die (Resistance:
   * 1d4, once per turn). The dice stay table-rolled: a defense line, not
   * intake math.
   */
  "damage-die-reduction": objectSchema(
    {
      damageTypes: arraySchema(DAMAGE_TYPE_SCHEMA),
      dice: stringSchema,
      type: literalSchema("damage-die-reduction"),
    },
    {
      oncePerTurn: booleanSchema,
    }
  ),
});

export type GrantSchemaCustomTypes = {
  readonly "proficiency-token": ProficiencyToken;
  readonly "resource-spec": ResourceSpec;
};

type GrantSchemaShape = InferExactSchema<typeof GRANT_SCHEMA_DEFINITION>;
type WhileActiveSchemaShape = Extract<
  GrantSchemaShape,
  { readonly type: "while-active" }
>;
type WhileActiveAfterEffectSchemaShape = NonNullable<
  WhileActiveSchemaShape["afterEffect"]
>;
type ChoiceGrantBundleSchemaShape = Extract<
  GrantSchemaShape,
  { readonly type: "choice-grant-bundle" }
>;
type ChoiceGrantOptionSchemaShape = ChoiceGrantBundleSchemaShape["options"][number];
type NonRecursiveGrantSchemaShape = Exclude<
  GrantSchemaShape,
  WhileActiveSchemaShape | ChoiceGrantBundleSchemaShape
>;

/**
 * Recursive output of the exact schema above. Only the three named `grant`
 * references are closed here; every concrete field remains inferred directly
 * from its schema entry. Keeping the recursive knot this small also prevents
 * TypeScript's project service from repeatedly expanding the entire union.
 */
export type Grant =
  | NonRecursiveGrantSchemaShape
  | (Omit<WhileActiveSchemaShape, "grants" | "afterEffect"> & {
      readonly grants: readonly Grant[];
      readonly afterEffect?: Omit<WhileActiveAfterEffectSchemaShape, "grants"> & {
        readonly grants: readonly Grant[];
      };
    })
  | (Omit<ChoiceGrantBundleSchemaShape, "options"> & {
      readonly options: readonly (Omit<ChoiceGrantOptionSchemaShape, "grants"> & {
        readonly grants: readonly Grant[];
      })[];
    });

/** Runtime schema with the closed recursive output cached at its root. */
export const GRANT_SCHEMA = bindExactSchemaOutput<Grant>()(GRANT_SCHEMA_DEFINITION);
