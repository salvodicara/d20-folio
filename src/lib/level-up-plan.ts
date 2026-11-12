/**
 * What a level asks, for the character gaining it in a given class: the class
 * table rows, the Hit Point die and its average, and each pick the level opens
 * (ASI or Epic Boon, subclass, Fighting Style, Expertise, Weapon Mastery,
 * metamagic, invocations, maneuvers, new cantrips and spells, a spell swap, the
 * grant-driven choice slots, unchosen variant bundles, Spell Mastery, Signature
 * Spells, a new class's entry grants), with how many of each.
 *
 * Moved verbatim from the classic level-up wizard so both level-up screens ask
 * the same things; `commitLevelUp` then applies the answers. The picks still in
 * flight that change what is asked (the subclass, the ASI feat, the fighting
 * style) come in as `interim`.
 *
 * Pure module — no React, no store, no Firebase.
 */
import { getAverageHpGain, levelUp } from "@/lib/level-up";
import { proficientSkillIds } from "@/lib/skills";
import { getClassTable, getFeaturesAtLevel } from "@/data/classes";
import { classEntryLevel, getClasses, totalLevel } from "@/lib/classes";
import { multiclassEntryGrants } from "@/lib/multiclass";
import { collectChoiceSlots, collectGrantBundles } from "@/lib/feature-choices";
import {
  eligibleSpellMasteryPicks,
  hasEligibleSpellsAtLevel,
} from "@/lib/spell-mastery-pick";
import {
  eligibleSignatureSpells,
  hasEligibleSignatureSpells,
} from "@/lib/signature-spells-pick";
import { resolveGrantSourcesForFeatures } from "@/lib/resolve-grant-sources";
import { isFightingStylePlaceholder } from "@/lib/fighting-style";
import {
  isExpertisePlaceholder,
  listExpertiseEligibleSkills,
} from "@/lib/expertise-pick";
import { weaponMasteryCountForClass } from "@/lib/weapon-mastery-pick";
import { isMetamagicPlaceholder, metamagicPicksAtLevel } from "@/lib/metamagic-pick";
import { isInvocationPlaceholder, newInvocationsAtLevel } from "@/lib/invocation-pick";
import { isManeuverPlaceholder, newManeuversAtLevel } from "@/lib/maneuver-pick";
import { type AsiChoice } from "@/lib/level-up-choices";
import { widenedSpellListsAtLevel } from "@/lib/feat-spell-choices";
import {
  type CharacterDoc,
  type SrdFeatureRef,
  type SrdSpellRef,
} from "@/types/character";
import { WIZARD_BOOK_PER_LEVEL, WIZARD_BOOK_START } from "@/lib/wizard-spellbook";

export const HIT_DIE_AVG: Record<number, number> = { 4: 3, 6: 4, 8: 5, 10: 6, 12: 7 };

/** The picks in flight that change what the level asks. */
export interface LevelUpInterim {
  subclassId: string | null;
  asiChoice: AsiChoice;
  fightingStyle: string | null;
}

export function levelUpPlan(
  character: CharacterDoc | null,
  classId: string,
  interim: LevelUpInterim
) {
  const charData = character?.character;
  const currentLevel = charData ? totalLevel(charData) : 1;
  const newLevel = currentLevel + 1;
  const currentClassLevel = charData ? classEntryLevel(charData, classId) : 0;
  const newClassLevel = currentClassLevel + 1;
  const isNewClass = currentClassLevel === 0;
  const advancingEntry = charData
    ? (getClasses(charData).find((e) => e.classId === classId) ?? null)
    : null;
  const advancingSubclassId = advancingEntry?.subclassId ?? "";
  const classTable = getClassTable(classId);
  const levelData = classTable?.levels.find((l) => l.level === newClassLevel);
  const prevLevelData = classTable?.levels.find((l) => l.level === currentClassLevel);
  const subclassChoice = interim.subclassId;
  const asiChoice = interim.asiChoice;
  const fightingStyleChoice = interim.fightingStyle;

  // HP — the ADVANCING class's hit die (a multiclass level grants that die).
  const hitDie = classTable?.hitDie ?? charData?.hitDieType ?? 8;
  const avgHpGain = charData ? getAverageHpGain(hitDie, charData.abilityScores.CON) : 0;
  const needsAsi = levelData?.asi === true;
  // D7 — the L19 boon step is the EPIC BOON gate: every class grants its
  // `<class>-epic-boon` feature at level 19. 2024 RAW restricts level 19 to an Epic
  // Boon feat (no general feat, no +2/+1 ASI fork), unlike the 4/8/12/16 ASI levels.
  // Detected from the level's own featureIds so it's class-agnostic + multiclass-safe
  // (only the class actually reaching its L19 grants the boon).
  const isEpicBoonGate =
    needsAsi && levelData.featureIds.some((id) => id.endsWith("-epic-boon"));
  const needsSubclass =
    classTable != null &&
    newClassLevel === classTable.subclassLevel &&
    !(advancingEntry?.subclassId ?? "");

  const needsFightingStyle = (() => {
    if (!charData) return false;
    // The Fighting-Style slot opens via a placeholder feature granted THIS level —
    // either a BASE-class row (Fighter L1 / Paladin L2 / Ranger L2) or a SUBCLASS
    // feature (Champion's "Additional Fighting Style" at L7). `getFeaturesAtLevel`
    // returns BOTH (subclass features carry their own `level`), so reading it here —
    // scoped to the effective subclass (rule 7, branch on the id) — reaches the
    // Champion's 2nd style that the base `levelData.featureIds` never lists.
    const effectiveSubclass = (subclassChoice ?? advancingSubclassId).toLowerCase();
    return getFeaturesAtLevel(classId, newClassLevel).some(
      (f) =>
        isFightingStylePlaceholder(f.id) &&
        (!f.subclass || f.subclass.toLowerCase() === effectiveSubclass)
    );
  })();
  const needsExpertise = (levelData?.featureIds ?? []).some(isExpertisePlaceholder);
  const charSkills = charData?.skills;
  const charMetamagicChoices = advancingEntry?.metamagicChoices;
  const charManeuverChoices = advancingEntry?.maneuverChoices;
  const charInvocationChoices = advancingEntry?.invocationChoices;
  const expertiseEligible = charSkills ? listExpertiseEligibleSkills(charSkills) : [];
  const weaponMasteryCount = weaponMasteryCountForClass(classId, newClassLevel);
  // The count this class had granted at the PREVIOUS level in it (0 before the
  // class is taken) — so a fresh grant THIS level is detectable as a delta.
  const prevWeaponMasteryCount =
    currentClassLevel >= 1 ? weaponMasteryCountForClass(classId, currentClassLevel) : 0;
  // #30 — prompt EXACTLY when the class's Weapon Mastery column GROWS this level:
  // the first grant at L1 (0→2/3), then each increase (Barbarian 4/10, Fighter
  // 4/10/16) — not only when the placeholder feature first appears at L1. The
  // count is READ from the class table (the single source of truth), so the
  // wizard scales by construction. The already-owned masteries are pre-seeded
  // (the seeding effect above) so the player keeps them and chooses only the
  // newly granted slot. `weaponMasteryCount` is 0 for non-mastery classes, so
  // the delta is never positive and the step never appears for them.
  const needsWeaponMastery =
    charData != null && weaponMasteryCount > prevWeaponMasteryCount;
  // The spell lists the advancing class's prepared/known pool may draw from at
  // the NEW level — the class's own list, UNIONed with any "Magical Secrets"-
  // style pool-widener it has accumulated (Bard L10+: bard∪cleric∪druid∪wizard).
  // Derived purely from the grants (golden rule 7 — never branch on feature ids
  // / display strings); the widening is PERSISTENT for every qualifying level,
  // not a one-time event. `subclassChoice` is the subclass just chosen THIS
  // level-up (Lore picked at L3 widens the L6 Discoveries, etc.).
  const widenedSpellLists = (() => {
    if (!charData || !classId) return new Set<string>();
    return widenedSpellListsAtLevel(
      classId,
      newClassLevel,
      subclassChoice ?? advancingSubclassId
    );
  })();
  // True when the pool is broader than the class's own list — keys the widened-
  // pool hint (re-derived from the union, not a feature-id check).
  const isSpellPoolWidened = widenedSpellLists.size > 1;
  // Asked whenever the class HAS Metamagic (granted at any level up to this one)
  // and the table gives more this level — 2024: 2 at 2, 2 more at 10 and at 17.
  // Reading only THIS level's features asked them at level 2 alone.
  const needsMetamagic = (() => {
    if (!charData) return false;
    const hasMetamagic = (classTable?.levels ?? []).some(
      (l) => l.level <= newClassLevel && l.featureIds.some(isMetamagicPlaceholder)
    );
    if (!hasMetamagic) return false;
    return metamagicPicksAtLevel(newClassLevel) > 0;
  })();
  const metamagicPicksNeeded = metamagicPicksAtLevel(newClassLevel);
  const alreadyKnownMetamagic = new Set(charMetamagicChoices ?? []);
  // Asked whenever the class HAS Eldritch Invocations (granted at any level up to
  // this one) and the table's known count grows this level — 2024: 1 → 3 at 2,
  // then 5, 6, 7, 8, 9, 10 at 5/7/9/12/15/18 — like Weapon Mastery's delta.
  // Reading only THIS level's features asked them at level 1 alone.
  const needsInvocations = (() => {
    if (!charData) return false;
    const hasInvocations = (classTable?.levels ?? []).some(
      (l) => l.level <= newClassLevel && l.featureIds.some(isInvocationPlaceholder)
    );
    if (!hasInvocations) return false;
    return newInvocationsAtLevel(newClassLevel) > 0;
  })();
  const invocationPicksNeeded = newInvocationsAtLevel(newClassLevel);
  // Inline (no manual memo): deps include freshly-derived values the React
  // Compiler can't preserve a manual memo over — it auto-memoizes this itself.
  const needsManeuvers = (() => {
    if (!charData) return false;
    if (newManeuversAtLevel(newClassLevel) <= 0) return false;
    const effectiveSubclass = (subclassChoice ?? advancingSubclassId).toLowerCase();
    return (
      charData.features.some((f) => "srdId" in f && isManeuverPlaceholder(f.srdId)) ||
      getFeaturesAtLevel(classId, newClassLevel).some(
        (f) =>
          isManeuverPlaceholder(f.id) &&
          (!f.subclass || f.subclass.toLowerCase() === effectiveSubclass)
      )
    );
  })();
  const maneuversNeeded = newManeuversAtLevel(newClassLevel);
  const canSwapSpell = classTable?.canSwapSpell === true;
  // For a NEW class's first level there is no previous row: the baseline is 0,
  // so a first level in a caster class asks for its full L1 spell loadout.
  const prevSpellsKnown = isNewClass ? 0 : prevLevelData?.spellsKnown;
  const prevCantripsKnown = isNewClass ? 0 : prevLevelData?.cantripsKnown;
  // A Wizard's level-up adds to the spellbook (6 at its first Wizard level, then 2),
  // not the Prepared Spells increase: the higher limit is filled from the book.
  const spellbookPicks = classId === "wizard" && levelData?.spellsKnown != null;
  const spellsKnownDiff = spellbookPicks
    ? isNewClass
      ? WIZARD_BOOK_START
      : WIZARD_BOOK_PER_LEVEL
    : levelData?.spellsKnown != null && prevSpellsKnown != null
      ? Math.max(0, levelData.spellsKnown - prevSpellsKnown)
      : 0;
  const cantripsKnownDiff =
    levelData?.cantripsKnown != null && prevCantripsKnown != null
      ? Math.max(0, levelData.cantripsKnown - prevCantripsKnown)
      : 0;

  const maxSpellLevel = (() => {
    if (!levelData?.spellSlots) return 0;
    for (let i = levelData.spellSlots.length - 1; i >= 0; i--) {
      if ((levelData.spellSlots[i] ?? 0) > 0) return i + 1;
    }
    return 0;
  })();

  const existingSpellIds: Set<string> = !charData
    ? new Set()
    : new Set(
        charData.spells
          .filter((s): s is SrdSpellRef => !("custom" in s))
          .map((s) => s.srdId)
      );

  const knownNonCantripRefs = (() => {
    if (!charData) return [];
    return charData.spells.filter(
      (s): s is SrdSpellRef => !("custom" in s) && s.alwaysPrepared !== true
    );
  })();

  // Preview (average die, advancing class) — feeds the review cards.
  const preview = (() => {
    if (!charData || currentLevel >= 20) return null;
    try {
      return levelUp(charData, newLevel, {
        hpGain: HIT_DIE_AVG[hitDie] ?? 5,
        advanceClassId: classId,
      });
    } catch {
      return null;
    }
  })();

  // The unified choice slots (gained features + the in-flight ASI feat) +
  // the per-class slot rows feeding recurring entitlements (School Savant).
  const { choiceSlots, newRows } = (() => {
    const empty = {
      choiceSlots: collectChoiceSlots([]),
      newRows: {} as Record<string, ReadonlyArray<number>>,
    };
    if (!charData) return empty;
    const effectiveSubclass = (subclassChoice ?? advancingSubclassId).toLowerCase();
    const refs: SrdFeatureRef[] = [];
    for (const f of getFeaturesAtLevel(classId, newClassLevel)) {
      if (f.subclass) {
        if (effectiveSubclass && f.subclass.toLowerCase() === effectiveSubclass) {
          refs.push({ srdId: f.id });
        }
      } else {
        refs.push({ srdId: f.id });
      }
    }
    if (asiChoice.mode === "feat" && asiChoice.featId) {
      refs.push({ srdId: asiChoice.featId });
    }
    // A chosen CASTER fighting style (Blessed/Druidic Warrior) carries a
    // choice-cantrip grant — surface its cantrip sub-pick through the SAME
    // collect-choice-slots seam Magic Initiate uses (the slot is namespaced
    // `<styleId>::spell::…`, rendered inline under the picker, applied by
    // `applyChoicePicks`). A non-caster style carries no spell grants, so this
    // adds no slot.
    if (needsFightingStyle && fightingStyleChoice) {
      refs.push({ srdId: fightingStyleChoice });
    }
    const rows: Record<string, ReadonlyArray<number>> = {};
    const priorRows: Record<string, ReadonlyArray<number>> = {};
    const entries = getClasses(charData);
    const advancingOwned = entries.some((e) => e.classId === classId);
    for (const entry of entries) {
      const table = getClassTable(entry.classId);
      if (!table) continue;
      const lvlNew = entry.classId === classId ? entry.level + 1 : entry.level;
      rows[entry.classId] =
        table.levels.find((l) => l.level === lvlNew)?.spellSlots ?? [];
      priorRows[entry.classId] =
        table.levels.find((l) => l.level === entry.level)?.spellSlots ?? [];
    }
    if (!advancingOwned && classTable) {
      rows[classId] = classTable.levels.find((l) => l.level === 1)?.spellSlots ?? [];
      priorRows[classId] = [];
    }
    const slots = collectChoiceSlots(resolveGrantSourcesForFeatures(refs), {
      spellSlotsByClass: rows,
    });
    const gainedIds = new Set(refs.map((r) => r.srdId));
    const ownedRefs: SrdFeatureRef[] = charData.features.filter(
      (f): f is SrdFeatureRef => !("custom" in f) && !gainedIds.has(f.srdId)
    );
    const recurringSources = resolveGrantSourcesForFeatures(ownedRefs)
      .map((src) => ({
        ...src,
        grants: (src.grants ?? []).filter(
          (g) => g.type === "choice-spell" && g.recurringPerSpellLevel !== undefined
        ),
      }))
      .filter((src) => src.grants.length > 0);
    if (recurringSources.length > 0) {
      const recurring = collectChoiceSlots(recurringSources, {
        spellSlotsByClass: rows,
        priorSpellSlotsByClass: priorRows,
      });
      slots.spell.push(...recurring.spell);
    }
    return { choiceSlots: slots, newRows: rows };
  })();

  const sessionBundleChoices = character?.session.grantBundleChoices;
  const levelUpBundles = (() => {
    if (!charData) return [];
    const effectiveSubclass = (subclassChoice ?? advancingSubclassId).toLowerCase();
    const refs: SrdFeatureRef[] = [];
    for (const f of getFeaturesAtLevel(classId, newClassLevel)) {
      if (!f.subclass || f.subclass.toLowerCase() === effectiveSubclass) {
        refs.push({ srdId: f.id });
      }
    }
    for (const f of charData.features) {
      if ("srdId" in f) refs.push({ srdId: f.srdId });
    }
    const chosen = new Map(Object.entries(sessionBundleChoices ?? {}));
    return collectGrantBundles(resolveGrantSourcesForFeatures(refs), chosen).filter(
      (b) => b.selected === null
    );
  })();
  const needsBundles = levelUpBundles.length > 0;

  const needsSpellMastery = (() => {
    if (!charData || classId !== "wizard" || newClassLevel !== 18) return false;
    return (
      hasEligibleSpellsAtLevel(charData.spells, 1) ||
      hasEligibleSpellsAtLevel(charData.spells, 2)
    );
  })();
  const spellMasteryEligibleL1 =
    charData && needsSpellMastery ? eligibleSpellMasteryPicks(charData.spells, 1) : [];
  const spellMasteryEligibleL2 =
    charData && needsSpellMastery ? eligibleSpellMasteryPicks(charData.spells, 2) : [];
  const needsSignatureSpells = (() => {
    if (!charData || classId !== "wizard" || newClassLevel !== 20) return false;
    return hasEligibleSignatureSpells(charData.spells);
  })();
  const signatureSpellsEligible =
    charData && needsSignatureSpells ? eligibleSignatureSpells(charData.spells) : [];

  // #36 — entry grants for a NEW class (null when advancing an owned class).
  const mcGrants = isNewClass ? multiclassEntryGrants(classId) : null;
  // Skills the character is REALLY proficient in. NEVER key presence: a
  // rehydrated Jack-of-All-Trades character carries a `halfProficiency` entry
  // for all 18 skills, and presence-keyed filters emptied every skill pool
  // (the live Bard→Ladro dead-end, owner 2026-06-11).
  const ownedSkillIds = charData
    ? proficientSkillIds(charData.skills)
    : new Set<string>();
  // The ONE multiclass-skill pool: proficient skills are EXCLUDED (rule 19 —
  // never a row that only says "you can't pick this"); JoAT half proficiency
  // never blocks. The requirement clamps to the pool, so a character who
  // already owns the whole class list simply has no ask (nothing to gain) —
  // never an unfulfillable 0-option step.
  const mcSkillOptions = (mcGrants?.skillChoice?.options ?? []).filter(
    (id) => !ownedSkillIds.has(id)
  );
  const mcSkillNeeded = Math.min(
    mcGrants?.skillChoice?.count ?? 0,
    mcSkillOptions.length
  );

  return {
    currentLevel,
    newLevel,
    currentClassLevel,
    newClassLevel,
    isNewClass,
    advancingEntry,
    advancingSubclassId,
    classTable,
    levelData,
    prevLevelData,
    hitDie,
    avgHpGain,
    needsAsi,
    isEpicBoonGate,
    needsSubclass,
    needsFightingStyle,
    needsExpertise,
    charSkills,
    charMetamagicChoices,
    charManeuverChoices,
    charInvocationChoices,
    expertiseEligible,
    weaponMasteryCount,
    prevWeaponMasteryCount,
    needsWeaponMastery,
    widenedSpellLists,
    isSpellPoolWidened,
    needsMetamagic,
    metamagicPicksNeeded,
    alreadyKnownMetamagic,
    needsInvocations,
    invocationPicksNeeded,
    needsManeuvers,
    maneuversNeeded,
    canSwapSpell,
    prevSpellsKnown,
    prevCantripsKnown,
    spellsKnownDiff,
    spellbookPicks,
    cantripsKnownDiff,
    maxSpellLevel,
    existingSpellIds,
    knownNonCantripRefs,
    preview,
    choiceSlots,
    newRows,
    sessionBundleChoices,
    levelUpBundles,
    needsBundles,
    needsSpellMastery,
    spellMasteryEligibleL1,
    spellMasteryEligibleL2,
    needsSignatureSpells,
    signatureSpellsEligible,
    mcGrants,
    ownedSkillIds,
    mcSkillOptions,
    mcSkillNeeded,
  };
}

export type LevelUpPlan = ReturnType<typeof levelUpPlan>;
