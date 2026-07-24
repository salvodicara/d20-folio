/**
 * Level-Up Engine
 *
 * Handles all recalculations when a character levels up:
 * - HP increase (average roll + CON modifier)
 * - Proficiency bonus update
 * - Spell slot progression
 * - Auto-add class features from SRD class table
 * - Generate level-up checklist (ASI, subclass choice, etc.)
 *
 * All functions are pure — they return new data rather than mutating state.
 */

import { abilityModifier, proficiencyBonus, hitDieAverage } from "@/lib/compute";
import { getClassTable, getFeaturesAtLevel, classFeatureIndex } from "@/data/classes";
import { srdEn } from "@/i18n/srd-en";
import { resolveGrantSourcesForFeatures } from "@/lib/resolve-grant-sources";
import { applyFeatAsi } from "@/lib/feat-asi";
import { getClasses, primaryClassEntry, totalLevel } from "@/lib/classes";
import {
  computeMulticlassSpellSlots,
  applySlotMaxOverrides,
} from "@/lib/multiclass-slots";
import type { SrdClassFeatureData } from "@/data/types";
import type { CharacterData } from "@/types/character";
import type { SrdFeatureRef, LevelUpChecklistItem } from "@/types/character";

// ─── The advancing-class context ──────────────────────────────────────────────
// A level-up advances ONE class (id) to a NEW class level. Every resolver reads
// that class's table at that class level — never a character-wide projection — so a
// multiclass advance applies the right class's features/slots/scaling. Single-class
// reduces to the one class at its (= total) level.

/** The class id + NEW class level being advanced this level-up. */
interface AdvanceContext {
  classId: string;
  subclassId: string;
  classLevel: number;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LevelUpResult {
  /** Updated character data after level-up */
  updatedCharacter: CharacterData;
  /** Summary of changes applied */
  changes: LevelUpChange[];
}

export interface LevelUpChange {
  type:
    | "hp"
    | "proficiency"
    | "spellSlots"
    | "feature"
    | "checklist"
    | "cantrips"
    | "spellsKnown"
    | "scaling";
  description: string;
  /** i18n key for locale-aware rendering (falls back to description) */
  i18nKey?: string;
  /** Interpolation args for i18nKey */
  i18nArgs?: Record<string, string | number>;
  /**
   * `feature`-change ONLY — the stable class-feature IDS gained this level. The
   * level-up view localizes each id at render from the catalogue (golden rule 7 +
   * 22); this replaces the old EN-name round-trip (emit names → comma-join → split →
   * name-match back to an id), which leaked English into code and silently dropped
   * any feature whose localized name contained ", ".
   */
  featureIds?: string[];
  /**
   * R4 — SOURCE ATTRIBUTION: the id of the class this change came from (the class
   * being advanced this level-up). The level-up view resolves it to the localized
   * class name so the UI can label each gain "Wizard 5: +1 L3 slot". Absent on
   * total-level events (the PB bump).
   */
  sourceClassId?: string;
  /** R4 — the advancing class's NEW class level (the "5" in "Wizard 5"). */
  sourceClassLevel?: number;
}

/** Options for the level-up function */
export interface LevelUpOptions {
  /**
   * Override the raw hit-die roll (e.g. a 6 on a d10). CON modifier and
   * class HP feats (Dwarven Toughness, Tough) are added automatically — so
   * this is the **raw die value**, not the post-CON total. If omitted, the
   * die's average (`hitDieAverage`) is used.
   */
  hpGain?: number;
  /**
   * R4 — the CLASS being advanced (id), for a multiclass character. Defaults to
   * the PRIMARY class (the single class for a single-class character — so there is
   * no new friction for single-class users). The advancing class's `classes[]`
   * entry gains one level; features/slots/scaling resolve at that class's NEW level;
   * every `LevelUpChange` is tagged with this `classId` for SOURCE ATTRIBUTION
   * ("Wizard 5: +1 L3 slot"). When the id names a class the character doesn't yet
   * have, a NEW one-level entry is added (the multiclass "add a class" path).
   */
  advanceClassId?: string;
}

// ─── Core Level-Up Function ──────────────────────────────────────────────────

/**
 * Compute a fully updated CharacterData for the next level.
 * Does NOT mutate the original — returns a new object.
 *
 * @param character - Current character data
 * @param newLevel - The target level to advance to (>= currentLevel + 1).
 *   NOTE: HP, new features, ability-score grants and scaling are applied for
 *   the TARGET level only — multi-level jumps do NOT retroactively apply the
 *   intervening levels' gains. The production wizard always advances exactly
 *   one level at a time, so this single-target behavior is the intended path.
 * @param options - Optional overrides (e.g. manually-rolled HP gain)
 * @returns LevelUpResult with updated data and change log
 */
export function levelUp(
  character: CharacterData,
  newLevel?: number,
  options?: LevelUpOptions
): LevelUpResult {
  const currentTotal = totalLevel(character);
  const targetLevel = newLevel ?? currentTotal + 1;
  if (targetLevel < 2 || targetLevel > 20) {
    throw new Error(`Invalid level: ${targetLevel}. Must be 2-20.`);
  }
  if (targetLevel <= currentTotal) {
    throw new Error(
      `Target level ${targetLevel} must be higher than current level ${currentTotal}.`
    );
  }

  const changes: LevelUpChange[] = [];

  // R4 — advance a CHOSEN class. Default: the primary class (the single class for a
  // single-class character → no new friction). `classes[]` is the source of truth;
  // we bump the advancing entry (or add a new one-level entry for "add a class").
  // `classLevel` (the advancing class's NEW level) drives feature/scaling/spellsKnown
  // resolution; the TOTAL level (= targetLevel) drives PB + multiclass spell slots.
  const classes = getClasses(character).map((e) => ({ ...e }));
  const advanceId = options?.advanceClassId ?? primaryClassEntry(character).classId;
  // Levels gained = targetLevel − current TOTAL level (the production wizard always
  // advances exactly one; a multi-level jump folds onto the one advancing class).
  const levelsGained = targetLevel - currentTotal;
  let advancing = classes.find((e) => e.classId === advanceId);
  if (advancing) {
    advancing.level += levelsGained;
  } else {
    advancing = { classId: advanceId, level: levelsGained };
    classes.push(advancing);
  }
  const ctx: AdvanceContext = {
    classId: advanceId,
    subclassId: advancing.subclassId ?? "",
    classLevel: advancing.level,
  };

  // The HP gain uses the ADVANCING class's hit die (a multiclass level grants that
  // class's die, not the primary's). Single-class: unchanged.
  const advancingTable = getClassTable(ctx.classId);
  const hitDieType = advancingTable ? advancingTable.hitDie : character.hitDieType;
  let updated: CharacterData = { ...character, classes, hitDieType };

  // Resolve the advancing class's features gained AT its new CLASS level exactly
  // once. Both applyNewFeatures and applyClassFeatureAbilityScores consume the same
  // (classId, classLevel) set.
  const newFeatures = getFeaturesAtLevel(ctx.classId, ctx.classLevel);

  // 1. HP increase (uses the advancing class's hit die).
  updated = applyHpIncrease(updated, character, changes, options?.hpGain);

  // 2. Spell slot progression — the 2024 MULTICLASS caster table over all classes
  //    (reduces to the single class's table for a single-class character).
  updated = applySpellSlots(updated, ctx, changes);

  // 3. Auto-add the advancing class's features at its NEW class level.
  updated = applyNewFeatures(updated, newFeatures, ctx.subclassId, changes);

  // 3b. Jack of All Trades is DERIVED from the feature at render (#57) — nothing
  //     to bake into stored `skills` on level-up.

  // 3c. Apply ability-score grants from class features gained at this level (L7).
  updated = applyClassFeatureAbilityScores(updated, newFeatures, ctx, changes);

  // 4. Generate level-up checklist (advancing class's class-level milestones).
  updated = applyChecklist(updated, ctx, changes);

  // 5. Apply scaling features (die progression, extra attacks, etc.) at class level.
  //    The cantrip-damage milestone alone keys on TOTAL character level (RAW 2024:
  //    cantrips scale at character levels 5/11/17, independent of class levels).
  updated = applyScalingFeatures(updated, ctx, targetLevel, changes);

  // 6. Log proficiency bonus change — PB is from TOTAL level (RAW: a multiclassed
  //    character's PB tracks total character level, not any single class's level).
  const oldPB = proficiencyBonus(currentTotal);
  const newPB = proficiencyBonus(targetLevel);
  if (newPB !== oldPB) {
    changes.push({
      type: "proficiency",
      description: `Proficiency bonus increased to +${newPB}`,
      i18nKey: "levelUp.profIncreased",
      i18nArgs: { pb: newPB },
    });
  }

  // R4 — SOURCE ATTRIBUTION: tag every change with the advancing class id (+ its new
  // class level) so the level-up UI can show "Wizard 5: +1 L3 slot". The PB change
  // is a total-level event, not a per-class one, so it carries no source class.
  for (const change of changes) {
    if (change.type === "proficiency") continue;
    change.sourceClassId = ctx.classId;
    change.sourceClassLevel = ctx.classLevel;
  }

  return { updatedCharacter: updated, changes };
}

// ─── HP Increase ─────────────────────────────────────────────────────────────

/**
 * Apply an HP increase for one level-up.
 *
 * `dieRollOverride` (when provided) is the **raw die value** the player rolled
 * — *not* the post-CON total. CON modifier, Dwarven Toughness, and Tough are
 * always added by this function. If no override is provided, the die average
 * (`hitDieAverage`) is used in its place. The on-screen breakdown matches the
 * math: "die +N + CON +M [+ Dwarven Toughness +1] [+ Tough +2] → newMax".
 *
 * Bug fix (2026-05-28): previously the override was treated as already
 * including CON, so the manual-roll path silently dropped the CON modifier
 * from the total HP gain (e.g. rolling 5 on a d10 with CON +2 only granted
 * +5 instead of +7), and the description double-listed CON on the avg path.
 * Now both paths flow through the same `die + CON` formula and the
 * description is honest.
 */
/**
 * Per-level HP grants from features / feats (Tough +2, Dwarven Toughness +1,
 * future content). Reads the declarative `{ type: "hp-per-level", amount }`
 * grant on every feature ref so no engine path needs to know about Tough or
 * Dwarven Toughness by name. The origin/bg feat slug is still checked
 * separately — those aren't in `features[]` yet at the very first level-up
 * after the feat is taken. (Species traits like Dwarven Toughness live in
 * `features[]` and resolve here directly — this path has no separate race
 * source, so it never double-counts.)
 *
 * THE single source for the per-level HP bonus: `applyHpIncrease` (level-up)
 * and the Bio-tab level reconcile (`reconcile-build`) both read it, so a level
 * up and a level down move max HP by the same per-level amount.
 */
export function hpPerLevelGrantBonus(
  character: Pick<CharacterData, "features" | "humanOriginFeat" | "bgFeat">
): { bonus: number; parts: Array<{ name: string; amount: number }> } {
  let bonus = 0;
  const parts: Array<{ name: string; amount: number }> = [];
  for (const src of resolveGrantSourcesForFeatures(character.features)) {
    for (const g of src.grants ?? []) {
      if (g.type === "hp-per-level") {
        bonus += g.amount;
        // English-only debug annotation: the source's canonical EN name (a FACT,
        // from the catalogue via `srdEn` — survives the data strip).
        const enName = src.ref ? srdEn(src.ref.kind, src.ref.key, "name") : undefined;
        parts.push({ name: enName ?? src.id, amount: g.amount });
      }
    }
  }
  // Origin / background feat slug fallback — feats taken at creation that
  // haven't been wrapped into a feature ref yet. (LevelUpModal injects a
  // SrdFeatureRef when the player picks Tough via ASI, so subsequent
  // level-ups go through the grants loop above.)
  if (
    (character.humanOriginFeat === "tough" || character.bgFeat === "tough") &&
    !character.features.some((f) => !("custom" in f) && f.srdId === "tough")
  ) {
    bonus += 2;
    parts.push({ name: "Tough", amount: 2 });
  }
  return { bonus, parts };
}

function applyHpIncrease(
  updated: CharacterData,
  previous: CharacterData,
  changes: LevelUpChange[],
  dieRollOverride?: number
): CharacterData {
  const conMod = abilityModifier(updated.abilityScores.CON);
  const die = updated.hitDieType;
  const avg = hitDieAverage(die);
  // The "die contribution" before CON / class feats. Override == raw roll.
  const dieGain = dieRollOverride !== undefined ? Math.max(1, dieRollOverride) : avg;
  // Per-level core gain = max(1, die + CON). The min-1 floor honors RAW
  // ("If your modifier reduces the total to 0 or less, you gain 1 HP.").
  const coreGain = Math.max(1, dieGain + conMod);

  const perLevel = hpPerLevelGrantBonus(updated);
  const perLevelGrantBonus = perLevel.bonus;
  const perLevelNoteParts = perLevel.parts.map((p) => ` + ${p.name} +${p.amount}`);
  const hpGain = coreGain + perLevelGrantBonus;

  const newMax = previous.hp.max + hpGain;
  const dieLabel =
    dieRollOverride !== undefined ? `d${die} rolled ${dieGain}` : `avg d${die}=${avg}`;
  const conPart = conMod === 0 ? "" : ` + CON ${conMod > 0 ? "+" : ""}${conMod}`;
  // Lead the description with the TOTAL HP gain (`hpGain`), not just the die
  // contribution. The parenthetical preserves the breakdown so the player
  // can audit the math; without the leading total, "+8 (d10 rolled 8) + CON +2"
  // read like a +8 gain even when the real bump was +10.
  changes.push({
    type: "hp",
    description: `HP +${hpGain} (${dieLabel}${conPart}${perLevelNoteParts.join("")}) → ${newMax} max`,
  });

  return { ...updated, hp: { max: newMax } };
}

// ─── Spell Slot Progression ──────────────────────────────────────────────────

function applySpellSlots(
  updated: CharacterData,
  ctx: AdvanceContext,
  changes: LevelUpChange[]
): CharacterData {
  const { classId, classLevel } = ctx;
  const table = getClassTable(classId);
  if (!table) return updated;

  const levelData = table.levels.find((l) => l.level === classLevel);
  if (!levelData) return updated;

  // Update cantrips/spells known if tracked
  if (levelData.cantripsKnown != null) {
    const prevLevel = table.levels.find((l) => l.level === classLevel - 1);
    if (
      prevLevel?.cantripsKnown != null &&
      levelData.cantripsKnown > prevLevel.cantripsKnown
    ) {
      changes.push({
        type: "cantrips",
        description: `Cantrips known: ${levelData.cantripsKnown} (was ${prevLevel.cantripsKnown})`,
      });
    }
  }

  if (levelData.spellsKnown != null) {
    const prevLevel = table.levels.find((l) => l.level === classLevel - 1);
    if (prevLevel?.spellsKnown != null && levelData.spellsKnown > prevLevel.spellsKnown) {
      changes.push({
        type: "spellsKnown",
        description: `Spells known: ${levelData.spellsKnown} (was ${prevLevel.spellsKnown})`,
      });
    }
    // Update preparedMax on the character's spellcasting block
    if (updated.spellcasting) {
      updated = {
        ...updated,
        spellcasting: { ...updated.spellcasting, preparedMax: levelData.spellsKnown },
      };
    }
  }

  // Update spell slots. R4 — recompute from the 2024 MULTICLASS caster table over
  // ALL classes (single-class reduces to the class table's own slots), so a
  // multiclassed character gets the correct combined shared slots + separate Pact
  // Magic. A class that contributes no slots this level (e.g. base Fighter) still
  // recomputes correctly because the table reads every entry.
  const classes = getClasses(updated);
  const isMulticlass = classes.length > 1;
  let slotsWithPact: CharacterData["spellSlots"];
  if (isMulticlass) {
    slotsWithPact = computeMulticlassSpellSlots(classes);
  } else if (levelData.spellSlots) {
    const isPactMagic = classId === "warlock";
    slotsWithPact = levelData.spellSlots
      .map((total, i) => ({ level: i + 1, total }))
      .filter((s) => s.total > 0)
      .map((s) => ({ ...s, ...(isPactMagic ? { pactMagic: true } : {}) }));
  } else {
    return updated;
  }

  // Summarize changes
  const oldSlotCount = updated.spellSlots.reduce((sum, s) => sum + s.total, 0);
  const newSlotCount = slotsWithPact.reduce((sum, s) => sum + s.total, 0);
  if (newSlotCount !== oldSlotCount) {
    changes.push({
      type: "spellSlots",
      description: `Spell slots updated (${newSlotCount} total slots across ${slotsWithPact.length} levels)`,
      i18nKey: "levelUp.slotsUpdated",
      i18nArgs: { count: newSlotCount, levels: slotsWithPact.length },
    });
  }

  // RA-33 — re-apply the durable per-level count overrides so a homebrew slot
  // count survives a level-up recompute (the same seam reconcile re-applies).
  return {
    ...updated,
    spellSlots: applySlotMaxOverrides(
      slotsWithPact,
      updated.spellcasting?.slotMaxOverrides
    ),
  };
}

// ─── Auto-add Class Features ─────────────────────────────────────────────────

function applyNewFeatures(
  updated: CharacterData,
  newFeatures: SrdClassFeatureData[],
  subclassId: string,
  changes: LevelUpChange[]
): CharacterData {
  if (newFeatures.length === 0) return updated;

  // Get existing feature IDs to avoid duplicates
  const existingIds = new Set(
    updated.features
      .filter((f): f is SrdFeatureRef => !("custom" in f))
      .map((f) => f.srdId)
  );

  // Filter to only features that aren't already added, and skip subclass features
  // unless the ADVANCING class has that subclass (SRD features carry the stable
  // subclass slug in `f.subclass`).
  const subclassSlug = subclassId;
  const featuresToAdd = newFeatures.filter((f) => {
    if (existingIds.has(f.id)) return false;
    // Skip subclass-specific features unless character has that subclass
    if (f.subclass && f.subclass !== subclassSlug) return false;
    return true;
  });

  if (featuresToAdd.length === 0) return updated;

  const newRefs: SrdFeatureRef[] = featuresToAdd.map((f) => ({ srdId: f.id }));
  // Carry the stable feature IDS; the `level-up-view` presenter localizes each at
  // render from the catalogue (golden rule 7). The `description` stays an
  // EN-only debug fallback for any non-i18n caller — never parsed back to ids.
  changes.push({
    type: "feature",
    featureIds: featuresToAdd.map((f) => f.id),
    description: `New features: ${featuresToAdd
      .map((f) => srdEn("class-feature", f.id, "name") ?? f.id)
      .join(", ")}`,
  });

  return {
    ...updated,
    features: [...updated.features, ...newRefs],
  };
}

/**
 * L7 lever — apply `ability-score` grants carried by class features GAINED at
 * exactly `targetLevel` (e.g. Barbarian L20 Primal Champion +4 STR/CON cap 25,
 * Monk L20 Body and Mind +4 DEX/WIS cap 25). One-shot by construction: keyed on
 * `getFeaturesAtLevel(classId, targetLevel)`, so it only fires the level the
 * feature is gained, never re-applying on later level-ups.
 *
 * Feat ASIs are handled separately by the LevelUpModal (player choice via
 * `applyFeatAsi`); race-trait and background ability bonuses are applied at
 * creation. This covers the remaining seam: automatic class-feature ASIs.
 *
 * Raising CON also bumps max HP retroactively across all `targetLevel` levels
 * (the same rule the LevelUpModal applies for a CON-raising feat/ASI), so a
 * Barbarian's L20 +4 CON correctly increases the displayed maximum.
 */
function applyClassFeatureAbilityScores(
  updated: CharacterData,
  newFeatures: SrdClassFeatureData[],
  ctx: AdvanceContext,
  changes: LevelUpChange[]
): CharacterData {
  if (newFeatures.length === 0) return updated;
  const subclassSlug = ctx.subclassId;
  const targetLevel = ctx.classLevel;

  let scores = updated.abilityScores;
  const prevConMod = abilityModifier(scores.CON);
  const notes: string[] = [];
  for (const f of newFeatures) {
    // Subclass-gated features only apply to characters with that subclass.
    if (f.subclass && f.subclass !== subclassSlug) continue;
    for (const g of f.grants ?? []) {
      if (g.type !== "ability-score") continue;
      const before = scores[g.ability];
      scores = applyFeatAsi(scores, g.ability, g.amount, g.cap ?? 20);
      const delta = scores[g.ability] - before;
      if (delta !== 0) notes.push(`${g.ability} +${delta}`);
    }
  }
  if (scores === updated.abilityScores) return updated; // nothing applied

  // Retroactive HP when CON rises (mirrors the LevelUpModal CON-ASI rule).
  let hp = updated.hp;
  const conDelta = abilityModifier(scores.CON) - prevConMod;
  let hpNote = "";
  if (conDelta > 0) {
    const hpGain = conDelta * targetLevel;
    hp = { ...hp, max: hp.max + hpGain };
    hpNote = ` (+${hpGain} HP)`;
  }
  changes.push({
    type: "scaling",
    description: `Ability scores: ${notes.join(", ")}${hpNote}`,
  });
  return { ...updated, abilityScores: scores, hp };
}

// ─── Jack of All Trades auto-populate ────────────────────────────────────────

// ─── Level-Up Checklist ──────────────────────────────────────────────────────

function applyChecklist(
  updated: CharacterData,
  ctx: AdvanceContext,
  changes: LevelUpChange[]
): CharacterData {
  const { classId, subclassId, classLevel: targetLevel } = ctx;
  const table = getClassTable(classId);
  const checklist: LevelUpChecklistItem[] = [];

  // Check for ASI/Feat opportunity
  const levelData = table?.levels.find((l) => l.level === targetLevel);
  if (levelData?.asi) {
    checklist.push({
      text: "Choose: Ability Score Improvement (+2/+1+1) or a Feat",
      done: false,
      i18nKey: "levelUp.checklistAsi",
    });
  }

  // Check for subclass choice. Engine emits the STABLE classId only; the
  // `level-up-view` presenter resolves the localized class name at render
  // (R2 — engine-core never localizes; §3.3 reverse-leak removed).
  if (table && targetLevel === table.subclassLevel && !subclassId) {
    checklist.push({
      text: `Choose your ${srdEn("class", table.id, "name") ?? table.id} subclass`,
      done: false,
      i18nKey: "levelUp.checklistSubclass",
      i18nArgs: { classId: table.id },
    });
  }

  // Check for subclass bonus spells (Oath spells, Domain spells, etc.)
  if (table?.subclassSpellLevels?.includes(targetLevel) && subclassId) {
    checklist.push({
      text: "Add your subclass bonus spells (always prepared)",
      done: false,
      i18nKey: "levelUp.checklistSubclassSpells",
    });
  }

  // Check for spell learning (known casters)
  if (levelData?.spellsKnown != null) {
    const prevLevel = table?.levels.find((l) => l.level === targetLevel - 1);
    if (prevLevel?.spellsKnown != null && levelData.spellsKnown > prevLevel.spellsKnown) {
      const diff = levelData.spellsKnown - prevLevel.spellsKnown;
      checklist.push({
        text: `Learn ${diff} new spell${diff > 1 ? "s" : ""}`,
        done: false,
        i18nKey: "levelUp.checklistLearnSpells",
        i18nArgs: { count: diff },
      });
    }
  }

  // Cantrip learning
  if (levelData?.cantripsKnown != null) {
    const prevLevel = table?.levels.find((l) => l.level === targetLevel - 1);
    if (
      prevLevel?.cantripsKnown != null &&
      levelData.cantripsKnown > prevLevel.cantripsKnown
    ) {
      checklist.push({
        text: "Learn a new cantrip",
        done: false,
        i18nKey: "levelUp.checklistLearnCantrip",
      });
    }
  }

  if (checklist.length > 0) {
    changes.push({
      type: "checklist",
      description: `${checklist.length} item${checklist.length > 1 ? "s" : ""} added to level-up checklist`,
    });
  }

  return {
    ...updated,
    levelUpChecklist: checklist.length > 0 ? checklist : null,
  };
}

// ─── Scaling Features ────────────────────────────────────────────────────────

/**
 * Apply class-progression scaling to tracker dice and informational changes.
 * - Updates trackerOverrides.die for features whose die scales with level (e.g. Bardic Inspiration)
 * - Logs informational changes for Extra Attacks, Sneak Attack dice, Martial Arts die, etc.
 */
function applyScalingFeatures(
  updated: CharacterData,
  ctx: AdvanceContext,
  totalLevel: number,
  changes: LevelUpChange[]
): CharacterData {
  const { classId, classLevel: targetLevel } = ctx;
  const table = getClassTable(classId);
  if (!table) return updated;

  const levelData = table.levels.find((l) => l.level === targetLevel);
  const prevLevelData = table.levels.find((l) => l.level === targetLevel - 1);

  // NOTE: no early-return on a missing `classSpecific` — items 2-4 below simply
  // no-op when their key is absent (spec.foo is undefined), but item 1 (tracker
  // die upgrades) and item 5 (cantrip damage scaling) DON'T depend on
  // `classSpecific` at all and must still run for classes that carry none
  // (Wizard has no classSpecific ever; Cleric none since M11 removed its sole,
  // unconsumed `channelDivinityUses` key) — an early return here used to drop
  // those two unrelated informational changes for such classes.
  const spec = (levelData?.classSpecific ?? {}) as Record<string, unknown>;
  const prevSpec = (prevLevelData?.classSpecific ?? {}) as Record<string, unknown>;

  // 1. Informational: a tracker die that scales at this level (Bardic
  //    Inspiration d6→d8→d10→d12, etc.). Detected from each owned feature's OWN
  //    tracker `levels[]` — data-driven, no hard-coded map. We only LOG it: the
  //    smart-tracker already resolves the scaled die from `levels[]` at render,
  //    so we never write `trackerOverrides.die` (which would clobber a user's
  //    manual die override and make it un-revertable on every level-up).
  const dieAtLevel = (
    tracker: { die?: string; levels?: ReadonlyArray<{ from: number; die?: string }> },
    lvl: number
  ): string | undefined => {
    let d = tracker.die;
    for (const e of tracker.levels ?? []) {
      if (e.from <= lvl && typeof e.die === "string") d = e.die;
    }
    return d;
  };
  for (const ref of updated.features) {
    if ("custom" in ref) continue;
    const tracker = classFeatureIndex.get(ref.srdId)?.mechanics?.tracker;
    if (!tracker?.die || !tracker.levels?.length) continue;
    const newDie = dieAtLevel(tracker, targetLevel);
    const oldDie = dieAtLevel(tracker, targetLevel - 1);
    if (!newDie || newDie === oldDie) continue;
    // EN fallback name for the legacy `description` (a no-i18n caller). The
    // localized feature name is resolved at render by the `level-up-view`
    // presenter from the STABLE `featureId` (R2 — engine-core never localizes).
    const featureName =
      srdEn("class-feature", ref.srdId, "name") ??
      ref.srdId.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    changes.push({
      type: "scaling",
      description: `${featureName} die upgraded: ${oldDie ?? "d6"} → ${newDie}`,
      i18nKey: "levelUp.scaling.dieUpgrade",
      i18nArgs: {
        featureId: ref.srdId,
        from: oldDie ?? "d6",
        to: newDie,
      },
    });
  }

  // 2. Informational: Extra Attacks (Fighter / Ranger / Paladin / Monk)
  const extraAttacks = spec.extraAttacks;
  const prevExtraAttacks = prevSpec.extraAttacks;
  if (typeof extraAttacks === "number" && extraAttacks !== prevExtraAttacks) {
    const total = 1 + extraAttacks;
    changes.push({
      type: "scaling",
      description: `Extra Attack: now making ${total} attack${total > 1 ? "s" : ""} per Attack action`,
      i18nKey: "levelUp.scaling.extraAttack",
      i18nArgs: { count: total },
    });
  }

  // 3. Informational: Sneak Attack dice (Rogue)
  const sneakDice = spec.sneakAttackDice;
  const prevSneakDice = prevSpec.sneakAttackDice;
  if (typeof sneakDice === "number" && sneakDice !== prevSneakDice) {
    const prevCount = typeof prevSneakDice === "number" ? prevSneakDice : sneakDice - 1;
    changes.push({
      type: "scaling",
      description: `Sneak Attack: ${sneakDice}d6 (was ${prevCount}d6)`,
      i18nKey: "levelUp.scaling.sneakAttack",
      i18nArgs: { dice: sneakDice, prev: prevCount },
    });
  }

  // 4. Informational: Martial Arts die (Monk)
  const martialDie = spec.martialArtsDie;
  const prevMartialDie = prevSpec.martialArtsDie;
  if (typeof martialDie === "string" && martialDie !== prevMartialDie) {
    const prevDie = typeof prevMartialDie === "string" ? prevMartialDie : "d4";
    changes.push({
      type: "scaling",
      description: `Martial Arts die: ${prevDie} → ${martialDie}`,
      i18nKey: "levelUp.scaling.martialArts",
      i18nArgs: { from: prevDie, to: martialDie },
    });
  }

  // 5. Informational: Cantrip damage scaling at CHARACTER levels 5, 11, 17 —
  //    total level, NOT class level (RAW 2024 cantrip "Cantrip Upgrade" text).
  const cantripScaleLevels = [5, 11, 17];
  if (
    cantripScaleLevels.includes(totalLevel) &&
    updated.spells.some((s) => !("custom" in s))
  ) {
    changes.push({
      type: "scaling",
      description: `Cantrip damage scales at level ${totalLevel} — cantrips that deal damage now use more dice`,
      i18nKey: "levelUp.scaling.cantripScale",
      i18nArgs: { level: totalLevel },
    });
  }

  return updated;
}

// ─── Utilities ───────────────────────────────────────────────────────────────

/**
 * Get the average HP gain (with CON modifier) for a character leveling up.
 * Used by the Level-Up UI to display the default value.
 */
export function getAverageHpGain(hitDie: 4 | 6 | 8 | 10 | 12, conScore: number): number {
  const conMod = abilityModifier(conScore);
  return Math.max(1, hitDieAverage(hitDie) + conMod);
}
