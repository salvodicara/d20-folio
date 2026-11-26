/**
 * What the new level-up screen asks, as rows of chips: every pick `levelUpPlan`
 * says the level opens, with its legal options, how many to take and what is
 * taken, plus the `LevelUpPicks` the commit saves. One pure seam, so a test can
 * walk every class at every level and prove the screen always ends complete.
 *
 * A level asks, in this order: the subclass, the Ability Score Improvement (or a
 * feat, and the ability a feat raises), each option bundle, Fighting Style,
 * Expertise, Weapon Mastery, Metamagic, Eldritch Invocations, maneuvers, the
 * choices its features and feat open, new cantrips and spells, a new class's
 * skill, and the optional swaps: a spell, a cantrip, a Fighting Style feat, a
 * Metamagic option, an invocation.
 *
 * `supported` is false for the few picks this screen does not draw yet (Spell
 * Mastery, Signature Spells): the classic wizard takes those levels.
 */
import { SRD_FEATS } from "@/data/feats";
import { spells as allSpells } from "@/data/spells";
import type { AbilityCode } from "@/data/types";
import { localizeSrd } from "@/i18n/resolver";
import i18n from "@/i18n";
import { featAsi } from "@/lib/feat-asi";
import { featGateCtx } from "@/lib/feat-prereq";
import {
  EMPTY_CHOICE_PICKS,
  isAllChoicesComplete,
  pruneChoicePicks,
  type ChoicePicks,
} from "@/lib/feature-choices";
import { EXPERTISE_PICKS_PER_GRANT } from "@/lib/expertise-pick";
import {
  emptyAsiChoice,
  isAsiChoiceComplete,
  type AsiChoice,
} from "@/lib/level-up-choices";
import type { LevelUpPicks } from "@/lib/level-up-commit";
import { levelUpPlan, HIT_DIE_AVG, type LevelUpPlan } from "@/lib/level-up-plan";
import type { Locale } from "@/lib/locale";
import { emptySwapChoice, type SpellSwapChoice } from "@/lib/spell-swap";
import { emptySpellMasteryPicks, type SpellMasteryPicks } from "@/lib/spell-mastery-pick";
import {
  emptySignatureSpellsPicks,
  type SignatureSpellsPicks,
} from "@/lib/signature-spells-pick";
import { offeredFeatVMs } from "@/lib/views/feat-pick-view";
import { hasFightingStyleFeat, listFightingStyles } from "@/lib/fighting-style";
import { invocationHasChoices, invocationRequires } from "@/lib/invocation-pick";
import {
  featName,
  fightingStyleOptions,
  invocationOptions,
  maneuverOptions,
  metamagicOptions,
  subclassOptions,
  subclassReveal,
  weaponMasteryOptions,
} from "@/lib/views/level-up-view";
import { localizeText } from "@/lib/views/srd-i18n";
import { DISCOVERIES_FEATURE_ID } from "@/lib/magical-discoveries";
import { learnableSpellVMs } from "@/lib/views/spell-pick-view";
import { choiceSlotRows, toggleCount } from "@/domains/creation/creation-view";
import type { CharacterData, CharacterDoc } from "@/types/character";

const SPELL_LEVEL = new Map(allSpells.map((sp) => [sp.id, sp.level]));
const ABILITIES: readonly AbilityCode[] = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];

/** What the player has answered so far. */
export interface LevelUpAnswers {
  /** A rolled Hit Die face; null takes the average. */
  rolled: number | null;
  subclassId: string | null;
  asi: AsiChoice;
  bundlePicks: Readonly<Record<string, string>>;
  fightingStyle: string | null;
  expertise: readonly string[];
  /** The masteries this level ADDS (the commit receives them with the kept ones). */
  weaponMasteries: readonly string[];
  metamagic: readonly string[];
  invocations: readonly string[];
  maneuvers: readonly string[];
  choicePicks: ChoicePicks;
  newCantrips: readonly string[];
  newSpells: readonly string[];
  mcSkills: readonly string[];
  swap: SpellSwapChoice;
  cantripSwap: SpellSwapChoice;
  /** Wizard 18: one level-1 and one level-2 spell. */
  spellMastery: SpellMasteryPicks;
  /** Wizard 20: two level-3 spells. */
  signatureSpells: SignatureSpellsPicks;
  discoverySwap: SpellSwapChoice;
  /** One known option replaced on a class level (SRD 5.2.1): a Sorcerer's Metamagic
   *  option, a Warlock's invocation, a Fighter's Fighting Style feat. */
  metamagicSwap: SpellSwapChoice;
  invocationSwap: SpellSwapChoice;
  fightingStyleSwap: SpellSwapChoice;
}

export const NO_ANSWERS: LevelUpAnswers = {
  rolled: null,
  subclassId: null,
  asi: emptyAsiChoice(),
  bundlePicks: {},
  fightingStyle: null,
  expertise: [],
  weaponMasteries: [],
  metamagic: [],
  invocations: [],
  maneuvers: [],
  choicePicks: EMPTY_CHOICE_PICKS,
  newCantrips: [],
  newSpells: [],
  mcSkills: [],
  swap: emptySwapChoice(),
  cantripSwap: emptySwapChoice(),
  spellMastery: emptySpellMasteryPicks(),
  signatureSpells: emptySignatureSpellsPicks(),
  discoverySwap: emptySwapChoice(),
  metamagicSwap: emptySwapChoice(),
  invocationSwap: emptySwapChoice(),
  fightingStyleSwap: emptySwapChoice(),
};

/** Which answer a row writes. `slot` rows carry their slot in `slotRow`. */
export type AskKey =
  | "subclass"
  | "asiMode"
  | "asiPlusTwo"
  | "asiPlusOne"
  | "feat"
  | "featAbility"
  | `bundle:${string}`
  | "fightingStyle"
  | "expertise"
  | "weaponMasteries"
  | "metamagic"
  | "invocations"
  | "maneuvers"
  | `slot:${string}`
  | "newCantrips"
  | "newSpells"
  | "mcSkills"
  | "swapRemove"
  | "swapReplace"
  | "cantripRemove"
  | "cantripReplace"
  | "spellMastery1"
  | "spellMastery2"
  | "signatureSpells"
  | "discoveryRemove"
  | "discoveryReplace"
  | "fightingStyleRemove"
  | "fightingStyleReplace"
  | "metamagicRemove"
  | "metamagicReplace"
  | "invocationRemove"
  | "invocationReplace";

export interface AskRow {
  key: AskKey;
  /** «Scegli 2 suppliche occulte». */
  title: string;
  /** How many to take (0 for an optional row: the swap). */
  count: number;
  picked: readonly string[];
  options: ReadonlyArray<{ id: string; label: string }>;
  /** The options are spells: drawn as rows that say what each one is. */
  spell?: boolean;
  /** One plain line under the title (a Wizard's book picks are not prepared). */
  help?: string;
  /** Set on `slot:` rows: what `toggleAnswer` needs to write the pick. */
  slotRow?: ReturnType<typeof choiceSlotRows>[number];
  /**
   * The subclass row, once a subclass is picked: what it brings at this level, its
   * features and its always-prepared spells (BG3's and D&D Beyond's subclass detail).
   */
  reveal?: ReturnType<typeof subclassReveal>;
}

export interface LevelUpAsks {
  plan: LevelUpPlan;
  /** The Hit Point gain before CON: the average, or the die rolled. */
  hpDie: number;
  rows: AskRow[];
  complete: boolean;
  /** False when the level asks a pick this screen does not draw yet. */
  supported: boolean;
  picks: LevelUpPicks;
}

/** Feat ids the character already owns (origin, background and taken feats). */
function takenFeats(c: CharacterData): ReadonlySet<string> {
  const set = new Set<string>();
  for (const f of c.features) if (!("custom" in f)) set.add(f.srdId);
  if (c.humanOriginFeat) set.add(c.humanOriginFeat);
  if (c.bgFeat) set.add(c.bgFeat);
  return set;
}

export function levelUpAsks(
  doc: CharacterDoc,
  classId: string,
  a: LevelUpAnswers,
  locale: Locale
): LevelUpAsks {
  const t = i18n.getFixedT(locale);
  const c = doc.character;
  const plan = levelUpPlan(doc, classId, {
    subclassId: a.subclassId,
    asiChoice: a.asi,
    fightingStyle: a.fightingStyle,
    bundlePicks: a.bundlePicks,
  });
  const rows: AskRow[] = [];
  // A spell picked before the subclass that grants it always prepared (chosen later on
  // the same screen) is no longer a pick: it would add nothing.
  const newSpells = a.newSpells.filter((id) => !plan.alwaysPreparedGained.has(id));
  const swap =
    a.swap.replaceId && plan.alwaysPreparedGained.has(a.swap.replaceId)
      ? { ...a.swap, replaceId: null }
      : a.swap;
  const ability = (code: string) => ({ id: code, label: t(`abilities.${code}`) });
  const one = (v: string | null) => (v ? [v] : []);

  if (plan.needsSubclass) {
    rows.push({
      key: "subclass",
      title: t("levelUp.titleSubclass"),
      count: 1,
      picked: one(a.subclassId),
      options: subclassOptions(classId, locale).map((o) => ({
        id: o.id,
        label: o.label,
      })),
      ...(a.subclassId
        ? { reveal: subclassReveal(classId, a.subclassId, plan.newClassLevel, locale) }
        : {}),
    });
  }

  // ── Ability Score Improvement, or a feat ─────────────────────────────────
  const chosenFeat =
    plan.needsAsi && a.asi.mode === "feat" && a.asi.featId
      ? SRD_FEATS.find((f) => f.id === a.asi.featId)
      : undefined;
  const featBoost = chosenFeat ? featAsi(chosenFeat) : null;
  if (plan.needsAsi) {
    const open = ABILITIES.filter((code) => c.abilityScores[code] < 20);
    // Level 19 too: «an Epic Boon feat … or another feat» (SRD 5.2.1), and Ability
    // Score Improvement is a General feat, so the +2 / +1+1 / feat choice stays.
    rows.push({
      key: "asiMode",
      title: t("levelUp.titleBoon"),
      count: 1,
      picked: [a.asi.mode],
      options: [
        { id: "plus2", label: t("levelUp.asi.plus2") },
        { id: "plus1_1", label: t("levelUp.asi.plus1_1") },
        { id: "feat", label: t("levelUp.asi.feat") },
      ],
    });
    if (a.asi.mode === "plus2") {
      rows.push({
        key: "asiPlusTwo",
        title: t("levelUp.asi.plus2"),
        count: 1,
        picked: one(a.asi.plusTwo),
        options: open.map(ability),
      });
    } else if (a.asi.mode === "plus1_1") {
      rows.push({
        key: "asiPlusOne",
        title: t("levelUp.asi.plus1_1"),
        count: 2,
        picked: [...one(a.asi.plusOneA), ...one(a.asi.plusOneB)],
        options: open.map(ability),
      });
    } else {
      rows.push({
        key: "feat",
        title: t("levelUp.asi.feat"),
        count: 1,
        picked: one(a.asi.featId),
        options: offeredFeatVMs(
          featGateCtx(c, plan.newLevel, plan.isEpicBoonGate),
          takenFeats(c),
          locale
        ).map((f) => ({ id: f.id, label: f.name })),
      });
      if (featBoost) {
        rows.push({
          key: "featAbility",
          title: t("levelUp.screen.featAbility", { amount: featBoost.amount }),
          count: 1,
          picked: one(a.asi.featAbility),
          options: featBoost.abilities.map(ability),
        });
      }
    }
  }

  for (const b of plan.needsBundles ? plan.levelUpBundles : []) {
    rows.push({
      key: `bundle:${b.bundleKey}`,
      title: localizeText(b.label, locale),
      count: 1,
      picked: one(a.bundlePicks[b.bundleKey] ?? null),
      options: b.options.map((o) => ({ id: o.id, label: localizeText(o.label, locale) })),
    });
  }
  if (plan.needsFightingStyle) {
    rows.push({
      key: "fightingStyle",
      title: t("levelUp.chooseFightingStyle"),
      count: 1,
      picked: one(a.fightingStyle),
      options: fightingStyleOptions(c.features, "", locale, classId)
        .filter((o) => !o.disabled && o.id !== a.fightingStyleSwap.replaceId)
        .map((o) => ({ id: o.id, label: o.label })),
    });
  }
  const expertiseCount =
    plan.needsExpertise && plan.expertiseEligible.length >= EXPERTISE_PICKS_PER_GRANT
      ? EXPERTISE_PICKS_PER_GRANT
      : 0;
  if (expertiseCount) {
    rows.push({
      key: "expertise",
      title: t("levelUp.chooseExpertise", { n: expertiseCount }),
      count: expertiseCount,
      picked: a.expertise,
      options: plan.expertiseEligible.map((id) => ({ id, label: t(`skills.${id}`) })),
    });
  }
  const masteredAlready = plan.advancingEntry?.weaponMasteries ?? [];
  const newMasteries = plan.needsWeaponMastery
    ? Math.max(0, plan.weaponMasteryCount - masteredAlready.length)
    : 0;
  if (newMasteries) {
    rows.push({
      key: "weaponMasteries",
      title: t("levelUp.chooseWeaponMastery", { n: newMasteries }),
      count: newMasteries,
      picked: a.weaponMasteries,
      options: weaponMasteryOptions(locale, classId)
        .filter((o) => !masteredAlready.includes(o.id))
        .map((o) => ({ id: o.id, label: o.label })),
    });
  }
  if (plan.needsMetamagic) {
    rows.push({
      key: "metamagic",
      title: t("levelUp.chooseMetamagic", { n: plan.metamagicPicksNeeded }),
      count: plan.metamagicPicksNeeded,
      picked: a.metamagic,
      options: metamagicOptions(new Set(plan.alreadyKnownMetamagic), "", locale)
        .filter((o) => !o.disabled && o.id !== a.metamagicSwap.replaceId)
        .map((o) => ({ id: o.id, label: o.label })),
    });
  }
  if (plan.needsInvocations) {
    rows.push({
      key: "invocations",
      title: t("levelUp.chooseInvocations", { n: plan.invocationPicksNeeded }),
      count: plan.invocationPicksNeeded,
      picked: a.invocations,
      options: invocationOptions(
        plan.newClassLevel,
        [
          ...(plan.charInvocationChoices ?? []).filter(
            (id) => id !== a.invocationSwap.removeId
          ),
          ...one(a.invocationSwap.replaceId),
        ],
        "",
        locale
      ).map((o) => ({ id: o.id, label: o.label })),
    });
  }
  if (plan.needsManeuvers) {
    rows.push({
      key: "maneuvers",
      title: t("levelUp.chooseManeuvers", { n: plan.maneuversNeeded }),
      count: plan.maneuversNeeded,
      picked: a.maneuvers,
      options: maneuverOptions(
        plan.newClassLevel,
        plan.charManeuverChoices ?? [],
        locale
      ).map((o) => ({ id: o.id, label: o.label })),
    });
  }

  // The choices this level's features and the chosen feat open.
  const choicePicks = pruneChoicePicks(plan.choiceSlots, a.choicePicks);
  const ownedSkills = new Set(
    Object.entries(c.skills)
      .filter(([, tier]) => tier === "proficient" || tier === "expertise")
      .map(([id]) => id)
  );
  const expertSkills = new Set(
    Object.entries(c.skills)
      .filter(([, tier]) => tier === "expertise")
      .map(([id]) => id)
  );
  const slotRows = choiceSlotRows(
    plan.choiceSlots,
    choicePicks,
    {
      skills: ownedSkills,
      // The spells this level's own rows pick are known too: never offered twice.
      spells: new Set([...plan.existingSpellIds, ...a.newCantrips, ...a.newSpells]),
      expert: expertSkills,
      languages: new Set(c.languageIds),
    },
    locale
  );
  // Expertise needs a proficient skill (Wizard Scholar: one of six): with fewer
  // eligible skills than the slot asks, it asks only what can be picked (none for
  // a Wizard multiclass proficient in none of the six), so the level can be saved.
  const expertiseShort = new Map(
    slotRows
      .filter((r) => r.kind === "expertise" && r.options.length < r.amount)
      .map((r) => [r.slotId, r.options.length])
  );
  const answerableSlots = {
    ...plan.choiceSlots,
    expertise: plan.choiceSlots.expertise.map((s) => ({
      ...s,
      amount: expertiseShort.get(s.slotId) ?? s.amount,
    })),
  };
  for (const slotRow of slotRows) {
    rows.push({
      key: `slot:${slotRow.kind}:${slotRow.slotId}`,
      title: slotRow.source ? `${slotRow.source}: ${slotRow.title}` : slotRow.title,
      count:
        slotRow.kind === "expertise"
          ? Math.min(slotRow.amount, slotRow.options.length)
          : slotRow.amount,
      picked: slotRow.picked,
      options: slotRow.options,
      slotRow,
      spell: slotRow.kind === "spell",
    });
  }

  // Wizard 18 Spell Mastery and Wizard 20 Signature Spells: drawn here, never handed
  // to the classic wizard. A row asks only what can be picked, so a spellbook with no
  // candidate never blocks the level.
  const spellOption = (id: string) => ({
    id,
    label: localizeSrd("spell", id, "name", locale),
  });
  if (plan.needsSpellMastery) {
    const picked = (id: string | undefined) => (id ? [id] : []);
    rows.push({
      key: "spellMastery1",
      spell: true,
      title: t("levelUp.screen.spellMastery", { level: 1 }),
      count: Math.min(1, plan.spellMasteryEligibleL1.length),
      picked: picked(a.spellMastery.level1),
      options: plan.spellMasteryEligibleL1.map((s) => spellOption(s.id)),
    });
    rows.push({
      key: "spellMastery2",
      spell: true,
      title: t("levelUp.screen.spellMastery", { level: 2 }),
      count: Math.min(1, plan.spellMasteryEligibleL2.length),
      picked: picked(a.spellMastery.level2),
      options: plan.spellMasteryEligibleL2.map((s) => spellOption(s.id)),
    });
  }
  if (plan.needsSignatureSpells) {
    rows.push({
      key: "signatureSpells",
      spell: true,
      title: t("levelUp.screen.signatureSpells"),
      count: Math.min(2, plan.signatureSpellsEligible.length),
      picked: [a.signatureSpells.first, a.signatureSpells.second].filter(
        (id): id is string => id !== undefined
      ),
      options: plan.signatureSpellsEligible.map((s) => spellOption(s.id)),
    });
  }
  if (plan.cantripsKnownDiff > 0) {
    rows.push({
      key: "newCantrips",
      spell: true,
      title: t("levelUp.screen.chooseCantrips", { count: plan.cantripsKnownDiff }),
      count: plan.cantripsKnownDiff,
      picked: a.newCantrips,
      options: learnableSpellVMs(
        {
          classId,
          cantripsOnly: true,
          maxLevel: 0,
          // A cantrip a feature's own pick took (Thaumaturge's) is known already.
          exclude: new Set([
            ...plan.existingSpellIds,
            ...Object.values(choicePicks.spell).flat(),
          ]),
        },
        locale
      ).map((s) => ({ id: s.id, label: s.name })),
    });
  }
  if (plan.spellsKnownDiff > 0) {
    rows.push({
      key: "newSpells",
      spell: true,
      title: plan.spellbookPicks
        ? t("levelUp.screen.chooseSpellbook", { count: plan.spellsKnownDiff })
        : t("levelUp.screen.chooseSpells", { count: plan.spellsKnownDiff }),
      ...(plan.spellbookPicks ? { help: t("levelUp.screen.spellbookHelp") } : {}),
      count: plan.spellsKnownDiff,
      picked: newSpells,
      options: learnableSpellVMs(
        {
          classId,
          allowedLists: plan.widenedSpellLists,
          cantripsOnly: false,
          maxLevel: plan.maxSpellLevel,
          exclude: new Set([
            ...plan.existingSpellIds,
            ...plan.alwaysPreparedGained,
            ...a.newCantrips,
          ]),
        },
        locale
      ).map((s) => ({ id: s.id, label: s.name })),
    });
  }
  if (plan.mcSkillNeeded > 0) {
    rows.push({
      key: "mcSkills",
      title: t("levelUp.chooseMulticlassSkill", {
        count: plan.mcSkillNeeded,
        class: localizeSrd("class", classId, "name", locale),
      }),
      count: plan.mcSkillNeeded,
      picked: a.mcSkills,
      options: plan.mcSkillOptions.map((id) => ({ id, label: t(`skills.${id}`) })),
    });
  }
  if (plan.canSwapSpell && plan.knownNonCantripRefs.length > 0) {
    rows.push({
      key: "swapRemove",
      spell: true,
      title: t("levelUp.screen.swapForget"),
      count: 0,
      picked: one(a.swap.removeId),
      // SRD 5.2.1: "replace one spell on your list with another [class] spell for which
      // you have spell slots"; a cantrip has its own swap, below.
      options: plan.knownNonCantripRefs
        .filter((s) => (SPELL_LEVEL.get(s.srdId) ?? 0) > 0)
        .map((s) => ({
          id: s.srdId,
          label: localizeSrd("spell", s.srdId, "name", locale),
        })),
    });
    if (a.swap.removeId) {
      rows.push({
        key: "swapReplace",
        spell: true,
        title: t("levelUp.screen.swapLearn"),
        count: 1,
        picked: one(swap.replaceId),
        options: learnableSpellVMs(
          {
            classId,
            allowedLists: plan.widenedSpellLists,
            cantripsOnly: false,
            maxLevel: plan.maxSpellLevel,
            exclude: new Set([
              ...plan.existingSpellIds,
              ...plan.alwaysPreparedGained,
              ...newSpells,
            ]),
          },
          locale
        ).map((s) => ({ id: s.id, label: s.name })),
      });
    }
  }
  // SRD 5.2.1: "replace one of your cantrips with another [class] cantrip".
  const knownCantrips = plan.canSwapCantrip
    ? plan.knownNonCantripRefs.filter((s) => SPELL_LEVEL.get(s.srdId) === 0)
    : [];
  if (knownCantrips.length > 0) {
    rows.push({
      key: "cantripRemove",
      spell: true,
      title: t("levelUp.screen.cantripForget"),
      count: 0,
      picked: one(a.cantripSwap.removeId),
      options: knownCantrips.map((s) => ({
        id: s.srdId,
        label: localizeSrd("spell", s.srdId, "name", locale),
      })),
    });
    if (a.cantripSwap.removeId) {
      rows.push({
        key: "cantripReplace",
        spell: true,
        title: t("levelUp.screen.swapLearn"),
        count: 1,
        picked: one(a.cantripSwap.replaceId),
        options: learnableSpellVMs(
          {
            classId,
            cantripsOnly: true,
            maxLevel: 0,
            exclude: new Set([...plan.existingSpellIds, ...a.newCantrips]),
          },
          locale
        ).map((s) => ({ id: s.id, label: s.name })),
      });
    }
  }

  // SRD 5.2.1, Fighter: «Whenever you gain a Fighter level, you can replace the feat
  // you chose with a different Fighting Style feat».
  const ownedStyles =
    classId === "fighter" && plan.advancingEntry
      ? listFightingStyles(classId)
          .filter((f) => hasFightingStyleFeat(c.features, f.id))
          .map((f) => f.id)
      : [];
  if (ownedStyles.length > 0) {
    rows.push({
      key: "fightingStyleRemove",
      title: t("levelUp.screen.fightingStyleForget"),
      count: 0,
      picked: one(a.fightingStyleSwap.removeId),
      options: ownedStyles.map((id) => ({ id, label: featName(id, locale) })),
    });
    if (a.fightingStyleSwap.removeId) {
      rows.push({
        key: "fightingStyleReplace",
        title: t("levelUp.screen.swapLearn"),
        count: 1,
        picked: one(a.fightingStyleSwap.replaceId),
        options: fightingStyleOptions(c.features, "", locale, classId)
          .filter((o) => !o.disabled && o.id !== a.fightingStyle)
          .map((o) => ({ id: o.id, label: o.label })),
      });
    }
  }
  // SRD 5.2.1, Sorcerer: «Whenever you gain a Sorcerer level, you can replace one of
  // your Metamagic options with one you don't know».
  const knownMetamagic = classId === "sorcerer" ? (plan.charMetamagicChoices ?? []) : [];
  if (knownMetamagic.length > 0) {
    rows.push({
      key: "metamagicRemove",
      title: t("levelUp.screen.metamagicForget"),
      count: 0,
      picked: one(a.metamagicSwap.removeId),
      options: knownMetamagic.map((id) => ({
        id,
        label: localizeSrd("metamagic", id, "name", locale),
      })),
    });
    if (a.metamagicSwap.removeId) {
      rows.push({
        key: "metamagicReplace",
        title: t("levelUp.screen.swapLearn"),
        count: 1,
        picked: one(a.metamagicSwap.replaceId),
        options: metamagicOptions(
          new Set([...knownMetamagic, ...a.metamagic]),
          "",
          locale
        )
          .filter((o) => !o.disabled)
          .map((o) => ({ id: o.id, label: o.label })),
      });
    }
  }
  // SRD 5.2.1, Warlock: «Whenever you gain a Warlock level, you can replace one of
  // your invocations with another one for which you qualify. You can't replace an
  // invocation if it's a prerequisite for another invocation that you have.»
  const knownInvocations =
    classId === "warlock" ? (plan.charInvocationChoices ?? []) : [];
  // Nor one another invocation needs (known, or taken this level), nor one with its own
  // choices (an origin feat, a Book of Shadows): those would stay behind.
  const replaceableInvocations = knownInvocations.filter(
    (id) =>
      !invocationHasChoices(id) &&
      ![...knownInvocations, ...a.invocations].some((other) =>
        invocationRequires(other, id)
      )
  );
  if (replaceableInvocations.length > 0) {
    rows.push({
      key: "invocationRemove",
      title: t("levelUp.screen.invocationForget"),
      count: 0,
      picked: one(a.invocationSwap.removeId),
      options: replaceableInvocations.map((id) => ({
        id,
        label: localizeSrd("invocation", id, "name", locale),
      })),
    });
    const removed = a.invocationSwap.removeId;
    if (removed) {
      const kept = knownInvocations.filter((id) => id !== removed);
      rows.push({
        key: "invocationReplace",
        title: t("levelUp.screen.swapLearn"),
        count: 1,
        picked: one(a.invocationSwap.replaceId),
        options: invocationOptions(
          plan.newClassLevel,
          [...kept, ...a.invocations],
          "",
          locale
        )
          .filter((o) => o.id !== removed)
          .map((o) => ({ id: o.id, label: o.label })),
      });
    }
  }
  // SRD 5.2.1, Magical Discoveries: «whenever you gain a Bard level, you can
  // replace one of the spells with another spell that meets these requirements».
  const discovery = plan.discoverySwap;
  if (discovery) {
    rows.push({
      key: "discoveryRemove",
      spell: true,
      title: t("levelUp.screen.discoveryForget", {
        feature: localizeSrd("class-feature", DISCOVERIES_FEATURE_ID, "name", locale),
      }),
      count: 0,
      picked: one(a.discoverySwap.removeId),
      options: discovery.picks.map((s) => ({
        id: s.srdId,
        label: localizeSrd("spell", s.srdId, "name", locale),
      })),
    });
    if (a.discoverySwap.removeId) {
      const taken = new Set([...a.newCantrips, ...newSpells]);
      for (const s of [swap, a.cantripSwap]) {
        if (s.replaceId) taken.add(s.replaceId);
      }
      rows.push({
        key: "discoveryReplace",
        spell: true,
        title: t("levelUp.screen.swapLearn"),
        count: 1,
        picked: one(a.discoverySwap.replaceId),
        options: discovery.pool
          .filter((id) => !taken.has(id))
          .map((id) => ({ id, label: localizeSrd("spell", id, "name", locale) })),
      });
    }
  }

  const asiDone =
    !plan.needsAsi ||
    isAsiChoiceComplete(a.asi, a.asi.mode === "feat" && featBoost !== null);
  const complete =
    asiDone &&
    rows.every(
      (r) => r.count === 0 || r.key.startsWith("asi") || r.picked.length === r.count
    ) &&
    isAllChoicesComplete(answerableSlots, choicePicks);

  const hpDie =
    a.rolled === null
      ? (HIT_DIE_AVG[plan.hitDie] ?? 5)
      : Math.min(plan.hitDie, Math.max(1, a.rolled));
  const picks: LevelUpPicks = {
    classId,
    hpGain: hpDie,
    asi: plan.needsAsi && asiDone ? a.asi : null,
    subclassId: plan.needsSubclass ? a.subclassId : null,
    fightingStyle: plan.needsFightingStyle ? a.fightingStyle : null,
    expertise: expertiseCount ? a.expertise : [],
    weaponMasteries: newMasteries ? [...masteredAlready, ...a.weaponMasteries] : null,
    metamagic: plan.needsMetamagic ? a.metamagic : [],
    maneuvers: plan.needsManeuvers ? a.maneuvers : [],
    invocations: plan.needsInvocations ? a.invocations : [],
    newCantrips: a.newCantrips,
    newSpells,
    choiceSlots: plan.choiceSlots,
    choicePicks,
    multiclass: plan.mcGrants ? { grants: plan.mcGrants, skillPicks: a.mcSkills } : null,
    spellMastery: plan.needsSpellMastery ? a.spellMastery : null,
    signatureSpells: plan.needsSignatureSpells ? a.signatureSpells : null,
    swap,
    cantripSwap: a.cantripSwap,
    ...(discovery ? { discoverySwap: a.discoverySwap } : {}),
    ...(ownedStyles.length > 0 ? { fightingStyleSwap: a.fightingStyleSwap } : {}),
    ...(knownMetamagic.length > 0 ? { metamagicSwap: a.metamagicSwap } : {}),
    ...(replaceableInvocations.length > 0 ? { invocationSwap: a.invocationSwap } : {}),
    bundlePicks: plan.needsBundles ? a.bundlePicks : {},
  };
  return {
    plan,
    hpDie,
    rows,
    complete,
    supported: true,
    picks,
  };
}

const SWAP_FIELD = {
  fightingStyleRemove: "fightingStyleSwap",
  fightingStyleReplace: "fightingStyleSwap",
  metamagicRemove: "metamagicSwap",
  metamagicReplace: "metamagicSwap",
  invocationRemove: "invocationSwap",
  invocationReplace: "invocationSwap",
} as const;

/** The answers with `id` toggled in `row`: a pick-one row takes it, a count row toggles it. */
export function toggleAnswer(a: LevelUpAnswers, row: AskRow, id: string): LevelUpAnswers {
  const flip = (prev: string | null) => (prev === id ? null : id);
  const many = (prev: readonly string[]) => toggleCount(prev, id, row.count);
  const key = row.key;
  if (key.startsWith("bundle:")) {
    const bundleKey = key.slice("bundle:".length);
    return { ...a, bundlePicks: { ...a.bundlePicks, [bundleKey]: id } };
  }
  if (key.startsWith("slot:") && row.slotRow) {
    const r = row.slotRow;
    const next = r.picked.includes(id)
      ? r.picked.filter((p) => p !== id)
      : r.picked.length < r.amount
        ? [...r.picked, id]
        : [...r.picked.slice(1), id];
    return {
      ...a,
      choicePicks: {
        ...a.choicePicks,
        [r.kind]: { ...a.choicePicks[r.kind], [r.slotId]: next },
      },
    };
  }
  switch (key) {
    case "spellMastery1":
      return {
        ...a,
        spellMastery: {
          ...a.spellMastery,
          level1: flip(a.spellMastery.level1 ?? null) ?? undefined,
        },
      };
    case "spellMastery2":
      return {
        ...a,
        spellMastery: {
          ...a.spellMastery,
          level2: flip(a.spellMastery.level2 ?? null) ?? undefined,
        },
      };
    case "signatureSpells": {
      const [first, second] = many(row.picked);
      return { ...a, signatureSpells: { first, second } };
    }
    case "subclass":
      // A new subclass changes what its features ask: their picks start over.
      return { ...a, subclassId: flip(a.subclassId), choicePicks: EMPTY_CHOICE_PICKS };
    case "asiMode":
      return { ...a, asi: { ...emptyAsiChoice(), mode: id as AsiChoice["mode"] } };
    case "asiPlusTwo":
      return {
        ...a,
        asi: { ...a.asi, plusTwo: flip(a.asi.plusTwo) as AbilityCode | null },
      };
    case "asiPlusOne": {
      const [plusOneA = null, plusOneB = null] = many(row.picked) as AbilityCode[];
      return { ...a, asi: { ...a.asi, plusOneA, plusOneB } };
    }
    case "feat":
      return {
        ...a,
        asi: { ...a.asi, featId: flip(a.asi.featId), featAbility: null },
        choicePicks: EMPTY_CHOICE_PICKS,
      };
    case "featAbility":
      return {
        ...a,
        asi: { ...a.asi, featAbility: flip(a.asi.featAbility) as AbilityCode | null },
      };
    case "fightingStyle":
      return { ...a, fightingStyle: flip(a.fightingStyle) };
    case "swapRemove":
      return { ...a, swap: { removeId: flip(a.swap.removeId), replaceId: null } };
    case "swapReplace":
      return { ...a, swap: { ...a.swap, replaceId: flip(a.swap.replaceId) } };
    case "cantripRemove":
      return {
        ...a,
        cantripSwap: { removeId: flip(a.cantripSwap.removeId), replaceId: null },
      };
    case "cantripReplace":
      return {
        ...a,
        cantripSwap: { ...a.cantripSwap, replaceId: flip(a.cantripSwap.replaceId) },
      };
    case "discoveryRemove":
      return {
        ...a,
        discoverySwap: { removeId: flip(a.discoverySwap.removeId), replaceId: null },
      };
    case "fightingStyleRemove":
    case "metamagicRemove":
    case "invocationRemove": {
      const field = SWAP_FIELD[key];
      return { ...a, [field]: { removeId: flip(a[field].removeId), replaceId: null } };
    }
    case "fightingStyleReplace":
    case "metamagicReplace":
    case "invocationReplace": {
      const field = SWAP_FIELD[key];
      return { ...a, [field]: { ...a[field], replaceId: flip(a[field].replaceId) } };
    }
    case "discoveryReplace":
      return {
        ...a,
        discoverySwap: { ...a.discoverySwap, replaceId: flip(a.discoverySwap.replaceId) },
      };
    case "expertise":
    case "weaponMasteries":
    case "metamagic":
    case "invocations":
    case "maneuvers":
    case "newCantrips":
    case "mcSkills":
      return { ...a, [key]: many(a[key]) };
    case "newSpells":
      // The row's picks, not the stored ones: a pick the subclass made moot drops.
      return { ...a, newSpells: many(row.picked) };
    default:
      return a;
  }
}
