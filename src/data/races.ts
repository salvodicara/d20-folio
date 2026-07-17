import type {
  SrdRaceData,
  SrdRaceTrait,
  SrdIndex,
  TrackerSpec,
  SrdActionDef,
} from "./types";
import { mergePack } from "@/lib/pack-merge";
import { packRaces } from "@pack";

const PUBLIC_RACES: SrdRaceData[] = [
  // ─── Human ───────────────────────────────────────────────────
  {
    id: "human",
    size: "Small or Medium",
    speed: 30,
    traits: [
      {
        id: "resourceful",
        grants: [{ type: "heroic-inspiration-on-rest" }],
      },
      {
        id: "skillful",
        // M-species-skills — any one skill. Empty `options` means the picker
        // offers all 18 skills (see feat-skill-choices.ts).
        grants: [{ type: "choice-skill-proficiency", options: [], amount: 1 }],
      },
      {
        id: "versatile",
        // choice-feat (origin-feat grant): one Origin feat of choice — the
        // picker surfaces the pending pick and resolves it into a feat ref on
        // `character.features` (the same primitive Lessons of the First Ones
        // uses). Override-first: nothing applies until the player picks.
        grants: [{ type: "choice-feat", category: "origin", amount: 1 }],
      },
    ],
    source: "SRD",
  },
  // ─── Elf (High Elf) ─────────────────────────────────────────
  {
    id: "elf",
    size: "Medium",
    speed: 30,
    traits: [
      {
        id: "darkvision",
        grants: [{ type: "darkvision", range: 60 }],
      },
      {
        id: "keen-senses",
        // M-species-skills — 2024 PHB grants a CHOICE of one skill (Insight,
        // Perception, or Survival), NOT a fixed Perception. Modelled as a
        // single-pick `choice-skill-proficiency`; the level-up wizard surfaces
        // the picker and resolution upgrades the chosen skill to "proficient".
        grants: [
          {
            type: "choice-skill-proficiency",
            options: ["insight", "perception", "survival"],
            amount: 1,
          },
        ],
      },
      {
        id: "fey-ancestry",
        // Permanent condition-save Advantage → `advantage-on` (rollType "save"),
        // surfaced as a save chip near the Abilities block — the same pattern
        // Sorcerer Aberrant Sorcery / Barbarian Rage already use. The
        // "can't be put to sleep" half stays descriptive (no condition for it).
        grants: [
          {
            type: "advantage-on",
            rollType: "save",
            vs: "charmed",
          },
        ],
      },
      {
        id: "trance",
      },
      {
        // M9 — Elven Lineage: SRD 5.2.1 has THREE options (Drow, High Elf,
        // Wood Elf), each with its own bonuses and Darkvision 120 ft or
        // Speed 35 ft. Listed in the description; the chosen-lineage tracker
        // covers the shared "1 free spell at L3 + L5" pattern they share.
        id: "elven-lineage",
        // Each leveled lineage spell is castable once per Long Rest without a slot
        // — modeled as PER-SPELL `free-cast-spell` grants (each its own 1/LR
        // counter via the per-spell source id), not one shared pool tracker.
        // M-species-spells — the 2024 PHB core Elven Lineages (Drow / High Elf /
        // Wood Elf) each grant a known cantrip at L1, a free-cast spell at
        // character level 3, and another at level 5. Modeled as a single-select
        // `choice-grant-bundle` (bundleKey "elf-lineage") whose chosen option
        // injects its cantrip (always available) + the L3/L5 spells (gated by
        // `minLevel`). Casting ability defers to the species INT/WIS/CHA pick
        // (`spellAbilitySource: "species"` → reads character.speciesSpellAbility,
        // default CHA), matching "Intelligence, Wisdom, or Charisma is your
        // spellcasting ability … (choose when you select the lineage)". The
        // description and options carry exactly the three SRD lineages (any
        // extra setting lineage is content-pack material).
        grants: [
          {
            type: "choice-grant-bundle",
            bundleKey: "elf-lineage",
            choiceFrequency: "creation",
            options: [
              {
                id: "drow",
                grants: [
                  // Elven Lineages table, Drow L1: "The range of your Darkvision
                  // increases to 120 feet." The bundle evaluator applies inner
                  // darkvision grants and merges by max, so this overrides the
                  // base 60 ft from the Darkvision trait.
                  { type: "darkvision", range: 120 },
                  {
                    type: "always-prepared-spell",
                    spellId: "dancing-lights",
                    spellAbilitySource: "species",
                  },
                  {
                    type: "always-prepared-spell",
                    spellId: "faerie-fire",
                    spellAbilitySource: "species",
                    minLevel: 3,
                  },
                  {
                    type: "free-cast-spell",
                    spellId: "faerie-fire",
                    chargesPerRest: 1,
                    rest: "long",
                  },
                  {
                    type: "always-prepared-spell",
                    spellId: "darkness",
                    spellAbilitySource: "species",
                    minLevel: 5,
                  },
                  {
                    type: "free-cast-spell",
                    spellId: "darkness",
                    chargesPerRest: 1,
                    rest: "long",
                  },
                ],
              },
              {
                id: "high-elf",
                grants: [
                  {
                    type: "always-prepared-spell",
                    spellId: "prestidigitation",
                    spellAbilitySource: "species",
                  },
                  {
                    type: "always-prepared-spell",
                    spellId: "detect-magic",
                    spellAbilitySource: "species",
                    minLevel: 3,
                  },
                  {
                    type: "free-cast-spell",
                    spellId: "detect-magic",
                    chargesPerRest: 1,
                    rest: "long",
                  },
                  {
                    type: "always-prepared-spell",
                    spellId: "misty-step",
                    spellAbilitySource: "species",
                    minLevel: 5,
                  },
                  {
                    type: "free-cast-spell",
                    spellId: "misty-step",
                    chargesPerRest: 1,
                    rest: "long",
                  },
                ],
              },
              {
                id: "wood-elf",
                grants: [
                  // Elven Lineages table, Wood Elf L1: "Your Speed increases to
                  // 35 feet." Speed grants are additive in the evaluator, so the
                  // base 30 + 5 = 35 ft only counts once the player picks Wood Elf.
                  { type: "speed", amount: 5 },
                  {
                    type: "always-prepared-spell",
                    spellId: "druidcraft",
                    spellAbilitySource: "species",
                  },
                  {
                    type: "always-prepared-spell",
                    spellId: "longstrider",
                    spellAbilitySource: "species",
                    minLevel: 3,
                  },
                  {
                    type: "free-cast-spell",
                    spellId: "longstrider",
                    chargesPerRest: 1,
                    rest: "long",
                  },
                  {
                    type: "always-prepared-spell",
                    spellId: "pass-without-trace",
                    spellAbilitySource: "species",
                    minLevel: 5,
                  },
                  {
                    type: "free-cast-spell",
                    spellId: "pass-without-trace",
                    chargesPerRest: 1,
                    rest: "long",
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    source: "SRD",
  },
  // ─── Dwarf (Hill Dwarf) ─────────────────────────────────────
  {
    id: "dwarf",
    size: "Medium",
    speed: 30,
    traits: [
      {
        id: "darkvision",
        grants: [{ type: "darkvision", range: 120 }],
      },
      {
        id: "dwarven-resilience",
        // Poison Resistance → damage-resistance; the conditional save Advantage
        // → `advantage-on` (rollType "save"), mirroring Elf Fey Ancestry.
        grants: [
          { type: "damage-resistance", damageType: "poison" },
          {
            type: "advantage-on",
            rollType: "save",
            vs: "poisoned",
          },
        ],
      },
      {
        id: "dwarven-toughness",
        grants: [{ type: "hp-per-level", amount: 1 }],
      },
      {
        id: "stonecunning",
        mechanics: {
          tracker: { total: "PB", recovery: "long-rest" },
          actions: [
            {
              type: "bonus",
            },
          ],
        },
        // 2024 RAW: as a Bonus Action gain Tremorsense 60 ft for 10 minutes
        // (PB/Long-Rest above). Modelled as a `while-active` toggle (activeKey =
        // this trait's own id) so the tremorsense sense only counts while the
        // player turns it on — it lights up the senses aggregate with zero new
        // consumer code (mirrors Goliath Large Form).
        grants: [
          {
            type: "while-active",
            activeKey: "dwarf-stonecunning",
            grants: [{ type: "tremorsense", range: 60 }],
          },
        ],
      },
    ],
    source: "SRD",
  },
  // ─── Halfling ───────────────────────────────────────────────
  {
    id: "halfling",
    size: "Small",
    speed: 30,
    traits: [
      {
        id: "brave",
        // Permanent condition-save Advantage → `advantage-on` (rollType "save"),
        // mirroring Elf Fey Ancestry.
        grants: [
          {
            type: "advantage-on",
            rollType: "save",
            vs: "frightened",
          },
        ],
      },
      {
        id: "halfling-nimbleness",
      },
      {
        id: "luck",
      },
      {
        id: "naturally-stealthy",
      },
    ],
    source: "SRD",
  },
  // ─── Orc ────────────────────────────────────────────────────
  {
    id: "orc",
    size: "Medium",
    speed: 30,
    traits: [
      {
        id: "darkvision",
        grants: [{ type: "darkvision", range: 120 }],
      },
      {
        id: "adrenaline-rush",
        // 2024 RAW (species:orc): taking the Dash bonus action also grants
        // Temporary Hit Points equal to your Proficiency Bonus. Override-first
        // temp-HP grant (temp HP never stack — the player applies the higher
        // pool); the Dash itself stays the bonus action below.
        grants: [{ type: "temp-hp", formula: "PB", slot: "bonus" }],
        mechanics: {
          tracker: { total: "PB", recovery: "short-rest" },
          actions: [
            {
              type: "bonus",
            },
          ],
        },
      },
      {
        id: "relentless-endurance",
        // S4 — at-0-HP interrupt: when you'd drop to 0 HP, drop to 1 instead
        // (1/Long Rest). The grant's `trackerId` is this trait's session id
        // (`race:orc:relentless-endurance` — `race:<raceId>:<trait.id>`, GR 12+22),
        // so the consumer matches the tracker emitted by `resolveTrackers` for the
        // same trait.
        grants: [
          {
            type: "at-zero-hp-interrupt",
            trackerId: "race:orc:relentless-endurance",
          },
        ],
        mechanics: {
          tracker: { total: "1", recovery: "long-rest" },
        },
      },
    ],
    source: "SRD",
  },
  // ─── Gnome (Rock Gnome) ─────────────────────────────────────
  {
    id: "gnome",
    size: "Small",
    speed: 30,
    traits: [
      {
        id: "darkvision",
        grants: [{ type: "darkvision", range: 60 }],
      },
      {
        id: "gnome-cunning",
        // Three permanent ability-save Advantages (INT/WIS/CHA) → three
        // `advantage-on` (rollType "save") grants, the same shape Barbarian Rage
        // uses for its Strength-save Advantage.
        grants: [
          {
            type: "advantage-on",
            rollType: "save",
            vs: "int",
          },
          {
            type: "advantage-on",
            rollType: "save",
            vs: "wis",
          },
          {
            type: "advantage-on",
            rollType: "save",
            vs: "cha",
          },
        ],
      },
      {
        // M9 — Gnomish Lineage choice was missing from the 2024 species data.
        id: "gnomish-lineage",
        // M-species-spells — single-select `choice-grant-bundle` (bundleKey
        // "gnome-lineage"). Forest Gnome → Minor Illusion (cantrip) + Speak
        // with Animals (always prepared). Rock Gnome → Mending + Prestidigitation
        // cantrips. Casting ability defers to the species INT/WIS/CHA pick
        // (`spellAbilitySource: "species"`). No `minLevel` — every gnome lineage
        // spell is available from level 1.
        grants: [
          {
            type: "choice-grant-bundle",
            bundleKey: "gnome-lineage",
            choiceFrequency: "creation",
            options: [
              {
                id: "forest-gnome",
                grants: [
                  {
                    type: "always-prepared-spell",
                    spellId: "minor-illusion",
                    spellAbilitySource: "species",
                  },
                  {
                    type: "always-prepared-spell",
                    spellId: "speak-with-animals",
                    spellAbilitySource: "species",
                  },
                  // "Cast it without a slot a number of times equal to your
                  // Proficiency Bonus per Long Rest." PB-scaled free casts.
                  {
                    type: "free-cast-spell",
                    spellId: "speak-with-animals",
                    chargesPerRest: 1,
                    chargesFormula: "PB",
                    rest: "long",
                  },
                ],
              },
              {
                id: "rock-gnome",
                grants: [
                  {
                    type: "always-prepared-spell",
                    spellId: "mending",
                    spellAbilitySource: "species",
                  },
                  {
                    type: "always-prepared-spell",
                    spellId: "prestidigitation",
                    spellAbilitySource: "species",
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    source: "SRD",
  },
  // ─── Tiefling ───────────────────────────────────────────────
  {
    id: "tiefling",
    size: "Small or Medium",
    speed: 30,
    traits: [
      {
        id: "darkvision",
        grants: [{ type: "darkvision", range: 60 }],
      },
      {
        id: "fiendish-legacy",
        // Each legacy spell is castable once per Long Rest without a slot — modeled
        // as PER-SPELL `free-cast-spell` grants in the bundle options below (each
        // with its own 1/LR counter, via the per-spell source id), NOT a single
        // shared pool tracker, so "cast EACH once" is exact. The free casts surface
        // as cast-modal options on the leveled spells.
        // M-species-spells — each 2024 Fiendish Legacy grants a known cantrip at
        // L1, a free-cast spell at character level 3, and another at level 5.
        // Single-select `choice-grant-bundle` (bundleKey "tiefling-legacy"):
        // the chosen legacy injects its cantrip (always) + L3/L5 spells (gated
        // by `minLevel`). Casting ability defers to the species INT/WIS/CHA pick
        // (the SAME pick Otherworldly Presence's thaumaturgy uses), so all
        // Tiefling spells stay in sync with character.speciesSpellAbility.
        grants: [
          {
            type: "choice-grant-bundle",
            bundleKey: "tiefling-legacy",
            options: [
              {
                id: "abyssal",
                grants: [
                  // Fiendish Legacies table L1: "Abyssal — You have Resistance to
                  // Poison damage." Mirrors the Dragonborn ancestry damage-resistance
                  // pattern; the bundle evaluator adds it to the resistance set
                  // only when Abyssal is chosen.
                  { type: "damage-resistance", damageType: "poison" },
                  {
                    type: "always-prepared-spell",
                    spellId: "poison-spray",
                    spellAbilitySource: "species",
                  },
                  {
                    type: "always-prepared-spell",
                    spellId: "ray-of-sickness",
                    spellAbilitySource: "species",
                    minLevel: 3,
                  },
                  {
                    type: "free-cast-spell",
                    spellId: "ray-of-sickness",
                    chargesPerRest: 1,
                    rest: "long",
                  },
                  {
                    type: "always-prepared-spell",
                    spellId: "hold-person",
                    spellAbilitySource: "species",
                    minLevel: 5,
                  },
                  {
                    type: "free-cast-spell",
                    spellId: "hold-person",
                    chargesPerRest: 1,
                    rest: "long",
                  },
                ],
              },
              {
                id: "chthonic",
                grants: [
                  // Fiendish Legacies table L1: "Chthonic — You have Resistance to
                  // Necrotic damage."
                  { type: "damage-resistance", damageType: "necrotic" },
                  {
                    type: "always-prepared-spell",
                    spellId: "chill-touch",
                    spellAbilitySource: "species",
                  },
                  {
                    type: "always-prepared-spell",
                    spellId: "false-life",
                    spellAbilitySource: "species",
                    minLevel: 3,
                  },
                  {
                    type: "free-cast-spell",
                    spellId: "false-life",
                    chargesPerRest: 1,
                    rest: "long",
                  },
                  {
                    type: "always-prepared-spell",
                    spellId: "ray-of-enfeeblement",
                    spellAbilitySource: "species",
                    minLevel: 5,
                  },
                  {
                    type: "free-cast-spell",
                    spellId: "ray-of-enfeeblement",
                    chargesPerRest: 1,
                    rest: "long",
                  },
                ],
              },
              {
                id: "infernal",
                grants: [
                  // Fiendish Legacies table L1: "Infernal — You have Resistance to
                  // Fire damage."
                  { type: "damage-resistance", damageType: "fire" },
                  {
                    type: "always-prepared-spell",
                    spellId: "fire-bolt",
                    spellAbilitySource: "species",
                  },
                  {
                    type: "always-prepared-spell",
                    spellId: "hellish-rebuke",
                    spellAbilitySource: "species",
                    minLevel: 3,
                  },
                  // "Cast it once without a spell slot, regaining on a Long Rest."
                  // Per-spell free cast (its own 1/LR counter, via the bundle's
                  // per-spell source id — see grants.ts bundle descent). It only
                  // surfaces once the spell itself does (the always-prepared
                  // `minLevel` gates appearance), so no separate level gate here.
                  {
                    type: "free-cast-spell",
                    spellId: "hellish-rebuke",
                    chargesPerRest: 1,
                    rest: "long",
                  },
                  {
                    type: "always-prepared-spell",
                    spellId: "darkness",
                    spellAbilitySource: "species",
                    minLevel: 5,
                  },
                  {
                    type: "free-cast-spell",
                    spellId: "darkness",
                    chargesPerRest: 1,
                    rest: "long",
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "otherworldly-presence",
        // The cantrip's casting ability is the species "choose INT/WIS/CHA"
        // pick (character.speciesSpellAbility, default CHA). `spellAbilitySource:
        // "species"` makes the injected ref defer to that pick rather than
        // pinning a concrete ability, so changing the choice updates it live.
        grants: [
          {
            type: "always-prepared-spell",
            spellId: "thaumaturgy",
            spellAbilitySource: "species",
          },
        ],
      },
    ],
    source: "SRD",
  },
  // ─── Goliath ────────────────────────────────────────────────
  {
    id: "goliath",
    size: "Medium",
    speed: 35,
    traits: [
      {
        // M9 — level-gated: unavailable until character level 5.
        id: "large-form",
        mechanics: {
          tracker: {
            total: "1",
            recovery: "long-rest",
            levels: [{ from: 5, total: "1" }],
          },
          actions: [
            {
              type: "bonus",
            },
          ],
        },
        // M-species-extended — while in Large Form the character's Speed
        // increases by 10 feet AND they have Advantage on Strength checks.
        // Modelled as a `while-active` toggle (activeKey = this trait's own id)
        // so both benefits only count when the player turns the form on; the
        // tracker above (level-gated to L5) still governs the 1/Long-Rest use.
        grants: [
          {
            type: "while-active",
            activeKey: "goliath-large-form",
            grants: [
              { type: "speed", amount: 10 },
              { type: "advantage-on", rollType: "check", vs: "strength-checks" },
            ],
          },
        ],
      },
      {
        id: "powerful-build",
        // 2024 RAW: Advantage on the ability CHECK (not a saving throw) to end
        // the Grappled condition → `advantage-on` with rollType "check". The
        // carrying-capacity half stays descriptive.
        grants: [
          {
            type: "advantage-on",
            rollType: "check",
            vs: "grappled",
          },
        ],
      },
      {
        // M9 — Storm's Thunder added (was missing). Action type intentionally
        // unset here: the six ancestry choices have different action economies
        // (Cloud's Jaunt = Bonus, Stone's/Storm's = Reaction, the other three
        // trigger automatically on a hit). Until A4 choice-modeling lands and
        // picks one ancestry, surfacing a single action card would mislead.
        id: "giant-ancestry",
        mechanics: {
          tracker: { total: "PB", recovery: "long-rest" },
        },
        // M-species-extended — single-select `choice-grant-bundle` (bundleKey
        // "goliath-giant-ancestry"): the chosen giant surfaces its boon as a
        // `granted-action` row on the Combat page, each spending one use of the
        // shared PB/Long-Rest tracker above (cost → the trait's own tracker id
        // "goliath-giant-ancestry"). The on-hit boons (Fire/Frost/Hill) are
        // optional per-use riders, NOT always-on weapon damage, so they are
        // modelled as action rows with an on-hit `trigger` rather than
        // `damage-rider` grants (which the attack engine would over-report as
        // unconditional bonus damage on every swing).
        grants: [
          {
            type: "choice-grant-bundle",
            bundleKey: "goliath-giant-ancestry",
            options: [
              {
                id: "clouds-jaunt",
                grants: [
                  {
                    id: "clouds-jaunt",
                    type: "granted-action",
                    slot: "bonus",
                    cost: { kind: "tracker", trackerId: "goliath-giant-ancestry" },
                  },
                ],
              },
              {
                id: "fires-burn",
                grants: [
                  {
                    id: "fires-burn",
                    type: "granted-action",
                    slot: "free",
                    cost: { kind: "tracker", trackerId: "goliath-giant-ancestry" },
                  },
                ],
              },
              {
                id: "frosts-chill",
                grants: [
                  {
                    id: "frosts-chill",
                    type: "granted-action",
                    slot: "free",
                    cost: { kind: "tracker", trackerId: "goliath-giant-ancestry" },
                  },
                ],
              },
              {
                id: "hills-tumble",
                grants: [
                  {
                    id: "hills-tumble",
                    type: "granted-action",
                    slot: "free",
                    cost: { kind: "tracker", trackerId: "goliath-giant-ancestry" },
                  },
                ],
              },
              {
                id: "stones-endurance",
                grants: [
                  {
                    id: "stones-endurance",
                    type: "granted-action",
                    slot: "reaction",
                    cost: { kind: "tracker", trackerId: "goliath-giant-ancestry" },
                  },
                ],
              },
              {
                id: "storms-thunder",
                grants: [
                  {
                    id: "storms-thunder",
                    type: "granted-action",
                    slot: "reaction",
                    cost: { kind: "tracker", trackerId: "goliath-giant-ancestry" },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    source: "SRD",
  },
  // ─── Dragonborn ─────────────────────────────────────────────
  {
    id: "dragonborn",
    size: "Medium",
    speed: 30,
    traits: [
      {
        id: "darkvision",
        grants: [{ type: "darkvision", range: 60 }],
      },
      {
        id: "draconic-ancestry",
        // M-species-extended — single-select `choice-grant-bundle` (bundleKey
        // "dragonborn-ancestry"): the chosen dragon injects the matching
        // `damage-resistance` (which the separate "Damage Resistance" trait
        // describes) and, by sharing the bundle key, also fixes the damage type
        // the Breath Weapon action deals. Ten 2024-PHB ancestors; some dragons
        // map to the same damage type (Black/Copper = acid, Blue/Bronze =
        // lightning, Brass/Gold/Red = fire, Silver/White = cold), but each is a
        // distinct appearance pick so all ten stay listed.
        grants: [
          {
            type: "choice-grant-bundle",
            bundleKey: "dragonborn-ancestry",
            options: [
              {
                id: "black",
                grants: [{ type: "damage-resistance", damageType: "acid" }],
              },
              {
                id: "blue",
                grants: [{ type: "damage-resistance", damageType: "lightning" }],
              },
              {
                id: "brass",
                grants: [{ type: "damage-resistance", damageType: "fire" }],
              },
              {
                id: "bronze",
                grants: [{ type: "damage-resistance", damageType: "lightning" }],
              },
              {
                id: "copper",
                grants: [{ type: "damage-resistance", damageType: "acid" }],
              },
              {
                id: "gold",
                grants: [{ type: "damage-resistance", damageType: "fire" }],
              },
              {
                id: "green",
                grants: [{ type: "damage-resistance", damageType: "poison" }],
              },
              {
                id: "red",
                grants: [{ type: "damage-resistance", damageType: "fire" }],
              },
              {
                id: "silver",
                grants: [{ type: "damage-resistance", damageType: "cold" }],
              },
              {
                id: "white",
                grants: [{ type: "damage-resistance", damageType: "cold" }],
              },
            ],
          },
        ],
      },
      {
        id: "breath-weapon",
        // S11 — the Breath Weapon's mechanics, formerly only in i18n prose (a
        // golden-rule-5 leak). DEX save vs DC 8 + CON mod + PB (`saveDcAbility:
        // "CON"`); damage scales 1d10 → 4d10 by CHARACTER level (1/5/11/17); the
        // damage type is the chosen Draconic Ancestry's (derived from the
        // "dragonborn-ancestry" bundle's `damage-resistance`, single source of
        // truth). PB/Long-Rest uses via the tracker. The engine surfaces "2d10
        // Fire · DC N DEX" on the card; the player rolls externally (golden rule 21).
        mechanics: {
          tracker: { total: "PB", recovery: "long-rest" },
          actions: [
            {
              type: "action",
              saveAbility: "DEX",
              saveDcAbility: "CON",
              attack: {
                diceByLevel: { 1: "1d10", 5: "2d10", 11: "3d10", 17: "4d10" },
                damageTypeFromBundle: "dragonborn-ancestry",
              },
            },
          ],
        },
      },
      {
        id: "damage-resistance",
        // The actual `damage-resistance` grant lives on the Draconic Ancestry
        // `choice-grant-bundle` (bundleKey "dragonborn-ancestry") — choosing the
        // dragon there lights up the matching resistance in the aggregate, so
        // this descriptive trait carries no grant of its own (avoids declaring a
        // second, unselected chooser).
      },
      {
        // M9 — Draconic Flight unlocks at character level 5 (2024 PHB Dragonborn).
        id: "draconic-flight",
        mechanics: {
          tracker: {
            total: "1",
            recovery: "long-rest",
            levels: [{ from: 5, total: "1" }],
          },
          actions: [
            {
              type: "bonus",
            },
          ],
        },
        // M-species-extended — while the spectral wings are active, the
        // character has a Fly Speed equal to their Speed. Modelled as a
        // `while-active` toggle (activeKey = this trait's own id) so the
        // `fly-speed: "equal-to-walking"` only counts when the player turns the
        // wings on; the tracker above still gates the 1/Long-Rest use. The
        // level-5 unlock is enforced by the tracker (total 0 before L5), so an
        // L1–L4 Dragonborn never sees a usable toggle.
        grants: [
          {
            type: "while-active",
            activeKey: "dragonborn-draconic-flight",
            grants: [{ type: "fly-speed", amount: "equal-to-walking" }],
          },
        ],
      },
    ],
    source: "SRD",
  },
];

/** All species — public SRD + content pack. */
export const SRD_RACES: SrdRaceData[] = mergePack("race", PUBLIC_RACES, packRaces);

// ─── Lookup Map ───────────────────────────────────────────────

export const RACES_BY_ID: SrdIndex<SrdRaceData> = new Map(
  SRD_RACES.map((r) => [r.id, r])
);

// ─── Helper Functions ─────────────────────────────────────────

export function getRace(id: string): SrdRaceData | undefined {
  return RACES_BY_ID.get(id);
}

export function getAllRaceIds(): string[] {
  return SRD_RACES.map((r) => r.id);
}

// ─── Race Feature Index ───────────────────────────────────────

export interface RaceFeatureEntry {
  id: string;
  raceId: string;
  // name / description live in the SRD catalogue (`race` kind), keyed
  // `<raceId>.traits.<trait.id>` (derive via `raceTraitCatKey`).
  mechanics?: {
    tracker?: TrackerSpec;
    actions?: SrdActionDef[];
  };
  /** A4 — declarative grants copied through from the source SrdRaceTrait. */
  grants?: ReadonlyArray<import("@/lib/grants").Grant>;
}

/**
 * Generate a canonical ID for a race trait: `"${raceId}-${trait.id}"`. The trait's
 * own `id` is its stable `slug(name.en)` (the catalogue-key segment), so this reads
 * NO BiText and survives the data strip unchanged.
 */
function traitId(raceId: string, trait: SrdRaceTrait): string {
  return `${raceId}-${trait.id}`;
}

/**
 * Flat list of all race traits with generated IDs.
 * Used for display lookups when the UI needs to render SrdFeatureRefs
 * that point to race features.
 */
export const raceFeatureEntries: RaceFeatureEntry[] = SRD_RACES.flatMap((race) =>
  race.traits.map((trait) => ({
    id: traitId(race.id, trait),
    raceId: race.id,
    ...(trait.mechanics ? { mechanics: trait.mechanics } : {}),
    ...(trait.grants ? { grants: trait.grants } : {}),
  }))
);

/**
 * Map from generated race-feature ID → RaceFeatureEntry.
 * e.g. "orc-adrenaline-rush" → { name, description, raceId }
 */
export const raceFeatureIndex: Map<string, RaceFeatureEntry> = new Map(
  raceFeatureEntries.map((e) => [e.id, e])
);

/**
 * The STABLE i18n-catalogue key for a race trait — `"<raceId>.traits.<slug>"`,
 * the path the R3 codemod wrote into `src/i18n/<locale>/srd/races.json`. The slug
 * is recovered from the entry's generated id (`"<raceId>-<slug>"`) by stripping the
 * `"<raceId>-"` prefix, so it carries NO `name.en` read — a guard test pins that
 * this derivation matches the catalogue for every trait. Consumers localize a trait
 * via `localizeSrd("race", raceTraitCatKey(entry), field, locale)`.
 */
export function raceTraitCatKey(entry: { id: string; raceId: string }): string {
  const slug = entry.id.startsWith(`${entry.raceId}-`)
    ? entry.id.slice(entry.raceId.length + 1)
    : entry.id;
  return `${entry.raceId}.traits.${slug}`;
}

/**
 * The STABLE catalogue key for a RAW `SrdRaceTrait` (one straight off
 * `race.traits`) — `"<raceId>.traits.<trait.id>"`. The trait's `id` IS the
 * catalogue-key segment (its `slug(name.en)`), so this reads NO BiText; the
 * engine's race loops use it to localize a trait's `name`/`description`/nested-
 * action strings off the catalogue (R6+R3 SLICE 7c/7d).
 */
export function rawRaceTraitCatKey(raceId: string, trait: SrdRaceTrait): string {
  return `${raceId}.traits.${trait.id}`;
}
