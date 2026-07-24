/**
 * Creation presenter (`lib/views`) — the pure, framework-free seam that turns the
 * wizard's per-step inputs (selected ids + the active locale) into render-ready
 * view-models (docs/ARCHITECTURE.md). The CreationWizard orchestrator
 * + its `steps/` subcomponents read these VMs; they make ZERO direct
 * `[locale]` / BiText reads.
 *
 * ## What it does
 *  - Builds the three static option lists — class / race / background — each with
 *    its localized label, the EN search anchor, and the meta line, localized HERE
 *    via {@link localizeSrd} keyed by the stable id (kind `"class"` / `"race"` /
 *    `"background"`) so the surface survives the upcoming `src/data/**` BiText
 *    strip (golden rules 5 + 7).
 *  - Resolves the selection-dependent VMs: subclass options for the chosen class
 *    (kind `"subclass"`), the chosen race's lineage bundles + trait-name preview,
 *    the class tip, and the localized starting-equipment list.
 *  - Derives the review/preview summary (display class / race / background names +
 *    the raw HP / AC / PB / DC numbers stay raw — `t`/`formatSpeed` format at the
 *    edge).
 *
 * ## What it does NOT do
 *  - No React, no Zustand, no Firebase, no i18next (pure-modules-guard pins it).
 *  - Raw NUMBERS / stable ids stay raw — point-buy costs, ability totals, HP/AC/PB,
 *    speed figures, and the class ROLE icon (a React glyph) are resolved at the
 *    edge. Identity is stable ids ONLY; labels are derived from the id for display.
 *  - No character assembly — `handleCreate` still builds the `CharacterData`
 *    (it stays in the orchestrator, the one place that writes Firestore). The
 *    presenter only localizes what the steps render.
 */

import type { Locale } from "@/lib/locale";
import type {
  EquipmentCategory,
  BackgroundEquipmentItem,
  BackgroundEquipmentOption,
} from "@/data/types";
import { classTables, classTableIndex } from "@/data/classes";
import {
  SRD_RACES,
  raceFeatureEntries,
  raceTraitCatKey,
  rawRaceTraitCatKey,
} from "@/data/races";
import { SRD_BACKGROUNDS } from "@/data/backgrounds";
import { getEquipment } from "@/data/equipment";
import {
  expandToolChoiceItem,
  type ToolChoiceContext,
  type ToolChoiceKind,
} from "@/data/background-equipment";
import { localizeSrd } from "@/i18n/resolver";
import {
  grantField,
  grantFieldEn,
  topGrantRef,
  bundleOptionRef,
  type GrantSource,
} from "@/lib/grants";
import { localizeText } from "@/lib/views/srd-i18n";

/**
 * The minimal i18next `t` shape this presenter needs — injected by the UI edge so
 * the module imports no `react-i18next` (the `lib/views` layer stays framework-free;
 * the pure-modules-guard pins it). The CHROME strings it resolves (the beginner
 * class tips, the localized size word) live in the `create` / `srd` UI namespaces,
 * NOT the id-keyed SRD catalogue — so they resolve through `t`, not `localizeSrd`.
 */
export type TranslateFn = (key: string, args?: Record<string, string | number>) => string;

// ── option-list VMs ──────────────────────────────────────────────────────────

/** One render-ready creation option (class / race / background / subclass / lineage). */
export interface CreationOptionVM {
  /** Stable id — the picker binds to and emits THIS, never the label. */
  id: string;
  /** Localized display label. */
  label: string;
  /** Canonical EN name — the accent-insensitive search anchor (paired with label). */
  searchEn: string;
  /** The localized meta line (subtitle), or undefined when the option has none. */
  meta?: string;
}

/** One race's first-N trait names, localized for the detail panel. */
export interface RaceTraitPreviewVM {
  /** Localized race name (the panel heading). */
  name: string;
  /** Up to 3 localized trait names. */
  traits: string[];
}

/** A creation-time lineage bundle (Elven / Gnomish), localized. */
export interface LineageBundleVM {
  bundleKey: string;
  /** Localized bundle label ("Elven Lineage"). */
  label: string;
  /** Localized option list (Drow / High Elf / Wood Elf …). */
  options: CreationOptionVM[];
}

/** One resolved starting-equipment line, localized for the equipment step. */
export interface StartingItemVM {
  id: string;
  /** Localized display label. EMPTY for a `placeholder` line — the edge supplies it. */
  label: string;
  quantity: number;
  category: "weapon" | "armor" | "gear" | "unknown";
  /**
   * A `fromToolChoice` pack member the player has NOT yet picked — the edge
   * (`EquipmentStep`) renders the localized "… — your choice" chrome label keyed
   * by this kind (the presenter is i18next-free, so the chrome string resolves at
   * the edge). Absent on every resolved line (including a PICKED tool, which
   * carries a real localized `label`).
   */
  placeholder?: ToolChoiceKind;
}

/**
 * One selectable starting-equipment package, localized for the equipment step —
 * the 2024 "Choose A or B" fork as a render-ready view-model. SOURCE-AGNOSTIC:
 * the SAME shape backs the class fork and the background fork (Fighter offers
 * three). The wizard renders one tab per option; `items` is empty for the
 * all-gold option.
 */
export interface StartingOptionVM {
  /** Option label as printed in the source ("A" / "B" / "C") — the stable pick key. */
  label: string;
  /** Localized item lines (empty for the all-gold option). */
  items: StartingItemVM[];
  /** Gold pieces (GP) granted alongside the items. */
  gold: number;
}

// ── localization helpers (the ONE place these SRD strings resolve) ─────────────

/** The localized class name (kind `"class"`). */
export function className(classId: string, locale: Locale): string {
  return localizeSrd("class", classId, "name", locale);
}

/** The localized race name (kind `"race"`). */
export function raceName(raceId: string, locale: Locale): string {
  return localizeSrd("race", raceId, "name", locale);
}

/** The localized background name (kind `"background"`). */
export function backgroundName(bgId: string, locale: Locale): string {
  return localizeSrd("background", bgId, "name", locale);
}

/** The localized subclass name (kind `"subclass"`). */
export function subclassName(subclassId: string, locale: Locale): string {
  return localizeSrd("subclass", subclassId, "name", locale);
}

/** The localized feat name (kind `"feat"`) — for the origin-feat choices hint. */
export function featName(featId: string, locale: Locale): string {
  return localizeSrd("feat", featId, "name", locale);
}

/** The localized language name (kind `"language"`) — for the origin-language recap. */
export function languageName(id: string, locale: Locale): string {
  return localizeSrd("language", id, "name", locale);
}

/**
 * The localized names of a race's first N traits — resolved from the i18n
 * catalogue by each trait's STABLE id-derived `raceTraitCatKey` (no `name.en`
 * read). Iterates the flat `raceFeatureEntries` (which carry the id + raceId)
 * rather than the raw `SrdRaceTrait[]` (which carry neither).
 */
function raceTraitNames(raceId: string, limit: number, locale: Locale): string[] {
  return raceFeatureEntries
    .filter((e) => e.raceId === raceId)
    .slice(0, limit)
    .map((e) => localizeSrd("race", raceTraitCatKey(e), "name", locale));
}

/**
 * The localized beginner tip for a class — plain-language one-liners (golden rule
 * 7: progressive disclosure on demand). APP copy (not SRD), so it lives in the
 * `create` UI namespace keyed by the stable class id (`create.tip_<classId>`) and
 * resolves through the injected `t` — bringing it under the i18n parity / no-empty
 * / English-in-IT / dedup locks (golden rule 9). Returns "" for a non-class id
 * (the wizard's empty-selection state) so the surface never asks for a missing key.
 */
export function classTip(classId: string, t: TranslateFn): string {
  return classTableIndex.has(classId) ? t(`create.tip_${classId}`) : "";
}

/**
 * Localize a race size value ("Small or Medium" → "Piccola o Media") through the
 * EXISTING `srd.size_<token>` keys (the SAME tokens ResourceRail/PlayTab resolve),
 * composing the "or" case from its two localized parts with the `create.sizeOr`
 * connective. No hardcoded locale literals — the wizard injects `t`.
 */
export function localizeSize(size: string, t: TranslateFn): string {
  const sizeWord = (s: string) => t(`srd.size_${s.trim().toLowerCase()}`);
  const parts = size.split(/\s+or\s+/);
  if (parts.length === 2 && parts[0] && parts[1]) {
    return `${sizeWord(parts[0])} ${t("create.sizeOr")} ${sizeWord(parts[1])}`;
  }
  return sizeWord(size);
}

/** Title-case a space-separated string ("crossbow bolts" → "Crossbow Bolts"). */
function titleCaseWords(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── option lists ───────────────────────────────────────────────────────────

/** The class option list (one per SRD class), localized + EN-anchored. */
export function classOptions(locale: Locale): CreationOptionVM[] {
  return classTables.map((c) => ({
    id: c.id,
    label: className(c.id, locale),
    searchEn: className(c.id, "en"),
  }));
}

/** One class plaque/hero VM for the wizard-F class GALLERY. Role/saves stay
 *  tokens the edge formats (`wizard.role_*` / `abilityLabel`). */
export interface ClassGalleryVM {
  id: string;
  /** Localized class name. */
  name: string;
  hitDie: number;
  /** Saving-throw ability codes (the edge renders localized abbreviations). */
  saves: ReadonlyArray<string>;
  /** The localized beginner tip (card gloss + hero lede). */
  tip: string;
  /** Level at which the subclass choice unlocks (the cascade gate). */
  subclassLevel: number;
  subclasses: ReadonlyArray<{ id: string; label: string }>;
}

/** The class gallery VMs (the same `classTables` source the grid binds to). The
 *  edge injects `t` so the beginner `tip` resolves from the `create` UI namespace. */
export function classGalleryVMs(locale: Locale, t: TranslateFn): ClassGalleryVM[] {
  return classTables.map((c) => ({
    id: c.id,
    name: className(c.id, locale),
    hitDie: c.hitDie,
    saves: c.savingThrows,
    tip: classTip(c.id, t),
    subclassLevel: c.subclassLevel,
    subclasses: subclassOptions(c.id, locale).map((s) => ({ id: s.id, label: s.label })),
  }));
}

/** The race option list, with a `speed · size` meta — speed is RAW (edge formats). */
export function raceOptions(
  locale: Locale
): Array<CreationOptionVM & { speed: number; size: string }> {
  return SRD_RACES.map((r) => ({
    id: r.id,
    label: raceName(r.id, locale),
    searchEn: raceName(r.id, "en"),
    speed: r.speed,
    size: r.size,
  }));
}

/** The background option list — meta carries the localized skill names. */
export function backgroundOptions(
  locale: Locale,
  localizeSkill: (name: string) => string
): CreationOptionVM[] {
  return SRD_BACKGROUNDS.map((b) => ({
    id: b.id,
    label: backgroundName(b.id, locale),
    searchEn: backgroundName(b.id, "en"),
    meta: b.skillProficiencies.map(localizeSkill).join(", "),
  }));
}

/** The subclass options for the selected class (empty when the class has none). */
export function subclassOptions(classId: string, locale: Locale): CreationOptionVM[] {
  const table = classTables.find((c) => c.id === classId);
  if (!table) return [];
  return table.subclasses.map((sc) => ({
    id: sc.id,
    label: subclassName(sc.id, locale),
    searchEn: subclassName(sc.id, "en"),
  }));
}

/** The chosen race's first-3 trait names for the detail panel (null for no race). */
export function raceTraitPreview(
  raceId: string,
  locale: Locale
): RaceTraitPreviewVM | null {
  const race = SRD_RACES.find((r) => r.id === raceId);
  if (!race) return null;
  return {
    name: raceName(race.id, locale),
    traits: raceTraitNames(race.id, 3, locale),
  };
}

/** Derive the chosen race's creation-time lineage bundles, localized. */
export function lineageBundleVMs(raceId: string, locale: Locale): LineageBundleVM[] {
  const race = SRD_RACES.find((r) => r.id === raceId);
  if (!race) return [];
  const bundles: LineageBundleVM[] = [];
  for (const trait of race.traits) {
    // The trait's catalogue ref — the bundle/option labels localize off it
    // positionally (the same path the engine derives), so we never read the
    // stripped grant `label` BiText.
    const src: GrantSource = {
      id: trait.id,
      grants: trait.grants ?? [],
      ref: { kind: "race", key: rawRaceTraitCatKey(race.id, trait) },
    };
    (trait.grants ?? []).forEach((g, i) => {
      if (g.type === "choice-grant-bundle" && g.choiceFrequency === "creation") {
        const bundleRef = topGrantRef(src, g, i);
        bundles.push({
          bundleKey: g.bundleKey,
          label: localizeText(grantField(bundleRef, "label", g.label), locale),
          options: g.options.map((o) => {
            const optRef = bundleOptionRef(bundleRef, o.id);
            return {
              id: o.id,
              label: localizeText(grantField(optRef, "label", o.label), locale),
              searchEn: grantFieldEn(optRef, "label", o.label),
            };
          }),
        });
      }
    });
  }
  return bundles;
}

// ── starting equipment ─────────────────────────────────────────────────────

/**
 * Resolve ONE package item line ({@link BackgroundEquipmentItem}) into one or
 * more localized {@link StartingItemVM}s. Every explicit `srdId` entry localizes
 * via the catalogue (the SAME id→`localizeSrd` seam as the rest of the inventory
 * — there is no name-only / inline-BiText form); a `fromToolChoice` marker expands
 * (via the shared {@link expandToolChoiceItem} core) to the chosen tool line(s) —
 * or a single PLACEHOLDER line before a pick. A leftover quantity-suffix id
 * (`"arrows-20"`) is still tolerated as a transitional safety net even though
 * clean data now carries `quantity`.
 */
function resolveStartingItems(
  item: BackgroundEquipmentItem,
  locale: Locale,
  toolChoice: ToolChoiceContext | undefined
): StartingItemVM[] {
  // `fromToolChoice` marker — the chosen tool pack member. Expand via the SAME
  // structural core the create-time resolver uses (single source); resolved tools
  // localize as catalogue items, an unpicked marker becomes a placeholder line.
  if (item.fromToolChoice) {
    const expanded = expandToolChoiceItem(item.quantity ?? 1, toolChoice);
    if (expanded.kind === "resolved") {
      return expanded.toolIds.map((toolId) => resolveSrdItem(toolId, 1, locale));
    }
    return [
      {
        id: `__tool-choice__:${expanded.choiceKind}`,
        label: "",
        quantity: expanded.count,
        category: "gear",
        placeholder: expanded.choiceKind,
      },
    ];
  }
  // Every explicit pack member is an `srdId` — it localizes through the catalogue.
  return [resolveSrdItem(item.srdId, item.quantity ?? 1, locale)];
}

/** Resolve a single SRD equipment id (with quantity) into a localized VM. */
function resolveSrdItem(rawId: string, quantity: number, locale: Locale): StartingItemVM {
  const direct = getEquipment(rawId);
  if (direct) {
    return {
      id: rawId,
      label: localizeSrd("equipment", rawId, "name", locale),
      quantity,
      category: equipmentCategory(direct.category),
    };
  }
  // Transitional safety net — strip a quantity suffix ("arrows-20" → "arrows" × 20).
  const qtyMatch = rawId.match(/^(.+?)-(\d+)$/);
  if (qtyMatch && qtyMatch[1] && qtyMatch[2]) {
    const baseId = qtyMatch[1];
    const qty = parseInt(qtyMatch[2], 10) * quantity;
    const baseItem = getEquipment(baseId);
    if (baseItem) {
      return {
        id: baseId,
        label: localizeSrd("equipment", baseId, "name", locale),
        quantity: qty,
        category: baseItem.category === "weapon" ? "weapon" : "gear",
      };
    }
    // The quantity is shown by a separate "×N" badge, so the label must NOT
    // repeat it. Title-case the kebab id for a tidy unresolved fallback.
    return {
      id: rawId,
      label: titleCaseWords(baseId.replace(/-/g, " ")),
      quantity: qty,
      category: "unknown",
    };
  }
  return {
    id: rawId,
    label: titleCaseWords(rawId.replace(/-/g, " ")),
    quantity,
    category: "unknown",
  };
}

/** Bucket an SRD equipment category into the wizard's coarse category. */
function equipmentCategory(category: EquipmentCategory): StartingItemVM["category"] {
  if (category === "weapon") return "weapon";
  if (category === "armor" || category === "shield") return "armor";
  return "gear";
}

/**
 * Convert a CLASS or BACKGROUND's `startingEquipment` packages into localized
 * option view-models — the SINGLE source-agnostic presenter the equipment-step
 * fork renders (one tab per option). `options` is the raw
 * `BackgroundEquipmentOption[]` from the class table or the background.
 * `toolChoice` (CLASS only) resolves any `fromToolChoice` pack member to the
 * chosen tool, or a placeholder before a pick — the SAME core the create-time
 * resolver uses, so preview and creation never drift (golden rule 6).
 */
export function startingEquipmentOptions(
  options: ReadonlyArray<BackgroundEquipmentOption> | undefined,
  locale: Locale,
  toolChoice?: ToolChoiceContext
): StartingOptionVM[] {
  return (options ?? []).map((opt) => ({
    label: opt.label,
    items: opt.items.flatMap((item) => resolveStartingItems(item, locale, toolChoice)),
    gold: opt.gold,
  }));
}

/**
 * The localized starting-equipment packages for a CLASS (keyed by class id).
 * `toolChoice.pickedIds` carries the player's tool-proficiency pick so the
 * chosen-tool pack member (Monk / Bard) shows the actual tool; its `options`
 * always come from the class's own `choice-tool-proficiency` grant (the single
 * source), so the placeholder KIND is correct even when no pick is passed (a
 * compendium / no-context render still shows the right "… — your choice" slot).
 */
export function classStartingEquipment(
  classId: string,
  locale: Locale,
  toolChoice?: ToolChoiceContext
): StartingOptionVM[] {
  const cls = classTables.find((c) => c.id === classId);
  const grant = cls?.grants?.find((g) => g.type === "choice-tool-proficiency");
  // The grant defines the option set (the placeholder kind); the caller supplies
  // only the picks. Derive the context from the class so the marker always
  // resolves correctly, with or without a pick.
  const ctx: ToolChoiceContext | undefined = grant
    ? { options: grant.options, pickedIds: toolChoice?.pickedIds ?? [] }
    : undefined;
  return startingEquipmentOptions(cls?.startingEquipment, locale, ctx);
}
