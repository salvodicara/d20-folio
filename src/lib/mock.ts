/**
 * Development Mock Character — Lyra Voss, Elf Bard 9 (College of Lore)
 *
 * Single character document covering every UI surface and data-model edge case:
 *  • Prepared caster (2024 Bard) — prepared flags on leveled spells; cantrips
 *    are always-prepared; exercises the cast-summary "PREPARED n/max" + limit UI
 *  • Spell slots levels 1–5, some used — slot pip UI
 *  • Bardic Inspiration die (d8) — tracked-die action card
 *  • Martial features (Second Wind die, Action Surge flat) — diverse trackers
 *  • Reaction feature (Uncanny Dodge) — untracked reaction card
 *  • Expertise × 3, proficiency × 5 — full skill spread
 *  • SRD + custom equipment, tracked + untracked, potion formula
 *  • Mid-combat session: round 5 ({@link MOCK_COMBAT_ROUND}), concentration,
 *    conditions, all currency filled
 *  • Partial death saves (deathSucc/deathFail > 0) — death-save UI
 *  • Speed as plain numeric string — formatted via formatSpeed()
 *  • All lore fields filled — lore page completeness
 *  • Combat algorithm — algorithm page
 */

import type { CharacterDoc } from "@/types/character";
import { assertNonEmptyString } from "@/lib/non-empty-string";
import { asRaceId } from "@/data/srd-names";
import { asAlignmentId } from "@/lib/lore-utils";
import { concentrationValue } from "@/lib/concentration";

export const MOCK_CHARACTER: CharacterDoc = {
  id: "lyra-voss-1",
  createdAt: new Date("2025-03-10"),
  updatedAt: new Date("2026-05-25"),
  portraitUrl: null,
  portraitCrop: null,
  shareId: null,
  status: "active",

  character: {
    name: assertNonEmptyString("Lyra Voss"),
    quote: "Every silence hides a song; I just have to find it.",
    race: asRaceId("elf"),
    // R4 — `classes[]` is the SOLE source of truth for the class breakdown (single-
    // class = one entry). Total level (9), PB, the headline class name and every
    // level-keyed value DERIVE from it via `src/lib/classes.ts` — no legacy
    // `class`/`subclass`/`classId`/`subclassId`/`level` projection is stored.
    classes: [{ classId: "bard", subclassId: "college-of-lore", level: 9 }],
    background: "criminal",
    alignment: asAlignmentId("chaotic-good"),
    playerName: "Salvatore",
    speed: "30", // plain number; formatted via formatSpeed()
    // Lyra's armour is unstructured prose (armorNote below), so computeAC can't
    // derive it — it would fall back to unarmoured (10 + DEX = 13). The 17 is
    // therefore a genuine OVERRIDE (override-first), which keeps the sheet header
    // (derivedAc) and the roster card (raw ac) in agreement at the intended value.
    ac: 17,
    acOverride: 17,
    armorNote: "Studded Leather + DEX +3",
    hp: { max: 62 },
    hitDieType: 8,
    // Initiative is auto-computed; no override. (The legacy `initiativeBonus` slot
    // was deleted from the type — golden rule 10.)
    initiativeBonusOverride: null,
    // Manual language/tool picks as STABLE IDS (never localized display strings).
    languageIds: ["common", "elvish", "draconic", "thieves-cant"],
    customLanguages: [],
    toolProficiencyIds: ["lute", "viol", "flute", "thieves-tools"], // instruments owned; thieves' tools from Criminal
    customToolProficiencies: [],
    abilityBudget: 27,
    proficiencyBonusOverride: null,
    levelUpChecklist: null,
    backgroundAsi: {},
    humanOriginFeat: "",
    // No `bgFeat` slug stored — the Criminal Origin feat (Alert) is
    // DERIVED from `background: "criminal"` (declare the least, infer the
    // rest). The Features page surfaces it via `deriveOriginFeats`.
    bgFeat: "",

    lore: {
      traits:
        "I treat every conversation like an improvised performance, adapting to the audience in real time. I compulsively hum when I'm thinking.",
      ideals:
        "Knowledge is power only when shared. Hoarding secrets stifles the world as surely as hoarding gold.",
      bonds:
        "My twin brother Cael disappeared into the Underdark three years ago. Every coin I earn goes toward finding him.",
      flaws:
        "I lie reflexively, even when the truth would serve me better. Old habit from a childhood spent in travelling troupes.",
      backstory:
        "Lyra grew up in an elven enclave on the outskirts of a trade city on the Vesper Coast. She discovered her gift for Bardic magic at fifteen, when she accidentally charmed an entire tavern into a peaceful stupor during a bar brawl. The College of Lore accepted her at seventeen; she graduated early, already fluent in four languages and three combat styles. When her brother vanished, she left the College with a lute, a rapier, and a list of names.",
      age: "26",
      height: "5'7\"",
      weight: "140 lbs",
      eyes: "Amber (shift to gold when casting)",
      hair: "Dark auburn, usually half-pinned",
      skin: "Warm olive",
    },

    abilityScores: {
      STR: 8,
      DEX: 16,
      CON: 14,
      INT: 14,
      WIS: 10,
      CHA: 20,
    },
    savingThrows: ["DEX", "CHA"],
    // CHOICES ONLY — stored `skills` holds the real proficient/expertise picks.
    // Jack of All Trades' half-proficiency in every other skill is DERIVED at
    // render from the `bard-jack-of-all-trades` feature (#57), so the half-dots
    // light up via `mergeSkillProficiencies` without being baked here.
    skills: {
      // Expertise (College of Lore + standard Bard)
      deception: "expertise",
      performance: "expertise",
      persuasion: "expertise",
      // Proficient
      acrobatics: "proficient",
      history: "proficient",
      insight: "proficient",
      perception: "proficient",
      stealth: "proficient",
    },

    spellcasting: {
      ability: "CHA",
      // 2024 Bards ARE prepared casters. Bard 9 prepares level + CHA mod = 9 + 5
      // = 14 spells (cantrips are always-prepared and don't count). This exercises
      // the cast-summary "PREPARED n/max" stat + the over-limit UI.
      preparedCaster: true,
      preparedMax: 14,
      saveDCOverride: null,
      attackBonusOverride: null,
    },
    // Bard 9 slots: 4 / 3 / 3 / 3 / 1
    spellSlots: [
      { level: 1, total: 4 },
      { level: 2, total: 3 },
      { level: 3, total: 3 },
      { level: 4, total: 3 },
      { level: 5, total: 1 },
    ],

    spells: [
      // Cantrips (4 — always-prepared, never carry a prepared flag)
      { srdId: "vicious-mockery" },
      { srdId: "minor-illusion" },
      { srdId: "mage-hand" },
      { srdId: "prestidigitation" },
      // Leveled spells (13 prepared / 14 limit, exercises the prepared-count UI
      // just under the at-limit threshold) + 1 UNPREPARED (Charm Person) so the
      // dim/italic "unprepared → Prepare to cast" state renders in QA + baselines
      // (domain rule D7: the single mock must exercise ALL edge cases).
      // Level 1
      { srdId: "healing-word", prepared: true },
      { srdId: "thunderwave", prepared: true },
      { srdId: "sleep", prepared: true },
      { srdId: "bane", prepared: true },
      { srdId: "charm-person", prepared: false },
      // Level 2
      { srdId: "shatter", prepared: true },
      { srdId: "suggestion", prepared: true },
      { srdId: "misty-step", prepared: true },
      // Long-name stress (No-Truncation Rule, DESIGN.md §3): the longest plausible
      // Bard spell name in IT ("Individuazione dei Pensieri", 27 chars) so the
      // with-prep card family exercises name WRAPPING at phone width in QA,
      // baselines, and the mobile-layout no-truncation gate. Unprepared, so the
      // prepared count (13/14) is untouched.
      { srdId: "detect-thoughts", prepared: false },
      // Level 3 (includes Magical Secrets)
      { srdId: "hypnotic-pattern", prepared: true },
      { srdId: "counterspell", prepared: true },
      { srdId: "fear", prepared: true },
      // Level 4
      { srdId: "dimension-door", prepared: true },
      { srdId: "polymorph", prepared: true },
      // Level 5 (Additional Magical Secrets at 6)
      { srdId: "hold-monster", prepared: true },
    ],

    weapons: [
      { srdId: "rapier", quantity: 1 },
      {
        srdId: "dagger",
        quantity: 2,
        notes: "One silver-tipped, one poisoned (antitoxin in pouch)",
      },
      { srdId: "shortbow", quantity: 1, notes: "Kept slung for emergencies" },
      // Versatile weapon — exercises the two-hand wield-stance toggle (item g):
      // a quarterstaff is "Versatile (1d8)", so its combat card offers a
      // one-handed / two-handed stance.
      {
        srdId: "quarterstaff",
        quantity: 1,
        notes: "Walking staff, oak with silver caps",
      },
    ],

    equipment: [
      // Tracked consumable — exercises potion-formula UI. Stored as a MINIMAL ref
      // (just srdId + quantity); isConsumable / isPotion / potionFormula / tracked all
      // DERIVE from the SRD entry, so this renders identically to a picker-added potion.
      { srdId: "potion-of-healing", quantity: 3 },
      // Plain SRD gear (weight 5 lb, no charges / formula) — exercises the D6 weight
      // readout on an INERT gear row: its weight feeds the encumbrance sum AND must
      // surface on the expanded card's facts (the facts grid used to be gated behind
      // charges/potionFormula, hiding weight on rows like this one).
      { srdId: "crowbar", quantity: 1 },
      // Long-name stress (No-Truncation Rule, DESIGN.md §3): the longest SRD
      // equipment name in IT ("Dotazione da Esploratore di Dungeon", 35 chars) so
      // the gear card family exercises name WRAPPING at phone width in QA,
      // baselines, and the mobile-layout no-truncation gate.
      { srdId: "dungeoneers-pack", quantity: 1 },
      // SRD magic item by REFERENCE (golden rule 7 — the code speaks the
      // stable id; name / description / attunement DERIVE from the SRD entry +
      // i18n at render). The custom-path fixture is covered by "Cael's Antidote
      // Vial" below, so this one carries no display name.
      { srdId: "brooch-of-shielding", quantity: 1 },
      // Custom consumable — exercises manual recovery + a genuine homebrew name
      // (NOT an SRD item name: golden rule 7 — only true user input is a string).
      {
        custom: true,
        name: "Cael's Antidote Vial",
        description: "Advantage on saving throws against poison for 1 hour.",
        emoji: "⚗️",
        tracked: true,
        quantity: 2,
        recovery: "manual",
      },
      // Custom non-tracked flavour item
      {
        custom: true,
        name: "Cael's Last Letter",
        description:
          "A water-damaged letter in her brother's handwriting, half-legible. The last word is clearly 'run'.",
        emoji: "📜",
        tracked: false,
      },
    ],

    features: [
      // ── Bard features (class-appropriate) ───────────────────────────────
      { srdId: "bard-bardic-inspiration" }, // tracked die (d8), bonus action
      { srdId: "bard-jack-of-all-trades" }, // passive
      { srdId: "bard-font-of-inspiration" }, // short-rest recharge
      { srdId: "bard-expertise" }, // passive
      { srdId: "bard-countercharm" }, // action, untracked

      // ── Cross-class features (testing diverse action card types) ─────────
      { srdId: "fighter-second-wind" }, // bonus action, short-rest tracker, d10 heal
      { srdId: "fighter-action-surge" }, // free action, short-rest tracker, flat
      { srdId: "rogue-uncanny-dodge" }, // reaction, no tracker
      // NOTE: the Criminal Origin feat (Alert) is intentionally NOT listed
      // here — it is DERIVED from `background: "criminal"` and surfaces under
      // "Feats" via `deriveOriginFeats`. The mock declares only irreducible
      // facts; the engine infers the rest.
      //
      // NOTE (#D23): fully deriving class features from class+level (so these
      // bard entries could also be dropped) is a separate, higher-blast-radius
      // task — the level-up wizard's scaling section, combat, and spells all read
      // `features[]` today. Deferred to a dedicated session (owner decision).
    ],

    combatAlgorithm: [
      {
        emoji: "control",
        title: "Battlefield Control",
        steps: [
          {
            question: "Are 2+ enemies within 90 ft, not immune to charm?",
            bullets: [
              "YES → Hypnotic Pattern (concentration, 30-ft cube, up to 10 enemies incapacitated)",
              "NO → Continue to single-target options",
            ],
          },
          {
            question: "Is a dangerous spell being cast?",
            indent: true,
            bullets: [
              "YES → Counterspell (reaction, 60 ft)",
              "NO → Vicious Mockery (psychic damage + disadvantage on next attack)",
            ],
          },
        ],
      },
      {
        emoji: "support",
        title: "Support & Healing",
        steps: [
          {
            question: "Is an ally at 0 HP?",
            bullets: [
              "YES → Healing Word (bonus action, 60 ft) keeps your main action free",
              "NO → Bardic Inspiration (bonus action, 60 ft) to the ally most likely to attack",
            ],
          },
          {
            question: "Maintaining concentration on Hypnotic Pattern?",
            bullets: [
              "YES → Stay at range, cantrips only: Vicious Mockery, Minor Illusion for positioning",
              "NO → Misty Step to reposition if threatened; Shatter for clustered melee enemies",
            ],
          },
        ],
      },
      {
        emoji: "melee",
        title: "Last Resort: Melee",
        steps: [
          {
            question: "Cornered in melee with no slots?",
            bullets: [
              "Action Surge + Rapier attack: expend Action Surge before going down",
              "Uncanny Dodge (reaction) to halve damage on one hit while retreating",
              "Second Wind (bonus action) for emergency d10+9 healing if bloodied",
            ],
          },
        ],
      },
    ],

    customConditions: ["Heroism Active"],
    sidebar: [],
  },

  session: {
    hp: {
      current: 38,
      temp: 5,
    },
    hitDice: { used: 2 },
    // Elven Lineage is a creation-time `choice-grant-bundle` (bundleKey
    // "elf-lineage"). Lyra is a High Elf — seed the pick so the Lore page
    // demonstrates the POPULATED lineage state (chosen label in play mode,
    // selected pill in edit mode) and the lineage's always-prepared spells
    // (Prestidigitation, Detect Magic @3, Misty Step @5) inject via the grant
    // pipeline like any real character.
    grantBundleChoices: { "elf-lineage": "high-elf" },
    trackers: {
      "bard-bardic-inspiration": { used: 2 }, // 2/5 used (5 total at CHA 20)
      "fighter-second-wind": { used: 1 }, // expended this encounter
      "fighter-action-surge": { used: 0 }, // held in reserve
    },
    spellSlots: {
      "1": { used: 2 }, // 2 Healing Words cast
      "3": { used: 2 }, // Hypnotic Pattern + Counterspell
    },
    currency: { pp: 0, gp: 340, ep: 5, sp: 22, cp: 8 },
    // Concentration stores the spell's STABLE srdId (golden rule 7); the rail /
    // toasts / combat log localize it for display (concentrationLabel).
    concentration: concentrationValue("hypnotic-pattern"),
    initiative: "12",
    conditions: ["frightened"], // from captain's Frightful Presence — lowercase id so the gate resolves (CONDITION_GATES / resolveConditionEffects key by lowercase id, matching the UID-picker)
    deathSucc: 2, // was dropped, stabilised — tests death-save UI
    deathFail: 1,
    inspiration: true,
    exhaustion: 0,
    pinnedActions: [],
    unpinnedActions: [],
    notes:
      "Session 11: Hold the Thornwall Bridge. The garrison captain (CR 7) has Frightful Presence: need WIS save ≥ 14 or Frightened for 1 min. Hypnotic Pattern holding 5 guards on east flank. Cael's contact said the letter was posted from here. Don't let the captain reach the bell tower.",
    logEntries: [
      // Events-as-data: each entry is a STRUCTURED `CombatEvent` (ids + numbers,
      // locale-independent) — the presenter localizes the line + glyph + hue at
      // render, so the log reads fully in the active language and a language
      // switch re-localizes the whole feed. `slot` (action/bonus/reaction) drives
      // the row COLOUR; the event's `effect` drives the GLYPH. Non-action events
      // (condition, death save, rest) keep their semantic hue.
      {
        event: {
          kind: "action-use",
          // The action's NAME as the engine's localizable LocText reference — an `srd`
          // catalogue id-ref the presenter resolves via `localizeText` (golden rules
          // 12 + 22), so the row re-localizes on a language switch.
          action: { srd: { kind: "spell", key: "hypnotic-pattern", field: "name" } },
          effect: "spell-cast",
          slot: "action",
        },
        ts: 1716400000000,
        id: "mock-log-1",
      },
      {
        event: {
          kind: "action-use",
          action: {
            srd: { kind: "class-feature", key: "bard-bardic-inspiration", field: "name" },
          },
          effect: "tracker-use",
          slot: "bonus",
        },
        ts: 1716400060000,
        id: "mock-log-2",
      },
      {
        event: {
          kind: "reaction-use",
          action: { srd: { kind: "spell", key: "counterspell", field: "name" } },
          effect: "spell-cast",
        },
        ts: 1716400120000,
        id: "mock-log-3",
      },
      {
        event: { kind: "hp-damage", amount: 17, current: 0, max: 62 },
        ts: 1716400150000,
        id: "mock-log-4",
      },
      {
        event: { kind: "death-save", outcome: "failure", successes: 2, failures: 1 },
        ts: 1716400180000,
        id: "mock-log-5",
      },
      {
        event: { kind: "hp-heal", amount: 9, current: 9, max: 62 },
        ts: 1716400240000,
        id: "mock-log-6",
      },
      {
        event: { kind: "condition-gain", conditionId: "frightened" },
        ts: 1716400300000,
        id: "mock-log-7",
      },
    ],
  },
};

/**
 * Lyra's canonical SOLO combat round — she is mid-combat at round 5 (the log above
 * shows a fight in progress). Round is no longer a `session` field; it lives in the
 * turn engine + the `combat/state` subdoc, so dev-bypass seeds it from here (see
 * `useCharacterSubscription`).
 */
export const MOCK_COMBAT_ROUND = 5;

/**
 * R4 — the MULTICLASS mock (ONE mock, derived from {@link MOCK_CHARACTER}, never a
 * second independent fixture). Lyra cross-classed into Wizard: Bard 7 / Wizard 2
 * (total level 9, so PB + every level-keyed value is unchanged from the single-class
 * mock). Exercises the multiclass `classes[]` array, the 2024 Multiclass Spellcaster
 * slot table (two full casters → combined caster level 9), and the per-entry feature
 * derivation. Reuses the base mock's identity/lore/session so only the class
 * breakdown differs — extend THIS for a new multiclass edge case, don't fork a third.
 */
export const MOCK_MULTICLASS_CHARACTER: CharacterDoc = {
  ...MOCK_CHARACTER,
  id: "lyra-voss-multiclass",
  character: {
    ...MOCK_CHARACTER.character,
    name: assertNonEmptyString("Lyra Voss (Bard/Wizard)"),
    classes: [
      { classId: "bard", subclassId: "college-of-lore", level: 7 },
      { classId: "wizard", subclassId: "evoker", level: 2 },
    ],
  },
};
