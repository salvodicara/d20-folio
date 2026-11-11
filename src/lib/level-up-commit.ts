/**
 * Committing a level-up: the next level's base (`levelUp`) and every pick the
 * level asked for, applied in one pure pass — the ASI or feat (with its Hit
 * Point and Constitution backfill), the subclass and its expanded spells, the
 * class picks (`applyClassPicks`, shared with character creation), new cantrips
 * and spells, the grant-driven choice slots, a new multiclass entry's grants,
 * Spell Mastery, Signature Spells, a spell swap, the variant bundles — then the
 * checklist, Armor Class, always-prepared spells and subclass spellcasting.
 *
 * Moved verbatim from the classic level-up wizard's confirm, so both level-up
 * screens commit the same way. The caller decides which picks apply (a pick the
 * level doesn't ask for is passed empty / null); saving and the pre-level
 * snapshot stay with the caller.
 *
 * Pure module — no React, no store, no Firebase.
 */
import { highestSpellSlotLevel } from "@/lib/multiclass-slots";
import { amountAtCastLevel } from "@/lib/scalar";
import { levelUp } from "@/lib/level-up";
import { isUmbrellaTool } from "@/lib/tool-names";
import { abilityModifier, computeAC } from "@/lib/compute";
import { grantSkillProficiency } from "@/lib/skills";
import { getEquipment } from "@/data/equipment";
import { getClassTable, getFeaturesAtLevel } from "@/data/classes";
import type {
  CharacterData,
  CharacterDoc,
  ClassEntry,
  SrdFeatureRef,
  SrdSpellRef,
} from "@/types/character";
import { SRD_FEATS } from "@/data/feats";
import { applyFeatAsi, featAsi } from "@/lib/feat-asi";
import {
  applyChoicePicks,
  type ChoicePicks,
  type FeatureChoiceSlots,
} from "@/lib/feature-choices";
import { applySpellMasteryPicks, type SpellMasteryPicks } from "@/lib/spell-mastery-pick";
import {
  applySignatureSpellsPicks,
  type SignatureSpellsPicks,
} from "@/lib/signature-spells-pick";
import {
  getAlwaysPreparedFromGrants,
  getExpandedSpellsAtLevel,
  getExpandedSpellsThroughLevel,
  injectExpandedSpells,
} from "@/lib/expanded-spells";
import { resolveGrantSourcesForFeatures } from "@/lib/resolve-grant-sources";
import { applySubclassSpellcasting } from "@/lib/subclass-spellcasting";
import { hasFightingStyleFeat } from "@/lib/fighting-style";
import { EXPERTISE_PICKS_PER_GRANT, applyExpertisePicks } from "@/lib/expertise-pick";
import {
  applyAsiToScores,
  isAsiChoiceComplete,
  type AsiChoice,
} from "@/lib/level-up-choices";
import { applySpellSwap, type SpellSwapChoice } from "@/lib/spell-swap";
import { applyFeatSpellChange } from "@/lib/feat-spell-change";
import { classEntryLevel, getClasses, totalLevel } from "@/lib/classes";
import type { MulticlassEntryGrants } from "@/lib/multiclass";

/** What the level asks, as the player answered it (empty / null when not asked). */
export interface LevelUpPicks {
  /** The class gaining the level (a new id adds a multiclass entry). */
  classId: string;
  /** A rolled Hit Point gain; absent takes the average. */
  hpGain?: number;
  asi: AsiChoice | null;
  subclassId: string | null;
  fightingStyle: string | null;
  expertise: readonly string[];
  /** The class's full mastery list after this level; null leaves it as it is. */
  weaponMasteries: readonly string[] | null;
  metamagic: readonly string[];
  maneuvers: readonly string[];
  invocations: readonly string[];
  newCantrips: readonly string[];
  newSpells: readonly string[];
  choiceSlots: FeatureChoiceSlots;
  choicePicks: ChoicePicks;
  /** A new class's entry grants and the skill it lets the player pick. */
  multiclass: { grants: MulticlassEntryGrants; skillPicks: readonly string[] } | null;
  spellMastery: SpellMasteryPicks | null;
  signatureSpells: SignatureSpellsPicks | null;
  swap: SpellSwapChoice;
  /** A cantrip swapped for another (Bard, Sorcerer, Warlock); absent: none. */
  cantripSwap?: SpellSwapChoice;
  /** A feat's Spell Change (Magic Initiate): its pick replaced, keeping what the
   *  feat gave it (free cast, ability, always prepared). Absent: none. */
  featSpellChanges?: ReadonlyArray<SpellSwapChoice>;
  bundlePicks: Readonly<Record<string, string>>;
}

/**
 * Merge a patch onto the ADVANCING class's entry of `classes[]` (after the
 * engine ran, the entry exists — including a freshly-added multiclass entry).
 * Returns a fresh CharacterData; never mutates. A key set to `undefined` is
 * dropped (rebuild by inclusion — no dynamic delete).
 */
export function patchClassEntry(
  c: CharacterData,
  classId: string,
  patch: Partial<ClassEntry>
): CharacterData {
  const classes = c.classes.map((e) => ({ ...e }));
  const idx = classes.findIndex((e) => e.classId === classId);
  const target = idx >= 0 ? idx : 0;
  const base = classes[target];
  if (!base) return c;
  const merged = { ...base, ...patch } as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(merged)) {
    if (v !== undefined) next[k] = v;
  }
  classes[target] = next as unknown as ClassEntry;
  return { ...c, classes };
}

/**
 * The class's own picks (a Fighting Style, Expertise, Weapon Mastery, Metamagic,
 * maneuvers, Eldritch Invocations, cantrips), applied where they live: a style as
 * a feature, Expertise on the skills, masteries (replaced) and Metamagic,
 * maneuvers and invocations (added) on the class entry, cantrips on the spell
 * list. Character creation, level-up and the sheet's owed picks
 * (`applyOwedClassPicks`) all apply them here.
 */
export function applyClassPicks(
  character: CharacterData,
  classId: string,
  picks: {
    fightingStyle?: string | null;
    expertise?: readonly string[];
    weaponMasteries?: readonly string[] | null;
    metamagic?: readonly string[];
    maneuvers?: readonly string[];
    invocations?: readonly string[];
    cantrips?: readonly string[];
  }
): CharacterData {
  let updated = character;
  const fightingStyleChoice = picks.fightingStyle ?? null;
  const expertisePicks = picks.expertise ?? [];
  const weaponMasteryPicks = picks.weaponMasteries ?? null;
  const invocationPicks = picks.invocations ?? [];
  if (fightingStyleChoice) {
    if (!hasFightingStyleFeat(updated.features, fightingStyleChoice)) {
      updated = {
        ...updated,
        features: [...updated.features, { srdId: fightingStyleChoice }],
      };
    }
  }

  if (expertisePicks.length === EXPERTISE_PICKS_PER_GRANT) {
    updated = {
      ...updated,
      skills: applyExpertisePicks(updated.skills, expertisePicks),
    };
  }

  if (weaponMasteryPicks) {
    updated = patchClassEntry(updated, classId, {
      weaponMasteries: [...weaponMasteryPicks],
    });
  }

  const metamagicPicks = picks.metamagic ?? [];
  if (metamagicPicks.length > 0) {
    const current =
      updated.classes.find((e) => e.classId === classId)?.metamagicChoices ?? [];
    const next = [...current];
    for (const id of metamagicPicks) if (!next.includes(id)) next.push(id);
    updated = patchClassEntry(updated, classId, { metamagicChoices: next });
  }

  const maneuverPicks = picks.maneuvers ?? [];
  if (maneuverPicks.length > 0) {
    const current =
      updated.classes.find((e) => e.classId === classId)?.maneuverChoices ?? [];
    const next = [...current];
    for (const id of maneuverPicks) if (!next.includes(id)) next.push(id);
    updated = patchClassEntry(updated, classId, { maneuverChoices: next });
  }

  if (invocationPicks.length > 0) {
    const current =
      updated.classes.find((e) => e.classId === classId)?.invocationChoices ?? [];
    const next = [...current];
    for (const id of invocationPicks) if (!next.includes(id)) next.push(id);
    updated = patchClassEntry(updated, classId, { invocationChoices: next });
  }

  const cantripPicks = picks.cantrips ?? [];
  if (cantripPicks.length > 0) {
    const cantripRefs: SrdSpellRef[] = cantripPicks.map((id) => ({ srdId: id }));
    updated = { ...updated, spells: [...updated.spells, ...cantripRefs] };
  }
  return updated;
}

/** The character after the level-up, with every pick applied. */
export function commitLevelUp(doc: CharacterDoc, picks: LevelUpPicks): CharacterDoc {
  const charData = doc.character;
  const newLevel = totalLevel(charData) + 1;
  const classId = picks.classId;
  const newClassLevel = classEntryLevel(charData, classId) + 1;
  const advancingEntry = getClasses(charData).find((e) => e.classId === classId) ?? null;
  const levelData = getClassTable(classId)?.levels.find((l) => l.level === newClassLevel);
  const asiChoice = picks.asi;
  const subclassChoice = picks.subclassId;
  const newCantrips = picks.newCantrips;
  const newSpells = picks.newSpells;
  const choiceSlots = picks.choiceSlots;
  const activeChoicePicks = picks.choicePicks;
  const mcGrants = picks.multiclass?.grants ?? null;
  const mcSkillPicks = picks.multiclass?.skillPicks ?? [];
  const spellMasteryPicks = picks.spellMastery;
  const signatureSpellsPicks = picks.signatureSpells;
  const swapChoice = picks.swap;
  const bundlePicks = picks.bundlePicks;

  const { updatedCharacter: base } = levelUp(charData, newLevel, {
    hpGain: picks.hpGain,
    advanceClassId: classId,
  });

  let updated = base;
  const handledChecklistKeys: string[] = [];

  if (asiChoice && isAsiChoiceComplete(asiChoice)) {
    handledChecklistKeys.push("levelUp.checklistAsi");
    if (asiChoice.mode === "plus2" || asiChoice.mode === "plus1_1") {
      const prevCon = updated.abilityScores.CON;
      updated = {
        ...updated,
        abilityScores: applyAsiToScores(updated.abilityScores, asiChoice),
      };
      const newCon = updated.abilityScores.CON;
      const delta = abilityModifier(newCon) - abilityModifier(prevCon);
      if (delta > 0) {
        updated = { ...updated, hp: { max: updated.hp.max + newLevel * delta } };
      }
    } else if (asiChoice.featId) {
      const feat = SRD_FEATS.find((f) => f.id === asiChoice.featId);
      if (feat) {
        // A chosen increase is recorded on the feat itself: the one place "the
        // ability increased by this feat" is read from (`featAbilityOf`).
        const chooses = (feat.grants ?? []).some(
          (g) => g.type === "choice-ability-score"
        );
        const featRef: SrdFeatureRef =
          chooses && asiChoice.featAbility
            ? { srdId: feat.id, featAbility: asiChoice.featAbility }
            : { srdId: feat.id };
        updated = { ...updated, features: [...updated.features, featRef] };
        const flatHp = (feat.grants ?? []).reduce(
          (sum, g) =>
            g.type === "hp-flat" ? sum + amountAtCastLevel(g.amount, undefined) : sum,
          0
        );
        if (flatHp > 0) {
          updated = { ...updated, hp: { max: updated.hp.max + flatHp } };
        }
        const asi = featAsi(feat);
        if (asi && asiChoice.featAbility) {
          const prevCon = updated.abilityScores.CON;
          updated = {
            ...updated,
            abilityScores: applyFeatAsi(
              updated.abilityScores,
              asiChoice.featAbility,
              asi.amount,
              asi.cap
            ),
          };
          const newCon = updated.abilityScores.CON;
          const delta = abilityModifier(newCon) - abilityModifier(prevCon);
          if (delta > 0) {
            updated = {
              ...updated,
              hp: { max: updated.hp.max + newLevel * delta },
            };
          }
        }
        let hpBackfill = 0;
        for (const g of feat.grants ?? []) {
          if (g.type === "hp-per-level") hpBackfill += g.amount * newLevel;
        }
        if (hpBackfill > 0) {
          updated = { ...updated, hp: { max: updated.hp.max + hpBackfill } };
        }
        if (feat.id === "resilient" && asiChoice.featAbility) {
          const chosen = asiChoice.featAbility;
          if (!updated.savingThrows.includes(chosen)) {
            updated = {
              ...updated,
              savingThrows: [...updated.savingThrows, chosen],
            };
          }
        }
      }
    }
  }

  if (subclassChoice) {
    handledChecklistKeys.push("levelUp.checklistSubclass");
    updated = patchClassEntry(updated, classId, { subclassId: subclassChoice });
    const subFeatures = getFeaturesAtLevel(classId, newClassLevel).filter(
      (f) => f.subclass && f.subclass.toLowerCase() === subclassChoice.toLowerCase()
    );
    const existingIds = new Set(
      updated.features
        .filter((f): f is SrdFeatureRef => !("custom" in f))
        .map((f) => f.srdId)
    );
    const newRefs: SrdFeatureRef[] = subFeatures
      .filter((f) => !existingIds.has(f.id))
      .map((f) => ({ srdId: f.id }));
    if (newRefs.length > 0) {
      updated = { ...updated, features: [...updated.features, ...newRefs] };
    }
    const expanded = getExpandedSpellsThroughLevel(
      classId,
      subclassChoice,
      newClassLevel
    );
    if (expanded.length > 0) {
      updated = {
        ...updated,
        spells: injectExpandedSpells(updated.spells, expanded),
      };
    }
  } else {
    const incremental = getExpandedSpellsAtLevel(
      classId,
      advancingEntry?.subclassId ?? "",
      newClassLevel
    );
    if (incremental.length > 0) {
      updated = {
        ...updated,
        spells: injectExpandedSpells(updated.spells, incremental),
      };
    }
  }

  if (newSpells.length > 0) {
    handledChecklistKeys.push("levelUp.checklistLearnSpells");
    const spellRefs: SrdSpellRef[] = newSpells.map((id) => ({
      srdId: id,
      prepared: true,
    }));
    updated = { ...updated, spells: [...updated.spells, ...spellRefs] };
  }

  updated = applyClassPicks(updated, classId, {
    fightingStyle: picks.fightingStyle,
    expertise: picks.expertise,
    weaponMasteries: picks.weaponMasteries,
  });

  updated = applyClassPicks(updated, classId, {
    metamagic: picks.metamagic,
    maneuvers: picks.maneuvers,
    invocations: picks.invocations,
    cantrips: newCantrips,
  });
  if (newCantrips.length > 0) handledChecklistKeys.push("levelUp.checklistLearnCantrip");

  updated = applyChoicePicks(updated, choiceSlots, activeChoicePicks);

  // #36 — multiclass entry grants for a NEW class: tools land on the
  // character's tool list; the skill pick lands as a proficiency. Armor /
  // weapon training stays DERIVED (featGateCtx reads the same facts).
  if (mcGrants) {
    if (mcGrants.toolProficiencies.length > 0) {
      // The multiclass entry-grant carries tools as STABLE IDS (golden rules
      // 12 + 22); append each CONCRETE id to the character's tool list — an
      // umbrella id (`musical-instrument`) is a CHOICE, not a finished
      // proficiency, so it is skipped and never leaked.
      const existingToolIds = new Set(updated.toolProficiencyIds);
      const addedIds = mcGrants.toolProficiencies.filter(
        (id) => !isUmbrellaTool(id) && !existingToolIds.has(id)
      );
      if (addedIds.length > 0) {
        updated = {
          ...updated,
          toolProficiencyIds: [...updated.toolProficiencyIds, ...addedIds],
        };
      }
    }
    if (mcSkillPicks.length > 0) {
      // Full proficiency fills/upgrades (JoAT half included), never
      // downgrades — the ONE shared grant rule (`grantSkillProficiency`).
      let skills = updated.skills;
      for (const id of mcSkillPicks) skills = grantSkillProficiency(skills, id);
      updated = { ...updated, skills };
    }
    // Gaining a FIRST casting class sets the casting identity (the model
    // carries one); an existing caster keeps theirs.
    const newTable = getClassTable(classId);
    if (!updated.spellcasting && newTable?.spellcasting) {
      updated = {
        ...updated,
        spellcasting: {
          ability: newTable.spellcasting.ability,
          preparedCaster: newTable.spellcasting.preparedCaster,
          preparedMax: levelData?.spellsKnown ?? 0,
          saveDCOverride: null,
          attackBonusOverride: null,
        },
      };
    }
  }

  if (spellMasteryPicks && (spellMasteryPicks.level1 || spellMasteryPicks.level2)) {
    updated = {
      ...updated,
      spells: applySpellMasteryPicks(updated.spells, spellMasteryPicks),
    };
  }

  if (
    signatureSpellsPicks &&
    (signatureSpellsPicks.first || signatureSpellsPicks.second)
  ) {
    updated = {
      ...updated,
      spells: applySignatureSpellsPicks(updated.spells, signatureSpellsPicks),
    };
  }

  for (const change of picks.featSpellChanges ?? []) {
    if (change.removeId != null && change.replaceId != null) {
      updated = {
        ...updated,
        spells: applyFeatSpellChange(updated.spells, change.removeId, change.replaceId),
      };
    }
  }

  for (const swap of [swapChoice, picks.cantripSwap]) {
    if (swap?.removeId != null && swap.replaceId != null) {
      updated = {
        ...updated,
        spells: applySpellSwap(updated.spells, swap.removeId, swap.replaceId),
      };
    }
  }

  if (updated.levelUpChecklist && handledChecklistKeys.length > 0) {
    const filtered = updated.levelUpChecklist.filter(
      (item) => !item.i18nKey || !handledChecklistKeys.includes(item.i18nKey)
    );
    updated = {
      ...updated,
      levelUpChecklist: filtered.length === 0 ? null : filtered,
    };
  }

  updated = {
    ...updated,
    ac: computeAC(
      updated.equipment,
      updated.abilityScores,
      getEquipment,
      updated.features
    ),
  };

  const grantedAlwaysPrepared = getAlwaysPreparedFromGrants(
    resolveGrantSourcesForFeatures(updated.features),
    {
      level: newClassLevel,
      maxSlotLevel: highestSpellSlotLevel(updated.classes),
      bundleChoices: new Map(Object.entries(doc.session.grantBundleChoices ?? {})),
    }
  );
  if (grantedAlwaysPrepared.length > 0) {
    updated = {
      ...updated,
      spells: injectExpandedSpells(updated.spells, grantedAlwaysPrepared),
    };
  }

  updated = applySubclassSpellcasting(
    updated,
    classId,
    subclassChoice ?? advancingEntry?.subclassId ?? "",
    newClassLevel
  );

  return {
    ...doc,
    character: updated,
    session: {
      ...doc.session,
      hp: {
        ...doc.session.hp,
        current: doc.session.hp.current + (updated.hp.max - charData.hp.max),
      },
      ...(Object.keys(bundlePicks).length > 0
        ? {
            grantBundleChoices: {
              ...doc.session.grantBundleChoices,
              ...bundlePicks,
            },
          }
        : {}),
    },
  };
}
