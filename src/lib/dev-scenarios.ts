/**
 * Dev-only SCENARIO builder — inject ANY character into the local
 * `DEV_BYPASS_AUTH` preview without Firebase, so an agent can self-validate a
 * mechanic on the exact class/subclass/level that exercises it (then screenshot
 * it for the owner to LOOK at). The general counterpart of the 6 frozen team
 * fixtures (`dev-fixtures.ts`).
 *
 * Visit `/characters/scn-life-cleric` (or any id in `DEV_SCENARIOS`) under
 * `VITE_DEV_BYPASS_AUTH=true` and the cockpit renders that BUILT character. A
 * scenario is built from a concise spec — class/subclass/level + ability scores
 * + spells — with the full feature list **inferred** via the same engine the
 * Features tab uses (`buildGrantedFeatures`) and spell slots read from the class
 * table. "Declare the least, infer the rest" (golden rule 2): you name the
 * choices, the engine fills the derived mechanics, so a scenario can't drift from
 * what a real character of that build would have.
 *
 * One-mock compliant (domain rule D7, docs/GOLDEN_RULES.md): scenarios are dev/test FIXTURES derived
 * from the single canonical `MOCK_CHARACTER` (spread + override the class-defining
 * fields, reset the Bard-specific ones), never a parallel production mock.
 * Prod-safe: the only caller is the dead `DEV_BYPASS_AUTH` branch in
 * `useCharacterSubscription`.
 *
 * **To add a scenario: append one entry to `DEV_SCENARIOS`.** No other wiring.
 */
import type { AbilityCode } from "@/data/types";
import type {
  CharacterDoc,
  CharacterData,
  ClassEntry,
  SessionState,
  SrdSpellRef,
  SrdFeatureRef,
} from "@/types/character";
import { classTableIndex, getClassTable } from "@/data/classes";
import { abilityModifier } from "@/lib/ability";
import { buildGrantedFeatures } from "@/lib/character-build";
import { inferSpeed, inferSpellcasting } from "@/lib/character-infer";
import { deriveSpellSlots } from "@/lib/multiclass-slots";
import { MOCK_CHARACTER } from "@/lib/mock";
import { assertNonEmptyString } from "@/lib/non-empty-string";
import { asRaceId } from "@/data/srd-names";
import { mergePackRecord } from "@/lib/pack-merge";
import { packScenarios } from "@pack";
import {
  resolveStartingEquipment,
  type ToolChoiceContext,
} from "@/data/background-equipment";
import { getBackgroundEquipmentOptions } from "@/data/backgrounds";
import {
  toolChoiceContextForBackground,
  toolChoiceContextForClass,
} from "@/lib/resolve-grant-sources";
import { DEV_SCENARIO_PREFIX } from "@/lib/dev-scenario-id";
import { slotUsageKey } from "@/lib/cast-options";
import { getBeast } from "@/data/beasts";
import { polymorphBuildPatch, polymorphPriorSnapshot } from "@/lib/polymorph";
import { concentrationValue } from "@/lib/concentration";

export interface ScenarioSpec {
  /** Display name shown in the header. */
  name: string;
  /** Race id (drives `buildGrantedFeatures` + display), e.g. `"human"`. */
  raceId: string;
  /** Class id, e.g. `"cleric"`. */
  classId: string;
  /** Subclass id, e.g. `"life-domain"`; omit for a base-class scenario. */
  subclassId?: string;
  level: number;
  /**
   * R4 — ADDITIONAL classes for a MULTICLASS scenario. When present, the build is
   * a multiclass character: `classId`/`subclassId`/`level` above are the PRIMARY
   * (first) class and these are the rest. `totalLevel` = sum of all entry levels;
   * spell slots use the 2024 multiclass caster table. Omit for single-class.
   */
  secondaryClasses?: Array<{ classId: string; subclassId?: string; level: number }>;
  /** Background slug, e.g. `"acolyte"`. */
  background: string;
  abilityScores: Record<AbilityCode, number>;
  /**
   * Stored skill PROFICIENCY picks (`skillId → "proficient" | "expertise" |
   * "halfProficiency"`), keyed by the 18 SRD skill ids. Models the CHOICE-stored
   * proficiencies a created character carries in `character.skills` — e.g. a
   * a species Skill-Versatility one-skill pick or a class/background skill
   * choice. The rail Skills section reads these (merged with grant-derived
   * proficiencies) and shows the proficient dot. Empty by default.
   */
  skills?: Record<string, "proficient" | "expertise" | "halfProficiency">;
  /** SRD spell refs (cantrips never carry a `prepared` flag). */
  spells?: SrdSpellRef[];
  /** Chosen Eldritch Invocations (Warlock), SRD ids. */
  invocationChoices?: string[];
  /** Chosen Metamagic options (Sorcerer), SRD ids — for the per-cast affordance. */
  metamagicChoices?: string[];
  /** Weapon Mastery picks (SRD weapon ids) riding the PRIMARY class entry —
   *  exercises the owned-mastery chip gating on the unified weapon cards. */
  weaponMasteries?: string[];
  /** `while-active` feature keys to start toggled ON. */
  activeFeatures?: string[];
  /** Single-select `choice-grant-bundle` picks to start with, `bundleKey → optionId`
   *  (e.g. `{ "armorer-armor-model": "guardian" }` for the Armorer model weapon). */
  grantBundleChoices?: Record<string, string>;
  /** Carried weapons (AX — exercises the weapon-row seams). */
  weapons?: CharacterData["weapons"];
  /** Carried equipment / magic items (AX — enchant + conversion seams). */
  equipment?: CharacterData["equipment"];
  /**
   * Tool-proficiency CHOICE picks (concrete tool ids), keyed by SOURCE — `"class"`
   * for the Monk/Bard level-1 tool choice, `"background"` for a "Choose one kind of
   * <X>" background. When present, the scenario runs the REAL creation resolution:
   * the chosen tool id is stored in `toolChoices` and drives BOTH the DERIVED tool
   * proficiency AND the `fromToolChoice` starting-equipment item (golden rule 6)
   * — never a baked free-text string (golden rule 7) — so the scenario is
   * a faithful model of the wizard's output (e.g. a Monk with an instrument-choice
   * background: `{ class: ["smiths-tools"], background: ["bagpipes"] }`). The class + background
   * Option-A starting kits are merged in (overriding the empty `weapons`/`equipment`
   * default) when any pick is given.
   */
  toolPicks?: { class?: string[]; background?: string[] };
  /** EXTRA feature refs beyond the derived build (e.g. a feat under test). */
  extraFeatures?: SrdFeatureRef[];
  /** Walking speed as a plain number string (default `"30"`). */
  speed?: string;
  /** A short, human-facing note on what mechanic this scenario exercises. */
  exercises?: string;
  /**
   * Session tracker SPEND state to start with (e.g. `{ "bard-bardic-inspiration":
   * { used: 4 } }`) — for verifying recovery/top-up mechanics that only fire when
   * something is expended. Empty by default.
   */
  sessionTrackers?: Record<string, { used: number }>;
  /** Session spell-slot SPEND state (keyed by slot level), e.g. `{ "2": { used: 2 } }`. */
  sessionSpellSlots?: Record<string, { used: number }>;
  /**
   * Starting CURRENT HP (default = full = the rolled max). Set BELOW half-max to
   * start the scenario Bloodied — for HP-band surfaces (the S5 Bloodied mark, the
   * S8 start-of-turn regen banner, death-save states). Clamped to [0, max].
   */
  sessionHpCurrent?: number;
  /**
   * Active session CONDITIONS to start with (SRD condition ids, e.g.
   * `["stunned"]`) — seeds `session.conditions`. For the condition-projection
   * surfaces: the Stats rail's (LeftHud) crimson save auto-fail mark (Stunned /
   * Paralyzed auto-fail STR + DEX saves) and the turn-limiters banner's
   * blocked-economy line (the Incapacitated family forbids Action/Bonus/Reaction).
   * Empty by default. Unknown ids simply have no gate and are skipped.
   */
  conditions?: string[];
  /**
   * S7 — start ALREADY polymorphed into this Beast (id). Applies the SAME swap the
   * store's `assumePolymorphForm` does: stamps the Beast's AC/speeds/scores into the
   * override fields, sets Temp HP = the Beast's HP, engages Concentration on Polymorph,
   * and records `session.polymorphForm`. For the transformed-cockpit + active-form-
   * banner surfaces (the LeftHud reads the swapped AC/scores; the Spells tab shows the
   * banner). Ignored when the id isn't a catalogued Beast.
   */
  startingForm?: string;
}

/**
 * Apply a starting Polymorph form to a built doc — the dev-fixture mirror of the
 * store's `assumePolymorphForm` (single source: the same `polymorph.ts` helpers),
 * so a "starts transformed" scenario is a faithful model of a mid-session form.
 */
function applyStartingForm(doc: CharacterDoc, beastId: string): CharacterDoc {
  const beast = getBeast(beastId);
  if (!beast) return doc;
  const prior = polymorphPriorSnapshot(doc);
  const patch = polymorphBuildPatch(beast, prior);
  return {
    ...doc,
    character: { ...doc.character, ...patch },
    session: {
      ...doc.session,
      hp: { ...doc.session.hp, temp: Math.max(doc.session.hp.temp, beast.hp) },
      concentration: concentrationValue("polymorph"),
      polymorphForm: { beastId, spellId: "polymorph", prior },
    },
  };
}

const abilityMod = (scores: Record<AbilityCode, number>, a: AbilityCode): number =>
  abilityModifier(scores[a]);

/** Build a full, renderable CharacterDoc from a concise scenario spec. */
export function buildScenario(spec: ScenarioSpec): CharacterDoc {
  const table = classTableIndex.get(spec.classId);

  // R4 — the multiclass `classes[]`: the primary class first, then any secondaries.
  // Per-class picks (here just Warlock invocations) ride ON the owning entry.
  const classes: ClassEntry[] = [
    {
      classId: spec.classId,
      ...(spec.subclassId ? { subclassId: spec.subclassId } : {}),
      level: spec.level,
      ...(spec.invocationChoices?.length
        ? { invocationChoices: spec.invocationChoices }
        : {}),
      ...(spec.metamagicChoices?.length
        ? { metamagicChoices: spec.metamagicChoices }
        : {}),
      ...(spec.weaponMasteries?.length ? { weaponMasteries: spec.weaponMasteries } : {}),
    },
    ...(spec.secondaryClasses ?? []).map((c) => ({
      classId: c.classId,
      ...(c.subclassId ? { subclassId: c.subclassId } : {}),
      level: c.level,
    })),
  ];
  const totLevel = classes.reduce((sum, c) => sum + c.level, 0);

  // Race traits do NOT live in features[] — they resolve from `character.race`
  // via resolveGrantSourcesForRace (so don't double-count them). Mirror the
  // canonical features[] / `inferFeatures` shape: class + subclass for EVERY class.
  const features = classes.flatMap((c) =>
    buildGrantedFeatures({
      classId: c.classId,
      level: c.level,
      subclassId: c.subclassId ?? "",
      raceId: "",
      originFeat: "",
      bgFeat: "",
    })
  );
  // The ONE slot derivation seam — single-class table slots (Pact Magic flagged),
  // third-caster subclasses, and the 2024 multiclass caster table alike.
  const spellSlots = deriveSpellSlots(classes);
  // Derive the spellcasting block + speed the SAME way the minimal codec infers
  // them, so a scenario is itself a model of the minimal-representation target
  // (declare the choices; infer the rest) and round-trips to an empty delta.
  const spellcasting = inferSpellcasting({
    classId: spec.classId,
    subclassId: spec.subclassId,
    level: spec.level,
  });

  const hitDie = (table?.hitDie ?? 8) as 4 | 6 | 8 | 10 | 12;
  const conMod = abilityMod(spec.abilityScores, "CON");
  const avgHd = Math.floor(hitDie / 2) + 1;
  const hpMax = Math.max(1, hitDie + conMod + (totLevel - 1) * (avgHd + conMod));

  // Tool-CHOICE resolution — run the SAME creation seam the wizard uses, so the
  // scenario faithfully models a created character (a Monk with a tool-choice background):
  // the chosen tool drives BOTH the derived proficiency (via `toolChoices` ids →
  // the synthetic grant source) AND the `fromToolChoice` starting-equipment item,
  // never the umbrella (golden rule 6 + the umbrella-leak rule). The tool picks
  // are namespaced exactly as `collectChoiceSlots` does and STORED as ids in
  // `toolChoices` — the proficiency is then DERIVED, never baked as free-text.
  const toolKit = resolveScenarioToolKit(spec);

  const character: CharacterData = {
    ...MOCK_CHARACTER.character,
    name: assertNonEmptyString(spec.name),
    race: asRaceId(spec.raceId),
    classes,
    background: spec.background,
    backgroundAsi: {},
    humanOriginFeat: "",
    bgFeat: "",
    quote: "",
    speed: spec.speed ?? (inferSpeed({ race: spec.raceId }) || "30"),
    abilityScores: spec.abilityScores,
    savingThrows: table?.savingThrows ?? [],
    skills: spec.skills ?? {},
    // A scenario models a FRESHLY-CREATED character: the manual language/tool id
    // lists start fresh (Common only; the mock's Bard tongues/instruments don't
    // belong on an arbitrary build). Tool/language proficiencies come from grants +
    // the `toolChoices` ids below — never a baked display string.
    languageIds: ["common"],
    customLanguages: [],
    toolProficiencyIds: [],
    customToolProficiencies: [],
    spellcasting,
    spellSlots,
    spells: spec.spells ?? [],
    weapons: toolKit
      ? [...(spec.weapons ?? []), ...toolKit.weapons]
      : (spec.weapons ?? []),
    equipment: toolKit
      ? [...(spec.equipment ?? []), ...toolKit.equipment]
      : (spec.equipment ?? []),
    // The chosen tool ids land in `toolChoices` (the id-based home); the tool
    // PROFICIENCY is DERIVED from them at render (no baked free-text string).
    ...(toolKit?.toolChoices ? { toolChoices: toolKit.toolChoices } : {}),
    features: spec.extraFeatures ? [...features, ...spec.extraFeatures] : features,
    combatAlgorithm: [],
    customConditions: [],
    acOverride: null,
    ac: 10 + abilityMod(spec.abilityScores, "DEX"),
    armorNote: "",
    hp: { max: hpMax },
    hitDieType: hitDie,
  };

  const sessionSlots: Record<string, { used: number }> = {};
  // Key each pool by the canonical `slotUsageKey` (B3) — `pact-<level>` for a
  // Pact-Magic pool, `String(level)` for a normal one — so a dev Sorlock seeds its
  // two same-level pools under distinct counters (no parallel keying convention).
  for (const r of spellSlots) sessionSlots[slotUsageKey(r)] = { used: 0 };
  // Apply any scenario spell-slot SPEND overrides (for recovery verification).
  for (const [k, v] of Object.entries(spec.sessionSpellSlots ?? {})) {
    sessionSlots[k] = v;
  }

  const session: SessionState = {
    ...MOCK_CHARACTER.session,
    hp: {
      current:
        spec.sessionHpCurrent != null
          ? Math.max(0, Math.min(spec.sessionHpCurrent, hpMax))
          : hpMax,
      temp: 0,
    },
    hitDice: { used: 0 },
    trackers: { ...(spec.sessionTrackers ?? {}) },
    spellSlots: sessionSlots,
    concentration: "",
    initiative: "",
    conditions: spec.conditions ?? [],
    deathSucc: 0,
    deathFail: 0,
    inspiration: false,
    bardicInspirationDie: "",
    exhaustion: 0,
    pinnedActions: [],
    unpinnedActions: [],
    activeFeatures: spec.activeFeatures ?? [],
    grantBundleChoices: { ...(spec.grantBundleChoices ?? {}) },
    logEntries: [],
  };

  const doc: CharacterDoc = {
    ...MOCK_CHARACTER,
    id: "",
    portraitUrl: null,
    portraitCrop: null,
    character,
    session,
  };
  return spec.startingForm ? applyStartingForm(doc, spec.startingForm) : doc;
}

/**
 * Resolve a scenario's tool-CHOICE picks into the merged starting kit + the
 * `toolChoices` ids — the SAME seam the creation wizard runs
 * (`resolveStartingEquipment` with each source's `ToolChoiceContext`; the picks
 * are stored as ids in `toolChoices`, the proficiency DERIVED). Returns
 * `undefined` when the scenario declares no picks (the common case — the scenario
 * keeps its explicit `weapons`/`equipment`). The picks are namespaced
 * `<sourceId>::tool-slot-0`, matching `collectChoiceSlots`, so a created
 * character's stored `toolChoices` key is identical to the wizard's.
 */
function resolveScenarioToolKit(spec: ScenarioSpec):
  | {
      weapons: CharacterData["weapons"];
      equipment: CharacterData["equipment"];
      toolChoices: Record<string, string[]>;
    }
  | undefined {
  const picks = spec.toolPicks;
  if (!picks || (!picks.class?.length && !picks.background?.length)) return undefined;

  // The canonical id-based home — slot id → chosen tool ids (the SAME keying the
  // wizard's `collectChoiceSlots`/`applyToolPicks` produces).
  const toolChoices: Record<string, string[]> = {};
  if (picks.class?.length) {
    toolChoices[`class:${spec.classId}::tool-slot-0`] = picks.class;
  }
  if (picks.background?.length) {
    toolChoices[`${spec.background}::tool-slot-0`] = picks.background;
  }

  // The `fromToolChoice` pack item derives from the SAME picks (single source).
  const classCtx: ToolChoiceContext | undefined = toolChoiceContextForClass(
    spec.classId,
    toolChoices
  );
  const bgCtx: ToolChoiceContext | undefined = toolChoiceContextForBackground(
    spec.background,
    toolChoices
  );

  const cls = resolveStartingEquipment(
    getClassTable(spec.classId)?.startingEquipment,
    "A",
    classCtx
  );
  const bg = resolveStartingEquipment(
    getBackgroundEquipmentOptions(spec.background),
    "A",
    bgCtx
  );

  return {
    weapons: [...cls.weapons, ...bg.weapons],
    equipment: [...cls.equipment, ...bg.equipment],
    toolChoices,
  };
}

/**
 * The scenario registry — the named builds an agent can load by id. Add one
 * entry to inject a new build; nothing else needs wiring. Each `exercises` note
 * says what mechanic the scenario is there to validate.
 */
const PUBLIC_SCENARIOS: Record<string, ScenarioSpec> = {
  "life-cleric": {
    name: "Mirovel, Life Cleric",
    raceId: "human",
    classId: "cleric",
    subclassId: "life-domain",
    level: 5,
    background: "acolyte",
    abilityScores: { STR: 12, DEX: 10, CON: 14, INT: 10, WIS: 18, CHA: 12 },
    spells: [
      { srdId: "sacred-flame" },
      { srdId: "guidance" },
      { srdId: "cure-wounds", prepared: true },
      { srdId: "healing-word", prepared: true },
      { srdId: "bless", prepared: true },
      { srdId: "spiritual-weapon", prepared: true },
    ],
    exercises:
      "heal-bonus (Disciple of Life): a healing spell's verdict gains +2 + spell level. S11b: Divine Spark heal-or-damage (1d8+WIS, both chips) + Sear Undead (WIS-many d8 Radiant).",
  },
  "bg3-projection": {
    // The BG3 can/cannot projection — the condition surfaces. A Cleric 5
    // (WIS 18) STUNNED: the Stats rail (LeftHud) shows the crimson AUTO-FAIL mark on
    // the STR + DEX save medallions (Stunned auto-fails both), and the Play tab's
    // turn-limiters banner shows the blocked-economy line "You can't take Action,
    // Bonus, Reaction (Stunned)". The proficient WIS/CHA saves + skill proficiencies
    // give the rail its on-demand BreakdownTip triggers. Visit
    // `/characters/scn-bg3-projection`.
    name: "Auria, Stunned Cleric",
    raceId: "human",
    classId: "cleric",
    subclassId: "life-domain",
    level: 5,
    background: "acolyte",
    abilityScores: { STR: 12, DEX: 10, CON: 14, INT: 10, WIS: 18, CHA: 12 },
    skills: { insight: "proficient", medicine: "proficient", perception: "proficient" },
    spells: [
      { srdId: "sacred-flame" },
      { srdId: "guidance" },
      { srdId: "cure-wounds", prepared: true },
      { srdId: "bless", prepared: true },
    ],
    conditions: ["stunned"],
    exercises:
      "condition projection: Stunned surfaces the Stats rail's (LeftHud) crimson auto-fail mark on STR + DEX saves AND the turn-limiters blocked-economy line (You can't take Action, Bonus, Reaction (Stunned)); proficient saves/skills carry the BreakdownTip.",
  },
  "s13-speed": {
    // S13 — the effective walking Speed reaching the UI. A low-STR (8) Wizard
    // (no armor proficiency) wearing equipped chain mail (Str req 13) + Boots of
    // Speed: with the boots toggled ON the effective Speed = (30 base) × 2 −
    // 10 (heavy-armor Strength penalty) = 50 ft; the unproficient-armor
    // Disadvantage (STR/DEX checks + saves + attacks) shows in the combat
    // adv/dis list. Toggle the boots OFF → 30 − 10 = 20 ft.
    name: "Vesp, the Overburdened Mage",
    raceId: "human",
    classId: "wizard",
    level: 5,
    background: "sage",
    abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 18, WIS: 12, CHA: 10 },
    equipment: [
      { srdId: "chain-mail", equipped: true },
      { srdId: "boots-of-speed", equipped: true, attuned: true },
    ],
    activeFeatures: ["boots-of-speed"],
    exercises:
      "S13 effective Speed: Boots of Speed ×2 (G12) − heavy-armor Strength penalty (G11) reaches the Speed vital; unproficient-armor Disadvantage (G13) shows in the combat adv/dis list.",
  },
  "evoker-wizard": {
    name: "Pyra, Evoker Wizard",
    raceId: "gnome",
    classId: "wizard",
    subclassId: "evoker",
    level: 10,
    background: "sage",
    abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 18, WIS: 12, CHA: 10 },
    spells: [
      { srdId: "fire-bolt" },
      { srdId: "fireball", prepared: true },
      { srdId: "magic-missile", prepared: true },
    ],
    exercises:
      "spell-damage-bonus schools filter (Empowered Evocation → +INT to Evocation spell damage).",
  },
  "potent-druid": {
    // Elemental Fury (L7) Potent Spellcasting — the `druid-elemental-fury` choice
    // picks `potent-spellcasting`, a `spell-damage-bonus` (cantripOnly, +WIS,
    // scope: druid). At WIS 18 (+4) the consumer appends +4 to every damaging
    // Druid cantrip's formula: Produce Flame (2d8 Fire at L7 — the 5th-level
    // damage step) reads "2d8+4 Fire" on the Play-tab combat card (the riderized
    // `summary.damage`). Levelled Druid spells stay untouched. Swap the choice to
    // Primal Strike → the rider RETRACTS.
    name: "Maelis, Elemental Druid",
    raceId: "human",
    classId: "druid",
    level: 7,
    background: "sage",
    abilityScores: { STR: 10, DEX: 14, CON: 14, INT: 10, WIS: 18, CHA: 8 },
    grantBundleChoices: { "druid-elemental-fury": "potent-spellcasting" },
    spells: [{ srdId: "produce-flame" }],
    exercises:
      "Elemental Fury Potent Spellcasting (+WIS to any Druid cantrip): Produce Flame's combat-card damage chip reads 2d8+4 Fire (2d8 at L7 + WIS 18 → +4), the riderized summary.damage — levelled spells untouched. Swap to Primal Strike to retract.",
  },
  "open-hand-monk": {
    name: "Kaori, Open Hand Monk",
    raceId: "human",
    classId: "monk",
    subclassId: "open-hand",
    level: 6,
    background: "acolyte",
    abilityScores: { STR: 12, DEX: 18, CON: 14, INT: 10, WIS: 16, CHA: 8 },
    exercises:
      "unarmed-strike attack row (Martial Arts die) + Empowered Strikes Force damage-type choice.",
  },
  // R4 — the MULTICLASS scenario: Wizard 5 / Cleric 3 (total level 8). Two full
  // casters → combined caster level 8 → the 2024 Multiclass Spellcaster slot table
  // (4·4th, 2·5th — strictly more than either class alone). PB +3 from total level 8.
  "wizard-cleric-multiclass": {
    name: "Talenor, Wizard / Cleric",
    raceId: "human",
    classId: "wizard",
    subclassId: "evoker",
    level: 5,
    secondaryClasses: [{ classId: "cleric", subclassId: "life-domain", level: 3 }],
    background: "sage",
    abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 16, WIS: 15, CHA: 10 },
    spells: [
      { srdId: "fire-bolt" },
      { srdId: "sacred-flame" },
      { srdId: "magic-missile", prepared: true },
      { srdId: "cure-wounds", prepared: true },
      { srdId: "fireball", prepared: true },
    ],
    exercises:
      "MULTICLASS: classes[] = Wizard 5 + Cleric 3; total level 8 → PB +3; shared spell slots from the 2024 multiclass caster table (combined caster level 8); per-class features both present.",
  },
  // ENFORCE sweep — Martial Arts die is multiclass-correct: a Monk 8 / Rogue 3
  // Unarmed Strike uses the d6 die at MONK level 8, NOT the d8 a Monk-11 row
  // (total level 11) would give. The Combat Unarmed Strike row reads d6.
  "monk-rogue-multiclass": {
    name: "Ifrom, Open Hand / Thief",
    raceId: "human",
    classId: "monk",
    subclassId: "open-hand",
    level: 8,
    secondaryClasses: [{ classId: "rogue", subclassId: "thief", level: 3 }],
    background: "criminal",
    abilityScores: { STR: 10, DEX: 17, CON: 14, INT: 12, WIS: 15, CHA: 8 },
    weapons: [{ srdId: "shortsword", quantity: 1 }],
    exercises:
      "ENFORCE: Martial Arts die scales by the MONK's own level — Monk 8 / Rogue 3 → Combat Unarmed Strike row shows a d6 die, NOT the d8 the Monk-11 (total) row would give.",
  },
  // Champion's SECOND Fighting Style at L7 (2024 fighter:champion "Additional
  // Fighting Style"). A Champion 6 → the level-up wizard levels to 7 and the
  // choices step surfaces the "Choose a Fighting Style" picker — the 2nd style,
  // DISTINCT from the L1 one already owned (Archery, pre-seeded as a feat ref so
  // the picker excludes it). Visit `/characters/scn-champion-6/level-up`.
  "champion-6": {
    name: "Gareth, Champion",
    raceId: "human",
    classId: "fighter",
    subclassId: "champion",
    level: 6,
    background: "soldier",
    abilityScores: { STR: 18, DEX: 14, CON: 16, INT: 10, WIS: 12, CHA: 8 },
    weapons: [{ srdId: "longsword", quantity: 1 }],
    // The base L1 Fighting Style already chosen (Archery) — it must be EXCLUDED
    // from the 2nd-style picker (distinct, per RAW).
    extraFeatures: [{ srdId: "archery" }],
    exercises:
      "Champion 2nd Fighting Style at L7: levelling 6→7 surfaces the 'Choose a Fighting Style' picker (subclass 'Additional Fighting Style' placeholder), EXCLUDING the already-owned L1 style (Archery) — distinct, per RAW.",
  },
  // LUX owner-feedback — the 3→4 ASI/feat step (the exact step every live team
  // character hits next session): picking a feat with nested choices (Magic
  // Initiate) expands its spell pickers INLINE in a cause-attributed block; met
  // prerequisites are silent; the "More" detail rides the selected card only.
  "fighter-3": {
    name: "Bram, Champion",
    raceId: "human",
    classId: "fighter",
    subclassId: "champion",
    level: 3,
    background: "soldier",
    abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 10 },
    exercises:
      "LUX owner-feedback — 3→4 ASI/feat step: inline cause-attributed nested feat choices (Magic Initiate), unmet-only prerequisite notes, detail-on-selected.",
  },
  // LUX — the Epic Boon gate: a Wizard 18 leveling to 19 hits the L19 'Epic Boon'
  // feature (modelled as an ASI level), so the feat picker now OFFERS the
  // epic-boon category (hidden at every lower level) alongside Origin + General.
  "wizard-18": {
    name: "Archmage Velt",
    raceId: "human",
    classId: "wizard",
    subclassId: "evoker",
    level: 18,
    background: "sage",
    abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 20, WIS: 12, CHA: 10 },
    spells: [
      { srdId: "fire-bolt" },
      { srdId: "fireball", prepared: true },
      { srdId: "shield" },
      { srdId: "counterspell", prepared: true },
    ],
    exercises:
      "LUX — Epic Boon at 19: the 18→19 level-up's feat picker offers epic-boon feats (category facet chip) that are hidden below level 19. Also S4 Arcane Recovery: tapping the action opens the guided cap-enforcing slot picker (a few slots start expended below).",
    // Start a couple of low-level slots expended so the S4 Arcane Recovery picker
    // has something to recover (within the ⌈18/2⌉ = 9 cap).
    sessionSpellSlots: { "1": { used: 2 }, "2": { used: 1 } },
  },
  // EXTRA ATTACK — the no-caster counterpart (Barbarian 5, two weapon rows): both
  // the Greataxe AND Handaxe CTAs turn struck gold together after the first swing
  // (every eligible attack affordance lights — BG3's all-attack-buttons-glow), with
  // no War-Magic spell rows in the mix.
  "barbarian-extra-attack": {
    name: "Vokka, Berserker",
    raceId: "orc",
    classId: "barbarian",
    subclassId: "berserker",
    level: 5,
    background: "soldier",
    abilityScores: { STR: 18, DEX: 14, CON: 16, INT: 8, WIS: 12, CHA: 10 },
    weaponMasteries: ["greataxe", "handaxe"],
    weapons: [
      { srdId: "greataxe", quantity: 1 },
      { srdId: "handaxe", quantity: 2 },
    ],
    exercises:
      "EXTRA ATTACK without spells (Barbarian 5): after the first swing BOTH weapon CTAs (Greataxe + Handaxe) turn struck gold together while the second attack remains — no ring, no label, headers carry no availability text; the last swing drops the gold and dims the attack cards.",
  },
  // S8 ONE-TAP APPLY — the deterministic legs together on the Play tab:
  //  • The start-of-turn REGEN banner (Champion Survivor "Heroic Rally": 5+CON HP
  //    while Bloodied) now carries a one-tap "Heal N" button (undoable). Started
  //    Bloodied (current 70 of 166 max — half is 83) so the banner is ACTIVE.
  //  • Second Wind's heal card carries a ROLL-ENTRY (enter the d10, apply
  //    enteredRoll + Fighter level) — dice stay player-rolled (golden rule 21).
  "survivor-fighter": {
    name: "Korga, Champion Survivor",
    raceId: "orc",
    classId: "fighter",
    subclassId: "champion",
    level: 18,
    background: "soldier",
    abilityScores: { STR: 20, DEX: 14, CON: 16, INT: 8, WIS: 12, CHA: 10 },
    weapons: [{ srdId: "greataxe", quantity: 1 }],
    sessionHpCurrent: 70,
    exercises:
      "S8 one-tap apply: the Bloodied start-of-turn REGEN banner shows a one-tap 'Heal 8' button (5+CON 16 = 8, applyHealing + undo), and the Second Wind card carries a roll-entry (enter the 1d10, then apply roll + Fighter level 18). Dice stay player-rolled (golden rule 21).",
  },
  // WEAPON-CARDS — the unified weapon facts block (owner mandate 2026-06-12):
  // a Fighter carrying a MASTERED Longsword (Sap chip + versatile dual rows),
  // an UNMASTERED Dagger (no mastery chip despite the weapon having Nick;
  // finesse/light/thrown chips with glossary tips), and a Light Crossbow
  // (ammunition/loading/two-handed chips + the ranged 80/320 range fact).
  // Combat and Inventory must render IDENTICAL weapon facts.
  "weapon-cards": {
    name: "Vesper, Weapon Master",
    raceId: "human",
    classId: "fighter",
    subclassId: "champion",
    level: 4,
    background: "soldier",
    abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 8 },
    weapons: [
      { srdId: "longsword", quantity: 1 },
      { srdId: "dagger", quantity: 1 },
      { srdId: "light-crossbow", quantity: 1 },
    ],
    weaponMasteries: ["longsword", "greataxe"],
    exercises:
      "WEAPON-CARDS: the unified WeaponFacts block on Combat + Inventory — mastered Longsword shows the Sap mastery chip on BOTH surfaces, the unmastered Dagger shows none, property chips carry GlossaryTips, range/damage/to-hit rows identical.",
  },
  // RA-13 WEAPON-MASTERY NUMBERS — Fighter L5, STR 16 (+3), PB 3, proficient with
  //  both weapons. The mastered Quarterstaff prints "Topple · DC 14" (8 + STR 3 +
  //  PB 3) and the mastered Glaive "Graze · 3" (= STR mod) on BOTH the Combat
  //  card and the Inventory chip — the ONE buildWeaponFacts seam, identical by
  //  construction (golden rule 6). ("DC"/"CD" is a presenter constant, no i18n
  //  keys.) The Nick economy has its own scenario (`weapon-mastery-nick`), where
  //  the off-hand gate isn't masked by Extra Attack's swing ledger.
  "weapon-mastery-numbers": {
    name: "Dax, Mastery Adept",
    raceId: "human",
    classId: "fighter",
    subclassId: "champion",
    level: 5,
    background: "soldier",
    abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 8 },
    weapons: [
      { srdId: "quarterstaff", quantity: 1 },
      { srdId: "glaive", quantity: 1 },
    ],
    weaponMasteries: ["quarterstaff", "glaive"],
    exercises:
      "RA-13 mastery numbers: the mastered Quarterstaff shows 'Topple · DC 14' (8 + STR 3 + PB 3) and the Glaive 'Graze · 3' (= STR mod) on the Combat card AND the Inventory chip (parity, golden rule 6). Vex/Sap/Slow/Push weapons keep plain reminder chips.",
  },
  // RA-13 NICK ECONOMY + TWF once-per-turn CAP — a Rogue dual-wields a
  //  Nick-mastered Dagger AND a non-Nick Shortsword (both Light). A Rogue has NO
  //  Extra Attack, so a single main-hand swing claims the Action slot as its own
  //  `selected.action` occupant and the off-hand gate opens. Nick moves the
  //  Dagger's off-hand attack from the Bonus Action INTO the Attack action (its
  //  row is emitted `type: "free"` → the FREE economy group, Bonus slot stays
  //  free), while the Shortsword off-hand stays a `bonus`. The Light property
  //  still grants only ONE extra off-hand attack per turn, so committing EITHER
  //  off-hand marks the OTHER "Used" (mutual exclusion across free+bonus — the
  //  cap the uncapped free slot can't enforce alone); undo restores both.
  "weapon-mastery-nick": {
    name: "Nyx, Twin Fangs",
    raceId: "human",
    classId: "rogue",
    subclassId: "thief",
    level: 3,
    background: "criminal",
    abilityScores: { STR: 10, DEX: 16, CON: 12, INT: 12, WIS: 13, CHA: 14 },
    weapons: [
      { srdId: "dagger", quantity: 2 },
      { srdId: "shortsword", quantity: 1 },
    ],
    weaponMasteries: ["dagger"],
    exercises:
      "RA-13 Nick economy + TWF cap: a Nick-mastered Dagger + a non-Nick Shortsword (both Light). Commit a Light main-hand attack → BOTH off-hand rows appear (Dagger off-hand in the FREE group — Nick rides the Attack action; Shortsword off-hand as a Bonus). Commit the Dagger free off-hand → its card reads 'Used', the Bonus slot stays available, AND the Shortsword off-hand now reads 'Used' too (only ONE off-hand attack per turn). Undo restores both.",
  },
  champion: {
    name: "Brakka, Champion",
    raceId: "orc",
    classId: "fighter",
    subclassId: "champion",
    level: 10,
    background: "soldier",
    abilityScores: { STR: 18, DEX: 14, CON: 16, INT: 8, WIS: 12, CHA: 10 },
    weapons: [{ srdId: "longsword", quantity: 1, enchantItemId: "weapon-plus-1" }],
    equipment: [{ srdId: "weapon-plus-1", quantity: 1, equipped: true }],
    exercises:
      "AX Champion exposure: crit 19-20 + on-crit movement gloss on the weapon card, Heroic Warrior inspiration hint in the rail, and the bound Weapon +1 enchant folding into to-hit/damage (Inventory enchant picker).",
  },
  "orc-barb-15": {
    name: "Brakka, Orc Barbarian",
    raceId: "orc",
    classId: "barbarian",
    subclassId: "berserker",
    level: 15,
    background: "soldier",
    abilityScores: { STR: 17, DEX: 14, CON: 16, INT: 8, WIS: 10, CHA: 8 },
    // A Berserker needs a melee weapon to swing — without one the Play board has
    // no weapon attack row, so its Frenzy damage-rider (the +Nd6 on-hit chip)
    // never surfaces. The Greataxe carries the rider at this level (L15 → +3d6).
    weapons: [{ srdId: "greataxe", quantity: 1 }],
    exercises:
      "S4 initiative-tracker-topup (Persistent Rage, L15 → regain all Rage on Initiative) + at-0-HP interrupt (Orc Relentless Endurance → 'Stay at 1 HP' prompt in the DyingBanner). The Greataxe attack card carries the Berserker Frenzy on-hit damage rider (+3d6 slashing, once per turn) in its expanded detail.",
    // Start with Rage uses spent so rolling Initiative tops them back up.
    sessionTrackers: { "barbarian-rage": { used: 2 } },
  },
  // Wizard L20 Signature Spells — two 3rd-level spellbook spells chosen as
  // signature: always prepared (don't count against the prepared budget) and
  // free-castable once each per Short/Long Rest from the L20 `wizard-signature-
  // spells` short-rest pool (total 2). The Spells tab shows the SIGNATURE picker
  // with both selected + a "Signature" badge on each, and the rail's Resources
  // section shows the 2-use short-rest tracker. Modeled with the SAME flags the
  // dedicated `signature-spells-pick` picker stamps (wizardSignatureSpell +
  // alwaysPrepared) — no parallel mechanism (golden rules 3/6/10).
  "signature-wizard-20": {
    name: "Archmagus Thessaly",
    raceId: "human",
    classId: "wizard",
    subclassId: "evoker",
    level: 20,
    background: "sage",
    abilityScores: { STR: 8, DEX: 14, CON: 16, INT: 20, WIS: 12, CHA: 10 },
    spells: [
      { srdId: "fire-bolt" },
      { srdId: "mage-hand" },
      { srdId: "shield", prepared: true },
      { srdId: "magic-missile", prepared: true },
      // The two signature picks — L3 spellbook spells, flagged exactly as the
      // dedicated picker stamps them (always-prepared + free-castable).
      {
        srdId: "fireball",
        prepared: true,
        alwaysPrepared: true,
        wizardSignatureSpell: true,
      },
      {
        srdId: "counterspell",
        prepared: true,
        alwaysPrepared: true,
        wizardSignatureSpell: true,
      },
    ],
    exercises:
      "Wizard L20 Signature Spells: the Spells tab shows the signature picker with both 3rd-level picks (Fireball, Counterspell) selected + a Signature badge on each always-prepared row; the rail's Resources section shows the 2-use short-rest free-cast pool (wizard-signature-spells tracker).",
  },
  // Oath of Devotion Channel Divinity — "Sacred Weapon": while the toggle is LIT
  // (`paladin-devotion-sacred-weapon`), the imbued MELEE weapon gains +CHA modifier
  // (minimum +1) to attack rolls. CHA 20 (+5) makes the bonus visibly NON-trivial,
  // so the Play-tab Longsword to-hit reads with the +5 folded in (and its breakdown
  // tip names "+5 CHA") vs. the base STR+PB without it. Toggle the feature off in
  // the rail's ActivatableFeaturesBar → the to-hit drops back to the base value.
  // Proves the ability-derived `weapon-attack-bonus` (resolved per weapon against
  // the EFFECTIVE CHA, +1 floor clamped) reaches the rendered weapon attack row.
  // S9 — a CHARGED magic-item wand (Wand of Web) carried, attuned + equipped: it
  // grants `always-prepared-spell` (Web → castable on the Play board for any
  // wielder) + `free-cast-spell` (7 charges, regains at dawn). So the Play board
  // surfaces a "Cast Web" affordance whose source is the wand, and the rail's
  // Resources section shows the 7-charge pool tracker keyed by the item id (the
  // SAME id the cast flow debits). A plain Fighter (no native spellcasting) proves
  // the affordance comes from the ITEM, not the class. Two charges start spent so
  // the pool reads 5/7 — the spend state is visible.
  "wand-of-web-fighter": {
    name: "Talon, Wand-Bearer",
    raceId: "human",
    classId: "fighter",
    subclassId: "champion",
    level: 5,
    background: "soldier",
    abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 8 },
    weapons: [{ srdId: "longsword", quantity: 1 }],
    equipment: [{ srdId: "wand-of-web", equipped: true, attuned: true, quantity: 1 }],
    // Two of the 7 charges start expended so the pool reads 5/7 — proves the spend
    // state surfaces (the same item-id key the cast flow debits).
    sessionTrackers: { "wand-of-web": { used: 2 } },
    exercises:
      "S9 charged-wand cast + charge pool: an equipped + attuned Wand of Web makes 'Cast Web' a Play-board affordance for a non-caster Fighter (always-prepared-spell), and the rail Resources section shows the wand's 7-charge pool tracker (free-cast-spell, regains at dawn) reading 5/7 with 2 spent. The cast debits THAT item-id pool.",
  },
  // CASTER Fighting Style (Blessed Warrior) — a Paladin 1 → the level-up wizard
  // levels to 2 (Fighting Style opens at Paladin L2, subclass not until L3) and
  // the choices step surfaces the "Choose a Fighting Style" picker INCLUDING the
  // class-scoped caster style "Blessed Warrior" (a Paladin sees it; a Fighter
  // does not). Picking it expands its 2-Cleric-cantrip sub-pick INLINE under the
  // style (one attribution, rule 19) via the shared FeatureChoicesSection; the
  // chosen cantrips land always-prepared (Charisma pinned) on the spell list.
  // Visit `/characters/scn-blessed-paladin/level-up`.
  "blessed-paladin": {
    name: "Seraphine, Paladin",
    raceId: "human",
    classId: "paladin",
    level: 1,
    background: "acolyte",
    abilityScores: { STR: 16, DEX: 10, CON: 14, INT: 8, WIS: 12, CHA: 17 },
    weapons: [{ srdId: "longsword", quantity: 1 }],
    exercises:
      "CASTER Fighting Style (Blessed Warrior): levelling Paladin 1→2 surfaces the 'Choose a Fighting Style' picker offering the class-scoped Blessed Warrior; selecting it expands its 2-Cleric-cantrip sub-pick INLINE (Charisma pinned, shared FeatureChoicesSection), and the chosen cantrips land always-prepared on the spell list.",
  },
  // CASTER Fighting Style (Druidic Warrior) — a Ranger 1 → the level-up wizard
  // levels to 2 (Fighting Style opens at Ranger L2). The picker offers the
  // class-scoped Druidic Warrior (2 Druid cantrips, Wisdom pinned). Mirror of the
  // Paladin scenario for the other caster style. Visit
  // `/characters/scn-druidic-ranger/level-up`.
  "druidic-ranger": {
    name: "Faelar, Ranger",
    raceId: "human",
    classId: "ranger",
    level: 1,
    background: "outlander",
    abilityScores: { STR: 12, DEX: 16, CON: 14, INT: 10, WIS: 15, CHA: 8 },
    weapons: [{ srdId: "shortbow", quantity: 1 }],
    exercises:
      "CASTER Fighting Style (Druidic Warrior): levelling Ranger 1→2 surfaces the 'Choose a Fighting Style' picker offering the class-scoped Druidic Warrior; selecting it expands its 2-Druid-cantrip sub-pick INLINE (Wisdom pinned), and the chosen cantrips land always-prepared on the spell list.",
  },
  // Boots of Striding and Springing SPEED FLOOR — the `speed-floor` grant
  // (cluster-e3-bootsfloor). A Small race (Halfling) pinned to a 25-ft base
  // walking Speed (every 2024 race is 30; the sub-30 base is modeled via the
  // `speed` override here — the realistic source is a reduced/short-legged Speed),
  // wearing + attuned to the Boots: "your Speed becomes 30 feet unless it is
  // already higher" is modeled as a MAX (floor), so the header Speed vital reads
  // 30 ft — floored UP from 25, not a +30 stack to 55. Proves the engine floors a
  // sub-30 base back to 30 (and would leave a >30 base untouched). The boots
  // require attunement, so they only count when `equipped: true` + `attuned`.
  // Visit `/characters/scn-boots-speed-floor`.
  "boots-speed-floor": {
    name: "Pippin, Boots of Striding",
    raceId: "halfling",
    classId: "rogue",
    subclassId: "thief",
    level: 3,
    background: "criminal",
    abilityScores: { STR: 10, DEX: 16, CON: 14, INT: 10, WIS: 12, CHA: 14 },
    // 25-ft base — the sub-30 walking Speed the Boots floor raises back to 30.
    speed: "25",
    equipment: [
      { srdId: "boots-of-striding-and-springing", equipped: true, attuned: true },
    ],
    exercises:
      "Boots of Striding and Springing SPEED FLOOR: a Halfling Rogue 3 pinned to a 25-ft base walking Speed, wearing + attuned to the Boots, reads 30 ft in the header Speed vital — the `speed-floor` grant MAXes the sub-30 base up to 30 ('Speed becomes 30 unless already higher'), never stacking +30 onto the base. Remove/un-attune the Boots → the Speed drops back to 25.",
  },

  // S6 LEG 3 — Pact of the Chain warlock with Investment of the Chain Master: the
  // invocation detail (Compendium / Features re-picker "More") shows the familiar
  // enhancements callout (Fly/Swim 40 ft, Quick Attack, Necrotic/Radiant damage,
  // the owner's spell save DC, Reaction Resistance). Display-only.
  "chain-master": {
    name: "Ysolde, Chain Warlock",
    raceId: "tiefling",
    classId: "warlock",
    subclassId: "fiend",
    level: 7,
    background: "criminal",
    abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 18 },
    invocationChoices: [
      "pact-of-the-chain",
      "investment-of-the-chain-master",
      "agonizing-blast",
    ],
    spells: [{ srdId: "eldritch-blast" }, { srdId: "find-familiar", prepared: true }],
    exercises:
      "S6 familiar enhancements: the Investment of the Chain Master invocation detail (Compendium → Invocations, or the Features re-picker 'More') carries the familiar buffs callout — Fly/Swim 40 ft, Quick Attack, Necrotic/Radiant damage, the owner's spell save DC (CHA, via the spells-view presenter), Reaction Resistance. Display-only.",
  },
  // S8 ONE-TAP APPLY — slot-less DETERMINISTIC temp-HP card: Fiend Warlock's
  // Dark One's Blessing ("when you reduce an enemy to 0 HP, gain CHA + warlock
  // level temp HP") surfaces as a FREE standalone card that now ONE-TAP-APPLIES
  // the temp HP (gainTempHp, max-wins, undo + the useGainedTempHp toast).
  "darkblessing-warlock": {
    name: "Malphas, Fiend Warlock",
    raceId: "tiefling",
    classId: "warlock",
    subclassId: "fiend-patron",
    level: 6,
    background: "criminal",
    abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 18 },
    spells: [{ srdId: "eldritch-blast" }, { srdId: "hex", prepared: true }],
    exercises:
      "S8 one-tap apply: Dark One's Blessing (CHA 18 +4, warlock 6 = 10 temp HP) surfaces as a FREE standalone card that one-tap-applies the temp HP (gainTempHp max-wins + undo + the useGainedTempHp toast) — no re-typing into the rail.",
  },
  // Magical Secrets RAW: a College of Lore Bard at L10 leveling to 11 — the
  // prepared-spell pool widens to Bard ∪ Cleric ∪ Druid ∪ Wizard and stays
  // widened for EVERY Bard level from 10 on (defect A: the old gate fired only on
  // L10). The level-up spell step + swap step both offer cross-list picks (e.g.
  // Guiding Bolt / Find Familiar) yet still EXCLUDE off-union (warlock-only)
  // spells like Hex/Eldritch Blast (defect B).
  "lore-bard-10": {
    name: "Vaelith, Lore Bard",
    raceId: "elf",
    classId: "bard",
    subclassId: "college-of-lore",
    level: 10,
    background: "sage",
    abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 12, WIS: 10, CHA: 18 },
    spells: [
      { srdId: "vicious-mockery" },
      { srdId: "minor-illusion" },
      { srdId: "healing-word", prepared: true },
      { srdId: "dissonant-whispers", prepared: true },
      { srdId: "hypnotic-pattern", prepared: true },
    ],
    exercises:
      "Magical Secrets RAW: 10→11 level-up spell + swap pools widen to Bard∪Cleric∪Druid∪Wizard (persistent for every L10+ level), but exclude warlock-only spells. widenedSpellListsAtLevel.",
  },
  "font-sorcerer": {
    name: "Vessa, Sorcerer",
    raceId: "dragonborn",
    classId: "sorcerer",
    subclassId: "draconic-sorcery",
    level: 10,
    background: "sage",
    abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 18 },
    // Four known Metamagic options spanning the per-cast affordance behaviours:
    // Quickened (primary, Action-time) + Distant (primary, broad) + Empowered
    // (STACKER, damage) + Heightened (save-only). The one-primary rule (BUG-6)
    // lets one primary at a time with Empowered on top; cantrip applicability
    // (G6/W3) gates each: Fire Bolt (1d10 fire ranged attack) offers Quickened/
    // Distant/Empowered but NOT save-only Heightened.
    metamagicChoices: [
      "quickened-spell",
      "distant-spell",
      "empowered-spell",
      "heightened-spell",
    ],
    spells: [
      { srdId: "fire-bolt" },
      { srdId: "fireball", prepared: true },
      { srdId: "misty-step", prepared: true },
    ],
    exercises:
      "AX resource-conversion affordance: Font of Magic Create-spell-slot / Convert-slot-into-points pickers in the rail Resources section (options pre-validated against pool + slots). S6 per-cast Metamagic: casting Fireball OR the Fire Bolt cantrip (G6/W3 — Metamagic now applies to cantrips, spending SP but no slot) opens the cast modal with the amethyst chips + the one-primary rule (BUG-6: a second primary swaps the first; Empowered stacks on top); selecting debits the Sorcery-Point pool (undoable).",
  },
  "superior-bard-18": {
    name: "Talliel, Lore Bard",
    raceId: "elf",
    classId: "bard",
    subclassId: "college-of-lore",
    level: 18,
    background: "sage",
    abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 12, WIS: 10, CHA: 20 },
    spells: [
      { srdId: "vicious-mockery" },
      { srdId: "healing-word", prepared: true },
      { srdId: "hypnotic-pattern", prepared: true },
    ],
    exercises:
      "S4 initiative-tracker-topup: Superior Inspiration (L18) — on rolling Initiative, regain Bardic Inspiration up to two (toast names the source, undoable).",
    // Start with Bardic Inspiration nearly exhausted so rolling Initiative has
    // something to top up (remaining 1 < the floor of 2).
    sessionTrackers: { "bard-bardic-inspiration": { used: 4 } },
  },
  "devotion-paladin": {
    name: "Auriel, Oath of Devotion",
    raceId: "human",
    classId: "paladin",
    subclassId: "oath-of-devotion",
    level: 6,
    background: "acolyte",
    abilityScores: { STR: 16, DEX: 10, CON: 14, INT: 8, WIS: 12, CHA: 20 },
    weapons: [{ srdId: "longsword", quantity: 1 }],
    activeFeatures: ["paladin-devotion-sacred-weapon"],
    exercises:
      "Sacred Weapon to-hit: with the `paladin-devotion-sacred-weapon` toggle LIT, the Longsword attack row's to-hit gains +CHA mod (CHA 20 → +5, min +1) on the melee weapon (breakdown tip names '+5 CHA'); toggling off in the rail drops it back to base STR + PB. Proves the ability-derived weapon-attack-bonus reaches the rendered weapon row.",
  },
  // PRIM-resource-conversion `pact-slot` — Warlock Magical Cunning (L2). A Fiend
  // Warlock 5 starts with BOTH Pact-Magic slots (pool of 2, slot level 3)
  // expended, so the rail's Resources section surfaces the "Restore Pact Slots"
  // conversion affordance offering "Regain 1 Pact Magic slot" (⌈2/2⌉, clamped to
  // what is expended) with the 1/Long-Rest Magical Cunning charge available.
  // Visit `/characters/scn-magical-cunning-warlock` (Play tab, Resources rail).
  "magical-cunning-warlock": {
    name: "Carric, Fiend Warlock",
    raceId: "tiefling",
    classId: "warlock",
    subclassId: "fiend-patron",
    level: 5,
    background: "criminal",
    abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 18 },
    spells: [
      { srdId: "eldritch-blast" },
      { srdId: "hex", prepared: true },
      { srdId: "scorching-ray", prepared: true },
    ],
    // Both Pact-Magic slots (level 3 at Warlock 5) spent → the Magical Cunning
    // conversion has something to regain (key `pact-3` per `slotUsageKey`).
    sessionSpellSlots: { "pact-3": { used: 2 } },
    exercises:
      "PRIM-resource-conversion pact-slot — Magical Cunning (L2): with both Pact-Magic slots expended (pool 2, level 3) and the 1/Long-Rest charge available, the Resources rail shows the 'Restore Pact Slots' affordance offering 'Regain 1 Pact Magic slot' (⌈2/2⌉). Clicking commits the un-expend with an undo toast.",
  },
  // PRIM-resource-conversion `pact-slot` — Eldritch Master (L20) UPGRADES Magical
  // Cunning to restore the FULL Pact-Magic pool. A Warlock 20 has 4 Pact slots
  // (slot level 5); with all 4 expended the affordance offers "Regain 4 Pact
  // Magic slots" (the whole pool, not ⌈4/2⌉ = 2) — proving the `restoresAll` flag
  // flips off the STABLE `warlock-eldritch-master` feature id (golden rule 7).
  // Visit `/characters/scn-eldritch-master-warlock` (Play tab, Resources rail).
  "eldritch-master-warlock": {
    name: "Vesperan, Fiend Warlock",
    raceId: "tiefling",
    classId: "warlock",
    subclassId: "fiend-patron",
    level: 20,
    background: "criminal",
    abilityScores: { STR: 8, DEX: 14, CON: 16, INT: 10, WIS: 12, CHA: 20 },
    spells: [
      { srdId: "eldritch-blast" },
      { srdId: "hex", prepared: true },
      { srdId: "scorching-ray", prepared: true },
    ],
    // All 4 Pact-Magic slots (level 5 at Warlock 20) spent → Eldritch Master
    // regains the FULL pool (key `pact-5` per `slotUsageKey`).
    sessionSpellSlots: { "pact-5": { used: 4 } },
    exercises:
      "PRIM-resource-conversion pact-slot — Eldritch Master (L20): with all 4 Pact-Magic slots expended (pool 4, level 5), the Resources rail's 'Restore Pact Slots' affordance offers 'Regain 4 Pact Magic slots' (the FULL pool via restoresAll, NOT ⌈4/2⌉ = 2). Proves Eldritch Master upgrades Magical Cunning, gated on the stable feature id's level.",
  },
  // S9 multi-spell charged ITEMS — the four items that cast ONE OF several spells
  // from a shared item-charge pool with PER-SPELL costs (the pool-picker polish
  // target). All four EQUIPPED + ATTUNED (the ring needs no attunement, but is
  // held anyway): Wand of Binding (Hold Monster 5 / Hold Person 2, 7-charge pool),
  // Wand of Fear (Command 1 / Fear 3, 7-charge pool), Ring of Animal Influence
  // (Animal Friendship / Speak with Animals, 1 each, 3-charge pool), Staff of
  // Charming (Charm Person / Command / Comprehend Languages, 1 each, 10-charge
  // pool). The Play board surfaces one `item-cast-<id>` pool-picker card per item;
  // opening the Wand of Binding picker shows the per-spell cost pills AND — with 3
  // of its 7 charges pre-spent (remaining 4) — Hold Monster DISABLED (costs 5 > 4)
  // while Hold Person (2) stays castable. The rail Resources section shows each
  // item's shared charge-pool row. Visit `/characters/scn-multi-spell-items?tab=play`.
  "multi-spell-items": {
    name: "Cordelia, the Beguiler",
    raceId: "human",
    classId: "bard",
    level: 5,
    background: "sage",
    abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 10, WIS: 12, CHA: 18 },
    equipment: [
      { srdId: "wand-of-binding", equipped: true, attuned: true },
      { srdId: "wand-of-fear", equipped: true, attuned: true },
      { srdId: "ring-of-animal-influence", equipped: true, attuned: true },
      { srdId: "staff-of-charming", equipped: true, attuned: true },
    ],
    // 3 of the Wand of Binding's 7 charges pre-spent (remaining 4) so its picker
    // shows Hold Monster (cost 5) DISABLED and Hold Person (cost 2) still castable.
    sessionTrackers: { "wand-of-binding": { used: 3 } },
    exercises:
      "S9 multi-spell charged items: four equipped+attuned items (Wand of Binding, Wand of Fear, Ring of Animal Influence, Staff of Charming) each surface an `item-cast-<id>` pool-picker card on the Play board + a shared charge-pool row in the rail Resources; the Wand of Binding picker shows per-spell cost pills (Hold Monster 5 / Hold Person 2) with Hold Monster DISABLED at 4 charges remaining (3 of 7 pre-spent).",
  },
};

/**
 * The scenario registry, composed: public (SRD-only) scenarios + the pack's
 * scenarios (which exercise pack content and exist only in pack mode).
 */
export const DEV_SCENARIOS: Record<string, ScenarioSpec> = mergePackRecord(
  "dev-scenario",
  PUBLIC_SCENARIOS,
  packScenarios
);

/** Build a scenario CharacterDoc from a route id, or null if unknown. */
export function buildDevScenario(id: string): CharacterDoc | null {
  const key = id.startsWith(DEV_SCENARIO_PREFIX)
    ? id.slice(DEV_SCENARIO_PREFIX.length)
    : id;
  const spec = DEV_SCENARIOS[key];
  if (!spec) return null;
  return { ...buildScenario(spec), id };
}

/** A tiny inline "uploaded portrait" (SVG bust on a tinted gradient) so gallery
 *  tiles exercise the real-portrait path offline — visibly a picture, never
 *  mistakable for the tinted-initial monogram fallback. */
function devPortrait(from: string, to: string): string {
  return (
    "data:image/svg+xml," +
    encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${from}'/><stop offset='1' stop-color='${to}'/></linearGradient></defs><rect width='96' height='96' fill='url(#g)'/><circle cx='48' cy='38' r='17' fill='#f5ead1' opacity='.92'/><path d='M18 88c0-17 13-28 30-28s30 11 30 28z' fill='#f5ead1' opacity='.92'/></svg>`
    )
  );
}

/**
 * The dev-bypass FULL-ROSTER gallery (`d20-dev-roster=1`) — the roster's own
 * verification fixture set (rule 15: the one-mock bypass roster can't exercise the
 * grid, the filter threshold, portraits vs monograms, long names, wounded HP bands,
 * or the retired/fallen tiles). Each entry is a registered scenario re-dressed as a
 * lived-in character: a player-typed name (genuine user input — rule 7 governs ids,
 * not prose), a lifecycle status, a portrait or the monogram fallback, an HP band,
 * and a spread of `updatedAt` ages for the relative-time corner. Dev/test-only,
 * loaded through the same lazy `import()` seam every scenario consumer uses.
 */
export function buildDevRosterDocs(now = Date.now()): CharacterDoc[] {
  const ago = (min: number) => new Date(now - min * 60_000);
  const dress = (
    id: string,
    patch: {
      name?: string;
      status?: CharacterDoc["status"];
      portraitUrl?: string;
      hpPct?: number;
      agoMin: number;
    }
  ): CharacterDoc | null => {
    // A roster tile whose scenario is pack content simply drops out of the
    // SRD-only composition (the registry is the single source of truth).
    const doc = buildDevScenario(id);
    if (!doc) return null;
    const hp =
      patch.hpPct === undefined
        ? doc.session.hp
        : {
            ...doc.session.hp,
            current: Math.round((doc.character.hp.max * patch.hpPct) / 100),
          };
    return {
      ...doc,
      id: `roster-${id}`,
      status: patch.status ?? "active",
      portraitUrl: patch.portraitUrl ?? null,
      updatedAt: ago(patch.agoMin),
      character: patch.name
        ? { ...doc.character, name: assertNonEmptyString(patch.name) }
        : doc.character,
      session: { ...doc.session, hp },
    };
  };
  const docs: Array<CharacterDoc | null> = [
    // The mock (Lyra Voss, Elf Bard 9, wounded) leads — the roster keeps its one
    // production mock as the first tile, exactly as the plain bypass roster does.
    { ...MOCK_CHARACTER, id: "mock-1", updatedAt: ago(12) },
    dress("wizard-18", {
      portraitUrl: devPortrait("#4a3a6a", "#c9a227"),
      hpPct: 100,
      agoMin: 45,
    }),
    // The no-truncation probe: a long player-typed name that must wrap, never clip.
    dress("life-cleric", {
      name: "Sister Beatrice of the Everlasting Dawn",
      hpPct: 62,
      agoMin: 60 * 5,
    }),
    dress("battlemaster-fighter", {
      portraitUrl: devPortrait("#5a2f22", "#8a6d3b"),
      hpPct: 34,
      agoMin: 60 * 26,
    }),
    dress("soulknife-rogue", { hpPct: 9, agoMin: 60 * 24 * 3 }),
    dress("wildheart-barbarian", { hpPct: 100, agoMin: 60 * 24 * 9 }),
    dress("open-hand-monk", { hpPct: 78, agoMin: 60 * 24 * 21 }),
    dress("shifter-ranger", { hpPct: 55, agoMin: 60 * 24 * 40 }),
    // Lifecycle tiles: a retired hero (Restore in the kebab) and a fallen one.
    dress("goo-warlock", { status: "retired", agoMin: 60 * 24 * 80 }),
    dress("polearm-fighter", {
      name: "Borin Ashvale",
      status: "dead",
      agoMin: 60 * 24 * 200,
    }),
  ];
  return docs.filter((d): d is CharacterDoc => d !== null);
}
