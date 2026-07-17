/**
 * LevelUpWizard — the full-screen level-up route (`/characters/:id/level-up`),
 * wizard F end-to-end (the owner-approved B-Prime presentation: pixel-stable
 * orb chrome · plaque galleries for identity pools · the read-then-choose
 * morphing feat list · read-then-Learn spells · footer nav), replacing the old
 * single-scroll LevelUpModal (superseded → deleted, golden rule 10).
 *
 * Steps (only when applicable): Hit Points (+ the #36 MULTICLASS class fork) →
 * Subclass → Ability-or-Feat boon → Choices (feature/picker decisions) →
 * Spells → Review & Confirm. All engine math stays in `lib/level-up.ts` +
 * the choice engine; this orchestrator only collects choices and applies them
 * in ONE confirm pass (ported verbatim from the modal — behavior, not
 * presentation).
 *
 * The class fork (#36): a single-class character with no legal second class
 * sees NO fork at all (zero added friction; default = advance the primary
 * class). When multiclassing is legal, the Hit Points step offers each owned
 * class to advance plus every RAW-legal new class (13+ primary-ability rule,
 * both ways — illegal classes are FILTERED, never greyed).
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useNavigate, useParams, useBlocker } from "react-router";
import {
  BookOpen,
  Camera,
  ChevronRight,
  Heart,
  PartyPopper,
  RefreshCw,
  Scroll,
  Sparkles,
  Star,
  Swords,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { NumberStepper } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FolioLoader } from "@/components/shared/FolioLoader";
import { GlossaryTip } from "@/components/shared/GlossaryTip";
import { useConfirmStore } from "@/stores/confirmStore";
import { useCharacterStore } from "@/stores/characterStore";
import { useAuthStore } from "@/stores/authStore";
import { useToastStore } from "@/stores/toastStore";
import { useUndoStore } from "@/stores/undoStore";
import { useCharacterSubscription } from "@/hooks/useCharacterSubscription";
import { useLocale } from "@/hooks/useLocale";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { asLocale } from "@/lib/locale";
import { updateCharacter, saveCharacterSnapshot } from "@/lib/firestore";
import { levelUp, getAverageHpGain } from "@/lib/level-up";
import { isUmbrellaTool } from "@/lib/tool-names";
import { localizeSrd } from "@/i18n/resolver";
import { computeAC, abilityModifier } from "@/lib/compute";
import { grantSkillProficiency, proficientSkillIds } from "@/lib/skills";
import { getEquipment } from "@/data/equipment";
import { getFeaturesAtLevel, getClassTable } from "@/data/classes";
import { classEntryLevel, getClasses, primaryClassId, totalLevel } from "@/lib/classes";
import {
  eligibleNewClasses,
  multiclassEntryGrants,
  multiclassFilterReport,
  type MulticlassFilterReport,
} from "@/lib/multiclass";
import { MulticlassFilteredCause } from "./multiclass-cause";
import type { CharacterData, ClassEntry } from "@/types/character";
import { SRD_FEATS } from "@/data/feats";
import { featAsi, applyFeatAsi } from "@/lib/feat-asi";
import { featGateCtx } from "@/lib/feat-prereq";
import {
  collectChoiceSlots,
  collectGrantBundles,
  partitionChoiceSlotsBySource,
  pruneChoicePicks,
  isAllChoicesComplete,
  applyChoicePicks,
  hasAnyChoiceSlots,
  EMPTY_CHOICE_PICKS,
  type ChoicePicks,
} from "@/lib/feature-choices";
import {
  FeatAbilityPicker,
  FeatureChoicesSection,
} from "@/components/sheet/FeatureChoicesSection";
import { GrantBundleSelector } from "@/components/sheet/GrantBundleSelector";
import {
  applySpellMasteryPicks,
  eligibleSpellMasteryPicks,
  emptySpellMasteryPicks,
  hasEligibleSpellsAtLevel,
  isSpellMasteryComplete,
  type SpellMasteryPicks,
} from "@/lib/spell-mastery-pick";
import {
  applySignatureSpellsPicks,
  eligibleSignatureSpells,
  emptySignatureSpellsPicks,
  hasEligibleSignatureSpells,
  isSignatureSpellsComplete,
  type SignatureSpellsPicks,
} from "@/lib/signature-spells-pick";
import {
  getExpandedSpellsAtLevel,
  getExpandedSpellsThroughLevel,
  getAlwaysPreparedFromGrants,
  injectExpandedSpells,
} from "@/lib/expanded-spells";
import { resolveGrantSourcesForFeatures } from "@/lib/resolve-grant-sources";
import { applySubclassSpellcasting } from "@/lib/subclass-spellcasting";
import { isFightingStylePlaceholder, hasFightingStyleFeat } from "@/lib/fighting-style";
import {
  isExpertisePlaceholder,
  listExpertiseEligibleSkills,
  applyExpertisePicks,
  EXPERTISE_PICKS_PER_GRANT,
} from "@/lib/expertise-pick";
import { weaponMasteryCountForClass } from "@/lib/weapon-mastery-pick";
import { isMetamagicPlaceholder, metamagicPicksAtLevel } from "@/lib/metamagic-pick";
import { isInvocationPlaceholder, newInvocationsAtLevel } from "@/lib/invocation-pick";
import { isManeuverPlaceholder, newManeuversAtLevel } from "@/lib/maneuver-pick";
import {
  emptyAsiChoice,
  isAsiChoiceComplete,
  applyAsiToScores,
  type AsiChoice,
  type AsiChoiceMode,
} from "@/lib/level-up-choices";
import {
  emptySwapChoice,
  isSwapIncomplete,
  applySpellSwap,
  type SpellSwapChoice,
} from "@/lib/spell-swap";
import {
  levelUpChangeArgs,
  levelUpChangeSource,
  metamagicOptions,
  invocationOptions,
  maneuverOptions,
  weaponMasteryOptions,
  fightingStyleOptions,
  spellPickOptions,
  subclassOptions,
  subclassReveal,
  className,
  featName,
  abilityLabel,
  spellName,
  equipmentName,
  metamagicName,
  invocationName,
  maneuverName,
  proficiencyName,
} from "@/lib/views/level-up-view";
import { localizeText } from "@/lib/views/srd-i18n";
import { classTip } from "@/lib/views/creation-view";
import { offeredFeatVMs } from "@/lib/views/feat-pick-view";
import { learnableSpellVMs } from "@/lib/views/spell-pick-view";
import { widenedSpellListsAtLevel } from "@/lib/feat-spell-choices";
import { classRoleSeal } from "@/features/creation/steps/class-roles";
import { weaponSealIcon } from "@/components/shared/item-icons";
import { Target } from "lucide-react";
import { LevelUpFeatureCards } from "@/components/sheet/level-up/LevelUpFeatureCards";
import {
  WizardFrame,
  WizardChrome,
  WizardNav,
  WizardForkTab,
  MorphValue,
  type WizardStepDef,
} from "@/features/wizard/chrome";
import {
  PlaqueCard,
  PlaqueGrid,
  WizardHero,
  WizardHeroEmpty,
} from "@/features/wizard/gallery";
import { InlineMarkdown } from "@/components/shared/InlineMarkdown";
import { highlightRulesText } from "@/components/shared/highlightRulesText";
import { WizardFeatList } from "@/features/wizard/feat-list";
import { WizardSpellList, type SpellListSlot } from "@/features/wizard/spell-list";
import { WizardPickList, type WizardPickOption } from "@/features/wizard/pick-list";
import { SocketSeal } from "@/features/wizard/seals";
import { WizardSpellSwap } from "@/features/wizard/spell-swap";
import { WizardAsiCartouches } from "@/features/wizard/point-buy";
import { SpellLevelSeal } from "@/features/wizard/seals";
import { togglePick } from "@/features/wizard/pick-utils";
import type { AbilityCode } from "@/data/types";
import type { LevelUpChange } from "@/lib/level-up";
import type { SrdFeatureRef, SrdSpellRef } from "@/types/character";

// ─── helpers ──────────────────────────────────────────────────────────────────

/**
 * Merge a patch onto the ADVANCING class's entry of `classes[]` (after the
 * engine ran, the entry exists — including a freshly-added multiclass entry).
 * Returns a fresh CharacterData; never mutates. A key set to `undefined` is
 * dropped (rebuild by inclusion — no dynamic delete).
 */
function patchClassEntry(
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

const HIT_DIE_AVG: Record<number, number> = { 4: 3, 6: 4, 8: 5, 10: 6, 12: 7 };

type StepId = "hp" | "subclass" | "boon" | "choices" | "spells" | "swap" | "review";

/** What the completion banner celebrates — CAPTURED at confirm time (A3: the
 *  store advances underneath the banner, so reading live state shows N+1). */
interface DoneInfo {
  level: number;
  classId: string;
  classLevel: number;
  hpGained: number;
}

// ─── route component ──────────────────────────────────────────────────────────

export function LevelUpWizard() {
  const { characterId } = useParams<{ characterId: string }>();
  useCharacterSubscription(characterId);
  const { t } = useTranslation();
  useDocumentTitle(t("levelUp.title"));
  const { language } = useLocale();
  const locale = asLocale(language);
  const navigate = useNavigate();
  const character = useCharacterStore((s) => s.character);
  const isLoading = useCharacterStore((s) => s.loading);
  const setCharacter = useCharacterStore((s) => s.setCharacter);
  const showToast = useToastStore((s) => s.showToast);
  const user = useAuthStore((s) => s.user);

  // ── wizard state ──────────────────────────────────────────────────────────
  const [stepId, setStepId] = useState<StepId>("hp");
  const [useAverage, setUseAverage] = useState(true);
  const [manualHpGain, setManualHpGain] = useState("");
  // #36 — the class being advanced (null until initialised from the character).
  const [advanceClassId, setAdvanceClassId] = useState<string | null>(null);
  const [asiChoice, setAsiChoice] = useState<AsiChoice>(emptyAsiChoice());
  const [subclassChoice, setSubclassChoice] = useState<string | null>(null);
  const [newSpells, setNewSpells] = useState<string[]>([]);
  const [newCantrips, setNewCantrips] = useState<string[]>([]);
  const [swapChoice, setSwapChoice] = useState<SpellSwapChoice>(emptySwapChoice());
  const [fightingStyleChoice, setFightingStyleChoice] = useState<string | null>(null);
  const [expertisePicks, setExpertisePicks] = useState<string[]>([]);
  const [weaponMasteryPicks, setWeaponMasteryPicks] = useState<string[]>([]);
  const [metamagicPicks, setMetamagicPicks] = useState<string[]>([]);
  const [invocationPicks, setInvocationPicks] = useState<string[]>([]);
  const [maneuverPicks, setManeuverPicks] = useState<string[]>([]);
  const [bundlePicks, setBundlePicks] = useState<Record<string, string>>({});
  const [choicePicks, setChoicePicks] = useState<ChoicePicks>(EMPTY_CHOICE_PICKS);
  const [spellMasteryPicks, setSpellMasteryPicks] = useState<SpellMasteryPicks>(
    emptySpellMasteryPicks()
  );
  const [signatureSpellsPicks, setSignatureSpellsPicks] = useState<SignatureSpellsPicks>(
    emptySignatureSpellsPicks()
  );
  // #36 — the multiclass entry skill pick (Bard/Ranger/Rogue/Artificer).
  const [mcSkillPicks, setMcSkillPicks] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [doneInfo, setDoneInfo] = useState<DoneInfo | null>(null);
  const [snapshotSaved, setSnapshotSaved] = useState(false);

  // ── leave guard (A1) ────────────────────────────────────────────────────────
  // The wizard is DIRTY once the player has invested anything (moved past the
  // first step, touched the HP mode, forked the class). A pristine wizard never
  // blocks — browser back simply leaves (owner 2026-06-11: "confirm if dirty",
  // never a trap). The same blocker guards BOTH browser back and the in-chrome
  // exit (which navigates), so there is exactly ONE confirm seam.
  const dirty =
    stepId !== "hp" ||
    !useAverage ||
    manualHpGain !== "" ||
    advanceClassId != null ||
    subclassChoice != null;
  const finishingRef = useRef(false);
  const blocker = useBlocker(
    useCallback(
      ({
        currentLocation,
        nextLocation,
      }: {
        currentLocation: { pathname: string };
        nextLocation: { pathname: string };
      }) =>
        dirty &&
        !finishingRef.current &&
        currentLocation.pathname !== nextLocation.pathname,
      [dirty]
    )
  );
  // ONE confirm per blocked navigation (a re-render while blocked must never
  // stack a second dialog or orphan the first resolver — the re-arm footgun).
  const confirmingRef = useRef(false);
  useEffect(() => {
    if (blocker.state !== "blocked" || confirmingRef.current) return;
    confirmingRef.current = true;
    let active = true;
    void useConfirmStore
      .getState()
      .confirm({
        title: t("levelUp.leaveTitle"),
        message: t("levelUp.leaveMessage"),
        confirmLabel: t("common.discard"),
        cancelLabel: t("common.continue"),
      })
      .then((ok) => {
        confirmingRef.current = false;
        if (!active) return;
        if (ok) blocker.proceed();
        else blocker.reset();
      });
    return () => {
      active = false;
    };
  }, [blocker, t]);
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (finishingRef.current) return;
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // A page turn starts at the TOP of the new page — never mid-scroll where the
  // previous step's list happened to leave the viewport (owner 2026-06-11).
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [stepId]);

  // ── derivations (engine-fed; ids only) ─────────────────────────────────────
  const charData = character?.character;
  const currentLevel = charData ? totalLevel(charData) : 1;
  const newLevel = currentLevel + 1;

  // The advancing class: default = primary (zero friction for single-class).
  const classId = advanceClassId ?? (charData ? primaryClassId(charData) : "");
  const currentClassLevel = charData ? classEntryLevel(charData, classId) : 0;
  const newClassLevel = currentClassLevel + 1;
  const isNewClass = currentClassLevel === 0;
  const advancingEntry = charData
    ? (getClasses(charData).find((e) => e.classId === classId) ?? null)
    : null;
  // STABLE primitive for memo deps (the entry itself is a freshly-derived
  // object the React Compiler can't preserve a manual memo over).
  const advancingSubclassId = advancingEntry?.subclassId ?? "";

  // #30 — seed the Weapon Mastery picks with the masteries the advancing class
  // ALREADY owns, so a count-increase level (e.g. Barbarian 4, where the Weapon
  // Mastery column grows 2→3) keeps the existing picks pre-selected and the player
  // only chooses the newly granted slot, instead of re-picking from scratch. Seeds
  // once per advancing class (the ref-guard); switching the advancing class in the
  // multiclass fork re-seeds from that class's own picks.
  const seededMasteryClass = useRef<string | null>(null);
  useEffect(() => {
    if (seededMasteryClass.current === classId) return;
    seededMasteryClass.current = classId;
    setWeaponMasteryPicks(advancingEntry?.weaponMasteries ?? []);
  }, [classId, advancingEntry]);

  const classTable = getClassTable(classId);
  const levelData = classTable?.levels.find((l) => l.level === newClassLevel);
  const prevLevelData = classTable?.levels.find((l) => l.level === currentClassLevel);

  // #36 — the class fork facts. The fork surfaces ONLY when there is a real
  // choice: an already-multiclass character, or ≥1 RAW-legal new class.
  const newClassIds = charData ? eligibleNewClasses(charData) : [];
  const ownedEntries = charData ? getClasses(charData) : [];
  const forkAvailable = ownedEntries.length > 1 || newClassIds.length > 0;
  // §2.7.3 — WHY classes are absent from the fork (the filtered-absence cause).
  const mcFilter = charData ? multiclassFilterReport(charData) : null;

  /** Switching the advancing class resets every dependent choice (on-rails). */
  function pickAdvanceClass(id: string) {
    if (id === classId) return;
    setAdvanceClassId(id);
    setSubclassChoice(null);
    setAsiChoice(emptyAsiChoice());
    setNewSpells([]);
    setNewCantrips([]);
    setSwapChoice(emptySwapChoice());
    setFightingStyleChoice(null);
    setExpertisePicks([]);
    setWeaponMasteryPicks([]);
    setMetamagicPicks([]);
    setInvocationPicks([]);
    setManeuverPicks([]);
    setBundlePicks({});
    setChoicePicks(EMPTY_CHOICE_PICKS);
    setSpellMasteryPicks(emptySpellMasteryPicks());
    setSignatureSpellsPicks(emptySignatureSpellsPicks());
    setMcSkillPicks([]);
  }

  // HP — the ADVANCING class's hit die (a multiclass level grants that die).
  const hitDie = classTable?.hitDie ?? charData?.hitDieType ?? 8;
  const avgHpGain = charData ? getAverageHpGain(hitDie, charData.abilityScores.CON) : 0;
  // Golden rule 20 — the manual roll is CLAMPED to the die's real faces
  // [1, hitDie] (the entry field clamps as-typed; this re-clamp makes an
  // out-of-range value unrepresentable even if state were seeded stale).
  const rawDieGain = useAverage
    ? (HIT_DIE_AVG[hitDie] ?? 5)
    : Math.min(hitDie, Math.max(1, parseInt(manualHpGain) || 0));

  const needsAsi = levelData?.asi === true;
  // D7 — the L19 boon step is the EPIC BOON gate: every class grants its
  // `<class>-epic-boon` feature at level 19. 2024 RAW restricts level 19 to an Epic
  // Boon feat (no general feat, no +2/+1 ASI fork), unlike the 4/8/12/16 ASI levels.
  // Detected from the level's own featureIds so it's class-agnostic + multiclass-safe
  // (only the class actually reaching its L19 grants the boon).
  const isEpicBoonGate =
    needsAsi && levelData.featureIds.some((id) => id.endsWith("-epic-boon"));
  // D7 — at the Epic Boon gate the ONLY legal boon is an Epic Boon feat, so force the
  // mode to "feat" (the fork is hidden) once when the gate becomes active. Ref-guarded
  // (mirrors the mastery-seed pattern) so it seeds once per advancing class and never
  // fights the user at a normal ASI level. Switching the advancing class re-evaluates.
  const seededEpicBoonClass = useRef<string | null>(null);
  useEffect(() => {
    if (!isEpicBoonGate) {
      seededEpicBoonClass.current = null;
      return;
    }
    if (seededEpicBoonClass.current === classId) return;
    seededEpicBoonClass.current = classId;
    setAsiChoice({ ...emptyAsiChoice(), mode: "feat" });
  }, [isEpicBoonGate, classId]);
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
  const needsMetamagic = (() => {
    if (!charData) return false;
    if (!(levelData?.featureIds ?? []).some(isMetamagicPlaceholder)) return false;
    return metamagicPicksAtLevel(newClassLevel) > 0;
  })();
  const metamagicPicksNeeded = metamagicPicksAtLevel(newClassLevel);
  const alreadyKnownMetamagic = new Set(charMetamagicChoices ?? []);
  const needsInvocations = (() => {
    if (!charData) return false;
    if (!(levelData?.featureIds ?? []).some(isInvocationPlaceholder)) return false;
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
  const spellsKnownDiff =
    levelData?.spellsKnown != null && prevSpellsKnown != null
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

  const activeChoicePicks = pruneChoicePicks(choiceSlots, choicePicks);

  const asiFeatId = needsAsi && asiChoice.mode === "feat" ? asiChoice.featId : null;
  const { caused: asiFeatSlots, rest: featureSlotsAfterAsi } =
    partitionChoiceSlotsBySource(choiceSlots, asiFeatId);
  // A chosen CASTER fighting style's cantrip slots render INLINE under the
  // Fighting-Style picker (its own attribution — rule 19), so peel them out of
  // the shared feature-choices section. Non-caster styles cause no slots.
  const fightingStyleFeatId =
    needsFightingStyle && fightingStyleChoice ? fightingStyleChoice : null;
  const { caused: fightingStyleSlots, rest: featureSlots } = partitionChoiceSlotsBySource(
    featureSlotsAfterAsi,
    fightingStyleFeatId
  );

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

  // ── the dynamic step list ──────────────────────────────────────────────────
  const hasChoicesStep =
    needsFightingStyle ||
    needsExpertise ||
    needsWeaponMastery ||
    needsMetamagic ||
    needsInvocations ||
    needsManeuvers ||
    needsBundles ||
    needsSpellMastery ||
    needsSignatureSpells ||
    mcSkillNeeded > 0 ||
    hasAnyChoiceSlots(featureSlots);
  const hasSpellsStep = spellsKnownDiff > 0 || cantripsKnownDiff > 0;
  // B5/A2 — the spell SWAP is its OWN step (its own orb), present ONLY when the
  // class actually offers a swap at this level. It never piggybacks another step.
  const hasSwapStep = canSwapSpell && knownNonCantripRefs.length > 0;

  const steps: Array<WizardStepDef & { id: StepId }> = [
    { id: "hp", label: t("levelUp.stepHp"), glyph: Heart },
    ...(needsSubclass
      ? [{ id: "subclass" as const, label: t("levelUp.stepSubclass"), glyph: Sparkles }]
      : []),
    ...(needsAsi
      ? [{ id: "boon" as const, label: t("levelUp.stepBoon"), glyph: Star }]
      : []),
    ...(hasChoicesStep
      ? [{ id: "choices" as const, label: t("levelUp.stepChoices"), glyph: Swords }]
      : []),
    ...(hasSpellsStep
      ? [{ id: "spells" as const, label: t("levelUp.stepSpells"), glyph: BookOpen }]
      : []),
    ...(hasSwapStep
      ? [{ id: "swap" as const, label: t("levelUp.stepSwap"), glyph: RefreshCw }]
      : []),
    { id: "review", label: t("levelUp.stepReview"), glyph: Scroll },
  ];
  const stepIndex = Math.max(
    0,
    steps.findIndex((s) => s.id === stepId)
  );
  const step = steps[stepIndex]?.id ?? "hp";

  // ── per-step completeness (Next gates on the CURRENT step only) ───────────
  const hpComplete = useAverage || !!manualHpGain;
  const boonComplete =
    !needsAsi ||
    (isAsiChoiceComplete(
      asiChoice,
      asiChoice.mode === "feat" && asiChoice.featId
        ? featAsi(SRD_FEATS.find((f) => f.id === asiChoice.featId) ?? {}) !== null
        : false
    ) &&
      (asiChoice.mode !== "feat" ||
        isAllChoicesComplete(asiFeatSlots, activeChoicePicks)));
  const choicesComplete =
    (!needsFightingStyle || fightingStyleChoice !== null) &&
    // A chosen CASTER style's cantrip sub-picks must be fully resolved.
    isAllChoicesComplete(fightingStyleSlots, activeChoicePicks) &&
    (!needsExpertise ||
      expertisePicks.length === EXPERTISE_PICKS_PER_GRANT ||
      expertiseEligible.length < EXPERTISE_PICKS_PER_GRANT) &&
    (!needsWeaponMastery || weaponMasteryPicks.length === weaponMasteryCount) &&
    (!needsMetamagic || metamagicPicks.length === metamagicPicksNeeded) &&
    (!needsInvocations || invocationPicks.length === invocationPicksNeeded) &&
    (!needsManeuvers || maneuverPicks.length === maneuversNeeded) &&
    (!needsBundles || levelUpBundles.every((b) => bundlePicks[b.bundleKey])) &&
    (mcSkillNeeded === 0 || mcSkillPicks.length === mcSkillNeeded) &&
    isAllChoicesComplete(featureSlots, activeChoicePicks) &&
    (!needsSpellMastery ||
      isSpellMasteryComplete(spellMasteryPicks) ||
      (spellMasteryEligibleL1.length === 0 && spellMasteryPicks.level2 != null) ||
      (spellMasteryEligibleL2.length === 0 && spellMasteryPicks.level1 != null)) &&
    (!needsSignatureSpells ||
      isSignatureSpellsComplete(signatureSpellsPicks) ||
      signatureSpellsEligible.length < 2);
  const spellsComplete =
    (spellsKnownDiff === 0 || newSpells.length === spellsKnownDiff) &&
    (cantripsKnownDiff === 0 || newCantrips.length === cantripsKnownDiff);
  const swapComplete = !isSwapIncomplete(swapChoice);
  const subclassComplete = !needsSubclass || subclassChoice !== null;

  const stepComplete: Record<StepId, boolean> = {
    hp: hpComplete,
    subclass: subclassComplete,
    boon: boonComplete,
    choices: choicesComplete,
    spells: spellsComplete,
    swap: swapComplete,
    review: true,
  };
  const canConfirm =
    hpComplete &&
    subclassComplete &&
    boonComplete &&
    choicesComplete &&
    spellsComplete &&
    swapComplete;

  // ── HP preview math (ported: retroactive CON-mod bump) ─────────────────────
  // D — the boon feat pool (lazy prose + memoized rows keep re-renders cheap;
  // the compiler-lint forbids a manual memo over these derived inputs).
  const offeredFeats = charData
    ? offeredFeatVMs(
        featGateCtx(charData, newLevel, isEpicBoonGate),
        takenFeatIdSet(charData),
        locale
      )
    : [];

  // D — the learnable POOLS (names resolve eagerly, prose LAZILY — rebuilding
  // on a re-render costs name lookups only; the compiler-lint forbids a manual
  // memo over these derived inputs).
  const spellListSlots: SpellListSlot[] = (() => {
    const slots: SpellListSlot[] = [];
    if (spellsKnownDiff > 0) {
      slots.push({
        id: "spells",
        label: t("levelUp.stepSpells"),
        amount: spellsKnownDiff,
        rubric: t("levelUp.spells.selectCount_other", { count: spellsKnownDiff }),
        pool: learnableSpellVMs(
          {
            classId,
            allowedLists: widenedSpellLists,
            cantripsOnly: false,
            maxLevel: maxSpellLevel,
            exclude: existingSpellIds,
          },
          locale
        ),
      });
    }
    if (cantripsKnownDiff > 0) {
      slots.push({
        id: "cantrips",
        label: t("spells.cantrips"),
        amount: cantripsKnownDiff,
        rubric: t("levelUp.newCantrip"),
        pool: learnableSpellVMs(
          {
            classId,
            cantripsOnly: true,
            maxLevel: 0,
            exclude: existingSpellIds,
          },
          locale
        ),
      });
    }
    return slots;
  })();

  const conMod = charData ? abilityModifier(charData.abilityScores.CON) : 0;
  const projectedConMod = (() => {
    if (!charData || !needsAsi || !isAsiChoiceComplete(asiChoice)) return conMod;
    const currentCon = charData.abilityScores.CON;
    let projectedCon = currentCon;
    if (asiChoice.mode === "plus2" && asiChoice.plusTwo === "CON") {
      projectedCon = Math.min(20, currentCon + 2);
    } else if (asiChoice.mode === "plus1_1") {
      let delta = 0;
      if (asiChoice.plusOneA === "CON") delta += 1;
      if (asiChoice.plusOneB === "CON") delta += 1;
      projectedCon = Math.min(20, currentCon + delta);
    } else if (asiChoice.mode === "feat" && asiChoice.featAbility === "CON") {
      const feat = SRD_FEATS.find((f) => f.id === asiChoice.featId);
      const asi = feat ? featAsi(feat) : null;
      if (asi) projectedCon = Math.min(asi.cap, currentCon + asi.amount);
    }
    return abilityModifier(projectedCon);
  })();
  const conModDelta = Math.max(0, projectedConMod - conMod);
  const resolvedHpGain = Math.max(1, rawDieGain + conMod) + newLevel * conModDelta;

  // ── early exits ────────────────────────────────────────────────────────────
  if (isLoading || !character || !charData) {
    return <FolioLoader variant="region" />;
  }
  if (currentLevel >= 20) {
    return (
      <WizardFrame>
        <WizardChrome
          steps={[]}
          current={0}
          eyebrow={t("levelUp.title")}
          title={charData.name}
          hint={t("levelUp.noChanges")}
        />
      </WizardFrame>
    );
  }

  // ── confirm (ported verbatim from the modal — behavior, not presentation) ──
  async function handleConfirm() {
    if (!character || !charData || !user || !canConfirm) return;
    setSaving(true);
    try {
      if (!snapshotSaved) {
        await saveCharacterSnapshot(user.uid, character.id, {
          character: charData,
          session: character.session,
          reason: "level-up",
        });
        setSnapshotSaved(true);
      }

      const { updatedCharacter: base } = levelUp(charData, newLevel, {
        hpGain: rawDieGain,
        advanceClassId: classId,
      });

      let updated = base;
      const handledChecklistKeys: string[] = [];

      if (needsAsi && isAsiChoiceComplete(asiChoice)) {
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
            const featRef: SrdFeatureRef = { srdId: feat.id };
            updated = { ...updated, features: [...updated.features, featRef] };
            const flatHp = (feat.grants ?? []).reduce(
              (sum, g) => (g.type === "hp-flat" ? sum + g.amount : sum),
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

      if (needsSubclass && subclassChoice) {
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

      if (needsFightingStyle && fightingStyleChoice) {
        if (!hasFightingStyleFeat(updated.features, fightingStyleChoice)) {
          updated = {
            ...updated,
            features: [...updated.features, { srdId: fightingStyleChoice }],
          };
        }
      }

      if (needsExpertise && expertisePicks.length === EXPERTISE_PICKS_PER_GRANT) {
        updated = {
          ...updated,
          skills: applyExpertisePicks(updated.skills, expertisePicks),
        };
      }

      if (needsWeaponMastery && weaponMasteryPicks.length === weaponMasteryCount) {
        updated = patchClassEntry(updated, classId, {
          weaponMasteries: [...weaponMasteryPicks],
        });
      }

      if (needsMetamagic && metamagicPicks.length === metamagicPicksNeeded) {
        const current =
          updated.classes.find((e) => e.classId === classId)?.metamagicChoices ?? [];
        const next = [...current];
        for (const id of metamagicPicks) if (!next.includes(id)) next.push(id);
        updated = patchClassEntry(updated, classId, { metamagicChoices: next });
      }

      if (needsManeuvers && maneuverPicks.length === maneuversNeeded) {
        const current =
          updated.classes.find((e) => e.classId === classId)?.maneuverChoices ?? [];
        const next = [...current];
        for (const id of maneuverPicks) if (!next.includes(id)) next.push(id);
        updated = patchClassEntry(updated, classId, { maneuverChoices: next });
      }

      if (needsInvocations && invocationPicks.length === invocationPicksNeeded) {
        const current =
          updated.classes.find((e) => e.classId === classId)?.invocationChoices ?? [];
        const next = [...current];
        for (const id of invocationPicks) if (!next.includes(id)) next.push(id);
        updated = patchClassEntry(updated, classId, { invocationChoices: next });
      }

      if (newCantrips.length > 0) {
        handledChecklistKeys.push("levelUp.checklistLearnCantrip");
        const cantripRefs: SrdSpellRef[] = newCantrips.map((id) => ({ srdId: id }));
        updated = { ...updated, spells: [...updated.spells, ...cantripRefs] };
      }

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

      if (needsSpellMastery && (spellMasteryPicks.level1 || spellMasteryPicks.level2)) {
        updated = {
          ...updated,
          spells: applySpellMasteryPicks(updated.spells, spellMasteryPicks),
        };
      }

      if (
        needsSignatureSpells &&
        (signatureSpellsPicks.first || signatureSpellsPicks.second)
      ) {
        updated = {
          ...updated,
          spells: applySignatureSpellsPicks(updated.spells, signatureSpellsPicks),
        };
      }

      if (swapChoice.removeId !== null && swapChoice.replaceId !== null) {
        updated = {
          ...updated,
          spells: applySpellSwap(
            updated.spells,
            swapChoice.removeId,
            swapChoice.replaceId
          ),
        };
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
          bundleChoices: new Map(
            Object.entries(character.session.grantBundleChoices ?? {})
          ),
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

      const updatedDoc = {
        ...character,
        character: updated,
        session: {
          ...character.session,
          hp: {
            ...character.session.hp,
            current: character.session.hp.current + (updated.hp.max - charData.hp.max),
          },
          ...(needsBundles && Object.keys(bundlePicks).length > 0
            ? {
                grantBundleChoices: {
                  ...character.session.grantBundleChoices,
                  ...bundlePicks,
                },
              }
            : {}),
        },
      };
      // A3 — capture what was ACHIEVED before the store advances underneath us
      // (post-confirm, `totalLevel(charData)` is already the new level — reading
      // live state off-by-oned the banner to N+1).
      setDoneInfo({
        level: newLevel,
        classId,
        classLevel: newClassLevel,
        hpGained: updated.hp.max - charData.hp.max,
      });
      // The level-up is APPLIED: the leave guard must not re-prompt while the
      // celebration shows / its CTA navigates. The ceremony NEVER auto-
      // dismisses (owner 2026-06-11: the user reads it at their own pace) —
      // the explicit "To the sheet" CTA is the one way out.
      finishingRef.current = true;
      setCharacter(updatedDoc);
      // Undo-stack FENCE (§5.4): a completed level-up rewrites the whole sheet
      // (features, slots, HP, ASI), so a pre-level-up reverse-applier could restore
      // state that no longer coheres. Drop the stack on commit.
      useUndoStore.getState().clear();
      await updateCharacter(user.uid, character.id, {
        character: updated,
        session: updatedDoc.session,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("common.unknownError");
      console.error("Level-up save failed", e);
      showToast({ message: t("levelUp.saveFailed", { error: msg }), duration: 6000 });
      setDoneInfo(null);
      finishingRef.current = false;
      setSaving(false);
    }
  }

  // ── chrome strings ─────────────────────────────────────────────────────────
  const pastHp = stepIndex > 0;
  // Join with a NON-BREAKING space before the "·" (normal space after), so the
  // separator always stays glued to the end of its preceding token: a wrap can
  // only fall AFTER a "·", never before it, so no wrapped line ever starts with a
  // stray "·" (the IT-mobile eyebrow orphan).
  const eyebrow = [
    t("levelUp.title"),
    charData.name,
    t("levelUp.levelRange", { from: currentLevel, to: newLevel }),
    ...(pastHp ? [t("levelUp.hpTaken", { hp: resolvedHpGain })] : []),
  ].join("\u00A0· ");
  // P2 — the HP + boon rubrics carry inline GlossaryTip slots (<Trans>) so the
  // terms a first-timer stumbles on (hit die, feat) explain themselves on demand.
  const TITLES: Record<StepId, [string, ReactNode]> = {
    hp: [
      t("levelUp.titleHp"),
      <Trans
        key="hp"
        i18nKey="levelUp.hintHp"
        components={{ g: <GlossaryTip term="hitDice" rubric={t("rest.hitDice")} /> }}
      />,
    ],
    subclass: [t("levelUp.titleSubclass"), t("levelUp.hintSubclass")],
    boon: [
      t("levelUp.titleBoon"),
      <Trans
        key="boon"
        i18nKey="levelUp.hintBoon"
        values={{ level: newLevel }}
        components={{ g: <GlossaryTip term="feat" rubric={t("feats.feats")} /> }}
      />,
    ],
    choices: [t("levelUp.titleChoices"), t("levelUp.hintChoices")],
    spells: [t("levelUp.titleSpells"), t("levelUp.hintSpells")],
    swap: [t("levelUp.titleSwap"), t("levelUp.hintSwap")],
    review: [t("levelUp.titleReview"), t("levelUp.hintReview")],
  };
  const [title, hint] = TITLES[step];

  /** The chosen boon, summarized ("+2 STR" · "+1 STR · +1 DEX" · the feat). */
  function boonSummary(): string {
    if (asiChoice.mode === "feat") {
      const name = asiChoice.featId ? featName(asiChoice.featId, locale) : "—";
      return asiChoice.featAbility
        ? `${name} (+1 ${abilityLabel(asiChoice.featAbility, locale)})`
        : name;
    }
    if (asiChoice.mode === "plus2") {
      return asiChoice.plusTwo ? `+2 ${abilityLabel(asiChoice.plusTwo, locale)}` : "—";
    }
    return [asiChoice.plusOneA, asiChoice.plusOneB]
      .filter((a): a is AbilityCode => a != null)
      .map((a) => `+1 ${abilityLabel(a, locale)}`)
      .join(" · ");
  }

  const changes = preview?.changes ?? [];
  const renderChangeLine = (change: LevelUpChange): string => {
    const body = change.i18nKey
      ? t(change.i18nKey, change.description, levelUpChangeArgs(change, locale))
      : change.description;
    const source = levelUpChangeSource(change, locale);
    return source ? `${source}: ${body}` : body;
  };

  // The boon fork rides the chrome (reserved on every step so nothing shifts).
  // D7 — at the L19 Epic Boon gate there is NO fork: 2024 RAW grants specifically an
  // Epic Boon feat (no +2/+1 ASI, no general feat), so the mode is locked to "feat"
  // (see the force-feat effect) and the fork tabs are suppressed entirely.
  const boonFork =
    step === "boon" && !isEpicBoonGate ? (
      <div className="wiz-fork" role="group" aria-label={t("levelUp.asi.modeLabel")}>
        {(
          [
            ["plus2", t("levelUp.asi.plus2")],
            ["plus1_1", t("levelUp.asi.plus1_1")],
            ["feat", t("levelUp.asi.feat")],
          ] as Array<[AsiChoiceMode, string]>
        ).map(([m, label]) => (
          <WizardForkTab
            key={m}
            active={asiChoice.mode === m}
            onClick={() =>
              setAsiChoice({
                mode: m,
                plusTwo: null,
                plusOneA: null,
                plusOneB: null,
                featId: null,
                featAbility: null,
              })
            }
          >
            {label}
          </WizardForkTab>
        ))}
      </div>
    ) : undefined;

  const nextStep = steps[stepIndex + 1];
  const prevStep = steps[stepIndex - 1];

  if (doneInfo) {
    // B7 — the celebratory moment wears the folio's carved-gold ceremony: the
    // class seal enthroned, the ACHIEVED level (captured at confirm — A3), the
    // class identity, and what was gained. Not a generic toast.
    const DoneGlyph = classRoleSeal(doneInfo.classId).icon;
    return (
      <WizardFrame>
        <div className="wiz-done" role="status">
          <span className="wiz-done-seal" aria-hidden>
            <Icon as={DoneGlyph} size="lg" decorative />
          </span>
          <p className="wiz-done-eyebrow">
            <PartyPopper className="h-3.5 w-3.5" aria-hidden />
            {t("levelUp.doneEyebrow")}
            <PartyPopper className="h-3.5 w-3.5 -scale-x-100" aria-hidden />
          </p>
          <h2 className="wiz-done-level">
            {t("levelUp.congrats", { level: doneInfo.level })}
          </h2>
          <p className="wiz-done-identity">
            {charData.name} · {className(doneInfo.classId, locale)} {doneInfo.classLevel}
          </p>
          <p className="wiz-done-gains tnum">
            {t("levelUp.hpTaken", { hp: doneInfo.hpGained })}
          </p>
          <p className="wiz-done-saved">{t("levelUp.savedMessage")}</p>
          {/* The ceremony stays until the user acts (owner 2026-06-11) — ONE
              clear, focused CTA dismisses it. Enter works out of the box. */}
          <Button
            variant="primary"
            className="wiz-done-cta"
            autoFocus
            onClick={() => void navigate(`/characters/${character.id}`)}
          >
            {t("levelUp.toSheet")}
          </Button>
        </div>
      </WizardFrame>
    );
  }

  return (
    <WizardFrame
      nav={
        <WizardNav
          // Back is ALWAYS live: on the first step it exits to the cockpit
          // (the dirty-gated blocker confirms when something is invested).
          backLabel={prevStep?.label ?? t("wizard.exit")}
          nextLabel={
            step === "review"
              ? saving
                ? t("levelUp.applying")
                : t("levelUp.confirm", { level: newLevel })
              : t("wizard.continueTo", { step: nextStep?.label ?? "" })
          }
          // Phones show the bare destination — compact, never ellipsed.
          nextShort={
            step === "review"
              ? saving
                ? t("levelUp.applying")
                : t("levelUp.confirm", { level: newLevel })
              : nextStep?.label
          }
          onBack={() => {
            if (prevStep) setStepId(prevStep.id);
            else void navigate(`/characters/${character.id}`);
          }}
          onNext={() => {
            if (step === "review") void handleConfirm();
            else if (nextStep) setStepId(nextStep.id);
          }}
          nextDisabled={step === "review" ? !canConfirm : !stepComplete[step]}
          loading={saving}
          commit={step === "review"}
        />
      }
    >
      <WizardChrome
        steps={steps}
        current={stepIndex}
        eyebrow={eyebrow}
        title={title}
        hint={hint}
        fork={boonFork}
        onStepClick={(i) => {
          const target = steps[i];
          if (target) setStepId(target.id);
        }}
        // B6 — a FUTURE orb opens once every step before it is complete (the
        // on-rails forward gate); visited orbs are always revisitable.
        stepEnabled={(i) => steps.slice(0, i).every((s) => stepComplete[s.id])}
      />

      <div className="wiz-body">
        {step === "hp" && (
          <HpStep
            avgHpGain={avgHpGain}
            hitDie={hitDie}
            useAverage={useAverage}
            manualHpGain={manualHpGain}
            onUseAverage={setUseAverage}
            onManualHpGain={setManualHpGain}
            hpFrom={charData.hp.max}
            hpTo={charData.hp.max + resolvedHpGain}
            fork={
              forkAvailable ? (
                <ClassForkGallery
                  ownedEntries={ownedEntries}
                  newClassIds={newClassIds}
                  filterReport={mcFilter}
                  selectedClassId={classId}
                  locale={locale}
                  onPick={pickAdvanceClass}
                />
              ) : mcFilter && mcFilter.filtered.length > 0 ? (
                // §2.7.3 — no fork at all BECAUSE prerequisites closed every
                // new class: the absence still carries its one-line cause.
                <section className="mx-auto w-full max-w-[900px]">
                  <MulticlassFilteredCause
                    report={mcFilter}
                    eligibleCount={0}
                    locale={locale}
                  />
                </section>
              ) : null
            }
          />
        )}

        {step === "subclass" && (
          <div className="mx-auto flex w-full max-w-[900px] flex-col gap-6">
            {/* §2.7.2 — detail on SELECTED: the chosen subclass is enthroned in
                the hero altar (the creation-wizard vocabulary) with its REVEAL —
                every feature it grants at this level in full reading prose, and
                its always-prepared bonus spells — attributed to the choice. */}
            {(() => {
              const chosen = subclassChoice
                ? subclassOptions(classId, locale).find((sc) => sc.id === subclassChoice)
                : undefined;
              if (!chosen || !subclassChoice) return <WizardHeroEmpty />;
              const reveal = subclassReveal(
                classId,
                subclassChoice,
                newClassLevel,
                locale
              );
              return (
                <WizardHero
                  glyph={<Icon as={classRoleSeal(classId).icon} size="md" decorative />}
                  eyebrow={`${className(classId, locale)} · ${t(
                    "levelUp.subclassGrantsHead",
                    { level: newClassLevel }
                  )}`}
                  name={chosen.label}
                  body={
                    <div className="flex flex-col gap-2">
                      {reveal.features.map((f) => (
                        <div key={f.id}>
                          <p className="wiz-hero-lede mb-0.5 font-semibold not-italic">
                            {f.name}
                          </p>
                          <InlineMarkdown
                            text={f.description}
                            className="wiz-hero-lede"
                            highlight={highlightRulesText(locale)}
                          />
                        </div>
                      ))}
                    </div>
                  }
                  asksHead={
                    reveal.spells.length > 0 ? t("levelUp.subclassSpellsHead") : undefined
                  }
                  asks={
                    reveal.spells.length > 0 ? (
                      <ul className="wiz-review-lines">
                        {reveal.spells.map((name) => (
                          <li key={name}>
                            <span className="wiz-review-v text-left">{name}</span>
                          </li>
                        ))}
                      </ul>
                    ) : undefined
                  }
                  onClear={() => setSubclassChoice(null)}
                />
              );
            })()}
            <PlaqueGrid label={t("levelUp.titleSubclass")}>
              {subclassOptions(classId, locale).map((sc) => (
                <PlaqueCard
                  key={sc.id}
                  glyph={<Icon as={Sparkles} size="sm" decorative />}
                  name={sc.label}
                  gloss={sc.meta}
                  clampGloss
                  eyebrow={className(classId, locale)}
                  chosen={subclassChoice === sc.id}
                  onClick={() =>
                    setSubclassChoice(subclassChoice === sc.id ? null : sc.id)
                  }
                />
              ))}
            </PlaqueGrid>
          </div>
        )}

        {step === "boon" &&
          (asiChoice.mode !== "feat" ? (
            <AsiBoonPanel
              mode={asiChoice.mode}
              abilityScores={charData.abilityScores}
              choice={asiChoice}
              onChoice={setAsiChoice}
            />
          ) : (
            <WizardFeatList
              feats={offeredFeats}
              chosenId={asiChoice.featId}
              onChoose={(id) => {
                const feat = id ? SRD_FEATS.find((f) => f.id === id) : undefined;
                const asi = feat ? featAsi(feat) : null;
                setAsiChoice({
                  ...asiChoice,
                  featId: id,
                  featAbility:
                    asi &&
                    asiChoice.featAbility &&
                    asi.abilities.includes(asiChoice.featAbility)
                      ? asiChoice.featAbility
                      : null,
                });
              }}
              asksFor={(featId) => {
                const feat = SRD_FEATS.find((f) => f.id === featId);
                if (!feat) return null;
                const asi = featAsi(feat);
                const slots =
                  featId === asiFeatId
                    ? asiFeatSlots
                    : partitionChoiceSlotsBySource(
                        collectChoiceSlots(
                          resolveGrantSourcesForFeatures([{ srdId: featId }]),
                          { spellSlotsByClass: newRows }
                        ),
                        featId
                      ).caused;
                if (!asi && !hasAnyChoiceSlots(slots)) return null;
                // The asks render DIRECTLY (no "From <feat>" cause-head): inside
                // the feat's OWN entry the attribution is the entry itself —
                // one attribution, never two (golden rule 19). The slot pickers
                // are the same shared components the cause-block hosts.
                const unstamped = {
                  ...slots,
                  spell: slots.spell.map((sl) => ({ ...sl, sourceId: undefined })),
                };
                return (
                  <>
                    {asi && (
                      <FeatAbilityPicker
                        asi={asi}
                        abilityScores={charData.abilityScores}
                        value={featId === asiFeatId ? asiChoice.featAbility : null}
                        onChange={(ability) =>
                          setAsiChoice({ ...asiChoice, featAbility: ability })
                        }
                      />
                    )}
                    {hasAnyChoiceSlots(unstamped) && (
                      <FeatureChoicesSection
                        slots={unstamped}
                        picks={activeChoicePicks}
                        onChange={setChoicePicks}
                        existingSkillIds={ownedSkillIds}
                        existingSpellIds={existingSpellIds}
                        proficientSkillIds={
                          new Set(
                            Object.entries(charData.skills)
                              .filter(([, v]) => v === "proficient")
                              .map(([k]) => k)
                          )
                        }
                      />
                    )}
                  </>
                );
              }}
              searchPlaceholder={t("levelUp.asi.searchFeat")}
            />
          ))}

        {step === "choices" && (
          <div className="mx-auto flex w-full max-w-[680px] flex-col gap-6">
            {mcGrants && (
              <MulticlassGainsNote classId={classId} grants={mcGrants} locale={locale} />
            )}
            {mcSkillNeeded > 0 && (
              <WizardPickList
                label={t("levelUp.chooseMulticlassSkill", {
                  count: mcSkillNeeded,
                  class: className(classId, locale),
                })}
                options={mcSkillOptions.map(
                  (id): WizardPickOption => ({
                    id,
                    name: t(`skills.${id}`),
                    seal: <SocketSeal icon={Target} />,
                  })
                )}
                selected={mcSkillPicks}
                total={mcSkillNeeded}
                onToggle={(id) =>
                  setMcSkillPicks((prev) => togglePick(prev, id, mcSkillNeeded))
                }
                searchable={false}
              />
            )}
            {hasAnyChoiceSlots(featureSlots) && (
              <div>
                <p className="wiz-pick-head">
                  <span className="wiz-pick-label">
                    <Icon as={Sparkles} size="xs" decorative />
                    {t("levelUp.featureChoices")}
                  </span>
                </p>
                <div className="mt-3">
                  <FeatureChoicesSection
                    slots={featureSlots}
                    picks={activeChoicePicks}
                    onChange={setChoicePicks}
                    existingSkillIds={ownedSkillIds}
                    existingSpellIds={existingSpellIds}
                    proficientSkillIds={
                      new Set(
                        Object.entries(charData.skills)
                          .filter(([, v]) => v === "proficient")
                          .map(([k]) => k)
                      )
                    }
                  />
                </div>
              </div>
            )}
            {needsBundles && (
              <div>
                <p className="wiz-pick-head">
                  <span className="wiz-pick-label">
                    <Icon as={Sparkles} size="xs" decorative />
                    {t("levelUp.buildChoices")}
                  </span>
                </p>
                <div className="mt-3">
                  <GrantBundleSelector
                    bundles={levelUpBundles.map((b) => ({
                      ...b,
                      selected: bundlePicks[b.bundleKey] ?? null,
                    }))}
                    locale={locale}
                    onSelect={(bundleKey, optionId) =>
                      setBundlePicks((p) => ({ ...p, [bundleKey]: optionId }))
                    }
                  />
                </div>
              </div>
            )}
            {needsInvocations && (
              <WizardPickList
                label={t("levelUp.chooseInvocations", { n: invocationPicksNeeded })}
                options={invocationOptions(
                  newClassLevel,
                  charInvocationChoices ?? [],
                  t("levelUp.asi.prerequisite"),
                  locale
                ).map(
                  (vm): WizardPickOption => ({
                    id: vm.id,
                    name: vm.label,
                    description: vm.meta,
                    gloss: vm.note,
                    seal: <SocketSeal icon={Sparkles} />,
                    searchText: `${vm.label} ${vm.searchEn}`,
                    searchDesc: vm.searchDesc,
                  })
                )}
                selected={invocationPicks}
                total={invocationPicksNeeded}
                onToggle={(id) =>
                  setInvocationPicks((prev) =>
                    togglePick(prev, id, invocationPicksNeeded)
                  )
                }
                searchPlaceholder={t("levelUp.searchInvocations")}
              />
            )}
            {needsManeuvers && (
              <WizardPickList
                label={t("levelUp.chooseManeuvers", { n: maneuversNeeded })}
                options={maneuverOptions(
                  newClassLevel,
                  charManeuverChoices ?? [],
                  locale
                ).map(
                  (vm): WizardPickOption => ({
                    id: vm.id,
                    name: vm.label,
                    description: vm.meta,
                    seal: <SocketSeal icon={Swords} />,
                    searchText: `${vm.label} ${vm.searchEn}`,
                    searchDesc: vm.searchDesc,
                  })
                )}
                selected={maneuverPicks}
                total={maneuversNeeded}
                onToggle={(id) =>
                  setManeuverPicks((prev) => togglePick(prev, id, maneuversNeeded))
                }
                searchPlaceholder={t("levelUp.searchManeuvers")}
              />
            )}
            {needsMetamagic && (
              <WizardPickList
                label={t("levelUp.chooseMetamagic", { n: metamagicPicksNeeded })}
                options={metamagicOptions(alreadyKnownMetamagic, "", locale)
                  // Known options are EXCLUDED, never disabled noise (rule 19).
                  .filter((vm) => !vm.disabled)
                  .map(
                    (vm): WizardPickOption => ({
                      id: vm.id,
                      name: vm.label,
                      description: vm.meta,
                      gloss: t("levelUp.metamagicCost", { cost: vm.cost }),
                      seal: <SocketSeal icon={Sparkles} />,
                      searchText: `${vm.label} ${vm.searchEn}`,
                      searchDesc: vm.searchDesc,
                    })
                  )}
                selected={metamagicPicks}
                total={metamagicPicksNeeded}
                onToggle={(id) =>
                  setMetamagicPicks((prev) => togglePick(prev, id, metamagicPicksNeeded))
                }
                searchPlaceholder={t("levelUp.searchMetamagic")}
              />
            )}
            {needsWeaponMastery && weaponMasteryCount > 0 && (
              <WizardPickList
                label={t("levelUp.chooseWeaponMastery", { n: weaponMasteryCount })}
                options={weaponMasteryOptions(locale).map(
                  (vm): WizardPickOption => ({
                    id: vm.id,
                    name: vm.label,
                    gloss: vm.note,
                    seal: <SocketSeal icon={weaponSealIcon(vm.id)} />,
                    searchText: `${vm.label} ${vm.searchEn}`,
                  })
                )}
                selected={weaponMasteryPicks}
                total={weaponMasteryCount}
                onToggle={(id) =>
                  setWeaponMasteryPicks((prev) =>
                    togglePick(prev, id, weaponMasteryCount)
                  )
                }
                searchPlaceholder={t("levelUp.searchWeapons")}
              />
            )}
            {/* No eligible skills ⇒ the section simply doesn't exist — never a
                line that only says "you can't" (owner 2026-06-11, rule 19). */}
            {needsExpertise && expertiseEligible.length >= EXPERTISE_PICKS_PER_GRANT && (
              <WizardPickList
                label={t("levelUp.chooseExpertise", {
                  n: EXPERTISE_PICKS_PER_GRANT,
                })}
                options={expertiseEligible.map(
                  (skillId): WizardPickOption => ({
                    id: skillId,
                    name: t(`skills.${skillId}`),
                    seal: <SocketSeal icon={Target} />,
                  })
                )}
                selected={expertisePicks}
                total={EXPERTISE_PICKS_PER_GRANT}
                onToggle={(id) =>
                  setExpertisePicks((prev) =>
                    prev.includes(id)
                      ? prev.filter((s) => s !== id)
                      : prev.length < EXPERTISE_PICKS_PER_GRANT
                        ? [...prev, id]
                        : prev
                  )
                }
                searchable={false}
              />
            )}
            {needsSpellMastery && (
              <div className="flex flex-col gap-4">
                <p className="wiz-pick-head">
                  <span className="wiz-pick-label">
                    <Icon as={Star} size="xs" decorative />
                    {t("levelUp.chooseSpellMastery")}
                  </span>
                </p>
                <p className="on-art text-xs text-text-muted">
                  {t("levelUp.spellMasteryHint")}
                </p>
                {([1, 2] as const).map((slotLevel) => {
                  const opts =
                    slotLevel === 1 ? spellMasteryEligibleL1 : spellMasteryEligibleL2;
                  const chosen =
                    slotLevel === 1 ? spellMasteryPicks.level1 : spellMasteryPicks.level2;
                  // An empty level renders NOTHING (rule 19) — the pick can
                  // be made later from the spell card.
                  if (opts.length === 0) return null;
                  return (
                    <WizardPickList
                      key={slotLevel}
                      label={t("levelUp.spellMasteryLevel", { n: slotLevel })}
                      options={spellPickOptions(opts, locale).map(
                        (vm): WizardPickOption => ({
                          id: vm.id,
                          name: vm.label,
                          seal: <SpellLevelSeal level={slotLevel} />,
                          searchText: `${vm.label} ${vm.searchEn}`,
                        })
                      )}
                      selected={chosen ? [chosen] : []}
                      total={1}
                      onToggle={(id) =>
                        setSpellMasteryPicks({
                          ...spellMasteryPicks,
                          [slotLevel === 1 ? "level1" : "level2"]:
                            chosen === id ? undefined : id,
                        })
                      }
                      searchable={false}
                    />
                  );
                })}
              </div>
            )}
            {needsSignatureSpells && signatureSpellsEligible.length >= 2 && (
              <div className="flex flex-col gap-2">
                <WizardPickList
                  label={t("levelUp.chooseSignatureSpells")}
                  options={spellPickOptions(signatureSpellsEligible, locale).map(
                    (vm): WizardPickOption => ({
                      id: vm.id,
                      name: vm.label,
                      seal: <SpellLevelSeal level={3} />,
                      searchText: `${vm.label} ${vm.searchEn}`,
                    })
                  )}
                  selected={[
                    signatureSpellsPicks.first,
                    signatureSpellsPicks.second,
                  ].filter((id): id is string => id != null)}
                  total={2}
                  onToggle={(id) => {
                    const p = signatureSpellsPicks;
                    if (p.first === id)
                      setSignatureSpellsPicks({ ...p, first: undefined });
                    else if (p.second === id)
                      setSignatureSpellsPicks({ ...p, second: undefined });
                    else if (p.first == null)
                      setSignatureSpellsPicks({ ...p, first: id });
                    else if (p.second == null)
                      setSignatureSpellsPicks({ ...p, second: id });
                  }}
                  searchable={false}
                />
                <p className="on-art text-xs text-text-muted">
                  {t("levelUp.signatureSpellsHint")}
                </p>
              </div>
            )}
            {needsFightingStyle && (
              <WizardPickList
                label={t("levelUp.chooseFightingStyle")}
                options={fightingStyleOptions(charData.features, "", locale, classId)
                  // Owned styles are EXCLUDED, never disabled noise (rule 19).
                  .filter((vm) => !vm.disabled)
                  .map(
                    (vm): WizardPickOption => ({
                      id: vm.id,
                      name: vm.label,
                      description: vm.meta,
                      seal: <SocketSeal icon={Swords} />,
                      searchText: `${vm.label} ${vm.searchEn}`,
                      searchDesc: vm.searchDesc,
                    })
                  )}
                selected={fightingStyleChoice ? [fightingStyleChoice] : []}
                total={1}
                onToggle={(id) =>
                  setFightingStyleChoice(fightingStyleChoice === id ? null : id)
                }
                searchable={false}
              />
            )}
            {/* A CASTER style (Blessed/Druidic Warrior) carries cantrip picks;
                surface them right under the chosen style — its own attribution
                (rule 19), the SAME shared section every other source uses. */}
            {needsFightingStyle && hasAnyChoiceSlots(fightingStyleSlots) && (
              <FeatureChoicesSection
                slots={fightingStyleSlots}
                picks={activeChoicePicks}
                onChange={setChoicePicks}
                existingSkillIds={ownedSkillIds}
                existingSpellIds={existingSpellIds}
                proficientSkillIds={
                  new Set(
                    Object.entries(charData.skills)
                      .filter(([, v]) => v === "proficient")
                      .map(([k]) => k)
                  )
                }
              />
            )}
          </div>
        )}

        {step === "spells" && (
          <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6">
            {/* The widened pool's CAUSE leads the list (Magical Secrets) — an
                explanation trailing hundreds of rows teaches nobody (§2.7.3:
                the absence/presence of options carries its cause up front). */}
            {isSpellPoolWidened && (
              <p className="on-art -mb-3 text-center text-[0.7rem] italic text-text-secondary">
                {t("levelUp.magicalSecretsHint")}
              </p>
            )}
            {(spellsKnownDiff > 0 || cantripsKnownDiff > 0) && (
              <WizardSpellList
                slots={spellListSlots}
                picks={{ spells: newSpells, cantrips: newCantrips }}
                onToggle={(slotId, spellId, limit) => {
                  if (slotId === "spells") {
                    setNewSpells((prev) => togglePick(prev, spellId, limit));
                  } else {
                    setNewCantrips((prev) => togglePick(prev, spellId, limit));
                  }
                }}
              />
            )}
          </div>
        )}

        {/* B5 — the spell swap is its OWN step (only when the class offers one). */}
        {step === "swap" && (
          <WizardSpellSwap
            classId={classId}
            allowedLists={widenedSpellLists}
            knownSpells={knownNonCantripRefs}
            value={swapChoice}
            onChange={setSwapChoice}
          />
        )}

        {step === "review" && (
          <div className="mx-auto flex w-full max-w-[680px] flex-col gap-6">
            {mcGrants && (
              <MulticlassGainsNote classId={classId} grants={mcGrants} locale={locale} />
            )}
            {/* S10 (owner 2026-06-11) — the review SUMMARIZES: everything the
                player chose this level, in the gold summary card. */}
            <section className="wiz-summary" aria-label={t("common.reviewChoices")}>
              <p className="wiz-pick-head">
                <span className="wiz-pick-label">
                  <Icon as={Scroll} size="xs" decorative />
                  {t("common.reviewChoices")}
                </span>
                <span className="wiz-count tnum">
                  {className(classId, locale)} {newClassLevel}
                </span>
              </p>
              {/* The P6 recap-ledger pattern: EVERY choice this level collected,
                  attributed to the step that owns it (S10 + §2.4), each row a
                  one-tap jump back to that step. */}
              {(() => {
                const join = (ids: ReadonlyArray<string>, name: (id: string) => string) =>
                  ids.map(name).join(" · ");
                const rows: Array<{
                  key: string;
                  step: StepId;
                  label: string;
                  value: string;
                  tnum?: boolean;
                }> = [
                  {
                    key: "hp",
                    step: "hp",
                    label: t("levelUp.stepHp"),
                    value: t("levelUp.hpWillGain", {
                      current: charData.hp.max,
                      next: charData.hp.max + resolvedHpGain,
                    }),
                    tnum: true,
                  },
                ];
                if (needsSubclass && subclassChoice) {
                  rows.push({
                    key: "subclass",
                    step: "subclass",
                    label: t("levelUp.stepSubclass"),
                    value:
                      subclassOptions(classId, locale).find(
                        (sc) => sc.id === subclassChoice
                      )?.label ?? subclassChoice,
                  });
                }
                if (needsAsi) {
                  rows.push({
                    key: "boon",
                    step: "boon",
                    label: t("levelUp.stepBoon"),
                    value: boonSummary(),
                  });
                }
                if (needsFightingStyle && fightingStyleChoice) {
                  rows.push({
                    key: "fighting-style",
                    step: "choices",
                    label: t("feats.category_fighting-style"),
                    value: featName(fightingStyleChoice, locale),
                  });
                }
                if (needsExpertise && expertisePicks.length > 0) {
                  rows.push({
                    key: "expertise",
                    step: "choices",
                    label: t("abilities.legendExpertise"),
                    value: join(expertisePicks, (id) => t(`skills.${id}`)),
                  });
                }
                if (needsWeaponMastery && weaponMasteryPicks.length > 0) {
                  rows.push({
                    key: "weapon-mastery",
                    step: "choices",
                    label: t("weaponMastery.eyebrow"),
                    value: join(weaponMasteryPicks, (id) => equipmentName(id, locale)),
                  });
                }
                if (needsMetamagic && metamagicPicks.length > 0) {
                  rows.push({
                    key: "metamagic",
                    step: "choices",
                    label: t("metamagic.section"),
                    value: join(metamagicPicks, (id) => metamagicName(id, locale)),
                  });
                }
                if (needsInvocations && invocationPicks.length > 0) {
                  rows.push({
                    key: "invocations",
                    step: "choices",
                    label: t("invocations.section"),
                    value: join(invocationPicks, (id) => invocationName(id, locale)),
                  });
                }
                if (needsManeuvers && maneuverPicks.length > 0) {
                  rows.push({
                    key: "maneuvers",
                    step: "choices",
                    label: t("maneuvers.section"),
                    value: join(maneuverPicks, (id) => maneuverName(id, locale)),
                  });
                }
                if (needsBundles) {
                  for (const b of levelUpBundles) {
                    const picked = bundlePicks[b.bundleKey];
                    const opt = picked
                      ? b.options.find((o) => o.id === picked)
                      : undefined;
                    if (!opt) continue;
                    rows.push({
                      key: `bundle-${b.bundleKey}`,
                      step: "choices",
                      label: localizeText(b.label, locale),
                      value: localizeText(opt.label, locale),
                    });
                  }
                }
                if (needsSpellMastery) {
                  const picks = [
                    spellMasteryPicks.level1,
                    spellMasteryPicks.level2,
                  ].filter((id): id is string => id != null);
                  if (picks.length > 0) {
                    rows.push({
                      key: "spell-mastery",
                      step: "choices",
                      label: t("levelUp.spellMasteryRow"),
                      value: join(picks, (id) => spellName(id, locale)),
                    });
                  }
                }
                if (needsSignatureSpells) {
                  const picks = [
                    signatureSpellsPicks.first,
                    signatureSpellsPicks.second,
                  ].filter((id): id is string => id != null);
                  if (picks.length > 0) {
                    rows.push({
                      key: "signature-spells",
                      step: "choices",
                      label: t("levelUp.signatureSpellsRow"),
                      value: join(picks, (id) => spellName(id, locale)),
                    });
                  }
                }
                if (mcSkillPicks.length > 0) {
                  rows.push({
                    key: "mc-skills",
                    step: "choices",
                    label: t("character.hud.skills"),
                    value: join(mcSkillPicks, (id) => t(`skills.${id}`)),
                  });
                }
                if (newSpells.length > 0) {
                  rows.push({
                    key: "spells",
                    step: "spells",
                    label: t("levelUp.stepSpells"),
                    value: join(newSpells, (id) => spellName(id, locale)),
                  });
                }
                if (newCantrips.length > 0) {
                  rows.push({
                    key: "cantrips",
                    step: "spells",
                    label: t("spells.cantrips"),
                    value: join(newCantrips, (id) => spellName(id, locale)),
                  });
                }
                if (swapChoice.removeId != null && swapChoice.replaceId != null) {
                  rows.push({
                    key: "swap",
                    step: "swap",
                    label: t("levelUp.stepSwap"),
                    value: t("levelUp.swap.summary", {
                      old: spellName(swapChoice.removeId, locale),
                      new: spellName(swapChoice.replaceId, locale),
                    }),
                  });
                }
                return (
                  <ul className="wiz-review-lines">
                    {rows.map((r) => (
                      <li key={r.key}>
                        <button
                          type="button"
                          className="wiz-review-jump"
                          onClick={() => setStepId(r.step)}
                        >
                          <span className="wiz-review-k">{r.label}</span>
                          <span className={cn("wiz-review-v", r.tnum && "tnum")}>
                            {r.value}
                          </span>
                          <Icon
                            as={ChevronRight}
                            className="wiz-review-chev"
                            decorative
                          />
                        </button>
                      </li>
                    ))}
                  </ul>
                );
              })()}
              {/* The caster's slot ledger AT THE NEW LEVEL — the cockpit's
                  carved vital cells (one per slot level, count as the hero).
                  The head SAYS what the cells are (fb3): the NEW totals. */}
              {(preview?.updatedCharacter.spellSlots.length ?? 0) > 0 && (
                <div>
                  <p className="wiz-pick-head">
                    <span className="wiz-pick-label">
                      {t("levelUp.spellSlotsNewTotal")}
                    </span>
                  </p>
                  <div className="wiz-slot-ledger">
                    {(preview?.updatedCharacter.spellSlots ?? []).map((slot) => (
                      <div key={slot.level} className="vital">
                        <span className="v-num tnum">{slot.total}</span>
                        <span className="v-lbl">
                          {t("spells.level", { level: slot.level })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
            <LevelUpFeatureCards
              // The summary card above carries the PER-LEVEL slot ledger — the
              // coarser "N slots across M levels" change line is redundant.
              changes={changes.filter((c) => c.type !== "spellSlots")}
              locale={locale}
              hideAsi={needsAsi}
              // The engine preview can't know the subclass chosen mid-wizard —
              // its granted features join the reveal HERE (S10: everything
              // gained at this level, in one place).
              extraCards={
                needsSubclass && subclassChoice
                  ? subclassReveal(classId, subclassChoice, newClassLevel, locale)
                      .features
                  : []
              }
              renderChangeLine={renderChangeLine}
              labels={{
                newFeatures: t("levelUp.newFeatures"),
                spellSlots: t("levelUp.spellSlots"),
                scalingFeatures: t("levelUp.scalingFeatures"),
                profBonus: t("levelUp.profBonus"),
                showMore: t("common.showMore"),
                showLess: t("common.showLess"),
              }}
            />
            <p className="wiz-asks-quiet on-art flex items-center justify-center gap-1.5 text-center">
              <Camera className="h-3 w-3 flex-shrink-0" aria-hidden />
              {t("levelUp.snapshotNote")}
            </p>
          </div>
        )}
      </div>
    </WizardFrame>
  );
}

/** Feat ids the character already owns (origin + background + taken feats). */
function takenFeatIdSet(charData: CharacterData): ReadonlySet<string> {
  const set = new Set<string>();
  for (const f of charData.features) {
    if (!("custom" in f)) set.add(f.srdId);
  }
  if (charData.humanOriginFeat) set.add(charData.humanOriginFeat);
  if (charData.bgFeat) set.add(charData.bgFeat);
  return set;
}

// ─── HP step ──────────────────────────────────────────────────────────────────

function HpStep({
  avgHpGain,
  hitDie,
  useAverage,
  manualHpGain,
  onUseAverage,
  onManualHpGain,
  hpFrom,
  hpTo,
  fork,
}: {
  avgHpGain: number;
  hitDie: number;
  useAverage: boolean;
  manualHpGain: string;
  onUseAverage: (v: boolean) => void;
  onManualHpGain: (v: string) => void;
  hpFrom: number;
  hpTo: number;
  fork: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <>
      <section className="wiz-asi">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onUseAverage(true)}
            className={cn(
              "lvl-pick flex flex-1 flex-col items-center p-2.5 text-center",
              useAverage && "selected"
            )}
          >
            {/* B2 — the fork rewrites these numbers live: they MORPH, never snap. */}
            <MorphValue className="text-lg font-bold">{`+${avgHpGain}`}</MorphValue>
            <MorphValue className="text-[0.65rem]">
              {`${t("levelUp.average")} (d${hitDie})`}
            </MorphValue>
          </button>
          <span className="text-sm text-text-muted">{t("common.or")}</span>
          {/* The manual card SELECTS roll mode (seeding a starting value so the
              step is never left in an empty/invalid state — §15.7); the roll is
              entered by the NumberStepper + die faces BELOW, never inside this
              button (a NumberStepper's own −/+ buttons can't nest in a button). */}
          <button
            type="button"
            onClick={() => {
              onUseAverage(false);
              if (manualHpGain === "") onManualHpGain("1");
            }}
            className={cn(
              "lvl-pick flex flex-1 flex-col items-center p-2.5 text-center",
              !useAverage && "selected"
            )}
          >
            <span className="mb-1 text-[0.65rem]">{t("levelUp.manualRoll")}</span>
            <MorphValue className="text-lg font-bold">
              {!useAverage && manualHpGain !== "" ? `+${manualHpGain}` : "—"}
            </MorphValue>
          </button>
        </div>
        {/* §15.7 — the rolled value is entered by a clamped NumberStepper (type
            AND step, select-on-focus, no invalid/empty state) and, for a small
            die, is also one tap on any face; both write the same clamped state.
            Rendered only in roll mode, so the average path stays calm. */}
        {!useAverage && (
          <div className="mt-3 flex flex-col items-center gap-2">
            <NumberStepper
              value={manualHpGain === "" ? 1 : Number(manualHpGain)}
              onChange={(n) => onManualHpGain(String(n))}
              min={1}
              max={hitDie}
              digits={2}
              compact
              ariaLabel={t("levelUp.manualRoll")}
              decrementLabel={t("common.decrease")}
              incrementLabel={t("common.increase")}
            />
            <div
              role="group"
              aria-label={t("levelUp.manualRoll")}
              className="flex flex-wrap justify-center gap-1.5"
            >
              {Array.from({ length: hitDie }, (_, i) => i + 1).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => onManualHpGain(String(v))}
                  aria-pressed={manualHpGain === String(v)}
                  className={cn(
                    "lvl-pick tnum min-h-11 min-w-11 p-0 text-center text-sm font-bold",
                    manualHpGain === String(v) && "selected"
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        )}
        <p className="mt-2 text-center text-xs text-text-muted">
          <MorphValue>
            {t("levelUp.hpWillGain", { current: hpFrom, next: hpTo })}
          </MorphValue>
        </p>
      </section>
      {fork}
    </>
  );
}

// ─── #36 — the class fork gallery ─────────────────────────────────────────────

function ClassForkGallery({
  ownedEntries,
  newClassIds,
  filterReport,
  selectedClassId,
  locale,
  onPick,
}: {
  ownedEntries: ReadonlyArray<ClassEntry>;
  newClassIds: ReadonlyArray<string>;
  filterReport: MulticlassFilterReport | null;
  selectedClassId: string;
  locale: ReturnType<typeof asLocale>;
  onPick: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    // B3 (owner round 2) — the body rhythm (sp-6) separates this section.
    // fb3: the rubric breathes sp-5 ABOVE its cards (it was crowding them);
    // the air above it stays the body's sp-6. NO ad-hoc top margin.
    <section className="mx-auto w-full max-w-[900px] space-y-5">
      <p className="wiz-asks-head on-art justify-center">
        <Icon as={Sparkles} size="xs" decorative />
        {t("levelUp.advanceWhich")}
      </p>
      <PlaqueGrid label={t("levelUp.advanceWhich")}>
        {ownedEntries.map((entry) => {
          const Glyph = classRoleSeal(entry.classId).icon;
          const die = getClassTable(entry.classId)?.hitDie;
          return (
            <PlaqueCard
              key={entry.classId}
              glyph={<Icon as={Glyph} size="sm" decorative />}
              name={className(entry.classId, locale)}
              gloss={classTip(entry.classId, t)}
              eyebrow={t("levelUp.advanceTo", { level: entry.level + 1 })}
              badge={die ? `d${die}` : undefined}
              chosen={selectedClassId === entry.classId}
              onClick={() => onPick(entry.classId)}
            />
          );
        })}
        {newClassIds.map((id) => {
          const Glyph = classRoleSeal(id).icon;
          const die = getClassTable(id)?.hitDie;
          return (
            <PlaqueCard
              key={id}
              glyph={<Icon as={Glyph} size="sm" decorative />}
              name={className(id, locale)}
              gloss={classTip(id, t)}
              eyebrow={t("levelUp.newClassL1")}
              badge={die ? `d${die}` : undefined}
              chosen={selectedClassId === id}
              onClick={() => onPick(id)}
            />
          );
        })}
      </PlaqueGrid>
      {/* §2.7.3 — the classes the prerequisite filter HID, with their cause. */}
      {filterReport && (
        <MulticlassFilteredCause
          report={filterReport}
          eligibleCount={newClassIds.length}
          locale={locale}
        />
      )}
    </section>
  );
}

// ─── multiclass gains note ────────────────────────────────────────────────────

/** Tool-id → i18n key for the UMBRELLA multiclass entry-grant tools — an umbrella
 *  ("Musical Instrument of your choice") has its own choose-one phrasing that the
 *  bare equipment name doesn't carry. CONCRETE tools (`thieves-tools`,
 *  `tinkers-tools`) localize from the equipment catalogue by id (golden rules
 *  12 + 22), so only the umbrella needs a dedicated key. Weapon/armor
 *  proficiencies localize from their {@link ProficiencyToken} via the
 *  `proficiency` catalogue, not this map. */
const MC_GAIN_UMBRELLA_KEYS: Record<string, string> = {
  "musical-instrument": "wizard.gain_musicalInstrument",
};

function MulticlassGainsNote({
  classId,
  grants,
  locale,
}: {
  classId: string;
  grants: NonNullable<ReturnType<typeof multiclassEntryGrants>>;
  locale: ReturnType<typeof asLocale>;
}) {
  const { t } = useTranslation();
  const gains = [
    // Weapon/armor proficiencies localize from the `proficiency` catalogue by token.
    ...grants.weaponProficiencies.map((token) => proficiencyName(token, locale)),
    ...grants.armorTraining.map((token) => proficiencyName(token, locale)),
    // Tools carry stable IDS — a concrete tool localizes by id from the
    // equipment catalogue; an umbrella uses its dedicated choose-one phrasing.
    ...grants.toolProficiencies.map((id) => {
      const umbrellaKey = MC_GAIN_UMBRELLA_KEYS[id];
      return umbrellaKey ? t(umbrellaKey) : localizeSrd("equipment", id, "name", locale);
    }),
  ];
  if (gains.length === 0) return null;
  return (
    <p className="wiz-asks-quiet on-art text-center">
      {/* P2 — "Multiclassing" glosses itself (this note is the first place a
          player meets the concept). */}
      <Trans
        i18nKey="levelUp.multiclassGains"
        values={{ class: className(classId, locale), gains: gains.join(" · ") }}
        components={{
          g: <GlossaryTip term="multiclass" rubric={t("levelUp.multiclassing")} />,
        }}
      />
    </p>
  );
}

// ─── the ASI boon panel (+2 / +1+1) ───────────────────────────────────────────

/**
 * B4 — the ability picker on the point buy's CARVED CARTOUCHE family (one
 * design mind across both wizards): current score, the increase applied, the
 * LIVE modifier as the tile's hero, gold-selected state.
 */
function AsiBoonPanel({
  mode,
  abilityScores,
  choice,
  onChoice,
}: {
  mode: "plus2" | "plus1_1";
  abilityScores: Record<AbilityCode, number>;
  choice: AsiChoice;
  onChoice: (c: AsiChoice) => void;
}) {
  const { t } = useTranslation();

  function pickStat(stat: AbilityCode) {
    if (abilityScores[stat] >= 20) return;
    if (mode === "plus2") {
      onChoice({ ...choice, plusTwo: choice.plusTwo === stat ? null : stat });
    } else {
      if (choice.plusOneA === stat) {
        onChoice({ ...choice, plusOneA: choice.plusOneB, plusOneB: null });
      } else if (choice.plusOneB === stat) {
        onChoice({ ...choice, plusOneB: null });
      } else if (choice.plusOneA === null) {
        onChoice({ ...choice, plusOneA: stat });
      } else if (choice.plusOneB === null) {
        onChoice({ ...choice, plusOneB: stat });
      } else {
        onChoice({ ...choice, plusOneA: stat, plusOneB: null });
      }
    }
  }
  const isSelected = (stat: AbilityCode) =>
    mode === "plus2"
      ? choice.plusTwo === stat
      : choice.plusOneA === stat || choice.plusOneB === stat;
  const picked =
    mode === "plus2"
      ? choice.plusTwo
        ? 1
        : 0
      : (choice.plusOneA ? 1 : 0) + (choice.plusOneB ? 1 : 0);
  const limit = mode === "plus2" ? 1 : 2;

  return (
    <section className="wiz-asi wiz-asi-boon">
      <p className="wiz-pick-head">
        <span className="wiz-pick-label">
          {mode === "plus2" ? t("levelUp.asi.plus2") : t("levelUp.asi.plus1_1")}
        </span>
        <span className={cn("wiz-count tnum", picked >= limit && "full")}>
          {picked} / {limit}
        </span>
      </p>
      <WizardAsiCartouches
        abilityScores={abilityScores}
        bonusFor={() => (mode === "plus2" ? 2 : 1)}
        isSelected={isSelected}
        onPick={pickStat}
      />
    </section>
  );
}
