/**
 * CreationWizard — character creation, mounted at `/characters/new`. Alt C:
 * Quick-Start + Guided Wizard.
 *
 * R6+R3 SLICE 3 — the wizard is a THIN ORCHESTRATOR: it owns the creation state +
 * `handleCreate` (the one place that assembles `CharacterData` and writes
 * Firestore), and it reads every SRD/locale-dependent string from the
 * `lib/views/creation-view` presenter (golden rules 5 + 7). The per-step
 * presentational components live under `features/creation/steps/`. The wizard
 * makes ZERO direct `[locale]` / BiText reads.
 *
 * Two modes:
 * - Quick Start (default): all fields visible at once, live preview card on right.
 * - Guided Wizard: step-by-step for new players (Class → Race → Background → … → Review).
 */

import { useState, useMemo, useCallback, useEffect, useRef, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useNavigate, useBlocker } from "react-router";
import { useConfirmStore } from "@/stores/confirmStore";
import { formatSpeed } from "@/lib/utils";
import { Input, NumberStepper } from "@/components/ui/input";
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
import { togglePick } from "@/features/wizard/pick-utils";
import { originFeatVMs } from "@/lib/views/feat-pick-view";
import { learnableSpellVMs } from "@/lib/views/spell-pick-view";
import { useAuthStore } from "@/stores/authStore";
import { useLocale } from "@/hooks/useLocale";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { asLocale } from "@/lib/locale";
import { createCharacter } from "@/lib/firestore";
import { classTables, getFeaturesAtLevel } from "@/data/classes";
import { SRD_RACES } from "@/data/races";
import { asRaceId } from "@/data/srd-names";
import { SRD_BACKGROUNDS, getBackgroundEquipmentOptions } from "@/data/backgrounds";
import {
  resolveStartingEquipment,
  type ToolChoiceContext,
} from "@/data/background-equipment";
import { FEATS_BY_ID } from "@/data/feats";
import { buildGrantedFeatures } from "@/lib/character-build";
import {
  proficiencyBonus,
  abilityModifier,
  skillNameToId,
  calculateMaxHP,
} from "@/lib/compute";
import { ALIGNMENT_IDS, asAlignmentId } from "@/lib/lore-utils";
import { nonEmptyString } from "@/lib/non-empty-string";
import type {
  SessionState,
  CharacterData,
  SrdWeaponRef,
  SrdEquipmentRef,
  CustomEquipment,
  SrdSpellRef,
  CustomSpell,
} from "@/types/character";
import {
  injectExpandedSpells,
  getExpandedSpellsThroughLevel,
  getAlwaysPreparedFromGrants,
} from "@/lib/expanded-spells";
import {
  resolveGrantSourcesForFeatures,
  resolveGrantSourcesForClass,
  resolveGrantSourcesForBackground,
  toolChoiceContextForClass,
  toolChoiceContextForBackground,
} from "@/lib/resolve-grant-sources";
import { subclassSpellcastingState } from "@/lib/subclass-spellcasting";
import {
  collectChoiceSlots,
  partitionChoiceSlotsBySource,
  pruneChoicePicks,
  isAllChoicesComplete,
  applyChoicePicks,
  hasAnyChoiceSlots,
  EMPTY_CHOICE_PICKS,
  type ChoicePicks,
} from "@/lib/feature-choices";
import { isSpellChoicesComplete } from "@/lib/feat-spell-choices";
import { FeatureChoicesSection } from "@/components/sheet/FeatureChoicesSection";
import { GlossaryTip } from "@/components/shared/GlossaryTip";
import { FeatSpellChoicesPicker } from "@/components/sheet/FeatSpellChoicesPicker";
import type { AbilityCode, BackgroundEquipmentOption } from "@/data/types";
import { getEquipment } from "@/data/equipment";
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
  classTip,
  localizeSize,
} from "@/lib/views/creation-view";

// Step subcomponents (presentational; fed by the presenter).
import {
  GUIDED_STEPS,
  GUIDED_STEP_KEYS,
  ABILITY_CODES,
  pointBuyCost,
  POINT_BUY_BUDGET,
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

// ─── Starting equipment → character ──────────────────────────────────────────

/**
 * Mark an equipment ref as WORN if it's an armor/shield row, so the new
 * character's AC is right immediately (matching the inventory add-item picker).
 * SRD-backed refs only — name-only / custom rows are always carried.
 */
function withArmorEquipped(
  ref: SrdEquipmentRef | CustomEquipment
): SrdEquipmentRef | CustomEquipment {
  if ("custom" in ref) return ref;
  const srd = getEquipment(ref.srdId);
  if (srd?.category === "armor" || srd?.category === "shield") {
    return { ...ref, equipped: true };
  }
  return ref;
}

/**
 * Resolve + MERGE the chosen class and background starting-equipment packages
 * into the new character's weapons / equipment / starting gold. The single
 * source-agnostic resolver (`resolveStartingEquipment`) does the item routing
 * (weapon → `weapons`, everything else → `equipment`, unresolvable id → labelled
 * custom row) and the gold; this just concatenates the two sources and marks
 * armor worn. `classToolChoice` / `bgToolChoice` resolve each source's own
 * chosen-tool pack member (the Monk/Bard class `fromToolChoice`; the
 * "Choose one kind of <X>" background's "(same as above)" `fromToolChoice`) to the
 * player's picked tool — the SAME expansion the wizard preview uses, so each tool
 * lands EXACTLY once and matches what the preview showed (golden rule 6 — no
 * separate append, no double-add). Each context is keyed to its own source's grant,
 * so the class tool and the background tool never cross-resolve.
 */
function mergeStartingEquipment(
  classOptions: ReadonlyArray<BackgroundEquipmentOption>,
  classLabel: string,
  bgOptions: ReadonlyArray<BackgroundEquipmentOption>,
  bgLabel: string,
  classToolChoice: ToolChoiceContext | undefined,
  bgToolChoice: ToolChoiceContext | undefined
): {
  weapons: SrdWeaponRef[];
  equipment: (SrdEquipmentRef | CustomEquipment)[];
  gold: number;
} {
  const cls = resolveStartingEquipment(classOptions, classLabel, classToolChoice);
  const bg = resolveStartingEquipment(bgOptions, bgLabel, bgToolChoice);
  return {
    weapons: [...cls.weapons, ...bg.weapons],
    equipment: [...cls.equipment, ...bg.equipment].map(withArmorEquipped),
    gold: cls.gold + bg.gold,
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

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

  const [mode, setMode] = useState<Mode>("quick");
  const [guidedStep, setGuidedStep] = useState<GuidedStep>("class");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [selectedClass, setSelectedClass] = useState("fighter");
  const [level, setLevel] = useState(1);
  const [selectedRace, setSelectedRace] = useState("human");
  const [selectedBackground, setSelectedBackground] = useState("acolyte");
  const [selectedSubclass, setSelectedSubclass] = useState("");
  const [usePointBuy, setUsePointBuy] = useState(true);
  const [abilityScores, setAbilityScores] = useState<Record<AbilityCode, number>>({
    STR: 10,
    DEX: 10,
    CON: 10,
    INT: 10,
    WIS: 10,
    CHA: 10,
  });
  const [bgAsiMode, setBgAsiMode] = useState<"+2/+1" | "+1/+1/+1">("+2/+1");
  const [bgAsiChoices, setBgAsiChoices] = useState<Partial<Record<AbilityCode, number>>>(
    {}
  );
  const [humanFeat, setHumanFeat] = useState("");
  // Creation-time lineage choice (Elven / Gnomish lineage); bundleKey → optionId.
  const [lineageChoices, setLineageChoices] = useState<Record<string, string>>({});
  // L3 — unified origin-feat choices (Human Versatile + background feat) in one
  // ChoicePicks keyed by SOURCE+kind-namespaced slot id.
  const [creationChoicePicks, setCreationChoicePicks] =
    useState<ChoicePicks>(EMPTY_CHOICE_PICKS);
  const [alignment, setAlignment] = useState("");
  // The guided background gallery's find-as-you-type filter (60+ plaques).
  const [bgQuery, setBgQuery] = useState("");
  const [selectedClassSkills, setSelectedClassSkills] = useState<string[]>([]);
  const [selectedCantrips, setSelectedCantrips] = useState<string[]>([]);
  const [selectedSpells, setSelectedSpells] = useState<string[]>([]);
  // The chosen starting-equipment option per source — the 2024 "Choose A or B"
  // fork (default "A", the suggested gear package). TWO independent decisions:
  // the class package and the background package.
  const [classEquipLabel, setClassEquipLabel] = useState("A");
  const [bgEquipLabel, setBgEquipLabel] = useState("A");
  const [hpMode, setHpMode] = useState<"average" | "rolled">("average");
  const [rolledHp, setRolledHp] = useState<number | null>(null);

  // ── Leave-creation guard (A1) ───────────────────────────────────────────────
  // A half-built character is unsaved local state — but only once the player has
  // actually INVESTED something (typed a name, made a pick, moved a step). A
  // pristine wizard never blocks: browser back simply leaves (owner 2026-06-11).
  // The same blocker guards the in-chrome exit (which navigates) — ONE confirm seam.
  const dirty =
    name.trim().length > 0 ||
    (mode === "guided" && guidedStep !== "class") ||
    selectedClass !== "fighter" ||
    selectedRace !== "human" ||
    selectedBackground !== "acolyte" ||
    level !== 1 ||
    selectedSubclass !== "" ||
    alignment !== "" ||
    humanFeat !== "" ||
    selectedClassSkills.length > 0 ||
    selectedCantrips.length > 0 ||
    selectedSpells.length > 0 ||
    Object.keys(lineageChoices).length > 0 ||
    Object.keys(bgAsiChoices).length > 0;
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

  // A page turn starts at the TOP of the new page (owner 2026-06-11).
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [guidedStep, mode]);

  const isHuman = selectedRace === "human";

  const classTable = classTables.find((c) => c.id === selectedClass);
  const selectedRaceData = SRD_RACES.find((r) => r.id === selectedRace);
  const selectedBgData = SRD_BACKGROUNDS.find((b) => b.id === selectedBackground);
  const subclassLevel = classTable?.subclassLevel ?? 3;
  const showSubclass = level >= subclassLevel && (classTable?.subclasses.length ?? 0) > 0;

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
  // The starting-equipment option VMs are built BELOW, after the tool picks are
  // resolved — BOTH the CLASS fork (Monk/Bard `fromToolChoice`) AND the BACKGROUND
  // fork ("Choose one kind of <X>" → "(same as above)" `fromToolChoice`) thread
  // their own tool-choice context so the chosen instrument/set shows in the preview.

  // Display names — cheap pure presenter lookups (no memo; matches the prior
  // inline `loc(...)` pattern, and React Compiler can't memo over a `.find()` const).
  const classDisplay = classTable ? presClassName(selectedClass, locale) : "";
  const raceDisplay = selectedRaceData ? presRaceName(selectedRace, locale) : "";
  const bgDisplay = selectedBgData ? presBgName(selectedBackground, locale) : "";
  const tipText = classTip(selectedClass, t);

  // Point-buy tracking
  const pointsSpent = useMemo(
    () => ABILITY_CODES.reduce((sum, code) => sum + pointBuyCost(abilityScores[code]), 0),
    [abilityScores]
  );
  const pointsRemaining = POINT_BUY_BUDGET - pointsSpent;

  // Effective scores = base + background ASI choices (previews + final save).
  const effectiveScores = useMemo<Record<AbilityCode, number>>(() => {
    const result = { ...abilityScores };
    for (const [code, bonus] of Object.entries(bgAsiChoices)) {
      // B19 — a background ASI can raise a score TO 20 but never past it (the
      // 2024 cap; matches the level-up ASI treatment). The clamp is reachable
      // via Manual entry — a base 19 receiving a +2 must land on 20, not 21.
      if (bonus)
        result[code as AbilityCode] = Math.min(20, result[code as AbilityCode] + bonus);
    }
    return result;
  }, [abilityScores, bgAsiChoices]);

  // Background ASI validity.
  const bgAsiIsValid = useMemo(() => {
    const entries = Object.entries(bgAsiChoices).filter(([, v]) => v && v > 0);
    if (bgAsiMode === "+2/+1") {
      return (
        entries.length === 2 &&
        entries.some(([, v]) => v === 2) &&
        entries.some(([, v]) => v === 1)
      );
    }
    return entries.length === 3 && entries.every(([, v]) => v === 1);
  }, [bgAsiMode, bgAsiChoices]);

  // Skill proficiency computation.
  const bgSkillIds = useMemo<string[]>(
    () =>
      (selectedBgData?.skillProficiencies ?? [])
        .map(skillNameToId)
        .filter((id): id is string => id !== null),
    [selectedBgData]
  );

  // L3 — every pending `choice-*` decision the new character's sources confer,
  // via the unified choice engine: the origin feats (Human Versatile + background
  // feat) PLUS the class/subclass features gained THROUGH the starting level —
  // so a character created at L2+ is offered the same choices (Scholar expertise,
  // College of Lore's bonus proficiencies, School Savant's free spellbook spells,
  // …) the level-up wizard would have surfaced on the way. Slot ids are
  // namespaced per source; pruned to the live slot set.
  //
  // A2 — the class's spell-slot row at the starting level feeds `SpellChoiceCtx`
  // so a RECURRING entitlement (Wizard School Savant) offers its full
  // level-scaled pick count (2 at L3 → 3 at L5 → … → 9 at L17).
  // Computed inline (no manual useMemo): `classTable` is a freshly-derived
  // `.find()` const the React Compiler can't preserve a manual memo over — the
  // compiler auto-memoizes this render path itself (same pattern as the
  // LevelUpModal's inline gates).
  const bgFeatSlug = selectedBgData?.feat ?? "";
  const creationChoiceSlots = (() => {
    const refs = [humanFeat, bgFeatSlug]
      .filter((slug) => !!slug)
      .map((srdId) => ({ srdId }));
    const subclassSlug = (selectedSubclass || "").toLowerCase();
    for (let lvl = 1; lvl <= level; lvl++) {
      for (const f of getFeaturesAtLevel(selectedClass, lvl)) {
        if (f.subclass && f.subclass.toLowerCase() !== subclassSlug) continue;
        refs.push({ srdId: f.id });
      }
    }
    const slotRow = classTable?.levels[level - 1]?.spellSlots ?? [];
    // Class-level grants (Monk/Bard level-1 tool-proficiency choice) AND the
    // background's own grants ("Choose one kind of <Musical Instrument / Gaming Set
    // / Artisan's Tools>" — Entertainer, Artisan, Guard, …) join the feature
    // sources so every tool-proficiency pick surfaces in the FeatureChoicesSection.
    const sources = [
      ...resolveGrantSourcesForClass(selectedClass),
      ...resolveGrantSourcesForBackground(selectedBackground),
      ...resolveGrantSourcesForFeatures(refs),
    ];
    return collectChoiceSlots(sources, {
      spellSlotsByClass: { [selectedClass]: slotRow },
    });
  })();
  const activeCreationChoicePicks = pruneChoicePicks(
    creationChoiceSlots,
    creationChoicePicks
  );
  // The Human Versatile feat is PICKED in this wizard — its nested choices
  // (Magic Initiate's spells, Skilled's skills, …) expand INLINE directly
  // under the feat picker, attributed to their cause (owner, 2026-06-10).
  // Everything else (background feat + class features) keeps its home:
  // spell slots in the Spells step, the rest in the catch-all section.
  const { caused: humanFeatSlots, rest: creationRestSlots } =
    partitionChoiceSlotsBySource(creationChoiceSlots, isHuman ? humanFeat : null);
  // Spell choices surface in the Spells step; the Review catch-all shows only the
  // NON-spell origin choices so a choice never appears twice in the same wizard.
  const reviewChoiceSlots = { ...creationRestSlots, spell: [] };

  // The CLASS starting-equipment VMs — threaded with the tool-choice context so
  // the chosen-tool pack member (Monk / Bard `fromToolChoice`) shows the actual
  // picked tool, or a localized placeholder before a pick. The SAME context
  // drives the create-time merge, so preview and creation never drift (rule 6).
  // Computed inline (no manual `useMemo`): `activeCreationChoicePicks` is a
  // freshly-derived object the React Compiler can't preserve a manual memo over —
  // it auto-memoizes this render path itself (same pattern as `creationChoiceSlots`).
  const classToolChoice = toolChoiceContextForClass(
    selectedClass,
    activeCreationChoicePicks.tool
  );
  const classEquipVMs = classStartingEquipment(selectedClass, locale, classToolChoice);
  const effClassEquipLabel = classEquipVMs.some((o) => o.label === classEquipLabel)
    ? classEquipLabel
    : (classEquipVMs[0]?.label ?? classEquipLabel);
  // The BACKGROUND fork's tool-choice context — for a "Choose one kind of <X>"
  // background, the chosen instrument/set resolves the "(same as above)"
  // `fromToolChoice` pack member to the picked tool (or a localized placeholder
  // before a pick). The SAME context drives the create-time merge, so preview and
  // creation never drift (rule 6). A fixed-tool background yields `undefined`.
  const bgToolChoice = toolChoiceContextForBackground(
    selectedBackground,
    activeCreationChoicePicks.tool
  );
  const bgEquipVMs = startingEquipmentOptions(
    getBackgroundEquipmentOptions(selectedBackground),
    locale,
    bgToolChoice
  );
  const hasStartingEquipment = classEquipVMs.length > 0 || bgEquipVMs.length > 0;
  // The EFFECTIVE chosen BACKGROUND label — if a stale pick no longer exists, fall
  // back to the first option (the suggested gear default). Derived at render (no
  // setState-in-effect); the same fallback lives in `resolveStartingEquipment`, so
  // render AND create agree by construction.
  const effBgEquipLabel = bgEquipVMs.some((o) => o.label === bgEquipLabel)
    ? bgEquipLabel
    : (bgEquipVMs[0]?.label ?? bgEquipLabel);

  // Spell ids the character already owns from OTHER sources (class-selected
  // cantrips / leveled spells) — the feat spell pickers exclude these. MUST NOT
  // include the feat's own in-flight picks (that vanished a just-picked spell
  // from its picker and blocked Acolyte-background creation).
  const classSpellIds = useMemo(
    () => new Set<string>([...selectedCantrips, ...selectedSpells]),
    [selectedCantrips, selectedSpells]
  );

  // Name of the BACKGROUND feat driving the catch-all feat-choice pickers, so
  // the section can SAY where the choices come from. The Human Versatile feat
  // is NOT listed here — its choices render inline under its own picker,
  // already attributed.
  const originFeatNames = useMemo(() => {
    const names: string[] = [];
    for (const slug of [bgFeatSlug]) {
      // Only resolve a name for a slug that maps to a real feat (the catalogue
      // would otherwise throw); the localized name comes from the presenter.
      if (slug && FEATS_BY_ID.has(slug)) names.push(featName(slug, locale));
    }
    return names;
  }, [bgFeatSlug, locale]);

  const featChoicesHint =
    originFeatNames.length > 0
      ? t("create.featChoicesHint", { feats: originFeatNames.join(" · ") })
      : "";

  const classSkillCount = classTable ? classTable.skillChoices.count : 0;

  const classSkillPool: string[] = (classTable ? classTable.skillChoices.from : [])
    .map(skillNameToId)
    .filter((id): id is string => id !== null);

  const skillsComplete = selectedClassSkills.length >= classSkillCount;

  // Spellcasting computation.
  const levelData = classTable?.levels[level - 1];
  const cantripsNeeded = levelData?.cantripsKnown ?? 0;
  const hasSpellSlots = (levelData?.spellSlots ?? []).some((s) => s > 0);
  const maxSpellLevel = (levelData?.spellSlots ?? []).reduce(
    (max, slots, i) => (slots > 0 ? i + 1 : max),
    0
  );
  /** Leveled spells to pick — from the class table's "Prepared Spells" column. */
  const spellsNeeded = levelData?.spellsKnown ?? 0;
  const showSpellStep =
    classTable?.spellcasting != null && (cantripsNeeded > 0 || hasSpellSlots);
  const cantripsComplete = selectedCantrips.length >= cantripsNeeded;
  const spellsComplete = selectedSpells.length >= spellsNeeded;
  // The whole spell step is done only when BOTH the cantrips AND the leveled
  // (prepared/known) picks meet their counts — mirrors LevelUpWizard's
  // `spellsComplete`. A caster with no spell step is trivially complete.
  const spellStepComplete = !showSpellStep || (cantripsComplete && spellsComplete);
  const isPreparedCaster = classTable?.spellcasting?.preparedCaster ?? false;

  function toggleClassSkill(id: string) {
    if (bgSkillIds.includes(id)) return; // background skills are locked
    setSelectedClassSkills((prev) => {
      if (prev.includes(id)) return prev.filter((s) => s !== id);
      // At the limit → FIFO replace the oldest (matches the spell/feat picker).
      if (prev.length >= classSkillCount) return [...prev.slice(1), id];
      return [...prev, id];
    });
  }

  // Computed preview values (using effectiveScores so background ASI is live).
  const classHitDie = classTable?.hitDie ?? 0;
  const averageHP = classHitDie
    ? calculateMaxHP(classHitDie, effectiveScores.CON, level)
    : 0;
  // Per-level HP grants from features / feats — reads the same declarative
  // `{ type: "hp-per-level", amount }` grants the level-up engine reads.
  const previewFeatures =
    classTable && level >= 1
      ? getFeaturesForLevel(
          classTable.id,
          level,
          selectedSubclass,
          selectedRaceData?.id ?? selectedRace,
          humanFeat,
          selectedBgData?.feat
        )
      : [];
  const perLevelHpBonus = (() => {
    let total = 0;
    for (const src of resolveGrantSourcesForFeatures(previewFeatures)) {
      for (const g of src.grants ?? []) {
        if (g.type === "hp-per-level") total += g.amount * level;
      }
    }
    return total;
  })();
  const previewHP =
    (hpMode === "rolled" && rolledHp != null ? rolledHp : averageHP) + perLevelHpBonus;

  const previewAC = 10 + abilityModifier(effectiveScores.DEX);
  const previewPB = proficiencyBonus(level);
  const previewDC = classTable?.spellcasting
    ? 8 + previewPB + abilityModifier(effectiveScores[classTable.spellcasting.ability])
    : null;

  function switchBgAsiMode(newMode: "+2/+1" | "+1/+1/+1") {
    setBgAsiMode(newMode);
    setBgAsiChoices({});
  }

  function toggleBgAsi(code: AbilityCode) {
    setBgAsiChoices((prev) => {
      const current = prev[code];
      const withoutCode = Object.fromEntries(
        Object.entries(prev).filter(([k]) => k !== code)
      );
      if (bgAsiMode === "+2/+1") {
        if (current != null) return withoutCode;
        const hasTwo = Object.values(prev).some((v) => v === 2);
        const hasOne = Object.values(prev).some((v) => v === 1);
        if (!hasTwo) return { ...prev, [code]: 2 };
        if (!hasOne) return { ...prev, [code]: 1 };
        return prev;
      } else {
        if (current === 1) return withoutCode;
        if (Object.keys(prev).length >= 3) return prev;
        return { ...prev, [code]: 1 };
      }
    });
  }

  /**
   * Full granted-feature set for a new character: class/subclass features +
   * species traits + origin/background feats, so their trackers/actions/passives
   * are live. Closes over the selected race/feats.
   */
  function getFeaturesForLevel(
    classId: string,
    lvl: number,
    subclassId: string,
    raceId: string,
    originFeat: string,
    bgFeat: string | undefined
  ) {
    return buildGrantedFeatures({
      classId,
      level: lvl,
      subclassId,
      raceId,
      originFeat,
      bgFeat,
    });
  }

  const handleCreate = useCallback(async () => {
    if (!user) return;
    // Mint the branded non-empty name ONCE here — the single gate that makes an
    // empty/whitespace name impossible to create (it returns before assembling the
    // character). `validName` is a `NonEmptyString`, so it slots straight into the
    // branded `CharacterData.name` with no cast.
    const validName = nonEmptyString(name);
    if (validName === null) {
      setError(t("create.nameRequired"));
      return;
    }
    if (!classTable) {
      setError(t("create.classRequired"));
      return;
    }
    if (showSubclass && !selectedSubclass) {
      setError(t("create.subclassRequired"));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      // Resolve + merge the chosen class + background starting-equipment
      // packages into the new character's weapons / equipment / starting gold
      // (the source-agnostic resolver; the all-gold options yield no items).
      // BOTH the Monk/Bard class chosen-tool pack member AND the "Choose one kind
      // of <X>" background's "(same as above)" pack member resolve from the SAME
      // tool-choice context that drives the preview — one pick, both surfaces,
      // exactly once.
      const startingKit = mergeStartingEquipment(
        classTable.startingEquipment,
        effClassEquipLabel,
        getBackgroundEquipmentOptions(selectedBackground),
        effBgEquipLabel,
        classToolChoice,
        bgToolChoice
      );

      const isPactMagic = classTable.id === "warlock";
      // L10 — Eldritch Knight / Arcane Trickster grant their own (third-caster)
      // spellcasting; when the subclass casts and the class doesn't, the subclass
      // supplies the slots.
      const subSpell = subclassSpellcastingState(classTable.id, selectedSubclass, level);
      const spellSlots = subSpell
        ? subSpell.spellSlots
        : (classTable.levels[level - 1]?.spellSlots ?? [])
            .map((total, i) =>
              isPactMagic
                ? { level: i + 1, total, pactMagic: true }
                : { level: i + 1, total }
            )
            .filter((s) => s.total > 0);

      const characterData: CharacterData = {
        name: validName,
        quote: "",
        // Stored as the stable, branded race ID (golden rule 7) — the
        // selection already IS a canonical id; display derives from it via
        // `localizeRaceName`. A species NAME can never live in the document.
        race: asRaceId(selectedRaceData?.id ?? selectedRace),
        // R4 — `classes[]` is the SOLE source of truth (single-class = one entry).
        classes: [
          {
            classId: selectedClass,
            ...(selectedSubclass ? { subclassId: selectedSubclass } : {}),
            level,
          },
        ],
        background: selectedBgData
          ? presBgName(selectedBackground, "en")
          : selectedBackground,
        // The alignment SELECT binds + emits the stable alignment ID; brand it (the
        // in-memory field is an AlignmentId — golden rule 7). Display derives
        // from the id via `t("lore.alignments.<id>")`.
        alignment: asAlignmentId(alignment),
        // D30 — prefill the player's FIRST name from their Google account.
        playerName: user.displayName?.trim().split(/\s+/)[0] ?? "",
        speed: String(selectedRaceData?.speed ?? 30),
        ac: previewAC,
        acOverride: null,
        armorNote: "Unarmored",
        hp: { max: previewHP },
        hitDieType: classTable.hitDie,
        // Initiative is auto-computed from DEX/PB/Alert (`computeInitiative`); the
        // override stays null until the user sets one. (The legacy `initiativeBonus`
        // slot was deleted from the type — golden rule 10.)
        initiativeBonusOverride: null,
        // Languages are STABLE IDS (golden rule 7): the auto Origin "Common" lands
        // as the id; the `choice-language` picks append their ids via
        // `applyLanguagePicks` at `finalCharacter`. Never a localized display string.
        languageIds: ["common"],
        customLanguages: [],
        // Tool proficiencies are DERIVED, never baked as a locale string (golden
        // rules 6 + 7): a FIXED tool flows through its `tool-proficiency` grant
        // (`resolveGrantSourcesFor{Background,Class,Features}` →
        // `displayToolProficiencies`); a "Choose one kind of <X>" / "3 instruments"
        // CHOICE pick is recorded as STABLE TOOL IDS in `toolChoices` by the player's
        // PICK via `applyChoicePicks` (`applyToolPicks`) at `finalCharacter`, and the
        // proficiency is DERIVED from those ids by the synthetic tool-choice grant
        // source — so the concrete instrument/set surfaces, never the umbrella, and
        // never a free-text string. These MANUAL id lists stay EMPTY at creation
        // (they hold only later hand-added picks).
        toolProficiencyIds: [],
        customToolProficiencies: [],
        abilityBudget: 27,
        proficiencyBonusOverride: null,
        levelUpChecklist: null,
        backgroundAsi: Object.fromEntries(Object.entries(bgAsiChoices)),
        humanOriginFeat: humanFeat,
        bgFeat: selectedBgData?.feat ?? "",
        lore: {
          traits: "",
          ideals: "",
          bonds: "",
          flaws: "",
          backstory: "",
          age: "",
          height: "",
          weight: "",
          eyes: "",
          hair: "",
          skin: "",
        },
        abilityScores: effectiveScores,
        savingThrows: classTable.savingThrows,
        skills: [...bgSkillIds, ...selectedClassSkills].reduce<
          Record<string, "proficient">
        >((acc, id) => {
          acc[id] = "proficient";
          return acc;
        }, {}),
        spellcasting: classTable.spellcasting
          ? {
              ability: classTable.spellcasting.ability,
              preparedCaster: classTable.spellcasting.preparedCaster,
              preparedMax: spellsNeeded,
              saveDCOverride: null,
              attackBonusOverride: null,
            }
          : subSpell
            ? {
                ability: subSpell.ability,
                preparedCaster: true,
                preparedMax: subSpell.preparedMax,
                saveDCOverride: null,
                attackBonusOverride: null,
              }
            : null,
        spellSlots,
        // H7 — inject subclass expanded spells + always-prepared-spell grants so
        // the player begins with the always-prepared list correct from the start.
        spells: (() => {
          // 1. Class-selected cantrips + spells (prepared).
          const initial: SrdSpellRef[] = [
            ...selectedCantrips.map((id) => ({ srdId: id, prepared: true })),
            ...selectedSpells.map((id) => ({ srdId: id, prepared: true })),
          ];
          let s: (SrdSpellRef | CustomSpell)[] = initial;
          // 2. Subclass expanded-spells (Cleric Domain / Paladin Oath / …).
          s = injectExpandedSpells(
            s,
            getExpandedSpellsThroughLevel(selectedClass, selectedSubclass, level)
          );
          // 3. Always-prepared spells from feature/feat grants.
          s = injectExpandedSpells(
            s,
            getAlwaysPreparedFromGrants(
              resolveGrantSourcesForFeatures(
                getFeaturesForLevel(
                  classTable.id,
                  level,
                  selectedSubclass,
                  selectedRaceData?.id ?? selectedRace,
                  humanFeat,
                  selectedBgData?.feat
                )
              ),
              { level }
            )
          );
          // Origin-feat cantrip/spell picks are applied below via the unified
          // choice engine (applyChoicePicks), alongside skill/tool/language picks.
          return s;
        })(),
        weapons: startingKit.weapons,
        equipment: startingKit.equipment,
        // STORE only what's auto-granted by CLASS — race traits live OUTSIDE
        // `features[]` (they resolve from `character.race` via
        // `resolveGrantSourcesForRace` / the smart-tracker race branches) and Origin
        // feats are re-derived from the build choices. Baking the race traits in
        // here was the legacy double-surfacing source (the "Adrenaline Rush twice"
        // report); `raceId: ""` keeps them out so the doc declares the least.
        // (The class features minimize-drop on save; storing them is harmless and
        // keeps the freshly-created in-memory sheet complete before the first save.)
        features: getFeaturesForLevel(
          classTable.id,
          level,
          selectedSubclass,
          "",
          humanFeat,
          selectedBgData?.feat
        ),
        combatAlgorithm: [],
        customConditions: [],
        sidebar: [],
      };

      // Write creation-time lineage choices into grantBundleChoices so the
      // character starts with the correct lineage grants active.
      const grantBundleChoices: Record<string, string> =
        Object.keys(lineageChoices).length > 0 ? { ...lineageChoices } : {};

      const session: SessionState = {
        hp: { current: previewHP, temp: 0 },
        hitDice: { used: 0 },
        trackers: {},
        spellSlots: {},
        // Starting gold = the chosen class option's GP + the chosen background
        // option's GP (the 2024 "and N GP" rider / the all-gold alternative).
        currency: { pp: 0, gp: startingKit.gold, ep: 0, sp: 0, cp: 0 },
        concentration: "",
        initiative: "",
        conditions: [],
        deathSucc: 0,
        deathFail: 0,
        inspiration: false,
        exhaustion: 0,
        pinnedActions: [],
        unpinnedActions: [],
        notes: "",
        logEntries: [],
        grantBundleChoices,
      };

      // Apply ALL origin-feat choices (Human Versatile + bg feat) in one pass via
      // the unified choice engine. Jack-of-All-Trades is DERIVED from the feature
      // at render (#57) — never baked into stored `skills`.
      const finalCharacter = applyChoicePicks(
        characterData,
        creationChoiceSlots,
        activeCreationChoicePicks
      );
      const docId = await createCharacter(user.uid, {
        portraitUrl: null,
        portraitCrop: null,
        shareId: null,
        status: "active",
        character: finalCharacter,
        session,
      });
      // Land on the cockpit. Flag the leave-guard so this save doesn't prompt.
      finishingRef.current = true;
      void navigate(`/characters/${docId}`);
      window.scrollTo({ top: 0, left: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("character.failedCreate"));
      setSaving(false);
    }
  }, [
    user,
    name,
    classTable,
    selectedClass,
    selectedSubclass,
    showSubclass,
    selectedRaceData,
    selectedBgData,
    selectedRace,
    selectedBackground,
    level,
    previewAC,
    previewHP,
    effectiveScores,
    bgAsiChoices,
    humanFeat,
    alignment,
    selectedClassSkills,
    bgSkillIds,
    selectedCantrips,
    selectedSpells,
    spellsNeeded,
    effClassEquipLabel,
    effBgEquipLabel,
    classToolChoice,
    bgToolChoice,
    creationChoiceSlots,
    activeCreationChoicePicks,
    lineageChoices,
    navigate,
    t,
  ]);

  // Origin-feat picker completeness — every slot must be filled to its count.
  // Split along the render split: the Human feat's slots live on the species
  // step, every other slot on background/spells — so the "what's left" jump
  // lands where the picker actually is.
  const humanFeatChoicesComplete = isAllChoicesComplete(
    humanFeatSlots,
    activeCreationChoicePicks
  );
  const restChoicesComplete = isAllChoicesComplete(
    creationRestSlots,
    activeCreationChoicePicks
  );
  // Whether the REST slots' spell picks specifically are done — they render on
  // the Spells step, so the "what's left" jump must land there, never on a step
  // with no picker (the background dead-end regression).
  const restSpellChoicesComplete = isSpellChoicesComplete(
    creationRestSlots.spell,
    activeCreationChoicePicks.spell
  );

  // Lineage completeness — every creation-time bundle must have a choice.
  const lineageComplete =
    lineageBundles.length === 0 ||
    lineageBundles.every((b) => lineageChoices[b.bundleKey] !== undefined);

  // ─── Create requirements (single source of truth) ────────────────────────────
  // ONE list drives BOTH the disabled gate AND the "what's left to finish"
  // explainer, so the button and the message can never disagree.
  const createRequirements: {
    key: string;
    met: boolean;
    label: string;
    step: GuidedStep;
  }[] = [
    { key: "name", met: !!name.trim(), label: t("create.needName"), step: "class" },
    { key: "class", met: !!classTable, label: t("create.needClass"), step: "class" },
    {
      key: "subclass",
      met: !showSubclass || !!selectedSubclass,
      label: t("create.needSubclass"),
      step: "class",
    },
    {
      key: "lineage",
      met: lineageComplete,
      label: t("create.needLineage"),
      step: "race",
    },
    {
      key: "humanFeat",
      met: !isHuman || !!humanFeat,
      label: t("create.needHumanFeat"),
      step: "race",
    },
    {
      key: "originFeat",
      met: humanFeatChoicesComplete && restChoicesComplete,
      label: t("create.needOriginFeat"),
      // Jump where the first incomplete picker actually is: the Human feat's
      // choices expand on the species step, spell picks on the Spells step,
      // and every other catch-all choice on the Review step itself.
      step: !humanFeatChoicesComplete
        ? "race"
        : !restSpellChoicesComplete
          ? "spells"
          : "review",
    },
    {
      // B01 — a complete character has its CLASS skill proficiencies chosen.
      // The guided Skills step already gated this (`stepNextDisabled.skills`);
      // quick mode and orb free-jumps now honor the same bar so Create can
      // never mint a `skills:{}` character. Trivially met when the class grants
      // no skill choices.
      key: "skills",
      met: skillsComplete,
      label: t("create.needSkills"),
      step: "skills",
    },
    {
      // B01 — a caster begins play with its cantrips AND its leveled
      // (prepared/known) spells chosen; the guided Spells-step Next only
      // checked cantrips, so a 0-spell caster slipped through. Mirrors
      // LevelUpWizard's `spellsComplete`. Non-casters are trivially met.
      key: "spells",
      met: spellStepComplete,
      label: t("create.needSpells"),
      step: "spells",
    },
    {
      // D5 — the 2024 background ASI is part of a complete character; the
      // wizard prompts and `backgroundAsi` is populated before Create unlocks
      // (the guided rail already gated this step — quick mode and orb
      // free-jumps now honor the same bar).
      key: "bgAsi",
      met: bgAsiIsValid,
      label: t("create.needBgAsi"),
      step: "bg-asi",
    },
  ];
  const missingRequirements = createRequirements.filter((r) => !r.met);
  const canCreate = missingRequirements.length === 0;

  // ── C4 — the journey DERIVES from the class (golden rule 19): a non-caster
  // gets NO spells step (unless an origin feat asks spell picks), a class with
  // no starting-equipment table gets NO equipment step. The orb row morphs to
  // the new count via the chrome's keyed swap (B2) — no perceived jump.
  const activeGuidedSteps: GuidedStep[] = GUIDED_STEPS.filter((id) => {
    if (id === "spells") return showSpellStep || creationRestSlots.spell.length > 0;
    if (id === "equipment") return hasStartingEquipment;
    return true;
  });

  // Guided step navigation.
  const currentStepIndex = activeGuidedSteps.indexOf(guidedStep);
  // A class swap can remove the CURRENT step from the journey — fold back to the
  // class step (render-adjust pattern; fires at most once per change).
  if (mode === "guided" && currentStepIndex === -1) {
    setGuidedStep("class");
  }

  /** Reset spell + subclass picks when the class or level changes (on-rails). */
  function onClassChange(id: string) {
    setSelectedClass(id);
    setSelectedSubclass("");
    setSelectedClassSkills([]);
    setSelectedCantrips([]);
    setSelectedSpells([]);
  }
  function onLevelChange(raw: number) {
    setLevel(Math.max(1, Math.min(20, raw || 1)));
    setSelectedSubclass("");
    setSelectedCantrips([]);
    setSelectedSpells([]);
  }
  function onRaceChange(id: string) {
    setSelectedRace(id);
    setHumanFeat("");
    setLineageChoices({});
  }

  // The subclass <Select> — reused in quick mode + class step + review step.
  const subclassSelect = showSubclass && classTable && (
    <FormField label={t("create.subclassLabel", { level: subclassLevel })}>
      <Select
        aria-label={t("create.subclassLabel", { level: subclassLevel })}
        value={selectedSubclass}
        onChange={(e) => setSelectedSubclass(e.target.value)}
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
      onChange={(e) => setAlignment(e.target.value)}
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
  const stepNextDisabled: Record<GuidedStep, boolean> = {
    class: !classTable || (showSubclass && !selectedSubclass),
    race: !lineageComplete || (isHuman && (!humanFeat || !humanFeatChoicesComplete)),
    background: false,
    skills: !skillsComplete,
    spells: showSpellStep && !(cantripsComplete && spellsComplete),
    equipment: false,
    "bg-asi": !bgAsiIsValid,
    abilities: usePointBuy && pointsRemaining !== 0,
    review: false,
  };

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
        onChoose={(id) => setHumanFeat(id ?? "")}
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
              onChange={setCreationChoicePicks}
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
                    onClick={() =>
                      setLineageChoices((prev) => ({ ...prev, [b.bundleKey]: o.id }))
                    }
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
          // Quick mode shares the same page-turn pager; back exits, the one
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
        // ──── QUICK START — every choice on one page ────────────────────────
        <>
          <WizardChrome
            steps={[]}
            current={0}
            eyebrow={t("create.quickStart")}
            title={t("create.title")}
            hint={t("wizard.quickGloss")}
          />
          <div className="mx-auto flex w-full max-w-[860px] flex-1 flex-col gap-6">
            {/* Name */}
            <FormField label={t("create.nameLabel")} required>
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("create.namePlaceholder")}
                className="w-full"
                autoFocus
              />
            </FormField>

            {/* Class */}
            <FormField label={t("create.classLabel")}>
              <ClassPlaques selected={selectedClass} onPick={onClassChange} />
            </FormField>

            {/* Level + Subclass row */}
            <div className="grid gap-3 grid-cols-[96px_1fr]">
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

            {/* Race + Background + Alignment */}
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
              {lineageBundles.map((b) => (
                <FormField key={b.bundleKey} label={b.label}>
                  <Select
                    aria-label={b.label}
                    value={lineageChoices[b.bundleKey] ?? ""}
                    onChange={(e) =>
                      setLineageChoices((prev) => ({
                        ...prev,
                        [b.bundleKey]: e.target.value,
                      }))
                    }
                  >
                    <option value="">{t("create.lineagePlaceholder")}</option>
                    {b.options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </FormField>
              ))}
              <FormField label={t("create.backgroundLabel")}>
                <Select
                  aria-label={t("create.backgroundLabel")}
                  value={selectedBackground}
                  onChange={(e) => {
                    setSelectedBackground(e.target.value);
                    setSelectedClassSkills([]);
                    // A new background has its own 3 eligible abilities — clear
                    // any prior ASI picks so a now-ineligible choice can't linger.
                    setBgAsiChoices({});
                  }}
                >
                  {bgOptionVMs.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>

            {/* Alignment */}
            <FormField label={t("lore.alignment")}>{alignmentSelect}</FormField>

            {/* Skills */}
            {classSkillCount > 0 && (
              <FormField label={t("create.stepSkills")}>
                <SkillsPickerSection
                  bgSkillIds={bgSkillIds}
                  classSkillPool={classSkillPool}
                  classSkillCount={classSkillCount}
                  selectedClassSkills={selectedClassSkills}
                  onToggle={toggleClassSkill}
                />
              </FormField>
            )}

            {/* Human Versatile: second Origin feat (the morph list). */}
            {humanFeatList}

            {/* Origin-feat choices (Background feat + class features). */}
            {hasAnyChoiceSlots(creationRestSlots) && (
              <FormField label={t("levelUp.featureChoices")}>
                {featChoicesHint && (
                  <p className="on-art mb-2 text-xs text-text-muted">{featChoicesHint}</p>
                )}
                <FeatureChoicesSection
                  slots={creationRestSlots}
                  picks={activeCreationChoicePicks}
                  onChange={setCreationChoicePicks}
                  existingSkillIds={new Set([...selectedClassSkills, ...bgSkillIds])}
                  existingSpellIds={classSpellIds}
                  proficientSkillIds={new Set([...selectedClassSkills, ...bgSkillIds])}
                />
              </FormField>
            )}

            {/* Spells — the read-then-Learn list. */}
            {showSpellStep && spellListSlots.length > 0 && (
              <FormField label={t("create.stepSpells")}>
                <WizardSpellList
                  slots={spellListSlots}
                  picks={{ cantrips: selectedCantrips, spells: selectedSpells }}
                  onToggle={(slotId, spellId, limit) => {
                    if (slotId === "cantrips") {
                      setSelectedCantrips((prev) => togglePick(prev, spellId, limit));
                    } else {
                      setSelectedSpells((prev) => togglePick(prev, spellId, limit));
                    }
                  }}
                />
              </FormField>
            )}

            {/* Starting Equipment */}
            {hasStartingEquipment && (
              <FormField label={t("create.stepEquipment")}>
                <EquipmentPickerSection
                  classOptions={classEquipVMs}
                  bgOptions={bgEquipVMs}
                  classChosen={effClassEquipLabel}
                  bgChosen={effBgEquipLabel}
                  onChooseClass={setClassEquipLabel}
                  onChooseBg={setBgEquipLabel}
                />
              </FormField>
            )}

            {/* Background ASI */}
            <FormField label={t("create.stepBgAsi")}>
              <BgAsiPicker
                baseScores={abilityScores}
                mode={bgAsiMode}
                choices={bgAsiChoices}
                abilityOptions={selectedBgData?.abilityOptions ?? []}
                backgroundName={bgDisplay}
                onSwitchMode={switchBgAsiMode}
                onToggle={toggleBgAsi}
                isValid={bgAsiIsValid}
              />
            </FormField>

            {/* Ability Scores — ONE cartouche family; the method fork wears the
                wizard's tab recipe (owner 2026-06-11: consistent + premium). */}
            <FormField label={t("create.abilityScores")}>
              <div
                className="wiz-fork mb-3"
                role="group"
                aria-label={t("create.abilityMethod")}
              >
                <WizardForkTab active={usePointBuy} onClick={() => setUsePointBuy(true)}>
                  {t("create.pointBuy")}
                </WizardForkTab>
                <WizardForkTab
                  active={!usePointBuy}
                  onClick={() => setUsePointBuy(false)}
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
            </FormField>

            {/* HP Mode */}
            <FormField label={t("create.hpLabel")}>
              <HpModeSelector
                mode={hpMode}
                onModeChange={setHpMode}
                rolledHp={rolledHp}
                onRolledHpChange={setRolledHp}
                averageHp={averageHP}
                hpBonus={perLevelHpBonus}
                hitDie={classHitDie}
                level={level}
              />
            </FormField>

            {/* Errors + what's left — the create CTA lives in the fixed bar. */}
            {error && <p className="text-sm text-error">{error}</p>}
            {!saving && <MissingRequirements items={missingRequirements} />}

            {/* Preview card */}
            <div className="mx-auto w-full max-w-[420px]">
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
            </div>
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
                      onChange={(e) => setName(e.target.value)}
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
                  onPickSubclass={setSelectedSubclass}
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
                      onClick={() => {
                        setSelectedBackground(b.id);
                        setSelectedClassSkills([]);
                        // New background ⇒ new eligible abilities; drop stale
                        // ASI picks (golden rule 20 — no reachable invalid state).
                        setBgAsiChoices({});
                      }}
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
                    onToggle={(slotId, spellId, limit) => {
                      if (slotId === "cantrips") {
                        setSelectedCantrips((prev) => togglePick(prev, spellId, limit));
                      } else {
                        setSelectedSpells((prev) => togglePick(prev, spellId, limit));
                      }
                    }}
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
                        setCreationChoicePicks({ ...activeCreationChoicePicks, spell })
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
                  isValid={bgAsiIsValid}
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
                    onClick={() => setUsePointBuy(true)}
                  >
                    {t("create.pointBuy")}
                  </WizardForkTab>
                  <WizardForkTab
                    active={!usePointBuy}
                    onClick={() => setUsePointBuy(false)}
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
                    onModeChange={setHpMode}
                    rolledHp={rolledHp}
                    onRolledHpChange={setRolledHp}
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
                      onChange={setCreationChoicePicks}
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
function featLabelForBackground(bgId: string, locale: "en" | "it"): string {
  const slug = SRD_BACKGROUNDS.find((b) => b.id === bgId)?.feat ?? "";
  return slug && FEATS_BY_ID.has(slug) ? featName(slug, locale) : "";
}
