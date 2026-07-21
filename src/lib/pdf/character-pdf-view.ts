/**
 * The character-sheet PDF VIEW-MODEL — a pure, fully-localized, render-ready
 * projection of a `CharacterDoc`, assembled ONLY from the existing engine
 * presenters (`lib/views/*`, `compute.ts`, `aggregate-character.ts`,
 * `smart-tracker.ts`). The PDF renderer (`character-pdf.ts`) maps over this
 * structure with ZERO D&D logic and ZERO raw-data reads — exactly like a React
 * cockpit panel consumes the same presenters.
 *
 * Why a dedicated VM rather than the renderer reading presenters directly: the
 * renderer is the only async/byte-producing half (pdf-lib), so isolating the
 * derivation here keeps it pure + table-test-able over the fixtures (every
 * fixture → a parseable VM with the expected sections), and guarantees the PDF
 * shows the SAME override-affected numbers the cockpit shows — both read one
 * source.
 *
 * Localization line (R2): this module is a CONSUMER (a presenter/view), so it MAY
 * localize — it takes the active `locale` AND a bound i18next `t` (the SAME
 * `t("skills.*")` / `t("abilities.*")` / `t("character.*")` keys the cockpit
 * panels use, so the labels are byte-identical to the UI). Engine-core stays
 * i18n-free; this is one layer up.
 */

import type { CharacterDoc } from "@/types/character";
import type { AbilityCode, Recovery } from "@/data/types";
import { totalLevel, primaryClassId, getClasses } from "@/lib/classes";
import {
  ALL_ABILITIES,
  ALL_SKILLS,
  abilityModifier,
  effectiveProficiencyBonus,
  savingThrowBonus,
  skillBonus,
  passiveScore,
  effectiveAbilityScores,
  resolveAbilityCheckBonus,
  computeInitiative,
  characterHasFeat,
  flatSaveBonus,
} from "@/lib/compute";
import { evaluateGrants } from "@/lib/grants";
import { aggregateCharacterGrants, effectiveAC } from "@/lib/aggregate-character";
import { resolveGrantSourcesForFeatures } from "@/lib/resolve-grant-sources";
import { effectiveWalkingSpeedFt } from "@/lib/smart-tracker";
import { getEquipment } from "@/data/equipment";
import {
  mergeSkillProficiencies,
  mergeSaveProficiencies,
  deriveSensesAndSpeeds,
  deriveImmunities,
  displayLanguages,
  displayToolProficiencies,
} from "@/lib/views/sheet-view";
import {
  localizeCharacterIdentity,
  localizeBackgroundName,
  localizeClassName,
  localizeRaceName,
  localizeSubclassName,
} from "@/lib/views/srd-i18n";
import { localizeActions } from "@/lib/views/combat-action-view";
import {
  localizeTrackers,
  localizeTrackerUnit,
  conditionLabel,
} from "@/lib/views/tracker-view";
import { buildSpellsViewModel, type SpellsViewModel } from "@/lib/views/spells-view";
import { buildInventoryViewModel } from "@/lib/views/inventory-view";
import { buildGrantedFeatures, deriveOriginFeats } from "@/lib/character-build";
import { localizeSrd, hasSrd } from "@/i18n/resolver";
import { classFeatureIndex, getClassTable } from "@/data/classes";
import { getRace, raceFeatureIndex, raceTraitCatKey } from "@/data/races";
import { FEATS_BY_ID } from "@/data/feats";
import {
  castingTimeI18nKey,
  formatSpeed,
  formatWeight,
  localeDistance,
} from "@/lib/utils";
import type { SrdFeatureRef, CustomFeature } from "@/types/character";
import type { Locale } from "@/lib/locale";

/** The bound translator the renderer/VM share with the cockpit (i18next `t`). */
export type Translate = (key: string, opts?: Record<string, unknown>) => string;

/** Folio modifier convention rendered ASCII-safe for the PDF (sanitized later). */
function fmtMod(mod: number): string {
  return mod >= 0 ? `+${mod}` : `-${Math.abs(mod)}`;
}

export interface PdfAbilityVM {
  code: AbilityCode;
  label: string;
  /** Full ability name ("Strength") for the sheet's ability-block header. */
  fullName: string;
  score: number;
  modifier: string;
  save: string;
  saveProficient: boolean;
}

export interface PdfSkillVM {
  id: string;
  name: string;
  /** Stable ability code — the renderer GROUPS skills under their ability
   *  (the 2024 sheet's signature arrangement). */
  ability: AbilityCode;
  abilityShort: string;
  bonus: string;
  state: "proficient" | "expertise" | "half" | "none";
}

export interface PdfPassiveVM {
  label: string;
  value: number;
}

export interface PdfLineVM {
  label: string;
  value: string;
}

export interface PdfActionVM {
  name: string;
  /** Action / Bonus / Reaction … timing label, localized. */
  timing: string;
  detail: string;
}

export interface PdfTrackerVM {
  label: string;
  /** Resolved total uses / pool size (from the class table at the current level). */
  total: number;
  /** Uses already spent this rest (session) — `total - used` = remaining. */
  used: number;
  /** Localized recovery cadence ("Short Rest" / "Long Rest" / "Dawn" / "Manual");
   *  "" for a `per-turn` pool (auto-resets each turn — no rest word applies). */
  recovery: string;
  /** Die badge ("d8") when the tracker rolls a die, else "". */
  die: string;
  /** Localized pool unit ("HP" / "points") when a pool, else "". */
  unit: string;
  /** Pool-style (HP-like) resource — drawn as a numeric count, never pips. */
  isPool: boolean;
}

export interface PdfFeatureVM {
  name: string;
  source: string;
  description: string;
  /** Stable kind — the renderer routes features to panels by THIS, never by the
   *  localized `source` string (golden rule 7). */
  kind: "class" | "race" | "feat" | "custom";
}

export interface PdfWeaponVM {
  name: string;
  attack: string;
  damage: string;
  notes: string;
}

export interface PdfItemVM {
  name: string;
  detail: string;
}

export interface PdfSpellLevelVM {
  /** Spell level (0 = cantrips) for the table's Level column. */
  level: number;
  /** Localized heading ("Cantrips" / "Level 1" …). */
  heading: string;
  /** Localized slot suffix ("3 slots") for leveled groups, else null. */
  slots: string | null;
  spells: Array<{
    name: string;
    castingTime: string;
    range: string;
    concentration: boolean;
    ritual: boolean;
    material: boolean;
    prepared: boolean;
  }>;
}

export interface PdfSpellcastingVM {
  ability: string;
  modifier: string;
  saveDC: string;
  attackBonus: string;
  prepared: string | null;
  levels: PdfSpellLevelVM[];
}

/** Coins by denomination — the sheet's CP/SP/EP/GP/PP boxes. */
export interface PdfCurrency {
  cp: number;
  sp: number;
  ep: number;
  gp: number;
  pp: number;
}

/** Armor-training proficiency flags — the sheet's Light/Medium/Heavy/Shields pips. */
export interface PdfArmorTraining {
  light: boolean;
  medium: boolean;
  heavy: boolean;
  shields: boolean;
}

/**
 * Every STATIC label the official-layout sheet prints, pre-localized via i18n
 * KEYS so the renderer stays i18n-free (it never sees a literal). Each value is
 * `t(<existing-or-pdf.sheet.* key>)`. Reuses existing chrome keys wherever one
 * exists; only genuinely-new captions live under `pdf.sheet.*`.
 */
export interface PdfSheetLabels {
  // header
  characterName: string;
  className: string;
  subclass: string;
  species: string;
  background: string;
  level: string;
  xp: string;
  // combat cluster
  armorClass: string;
  shield: string;
  hitPoints: string;
  current: string;
  max: string;
  temp: string;
  hitDice: string;
  spent: string;
  deathSaves: string;
  successes: string;
  failures: string;
  // secondary stat bar
  proficiencyBonus: string;
  initiative: string;
  speed: string;
  size: string;
  passivePerception: string;
  // ability block
  score: string;
  modifier: string;
  savingThrow: string;
  // panels
  weaponsTitle: string;
  colName: string;
  colAtk: string;
  colDamage: string;
  colNotes: string;
  classFeatures: string;
  speciesTraits: string;
  feats: string;
  equipmentTraining: string;
  // resources panel (page 3+)
  resources: string;
  colUses: string;
  colRecovery: string;
  armorTraining: string;
  armorLight: string;
  armorMedium: string;
  armorHeavy: string;
  armorShields: string;
  weapons: string;
  tools: string;
  heroicInspiration: string;
  // page 2
  appearance: string;
  backstory: string;
  alignment: string;
  languages: string;
  attunement: string;
  coins: string;
  spellSlots: string;
  total: string;
  expended: string;
  spellTable: string;
  cp: string;
  sp: string;
  ep: string;
  gp: string;
  pp: string;
  spellcasting: string;
  spellSaveDc: string;
  spellAttack: string;
  equipment: string;
  castingTime: string;
  rangeLabel: string;
  crmC: string;
  crmR: string;
  crmM: string;
  spellcastingAbility: string;
  spellcastingModifier: string;
  spellSaveDcFull: string;
  spellAttackBonus: string;
}

/** The complete, localized, render-ready PDF view-model for one character. */
export interface CharacterPdfViewModel {
  locale: Locale;
  name: string;
  /** "Elf · Bard 9" identity line, localized. */
  identity: string;
  /** Header meta rows (background · alignment · player). */
  meta: PdfLineVM[];
  /** The page footer line ("Exported from d20 Folio"). */
  footer: string;

  abilities: PdfAbilityVM[];
  skills: PdfSkillVM[];
  passives: PdfPassiveVM[];
  /** Senses + non-walking speeds, localized + unit-formatted. */
  sensesSpeeds: PdfLineVM[];

  proficiencies: PdfLineVM[];
  defenses: PdfLineVM[];

  actions: PdfActionVM[];
  weapons: PdfWeaponVM[];
  trackers: PdfTrackerVM[];

  features: PdfFeatureVM[];
  equipment: PdfItemVM[];

  /** Null when the character is not a spellcaster (no spell page). */
  spellcasting: PdfSpellcastingVM | null;

  // ── official-sheet additions ──
  /** All static printed labels, pre-localized (renderer is i18n-free). */
  labels: PdfSheetLabels;
  /** Localized creature size ("Medium", "Small / Medium"); "" when unknown. */
  size: string;
  /** Temp HP (session). */
  tempHp: number;
  /** Hit dice spent (session). */
  hitDiceUsed: number;
  /** Death-save bubbles filled (session). */
  deathSucc: number;
  deathFail: number;
  /** Heroic Inspiration held (session). */
  inspiration: boolean;
  /** Coins by denomination. */
  currency: PdfCurrency;
  /** Armor-training pips (Light/Medium/Heavy/Shields). */
  armorTraining: PdfArmorTraining;
  /** Attuned magic-item names (the equipment panel's attunement list). */
  attunement: string[];
  /** Localized languages + tool proficiencies (display strings). */
  languages: string;
  tools: string;
  /** Localized weapon-training categories (e.g. "Simple, Martial"). */
  weaponsTraining: string;
  /** Backstory & personality + alignment (page-2 detail panels). */
  backstory: string;
  alignment: string;
  /** Separated, localized header values for the identity panel. */
  header: {
    species: string;
    classes: string;
    subclass: string;
    background: string;
  };
  /** Total character level (sum across classes). */
  totalLevel: number;
  /** Combat-box values, already formatted for display. */
  combat: {
    ac: string;
    initiative: string;
    speed: string;
    hpCurrent: number;
    hpMax: number;
    hitDice: string;
    pb: string;
  };
}

type SkillProficiency = "proficient" | "expertise" | "halfProficiency";
const DOT_STATE: Record<SkillProficiency, "proficient" | "expertise" | "half"> = {
  proficient: "proficient",
  expertise: "expertise",
  halfProficiency: "half",
};

/**
 * Assemble the complete PDF view-model for a character — pure, localized via the
 * passed `t` + `locale`. Mirrors `LeftHud` / the cockpit panels exactly so every
 * override-affected value (AC, saves, skills, passives, prepared max …) matches
 * the on-screen sheet by construction (single source — the presenters).
 */
export function buildCharacterPdfViewModel(
  doc: CharacterDoc,
  locale: Locale,
  t: Translate
): CharacterPdfViewModel {
  const charData = doc.character;
  const session = doc.session;
  const level = totalLevel(charData);
  const pb = effectiveProficiencyBonus(level, charData.proficiencyBonusOverride);
  const exhaustion = session.exhaustion;
  const activeFeatures = session.activeFeatures;
  const grantBundleChoices = session.grantBundleChoices;

  // Feature-scoped aggregate (granted skill/save proficiencies) + full aggregate
  // (ability-score floors, senses, immunities) — the SAME two LeftHud derives.
  const aggregate = evaluateGrants(
    resolveGrantSourcesForFeatures(charData.features),
    new Set(activeFeatures ?? [])
  );
  const fullAggregate = aggregateCharacterGrants(charData, {
    activeFeatures,
    grantBundleChoices,
  });

  const effectiveScores = effectiveAbilityScores(
    charData.abilityScores,
    fullAggregate.abilityScoreFloors,
    fullAggregate.itemAbilityScoreBonus,
    fullAggregate.itemAbilityScoreCap
  );

  const displayedSaves = mergeSaveProficiencies(
    charData.savingThrows,
    aggregate.saveProficiencies
  );
  // B8 — the all-saves ability-keyed bonus (Aura of Protection +CHA) scales with
  // the CURRENT (effective) score, so a CHA-boosting item raises it (RAW 2024).
  // The shared `flatSaveBonus` folds it against the SAME `effectiveScores` the
  // base save mod uses (rule 6 — the ONE home the LeftHud shares, never raw).
  const saveBonusFlat = flatSaveBonus(aggregate, effectiveScores);
  const displayedSkills = mergeSkillProficiencies(
    charData.skills,
    aggregate.skillProficiencies,
    fullAggregate.expertiseSkills,
    // Jack-of-all-Trades (Bard L2) — DERIVED half-proficiency (#57).
    fullAggregate.halfProficiencyAllSkills
  );
  const checkBonusFor = (skillId: string, ability: AbilityCode): number =>
    resolveAbilityCheckBonus(
      fullAggregate.abilityCheckBonuses,
      skillId,
      ability,
      effectiveScores
    );

  // ── abilities (score + modifier + save, override-aware) ──
  const abilities: PdfAbilityVM[] = ALL_ABILITIES.map(({ code }) => {
    const score = effectiveScores[code];
    const isProficient = displayedSaves.includes(code);
    const saveOverride = charData.savingThrowBonusOverrides?.[code] ?? null;
    const stb = savingThrowBonus(
      score,
      level,
      isProficient,
      saveOverride,
      exhaustion,
      pb,
      saveBonusFlat
    );
    return {
      code,
      label: t(`abilities.${code}_short`),
      fullName: t(`abilities.${code}`),
      score,
      modifier: fmtMod(abilityModifier(score)),
      save: fmtMod(stb),
      saveProficient: isProficient,
    };
  });

  // ── skills (override-first; auto unless a manual override) ──
  const skills: PdfSkillVM[] = ALL_SKILLS.map((skill): PdfSkillVM => {
    const proficiency: SkillProficiency | null = displayedSkills[skill.id] ?? null;
    const override = charData.skillBonusOverrides?.[skill.id] ?? null;
    const auto = skillBonus(
      effectiveScores[skill.ability],
      level,
      proficiency,
      null,
      exhaustion,
      pb,
      checkBonusFor(skill.id, skill.ability)
    );
    return {
      id: skill.id,
      name: t(`skills.${skill.id}`),
      ability: skill.ability,
      abilityShort: t(`abilities.${skill.ability}_short`),
      bonus: fmtMod(override ?? auto),
      state: proficiency ? DOT_STATE[proficiency] : "none",
    };
  }).sort((a, b) => a.name.localeCompare(b.name, locale));

  // ── passives (override-first, RAW: 10 + the same check modifier) ──
  const passiveOf = (
    skillId: string,
    ability: AbilityCode,
    override: number | null | undefined
  ): number =>
    override ??
    passiveScore(
      effectiveScores[ability],
      level,
      displayedSkills[skillId] ?? null,
      exhaustion,
      charData.proficiencyBonusOverride,
      checkBonusFor(skillId, ability)
    );
  const passives: PdfPassiveVM[] = [
    {
      label: t("abilities.passivePerceptionLabel"),
      value: passiveOf("perception", "WIS", charData.passivePerceptionOverride),
    },
    {
      label: t("abilities.passiveInsightLabel"),
      value: passiveOf("insight", "WIS", charData.passiveInsightOverride),
    },
    {
      label: t("abilities.passiveInvestigationLabel"),
      value: passiveOf("investigation", "INT", charData.passiveInvestigationOverride),
    },
  ];

  // ── senses + non-walking speeds (override-aware, unit-formatted) ──
  // S13 — the non-walking sentinels resolve against the EFFECTIVE walking Speed
  // (override + grants + Boots × exhaustion − armor penalty), so a doubled /
  // penalized walking Speed flows through to the derived swim/fly/climb ranges.
  const walkingSpeedFt =
    charData.speedOverride ?? effectiveWalkingSpeedFt(doc, getEquipment);
  const { senses, speeds } = deriveSensesAndSpeeds(fullAggregate, walkingSpeedFt);
  const sensesSpeeds: PdfLineVM[] = [
    ...senses.map((s) => ({
      label: t(`character.sense_${s.kind}`),
      value: localeDistance(charData.senseRangeOverrides?.[s.kind] ?? s.rangeFt, locale),
    })),
    ...speeds.map((s) => ({
      label: t(`character.speed_${s.kind}`),
      value: localeDistance(charData.speedOverrides?.[s.kind] ?? s.rangeFt, locale),
    })),
  ];

  // ── proficiencies (languages / tools / armor) — single-source display merges ──
  const proficiencies: PdfLineVM[] = [];
  const languages = displayLanguages(
    charData.languageIds,
    charData.customLanguages,
    fullAggregate,
    locale
  );
  if (languages.trim())
    proficiencies.push({ label: t("lore.languages"), value: languages });
  const tools = displayToolProficiencies(
    charData.toolProficiencyIds,
    charData.customToolProficiencies,
    fullAggregate,
    locale
  );
  if (tools.trim()) proficiencies.push({ label: t("lore.tools"), value: tools });
  if (charData.armorNote.trim())
    proficiencies.push({ label: t("equipment.armor"), value: charData.armorNote });

  // ── defenses (resistances / immunities) ──
  const defenses: PdfLineVM[] = [];
  const resistances = [...fullAggregate.damageResistances].sort();
  if (resistances.length)
    defenses.push({
      label: t("abilities.resistancesLabel"),
      value: resistances.map((d) => t(`srd.damage_${d}`)).join(", "),
    });
  const { conditionImmunities, damageImmunities } = deriveImmunities(fullAggregate);
  if (damageImmunities.length)
    defenses.push({
      label: t("abilities.immunitiesLabel"),
      value: damageImmunities.map((d) => t(`srd.damage_${d}`)).join(", "),
    });
  if (conditionImmunities.length)
    defenses.push({
      label: t("abilities.conditionImmunitiesLabel"),
      value: conditionImmunities.map((c) => conditionLabel(c, locale)).join(", "),
    });

  // ── combat header numbers (override-aware) — mirrors CombatHeader exactly ──
  const ac = effectiveAC(charData, { activeFeatures, grantBundleChoices });
  const hasAlertFeat = characterHasFeat("alert", {
    humanOriginFeat: charData.humanOriginFeat,
    bgFeat: charData.bgFeat,
    features: charData.features,
  });
  const initiativeGrantBonus =
    fullAggregate.initiativeBonusFlat +
    fullAggregate.initiativeBonusAbilities.reduce(
      (sum, a) => sum + abilityModifier(effectiveScores[a]),
      0
    );
  const computedInitiative = computeInitiative(
    effectiveScores.DEX,
    pb,
    hasAlertFeat,
    exhaustion,
    initiativeGrantBonus
  );
  const init = charData.initiativeBonusOverride ?? computedInitiative;

  // ── actions / weapons / trackers (localized presenters) ──
  const actions: PdfActionVM[] = localizeActions(doc, locale).map((a) => ({
    name: a.name,
    timing: t(`combat.${a.type}`),
    detail: a.summary.attackBonus != null || a.summary.damage ? actionSummary(a, t) : "",
  }));

  const inventory = buildInventoryViewModel(doc, locale);
  const weapons: PdfWeaponVM[] = inventory.weapons.map((w) => ({
    name: w.quantity > 1 ? `${w.name} ×${w.quantity}` : w.name,
    attack: fmtMod(w.attackBonus),
    damage: damageString(w),
    // Property + OWNED-mastery labels off the unified facts chips (the same
    // chips both weapon cards render — one source, golden rule 6).
    notes: [
      w.facts.chips
        .filter((c) => c.kind === "property")
        .map((c) => c.label)
        .join(", "),
      w.facts.chips
        .filter((c) => c.kind === "mastery")
        .map((c) => c.label)
        .join(", "),
    ]
      .filter(Boolean)
      .join(" · "),
  }));

  const trackers: PdfTrackerVM[] = localizeTrackers(doc, locale).map((tr) => ({
    label: tr.label,
    total: tr.total,
    used: tr.used,
    recovery: recoveryLabel(tr.recovery, t),
    die: tr.die ?? "",
    unit: tr.unit ? localizeTrackerUnit(tr.unit, t) : "",
    isPool: tr.isPool ?? false,
  }));

  // ── features (class / subclass / race / feats) ──
  const features = buildFeatureVMs(doc, locale, t);

  // ── equipment (armor + gear rows) ──
  const equipment: PdfItemVM[] = [...inventory.armor, ...inventory.gear].map((it) => ({
    name: it.quantity > 1 ? `${it.name} ×${it.quantity}` : it.name,
    detail: [
      it.equipped ? t("equipment.equipped") : "",
      it.weight > 0 ? formatWeight(it.weight * it.quantity, locale) : "",
      it.notes,
    ]
      .filter(Boolean)
      .join(" · "),
  }));

  // ── spellcasting page ──
  const spellcasting = buildSpellcastingVM(doc, locale, t);

  // ── header meta (identity line already carries the multiclass breakdown) ──
  const meta: PdfLineVM[] = [];
  const primarySubclassId = charData.classes[0]?.subclassId;
  if (primarySubclassId)
    meta.push({
      label: t("levelUp.stepSubclass"),
      value: localizeSubclassName(primarySubclassId, locale),
    });
  if (charData.background)
    meta.push({
      label: t("character.background"),
      value: localizeBackgroundName(charData.background, locale),
    });
  if (charData.alignment)
    meta.push({
      label: t("lore.alignment"),
      // `alignment` is a stable AlignmentId — localize it for display (never the id).
      value: t(`lore.alignments.${charData.alignment}`),
    });
  if (charData.playerName)
    meta.push({ label: t("lore.player"), value: charData.playerName });

  // ── official-sheet additions (size, coins, armor-training, attunement, labels) ──
  const sizeRaw = getRace(charData.race.toLowerCase())?.size ?? "";
  const SIZE_TOKENS = ["tiny", "small", "medium", "large", "huge", "gargantuan"];
  const size = SIZE_TOKENS.filter((tk) => sizeRaw.toLowerCase().includes(tk))
    .map((tk) => t(`srd.size_${tk}`))
    .join(" / ");

  // Armor + weapon TRAINING. A class's base training lives on the class table, NOT
  // in the grant aggregate, so we union both across every class (a multiclass keeps
  // all of it) — exactly as smart-tracker does — then derive the display.
  const classTables = getClasses(charData).map((e) => getClassTable(e.classId));
  const armorProf = [
    ...classTables.flatMap((tbl) => tbl?.armorProficiencies ?? []),
    ...fullAggregate.armorProficiencies,
  ].map((s) => s.toLowerCase());
  const armorTraining: PdfArmorTraining = {
    light: armorProf.some((s) => s.includes("light")),
    medium: armorProf.some((s) => s.includes("medium")),
    heavy: armorProf.some((s) => s.includes("heavy")),
    shields: armorProf.some((s) => s.includes("shield")),
  };

  // Weapon training, localized at the category level (Simple / Martial — what a
  // class grants and what the official sheet lists). Tokens are English SRD data
  // ("Simple weapons", "Martial"), mapped to i18n keys so the IT sheet never leaks.
  const weaponCats = new Set<string>();
  for (const raw of [
    ...classTables.flatMap((tbl) => tbl?.weaponProficiencies ?? []),
    ...fullAggregate.weaponProficiencies,
  ]) {
    const cat = raw
      .toLowerCase()
      .replace(/\s*weapons?$/, "")
      .trim();
    if (cat === "simple") weaponCats.add(t("srd.weaponCategory_simple"));
    else if (cat === "martial") weaponCats.add(t("srd.weaponCategory_martial"));
  }
  const weaponsTraining = [...weaponCats].join(", ");

  const attunement = [...inventory.armor, ...inventory.gear]
    .filter((it) => it.attuned)
    .map((it) => it.name);

  const header = {
    species: charData.race ? localizeRaceName(charData.race, locale) : "",
    classes: charData.classes
      .map((e) => `${localizeClassName(e.classId, locale)} ${e.level}`)
      .join(" / "),
    subclass: charData.classes[0]?.subclassId
      ? localizeSubclassName(charData.classes[0].subclassId, locale)
      : "",
    background: charData.background
      ? localizeBackgroundName(charData.background, locale)
      : "",
  };

  const combat = {
    ac: String(ac),
    initiative: fmtMod(init),
    // S13 — the EFFECTIVE walking Speed (override + grants + Boots × exhaustion −
    // armor penalty), the SAME value the combat header shows, not the raw base.
    speed: formatSpeed(walkingSpeedFt, locale),
    hpCurrent: session.hp.current,
    hpMax: charData.hp.max,
    hitDice: `${level}d${charData.hitDieType}`,
    pb: fmtMod(pb),
  };

  const labels: PdfSheetLabels = {
    characterName: t("character.name"),
    className: t("character.class"),
    subclass: t("character.subclass"),
    species: t("character.species"),
    background: t("character.background"),
    level: t("common.level"),
    xp: t("pdf.sheet.xp"),
    armorClass: t("character.armorClass"),
    shield: t("equipment.shield"),
    hitPoints: t("character.hitPoints"),
    current: t("pdf.sheet.current"),
    max: t("pdf.sheet.max"),
    temp: t("combat.temp"),
    hitDice: t("character.health.hitDice"),
    spent: t("pdf.sheet.spent"),
    deathSaves: t("deathSaves.title"),
    successes: t("deathSaves.successes"),
    failures: t("deathSaves.failures"),
    proficiencyBonus: t("abilities.proficiencyBonusLabel"),
    initiative: t("character.vitals.initAria"),
    speed: t("character.speed"),
    size: t("pdf.sheet.size"),
    passivePerception: t("abilities.passivePerceptionLabel"),
    score: t("pdf.sheet.score"),
    modifier: t("pdf.sheet.modifier"),
    savingThrow: t("abilities.savingThrowHead"),
    weaponsTitle: t("pdf.weaponsAndCantrips"),
    colName: t("common.name"),
    colAtk: t("pdf.sheet.atkBonusDc"),
    colDamage: t("pdf.sheet.damageType"),
    colNotes: t("notes.combatRubric"),
    classFeatures: t("features.classFeatures"),
    speciesTraits: t("pdf.sheet.speciesTraits"),
    feats: t("features.feats"),
    equipmentTraining: t("pdf.sheet.equipmentTraining"),
    resources: t("character.hud.resources"),
    colUses: t("features.usesRemaining"),
    colRecovery: t("custom.recovery"),
    armorTraining: t("pdf.sheet.armorTraining"),
    armorLight: t("pdf.sheet.armorLight"),
    armorMedium: t("custom.armorMedium"),
    armorHeavy: t("pdf.sheet.armorHeavy"),
    armorShields: t("equipment.shields"),
    weapons: t("equipment.weapons"),
    tools: t("equipment.tools"),
    heroicInspiration: t("character.heroicInspiration"),
    appearance: t("lore.appearance"),
    backstory: t("pdf.sheet.backstory"),
    alignment: t("lore.alignment"),
    languages: t("lore.languages"),
    attunement: t("pdf.sheet.attunement"),
    coins: t("pdf.sheet.coins"),
    spellSlots: t("spells.slots"),
    total: t("spells.slotTotalLabel"),
    expended: t("pdf.sheet.expended"),
    spellTable: t("pdf.sheet.spellTable"),
    cp: t("pdf.sheet.cp"),
    sp: t("pdf.sheet.sp"),
    ep: t("pdf.sheet.ep"),
    gp: t("pdf.sheet.gp"),
    pp: t("pdf.sheet.pp"),
    spellcasting: t("pdf.spellcasting"),
    spellSaveDc: t("spells.spellDC"),
    spellAttack: t("abilities.rollType_attack"),
    equipment: t("character.equipment"),
    castingTime: t("spells.castingTime"),
    rangeLabel: t("spells.range"),
    crmC: t("spells.concentration").charAt(0),
    crmR: t("spells.ritual").charAt(0),
    crmM: t("spells.material").charAt(0),
    spellcastingAbility: t("abilities.spellcastingAbility"),
    spellcastingModifier: t("pdf.sheet.spellcastingModifier"),
    spellSaveDcFull: t("pdf.sheet.spellSaveDcFull"),
    spellAttackBonus: t("pdf.sheet.spellAttackBonus"),
  };

  return {
    locale,
    name: charData.name,
    identity: localizeCharacterIdentity(charData, locale),
    meta,
    footer: t("pdf.footer"),
    abilities,
    skills,
    passives,
    sensesSpeeds,
    proficiencies,
    defenses,
    actions,
    weapons,
    trackers,
    features,
    equipment,
    spellcasting,
    labels,
    size,
    tempHp: session.hp.temp,
    hitDiceUsed: session.hitDice.used,
    deathSucc: session.deathSucc,
    deathFail: session.deathFail,
    inspiration: session.inspiration,
    currency: {
      cp: session.currency.cp,
      sp: session.currency.sp,
      ep: session.currency.ep,
      gp: session.currency.gp,
      pp: session.currency.pp,
    },
    armorTraining,
    attunement,
    languages,
    tools,
    weaponsTraining,
    backstory: charData.lore.backstory,
    alignment: charData.alignment,
    header,
    totalLevel: level,
    combat,
  };
}

/**
 * Localize a tracker recovery timing for the print sheet via the existing
 * custom-feature keys. `dawn` keeps its own word (print fidelity — a daily
 * item-charge pool), and `per-turn` returns an HONEST BLANK (it auto-resets each
 * turn, so no rest word applies); everything else folds to Short/Long/Manual.
 */
function recoveryLabel(recovery: Recovery, t: Translate): string {
  switch (recovery) {
    case "long-rest":
      return t("custom.recoveryLong");
    case "short-rest":
    case "short-or-long-rest":
      return t("custom.recoveryShort");
    case "dawn":
      return t("pdf.recoveryDawn");
    case "per-turn":
      return "";
    case "manual":
      return t("custom.recoveryManual");
  }
}

/** Per-weapon damage string: "1d8+3 slashing" (versatile shown in parens). */
function damageString(w: {
  damageDie: string;
  damageMod: number;
  versatileDie: string | null;
  damageType: string;
}): string {
  const mod = w.damageMod !== 0 ? fmtMod(w.damageMod) : "";
  const base = `${w.damageDie}${mod}`;
  const versatile = w.versatileDie ? ` (${w.versatileDie}${mod})` : "";
  return `${base}${versatile}`;
}

/** A compact action summary line ("+8 to hit · 1d8+5") for the actions table. */
function actionSummary(
  a: { summary?: { attackBonus?: number | null; damage?: string | null } },
  t: Translate
): string {
  const parts: string[] = [];
  if (a.summary?.attackBonus != null)
    parts.push(`${fmtMod(a.summary.attackBonus)} ${t("srd.toHit")}`);
  if (a.summary?.damage) parts.push(a.summary.damage);
  return parts.join(" · ");
}

/**
 * Build the feature view-models — class/subclass features (per class via
 * `buildGrantedFeatures`, multiclass-aware), race traits, Origin feats, chosen
 * feats, and homebrew. This mirrors the Features-tab resolution VERBATIM (same
 * `buildGrantedFeatures` per-class + `deriveOriginFeats` derivation, same
 * `classFeatureIndex`/`FEATS_BY_ID`/`raceFeatureIndex` dispatch, same
 * `raceTraitCatKey` catalogue key) so the PDF lists exactly what the cockpit
 * lists — never a re-roll.
 */
function buildFeatureVMs(
  doc: CharacterDoc,
  locale: Locale,
  t: Translate
): PdfFeatureVM[] {
  const charData = doc.character;
  const out: PdfFeatureVM[] = [];
  const seen = new Set<string>();

  // DERIVED SRD features (class/subclass per class + Origin feats), unioned onto
  // the stored `features[]` and deduped by srdId — the SAME union the tab does.
  const storedSrdIds = new Set(
    charData.features.flatMap((f) => ("srdId" in f ? [f.srdId] : []))
  );
  const derivedRefs: SrdFeatureRef[] = [];
  const derivedSeen = new Set<string>();
  for (const ref of [
    ...charData.classes.flatMap((entry) =>
      buildGrantedFeatures({
        classId: entry.classId,
        level: entry.level,
        subclassId: entry.subclassId ?? "",
        raceId: charData.race.toLowerCase(),
      })
    ),
    ...deriveOriginFeats({
      background: charData.background,
      bgFeat: charData.bgFeat,
      humanOriginFeat: charData.humanOriginFeat,
    }),
  ]) {
    if (!storedSrdIds.has(ref.srdId) && !derivedSeen.has(ref.srdId)) {
      derivedSeen.add(ref.srdId);
      derivedRefs.push(ref);
    }
  }

  const refs: Array<SrdFeatureRef | CustomFeature> = [
    ...charData.features,
    ...derivedRefs,
  ];

  for (const ref of refs) {
    if ("custom" in ref) {
      const name = ref.title;
      if (!name || seen.has(`custom:${name}`)) continue;
      seen.add(`custom:${name}`);
      out.push({
        name,
        source: ref.source,
        description: ref.contentBlocks.map((b) => b.text ?? "").join("\n"),
        kind: "custom",
      });
      continue;
    }
    const classFeature = classFeatureIndex.get(ref.srdId);
    const feat = classFeature ? undefined : FEATS_BY_ID.get(ref.srdId);
    const raceTrait = classFeature || feat ? undefined : raceFeatureIndex.get(ref.srdId);
    if (!classFeature && !feat && !raceTrait) continue;
    if (seen.has(`srd:${ref.srdId}`)) continue;
    seen.add(`srd:${ref.srdId}`);

    const featKind = classFeature ? "class-feature" : feat ? "feat" : "race";
    const featKey = raceTrait ? raceTraitCatKey(raceTrait) : ref.srdId;
    const name = hasSrd(featKind, featKey, "name", locale)
      ? localizeSrd(featKind, featKey, "name", locale)
      : ref.srdId;
    const description = hasSrd(featKind, featKey, "description", locale)
      ? localizeSrd(featKind, featKey, "description", locale)
      : "";
    const source = feat
      ? t("features.feats")
      : raceTrait
        ? t("features.racialTraits")
        : classFeature?.subclass
          ? `${localizeSubclassName(classFeature.subclass, locale)} ${classFeature.level}`
          : `${localizeClassName(classFeature?.class ?? "?", locale)} ${classFeature?.level ?? "?"}`;
    out.push({
      name,
      source,
      description,
      kind: classFeature ? "class" : feat ? "feat" : "race",
    });
  }

  return out;
}

/** Build the spellcasting page VM via `buildSpellsViewModel` (override-aware). */
function buildSpellcastingVM(
  doc: CharacterDoc,
  locale: Locale,
  t: Translate
): PdfSpellcastingVM | null {
  const classId = primaryClassId(doc.character);
  const vm: SpellsViewModel = buildSpellsViewModel(doc, classId, locale, false);
  if (!vm.isCaster || !vm.castSummary || vm.spellCount === 0) return null;

  const slotByLevel = new Map(vm.slots.map((s) => [s.level, s.total]));
  const levels: PdfSpellLevelVM[] = vm.levels.map((group) => {
    const total = slotByLevel.get(group.level) ?? 0;
    return {
      level: group.level,
      heading:
        group.level === 0
          ? t("spells.cantrips")
          : t("spells.level", { level: group.level }),
      slots:
        group.level > 0 && total > 0
          ? t("rest.slotsRestoredValue", { count: total })
          : null,
      spells: group.spells.map((s) => ({
        name: s.name,
        castingTime: s.data
          ? t(`srd.castingTime_${castingTimeI18nKey(s.data.castingTime)}`)
          : "",
        range: s.facts.range,
        concentration: s.concentration,
        ritual: s.ritual,
        material: s.facts.material != null,
        prepared: s.isPrepared || s.isAlwaysPrepared,
      })),
    };
  });

  const cs = vm.castSummary;
  const pb = effectiveProficiencyBonus(
    totalLevel(doc.character),
    doc.character.proficiencyBonusOverride
  );
  return {
    ability: t(`abilities.${cs.ability}`),
    modifier: cs.attackBonus != null ? fmtMod(cs.attackBonus - pb) : "-",
    saveDC: cs.saveDC != null ? String(cs.saveDC) : "-",
    attackBonus: cs.attackBonus != null ? fmtMod(cs.attackBonus) : "-",
    prepared: cs.isPreparedCaster ? `${cs.preparedCount} / ${cs.preparedMax}` : null,
    levels,
  };
}
