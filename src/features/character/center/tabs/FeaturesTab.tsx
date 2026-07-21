/**
 * FeaturesTab — the cockpit's Features domain (blueprint §2.4): class / species /
 * feat features, companions, and feature trackers. Re-homed verbatim from the
 * pre-rewrite Features page; reads the character from the store the cockpit
 * already populates (no route chrome / page header), and the duplicate tablet
 * RESOURCES bar is dropped — the persistent Right HUD now owns trackers.
 *
 * (folio §4 — "Lemma & Gloss" feature ledger)
 *
 * One `UniversalCard mode="library"` per feature, grouped by source (Class /
 * Racial / Feats / Custom). Collapsed each row reads as a serif name + ONE
 * verdict chip (tracker count or a scaling-rider value) + a quiet mono gloss
 * (source · action type · recovery); the left border is keyed to the feature's
 * primary action-type slot via the folio `--at-*` tokens. The inline accordion
 * carries the description, a companion stat block (Steel Defender / Eldritch
 * Cannon), the live Spend/Restore tracker controls, editable notes, and a Use
 * CTA — or an honest "always active" hint for passive features.
 *
 * Outside combat, feature usage is IMMEDIATE with a 5 s undo toast. Honest
 * blanks everywhere; bilingual EN + IT; override-first (delete in edit mode,
 * notes editable). Reads the engine aggregate READ-ONLY (`resolveTrackers` /
 * `resolveFeatureRider` / `resolveCompanion`).
 */

import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Minus, Trash2, Pencil } from "lucide-react";
import { useCharacterStore } from "@/stores/characterStore";
import { useUIStore } from "@/stores/uiStore";
import { registerUndoableToast } from "@/stores/undoStore";
import { useLocale } from "@/hooks/useLocale";
import { classFeatureIndex } from "@/data/classes";
import { FEATS_BY_ID } from "@/data/feats";
import { raceFeatureIndex, raceTraitCatKey } from "@/data/races";
import { deriveOriginFeats, buildGrantedFeatures } from "@/lib/character-build";
import {
  totalLevel,
  primaryClassId,
  primaryClassEntry,
  classEntryLevel,
} from "@/lib/classes";
import { matchesSearch } from "@/lib/search";
// (PageHeader removed — the tab bar labels this domain; toolbar is inline below)
import type { SrdFeatureRef, CustomFeature } from "@/types/character";
import { resolveFeatureRiders, type ResolvedTracker } from "@/lib/smart-tracker";
import {
  localizeTrackers,
  localizeTrackerRecovery,
  trackerRecoveryBadgeBucket,
  copyTargetVMs,
} from "@/lib/views/tracker-view";
import { chipText } from "@/lib/views/combat-action-view";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import {
  effectiveAbilityScores,
  effectiveSpellAttackBonus,
  resolveCastingModifier,
  resolveCompanion,
} from "@/lib/compute";
import { formatModifier, localeDistance } from "@/lib/utils";
import {
  localizeClassName,
  localizeSubclassName,
  localizeText,
  localizeWeaponMastery,
} from "@/lib/views/srd-i18n";
import { localizeSrd, hasSrd } from "@/i18n/resolver";
import { srdKey } from "@/i18n/srd-key";
import { srdOptionParts } from "@/components/shared/srd-option";
import type { ActionType, Recovery } from "@/data/types";
import { Tracker, type TrackerColor } from "@/components/shared/Tracker";
import { CollapsibleSearch } from "@/components/shared/CollapsibleSearch";
import { InfoCard } from "@/components/shared/InfoCard";
import { FeatureAddModal } from "@/components/sheet/FeatureAddModal";
import { PoolSpendModal, type PoolSpendRequest } from "@/components/sheet/PoolSpendModal";
import {
  UniversalCard,
  UniversalCardFoot,
  type UniversalCardKind,
  type UniversalCardSlot,
} from "@/components/shared/UniversalCard";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ChoiceRePicker } from "@/features/character/ChoiceRePicker";
import {
  isManeuverPlaceholder,
  listManeuvers,
  maneuversKnownAt,
} from "@/lib/maneuver-pick";
import {
  isMetamagicPlaceholder,
  listMetamagicOptions,
  metamagicKnownAt,
} from "@/lib/metamagic-pick";
import {
  isInvocationPlaceholder,
  invocationsKnownAt,
  eligibleInvocations,
} from "@/lib/invocation-pick";
import {
  isWeaponMasteryPlaceholder,
  weaponMasteryCount,
  listMasterableWeapons,
} from "@/lib/weapon-mastery-pick";
import { SRD_INVOCATIONS, type SrdEldritchInvocation } from "@/data/invocations";
import { InlineMarkdown } from "@/components/shared/InlineMarkdown";
import { highlightRulesText } from "@/components/shared/highlightRulesText";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { RunicEmptyState } from "@/components/ui/runic-empty-state";
import { Swords, Wand2, Eye, Sword, Gem } from "lucide-react";
import { KindSeal } from "@/components/shared/KindSeal";
import { weaponSealIcon } from "@/components/shared/item-icons";
import {
  CompendiumDetailBody,
  maneuverSpec,
  metamagicSpec,
  invocationSpec,
  equipmentSpec,
  type CompendiumPickerSpec,
  type PickerCtx,
} from "@/features/compendium/picker";

/**
 * Build the "More" detail renderers for a spec-driven re-pick group — reusing the
 * compendium read view (`CompendiumDetailBody` + the type's compendium spec) so the
 * Features-tab re-picker shares ONE detail layout with the page and the wizards.
 */
function specDetailRenderers<T extends { id: string }>(
  spec: CompendiumPickerSpec<T>,
  entries: readonly T[],
  ctx: PickerCtx
): {
  detailFor: (id: string) => React.ReactNode;
  detailTitleFor: (id: string) => string;
} {
  const byId = new Map(entries.map((e) => [e.id, e]));
  return {
    detailFor: (id) => {
      const e = byId.get(id);
      return e ? (
        <CompendiumDetailBody
          view={spec.detail(e, ctx, { added: false })}
          locale={ctx.locale}
        />
      ) : null;
    },
    detailTitleFor: (id) => {
      const e = byId.get(id);
      // The localized title comes from the spec's `getName` (catalogue-resolved),
      // so the re-pick "More" header never reads the entry's BiText.
      return e ? spec.getName(e, ctx) : id;
    },
  };
}

/** Source grouping — drives the section heading + sort order. */
type FeatureGroup = "class" | "subclass" | "race" | "feat" | "custom";

/** The folio `UniversalCard` left-border slot for a feature's action type. */
function actionSlot(type: ActionType | "neutral"): UniversalCardSlot {
  return type === "neutral" ? "nothing" : type;
}

/**
 * Map an engine recovery timing to the folio `Tracker` recovery code (SR / LR)
 * + its accent colour. Short rests read verdigris, long rests read lapis —
 * matching the GameRail / Rest-page recovery chip language; manual/other omits
 * the chip and falls back to the neutral amethyst accent.
 */
function trackerRecovery(recovery: Recovery | undefined): {
  code: "SR" | "LR" | undefined;
  color: TrackerColor;
} {
  // The SR/LR bucket comes from the ONE shared classifier the rail reads too
  // (golden rule 6) — `dawn` folds to Long Rest identically on both surfaces.
  switch (trackerRecoveryBadgeBucket(recovery)) {
    case "short":
      return { code: "SR", color: "verdigris" };
    case "long":
      return { code: "LR", color: "lapis" };
    default:
      return { code: undefined, color: "amethyst" };
  }
}

/** The folio seal kind (medallion glyph) for a feature group. */
function sealKind(group: FeatureGroup): UniversalCardKind {
  switch (group) {
    case "feat":
      return "feat";
    case "race":
      return "race";
    default:
      return "feature";
  }
}

export function FeaturesTab() {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const character = useCharacterStore((s) => s.character);
  const consumeTracker = useCharacterStore((s) => s.useTracker);
  const restoreTracker = useCharacterStore((s) => s.restoreTracker);
  const setCompanionHp = useCharacterStore((s) => s.setCompanionHp);
  const sheetMode = useUIStore((s) => s.sheetMode);
  const isEdit = sheetMode === "edit";

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [featureModalOpen, setFeatureModalOpen] = useState(false);
  // U6 — editing an existing custom feature in place (opens the same modal in
  // edit mode, writing back to the stored index).
  const [editCustom, setEditCustom] = useState<{
    feature: CustomFeature;
    index: number;
  } | null>(null);
  const [poolRequest, setPoolRequest] = useState<
    (PoolSpendRequest & { featureId: string }) | null
  >(null);
  const [search, setSearch] = useState("");
  // Which re-pick group's picker is open (`null` = none) — one state for all the
  // RAW-swappable choice groups (#45 + U4).
  const [openRePick, setOpenRePick] = useState<string | null>(null);

  // RAW-swappable subclass choice groups (Fighter maneuvers, Sorcerer
  // metamagic, …): each surfaces a review section + a re-pick modal, but ONLY for a
  // character who actually has that track (the placeholder feature). One generic
  // shape feeds the shared ChoiceRePicker; add a track = push a group here.
  const rePickGroups = useMemo(() => {
    if (!character) return [];
    const cd = character.character;
    // R4 — the headline class; each class-scoped re-pick group reads the level IN
    // its own class (`classEntryLevel`) so a multiclass count is correct.
    const cls = primaryClassId(cd);
    const groups: Array<{
      key: string;
      eyebrow: string;
      title: string;
      label: string;
      max: number;
      current: string[];
      options: { id: string; label: string; searchText?: string; note?: string }[];
      /** The leading {@link KindSeal} medallion painted on every card. */
      seal: React.ReactNode;
      /** "More" detail renderers (spec-driven groups); omitted for weapon mastery. */
      detailFor?: (id: string) => React.ReactNode;
      detailTitleFor?: (id: string) => string;
      field:
        | "maneuverChoices"
        | "metamagicChoices"
        | "invocationChoices"
        | "weaponMasteries";
    }> = [];
    // Shared picker context for the spec-driven "More" detail views.
    const pickerCtx: PickerCtx = { t, locale, character, mode: "add" };
    if (cd.features.some((f) => "srdId" in f && isManeuverPlaceholder(f.srdId))) {
      const lvl = classEntryLevel(cd, "fighter");
      const max = maneuversKnownAt(lvl);
      if (max > 0) {
        const entries = listManeuvers();
        groups.push({
          key: "maneuvers",
          eyebrow: t("maneuvers.eyebrow"),
          title: t("maneuvers.section"),
          label: t("maneuvers.pickLabel"),
          max,
          current: primaryClassEntry(cd).maneuverChoices ?? [],
          options: entries.map((m) => ({
            id: m.id,
            ...srdOptionParts("maneuver", m.id, locale),
          })),
          seal: <KindSeal kind="weapon" icon={Swords} />,
          ...specDetailRenderers(maneuverSpec, entries, pickerCtx),
          field: "maneuverChoices",
        });
      }
    }
    if (cd.features.some((f) => "srdId" in f && isMetamagicPlaceholder(f.srdId))) {
      const lvl = classEntryLevel(cd, "sorcerer");
      const max = metamagicKnownAt(lvl);
      if (max > 0) {
        const entries = listMetamagicOptions();
        groups.push({
          key: "metamagic",
          eyebrow: t("metamagic.eyebrow"),
          title: t("metamagic.section"),
          label: t("metamagic.pickLabel"),
          max,
          current: primaryClassEntry(cd).metamagicChoices ?? [],
          options: entries.map((m) => ({
            id: m.id,
            ...srdOptionParts("metamagic", m.id, locale),
          })),
          seal: <KindSeal kind="feat" icon={Wand2} />,
          ...specDetailRenderers(metamagicSpec, entries, pickerCtx),
          field: "metamagicChoices",
        });
      }
    }
    // U4 — Eldritch Invocations re-picker (Warlock). Like maneuvers/metamagic it's a
    // RAW-swappable "pick N from a set" group; the options are the currently-known
    // (so they show as selected + swappable) UNION the still-eligible (prereq +
    // level gated via eligibleInvocations).
    if (cd.features.some((f) => "srdId" in f && isInvocationPlaceholder(f.srdId))) {
      const lvl = classEntryLevel(cd, "warlock");
      const max = invocationsKnownAt(lvl);
      if (max > 0) {
        const known = primaryClassEntry(cd).invocationChoices ?? [];
        const knownInvs = known
          .map((id) => SRD_INVOCATIONS.find((i) => i.id === id))
          .filter((i): i is SrdEldritchInvocation => !!i);
        const entries = [...knownInvs, ...eligibleInvocations(lvl, known)];
        groups.push({
          key: "invocations",
          eyebrow: t("invocations.eyebrow"),
          title: t("invocations.section"),
          label: t("invocations.pickLabel"),
          max,
          current: known,
          options: entries.map((inv) => ({
            id: inv.id,
            ...srdOptionParts("invocation", inv.id, locale),
            note: hasSrd("invocation", inv.id, "prerequisite", locale)
              ? localizeSrd("invocation", inv.id, "prerequisite", locale)
              : undefined,
          })),
          seal: <KindSeal kind="feat" icon={Eye} />,
          ...specDetailRenderers(invocationSpec, entries, pickerCtx),
          field: "invocationChoices",
        });
      }
    }
    // U4 — Weapon Mastery re-picker (Fighter/Barbarian/Paladin/Ranger/Rogue, plus
    // the Weapon Master FEAT's +1 slot). The 2024 rule lets you change ONE mastered
    // weapon when you finish a Long Rest, so it's a swappable "pick N proficient
    // mastery-weapons" group like the others.
    if (cd.features.some((f) => "srdId" in f && isWeaponMasteryPlaceholder(f.srdId))) {
      // Fighter's mastery count scales 3/4/5/6 at L1/4/10/16; the Weapon Master feat
      // adds one more on top (folded onto the primary entry the re-pick writes to).
      const max = weaponMasteryCount(cd, cls, classEntryLevel(cd, cls));
      if (max > 0) {
        const weapons = listMasterableWeapons();
        groups.push({
          key: "weapon-mastery",
          eyebrow: t("character.weaponMastery"),
          title: t("character.weaponMastery"),
          label: t("abilities.weaponMasteryPick", {
            count: max,
          }),
          max,
          current: primaryClassEntry(cd).weaponMasteries ?? [],
          // The masterable SRD weapons; the note is the weapon's Mastery property,
          // resolved through the shared `weapon-mastery` catalogue so it reads in the
          // active locale ("Topple" / "Rovesciamento") — identical to the Compendium facet
          // and the level-up picker by construction, never the raw English token.
          options: weapons.map((w) => ({
            id: w.id,
            ...srdOptionParts("equipment", w.id, locale),
            note: w.mastery ? localizeWeaponMastery(w.mastery, locale) : undefined,
            // D35 — per-weapon-type glyph (shared resolver), so the re-pick reads
            // like the inventory/combat rows instead of one generic sword.
            chip: <KindSeal kind="weapon" icon={weaponSealIcon(w.id)} />,
          })),
          seal: <KindSeal kind="weapon" icon={Sword} />,
          // N-B / OWN-9 — "More" opens the weapon's FULL compendium page (damage,
          // properties, mastery, cost, weight) by reusing the equipment compendium spec
          // + read view, so a player can inspect a weapon before mastering it. No new
          // component — the same `detailFor` path the maneuver / metamagic re-picks use.
          ...specDetailRenderers(equipmentSpec, weapons, pickerCtx),
          field: "weaponMasteries",
        });
      }
    }
    return groups;
  }, [character, locale, t]);

  function commitRePick(
    field:
      | "maneuverChoices"
      | "metamagicChoices"
      | "invocationChoices"
      | "weaponMasteries",
    ids: string[]
  ): void {
    const store = useCharacterStore.getState();
    const char = store.character;
    if (!char) return;
    // R4 — class-scoped picks live ON the owning class entry. Each re-pick group is
    // gated by a single class (maneuvers→the Fighter maneuver subclass, metamagic→Sorcerer,
    // invocations→Warlock, weapon-mastery→the martial class), so write the picks onto
    // the PRIMARY entry of `classes[]` (the headline class these picks belong to).
    const classes = char.character.classes.map((e) => ({ ...e }));
    const primary = primaryClassEntry(char.character);
    const idx = classes.findIndex(
      (e) => e.classId === primary.classId && e.level === primary.level
    );
    const target = idx >= 0 ? idx : 0;
    classes[target] = {
      ...(classes[target] ?? primary),
      [field]: ids.length ? ids : undefined,
    };
    store.setCharacter({
      ...char,
      character: { ...char.character, classes },
    });
  }

  const trackers = useMemo(
    () => (character ? localizeTrackers(character, locale) : []),
    [character, locale]
  );
  const trackerMap = useMemo(() => new Map(trackers.map((t) => [t.id, t])), [trackers]);

  // PRIM-copy-to-2nd-target notes (closes needs-UI:copy-target-feature-note):
  // each rider's localized blurb, keyed by its OWNING feature id, rendered as a
  // note on that feature's card below (Greater Mark of Detection/Passage/
  // Scribing). Informational — per-cast targeting is the player's call.
  const copyNotes = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!character) return map;
    const agg = aggregateCharacterGrants(character.character, character.session);
    for (const vm of copyTargetVMs(agg.copyToTargets, locale)) {
      const list = map.get(vm.sourceId) ?? [];
      list.push(vm.effect);
      map.set(vm.sourceId, list);
    }
    return map;
  }, [character, locale]);

  /** Short, localized action-type word for the gloss line. */
  function actionTypeLabel(type: ActionType | "neutral"): string | null {
    switch (type) {
      case "action":
        return t("features.slotAction");
      case "bonus":
        return t("features.slotBonus");
      case "reaction":
        return t("features.slotReaction");
      case "free":
        return t("features.slotFree");
      default:
        return t("features.passive");
    }
  }

  const features = useMemo(() => {
    if (!character) return [];
    const { character: charData } = character;

    // B8 — a summoned companion's AC borrows the OWNER's keyed ability mod (Steel
    // Defender / Eldritch Cannon = 12/18 + owner INT), which scales with the
    // CURRENT (effective) score, so a Headband of Intellect raises it (RAW 2024).
    // Resolve effective scores ONCE and feed `resolveCompanion`, never raw — the
    // companion's OWN fixed scores stay untouched inside the helper (rule 6).
    const companionAgg = aggregateCharacterGrants(charData, character.session);
    const companionEffectiveScores = effectiveAbilityScores(
      charData.abilityScores,
      companionAgg.abilityScoreFloors,
      companionAgg.itemAbilityScoreBonus,
      companionAgg.itemAbilityScoreCap
    );
    // A companion's `attackBonus: "spell-attack"` attack (Steel Defender's
    // Force-Empowered Rend, the Eldritch Cannon's Force Ballista) hits with the
    // OWNER's spell attack modifier — the same effective bonus the Spells tab
    // shows (PB + spellcasting-ability mod + any casting bump, override-first).
    // Resolve it ONCE from the owner's spellcasting config (null for a non-caster
    // — `resolveCompanion` then falls back to PB). One seam (rule 6).
    const sc = charData.spellcasting;
    const ownerSpellAttackMod = sc
      ? effectiveSpellAttackBonus(
          totalLevel(charData),
          companionEffectiveScores[sc.ability],
          resolveCastingModifier(
            companionAgg.spellAttackBonus,
            charData.classes[0]?.classId
          ),
          sc.attackBonusOverride,
          character.session.exhaustion,
          charData.proficiencyBonusOverride
        )
      : undefined;

    // "Declare the least, infer the rest": the Background's Origin feat (and the
    // species `humanOriginFeat`) are DERIVED from the declared `background` /
    // `humanOriginFeat`, not read from the stored snapshot. We union them onto
    // the stored `features[]` so the feat surfaces for ANY character — including
    // the mock and legacy docs that never injected `{ srdId }` at creation.
    //
    // DEDUP: an imported / older doc that still carries the origin feat in
    // `features[]` keeps its stored entry (real `idx`, so it stays
    // editable/deletable) and the derived twin is dropped — the feat lists
    // exactly once. The stored array is the source of `idx`; derived-only refs
    // carry `idx: -1` (out of band) and the edit/delete handlers already guard
    // against a missing entry, so they stay read-only and can't corrupt the
    // stored array.
    const storedSrdIds = new Set(
      charData.features.flatMap((f) => ("srdId" in f ? [f.srdId] : []))
    );
    // OWN-34 — DERIVE every SRD feature source for display: class + subclass +
    // species traits (via `buildGrantedFeatures` — the SAME tested derivation the
    // creation wizard uses, so this is no re-roll) PLUS the background/species origin
    // feats. Union onto the stored `features[]`, deduped by srdId. This is
    // DISPLAY-ONLY + ADDITIVE (idx:-1, read-only): `features[]` and the engine
    // consumers (level-up scaling / combat / spells) are UNTOUCHED — exactly like the
    // origin-feat derivation already was — so the tab answers "what can my character
    // do?" exhaustively for ANY character (the mock, legacy + imported docs, or a
    // desynced array) without depending on `features[]` being complete. (The full
    // option-1 refactor — `features[]` for custom only, engine reads the derivation
    // (a planned `derive-character-features.ts`) — is the separate, higher-blast-radius
    // Phase 2; see docs/AUTOMATION_BACKLOG.md.)
    const derivedRefs: SrdFeatureRef[] = [];
    const derivedSeen = new Set<string>();
    // The FULL set of ids any build choice COMPUTES (class/subclass/species
    // features + the background/species origin feats) — before the stored dedup.
    // A stored ref whose id is in here is a computed feature: read-only (you
    // change it by changing the choice in Bio), never deletable. Custom + any
    // manually-added non-computed SRD feature stay deletable.
    const computedIds = new Set<string>();
    for (const ref of [
      // R4 — computed class/subclass features for EVERY class the character has.
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
      computedIds.add(ref.srdId);
      if (!storedSrdIds.has(ref.srdId) && !derivedSeen.has(ref.srdId)) {
        derivedSeen.add(ref.srdId);
        derivedRefs.push(ref);
      }
    }

    const entries: Array<{
      ref: SrdFeatureRef | CustomFeature;
      idx: number;
    }> = [
      ...charData.features.map((ref, idx) => ({ ref, idx })),
      ...derivedRefs.map((ref) => ({ ref, idx: -1 })),
    ];

    const resolved = entries.map(({ ref, idx }) => {
      if ("custom" in ref) {
        // Derive action type from the first custom action (if any)
        const actionType: ActionType | "neutral" = ref.actions?.[0]?.type ?? "neutral";
        return {
          id: `custom-${ref.title}`,
          idx,
          name: ref.title,
          nameEn: ref.title,
          notes: "",
          description: ref.contentBlocks.map((b) => b.text ?? "").join("\n"),
          source: ref.source,
          tracker: null as ResolvedTracker | null,
          riders: [] as ReturnType<typeof resolveFeatureRiders>,
          companion: null,
          isCustom: true,
          // Homebrew is always editable + deletable.
          isComputed: false,
          // The raw homebrew entry, carried so edit mode can re-open it in the
          // editor (U6) without re-indexing the stored array in the render.
          customRef: ref,
          actionType,
          group: "custom" as FeatureGroup,
          _sortKey: { group: 4, level: 0 } as const,
        };
      }
      const classFeature = classFeatureIndex.get(ref.srdId);
      const feat = classFeature ? undefined : FEATS_BY_ID.get(ref.srdId);
      const raceTrait =
        classFeature || feat ? undefined : raceFeatureIndex.get(ref.srdId);
      const srd = classFeature ?? feat ?? raceTrait;
      // Localize a feature's SRD string (name/description) from the i18n catalogue
      // keyed by its STABLE id — class-feature/feat key by `srdId`, a race trait by
      // its id-derived `raceTraitCatKey`. Returns the raw `srdId` when there is no
      // SRD feature (custom rows resolve elsewhere) or the field is legitimately
      // absent, so the throwing resolver never fires.
      const featKind = classFeature ? "class-feature" : feat ? "feat" : "race";
      const featKey = raceTrait ? raceTraitCatKey(raceTrait) : ref.srdId;
      const featText = (field: string, loc: "en" | "it"): string =>
        srd && hasSrd(featKind, featKey, field, loc)
          ? localizeSrd(featKind, featKey, field, loc)
          : ref.srdId;
      // Derive action type from SRD mechanics (first action type defined)
      const primaryActionType: ActionType | "neutral" =
        srd?.mechanics?.actions?.[0]?.type ?? "neutral";
      // Build source label: feat category, race trait, "Subclass Lv", or "Class Lv".
      const source = feat
        ? t(`feats.category_${feat.category}`)
        : raceTrait
          ? locale === "it"
            ? "Tratto Razziale"
            : "Racial Trait"
          : classFeature?.subclass
            ? `${localizeSubclassName(classFeature.subclass, locale)} ${classFeature.level}`
            : `${localizeClassName(classFeature?.class ?? "?", locale)} ${classFeature?.level ?? "?"}`;
      // A class-feature entry splits into Class vs Subclass by its `subclass` tag
      // (OWN-34 — every source gets its own section).
      const group: FeatureGroup = classFeature
        ? classFeature.subclass
          ? "subclass"
          : "class"
        : raceTrait
          ? "race"
          : "feat";
      // Sort key: class (0), subclass (1), race (2), feat (3) — class/subclass by level.
      const _sortKey = classFeature
        ? { group: classFeature.subclass ? 1 : 0, level: classFeature.level }
        : raceTrait
          ? { group: 2, level: 0 }
          : { group: 3, level: 0 };
      // H10 — pull the rider chip(s) even for trackerless features (e.g. Monk
      // Unarmored Movement, Monk Martial Arts die). resolveFeatureRiders
      // returns the primary rider plus any `extra` siblings (Artificer Replicate
      // Magic Item: Plans Known + Magic Items), or [] for features with no rider.
      const riders = resolveFeatureRiders(ref.srdId, character);
      return {
        id: ref.srdId,
        idx,
        name: featText("name", locale),
        nameEn: featText("name", "en"),
        notes: ref.notes ?? "",
        description: hasSrd(featKind, featKey, "description", locale)
          ? localizeSrd(featKind, featKey, "description", locale)
          : "",
        source,
        tracker: trackerMap.get(ref.srdId) ?? null,
        riders,
        // Summoned companion (Steel Defender / Eldritch Cannon): resolve AC +
        // max HP from level/INT; pull current HP from session.
        companion: classFeature?.companion
          ? (() => {
              const resolved = resolveCompanion(
                classFeature.companion,
                totalLevel(charData),
                companionEffectiveScores,
                charData.proficiencyBonusOverride,
                ownerSpellAttackMod
              );
              return {
                ...resolved,
                // Each resolved attack carries its concrete to-hit + damage
                // formula; localize the catalogue name + rider (under the
                // feature's `<srdId>.companion.attacks.<id>` key, R3) here at the
                // view edge so the engine output stays i18n-free (rule 7).
                attacks: resolved.attacks.map((atk) => {
                  const atkKey = srdKey(ref.srdId, "companion", "attacks", atk.id);
                  return {
                    id: atk.id,
                    name: hasSrd("class-feature", atkKey, "name", locale)
                      ? localizeSrd("class-feature", atkKey, "name", locale)
                      : atk.id,
                    attackBonus: atk.attackBonus,
                    // Word-free dice + the LOCALIZED damage type (rule 7 — the
                    // raw token never reaches the DOM): "1d8 + 2 + 3 Force".
                    damage: `${atk.damageDice} ${t(`srd.damage_${atk.damageType}`)}`,
                    reachFt: atk.reachFt,
                    ranged: atk.ranged,
                    rider: hasSrd("class-feature", atkKey, "rider", locale)
                      ? localizeSrd("class-feature", atkKey, "rider", locale)
                      : undefined,
                  };
                }),
                // Companion display name + kind live in the catalogue under the
                // feature's `<srdId>.companion` key (R3); fall back to the
                // feature's own name when the companion has no distinct name.
                label: hasSrd(
                  "class-feature",
                  srdKey(ref.srdId, "companion"),
                  "name",
                  locale
                )
                  ? localizeSrd(
                      "class-feature",
                      srdKey(ref.srdId, "companion"),
                      "name",
                      locale
                    )
                  : featText("name", locale),
                kind: hasSrd(
                  "class-feature",
                  srdKey(ref.srdId, "companion"),
                  "kind",
                  locale
                )
                  ? localizeSrd(
                      "class-feature",
                      srdKey(ref.srdId, "companion"),
                      "kind",
                      locale
                    )
                  : undefined,
                current: character.session.companionHp?.[ref.srdId]?.current,
              };
            })()
          : null,
        isCustom: false,
        // Computed = derived from a build choice (idx:-1) OR a stored ref whose
        // id any choice computes. Computed features are read-only/non-deletable.
        isComputed: idx === -1 || computedIds.has(ref.srdId),
        customRef: null as CustomFeature | null,
        actionType: primaryActionType,
        group,
        _sortKey,
      };
    });
    // Sort: class features by level, then race traits, then feats, then custom
    resolved.sort((a, b) => {
      if (a._sortKey.group !== b._sortKey.group)
        return a._sortKey.group - b._sortKey.group;
      return a._sortKey.level - b._sortKey.level;
    });
    return resolved;
  }, [character, trackerMap, locale, t]);

  const filteredFeatures = useMemo(() => {
    if (!search.trim()) return features;
    return features.filter((f) => matchesSearch(search, f.name, f.nameEn));
  }, [features, search]);

  /** Group the filtered list into ordered sections for sec-head dividers. */
  const grouped = useMemo(() => {
    const order: FeatureGroup[] = ["class", "subclass", "race", "feat", "custom"];
    const headings: Record<FeatureGroup, string> = {
      class: t("features.classFeatures"),
      subclass: t("features.subclassFeatures"),
      race: t("features.racialTraits"),
      feat: t("features.feats"),
      custom: t("features.custom"),
    };
    return order
      .map((group) => ({
        group,
        heading: headings[group],
        items: filteredFeatures.filter((f) => f.group === group),
      }))
      .filter((section) => section.items.length > 0);
  }, [filteredFeatures, t]);

  if (!character) return null;

  function handleUse(feature: (typeof features)[number]) {
    if (!feature.tracker) return;
    const remaining = feature.tracker.total - feature.tracker.used;
    if (remaining <= 0) return;

    // Pool-based resources: show amount picker
    if (feature.tracker.isPool) {
      setPoolRequest({
        featureId: feature.id,
        featureName: feature.name,
        unit: feature.tracker.unit ?? "points",
        max: remaining,
        defaultAmount: 1,
      });
      return;
    }

    const message = t("combat.usedToast", {
      name: feature.name,
      remaining: remaining - 1,
      total: feature.tracker.total,
    });
    const featureId = feature.id;
    registerUndoableToast(
      { message },
      () => {
        consumeTracker(featureId);
        return () => restoreTracker(featureId);
      },
      { turnScoped: false }
    );
  }

  /** Restore one use (manual recovery / undo without the toast). */
  function handleRestore(feature: (typeof features)[number]) {
    if (!feature.tracker) return;
    if (feature.tracker.used <= 0) return;
    restoreTracker(feature.id);
  }

  function handlePoolConfirm(amount: number) {
    if (!poolRequest) return;
    const { featureId, featureName } = poolRequest;
    const tracker = trackerMap.get(featureId);
    if (!tracker) return;
    const remaining = tracker.total - tracker.used - amount;
    const message = t("combat.usedToast", {
      name: featureName,
      remaining: Math.max(0, remaining),
      total: tracker.total,
    });
    registerUndoableToast(
      { message },
      () => {
        consumeTracker(featureId, amount);
        return () => restoreTracker(featureId, amount);
      },
      { turnScoped: false }
    );
    setPoolRequest(null);
  }

  function handleDeleteFeature(feature: (typeof features)[number]) {
    const char = useCharacterStore.getState().character;
    if (!char) return;
    const removed = char.character.features[feature.idx];
    if (!removed) return;
    const message = t("common.deleted", { name: feature.name });
    registerUndoableToast(
      { message },
      () => {
        const cur = useCharacterStore.getState().character;
        if (!cur) return null;
        const list = [...cur.character.features];
        list.splice(feature.idx, 1);
        useCharacterStore.getState().setCharacter({
          ...cur,
          character: { ...cur.character, features: list },
        });
        return () => {
          const current = useCharacterStore.getState().character;
          if (!current) return;
          const restored = [...current.character.features];
          restored.splice(feature.idx, 0, removed);
          useCharacterStore.getState().setCharacter({
            ...current,
            character: { ...current.character, features: restored },
          });
        };
      },
      { turnScoped: false }
    );
  }

  /** Update a field on a feature ref at a given index. */
  function updateFeatureField(idx: number, field: string, value: string) {
    const store = useCharacterStore.getState();
    const char = store.character;
    if (!char) return;
    const featuresList = [...char.character.features];
    const ref = featuresList[idx];
    if (!ref) return;
    featuresList[idx] = { ...ref, [field]: value || undefined };
    store.setCharacter({
      ...char,
      character: { ...char.character, features: featuresList },
    });
  }

  return (
    <div>
      {/* Tab toolbar — search + (edit-mode) add. The cockpit tab bar already
          names this domain, so there is no page title. */}
      <div className="tab-toolbar">
        {/* W5/D19 — unified collapsible search (lens → field), same on every tab. */}
        <CollapsibleSearch
          value={search}
          onChange={setSearch}
          placeholder={t("features.searchPlaceholder")}
        />
        {isEdit && (
          <div className="toolbar-end">
            <Button size="sm" onClick={() => setFeatureModalOpen(true)}>
              <Icon as={Plus} size="sm" decorative />
              {t("character.addFeature")}
            </Button>
          </div>
        )}
      </div>

      <FeatureAddModal
        open={featureModalOpen}
        onClose={() => setFeatureModalOpen(false)}
      />

      {/* U6 — edit an existing custom feature in place (same modal, edit mode). */}
      <FeatureAddModal
        open={editCustom != null}
        onClose={() => setEditCustom(null)}
        editFeature={editCustom?.feature}
        editIndex={editCustom?.index}
      />

      {/* Pool spend modal for variable-cost features (Lay on Hands, etc.) */}
      <PoolSpendModal
        key={poolRequest?.featureId ?? "idle"}
        request={poolRequest}
        onConfirm={handlePoolConfirm}
        onCancel={() => setPoolRequest(null)}
      />

      {/* (The duplicate tablet/mobile RESOURCES tracker bar is dropped — the
          persistent Right HUD now owns the resource trackers on every viewport.
          Per-feature Spend/Restore lives in each card's accordion below.) */}

      {/* RAW-swappable subclass choices — review + (edit-mode) re-pick (#45 / U4).
          One section + one shared ChoiceRePicker per active track. */}
      {rePickGroups.map((g) => {
        const labelOf = (id: string) => g.options.find((o) => o.id === id)?.label ?? id;
        return (
          <div key={g.key}>
            <div className="mb-6">
              <SectionHeader title={g.title} meta={`${g.current.length}/${g.max}`} />
              <InfoCard className="flex flex-col gap-3">
                {g.current.length === 0 ? (
                  <p className="text-sm text-text-secondary">{t("rePick.none")}</p>
                ) : (
                  <ul className="flex flex-wrap gap-1.5">
                    {g.current.map((id) => (
                      <li key={id}>
                        <Badge variant="muted" size="sm">
                          {labelOf(id)}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
                {/* These are the RAW-swappable choice groups (weapon mastery even
                    swaps on a Long Rest), so the picker is reachable in BOTH modes
                    — an unmade pick is an open ask, and "Nothing chosen yet." with
                    no path in play mode was a dead end (Constitution §2.7). The
                    modal's Cancel/Save keeps the commit explicit. */}
                <div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setOpenRePick(g.key)}
                  >
                    {g.current.length === 0 ? t("rePick.choose") : t("rePick.change")}
                  </Button>
                </div>
              </InfoCard>
            </div>
            <ChoiceRePicker
              key={openRePick === g.key ? "open" : "closed"}
              open={openRePick === g.key}
              onClose={() => setOpenRePick(null)}
              max={g.max}
              options={g.options}
              current={g.current}
              onCommit={(ids) => commitRePick(g.field, ids)}
              eyebrow={g.eyebrow}
              title={g.title}
              label={g.label}
              searchPlaceholder={t("rePick.search")}
              seal={g.seal}
              detailFor={g.detailFor}
              detailTitleFor={g.detailTitleFor}
            />
          </div>
        );
      })}

      {/* A fruitless search says so (honest blanks — the inventory recipe). */}
      {search.trim() !== "" && filteredFeatures.length === 0 && (
        <RunicEmptyState
          glyph={Gem}
          size="sm"
          title={t("features.noMatch")}
          blurb={t("common.searchMissHint")}
        />
      )}

      {/* Feature list — grouped by source, one UniversalCard per feature.
          The numeric section count rides the gilt count medallion beside the
          title (the SectionHeader vocabulary; `meta` is for string totals). */}
      {grouped.map((section) => (
        <div key={section.group}>
          <SectionHeader title={section.heading} count={section.items.length} />
          <div className="uc-stack">
            {section.items.map((feature) => {
              const tracker = feature.tracker;
              const hasUses = tracker ? tracker.total - tracker.used > 0 : false;
              const comp = feature.companion;
              const compCur = comp ? (comp.current ?? comp.hpMax) : 0;

              // ── Gloss sub-line: source · action type · recovery ──
              const glossParts = [feature.source, actionTypeLabel(feature.actionType)];
              const recovery = localizeTrackerRecovery(tracker?.recovery, t);
              if (recovery) glossParts.push(recovery);
              const gloss = glossParts.filter(Boolean).join(" · ");

              // ── Verdict chip (honest blank when nothing decision-useful):
              //    tracked → remaining/total; else a scaling-rider value. ──
              // Each rider chip text ("Max CR 3", "+30 ft", "d8", "Plans Known 4",
              // "Magic Items 2") — the FIRST is shown as the PRIMARY verdict for an
              // untracked feature, OR every one is a SECONDARY pill beside the
              // use-count for a TRACKED feature (the use-count would otherwise
              // displace them). A feature can carry several (Artificer Replicate
              // Magic Item: Plans Known + Magic Items).
              const riderChips = feature.riders.map((r) =>
                chipText(r.value, `${localizeText(r.label, locale)} ${r.value}`)
              );
              let verdict: string | undefined;
              // Secondary pills: on a tracked feature ALL rider chips ride here; on
              // an untracked feature the first chip IS the verdict, the rest ride here.
              const secondaryChips = tracker ? riderChips : riderChips.slice(1);
              if (tracker) {
                const remaining = tracker.total - tracker.used;
                verdict = chipText(`${remaining} / ${tracker.total}`);
              } else if (riderChips.length > 0) {
                verdict = riderChips[0];
              }
              const riderSummary =
                secondaryChips.length > 0 ? (
                  <>
                    {secondaryChips.map((chip) => (
                      <span
                        key={chip}
                        className="uc-verdict"
                        data-o="neutral"
                        translate="no"
                      >
                        {chip}
                      </span>
                    ))}
                  </>
                ) : undefined;

              const hasDescription = Boolean(feature.description);
              // Always render an accordion so passive features still expose the
              // "always active" hint + notes; only a bare custom feature with no
              // description AND no notes (in play) would be empty — but the foot
              // hint always gives it body, so the card is always expandable.
              const slot = actionSlot(feature.actionType);

              return (
                <UniversalCard
                  key={feature.id}
                  mode="library"
                  kind={sealKind(feature.group)}
                  name={feature.name}
                  slot={slot}
                  gloss={gloss}
                  verdict={verdict}
                  verdictOutcome="buff"
                  riderSummary={riderSummary}
                  isEdit={isEdit}
                  ariaExpandLabel={t("common.expand")}
                  editAction={
                    // COMPUTED features (class / subclass / species / background /
                    // origin feats — derived idx:-1 OR a stored ref any choice
                    // computes) are read-only: no delete. You change them by
                    // changing the choice in Bio, which recomputes the list. Only
                    // homebrew (custom) + manually-added non-computed SRD features
                    // carry edit/delete.
                    isEdit && feature.idx >= 0 && !feature.isComputed ? (
                      <>
                        {/* Custom (homebrew) features can be corrected after
                            creation — the SRD-backed ones are immutable refs. */}
                        {feature.isCustom && (
                          <Button
                            size="sm"
                            variant="ghost"
                            iconOnly
                            onClick={() => {
                              if (feature.customRef)
                                setEditCustom({
                                  feature: feature.customRef,
                                  index: feature.idx,
                                });
                            }}
                          >
                            <Icon as={Pencil} size="sm" decorative />
                            <span className="sr-only">
                              {t("features.editCustom", {
                                name: feature.name,
                              })}
                            </span>
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          iconOnly
                          className="icon-danger"
                          onClick={() => handleDeleteFeature(feature)}
                        >
                          <Icon as={Trash2} size="sm" decorative />
                          <span className="sr-only">
                            {t("features.delete", { name: feature.name })}
                          </span>
                        </Button>
                      </>
                    ) : undefined
                  }
                  open={expandedId === feature.id}
                  onOpenChange={(open) => setExpandedId(open ? feature.id : null)}
                >
                  {hasDescription && (
                    <InlineMarkdown
                      text={feature.description}
                      className="uc-desc"
                      highlight={highlightRulesText(locale)}
                    />
                  )}

                  {/* Copy-to-2nd-target rider (PRIM) — what this feature also
                      grants a SECOND creature. Same quiet note recipe as the
                      player notes; read-only engine truth. */}
                  {copyNotes.get(feature.id)?.map((effect, i) => (
                    <p key={i} className="uc-note">
                      {effect}
                    </p>
                  ))}

                  {/* Companion stat block — AC + max HP derived from level/INT;
                      current HP tracked in session (±buttons in play mode). */}
                  {comp && (
                    <div className="uc-callout">
                      <div className="flex items-baseline justify-between">
                        <span className="font-semibold text-text-primary">
                          {comp.label}
                        </span>
                        {comp.kind && (
                          <span className="text-[length:var(--text-micro)] italic text-text-secondary">
                            {comp.kind}
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.68rem] text-text-secondary">
                        <span>
                          {t("stats.ac")}{" "}
                          <span className="font-mono font-semibold text-text-primary">
                            {comp.ac}
                          </span>
                        </span>
                        {comp.speed && (
                          <span>
                            {t("stats.spd")}{" "}
                            <span className="font-mono font-semibold text-text-primary">
                              {comp.speed}
                            </span>
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          {t("character.hp")}
                          {sheetMode === "play" && (
                            <button
                              type="button"
                              onClick={() => setCompanionHp(feature.id, compCur - 1)}
                              className="flex h-4 w-4 items-center justify-center rounded border border-border text-text-secondary hover:border-danger hover:text-danger"
                              aria-label={`−1 HP ${comp.label}`}
                            >
                              <Icon as={Minus} size="sm" decorative />
                            </button>
                          )}
                          <span className="font-mono font-semibold text-text-primary">
                            {compCur} / {comp.hpMax}
                          </span>
                          {sheetMode === "play" && (
                            <button
                              type="button"
                              onClick={() =>
                                setCompanionHp(
                                  feature.id,
                                  Math.min(comp.hpMax, compCur + 1)
                                )
                              }
                              className="flex h-4 w-4 items-center justify-center rounded border border-border text-text-secondary hover:border-success hover:text-success"
                              aria-label={`+1 HP ${comp.label}`}
                            >
                              <Icon as={Plus} size="sm" decorative />
                            </button>
                          )}
                        </span>
                      </div>

                      {/* Companion attacks — the orphaned `comp.attacks` data
                          (Force-Empowered Rend, Force Ballista) finally rendered:
                          one row per attack reusing the cockpit weapon-row recipe
                          (signed to-hit · word-free damage · reach/range). */}
                      {comp.attacks.length > 0 && (
                        <ul className="mt-2 space-y-1 border-t border-border/60 pt-2">
                          {comp.attacks.map((atk) => (
                            <li key={atk.id} className="text-[0.68rem] leading-snug">
                              <div className="flex flex-wrap items-baseline gap-x-2">
                                <span className="font-semibold text-text-primary">
                                  {atk.name}
                                </span>
                                <span className="font-mono text-text-secondary">
                                  {formatModifier(atk.attackBonus)} {t("srd.toHit")}
                                </span>
                                <span className="text-text-tertiary">·</span>
                                <span className="font-mono text-text-secondary">
                                  {atk.damage}
                                </span>
                                <span className="text-text-tertiary">·</span>
                                <span className="text-text-secondary">
                                  {atk.ranged ? t("spells.range") : t("srd.reach")}{" "}
                                  <span className="font-mono">
                                    {localeDistance(atk.reachFt, locale)}
                                  </span>
                                </span>
                              </div>
                              {atk.rider && (
                                <p className="text-text-tertiary">{atk.rider}</p>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {/* Live tracker — the folio `Tracker` molecule (pips ≤5 /
                      pool bar >5), token-driven. Spend/Restore wire only in play
                      mode (handleUse routes pool resources to the bilingual
                      PoolSpendModal + emits the undo toast). */}
                  {tracker &&
                    (() => {
                      const rec = trackerRecovery(tracker.recovery);
                      return (
                        <Tracker
                          name={t("features.usesRemaining")}
                          total={tracker.total}
                          used={tracker.used}
                          color={rec.color}
                          die={tracker.die}
                          recovery={rec.code}
                          recoveryLabel={localizeTrackerRecovery(tracker.recovery, t)}
                          isPool={tracker.isPool}
                          unit={tracker.unit}
                          onSpend={
                            sheetMode === "play" ? () => handleUse(feature) : undefined
                          }
                          onRestore={
                            sheetMode === "play"
                              ? () => handleRestore(feature)
                              : undefined
                          }
                          ariaSpend={`${t("combat.spend")} — ${feature.name}`}
                          ariaRestore={`${t("combat.restore")} — ${feature.name}`}
                        />
                      );
                    })()}

                  {/* Notes — editable in edit mode (only for STORED entries
                      with a real idx to write to; a derived origin feat has no
                      backing row, so it shows no notes editor), read-only
                      otherwise. */}
                  {isEdit && !feature.isCustom && feature.idx >= 0 ? (
                    <Textarea
                      style={{
                        marginTop: "var(--sp-2)",
                        minHeight: 56,
                        resize: "vertical",
                      }}
                      placeholder={t("common.notesPlaceholder")}
                      rows={2}
                      defaultValue={feature.notes}
                      aria-label={t("common.notesPlaceholder")}
                      onBlur={(e) =>
                        updateFeatureField(feature.idx, "notes", e.target.value)
                      }
                    />
                  ) : feature.notes ? (
                    <p className="uc-note">{feature.notes}</p>
                  ) : null}

                  {/* Foot: Use CTA for tracked features in play; otherwise the
                      honest "always active" hint for passives. */}
                  {tracker && sheetMode === "play" ? (
                    <UniversalCardFoot tags={[t("features.tagResource")]}>
                      <Button
                        size="sm"
                        disabled={!hasUses}
                        onClick={() => handleUse(feature)}
                      >
                        {t("common.use")}
                      </Button>
                    </UniversalCardFoot>
                  ) : !tracker && feature.actionType === "neutral" ? (
                    <UniversalCardFoot tags={[t("features.passive")]}>
                      <span
                        style={{
                          fontFamily: "var(--font-numeric)",
                          fontSize: "var(--text-sm)",
                          color: "var(--text-muted)",
                        }}
                      >
                        {t("features.alwaysActive")}
                      </span>
                    </UniversalCardFoot>
                  ) : null}
                </UniversalCard>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
