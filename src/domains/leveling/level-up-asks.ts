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
 * skill, and the optional spell swap.
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
import { emptySpellMasteryPicks } from "@/lib/spell-mastery-pick";
import { emptySignatureSpellsPicks } from "@/lib/signature-spells-pick";
import { offeredFeatVMs } from "@/lib/views/feat-pick-view";
import {
  fightingStyleOptions,
  invocationOptions,
  maneuverOptions,
  metamagicOptions,
  subclassOptions,
  weaponMasteryOptions,
} from "@/lib/views/level-up-view";
import { localizeText } from "@/lib/views/srd-i18n";
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
  | "cantripReplace";

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
  });
  const rows: AskRow[] = [];
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
    if (!plan.isEpicBoonGate) {
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
    }
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
        .filter((o) => !o.disabled)
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
      options: weaponMasteryOptions(locale)
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
        .filter((o) => !o.disabled)
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
        plan.charInvocationChoices ?? [],
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
  for (const slotRow of choiceSlotRows(
    plan.choiceSlots,
    choicePicks,
    { skills: ownedSkills, spells: plan.existingSpellIds },
    locale
  )) {
    rows.push({
      key: `slot:${slotRow.kind}:${slotRow.slotId}`,
      title: slotRow.source ? `${slotRow.source}: ${slotRow.title}` : slotRow.title,
      count: slotRow.amount,
      picked: slotRow.picked,
      options: slotRow.options,
      slotRow,
      spell: slotRow.kind === "spell",
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
        { classId, cantripsOnly: true, maxLevel: 0, exclude: plan.existingSpellIds },
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
      picked: a.newSpells,
      options: learnableSpellVMs(
        {
          classId,
          allowedLists: plan.widenedSpellLists,
          cantripsOnly: false,
          maxLevel: plan.maxSpellLevel,
          exclude: new Set([...plan.existingSpellIds, ...a.newCantrips]),
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
        picked: one(a.swap.replaceId),
        options: learnableSpellVMs(
          {
            classId,
            allowedLists: plan.widenedSpellLists,
            cantripsOnly: false,
            maxLevel: plan.maxSpellLevel,
            exclude: new Set([...plan.existingSpellIds, ...a.newSpells]),
          },
          locale
        ).map((s) => ({ id: s.id, label: s.name })),
      });
    }
  }
  // SRD 5.2.1: "replace one of your cantrips with another [class] cantrip".
  const knownCantrips = plan.canSwapSpell
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

  const asiDone =
    !plan.needsAsi ||
    isAsiChoiceComplete(a.asi, a.asi.mode === "feat" && featBoost !== null);
  const complete =
    asiDone &&
    rows.every(
      (r) => r.count === 0 || r.key.startsWith("asi") || r.picked.length === r.count
    ) &&
    isAllChoicesComplete(plan.choiceSlots, choicePicks);

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
    newSpells: a.newSpells,
    choiceSlots: plan.choiceSlots,
    choicePicks,
    multiclass: plan.mcGrants ? { grants: plan.mcGrants, skillPicks: a.mcSkills } : null,
    spellMastery: plan.needsSpellMastery ? emptySpellMasteryPicks() : null,
    signatureSpells: plan.needsSignatureSpells ? emptySignatureSpellsPicks() : null,
    swap: a.swap,
    cantripSwap: a.cantripSwap,
    bundlePicks: plan.needsBundles ? a.bundlePicks : {},
  };
  return {
    plan,
    hpDie,
    rows,
    complete,
    supported: !plan.needsSpellMastery && !plan.needsSignatureSpells,
    picks,
  };
}

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
    case "expertise":
    case "weaponMasteries":
    case "metamagic":
    case "invocations":
    case "maneuvers":
    case "newCantrips":
    case "newSpells":
    case "mcSkills":
      return { ...a, [key]: many(a[key]) };
    default:
      return a;
  }
}
