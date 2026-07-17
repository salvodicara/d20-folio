/**
 * BioTab — the cockpit's Bio domain (blueprint §2.4): identity + lineage/creation
 * choices, backstory, personality, physical description, languages/tools, the
 * level-up checklist, portrait editing, and personal notes.
 *
 * Re-homed verbatim from the pre-rewrite Lore page (+ the standalone Notes page
 * folded in as the closing "Notes" section — Bio owns personal notes). Read-only
 * in play mode; inline-editable when the cockpit's global edit toggle
 * (`uiStore.sheetMode`) is on. Reads the character straight from the store the
 * cockpit already populates — no route chrome, no page header.
 */

import { useState, useRef, useMemo } from "react";
import { useDismissOnOutside } from "@/hooks/useDismissOnOutside";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useCharacterStore } from "@/stores/characterStore";
import { useConfirmStore } from "@/stores/confirmStore";
import { useUndoStore } from "@/stores/undoStore";
import { useUIStore } from "@/stores/uiStore";
import { useLocale } from "@/hooks/useLocale";
import { usePortraitCrop } from "@/hooks/usePortraitCrop";
import {
  localizeClassName,
  localizeRaceName,
  localizeBackgroundName,
  localizeSubclassName,
  localizeText,
} from "@/lib/views/srd-i18n";
import { ALIGNMENT_IDS, asAlignmentId } from "@/lib/lore-utils";
import {
  displayLanguages,
  displayToolProficiencies,
  effectiveLanguageTokens,
  effectiveToolTokens,
  languageOptions,
  type EffectiveProficiencyToken,
} from "@/lib/views/sheet-view";
import { levelUpChangeArgs } from "@/lib/views/level-up-view";
import { classTables, classTableIndex } from "@/data/classes";
import { SRD_RACES } from "@/data/races";
import { asRaceId } from "@/data/srd-names";
import {
  SRD_BACKGROUNDS,
  findBackground,
  getBackgroundOriginFeat,
  getBackgroundFeatOptions,
} from "@/data/backgrounds";
import { getOriginFeats, FEATS_BY_ID } from "@/data/feats";
import {
  speciesGrantsVersatileFeat,
  resolveClassId,
  resolveSubclassId,
} from "@/lib/character-infer";
import {
  primaryClassEntry,
  primaryClassId,
  primarySubclassId,
  totalLevel,
} from "@/lib/classes";
import type { ClassEntry } from "@/types/character";
import type { RaceId, AlignmentId } from "@/types/ids";
import {
  reconcileBuildChoices,
  reconcileSessionAfterBuild,
  summarizeBuildDiscards,
  isDiscardSummaryEmpty,
  type BuildDiscardSummary,
} from "@/lib/reconcile-build";
import type { SrdFeatData } from "@/data/types";
import { toolOptions } from "@/components/shared/srd-option";
import { SrdTagPicker } from "@/components/shared/SrdTagPicker";
import { Portrait } from "@/components/shared/Portrait";
import { Select } from "@/components/shared/Select";
import { InfoCard } from "@/components/shared/InfoCard";
import { ChoicePickerCard } from "@/components/shared/ChoicePickerCard";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { PortraitCropModal } from "@/components/shared/PortraitCropModal";
import { PortraitLightbox } from "@/components/shared/PortraitLightbox";
import { PortraitEditMenu } from "@/components/shared/PortraitEditMenu";
import { BookOpen, Camera, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { RunicEmptyState } from "@/components/ui/runic-empty-state";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input, Textarea } from "@/components/ui/input";
import type { CharacterDoc } from "@/types/character";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { localizeSrd } from "@/i18n/resolver";

/** All Origin feats — the candidates for the species "Versatile" feat picker. */
const ORIGIN_FEATS = getOriginFeats();

export function BioTab() {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const character = useCharacterStore((s) => s.character);
  const sheetMode = useUIStore((s) => s.sheetMode);
  const {
    fileInputRef: portraitInputRef,
    cropSrc: portraitCropSrc,
    uploading: portraitUploading,
    initialCropArea: portraitInitialCropArea,
    onFileChange: onPortraitFileChange,
    onConfirm: onPortraitConfirm,
    onCancel: onPortraitCancel,
    openFilePickerForNew: openPortraitFilePicker,
    openRecrop: openPortraitRecrop,
    removePortrait,
  } = usePortraitCrop();
  const [portraitMenuOpen, setPortraitMenuOpen] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const portraitMenuRef = useRef<HTMLDivElement>(null);
  // Close the portrait menu on outside pointerdown / Escape (shared, capture-phase).
  useDismissOnOutside(portraitMenuOpen, portraitMenuRef, () =>
    setPortraitMenuOpen(false)
  );

  const setGrantBundleChoice = useCharacterStore((s) => s.setGrantBundleChoice);

  if (!character) return null;

  const { character: charData } = character;
  const { lore } = charData;
  const { session } = character;
  const isEdit = sheetMode === "edit";

  // ONE aggregate for this character — the grant pipeline run once. Feeds the
  // creation-time bundles (Elven/Gnomish Lineage) AND the effective languages /
  // tools display, which MUST match the cockpit rail (single source of truth).
  // Plain call (not useMemo) — it sits below this component's early returns, and
  // the prior code already aggregated inline here every render.
  const aggregate = aggregateCharacterGrants(charData, character.session);
  const creationBundles = aggregate.grantBundles.filter(
    (b) => b.choiceFrequency === "creation"
  );

  // Origin-feat editing — on-rails (CLAUDE.md: edit the CHOICE in Bio, the Features
  // tab recomputes). The `bgFeat` picker appears ONLY for choice-backgrounds (the
  // few with `featOptions`); a fixed background's feat isn't a choice (change the
  // background to change it). The species "Versatile" picker (any Origin feat)
  // appears only when the species grants it (2024 Human). Plain consts — they sit
  // below this component's early return.
  const bgFeatOptionFeats: SrdFeatData[] = getBackgroundFeatOptions(charData.background)
    .map((id) => FEATS_BY_ID.get(id))
    .filter((f): f is SrdFeatData => f !== undefined);
  const isChoiceBackground = bgFeatOptionFeats.length > 1;
  const effectiveBgFeat = getBackgroundOriginFeat(charData.background, charData.bgFeat);
  const showVersatileFeat = speciesGrantsVersatileFeat(charData.race);
  // The character's Origin feats (background + species), for the play-mode build
  // summary — so they're discoverable as something you can change in edit mode.
  const originFeatNames = [effectiveBgFeat, charData.humanOriginFeat]
    .filter(Boolean)
    .map((id) =>
      FEATS_BY_ID.has(id) ? localizeSrd("feat", id, "name", locale) : undefined
    )
    .filter((n): n is string => Boolean(n));

  const hasPersonality = lore.traits || lore.ideals || lore.bonds || lore.flaws;
  const hasAppearance =
    lore.age || lore.height || lore.weight || lore.eyes || lore.hair || lore.skin;

  function updateField<K extends keyof typeof charData>(
    key: K,
    value: (typeof charData)[K]
  ) {
    const store = useCharacterStore.getState();
    store.setCharacter({
      ...character,
      character: { ...charData, [key]: value },
    } as CharacterDoc);
  }

  // Atomic multi-field edit — used to reset a now-stale dependent choice in the
  // same write (change background → clear bgFeat; change race → clear
  // humanOriginFeat) so a pick can never linger on a build it no longer fits.
  function updateFields(partial: Partial<typeof charData>) {
    useCharacterStore.getState().setCharacter({
      ...character,
      character: { ...charData, ...partial },
    } as CharacterDoc);
  }

  // Edit a BUILD CHOICE (species / class / subclass / level / background / origin
  // feat) and RECONCILE the whole sheet in the SAME write: `reconcileBuildChoices`
  // re-derives every value the new choices fix (saving throws, hit die, spell
  // slots, the spellcasting block, the class/subclass feature set, Speed) and
  // drops picks the new build can't have (e.g. Fighter maneuvers after a
  // class change), so the choice is the single source of truth and every consumer
  // recomputes consistently with no stale entry. (It ends with `syncOriginFeats`.)
  //
  // A DESTRUCTIVE change — one that resets the subclass / prepared spells /
  // class-scoped picks, or drops features (a different class/subclass/species, or
  // a LOWER level) — first asks for confirmation in a modal (owner 2026-06-08: "a
  // modal asking for confirm warning that the choices made will be reset/lost, just
  // like when deleting a character"), LISTING exactly what will be discarded
  // (`summarizeBuildDiscards` — never silently destroy user choices). On cancel
  // nothing changes and the controlled picker reverts. Non-breaking edits
  // (level-up, lore, a feat swap) apply silently. The SESSION reconciles in the
  // SAME write (clamped HP/uses, no concentration on a removed spell).
  function applyBuild(next: typeof charData) {
    useCharacterStore.getState().setCharacter({
      ...character,
      character: next,
      session: reconcileSessionAfterBuild(charData, next, session),
    } as CharacterDoc);
    // Undo-stack FENCE (§5.4): a build edit reconciles the whole sheet (choices,
    // slots, features), so a pre-edit reverse-applier could restore state that no
    // longer coheres. Drop the stack on commit.
    useUndoStore.getState().clear();
  }

  /** First 4 localized names + a "+N more" tail (keeps the confirm scannable). */
  function nameList(ids: string[], localize: (id: string) => string): string {
    const names = ids.slice(0, 4).map(localize);
    const more = ids.length - names.length;
    return more > 0
      ? `${names.join(", ")} ${t("common.plusMore", { count: more })}`
      : names.join(", ");
  }

  /** The confirm modal's itemized consequences, localized from the id diff. */
  function discardDetails(summary: BuildDiscardSummary): string[] {
    const out: string[] = [];
    if (summary.subclassesCleared.length > 0) {
      out.push(
        t("bio.confirmReset.details.subclass", {
          names: nameList(summary.subclassesCleared, (id) =>
            localizeSubclassName(id, locale)
          ),
        })
      );
    }
    if (summary.featsRemoved.length > 0) {
      out.push(
        t("bio.confirmReset.details.feats", {
          names: nameList(summary.featsRemoved, (id) =>
            localizeSrd("feat", id, "name", locale)
          ),
        })
      );
    }
    if (summary.spellsRemoved.length > 0) {
      out.push(
        t("bio.confirmReset.details.spells", {
          names: nameList(summary.spellsRemoved, (id) =>
            localizeSrd("spell", id, "name", locale)
          ),
        })
      );
    }
    if (summary.classFeaturesRemoved > 0) {
      out.push(
        t("bio.confirmReset.details.features", {
          count: summary.classFeaturesRemoved,
        })
      );
    }
    if (summary.picksRemoved > 0) {
      out.push(t("bio.confirmReset.details.picks", { count: summary.picksRemoved }));
    }
    if (summary.expertiseDemoted.length > 0) {
      out.push(
        t("bio.confirmReset.details.expertise", {
          names: nameList(summary.expertiseDemoted, (id) => t(`skills.${id}`)),
        })
      );
    }
    if (summary.hpMaxDelta !== 0) {
      out.push(
        t("bio.confirmReset.details.hp", {
          delta: `${summary.hpMaxDelta > 0 ? "+" : ""}${summary.hpMaxDelta}`,
        })
      );
    }
    if (summary.abilityReviewNeeded) {
      out.push(t("bio.confirmReset.details.abilityScores"));
    }
    return out;
  }

  function setBuild(partial: Partial<typeof charData>) {
    const reconciled = reconcileBuildChoices(charData, { ...charData, ...partial });
    const destructive =
      resolveClassId(charData) !== resolveClassId(reconciled) ||
      resolveSubclassId(charData) !== resolveSubclassId(reconciled) ||
      charData.race !== reconciled.race ||
      totalLevel(reconciled) < totalLevel(charData);
    if (!destructive) {
      applyBuild(reconciled);
      return;
    }
    const summary = summarizeBuildDiscards(charData, reconciled);
    void useConfirmStore
      .getState()
      .confirm({
        title: t("bio.confirmReset.title"),
        message: t("bio.confirmReset.message"),
        ...(isDiscardSummaryEmpty(summary) ? {} : { details: discardDetails(summary) }),
        confirmLabel: t("bio.confirmReset.confirm"),
        tone: "warning",
      })
      .then((ok) => {
        if (ok) applyBuild(reconciled);
      });
  }

  /**
   * R4 — edit the PRIMARY class entry of `classes[]` (the single-class Bio editor
   * operates on the headline class). Merges `patch` onto the primary entry and runs
   * the same reconcile/confirm path as any build edit. Setting `classId` clears the
   * now-invalid subclass; clearing a pick deletes its key on the entry.
   */
  function setPrimaryEntry(patch: Partial<ClassEntry>) {
    const classes = charData.classes.map((e) => ({ ...e }));
    const primary = primaryClassEntry(charData);
    const idx = classes.findIndex(
      (e) => e.classId === primary.classId && e.level === primary.level
    );
    const target = idx >= 0 ? idx : 0;
    classes[target] = { ...(classes[target] ?? primary), ...patch };
    setBuild({ classes });
  }

  function updateLore<K extends keyof typeof lore>(key: K, value: (typeof lore)[K]) {
    const store = useCharacterStore.getState();
    store.setCharacter({
      ...character,
      character: { ...charData, lore: { ...lore, [key]: value } },
    } as CharacterDoc);
  }

  return (
    <>
      <PortraitCropModal
        key={portraitCropSrc ?? ""}
        open={portraitCropSrc !== null}
        imageSrc={portraitCropSrc ?? ""}
        initialCropArea={portraitInitialCropArea}
        onConfirm={(area) => void onPortraitConfirm(area)}
        onClose={onPortraitCancel}
      />
      <PortraitLightbox
        open={lightboxOpen}
        src={character.portraitUrl ?? ""}
        name={charData.name}
        onClose={() => setLightboxOpen(false)}
      />
      {/* Hidden file input wired to hook */}
      <input
        ref={portraitInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void onPortraitFileChange(e)}
      />
      <div>
        {/* Character header — folio carved card (info-card recipe) */}
        <InfoCard className="p-5">
          <div className="flex items-start gap-4">
            {/* Portrait — tall rectangle.
              Play mode: click → lightbox.
              Edit mode + portrait: click → options popover.
              Edit mode + no portrait: click → file picker. */}
            <div ref={portraitMenuRef} className="relative shrink-0">
              {/* Play mode + no portrait: the shared Portrait monogram fallback
                  (the same identity seal the header/roster show) instead of a
                  dead camera-in-a-button — a control that does nothing is a
                  false affordance; adding a photo is an edit-mode act. */}
              {!isEdit && !character.portraitUrl ? (
                <div className="relative flex w-24 shrink-0 overflow-hidden rounded-xl border-2 border-accent-primary/20 bg-bg-tertiary aspect-[3/4]">
                  <Portrait
                    src={null}
                    name={charData.name}
                    seed={character.id || charData.name}
                  />
                </div>
              ) : (
                <button
                  type="button"
                  disabled={portraitUploading}
                  aria-label={isEdit ? t("portrait.menu.edit") : t("portrait.menu.view")}
                  onClick={() => {
                    if (!isEdit && character.portraitUrl) {
                      setLightboxOpen(true);
                    } else if (isEdit) {
                      if (character.portraitUrl) {
                        setPortraitMenuOpen((v) => !v);
                      } else {
                        openPortraitFilePicker();
                      }
                    }
                  }}
                  className={cn(
                    "relative flex w-24 shrink-0 overflow-hidden rounded-xl border-2 bg-bg-tertiary",
                    "aspect-[3/4]",
                    isEdit
                      ? "cursor-pointer border-accent-primary/60 hover:border-accent-primary transition-colors"
                      : "cursor-zoom-in border-accent-primary/20"
                  )}
                >
                  {portraitUploading ? (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <Spinner size="md" />
                    </span>
                  ) : character.portraitUrl ? (
                    <>
                      {/* The SHARED Portrait primitive (#92) — same component as the
                        hero seal / roster / topbar, for one consistent fallback +
                        load behaviour. Deliberately NO `crop`: the Bio frame is the
                        big 3:4 "full portrait" view, so it `object-cover`s the whole
                        image (showing more of the figure) rather than the tight
                        per-surface crop — visually identical to the raw <img> it
                        replaced, just routed through the one primitive. */}
                      <Portrait
                        src={character.portraitUrl}
                        name={charData.name}
                        seed={character.id || charData.name}
                        loading="eager"
                      />
                      {/* Edit mode: the SAME affordance as the cockpit hero seal —
                        the shared `.seal-edit-veil` (a soft dark veil + centred gold
                        camera glyph with a drop-shadow). One recipe → the Bio
                        portrait and the header seal read identically in edit mode
                        (owner: consistency); `overflow-hidden` on the frame clips the
                        veil to the rounded corners, and it's `pointer-events:none` so
                        the click still opens the labelled popover. */}
                      {isEdit && (
                        <span className="seal-edit-veil" aria-hidden>
                          <Camera className="h-6 w-6" />
                        </span>
                      )}
                    </>
                  ) : (
                    // Only reachable in EDIT mode (play + no portrait renders the
                    // monogram fallback above): the add-photo affordance.
                    <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-text-secondary">
                      <Camera className="h-6 w-6 text-accent/70" />
                      <span className="text-center text-[length:var(--text-micro)] font-semibold uppercase tracking-wide text-accent px-1">
                        {t("portrait.crop.add")}
                      </span>
                    </span>
                  )}
                </button>
              )}

              {/* Portrait options popover — the shared folio menu (D21), so the Bio
                  editor and the cockpit hero seal offer the same actions + chrome. */}
              {portraitMenuOpen && (
                <PortraitEditMenu
                  className="left-0 top-full mt-1.5"
                  onRecrop={() => {
                    setPortraitMenuOpen(false);
                    openPortraitRecrop();
                  }}
                  onReplace={() => {
                    setPortraitMenuOpen(false);
                    openPortraitFilePicker();
                  }}
                  onRemove={() => {
                    setPortraitMenuOpen(false);
                    void removePortrait();
                  }}
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              {isEdit ? (
                <div className="flex flex-col gap-2">
                  {/* The character name is edited inline in the sheet HEADER —
                      there is exactly ONE name editor app-wide (E13). The Lore
                      page shows the name read-only as a heading even in edit
                      mode so the card still reads as a complete identity block. */}
                  <h3 className="font-display text-xl font-bold text-text-primary">
                    {charData.name}
                  </h3>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <SrdRaceSelect
                      value={charData.race}
                      onChange={(v) => setBuild({ race: v, humanOriginFeat: "" })}
                    />
                    <SrdClassSelect
                      value={primaryClassId(charData)}
                      onChange={(id) =>
                        // The select emits the canonical `classId` — the SINGLE
                        // source of truth (golden rule: never branch on labels). The
                        // primary `classes[]` entry's class changes; the now-invalid
                        // subclass is cleared. The reconcile re-derives the sheet.
                        setPrimaryEntry({ classId: id, subclassId: undefined })
                      }
                    />
                    <SrdSubclassSelect
                      classId={primaryClassId(charData)}
                      subclassId={primarySubclassId(charData)}
                      onChange={(id) => setPrimaryEntry({ subclassId: id || undefined })}
                    />
                    <EditableNumberInput
                      value={primaryClassEntry(charData).level}
                      onChange={(v) => setPrimaryEntry({ level: v })}
                      min={1}
                      max={20}
                      label={t("stats.lvl")}
                    />
                  </div>
                  {/* Lineage — a simple Select per species bundle (Elven / Gnomish /
                      Tiefling Legacy), consistent with race/class. Writes the
                      grant-bundle choice; the engine recomputes. */}
                  {creationBundles.map((b) => (
                    <ChoicePickerCard
                      key={b.bundleKey}
                      label={localizeText(b.label, locale)}
                    >
                      <Select
                        aria-label={localizeText(b.label, locale)}
                        value={b.selected ?? ""}
                        onChange={(e) =>
                          setGrantBundleChoice(b.bundleKey, e.target.value)
                        }
                      >
                        <option value="">—</option>
                        {b.options.map((o) => (
                          <option key={o.id} value={o.id}>
                            {localizeText(o.label, locale)}
                          </option>
                        ))}
                      </Select>
                    </ChoicePickerCard>
                  ))}
                  {/* Origin-feat choices — simple Selects, on-rails. The background
                      feat is a choice ONLY for choice-backgrounds (Pact Seeker etc.);
                      a fixed background's feat changes with the background, not here.
                      The species "Versatile" feat (any Origin feat) shows only when
                      the species grants it (2024 Human). Both write the choice; the
                      Features tab recomputes. */}
                  {isChoiceBackground && (
                    <ChoicePickerCard label={t("character.backgroundFeat")}>
                      <Select
                        aria-label={t("character.backgroundFeat")}
                        value={effectiveBgFeat}
                        onChange={(e) => setBuild({ bgFeat: e.target.value })}
                      >
                        {bgFeatOptionFeats.map((f) => (
                          <option key={f.id} value={f.id}>
                            {localizeSrd("feat", f.id, "name", locale)}
                          </option>
                        ))}
                      </Select>
                    </ChoicePickerCard>
                  )}
                  {showVersatileFeat && (
                    <ChoicePickerCard label={t("character.speciesFeat")}>
                      <Select
                        aria-label={t("character.speciesFeat")}
                        value={charData.humanOriginFeat}
                        onChange={(e) => setBuild({ humanOriginFeat: e.target.value })}
                      >
                        <option value="">—</option>
                        {ORIGIN_FEATS.map((f) => (
                          <option key={f.id} value={f.id}>
                            {localizeSrd("feat", f.id, "name", locale)}
                          </option>
                        ))}
                      </Select>
                    </ChoicePickerCard>
                  )}
                  {/* #77 — the redundant Bio "Level Up" button was removed: the
                      canonical entry is the CombatHeader Level-Up, and this one only
                      flipped a uiStore flag nothing observed (a dead control). The
                      Post-Level-Up Actions checklist below stays. */}
                  <EditableInput
                    value={charData.quote}
                    onChange={(v) => updateField("quote", v)}
                    placeholder={t("lore.quote")}
                    className="text-sm italic"
                  />
                </div>
              ) : (
                <>
                  <h3 className="font-display text-xl font-bold text-text-primary">
                    {charData.name}
                  </h3>
                  <div className="text-sm text-accent">
                    {localizeRaceName(charData.race, locale)}{" "}
                    {charData.classes
                      .map((e) => `${localizeClassName(e.classId, locale)} ${e.level}`)
                      .join(" / ")}
                    {primarySubclassId(charData)
                      ? ` (${localizeSubclassName(primarySubclassId(charData), locale)})`
                      : ""}
                  </div>
                  {/* Build choices shown read-only in play so they're discoverable
                      as editable (flip to edit mode to change them in place). */}
                  {originFeatNames.length > 0 && (
                    <div className="mt-0.5 text-xs">
                      <span className="text-text-muted">{t("features.feats")}: </span>
                      <span className="text-text-secondary">
                        {originFeatNames.join(", ")}
                      </span>
                    </div>
                  )}
                  {/* Show chosen lineage(s) inline in play mode; unselected ones hint to edit */}
                  {creationBundles.map((b) => {
                    const chosen = b.options.find((o) => o.id === b.selected);
                    return (
                      <div key={b.bundleKey} className="mt-0.5 text-xs">
                        <span className="text-text-muted">
                          {localizeText(b.label, locale)}:{" "}
                        </span>
                        {chosen ? (
                          <span className="text-text-secondary">
                            {localizeText(chosen.label, locale)}
                          </span>
                        ) : (
                          <span className="text-text-faint italic">
                            {t("lore.lineageNotChosen")}
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {charData.quote && (
                    <p className="mt-2 text-sm italic text-text-secondary">
                      &ldquo;{charData.quote}&rdquo;
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border-subtle pt-3 text-xs sm:grid-cols-3">
            {isEdit ? (
              <>
                <SrdBackgroundSelect
                  value={charData.background}
                  onChange={(v) => updateFields({ background: v, bgFeat: "" })}
                  label={t("character.background")}
                />
                <AlignmentSelect
                  value={charData.alignment}
                  onChange={(v) => updateField("alignment", v)}
                />
                <EditableLoreDetail
                  label={t("lore.player")}
                  value={charData.playerName}
                  onChange={(v) => updateField("playerName", v)}
                />
                <SrdPickerField
                  label={t("lore.languages")}
                  options={languageOptions()}
                  effective={effectiveLanguageTokens(
                    charData.languageIds,
                    charData.customLanguages,
                    aggregate,
                    locale
                  )}
                  valueIds={charData.languageIds}
                  customLabels={charData.customLanguages}
                  onChangeIds={(ids) => updateField("languageIds", ids)}
                  onChangeCustom={(labels) => updateField("customLanguages", labels)}
                />
                <SrdPickerField
                  label={t("lore.tools")}
                  options={toolOptions()}
                  effective={effectiveToolTokens(
                    charData.toolProficiencyIds,
                    charData.customToolProficiencies,
                    aggregate,
                    locale
                  )}
                  valueIds={charData.toolProficiencyIds}
                  customLabels={charData.customToolProficiencies}
                  onChangeIds={(ids) => updateField("toolProficiencyIds", ids)}
                  onChangeCustom={(labels) =>
                    updateField("customToolProficiencies", labels)
                  }
                />
              </>
            ) : (
              <>
                <LoreDetail
                  label={t("character.background")}
                  value={localizeBackgroundName(charData.background, locale)}
                />
                <LoreDetail
                  label={t("lore.alignment")}
                  value={localizeAlignment(charData.alignment, t)}
                />
                <LoreDetail label={t("lore.player")} value={charData.playerName} />
                {/* Effective (manual ids ∪ custom ∪ grants) — the SAME single-source
                    presenter the cockpit rail uses, so the Bio read-only view and the
                    rail can never show different languages/tools. */}
                <LoreDetail
                  label={t("lore.languages")}
                  value={displayLanguages(
                    charData.languageIds,
                    charData.customLanguages,
                    aggregate,
                    locale
                  )}
                />
                {displayToolProficiencies(
                  charData.toolProficiencyIds,
                  charData.customToolProficiencies,
                  aggregate,
                  locale
                ) && (
                  <LoreDetail
                    label={t("lore.tools")}
                    value={displayToolProficiencies(
                      charData.toolProficiencyIds,
                      charData.customToolProficiencies,
                      aggregate,
                      locale
                    )}
                  />
                )}
              </>
            )}
          </div>
        </InfoCard>

        {/* Personality Traits */}
        {(hasPersonality || isEdit) && (
          <div className="mb-6">
            <SectionHeader title={t("lore.personality")} />
            <div className="grid gap-3 sm:grid-cols-2">
              {isEdit ? (
                <>
                  <EditableLoreCard
                    title={t("lore.traits")}
                    value={lore.traits}
                    onChange={(v) => updateLore("traits", v)}
                  />
                  <EditableLoreCard
                    title={t("lore.ideals")}
                    value={lore.ideals}
                    onChange={(v) => updateLore("ideals", v)}
                  />
                  <EditableLoreCard
                    title={t("lore.bonds")}
                    value={lore.bonds}
                    onChange={(v) => updateLore("bonds", v)}
                  />
                  <EditableLoreCard
                    title={t("lore.flaws")}
                    value={lore.flaws}
                    onChange={(v) => updateLore("flaws", v)}
                  />
                </>
              ) : (
                <>
                  {lore.traits && (
                    <LoreCard title={t("lore.traits")} text={lore.traits} />
                  )}
                  {lore.ideals && (
                    <LoreCard title={t("lore.ideals")} text={lore.ideals} />
                  )}
                  {lore.bonds && <LoreCard title={t("lore.bonds")} text={lore.bonds} />}
                  {lore.flaws && <LoreCard title={t("lore.flaws")} text={lore.flaws} />}
                </>
              )}
            </div>
          </div>
        )}

        {/* Backstory */}
        {(lore.backstory || isEdit) && (
          <div className="mb-6">
            <SectionHeader title={t("lore.backstory")} />
            <InfoCard>
              {isEdit ? (
                <Textarea
                  value={lore.backstory}
                  onChange={(e) => updateLore("backstory", e.target.value)}
                  placeholder={t("lore.backstoryPlaceholder")}
                  rows={6}
                  className="w-full resize-none"
                />
              ) : (
                <div className="lore-prose flex flex-col gap-3">
                  {lore.backstory.split(/\n{2,}/).map((para, i) => (
                    <p key={i} className="info-val whitespace-pre-wrap">
                      {para}
                    </p>
                  ))}
                </div>
              )}
            </InfoCard>
          </div>
        )}

        {/* Physical Appearance */}
        {(hasAppearance || isEdit) && (
          <div className="mb-6">
            <SectionHeader title={t("lore.appearance")} />
            <InfoCard>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                {/* #65 — group the description by what a viewer reads: the
                    visible features (Eyes / Hair / Skin) first, then size
                    (Height / Weight), then Age last (was row-major Age-first). */}
                {isEdit ? (
                  <>
                    <EditableLoreDetail
                      label={t("lore.eyes")}
                      value={lore.eyes}
                      onChange={(v) => updateLore("eyes", v)}
                    />
                    <EditableLoreDetail
                      label={t("lore.hair")}
                      value={lore.hair}
                      onChange={(v) => updateLore("hair", v)}
                    />
                    <EditableLoreDetail
                      label={t("lore.skin")}
                      value={lore.skin}
                      onChange={(v) => updateLore("skin", v)}
                    />
                    <EditableLoreDetail
                      label={t("lore.height")}
                      value={lore.height}
                      onChange={(v) => updateLore("height", v)}
                    />
                    <EditableLoreDetail
                      label={t("lore.weight")}
                      value={lore.weight}
                      onChange={(v) => updateLore("weight", v)}
                    />
                    <EditableLoreDetail
                      label={t("lore.age")}
                      value={lore.age}
                      onChange={(v) => updateLore("age", v)}
                    />
                  </>
                ) : (
                  <>
                    {lore.eyes && <LoreDetail label={t("lore.eyes")} value={lore.eyes} />}
                    {lore.hair && <LoreDetail label={t("lore.hair")} value={lore.hair} />}
                    {lore.skin && <LoreDetail label={t("lore.skin")} value={lore.skin} />}
                    {lore.height && (
                      <LoreDetail label={t("lore.height")} value={lore.height} />
                    )}
                    {lore.weight && (
                      <LoreDetail label={t("lore.weight")} value={lore.weight} />
                    )}
                    {lore.age && <LoreDetail label={t("lore.age")} value={lore.age} />}
                  </>
                )}
              </div>
            </InfoCard>
          </div>
        )}

        {/* Empty state (only in play mode) — the shared runic empty state
            (rule 3), and it ACTS: one tap flips to edit mode to start writing. */}
        {!isEdit && !hasPersonality && !lore.backstory && !hasAppearance && (
          <RunicEmptyState
            glyph={BookOpen}
            size="sm"
            title={t("lore.emptyTitle")}
            blurb={t("lore.emptyBlurb")}
            actions={
              <Button
                variant="secondary"
                onClick={() => useUIStore.getState().setSheetMode("edit")}
              >
                <Icon as={Pencil} size="sm" decorative />
                {t("common.edit")}
              </Button>
            }
          />
        )}

        {/* Level-Up Checklist — shown whenever there are pending post-level-up actions */}
        {charData.levelUpChecklist && charData.levelUpChecklist.length > 0 && (
          <div className="mb-6">
            <SectionHeader title={t("lore.levelUpChecklist")} />
            <div className="flex flex-col gap-2">
              {charData.levelUpChecklist.map((item, idx) => {
                const label = item.i18nKey
                  ? t(item.i18nKey, item.text, levelUpChangeArgs(item, locale))
                  : item.text;
                return (
                  <button
                    key={idx}
                    onClick={() => {
                      const updated = charData.levelUpChecklist
                        ? charData.levelUpChecklist.map((it, i) =>
                            i === idx ? { ...it, done: !it.done } : it
                          )
                        : null;
                      updateField("levelUpChecklist", updated);
                    }}
                    className="flex items-center gap-3 rounded-xl border border-border bg-bg-secondary px-4 py-3 text-left transition-colors hover:bg-bg-tertiary"
                  >
                    {/* The canonical brass `.cb` checkbox (visual-only — the row IS the
                        toggle, so a nested Radix button would be invalid). `data-attention`
                        keeps the amber "still to do" cue on a PENDING item; done flips to
                        the gold ✓ — one checkbox vocabulary, no bespoke round ring. */}
                    <span
                      className="cb shrink-0"
                      data-state={item.done ? "checked" : "unchecked"}
                      data-attention={item.done ? undefined : ""}
                      aria-hidden
                    />
                    <span
                      className={cn(
                        "text-sm",
                        item.done ? "text-text-muted line-through" : "text-text-primary"
                      )}
                    >
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {/* Notes were removed from Bio (#104 follow-up): session notes are edited
            in ONE place — the right-rail post-it (`RailNotes`), reachable on every
            viewport (a side column on desktop, behind the "Resources" disclosure on
            mobile). A second editor here for the same `session.notes` was a
            duplicate surface (golden rules 6 + 19). */}
      </div>
    </>
  );
}

// ─── Edit Mode Components ────────────────────────────────────────────────────

function EditableInput({
  value,
  onChange,
  placeholder,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn("input", className)}
    />
  );
}

function SrdClassSelect({
  value,
  onChange,
}: {
  /** The canonical class id (source of truth) — NOT the display label. */
  value: string;
  onChange: (id: string) => void;
}) {
  const { t: translate } = useTranslation();
  const { language: locale } = useLocale();
  // Memoize the sort: 12 classes, but sorting on every keystroke is wasteful.
  const options = useMemo(() => {
    return [...classTables]
      .map((t) => ({ id: t.id, label: localizeSrd("class", t.id, "name", locale) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [locale]);
  // Match by ID (the value is a classId); a homebrew/unknown id falls through to
  // its own option so the select always shows the current value.
  const matched = classTables.some((t) => t.id === value);
  return (
    <Select
      aria-label={translate("character.class", "Class")}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {!matched && value && (
        <option value={value}>{localizeClassName(value, locale)}</option>
      )}
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}

/**
 * Subclass select — lists the CURRENT class's subclasses (the same simple
 * dropdown as class/race). Reads tolerantly (the stored `subclass` may be the id
 * or the EN/IT name across creation paths) and always WRITES both the canonical
 * EN name + the stable `subclassId`. No subclasses for the class → just the
 * placeholder.
 */
function SrdSubclassSelect({
  classId,
  subclassId,
  onChange,
}: {
  classId: string;
  subclassId: string;
  onChange: (id: string) => void;
}) {
  const { t: translate } = useTranslation();
  const { language: locale } = useLocale();
  const subs = classTableIndex.get(classId)?.subclasses ?? [];
  const selectedId = subs.find((s) => s.id === subclassId)?.id ?? "";
  return (
    <Select
      aria-label={translate("character.subclass")}
      value={selectedId}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{translate("character.subclass")}</option>
      {subs.map((s) => (
        <option key={s.id} value={s.id}>
          {localizeSrd("subclass", s.id, "name", locale)}
        </option>
      ))}
    </Select>
  );
}

function SrdRaceSelect({
  value,
  onChange,
}: {
  value: RaceId;
  onChange: (v: RaceId) => void;
}) {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const options = useMemo(() => {
    return [...SRD_RACES]
      .map((r) => ({
        // The select binds to and emits the STABLE race id (golden rule 7);
        // the visible label is DERIVED from the id for display only.
        id: r.id,
        label: localizeRaceName(r.id, locale),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [locale]);
  const matched = options.some((r) => r.id === value);
  return (
    <Select
      aria-label={t("character.species")}
      value={value}
      onChange={(e) => onChange(asRaceId(e.target.value))}
    >
      {!matched && value && (
        <option value={value}>{localizeRaceName(value, locale)}</option>
      )}
      {options.map((r) => (
        <option key={r.id} value={r.id}>
          {r.label}
        </option>
      ))}
    </Select>
  );
}

function EditableNumberInput({
  value,
  onChange,
  min,
  max,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[0.65rem] text-text-secondary">{label}</span>
      <Input
        type="number"
        value={value}
        aria-label={label}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (v >= min && v <= max) onChange(v);
        }}
        min={min}
        max={max}
        className="sm w-14 center"
      />
    </div>
  );
}

function EditableLoreDetail({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <span className="block text-[length:var(--text-micro)] font-bold uppercase tracking-wider text-text-secondary">
        {label}
      </span>
      {/* Prose appearance value — left-aligned (the base `.input`); the compact
          `.input.sm` centres its text, which is right for numeric steppers but made
          short values like Age "26" read as centred/misaligned next to the longer
          eye/hair fields. */}
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={label}
        className="mt-0.5 w-full"
      />
    </div>
  );
}

function EditableLoreCard({
  title,
  value,
  onChange,
}: {
  title: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <InfoCard>
      <h4 className="sec-title mb-2 text-base">{title}</h4>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`${title}...`}
        rows={3}
        className="w-full resize-none"
      />
    </InfoCard>
  );
}

// ─── Play Mode Components ────────────────────────────────────────────────────

/**
 * Aspect card (traits / ideals / bonds / flaws) on the folio `.info-card`
 * recipe — carved card depth, display-italic rubric, body-font prose. Replaces
 * the pre-folio uppercase-mono title + raw Tailwind border.
 */
function LoreCard({ title, text }: { title: string; text: string }) {
  return (
    <InfoCard>
      <h4 className="sec-title mb-2 text-base">{title}</h4>
      <p className="info-val whitespace-pre-wrap">{text}</p>
    </InfoCard>
  );
}

function LoreDetail({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <span className="block text-[length:var(--text-micro)] font-bold uppercase tracking-wider text-text-secondary">
        {label}
      </span>
      <span className="mt-0.5 block text-xs font-medium text-text-primary">{value}</span>
    </div>
  );
}

// ─── Alignment helpers ────────────────────────────────────────────────────────

/** Localize an alignment ID to its display label via the id-keyed i18n catalogue. */
function localizeAlignment(value: AlignmentId, t: TFunction): string {
  if (!value) return value;
  return t(`lore.alignments.${value}`);
}

/** Select component for choosing alignment. Binds + emits the stable alignment ID. */
function AlignmentSelect({
  value,
  onChange,
}: {
  value: AlignmentId;
  onChange: (v: AlignmentId) => void;
}) {
  const { t } = useTranslation();
  const matched = ALIGNMENT_IDS.includes(value);
  return (
    <div>
      <span className="block text-[length:var(--text-micro)] font-bold uppercase tracking-wider text-text-secondary">
        {t("lore.alignment")}
      </span>
      <Select
        size="sm"
        aria-label={t("lore.alignment")}
        value={value}
        onChange={(e) => onChange(asAlignmentId(e.target.value))}
        className="mt-0.5 w-full"
      >
        <option value="">{t("lore.alignmentPlaceholder")}</option>
        {!matched && value && (
          <option value={value}>{t(`lore.alignments.${value}`)}</option>
        )}
        {ALIGNMENT_IDS.map((id) => (
          <option key={id} value={id}>
            {t(`lore.alignments.${id}`)}
          </option>
        ))}
      </Select>
    </div>
  );
}

/**
 * Select component for choosing a background from the SRD list.
 *
 * Binds to and emits the STABLE background id (golden rule 7) — live docs store
 * ids ("criminal"), so the previous EN-name binding matched nothing and the
 * browser silently displayed the FIRST option (a wrong background for every real
 * character), and re-picking wrote a display string back into the doc. The
 * incoming value is normalized through `findBackground` (id passthrough +
 * EN/IT-name tolerance for older docs); an unresolvable homebrew string keeps
 * its own option so the select always shows the current value.
 */
function SrdBackgroundSelect({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  const { language: locale } = useLocale();
  const options = useMemo(() => {
    return [...SRD_BACKGROUNDS]
      .map((b) => ({
        id: b.id,
        label: localizeSrd("background", b.id, "name", locale),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [locale]);
  const selectedId = findBackground(value)?.id;
  return (
    <div>
      <span className="block text-[length:var(--text-micro)] font-bold uppercase tracking-wider text-text-secondary">
        {label}
      </span>
      <Select
        size="sm"
        aria-label={label}
        value={selectedId ?? value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 w-full"
      >
        {!selectedId && value && (
          <option value={value}>{localizeBackgroundName(value, locale)}</option>
        )}
        {options.map((b) => (
          <option key={b.id} value={b.id}>
            {b.label}
          </option>
        ))}
      </Select>
    </div>
  );
}

// ─── SRD picker helpers ───────────────────────────────────────────────────────

/**
 * Labeled wrapper for `SrdTagPicker` that matches the visual style of
 * `EditableLoreDetail` (micro-cap label above the field).
 */
function SrdPickerField({
  label,
  options,
  effective,
  valueIds,
  customLabels,
  onChangeIds,
  onChangeCustom,
}: {
  label: string;
  options: ReadonlyArray<{
    id: string;
    name: { en: string; it: string };
    pickable?: boolean;
  }>;
  effective: ReadonlyArray<EffectiveProficiencyToken>;
  valueIds: ReadonlyArray<string>;
  customLabels: ReadonlyArray<string>;
  onChangeIds: (ids: string[]) => void;
  onChangeCustom: (labels: string[]) => void;
}) {
  return (
    <div>
      <span className="text-[length:var(--text-micro)] font-bold uppercase tracking-wider text-text-secondary">
        {label}
      </span>
      <div className="mt-0.5">
        <SrdTagPicker
          options={options}
          effective={effective}
          valueIds={valueIds}
          customLabels={customLabels}
          onChangeIds={onChangeIds}
          onChangeCustom={onChangeCustom}
          label={label}
        />
      </div>
    </div>
  );
}
