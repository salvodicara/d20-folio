/**
 * CreationWizard — character creation, mounted at `/characters/new`. Alt C:
 * Quick-Start + Guided Wizard.
 *
 * The wizard is a THIN ORCHESTRATOR: the creation DRAFT — what is legal, what
 * is missing, and the build that assembles `CharacterData` — lives in the core
 * (`lib/creation/`), held here through `useCreationDraft`; the wizard keeps only
 * UI state and the Firestore write, and it reads every SRD/locale-dependent
 * string from the `lib/views/creation-view` presenter (golden rules 5 + 7). The per-step
 * presentational components live under `features/creation/steps/`. The wizard
 * makes ZERO direct `[locale]` / LocaleText reads.
 *
 * Two paths, ONE build (switching between them keeps every pick):
 * - Quick Start (default): the whole character on one page, arriving PREFILLED
 *   from the class's ready-made build (`data/quickbuild.ts`) with a Randomize
 *   reroll; the live preview card closes the single centred column.
 * - Guided Wizard: step-by-step for new players (Class → Race → Background → … → Review).
 */

import { useState, useMemo, useCallback, useEffect, useRef, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useNavigate, useBlocker } from "react-router";
import { useConfirmStore, type ConfirmOptions } from "@/stores/confirmStore";
import { formatSpeed } from "@/lib/utils";
import { Input, NumberStepper } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Shuffle } from "lucide-react";
import { Select } from "@/components/shared/Select";
import { SearchField } from "@/components/shared/SearchField";
import { matchesSearch } from "@/lib/search";
import {
  WizardFrame,
  WizardChrome,
  WizardNav,
  WizardPaths,
  WizardForkTab,
  type WizardStepDef,
} from "@/features/wizard/chrome";
import { PlaqueCard, PlaqueGrid, WizardHero } from "@/features/wizard/gallery";
import { WizardFeatList } from "@/features/wizard/feat-list";
import { WizardSpellList, type SpellListSlot } from "@/features/wizard/spell-list";
import { WizardPointBuy } from "@/features/wizard/point-buy";
import { originFeatVMs } from "@/lib/views/feat-pick-view";
import { learnableSpellVMs } from "@/lib/views/spell-pick-view";
import { useAuthStore } from "@/stores/authStore";
import { useLocale } from "@/hooks/useLocale";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { asLocale } from "@/lib/locale";
import { createCharacter } from "@/lib/firestore";
import { SRD_BACKGROUNDS } from "@/data/backgrounds";
import { FEATS_BY_ID } from "@/data/feats";
import { ALIGNMENT_IDS } from "@/lib/lore-utils";
import { resolveGrantSourcesForFeatures } from "@/lib/resolve-grant-sources";
import {
  collectChoiceSlots,
  partitionChoiceSlotsBySource,
  hasAnyChoiceSlots,
  type ChoicePicks,
} from "@/lib/feature-choices";
import type { LanguageChoicePicks } from "@/lib/feat-language-choices";
import { ORIGIN_LANGUAGE_SLOTS, ORIGIN_LANGUAGE_SLOT_ID } from "@/lib/creation-choices";
import { QUICKBUILD_PRESETS } from "@/data/quickbuild";
import { cryptoRng, rollQuickbuildFlavor } from "@/lib/quickbuild-random";
import {
  activeCreationSteps,
  creationFacts,
  creationStepBlocked,
  missingCreationRequirements,
  type CreationRequirementKey,
} from "@/lib/creation/draft";
import type { AbilityScoreBonusMode } from "@/lib/creation/ability-bonus";
import { buildNewCharacter, type CreationBuildError } from "@/lib/creation/build";
import { FeatureChoicesSection } from "@/components/sheet/FeatureChoicesSection";
import { LanguageChoicePicker } from "@/components/sheet/LanguageChoicePicker";
import { GlossaryTip } from "@/components/shared/GlossaryTip";
import { FeatSpellChoicesPicker } from "@/components/sheet/FeatSpellChoicesPicker";
import type { AbilityCode } from "@/data/types";
import {
  raceOptions,
  backgroundOptions,
  subclassOptions,
  raceTraitPreview,
  lineageBundleVMs,
  classStartingEquipment,
  startingEquipmentOptions,
  className as presClassName,
  raceName as presRaceName,
  backgroundName as presBgName,
  featName,
  languageName,
  classTip,
  localizeSize,
} from "@/lib/views/creation-view";

// Step subcomponents (presentational; fed by the presenter).
import {
  GUIDED_STEPS,
  GUIDED_STEP_KEYS,
  type Mode,
  type GuidedStep,
} from "./steps/steps";
import { FormField } from "./steps/StepScaffold";
import { BgAsiPicker } from "./steps/AbilitiesStep";
import { EquipmentPickerSection } from "./steps/EquipmentStep";
import {
  CharacterPreviewCard,
  HpModeSelector,
  MissingRequirements,
  ReviewLedger,
  type ReviewLedgerRow,
} from "./steps/ReviewStep";
import { SkillsPickerSection } from "./steps/pickers";
import { ClassGallery, ClassPlaques } from "./steps/ClassGallery";
import { QuickChapter } from "./steps/QuickChapter";
import { useCreationDraft } from "./use-creation-draft";
import type { Locale } from "@/lib/locale";

// ─── Page ─────────────────────────────────────────────────────────────────────

/** The "what's left" label of each creation requirement. */
const REQUIREMENT_LABEL_KEYS: Record<CreationRequirementKey, string> = {
  name: "create.needName",
  class: "create.needClass",
  subclass: "create.needSubclass",
  lineage: "create.needLineage",
  humanFeat: "create.needHumanFeat",
  originFeat: "create.needOriginFeat",
  languages: "create.needLanguages",
  skills: "create.needSkills",
  spells: "create.needSpells",
  bgAsi: "create.needBgAsi",
};

/** The message of each reason a draft cannot be built yet. */
const BUILD_ERROR_KEYS: Record<CreationBuildError, string> = {
  name: "create.nameRequired",
  class: "create.classRequired",
  subclass: "create.subclassRequired",
};

export function CreationWizard() {
  const { t } = useTranslation();
  useDocumentTitle(t("create.title"));
  /** Translate a skill/tool name from English title-case to the current locale.
   *  A `useCallback` (not a hoisted declaration) so it is a stable, honest
   *  dependency of the `backgroundOptions` memo below — it closes over `t`. */
  const localizeSkill = useCallback(
    (skillName: string): string => {
      const key = skillName.toLowerCase().replace(/'/g, "").replace(/\s+/g, "-");
      return t(`skills.${key}`);
    },
    [t]
  );
  const { language } = useLocale();
  const locale = asLocale(language);
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  // UI state — the path, the page, the open chapters, the save in flight.
  const [mode, setMode] = useState<Mode>("quick");
  const [guidedStep, setGuidedStep] = useState<GuidedStep>("class");
  const [quickOpenSteps, setQuickOpenSteps] = useState<Set<GuidedStep>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The guided background gallery's find-as-you-type filter (60+ plaques).
  const [bgQuery, setBgQuery] = useState("");

  // FORM state — the creation draft (core: `lib/creation/draft.ts`). What is
  // legal, what is missing and the final build all derive from it there.
  const [draft, dispatch] = useCreationDraft();
  const facts = useMemo(() => creationFacts(draft), [draft]);
  const {
    name,
    classId: selectedClass,
    level,
    raceId: selectedRace,
    backgroundId: selectedBackground,
    subclassId: selectedSubclass,
    usePointBuy,
    abilityScores,
    bgAsiMode,
    bgAsiChoices,
    languagePicks,
    humanFeat,
    lineageChoices,
    alignment,
    classSkills: selectedClassSkills,
    cantrips: selectedCantrips,
    spells: selectedSpells,
    hpMethod: hpMode,
    rolledHp,
  } = draft;
  const {
    classTable,
    isHuman,
    subclassLevel,
    subclassDue: showSubclass,
    backgroundFeat: bgFeatSlug,
    backgroundSkillIds: bgSkillIds,
    classSkillPool,
    classSkillCount,
    cantripsNeeded,
    spellsNeeded,
    maxSpellLevel,
    isPreparedCaster,
    hasClassSpellPicks: showSpellStep,
    choicePicks: activeCreationChoicePicks,
    humanFeatSlots,
    otherChoiceSlots: creationRestSlots,
    classEquipLabel: effClassEquipLabel,
    bgEquipLabel: effBgEquipLabel,
    hasStartingEquipment,
    classToolChoice,
    bgToolChoice,
    sculpted,
  } = facts;
  const selectedBgData = facts.backgroundData;
  // The core's verdicts on the draft — computed once, up front.
  const missing = missingCreationRequirements(draft, facts);
  const stepBlocked = creationStepBlocked(draft, facts);
  const journeySteps = activeCreationSteps(facts);

  // A page turn starts at the TOP of the new page (owner 2026-06-11).
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [guidedStep, mode]);

  // ── Localized view-models (the ONLY locale reads — all via the presenter) ──
  const raceOptionVMs = useMemo(() => raceOptions(locale), [locale]);
  const bgOptionVMs = useMemo(
    () => backgroundOptions(locale, localizeSkill),
    [locale, localizeSkill]
  );
  const subclassVMs = useMemo(
    () => subclassOptions(selectedClass, locale),
    [selectedClass, locale]
  );
  // The gallery under the query — name (both locales), skills, and the origin
  // feat all match, so "Lucky" or "Percezione" finds its backgrounds too.
  const visibleBgOptionVMs = bgOptionVMs.filter((b) =>
    matchesSearch(
      bgQuery,
      b.label,
      b.searchEn,
      b.meta,
      featLabelForBackground(b.id, locale)
    )
  );
  const lineageBundles = useMemo(
    () => lineageBundleVMs(selectedRace, locale),
    [selectedRace, locale]
  );
  const traitPreview = useMemo(
    () => raceTraitPreview(selectedRace, locale),
    [selectedRace, locale]
  );

  // Display names — cheap pure presenter lookups.
  const classDisplay = classTable ? presClassName(selectedClass, locale) : "";
  const raceDisplay = facts.raceData ? presRaceName(selectedRace, locale) : "";
  const bgDisplay = selectedBgData ? presBgName(selectedBackground, locale) : "";
  const tipText = classTip(selectedClass, t);

  // Spell choices surface in the Spells step; the Review catch-all shows only the
  // NON-spell origin choices so a choice never appears twice in the same wizard.
  const reviewChoiceSlots = { ...creationRestSlots, spell: [] };

  // The starting-equipment option VMs — threaded with each source's tool-choice
  // context so the chosen-tool pack member shows the actual picked tool (or a
  // localized placeholder before a pick). The SAME contexts drive the build, so
  // preview and creation never drift.
  const classEquipVMs = classStartingEquipment(selectedClass, locale, classToolChoice);
  const bgEquipVMs = startingEquipmentOptions(
    facts.backgroundEquipmentOptions,
    locale,
    bgToolChoice
  );

  // Spell ids the character already owns from OTHER sources (class-selected
  // cantrips / leveled spells) — the feat spell pickers exclude these. MUST NOT
  // include the feat's own in-flight picks.
  const classSpellIds = useMemo(
    () => new Set<string>([...selectedCantrips, ...selectedSpells]),
    [selectedCantrips, selectedSpells]
  );

  // Name of the BACKGROUND feat driving the catch-all feat-choice pickers, so
  // the section can SAY where the choices come from. The Human Versatile feat
  // is NOT listed here — its choices render inline under its own picker.
  const originFeatNames = useMemo(() => {
    const names: string[] = [];
    for (const slug of [bgFeatSlug]) {
      if (slug && FEATS_BY_ID.has(slug)) names.push(featName(slug, locale));
    }
    return names;
  }, [bgFeatSlug, locale]);

  const featChoicesHint =
    originFeatNames.length > 0
      ? t("create.featChoicesHint", { feats: originFeatNames.join(" · ") })
      : "";

  // Computed preview values (the background ASI is live in every one).
  const classHitDie = facts.hitDie;
  const averageHP = facts.averageHp;
  const perLevelHpBonus = facts.hpBonus;
  const previewHP = facts.maxHp;
  const previewAC = facts.armorClass;
  const previewPB = facts.proficiencyBonus;
  const previewDC = facts.spellSaveDc;

  const handleCreate = useCallback(async () => {
    if (!user) return;
    const built = buildNewCharacter(draft, { displayName: user.displayName });
    if (!built.ok) {
      setError(t(BUILD_ERROR_KEYS[built.error]));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const docId = await createCharacter(user.uid, built.payload);
      // Land on the cockpit. Flag the leave-guard so this save doesn't prompt.
      finishingRef.current = true;
      void navigate(`/characters/${docId}`);
      window.scrollTo({ top: 0, left: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("character.failedCreate"));
      setSaving(false);
    }
  }, [user, draft, navigate, t]);

  // ── Leave-creation guard (A1) ───────────────────────────────────────────────
  // A half-built character is unsaved local state — but only once the player has
  // actually INVESTED something (typed a name, made a pick, moved a step). A
  // pristine wizard never blocks: browser back simply leaves (owner 2026-06-11).
  // The same blocker guards the in-chrome exit (which navigates) — ONE confirm seam.
  // The page ARRIVES with a complete build, so "invested" cannot mean "differs
  // from empty" any more: it means the player named the character, sculpted the
  // build away from what was handed to them (`sculpted`), added lore, or walked
  // into the guided journey.
  const dirty =
    name.trim().length > 0 ||
    (mode === "guided" && guidedStep !== "class") ||
    alignment !== "" ||
    sculpted;
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
  // stack a second dialog or orphan the first resolver).
  const confirmingRef = useRef(false);
  useEffect(() => {
    if (blocker.state !== "blocked" || confirmingRef.current) return;
    confirmingRef.current = true;
    let active = true;
    void useConfirmStore
      .getState()
      .confirm({
        title: t("create.leaveTitle"),
        message: t("create.leaveMessage"),
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
  // Browser-level leave (refresh / tab close) — the native prompt, dirty only.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (finishingRef.current) return;
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // ─── Create requirements (single source of truth: the core) ──────────────────
  // ONE list drives BOTH the disabled gate AND the "what's left to finish"
  // explainer, so the button and the message can never disagree.
  const missingRequirements = missing.map((r) => ({
    ...r,
    label: t(REQUIREMENT_LABEL_KEYS[r.key]),
  }));
  const canCreate = missingRequirements.length === 0;

  // The journey DERIVES from the class (golden rule 19) — the core decides which
  // steps exist; the orb row morphs to the new count via the chrome's keyed swap.
  const activeGuidedSteps: GuidedStep[] = journeySteps;

  // Guided step navigation.
  const currentStepIndex = activeGuidedSteps.indexOf(guidedStep);
  // A class swap can remove the CURRENT step from the journey — fold back to the
  // class step (render-adjust pattern; fires at most once per change).
  if (mode === "guided" && currentStepIndex === -1) {
    setGuidedStep("class");
  }

  const onLevelChange = (raw: number) => dispatch({ type: "setLevel", level: raw });
  const onClassChange = (classId: string) => dispatch({ type: "selectClass", classId });
  const onRaceChange = (raceId: string) => dispatch({ type: "selectRace", raceId });
  const changeBackground = (backgroundId: string) =>
    dispatch({ type: "selectBackground", backgroundId });
  const setSubclass = (subclassId: string) =>
    dispatch({ type: "setSubclass", subclassId });
  const setChoicePicks = (picks: ChoicePicks) =>
    dispatch({ type: "setChoicePicks", picks });
  const setLanguagePicks = (picks: LanguageChoicePicks) =>
    dispatch({ type: "setLanguagePicks", picks });
  const setAbilityScores = (scores: Record<AbilityCode, number>) =>
    dispatch({ type: "setAbilityScores", abilityScores: scores });
  const toggleClassSkill = (skillId: string) =>
    dispatch({ type: "toggleClassSkill", skillId });
  const toggleBgAsi = (code: AbilityCode) =>
    dispatch({ type: "toggleAbilityBonus", code });
  const switchBgAsiMode = (newMode: AbilityScoreBonusMode) =>
    dispatch({ type: "switchAbilityBonusMode", mode: newMode });
  const toggleClassSpell = (slotId: string, spellId: string, limit: number) =>
    dispatch({
      type: "toggleClassSpell",
      list: slotId === "cantrips" ? "cantrips" : "spells",
      spellId,
      limit,
    });
  const setClassEquipLabel = (label: string) =>
    dispatch({ type: "setClassEquipment", label });
  const setBgEquipLabel = (label: string) =>
    dispatch({ type: "setBackgroundEquipment", label });
  const setLineageChoice = (bundleKey: string, optionId: string) =>
    dispatch({ type: "setLineageChoice", bundleKey, optionId });

  /**
   * Replace the whole build — the two destructive acts on this page (choosing a
   * different class, rerolling the flavour) share ONE doctrine: a sheet that is
   * still the build it was handed is replaced silently, and a SCULPTED one asks
   * first. The typed name is never part of either.
   */
  function replaceBuild(prompt: ConfirmOptions, apply: () => void) {
    if (!sculpted) {
      apply();
      return;
    }
    void useConfirmStore
      .getState()
      .confirm({ cancelLabel: t("common.cancel"), ...prompt })
      .then((ok) => {
        if (ok) apply();
      });
  }

  /** The quick page's CLASS control: rebuild the sheet from that class's build. */
  function requestClassPrefill(classId: string) {
    const preset = QUICKBUILD_PRESETS[classId];
    // Every composed class carries a preset (quickbuild-presets.guard) — a
    // missing one is a data bug, never a path a player can reach.
    if (!preset) return;
    replaceBuild(
      {
        title: t("create.rebuildTitle", { class: presClassName(classId, locale) }),
        message: t("create.rebuildMessage"),
        confirmLabel: t("create.rebuildConfirm"),
      },
      () => dispatch({ type: "applyQuickbuild", classId, preset })
    );
  }

  /**
   * RANDOMIZE: keep the class currently on the sheet — whichever path chose it —
   * and draw the rest afresh from the composed pools. The roll produces a
   * preset, so it lands through the very same seam, complete by construction.
   * Not dice (golden rule 21): this draws a character at creation, never a roll
   * of the game.
   */
  function randomizeQuickbuild() {
    const preset = QUICKBUILD_PRESETS[selectedClass];
    if (!preset) return;
    replaceBuild(
      {
        title: t("create.rerollTitle"),
        message: t("create.rerollMessage"),
        confirmLabel: t("create.rerollConfirm"),
      },
      () =>
        dispatch({
          type: "applyQuickbuild",
          classId: selectedClass,
          preset: rollQuickbuildFlavor(selectedClass, preset, cryptoRng),
        })
    );
  }

  // The subclass <Select> — reused in quick mode + class step + review step.
  const subclassSelect = showSubclass && classTable && (
    <FormField label={t("create.subclassLabel", { level: subclassLevel })}>
      <Select
        aria-label={t("create.subclassLabel", { level: subclassLevel })}
        value={selectedSubclass}
        onChange={(e) => setSubclass(e.target.value)}
      >
        <option value="">{t("create.subclassPlaceholder")}</option>
        {subclassVMs.map((sc) => (
          <option key={sc.id} value={sc.id}>
            {sc.label}
          </option>
        ))}
      </Select>
    </FormField>
  );

  const alignmentSelect = (
    <Select
      aria-label={t("lore.alignment")}
      value={alignment}
      onChange={(e) => dispatch({ type: "setAlignment", alignment: e.target.value })}
    >
      <option value="">{t("lore.alignmentPlaceholder")}</option>
      {ALIGNMENT_IDS.map((id) => (
        <option key={id} value={id}>
          {t(`lore.alignments.${id}`)}
        </option>
      ))}
    </Select>
  );

  // ── wizard-F chrome derivations ───────────────────────────────────────────
  const stepDefs: WizardStepDef[] = activeGuidedSteps.map((id) => ({
    id,
    label: t(GUIDED_STEP_KEYS[id]),
  }));
  // P2 — the hints that carry a D&D term a first-timer stumbles on render via
  // <Trans> with an inline GlossaryTip slot (progressive disclosure: the rubric
  // stays one breath; the tap explains the term).
  const TITLES: Record<GuidedStep, [string, ReactNode]> = {
    class: [t("create.chooseClass"), t("create.hintClass")],
    race: [t("create.titleRace"), t("create.hintRace")],
    background: [
      t("create.titleBackground"),
      <Trans
        key="background"
        i18nKey="create.hintBackground"
        components={{
          g: <GlossaryTip term="feat" rubric={t("feats.category_origin")} />,
        }}
      />,
    ],
    languages: [t("create.titleLanguages"), t("create.hintLanguages")],
    skills: [t("create.titleSkills"), t("create.hintSkills")],
    spells: [
      t("create.titleSpells"),
      <Trans
        key="spells"
        i18nKey="create.hintSpells"
        components={{
          c: <GlossaryTip term="cantrip" rubric={t("spells.cantrips")} />,
          p: <GlossaryTip term="preparedSpells" rubric={t("spells.prepared")} />,
        }}
      />,
    ],
    equipment: [t("create.titleEquipment"), t("create.hintEquipment")],
    "bg-asi": [t("create.titleBgAsi"), t("create.hintBgAsi")],
    abilities: [
      t("create.titleAbilities"),
      <Trans
        key="abilities"
        i18nKey="create.hintAbilities"
        components={{ g: <GlossaryTip term="pointBuy" rubric={t("create.pointBuy")} /> }}
      />,
    ],
    review: [t("create.reviewHeading"), t("create.hintReview")],
  };
  const [stepTitle, stepHint] = TITLES[guidedStep];
  // The eyebrow gains the chosen identity as it solidifies (B's "Create a
  // Character · Human Soldier" line).
  const identityBits = [
    currentStepIndex > activeGuidedSteps.indexOf("race") ? raceDisplay : null,
    currentStepIndex > activeGuidedSteps.indexOf("background") ? bgDisplay : null,
  ]
    .filter(Boolean)
    .join(" ");
  const guidedEyebrow = identityBits
    ? `${t("create.title")} · ${identityBits}`
    : t("create.title");

  /** Per-step on-rails Next gate (review's CTA is the create button). */
  const stepNextDisabled = stepBlocked;

  // ── wizard-F shared pieces ────────────────────────────────────────────────
  const selectedRaceVM = raceOptionVMs.find((r) => r.id === selectedRace);

  // D — the origin-feat pool (lazy prose + memoized rows keep re-renders cheap).
  const originFeatPool = originFeatVMs(locale, new Set(bgFeatSlug ? [bgFeatSlug] : []));

  /** The Human Versatile origin-feat morph list (read-then-choose). The pool
   *  excludes the background's feat (origin feats are non-repeatable). */
  const humanFeatList = isHuman && (
    // C3 — the body rhythm (sp-6) separates this block; internal head→content
    // rhythm is sp-3.
    <div className="flex flex-col gap-3">
      <p className="wiz-asks-head on-art justify-center">
        {t("create.humanVersatileLabel")}
      </p>
      <p className="wiz-rubric on-art">{t("create.humanVersatileHint")}</p>
      <WizardFeatList
        feats={originFeatPool}
        chosenId={humanFeat || null}
        onChoose={(id) => dispatch({ type: "setHumanFeat", featId: id ?? "" })}
        asksFor={(featId) => {
          const slots =
            featId === humanFeat
              ? humanFeatSlots
              : partitionChoiceSlotsBySource(
                  collectChoiceSlots(resolveGrantSourcesForFeatures([{ srdId: featId }])),
                  featId
                ).caused;
          if (!hasAnyChoiceSlots(slots)) return null;
          const unstamped = {
            ...slots,
            spell: slots.spell.map((sl) => ({ ...sl, sourceId: undefined })),
          };
          return (
            <FeatureChoicesSection
              slots={unstamped}
              picks={activeCreationChoicePicks}
              onChange={setChoicePicks}
              existingSkillIds={new Set([...selectedClassSkills, ...bgSkillIds])}
              existingSpellIds={classSpellIds}
              proficientSkillIds={new Set([...selectedClassSkills, ...bgSkillIds])}
            />
          );
        }}
        searchPlaceholder={t("create.searchFeats")}
      />
    </div>
  );

  /** The class-spell slots for the read-then-Learn list (names eager, prose
   *  LAZY — a pick re-render costs name lookups only; D). */
  const spellListSlots: SpellListSlot[] = (() => {
    const slots: SpellListSlot[] = [];
    if (showSpellStep && cantripsNeeded > 0) {
      slots.push({
        id: "cantrips",
        label: t("spells.cantrips"),
        amount: cantripsNeeded,
        rubric: t("create.cantripsLabel"),
        pool: learnableSpellVMs(
          { classId: selectedClass, cantripsOnly: true, maxLevel: 0, exclude: new Set() },
          locale
        ),
      });
    }
    if (showSpellStep && spellsNeeded > 0) {
      slots.push({
        id: "spells",
        label: t("create.stepSpells"),
        amount: spellsNeeded,
        rubric: isPreparedCaster
          ? t("create.preparedSpellsLabel")
          : t("create.spellsKnownLabel"),
        pool: learnableSpellVMs(
          {
            classId: selectedClass,
            cantripsOnly: false,
            maxLevel: maxSpellLevel,
            exclude: new Set(),
          },
          locale
        ),
      });
    }
    return slots;
  })();

  // ── The review recap rows (§2.4) — each choice ATTRIBUTED to the step that
  // owns it, each row a one-tap jump back. Only steps with something chosen
  // (and still in the derived journey) appear — an empty row is noise.
  const reviewLedgerRows: ReviewLedgerRow[] = (() => {
    const dot = " · ";
    const subclassLabel = subclassVMs.find((sc) => sc.id === selectedSubclass)?.label;
    const lineageLabels = lineageBundles
      .map(
        (bdl) => bdl.options.find((o) => o.id === lineageChoices[bdl.bundleKey])?.label
      )
      .filter((x): x is string => !!x);
    const humanFeatLabel =
      isHuman && humanFeat && FEATS_BY_ID.has(humanFeat)
        ? featName(humanFeat, locale)
        : null;
    const pickedSpellNames = spellListSlots.flatMap((slot) => {
      const picked = slot.id === "cantrips" ? selectedCantrips : selectedSpells;
      return picked
        .map((id) => slot.pool.find((sp) => sp.id === id)?.name)
        .filter((n): n is string => !!n);
    });
    const boostValue = Object.entries(bgAsiChoices)
      .filter((e): e is [string, number] => !!e[1])
      .sort((x, y) => y[1] - x[1])
      .map(([code, n]) => `+${n} ${t(`abilities.${code}_short`)}`)
      .join(dot);
    const rows: ReviewLedgerRow[] = [
      {
        step: "class",
        label: t(GUIDED_STEP_KEYS.class),
        value: [classDisplay, subclassLabel].filter(Boolean).join(dot),
      },
      {
        step: "race",
        label: t(GUIDED_STEP_KEYS.race),
        value: [raceDisplay, ...lineageLabels, humanFeatLabel].filter(Boolean).join(dot),
      },
      {
        step: "background",
        label: t(GUIDED_STEP_KEYS.background),
        value: [bgDisplay, featLabelForBackground(selectedBackground, locale)]
          .filter(Boolean)
          .join(dot),
      },
      {
        step: "languages",
        label: t(GUIDED_STEP_KEYS.languages),
        value: (languagePicks[ORIGIN_LANGUAGE_SLOT_ID] ?? [])
          .map((id) => languageName(id, locale))
          .join(dot),
      },
      {
        step: "skills",
        label: t(GUIDED_STEP_KEYS.skills),
        value: [...bgSkillIds, ...selectedClassSkills]
          .map((id) => t(`skills.${id}`))
          .join(dot),
      },
      {
        step: "spells",
        label: t(GUIDED_STEP_KEYS.spells),
        value: pickedSpellNames.join(dot),
      },
      {
        step: "equipment",
        label: t(GUIDED_STEP_KEYS.equipment),
        value: [
          classEquipVMs.length > 0
            ? t("create.equipOption", { label: effClassEquipLabel })
            : null,
          bgEquipVMs.length > 0
            ? t("create.equipOption", { label: effBgEquipLabel })
            : null,
        ]
          .filter(Boolean)
          .join(dot),
      },
      {
        step: "bg-asi",
        label: t(GUIDED_STEP_KEYS["bg-asi"]),
        value: boostValue,
      },
    ];
    return rows.filter((r) => r.value !== "" && activeGuidedSteps.includes(r.step));
  })();

  // Quick Start is the same journey folded into progressive chapters. The
  // Guided gates and the final create requirements remain the only completion
  // facts; no second validation model is introduced here.
  const quickStepComplete = Object.fromEntries(
    GUIDED_STEPS.map((step) => [
      step,
      (step === "review" || !stepNextDisabled[step]) &&
        !missingRequirements.some(
          (item) => item.step === step && !(step === "class" && item.key === "name")
        ),
    ])
  ) as Record<GuidedStep, boolean>;

  function toggleQuickStep(step: GuidedStep) {
    setQuickOpenSteps((current) => {
      const next = new Set(current);
      if (next.has(step)) next.delete(step);
      else next.add(step);
      return next;
    });
  }

  function openQuickStep(step: GuidedStep) {
    setQuickOpenSteps((current) => new Set(current).add(step));
    document.getElementById(`quick-chapter-${step}-toggle`)?.focus();
  }

  function quickSummary(step: GuidedStep): string | undefined {
    return reviewLedgerRows.find((row) => row.step === step)?.value;
  }

  const lineageAsks =
    lineageBundles.length > 0 ? (
      <div className="space-y-3">
        {lineageBundles.map((b) => {
          const chosenOpt = lineageChoices[b.bundleKey];
          return (
            <div key={b.bundleKey}>
              <p className="wiz-asks-head mb-1.5">{b.label}</p>
              <div className="wiz-subclasses" role="group" aria-label={b.label}>
                {b.options.map((o) => (
                  <WizardForkTab
                    key={o.id}
                    active={chosenOpt === o.id}
                    onClick={() => setLineageChoice(b.bundleKey, o.id)}
                  >
                    {o.label}
                  </WizardForkTab>
                ))}
              </div>
              {!chosenOpt && (
                <p className="mt-1 text-xs text-warning">{t("create.lineageRequired")}</p>
              )}
            </div>
          );
        })}
      </div>
    ) : undefined;

  return (
    <WizardFrame
      paths={
        <WizardPaths
          mode={mode}
          // The two paths share ONE build: switching never resets anything.
          onMode={(m) => {
            setMode(m);
            if (m === "guided") setGuidedStep("class");
          }}
        />
      }
      nav={
        mode === "guided" ? (
          <WizardNav
            // Back is ALWAYS live: on the first step it exits to the roster
            // (the dirty-gated blocker confirms when something is invested).
            backLabel={
              currentStepIndex > 0
                ? t(GUIDED_STEP_KEYS[activeGuidedSteps[currentStepIndex - 1] ?? "class"])
                : t("wizard.exit")
            }
            nextLabel={
              guidedStep === "review"
                ? saving
                  ? t("create.submitting")
                  : t("create.submit")
                : t("wizard.continueTo", {
                    step: t(
                      GUIDED_STEP_KEYS[
                        activeGuidedSteps[currentStepIndex + 1] ?? "review"
                      ]
                    ),
                  })
            }
            // Phones show the bare destination — compact, never ellipsed.
            nextShort={
              guidedStep === "review"
                ? saving
                  ? t("create.submitting")
                  : t("create.submit")
                : t(GUIDED_STEP_KEYS[activeGuidedSteps[currentStepIndex + 1] ?? "review"])
            }
            onBack={() => {
              if (currentStepIndex > 0) {
                setGuidedStep(activeGuidedSteps[currentStepIndex - 1] ?? "class");
              } else {
                void navigate("/characters");
              }
            }}
            onNext={() => {
              if (guidedStep === "review") void handleCreate();
              else setGuidedStep(activeGuidedSteps[currentStepIndex + 1] ?? "review");
            }}
            nextDisabled={
              guidedStep === "review"
                ? saving || !canCreate
                : stepNextDisabled[guidedStep]
            }
            loading={guidedStep === "review" && saving}
            commit={guidedStep === "review"}
          />
        ) : (
          // Quick Start shares the same page-turn pager; back exits, the one
          // forward action is the create CTA.
          <WizardNav
            backLabel={t("wizard.exit")}
            onBack={() => void navigate("/characters")}
            nextLabel={saving ? t("create.submitting") : t("create.submit")}
            onNext={() => void handleCreate()}
            nextDisabled={saving || !canCreate}
            loading={saving}
            commit
          />
        )
      }
    >
      {mode === "quick" ? (
        // ──── QUICK START — a complete character, every choice on one page ───
        <>
          <WizardChrome
            steps={[]}
            current={0}
            eyebrow={t("create.quickStart")}
            title={t("create.title")}
            hint={t("wizard.quickGloss")}
          />
          <div className="quick-layout">
            <div className="quick-main">
              <FormField label={t("create.nameLabel")} required>
                <Input
                  type="text"
                  value={name}
                  onChange={(e) => dispatch({ type: "setName", name: e.target.value })}
                  placeholder={t("create.namePlaceholder")}
                  className="w-full"
                  autoFocus
                />
              </FormField>

              {/* Randomize affects the whole Quick Start build, so it stays in the
                  global quick controls instead of hiding inside the Class chapter. */}
              <div className="wiz-reroll flex items-center justify-end gap-3">
                <p className="on-art text-xs text-text-muted">
                  {t("create.randomizeHint")}
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={randomizeQuickbuild}
                  title={t("create.randomizeHint")}
                >
                  <Icon as={Shuffle} size="sm" decorative />
                  {t("create.randomize")}
                </Button>
              </div>

              <div className="quick-chapters">
                <QuickChapter
                  step="class"
                  title={t(GUIDED_STEP_KEYS.class)}
                  summary={quickSummary("class")}
                  complete={quickStepComplete.class}
                  open={!quickStepComplete.class || quickOpenSteps.has("class")}
                  onToggle={() => toggleQuickStep("class")}
                >
                  <FormField label={t("create.classLabel")}>
                    <ClassPlaques selected={selectedClass} onPick={requestClassPrefill} />
                  </FormField>
                  <div className="grid grid-cols-[96px_1fr] gap-3">
                    <FormField label={t("common.level")}>
                      <NumberStepper
                        value={level}
                        onChange={onLevelChange}
                        min={1}
                        max={20}
                        digits={2}
                        compact
                        ariaLabel={t("common.level")}
                        decrementLabel={t("common.decrease")}
                        incrementLabel={t("common.increase")}
                      />
                    </FormField>
                    {subclassSelect}
                  </div>
                </QuickChapter>

                <QuickChapter
                  step="race"
                  title={t(GUIDED_STEP_KEYS.race)}
                  summary={quickSummary("race")}
                  complete={quickStepComplete.race}
                  open={!quickStepComplete.race || quickOpenSteps.has("race")}
                  onToggle={() => toggleQuickStep("race")}
                >
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label={t("create.speciesLabel")}>
                      <Select
                        aria-label={t("create.speciesLabel")}
                        value={selectedRace}
                        onChange={(e) => onRaceChange(e.target.value)}
                      >
                        {raceOptionVMs.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.label}
                          </option>
                        ))}
                      </Select>
                    </FormField>
                    {lineageBundles.map((bundle) => (
                      <FormField key={bundle.bundleKey} label={bundle.label}>
                        <Select
                          aria-label={bundle.label}
                          value={lineageChoices[bundle.bundleKey] ?? ""}
                          onChange={(e) =>
                            setLineageChoice(bundle.bundleKey, e.target.value)
                          }
                        >
                          <option value="">{t("create.lineagePlaceholder")}</option>
                          {bundle.options.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.label}
                            </option>
                          ))}
                        </Select>
                      </FormField>
                    ))}
                  </div>
                  {humanFeatList}
                </QuickChapter>

                <QuickChapter
                  step="background"
                  title={t(GUIDED_STEP_KEYS.background)}
                  summary={quickSummary("background")}
                  complete={quickStepComplete.background}
                  open={!quickStepComplete.background || quickOpenSteps.has("background")}
                  onToggle={() => toggleQuickStep("background")}
                >
                  <FormField label={t("create.backgroundLabel")}>
                    <Select
                      aria-label={t("create.backgroundLabel")}
                      value={selectedBackground}
                      onChange={(e) => changeBackground(e.target.value)}
                    >
                      {bgOptionVMs.map((background) => (
                        <option key={background.id} value={background.id}>
                          {background.label}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                  <FormField label={t("lore.alignment")}>{alignmentSelect}</FormField>
                </QuickChapter>

                <QuickChapter
                  step="languages"
                  title={t(GUIDED_STEP_KEYS.languages)}
                  summary={quickSummary("languages")}
                  complete={quickStepComplete.languages}
                  open={!quickStepComplete.languages || quickOpenSteps.has("languages")}
                  onToggle={() => toggleQuickStep("languages")}
                >
                  <LanguageChoicePicker
                    slots={ORIGIN_LANGUAGE_SLOTS}
                    picks={languagePicks}
                    onChange={setLanguagePicks}
                  />
                </QuickChapter>

                {classSkillCount > 0 && (
                  <QuickChapter
                    step="skills"
                    title={t(GUIDED_STEP_KEYS.skills)}
                    summary={quickSummary("skills")}
                    complete={quickStepComplete.skills}
                    open={!quickStepComplete.skills || quickOpenSteps.has("skills")}
                    onToggle={() => toggleQuickStep("skills")}
                  >
                    <SkillsPickerSection
                      bgSkillIds={bgSkillIds}
                      classSkillPool={classSkillPool}
                      classSkillCount={classSkillCount}
                      selectedClassSkills={selectedClassSkills}
                      onToggle={toggleClassSkill}
                    />
                  </QuickChapter>
                )}

                {activeGuidedSteps.includes("spells") && (
                  <QuickChapter
                    step="spells"
                    title={t(GUIDED_STEP_KEYS.spells)}
                    summary={quickSummary("spells")}
                    complete={quickStepComplete.spells}
                    open={!quickStepComplete.spells || quickOpenSteps.has("spells")}
                    onToggle={() => toggleQuickStep("spells")}
                  >
                    {showSpellStep && spellListSlots.length > 0 && (
                      <WizardSpellList
                        slots={spellListSlots}
                        picks={{ cantrips: selectedCantrips, spells: selectedSpells }}
                        onToggle={toggleClassSpell}
                      />
                    )}
                    {creationRestSlots.spell.length > 0 && (
                      <FeatSpellChoicesPicker
                        slots={creationRestSlots.spell}
                        picks={activeCreationChoicePicks.spell}
                        onChange={(spell) =>
                          setChoicePicks({ ...activeCreationChoicePicks, spell })
                        }
                        existingSpellIds={classSpellIds}
                      />
                    )}
                  </QuickChapter>
                )}

                {hasStartingEquipment && (
                  <QuickChapter
                    step="equipment"
                    title={t(GUIDED_STEP_KEYS.equipment)}
                    summary={quickSummary("equipment")}
                    complete={quickStepComplete.equipment}
                    open={!quickStepComplete.equipment || quickOpenSteps.has("equipment")}
                    onToggle={() => toggleQuickStep("equipment")}
                  >
                    <EquipmentPickerSection
                      classOptions={classEquipVMs}
                      bgOptions={bgEquipVMs}
                      classChosen={effClassEquipLabel}
                      bgChosen={effBgEquipLabel}
                      onChooseClass={setClassEquipLabel}
                      onChooseBg={setBgEquipLabel}
                    />
                  </QuickChapter>
                )}

                <QuickChapter
                  step="bg-asi"
                  title={t(GUIDED_STEP_KEYS["bg-asi"])}
                  summary={quickSummary("bg-asi")}
                  complete={quickStepComplete["bg-asi"]}
                  open={!quickStepComplete["bg-asi"] || quickOpenSteps.has("bg-asi")}
                  onToggle={() => toggleQuickStep("bg-asi")}
                >
                  <BgAsiPicker
                    baseScores={abilityScores}
                    mode={bgAsiMode}
                    choices={bgAsiChoices}
                    abilityOptions={selectedBgData?.abilityOptions ?? []}
                    backgroundName={bgDisplay}
                    onSwitchMode={switchBgAsiMode}
                    onToggle={toggleBgAsi}
                    isValid={facts.abilityBonusValid}
                  />
                </QuickChapter>

                <QuickChapter
                  step="abilities"
                  title={t(GUIDED_STEP_KEYS.abilities)}
                  complete={quickStepComplete.abilities}
                  open={!quickStepComplete.abilities || quickOpenSteps.has("abilities")}
                  onToggle={() => toggleQuickStep("abilities")}
                >
                  <div
                    className="wiz-fork"
                    role="group"
                    aria-label={t("create.abilityMethod")}
                  >
                    <WizardForkTab
                      active={usePointBuy}
                      onClick={() =>
                        dispatch({ type: "setUsePointBuy", usePointBuy: true })
                      }
                    >
                      {t("create.pointBuy")}
                    </WizardForkTab>
                    <WizardForkTab
                      active={!usePointBuy}
                      onClick={() =>
                        dispatch({ type: "setUsePointBuy", usePointBuy: false })
                      }
                    >
                      {t("create.manual")}
                    </WizardForkTab>
                  </div>
                  <WizardPointBuy
                    scores={abilityScores}
                    boosts={bgAsiChoices}
                    onChange={setAbilityScores}
                    manual={!usePointBuy}
                  />
                </QuickChapter>

                <QuickChapter
                  step="review"
                  title={t(GUIDED_STEP_KEYS.review)}
                  complete={quickStepComplete.review}
                  open={!quickStepComplete.review || quickOpenSteps.has("review")}
                  onToggle={() => toggleQuickStep("review")}
                >
                  {hasAnyChoiceSlots(reviewChoiceSlots) && (
                    <FormField label={t("levelUp.featureChoices")}>
                      {featChoicesHint && (
                        <p className="on-art mb-2 text-xs text-text-muted">
                          {featChoicesHint}
                        </p>
                      )}
                      <FeatureChoicesSection
                        slots={reviewChoiceSlots}
                        picks={activeCreationChoicePicks}
                        onChange={setChoicePicks}
                        existingSkillIds={
                          new Set([...selectedClassSkills, ...bgSkillIds])
                        }
                        existingSpellIds={classSpellIds}
                        proficientSkillIds={
                          new Set([...selectedClassSkills, ...bgSkillIds])
                        }
                      />
                    </FormField>
                  )}
                  <FormField label={t("create.hpLabel")}>
                    <HpModeSelector
                      mode={hpMode}
                      onModeChange={(method) => dispatch({ type: "setHpMethod", method })}
                      rolledHp={rolledHp}
                      onRolledHpChange={(hp) =>
                        dispatch({ type: "setRolledHp", rolledHp: hp })
                      }
                      averageHp={averageHP}
                      hpBonus={perLevelHpBonus}
                      hitDie={classHitDie}
                      level={level}
                    />
                  </FormField>
                </QuickChapter>
              </div>
            </div>

            <aside className="quick-aside" aria-label={t("common.reviewChoices")}>
              <CharacterPreviewCard
                name={name}
                className={classDisplay}
                raceName={raceDisplay}
                bgName={bgDisplay}
                level={level}
                hp={previewHP}
                ac={previewAC}
                pb={previewPB}
                dc={previewDC}
                hitDie={classTable?.hitDie ?? 8}
                classId={selectedClass}
                tip={tipText}
                savingThrows={classTable?.savingThrows ?? []}
              />
              <ReviewLedger rows={reviewLedgerRows} onJump={openQuickStep} />
              {error && <p className="text-sm text-error">{error}</p>}
              {!saving && (
                <MissingRequirements items={missingRequirements} onJump={openQuickStep} />
              )}
            </aside>
          </div>
        </>
      ) : (
        // ──── GUIDED — one decision at a time, wizard-F chrome ──────────────
        <>
          <WizardChrome
            steps={stepDefs}
            current={currentStepIndex}
            eyebrow={guidedEyebrow}
            title={stepTitle}
            hint={stepHint}
            onStepClick={(i) => setGuidedStep(activeGuidedSteps[i] ?? "class")}
            freeJump
          />

          <div className="wiz-body">
            {guidedStep === "class" && (
              <>
                <div className="mx-auto grid w-full max-w-[640px] grid-cols-[1fr_96px] gap-3">
                  <FormField label={t("create.nameLabel")} required>
                    <Input
                      type="text"
                      value={name}
                      onChange={(e) =>
                        dispatch({ type: "setName", name: e.target.value })
                      }
                      placeholder={t("create.namePlaceholder")}
                      className="w-full"
                    />
                  </FormField>
                  <FormField label={t("common.level")}>
                    <NumberStepper
                      value={level}
                      onChange={onLevelChange}
                      min={1}
                      max={20}
                      digits={2}
                      compact
                      ariaLabel={t("common.level")}
                      decrementLabel={t("common.decrease")}
                      incrementLabel={t("common.increase")}
                    />
                  </FormField>
                </div>
                <ClassGallery
                  level={level}
                  selectedClass={selectedClass}
                  selectedSubclass={selectedSubclass}
                  onPickClass={onClassChange}
                  onPickSubclass={setSubclass}
                />
              </>
            )}

            {guidedStep === "race" && (
              <>
                {selectedRaceVM && (
                  <WizardHero
                    eyebrow={`${formatSpeed(String(selectedRaceVM.speed), locale)} · ${localizeSize(selectedRaceVM.size, t)}`}
                    name={selectedRaceVM.label}
                    glyph={
                      <span className="font-display text-xl">
                        {selectedRaceVM.label.charAt(0)}
                      </span>
                    }
                    body={
                      traitPreview ? (
                        <ul className="space-y-0.5 text-sm text-text-secondary">
                          {traitPreview.traits.map((tr) => (
                            <li key={tr}>• {tr}</li>
                          ))}
                        </ul>
                      ) : null
                    }
                    asksHead={lineageAsks ? t("wizard.asksMore") : undefined}
                    asks={lineageAsks}
                  />
                )}
                <PlaqueGrid label={t("create.speciesLabel")}>
                  {raceOptionVMs.map((r) => (
                    <PlaqueCard
                      key={r.id}
                      name={r.label}
                      eyebrow={`${formatSpeed(String(r.speed), locale)} · ${localizeSize(r.size, t)}`}
                      chosen={r.id === selectedRace}
                      onClick={() => onRaceChange(r.id)}
                    />
                  ))}
                </PlaqueGrid>
                {humanFeatList}
              </>
            )}

            {guidedStep === "background" && (
              <>
                {/* 60+ backgrounds — unlike the small class/species pools, this
                    gallery earns the ONE shared search (bilingual + accent-
                    insensitive; the EN name is always an anchor). */}
                <SearchField
                  className="wiz-search self-center"
                  value={bgQuery}
                  onChange={setBgQuery}
                  placeholder={t("create.searchBackgrounds")}
                />
                <PlaqueGrid label={t("create.backgroundLabel")}>
                  {visibleBgOptionVMs.map((b) => (
                    <PlaqueCard
                      key={b.id}
                      name={b.label}
                      gloss={b.meta}
                      eyebrow={featLabelForBackground(b.id, locale)}
                      chosen={b.id === selectedBackground}
                      onClick={() => changeBackground(b.id)}
                    />
                  ))}
                </PlaqueGrid>
                {visibleBgOptionVMs.length === 0 && (
                  <p className="wiz-empty">{t("common.noResults")}</p>
                )}
                <div className="mx-auto w-full max-w-[420px]">
                  <FormField label={t("lore.alignment")}>{alignmentSelect}</FormField>
                </div>
              </>
            )}

            {guidedStep === "languages" && (
              <div className="mx-auto w-full max-w-[640px]">
                <LanguageChoicePicker
                  slots={ORIGIN_LANGUAGE_SLOTS}
                  picks={languagePicks}
                  onChange={setLanguagePicks}
                />
              </div>
            )}

            {guidedStep === "skills" && (
              <div className="mx-auto w-full max-w-[640px]">
                <SkillsPickerSection
                  bgSkillIds={bgSkillIds}
                  classSkillPool={classSkillPool}
                  classSkillCount={classSkillCount}
                  selectedClassSkills={selectedClassSkills}
                  onToggle={toggleClassSkill}
                />
              </div>
            )}

            {guidedStep === "spells" && (
              <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6">
                {showSpellStep && spellListSlots.length > 0 && (
                  <WizardSpellList
                    slots={spellListSlots}
                    picks={{ cantrips: selectedCantrips, spells: selectedSpells }}
                    onToggle={toggleClassSpell}
                  />
                )}
                {creationRestSlots.spell.length > 0 && (
                  <div>
                    {featChoicesHint && (
                      <p className="on-art mb-2 text-xs text-text-muted">
                        {featChoicesHint}
                      </p>
                    )}
                    <FeatSpellChoicesPicker
                      slots={creationRestSlots.spell}
                      picks={activeCreationChoicePicks.spell}
                      onChange={(spell) =>
                        setChoicePicks({ ...activeCreationChoicePicks, spell })
                      }
                      existingSpellIds={classSpellIds}
                    />
                  </div>
                )}
                {!showSpellStep && creationRestSlots.spell.length === 0 && (
                  <p className="on-art text-center text-sm text-text-muted">
                    {t("create.noSpellsAtLevel")}
                  </p>
                )}
              </div>
            )}

            {guidedStep === "equipment" && (
              <div className="mx-auto w-full max-w-[640px]">
                {hasStartingEquipment ? (
                  <EquipmentPickerSection
                    classOptions={classEquipVMs}
                    bgOptions={bgEquipVMs}
                    classChosen={effClassEquipLabel}
                    bgChosen={effBgEquipLabel}
                    onChooseClass={setClassEquipLabel}
                    onChooseBg={setBgEquipLabel}
                  />
                ) : (
                  <p className="on-art text-center text-sm text-text-muted">
                    {t("create.noEquipment")}
                  </p>
                )}
              </div>
            )}

            {guidedStep === "bg-asi" && (
              <div className="mx-auto w-full max-w-[640px]">
                <BgAsiPicker
                  baseScores={abilityScores}
                  mode={bgAsiMode}
                  choices={bgAsiChoices}
                  abilityOptions={selectedBgData?.abilityOptions ?? []}
                  backgroundName={bgDisplay}
                  onSwitchMode={switchBgAsiMode}
                  onToggle={toggleBgAsi}
                  isValid={facts.abilityBonusValid}
                />
              </div>
            )}

            {guidedStep === "abilities" && (
              <div className="mx-auto flex w-full max-w-[780px] flex-col gap-3">
                <div
                  className="wiz-fork justify-center"
                  role="group"
                  aria-label={t("create.abilityMethod")}
                >
                  <WizardForkTab
                    active={usePointBuy}
                    onClick={() =>
                      dispatch({ type: "setUsePointBuy", usePointBuy: true })
                    }
                  >
                    {t("create.pointBuy")}
                  </WizardForkTab>
                  <WizardForkTab
                    active={!usePointBuy}
                    onClick={() =>
                      dispatch({ type: "setUsePointBuy", usePointBuy: false })
                    }
                  >
                    {t("create.manual")}
                  </WizardForkTab>
                </div>
                <WizardPointBuy
                  scores={abilityScores}
                  boosts={bgAsiChoices}
                  onChange={setAbilityScores}
                  manual={!usePointBuy}
                />
              </div>
            )}

            {guidedStep === "review" && (
              <div className="mx-auto flex w-full max-w-[640px] flex-col gap-6">
                <CharacterPreviewCard
                  name={name}
                  className={classDisplay}
                  raceName={raceDisplay}
                  bgName={bgDisplay}
                  level={level}
                  hp={previewHP}
                  ac={previewAC}
                  pb={previewPB}
                  dc={previewDC}
                  hitDie={classTable?.hitDie ?? 8}
                  classId={selectedClass}
                  tip={tipText}
                  savingThrows={classTable?.savingThrows ?? []}
                />
                {/* The recap ledger — every choice attributed to its step
                    (§2.4), each row one tap back to where it was made. */}
                <ReviewLedger rows={reviewLedgerRows} onJump={setGuidedStep} />
                {/* Level, subclass, alignment tuning in review step */}
                <div className="grid grid-cols-2 gap-3">
                  <FormField label={t("common.level")}>
                    <NumberStepper
                      value={level}
                      onChange={onLevelChange}
                      min={1}
                      max={20}
                      digits={2}
                      compact
                      ariaLabel={t("common.level")}
                      decrementLabel={t("common.decrease")}
                      incrementLabel={t("common.increase")}
                    />
                  </FormField>
                  <FormField label={t("lore.alignment")}>{alignmentSelect}</FormField>
                </div>
                {showSubclass && classTable && <div>{subclassSelect}</div>}
                <FormField label={t("create.hpLabel")}>
                  <HpModeSelector
                    mode={hpMode}
                    onModeChange={(method) => dispatch({ type: "setHpMethod", method })}
                    rolledHp={rolledHp}
                    onRolledHpChange={(hp) =>
                      dispatch({ type: "setRolledHp", rolledHp: hp })
                    }
                    averageHp={averageHP}
                    hpBonus={perLevelHpBonus}
                    hitDie={classHitDie}
                    level={level}
                  />
                </FormField>
                {/* D19 — non-spell origin feat choices in review so `canCreate`
                    can be satisfied for choice-feat backgrounds. */}
                {hasAnyChoiceSlots(reviewChoiceSlots) && (
                  <FormField label={t("levelUp.featureChoices")}>
                    {featChoicesHint && (
                      <p className="on-art mb-2 text-xs text-text-muted">
                        {featChoicesHint}
                      </p>
                    )}
                    <FeatureChoicesSection
                      slots={reviewChoiceSlots}
                      picks={activeCreationChoicePicks}
                      onChange={setChoicePicks}
                      existingSkillIds={new Set([...selectedClassSkills, ...bgSkillIds])}
                      existingSpellIds={classSpellIds}
                      proficientSkillIds={
                        new Set([...selectedClassSkills, ...bgSkillIds])
                      }
                    />
                  </FormField>
                )}
                {error && <p className="text-sm text-error">{error}</p>}
                {!saving && (
                  <MissingRequirements
                    items={missingRequirements}
                    onJump={setGuidedStep}
                  />
                )}
              </div>
            )}
          </div>
        </>
      )}
    </WizardFrame>
  );
}

/** The background's granted origin-feat label (the plaque eyebrow). */
function featLabelForBackground(bgId: string, locale: Locale): string {
  const slug = SRD_BACKGROUNDS.find((b) => b.id === bgId)?.feat ?? "";
  return slug && FEATS_BY_ID.has(slug) ? featName(slug, locale) : "";
}
