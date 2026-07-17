/**
 * CompendiumPicker — the declarative spec types.
 *
 * ONE picker primitive powers BOTH the Compendium browse page and the five sheet
 * "Add-X" modals. The picker owns the shared list + search + filter + detail +
 * footer UI (built on `components/sheet/picker-parts`); each per-type **spec**
 * owns only the facts — its data, its accessors, its facets, how one row and one
 * detail render, how it dedupes "already added", and how it commits to the
 * character. Adding a content type = adding a spec; the picker never branches on
 * type. (PRODUCT_CONSTITUTION §4.9–4.11 — strong separation, reuse over one-offs.)
 *
 * This module is pure (types + a typing helper); no React, no JSX, no data.
 */

import type { ComponentType, ReactNode, SVGProps } from "react";
import type { useTranslation } from "react-i18next";
import type { CharacterDoc } from "@/types/character";
import type { GlossaryTermId } from "@/components/shared/GlossaryTip";

export type Locale = "en" | "it";

/** The translator type, derived from the hook (no direct i18next type import). */
export type TFn = ReturnType<typeof useTranslation>["t"];

/** Ambient context handed to every spec accessor. */
export interface PickerCtx {
  t: TFn;
  locale: Locale;
  /**
   * The active character in ADD mode (commit target + filter defaults like
   * "your class"); `null` in browse mode, where the compendium is global.
   */
  character: CharacterDoc | null;
  /**
   * The picker surface: `browse` = the Compendium page, whose facet ledger
   * prefixes every group with a rubric label — reset chips read short there
   * ("All" under the LEVEL rubric); `add` = a cockpit/wizard modal's unlabelled
   * strips, where reset chips carry their own noun ("All levels"). Presentation
   * only — never gate mechanics on it.
   */
  mode: "browse" | "add";
}

/** Per-row state the picker computes so a spec can vary its rendering. */
export interface RowState {
  /** True when this entry is already on the character (add mode only). */
  added: boolean;
}

/**
 * One list row. The spec owns leading / name / meta and any *warning* trailing
 * (cross-class, above-level); the picker overrides this for already-added rows.
 */
export interface PickerRowView {
  leading?: ReactNode;
  name: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  state?: "default" | "added" | "warn";
}

/**
 * The structured detail view. The picker renders the shared scaffold (scroll
 * container + footer) around these slots, so every type reads as one surface:
 *   eyebrow strip · soft warning · 2-col meta grid · description · type extras.
 */
export interface PickerDetailView {
  /** Badge strip above the grid (category · rarity · source · level). */
  eyebrow?: ReactNode;
  /** Soft warning banner — the spec decides when to surface it. */
  warning?: ReactNode;
  /** The 2-column meta grid (label · value pairs). A field may name a glossary
   *  `term` (P2): the scaffold then wraps its label in the shared `GlossaryTip`,
   *  so beginner glosses grow by DATA (a spec adds the id), never by new code. */
  meta?: { label: ReactNode; value: ReactNode; term?: GlossaryTermId }[];
  /** Free-form description body — the PLAIN SRD string. The scaffold routes it
   *  through the shared inline-markdown renderer (one seam for every type), so
   *  specs never wrap it themselves. */
  description?: string;
  /** Type-specific blocks (higher-levels · mechanics · properties · tag chips). */
  extras?: ReactNode;
}

/**
 * One faceted filter group. Its concrete value type is erased to `unknown` in
 * the array (groups are heterogeneous); use {@link defineFilter} to author one
 * with full type-safety. `render`/`predicate` receive the full filter state as a
 * 4th arg so a group whose chips depend on a sibling (e.g. the feature level
 * facet, scoped to the chosen class) can read it.
 */
export interface FilterGroup<T> {
  id: string;
  /** Heading shown by the page facet rail (modals render the chips inline). */
  label?: (t: TFn) => string;
  initial: unknown;
  render: (
    value: unknown,
    setValue: (v: unknown) => void,
    ctx: PickerCtx,
    all: Record<string, unknown>
  ) => ReactNode;
  predicate: (
    entry: T,
    value: unknown,
    ctx: PickerCtx,
    all: Record<string, unknown>
  ) => boolean;
}

/** Author a filter group with a concrete value type `V` (erased in the array). */
export function defineFilter<T, V>(g: {
  id: string;
  label?: (t: TFn) => string;
  initial: V;
  render: (
    value: V,
    setValue: (v: V) => void,
    ctx: PickerCtx,
    all: Record<string, unknown>
  ) => ReactNode;
  predicate: (
    entry: T,
    value: V,
    ctx: PickerCtx,
    all: Record<string, unknown>
  ) => boolean;
}): FilterGroup<T> {
  return g as unknown as FilterGroup<T>;
}

/**
 * A row's right-aligned codex classifier chip (OWN-5). `label` is the text;
 * `tone` is the `--vd` CSS custom-prop value the `.cmp-verdict` recipe tints
 * with (a domain hue). The chip TEXT derives from the hue via color-mix toward
 * `--text-primary` inside the recipe, so no separate ink token exists here.
 */
export interface CompendiumVerdict {
  label: ReactNode;
  /** The `--vd` hue (border/tint/text-mix), e.g. `"var(--school-evocation)"`. */
  tone?: string;
}

/**
 * The per-type declarative spec. Owns every per-type fact; the picker owns the
 * shared UI. `existingIds`/`onAdd`/`closeOnAdd`/`addLabel` are ADD-mode only —
 * browse-only types (e.g. feats) simply omit them.
 */
export interface CompendiumPickerSpec<T> {
  /** Stable id: "spell" | "feature" | "feat" | "equipment" | "magic-item". */
  id: string;
  /** Type label for the compendium type selector (EN inline default). */
  label: (t: TFn) => string;
  /**
   * The glyph for this type's ribbon tab in the Compendium (OWN-5). A lucide
   * component, so the codex ribbon wears a per-type mark (a spellbook, a sword,
   * an award …). Browse-only chrome; the add-modals never render the ribbon.
   */
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  /**
   * The right-aligned codex "verdict" chip for a row (OWN-5) — the at-a-glance
   * classifier a player scans down the leaf (spell school · item rarity · feat
   * category). Optional: a type with no natural classifier omits it. Returns the
   * chip's content + its pigment so `.cmp-verdict` tints consistently. The chip
   * is decorative-on-top-of-the-row; the same fact stays in `row().meta` for AT.
   */
  verdict?: (entry: T, ctx: PickerCtx) => CompendiumVerdict | undefined;
  /** The full SRD data array for this type. */
  data: readonly T[];
  getId: (entry: T) => string;
  getName: (entry: T, ctx: PickerCtx) => string;
  /** Bilingual search candidates (localized name, EN name, id, …). */
  searchText: (entry: T, ctx: PickerCtx) => Array<string | null | undefined>;
  filters: FilterGroup<T>[];
  row: (entry: T, ctx: PickerCtx) => PickerRowView;
  detail: (entry: T, ctx: PickerCtx, state: RowState) => PickerDetailView;
  /** Build the already-on-character id set (omit → never "already added"). */
  existingIds?: (character: CharacterDoc) => Set<string>;
  /**
   * Commit the entry to the character (add mode). `quantity` is the count the
   * user chose in the picker's stepper (default 1) — honoured by quantity-bearing
   * types (equipment/magic items); browse-only/single types ignore it.
   */
  onAdd?: (entry: T, ctx: PickerCtx, quantity?: number) => void;
  /**
   * Show a quantity stepper next to Add (D55), so the player sets the count at
   * add time (e.g. 3 potions) instead of adding then editing in the inventory.
   */
  supportsQuantity?: boolean;
  /**
   * The stepper's step + minimum + initial value for an entry (default 1).
   * Bundle items return their `bundleSize` so ammunition steps 20 → 40 → 60 and
   * `onAdd` receives the real unit count. Honoured only with `supportsQuantity`.
   */
  quantityStep?: (entry: T) => number;
  /** Close the host modal after a successful add (magic items do). */
  closeOnAdd?: boolean;
  /** Footer add-button label (defaults to common.addToCharacter). */
  addLabel?: (ctx: PickerCtx) => ReactNode;
  /** Search-box placeholder (defaults to the common "Search" label). */
  searchPlaceholder?: (t: TFn) => string;
}
