/**
 * CombatHeader — the full-width identity band + the AC · Init · Speed · PB
 * vitals strip, each an inline override (the mock's ✎ affordance) via the
 * shared `InlineEditable` primitive: the value renders the engine-computed
 * default and writes an override through the SAME `characterStore` seam the
 * sheet uses (Constitution #1 — override-first, no forked persistence).
 *
 * THE LIVING SHEET — Rest and Level Up are not command-line buttons: Rest is a
 * glyph-only wax-seal moon medallion trailing the HP tile (opens the Rest
 * modal), and Level Up is pure availability ceremony — a gilded chevron gem on
 * the hero seal + a gold chip beside the lineage (present only below L20) that
 * routes to the full-screen level-up wizard (`/characters/:id/level-up`). Both
 * are owner-only (hidden in the read-only glass case), and neither renders any
 * standing verb text — the verb lives in the branded hover tooltip + aria (never a
 * native `title`), so the vitals-row geometry is byte-identical EN vs IT.
 *
 * Every number is derived by the engine (`compute.ts` over the aggregated
 * grants); the header never recomputes D&D math itself. The expensive grant
 * aggregate is memoized; the header reads only the sheet + exhaustion, so a
 * center HP edit or a tab switch can't re-render it.
 *
 * The masthead carries NO management chrome — the edit toggle (and Undo · Redo ·
 * ⋯) lives in the fob family off the masthead: the Binder's Fob's ✎ coin on
 * desktop, the Signet on mobile (both `uiStore.sheetMode`, Esc-to-exit). There is
 * ONE edit signal app-wide (`sheetMode`): the name + the vitals gate their inline
 * editors on it — play mode renders clean read-only text, edit mode exposes the ✎
 * affordance + override indicator — and it flips the tab content's bulk-edit flows
 * (add-spell / edit-lore / equip) together.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { totalLevel } from "@/lib/classes";
import { useDismissOnOutside } from "@/hooks/useDismissOnOutside";
import { useTranslation } from "react-i18next";
import { Award, Camera, ChevronsUp, Dices, Footprints, Moon, Shield } from "lucide-react";
import { useCharacterStore } from "@/stores/characterStore";
import { useUIStore } from "@/stores/uiStore";
import { useSheetReadonly } from "@/hooks/useSheetReadonly";
import { RestModal } from "../RestModal";
import {
  abilityModifier,
  proficiencyBonus,
  computeInitiative,
  buildInitiativeBreakdown,
  hasInitiativeAdvantage,
  characterHasFeat,
  effectiveAbilityScores,
} from "@/lib/compute";
import {
  aggregateCharacterGrants,
  computeCharacterAC,
  computeCharacterAcBreakdown,
} from "@/lib/aggregate-character";
import { localizeBreakdown } from "@/lib/views/combat-action-view";
import { effectiveWalkingSpeedFt } from "@/lib/smart-tracker";
import { getEquipment } from "@/data/equipment";
import { InlineEditable } from "@/components/shared/InlineEditable";
import { StatBadge } from "@/components/shared/StatBadge";
import { BreakdownTip } from "@/components/shared/BreakdownTip";
import { GlossaryTip } from "@/components/shared/GlossaryTip";
import { Portrait } from "@/components/shared/Portrait";
import { PortraitLightbox } from "@/components/shared/PortraitLightbox";
import { PortraitCropModal } from "@/components/shared/PortraitCropModal";
import { PortraitEditMenu } from "@/components/shared/PortraitEditMenu";
import { usePortraitCrop } from "@/hooks/usePortraitCrop";
import { Icon } from "@/components/ui";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import { useLocale } from "@/hooks/useLocale";
import { formatSpeed, speedFromLocaleValue, speedToLocaleValue } from "@/lib/utils";
import { patchCharacter } from "../patch-character";
import { nonEmptyString } from "@/lib/non-empty-string";
import { localizeCharacterIdentity } from "@/lib/views/srd-i18n";
import { HeaderHpControl } from "./HeaderHpControl";
import { HoverTip } from "./HoverTip";

/** Folio modifier convention: U+2212 minus, explicit + for non-negatives. */
function fmtMod(mod: number): string {
  return mod >= 0 ? `+${mod}` : `−${Math.abs(mod)}`;
}

export function CombatHeader() {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  // The full doc — `effectiveWalkingSpeedFt` needs `character` + `session`
  // (equipped armor, active toggles, exhaustion) to resolve the S13 walking Speed.
  const characterDoc = useCharacterStore((s) => s.character);
  const charData = useCharacterStore((s) => s.character?.character);
  const exhaustion = useCharacterStore((s) => s.character?.session.exhaustion ?? 0);
  // Narrow session slices the aggregate needs — kept separate from the sheet so a
  // mid-combat HP/round change can't re-run the grant aggregation, and so a chosen
  // lineage's grants (darkvision, granted spells, resistances) actually flow into
  // the header derivations (#90).
  const activeFeatures = useCharacterStore((s) => s.character?.session.activeFeatures);
  const grantBundleChoices = useCharacterStore(
    (s) => s.character?.session.grantBundleChoices
  );
  // Portrait lives at the DOC level (not in charData) — feeds the hero seal (#92).
  const portraitUrl = useCharacterStore((s) => s.character?.portraitUrl);
  const portraitCrop = useCharacterStore((s) => s.character?.portraitCrop);
  const charId = useCharacterStore((s) => s.character?.id);
  // T4 — when read-only (a DM viewing a member's sheet) the header is forced to
  // play mode and ALL of its edit / management affordances (the edit pill, Rest,
  // Level-Up, Snapshots, the portrait editor, every inline override) are hidden;
  // the vitals render as clean read-only text.
  const readonly = useSheetReadonly();
  // Fine pointers get the branded hover tooltip on the Rest / Level-Up controls;
  // touch renders them bare (the aria-label still names them) — see HoverTip.
  const fineTip = !useCoarsePointer();
  // The masthead is PURE identity + vitals on every viewport (owner-ratified,
  // 2026-07-11): the management chrome lives entirely off the masthead in the
  // fob family — the Binder's Fob on desktop, the Signet on mobile (both fixed,
  // both reachable at every scroll depth) — so the right deck is the vitals
  // strip alone, aligned clean against the identity, EN/IT geometry-identical.
  const sheetMode = useUIStore((s) => (readonly ? "play" : s.sheetMode));
  const setSheetMode = useUIStore((s) => s.setSheetMode);
  const navigate = useNavigate();
  const [restOpen, setRestOpen] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  // D21 — the hero portrait opens the full-size lightbox in play mode (the Bio
  // tab already did this; the header seal silently didn't). Only when a real
  // portrait exists — the lettered fallback isn't worth a lightbox.
  const isEdit = sheetMode === "edit";
  const canViewPortrait = !!portraitUrl && !isEdit;

  // D21 — in EDIT mode the hero seal also adds/edits/removes the portrait, reusing
  // the SAME shared flow as the Bio editor (one upload/crop/remove implementation).
  // The redundancy (Bio keeps its editor too) is intentional, per the owner.
  const {
    fileInputRef: portraitInputRef,
    cropSrc: portraitCropSrc,
    initialCropArea: portraitInitialCropArea,
    onFileChange: onPortraitFileChange,
    onConfirm: onPortraitConfirm,
    onCancel: onPortraitCancel,
    openFilePickerForNew: openPortraitFilePicker,
    openRecrop: openPortraitRecrop,
    removePortrait,
  } = usePortraitCrop();
  const [portraitMenuOpen, setPortraitMenuOpen] = useState(false);
  const portraitMenuRef = useRef<HTMLDivElement>(null);
  // Close the portrait menu on outside pointerdown / Escape (shared, capture-phase).
  useDismissOnOutside(portraitMenuOpen, portraitMenuRef, () =>
    setPortraitMenuOpen(false)
  );

  function onSealEdit(): void {
    if (portraitUrl) setPortraitMenuOpen((v) => !v);
    else openPortraitFilePicker();
  }

  const initAgg = useMemo(
    () =>
      charData
        ? aggregateCharacterGrants(charData, { activeFeatures, grantBundleChoices })
        : null,
    [charData, activeFeatures, grantBundleChoices]
  );

  // Esc exits edit mode (parity with the pre-rewrite sheet; the pill's hint
  // surfaces the shortcut). Only armed while editing, so it never swallows Esc
  // from modals/popovers in play mode.
  useEffect(() => {
    if (sheetMode !== "edit") return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") setSheetMode("play");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetMode, setSheetMode]);

  if (!charData || !initAgg) {
    return (
      <header className="mb-6 border-b border-border-soft pb-5">
        <h1 className="font-display text-2xl font-bold leading-tight text-text-primary">
          {t("character.loading")}
        </h1>
      </header>
    );
  }

  const name = charData.name;
  // Shared srd-i18n source of truth: "Elfo · Bardo 9" in IT (species + class are
  // stored as English strings/slugs and resolve via the SRD BiText maps).
  const identity = localizeCharacterIdentity(charData, locale);

  const level = totalLevel(charData);
  const tablePB = proficiencyBonus(level);
  const effectivePB = charData.proficiencyBonusOverride ?? tablePB;
  const effectiveScores = effectiveAbilityScores(
    charData.abilityScores,
    initAgg.abilityScoreFloors,
    initAgg.itemAbilityScoreBonus,
    initAgg.itemAbilityScoreCap
  );
  // Single AC formula shared with the persisted snapshot the roster reads (6b):
  // computed default (for the inline-edit hint + reset) and the override-aware value.
  const computedAc = computeCharacterAC(charData, initAgg);
  const acValue = charData.acOverride ?? computedAc;
  const hasAlertFeat = characterHasFeat("alert", {
    humanOriginFeat: charData.humanOriginFeat,
    bgFeat: charData.bgFeat,
    features: charData.features,
  });
  const initiativeGrantBonus =
    initAgg.initiativeBonusFlat +
    initAgg.initiativeBonusAbilities.reduce(
      (sum, a) => sum + abilityModifier(effectiveScores[a]),
      0
    );
  const computedInitiative = computeInitiative(
    effectiveScores.DEX,
    effectivePB,
    hasAlertFeat,
    exhaustion,
    initiativeGrantBonus
  );
  const initValue = charData.initiativeBonusOverride ?? computedInitiative;

  // Breakdown tips (play mode only) — the "where does this number come from?"
  // composition behind AC + Initiative. Suppressed under a manual override (a
  // hand-pinned value has no engine composition) and when only one component
  // exists (golden rule 19 — earn its place). The SAME `BreakdownTip` register
  // the weapon damage label rides (golden rule 3).
  const acBreakdown =
    charData.acOverride == null
      ? localizeBreakdown(computeCharacterAcBreakdown(charData, initAgg), locale)
      : [];
  const initBreakdownParts =
    charData.initiativeBonusOverride == null
      ? buildInitiativeBreakdown(
          effectiveScores.DEX,
          effectivePB,
          hasAlertFeat,
          exhaustion,
          initiativeGrantBonus
        )
      : [];
  const initBreakdown = localizeBreakdown(initBreakdownParts, locale);
  // #68 / U2 — initiative ADVANTAGE is override-first too: it auto-derives from
  // `advantage-on { rollType: "initiative" }` grants (Assassin's Assassinate,
  // Bard's Superior Inspiration top-up is separate), and a manual tri-state lets
  // the player force it on/off. Surfaced only on the Init vital, only when
  // relevant (a quiet gold mark in play, a corner toggle in edit) so it never
  // clutters the header. Gold = the app's boon hue (matches `.uc-verdict`).
  const initAdvOverride = charData.initiativeAdvantageOverride;
  const initAdvActive = hasInitiativeAdvantage(initAgg, initAdvOverride);
  function cycleInitAdvantage(): void {
    // auto (null) → always (true) → never (false) → auto (null)
    const next = initAdvOverride == null ? true : initAdvOverride ? false : null;
    patchCharacter({ initiativeAdvantageOverride: next });
  }
  const initAdvStateLabel =
    initAdvOverride == null
      ? t("character.vitals.initAdvAuto")
      : initAdvOverride
        ? t("character.vitals.initAdvOn")
        : t("character.vitals.initAdvOff");
  // S13 — the EFFECTIVE walking Speed (override-first, mirroring AC). The
  // computed value flows Mobile / Fast Movement / Unarmored Movement / Roving /
  // Boots of Speed (×2) / exhaustion / the heavy-armor Strength penalty through
  // `effectiveWalkingSpeedFt`; `speedOverride` pins it by hand. `formatSpeed`
  // renders the canonical feet in locale units; editing happens in LOCALE units
  // (#67 — metres in IT, feet in EN), round-tripped to a stored feet override.
  const computedSpeedFt = characterDoc
    ? effectiveWalkingSpeedFt(characterDoc, getEquipment)
    : 0;
  const speedFt = charData.speedOverride ?? computedSpeedFt;
  const toLocaleNum = (ft: number): number =>
    parseFloat(speedToLocaleValue(ft, locale).replace(",", ".")) || 0;
  const speedEditValue = toLocaleNum(speedFt);
  const computedSpeedLocale = toLocaleNum(computedSpeedFt);

  // THE LIVING SHEET — Rest and Level Up are quiet ceremony ON the sheet itself,
  // never loud command buttons (owner-ratified, Fable-designed):
  //   · Rest = a glyph-only wax-seal moon medallion trailing the HP tile (the
  //     verb lives in the branded hover tooltip + aria — zero rendered locale
  //     text, so the vitals-row geometry is identical EN vs IT).
  //   · Level Up = pure AVAILABILITY ceremony — a single gold chip beside the
  //     lineage announcing the AWAITING level (the portrait seal carries NO
  //     level-up mark — owner: users won't read the gem; the chip alone carries
  //     availability). Absent at L20 (the shipped availability knowledge) and,
  //     like every management affordance, owner-only (hidden in the glass case).
  const showLevelCeremony = !readonly && level < 20;
  const levelChip = showLevelCeremony ? (
    <HoverTip show={fineTip} content={t("character.levelUp")}>
      <button
        type="button"
        className="lvl-chip"
        onClick={() => void navigate(`/characters/${charId ?? ""}/level-up`)}
        // 2.5.3 Label-in-Name — the accessible name CONTAINS the visible "Level {n}"
        // AND carries the verb, so a screen reader hears the full action. On hover
        // (fine pointer) the branded HoverTip surfaces the verb; touch reads the aria.
        aria-label={t("character.levelUpChipAria", { level: level + 1 })}
      >
        <Icon as={ChevronsUp} size="xs" decorative />
        {t("character.levelUpChip", { level: level + 1 })}
      </button>
    </HoverTip>
  ) : null;
  const restMedal = !readonly ? (
    <HoverTip show={fineTip} content={t("character.rest")}>
      <button
        type="button"
        className="rest-medal"
        onClick={() => setRestOpen(true)}
        aria-label={t("character.rest")}
      >
        <span className="rm-coin">
          <Icon as={Moon} size="sm" decorative />
        </span>
      </button>
    </HoverTip>
  ) : null;

  return (
    <header className="relative folio-panel gilt-frame mb-6 flex flex-col gap-4 px-5 py-4 md:flex-row md:items-center md:justify-between">
      {/* `md:grow` + the name block's `grow` below (auto basis, so tight-width
          wrap competition with the actions cluster is unchanged): the identity
          block must take the header's FREE space, never shrink-to-fit around the
          name. When every ancestor is content-sized, the h1's width derives from
          the edit-mode InlineEditable button's intrinsic contribution, which
          Chromium under-measures by a sub-pixel (~0.67px at 1440) for an atomic
          box with horizontal padding around fractional-width text — so the name
          folded onto two balanced lines INSIDE a half-empty header (the
          "Coralino di / Sanvaldo" edit-mode wrap bug). Given definite room, the
          button's fit-content is exact: one line whenever there is room, a
          space-wrap only when genuinely necessary (No-Truncation Rule).

          `md:shrink-0` (+ the 65% cap): flexbox shrinks BOTH children in
          proportion to their unwrapped max-content basis, and the right deck's
          one-line basis (the five-vitals row) still dwarfs the identity's — so
          across the 721–1023 band the identity was squeezed and "Lyra Voss"
          folded beside a half-empty header while the deck wrapped internally
          anyway. Never shrink the identity; let the deck wrap. The `max-w` cap
          keeps a genuinely long name wrapping inside the header instead of
          overflowing it. */}
      <div className="flex items-center gap-3.5 md:max-w-[65%] md:grow md:shrink-0">
        {isEdit ? (
          // D21 — edit mode: the seal is the portrait editor (add when empty, or a
          // Re-crop / Upload / Remove menu when set). Reuses usePortraitCrop +
          // PortraitEditMenu, so it matches the Bio editor exactly.
          <div ref={portraitMenuRef} className="relative flex-shrink-0">
            <button
              type="button"
              onClick={onSealEdit}
              className="seal relative flex h-14 w-14 cursor-pointer items-center justify-center rounded-md font-display text-xl"
              aria-label={t("portrait.menu.edit")}
              title={t("portrait.menu.edit")}
              aria-haspopup={portraitUrl ? "menu" : undefined}
              aria-expanded={portraitUrl ? portraitMenuOpen : undefined}
            >
              <Portrait
                src={portraitUrl}
                crop={portraitCrop}
                name={name}
                seed={charId ?? name}
                loading="eager"
              />
              <span className="seal-edit-veil" aria-hidden>
                <Camera className="h-4 w-4" />
              </span>
            </button>
            {portraitMenuOpen && portraitUrl && (
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
        ) : canViewPortrait ? (
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            className="seal relative flex h-14 w-14 flex-shrink-0 cursor-zoom-in items-center justify-center rounded-md font-display text-xl"
            aria-label={t("character.viewPortrait")}
            title={t("character.viewPortrait")}
          >
            <Portrait
              src={portraitUrl}
              crop={portraitCrop}
              name={name}
              seed={charId ?? name}
              loading="eager"
            />
          </button>
        ) : (
          <span className="seal relative flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-md font-display text-xl">
            <Portrait
              src={portraitUrl}
              crop={portraitCrop}
              name={name}
              seed={charId ?? name}
              loading="eager"
            />
          </span>
        )}
        {/* No-Truncation Rule (DESIGN.md §3, owner 2026-06-12): the character's
            name NEVER mid-string ellipsizes. It wraps at spaces (text-balance
            keeps two-line splits even) and steps the type down one size on
            phones; break-words only kicks in for a pathological single-word
            name (full visibility beats a clipped "Coralino di S…"). The
            identity line wraps the same way.

            RESPONSIVE TITLE STEP (the ceremonial Cinzel `font-title` is a WIDE
            caps-only face — the Gilded-Plate type system): the 38px `text-2xl`
            page-title size fits only where the identity has room — STACKED below
            `md` (full-width) and in the ROW layout once it's genuinely wide (≥`lg`).
            Across the `md`→`lg` band (768–1023) the header is a flex ROW sharing
            width with the actions cluster, so the identity is capped at 65% and a
            38px "Coralino di Sanvaldo" no longer fits one line — it folded to two
            beside a half-empty header. Step DOWN to 28px `text-xl` through that band
            only, so the name stays one line without starving the cluster (the
            md-band starvation guard, tests/e2e/edit-mode.spec.ts). */}
        <div className="min-w-0 grow">
          <h1 className="text-balance break-words font-title text-xl font-bold leading-tight text-text-primary sm:text-2xl md:text-xl lg:text-2xl">
            <InlineEditable
              type="text"
              editable={sheetMode === "edit"}
              value={name}
              onChange={(v) => {
                // `required` (below) already rejects an empty commit; the smart
                // constructor brands the value (and is a final guard), so an empty
                // name can never be patched onto the character.
                const next = nonEmptyString(v);
                if (next) patchCharacter({ name: next });
              }}
              ariaLabel={t("character.name")}
              placeholder={t("character.namePlaceholder")}
              valueClassName="font-title"
              // A character name has a NON-EMPTY domain (golden rule 20): clearing
              // the field reverts to the prior name rather than persisting "" (which
              // would fan out a nameless snapshot to every campaign). The creation
              // wizard already requires a name; the edit path is now consistent.
              required
            />
          </h1>
          {(identity || levelChip) && (
            <p className="text-sm text-text-secondary">
              {identity}
              {levelChip}
            </p>
          )}
          {/* TB5 — the header is PURE identity + the reference-vitals strip. The
              in-combat session controls (live round, roll-to-total initiative, the
              your-turn cue + turn-advance) belong WITH the combat economy, so they
              render beside the turn meter on the Play tab (InCombatStatus), never in
              the identity band (golden rule 6 — controls live with what they
              change). A source-level guard pins this so the clutter can't creep back. */}
        </div>
      </div>

      {/* The right deck is the vitals strip (DATA) alone — no management row on
          any viewport (the fob family owns Undo · Redo · Edit · ⋯ off the
          masthead). Keeping the deck to just the vitals row (~450px one-line
          max-content basis, was ~940px with the old boxed buttons) relaxes the
          721–1023 width competition against the identity block. */}
      <div className="flex min-w-0 flex-col gap-2 md:items-end">
        <div
          role="group"
          aria-label={t("character.vitals.label")}
          className="hdr-vitals flex flex-wrap items-stretch gap-2 sm:gap-3"
        >
          {/* HP leads the vitals — the stat touched most in play, now in the
              always-visible header (every tab) as a slim bar → popover, or the
              dying affordance at 0 HP. The Rest medallion TRAILS it as a same-row
              sibling (data leads, its control follows) — the exact placement on
              desktop AND phones, ONE rule across breakpoints: [HP][coin][AC…]
              read as one row on desktop, and on phones HP yields a coin-width so
              the full-size coin shares HP's top row with clear air past the bar,
              the four reference tiles wrapping beneath (folio.css `.hdr-vitals`
              phone rule). */}
          <HeaderHpControl />
          {restMedal}

          {/* P2 — two complementary affordances per vital: the whole-box hover
              `title` (owner 2026-06-08 — the instant full term, desktop) stays via
              StatBadge's `fullLabel`, and the ACRONYM is additionally a GlossaryTip
              trigger that expands on tap into a plain-language explanation. Each
              vital is now the shared StatBadge TILE (icon + acronym + value), so the
              hero bar reads with the SAME stat vocabulary as the party / roster. */}
          <StatBadge
            density="tile"
            icon={Shield}
            fullLabel={t("character.vitals.acFull")}
            acronym={
              <GlossaryTip term="armorClass" rubric={t("character.vitals.acFull")}>
                {t("character.vitals.ac")}
              </GlossaryTip>
            }
            value={
              sheetMode !== "edit" && acBreakdown.length > 1 ? (
                <BreakdownTip
                  label={String(acValue)}
                  lines={acBreakdown}
                  className="v-num-tip"
                />
              ) : (
                <InlineEditable
                  type="number"
                  editable={sheetMode === "edit"}
                  value={acValue}
                  computedValue={computedAc}
                  min={1}
                  max={30}
                  onChange={(v) => patchCharacter({ acOverride: v, ac: v })}
                  onReset={() => patchCharacter({ acOverride: null, ac: computedAc })}
                  ariaLabel={t("character.vitals.ac")}
                />
              )
            }
          />

          <StatBadge
            density="tile"
            icon={Dices}
            fullLabel={t("character.vitals.initAria")}
            acronym={
              <GlossaryTip term="initiative" rubric={t("character.vitals.initAria")}>
                {t("character.vitals.init")}
              </GlossaryTip>
            }
            corner={
              sheetMode === "edit" ? (
                <button
                  type="button"
                  className="v-adv-toggle"
                  data-adv={initAdvActive ? "on" : "off"}
                  data-set={initAdvOverride != null ? "" : undefined}
                  onClick={cycleInitAdvantage}
                  title={initAdvStateLabel}
                  aria-label={initAdvStateLabel}
                >
                  <Icon as={ChevronsUp} size="xs" decorative />
                </button>
              ) : initAdvActive ? (
                <span className="v-adv" title={t("character.vitals.initAdvActive")}>
                  <Icon
                    as={ChevronsUp}
                    size="xs"
                    label={t("character.vitals.initAdvActive")}
                  />
                </span>
              ) : null
            }
            value={
              sheetMode !== "edit" && initBreakdown.length > 1 ? (
                <BreakdownTip
                  label={fmtMod(initValue)}
                  lines={initBreakdown}
                  className="v-num-tip"
                />
              ) : (
                <InlineEditable
                  type="number"
                  editable={sheetMode === "edit"}
                  value={initValue}
                  computedValue={computedInitiative}
                  min={-10}
                  max={20}
                  format={fmtMod}
                  onChange={(v) => patchCharacter({ initiativeBonusOverride: v })}
                  onReset={() => patchCharacter({ initiativeBonusOverride: null })}
                  // Full term for AT (the visible acronym is the short form); a
                  // dedicated key so localizing the short label can't collapse the
                  // screen-reader name to the abbreviation.
                  ariaLabel={t("character.vitals.initAria")}
                />
              )
            }
          />

          <StatBadge
            density="tile"
            icon={Footprints}
            fullLabel={t("character.vitals.speed")}
            acronym={
              <GlossaryTip term="speed" rubric={t("character.vitals.speed")}>
                {t("character.vitals.spd")}
              </GlossaryTip>
            }
            value={
              <InlineEditable
                type="number"
                editable={sheetMode === "edit"}
                value={speedEditValue}
                computedValue={computedSpeedLocale}
                min={0}
                max={locale === "it" ? 99 : 300}
                format={() => formatSpeed(speedFt, locale)}
                onChange={(v) =>
                  patchCharacter({
                    speedOverride: parseInt(speedFromLocaleValue(String(v), locale), 10),
                  })
                }
                onReset={() => patchCharacter({ speedOverride: null })}
                ariaLabel={t("character.vitals.speed")}
              />
            }
          />

          <StatBadge
            density="tile"
            icon={Award}
            fullLabel={t("character.vitals.pbAria")}
            acronym={
              <GlossaryTip term="proficiencyBonus" rubric={t("character.vitals.pbAria")}>
                {t("character.vitals.pb")}
              </GlossaryTip>
            }
            value={
              <InlineEditable
                type="number"
                editable={sheetMode === "edit"}
                value={effectivePB}
                computedValue={tablePB}
                min={1}
                max={10}
                format={fmtMod}
                onChange={(v) => patchCharacter({ proficiencyBonusOverride: v })}
                onReset={() => patchCharacter({ proficiencyBonusOverride: null })}
                // Full term for AT; the visible acronym keeps the short "PB" / "BC".
                ariaLabel={t("character.vitals.pbAria")}
              />
            }
          />
        </div>
        {/* The masthead carries NO management row on any viewport — Undo · Redo ·
            Edit · ⋯ live in the fob family (BinderFob on desktop / MobileSignet on
            mobile, both mounted by CharacterCockpit). The right deck is the vitals
            strip alone, so the band reads as pure DATA aligned against the identity. */}
      </div>

      <RestModal open={restOpen} onClose={() => setRestOpen(false)} />
      <PortraitLightbox
        open={lightboxOpen}
        src={portraitUrl ?? ""}
        name={name}
        onClose={() => setLightboxOpen(false)}
      />
      {/* D21 — hidden file input + crop modal backing the hero-seal editor (shared
          flow with Bio; the modal portals above the header). */}
      <input
        ref={portraitInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void onPortraitFileChange(e)}
      />
      <PortraitCropModal
        key={portraitCropSrc ?? ""}
        open={portraitCropSrc !== null}
        imageSrc={portraitCropSrc ?? ""}
        initialCropArea={portraitInitialCropArea}
        onConfirm={(area) => void onPortraitConfirm(area)}
        onClose={onPortraitCancel}
      />
    </header>
  );
}
