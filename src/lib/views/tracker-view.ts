/**
 * Tracker / Play-surface presenter (pure, framework-free).
 *
 * R6+R3 SLICE 5 — the §3.3 display seam for the combat / play surface. The
 * components that render the Play tab (`PlayTab`, `ThisTurnTracker`,
 * `ResourceRail`, `ActivatableFeaturesBar`, `CombatHeader`) used to read the
 * active locale directly and resolve `BiText`/SRD strings inline — condition
 * names, advantage descriptions, the concentration label, the activatable-toggle
 * labels, the per-action "At Higher Levels" upcast copy. This module owns ALL of
 * those resolutions so every surface receives ready-to-render strings and makes
 * ZERO direct `[locale]` reads (golden rules 5 + 6: one helper, derived once,
 * never re-stated per surface).
 *
 * `resolveActions` / `resolveTrackers` (smart-tracker) already emit localized
 * `ResolvedAction` / `ResolvedTracker` rows; this presenter layers on the
 * remaining play-surface view-models that those two engine seams don't cover.
 * It EXTENDS `combat-action-view` (log-icon / sort / upcast) rather than
 * duplicating it — `actionHigherLevels` simply re-exports its `combatHigherLevels`
 * under the presenter's name so callers thread the seam through one module.
 *
 * Everything here is a pure function (no React, no Firebase). Localisation of the
 * `t(...)`-keyed UI chrome (rubrics, CTAs, placeholders) stays at the call site —
 * this presenter resolves only the DATA-derived strings (SRD content + grant
 * `BiText` + raw session strings).
 */

import type { BiText, Recovery, TrackerUnit } from "@/data/types";
import type {
  RawResolvedAction,
  RawResolvedTracker,
  ResolvedAction,
  ResolvedTracker,
} from "@/lib/smart-tracker";
import { resolveTrackers } from "@/lib/smart-tracker";
import type { CharacterDoc } from "@/types/character";
import type { ActivatableGroup } from "@/lib/grants";
import type { AdvantageChip } from "@/lib/views/sheet-view";
import type {
  AuraClause,
  CopyToTargetClause,
  IncomingAttackClause,
  ResourceConversionEntry,
  RollFloorClause,
} from "@/lib/grants";
import type { AbilityCode } from "@/data/types";
import { abilityModifier } from "@/lib/ability";
import { localeDistance, pickDiceByLevel } from "@/lib/utils";
import { SRD_CONDITIONS } from "@/data/conditions";
import { localizeSrd, hasSrd } from "@/i18n/resolver";
import { CUSTOM_CONCENTRATION_PREFIX } from "@/lib/concentration";
import { getRace, rawRaceTraitCatKey } from "@/data/races";
import { localizeText } from "@/lib/views/srd-i18n";
import { condColor, condInkColor } from "@/lib/condition-color";
import { combatHigherLevels } from "@/lib/views/combat-action-view";

type Locale = keyof BiText;

// ─── Resource trackers ──────────────────────────────────────────────────────

/**
 * Localize one engine-emitted `RawResolvedTracker` into its display shape — the
 * ONLY place the tracker's bilingual `label` / `description` are resolved to the
 * active locale (the engine carries them as DATA; docs/ARCHITECTURE.md).
 */
export function localizeTracker(
  tracker: RawResolvedTracker,
  locale: Locale
): ResolvedTracker {
  const { label, description, ...rest } = tracker;
  return {
    ...rest,
    label: localizeText(label, locale),
    ...(description ? { description: localizeText(description, locale) } : {}),
  };
}

/**
 * Resolve + localize a character's resource trackers for the rail / economy /
 * Features surfaces. `resolveTrackers` (engine) is locale-free; this presenter
 * localizes each row's `label`/`description` at the edge so every consumer
 * (`ResourceRail`, `TurnEconomyProvider`, `FeaturesTab`) reads identical strings.
 */
export function localizeTrackers(
  character: CharacterDoc,
  locale: Locale
): ResolvedTracker[] {
  return resolveTrackers(character).map((tr) => localizeTracker(tr, locale));
}

/** A minimal `t` shape — structurally satisfied by `useTranslation().t` and the
 *  PDF presenter's `Translate`, so every consumer threads its own `t` through. */
type Translate = (key: string, opts?: Record<string, unknown>) => string;

/**
 * Resolve a tracker/pool unit TOKEN to its localized display string at the render
 * boundary (golden rule 7) — the ONE place a `TrackerUnit` becomes a
 * user-facing word. The engine + data speak only the stable token (`"hp"`,
 * `"points"`, …); EVERY consumer (rail pool count, Tracker molecule, pool-spend
 * modal, PDF row) routes through THIS helper so the IT player sees "PF"/"punti"
 * and a raw English token can never reach a surface (one source — golden rule 6).
 *
 * Returns `t("units.<token>")` when the unit is set; when it is `undefined` the
 * helper returns `""` so each caller can preserve its OWN fallback (the rail /
 * PDF default to `t("character.usesWord")`; the Tracker molecule renders nothing).
 *
 * IT values follow the GR9 cascade (the official D&D-2024 IT terms); "treats" is a
 * homebrew tracker with no authoritative IT source → AI-translated to "bocconcini".
 */
export function localizeTrackerUnit(unit: TrackerUnit | undefined, t: Translate): string {
  return unit ? t(`units.${unit}`) : "";
}

/**
 * Resolve a tracker recovery TOKEN to its localized full-word display string
 * ("Long Rest" / "Riposo Lungo") at the render boundary — the ONE place a
 * `Recovery` code becomes a user-facing word (golden rules 6 + 7; the sibling of
 * `localizeTrackerUnit`). Every full-word consumer (Features tab gloss + tracker
 * chip, feat/feature compendium mechanics blocks) routes through THIS helper so
 * the raw `"long-rest"` token can never reach a surface again.
 *
 * `dawn` folds into Long Rest (the app's play model: dawn recovery happens at the
 * end of a Long Rest — characterStore rest seam); `per-turn` returns `null`
 * (auto-reset by the turn engine — no rest word applies) so callers render an
 * honest blank. The SR/LR badge (ResourceRail) and the PDF's print-fidelity
 * variant (`dawn` → "Dawn") are separate semantic units with their own keys.
 */
export function localizeTrackerRecovery(
  recovery: Recovery | undefined,
  t: Translate
): string | null {
  switch (recovery) {
    case "short-rest":
    case "short-or-long-rest":
      return t("features.recoverShortRest");
    case "long-rest":
    case "dawn":
      return t("features.recoverLongRest");
    case "manual":
      return t("features.recoverManual");
    default:
      return null;
  }
}

// ─── Action cards ───────────────────────────────────────────────────────────

/**
 * The per-action "At Higher Levels" upcast copy for the locale, or `null` when
 * the action carries none (cantrips / weapons / features). Re-exports the shared
 * `combat-action-view` lookup so the action + reaction cards resolve it through
 * the presenter seam instead of reading the locale themselves — ONE lookup, no
 * drift with the Spells page.
 */
export function actionHigherLevels(
  action: RawResolvedAction | ResolvedAction,
  locale: Locale
): string | null {
  return combatHigherLevels(action, locale);
}

// ─── Concentration label ────────────────────────────────────────────────────

/**
 * Localize the stored concentration value for display. `session.concentration` is
 * a STABLE id by construction (golden rule 7): an SRD spell's `srdId`, or — for a
 * custom spell, which has no srdId — its user-authored name behind a `custom:`
 * marker. There is NO bare display-name form, so a leak is impossible by design:
 *   • an SRD id resolves through the THROWING resolver (localizes EN/IT; an invalid
 *     id throws in dev/test — the locale-sweep lock catches it — and shows the ⟦…⟧
 *     sentinel in prod, never a silent English string: golden rule 9 / lock 1);
 *   • a `custom:` marker is the user's own name, shown verbatim (nothing to localize).
 *
 * `ThisTurnTracker`, `ResourceRail`, the toast intents, and the combat log all route
 * through this ONE helper, and writers stamp the value via {@link concentrationValue}
 * — so the stored form and its display can never drift (golden rule 6).
 */

export function concentrationLabel(value: string, locale: Locale): string {
  if (!value) return value;
  if (value.startsWith(CUSTOM_CONCENTRATION_PREFIX)) {
    return value.slice(CUSTOM_CONCENTRATION_PREFIX.length);
  }
  return localizeSrd("spell", value, "name", locale);
}

// ─── Condition chips ────────────────────────────────────────────────────────

/** A render-ready active-condition chip: localized label + its per-hue tokens. */
export interface ConditionChipVM {
  /** Stable condition id (e.g. "frightened") — also the remove key. */
  id: string;
  /** Localized condition name; falls back to the raw id for unknown ids. */
  label: string;
  /** `--co` border-hue token (`condColor`). */
  color: string;
  /** `--co-ink` AA-safe label-hue token (`condInkColor`). */
  ink: string;
}

/**
 * Resolve a character's active condition ids into render-ready chips (localized
 * label + per-hue color tokens). Order is preserved from the input list.
 */
export function conditionChips(
  conditions: ReadonlyArray<string>,
  locale: Locale
): ConditionChipVM[] {
  return conditions.map((id) => ({
    id,
    label: hasSrd("condition", id, "name", locale)
      ? localizeSrd("condition", id, "name", locale)
      : id,
    color: condColor(id),
    ink: condInkColor(id),
  }));
}

/** A picker / select option: the stable id + its localized label. */
export interface ConditionOptionVM {
  id: string;
  label: string;
}

/**
 * The full SRD condition list as localized `{ id, label }` options — for the
 * "add condition" picker and the condition-immunity override selector (golden
 * rule 6: both selectors derive from the SAME source).
 */
export function conditionOptions(locale: Locale): ConditionOptionVM[] {
  return SRD_CONDITIONS.map((c) => ({
    id: c.id,
    label: localizeSrd("condition", c.id, "name", locale),
  }));
}

/**
 * The localized name for one condition id (the immunity-chip label + the
 * defenses-row join both resolve a bare id this way). Falls back to the raw id.
 */
export function conditionLabel(id: string, locale: Locale): string {
  return hasSrd("condition", id, "name", locale)
    ? localizeSrd("condition", id, "name", locale)
    : id;
}

// ─── Advantage / passive notes ──────────────────────────────────────────────

/** A render-ready advantage / disadvantage chip: the chip + its localized note. */
export interface AdvantageChipVM extends Omit<AdvantageChip, "description"> {
  /** Localized clause description. */
  description: string;
}

/**
 * Localize the bilingual `description` on each advantage / disadvantage chip so
 * the rail renders ready strings (order preserved — advantages then disadvantages
 * as `deriveAdvantageChips` already arranged them).
 */
export function advantageChipVMs(
  chips: ReadonlyArray<AdvantageChip>,
  locale: Locale
): AdvantageChipVM[] {
  return chips.map((c) => ({ ...c, description: localizeText(c.description, locale) }));
}

/** A render-ready passive (roll-floor) note: the source id + its localized text. */
export interface RollFloorVM {
  sourceId: string;
  description: string;
  /**
   * `true` when the floor rides a `while-active` toggle that is currently up
   * (Circle of Stars Starry Form, Clockwork Trance of Order). The note appends a
   * "· active" suffix (`combat.whileActiveNote`) so the user sees the floor is
   * conditional — mirrors the weapon-damage breakdown note.
   */
  whileActive?: boolean;
}

/**
 * Localize the bilingual `description` on each roll-floor clause (Reliable Talent,
 * …) so the Passives rail renders ready strings.
 */
export function rollFloorVMs(
  floors: ReadonlyArray<RollFloorClause>,
  locale: Locale
): RollFloorVM[] {
  return floors.map((f) => ({
    sourceId: f.sourceId,
    description: localizeText(f.description, locale),
    ...(f.whileActiveKey ? { whileActive: true } : {}),
  }));
}

/**
 * A render-ready SELF-side downside note (Reckless Attack): the source id + its
 * localized text, marked "· active" when it rides a currently-up `while-active`
 * toggle. Rendered as a defensive Disadv. line on the rail.
 */
export interface IncomingAttackVM {
  sourceId: string;
  description: string;
  /** `true` when the downside rides a currently-active `while-active` toggle. */
  whileActive?: boolean;
}

/**
 * Localize the bilingual `description` on each incoming-attack-advantage clause
 * (Reckless Attack's defensive downside) so the rail renders ready strings.
 */
export function incomingAttackAdvantageVMs(
  clauses: ReadonlyArray<IncomingAttackClause>,
  locale: Locale
): IncomingAttackVM[] {
  return clauses.map((c) => ({
    sourceId: c.sourceId,
    description: localizeText(c.description, locale),
    ...(c.whileActiveKey ? { whileActive: true } : {}),
  }));
}

// ─── PRIM-aura/emanation ────────────────────────────────────────────────────

/** A render-ready aura/emanation note (PRIM-aura/emanation). */
export interface AuraVM {
  sourceId: string;
  /** Localized name of the granting source (feature / feat / magic item). */
  name: string;
  auraId: string;
  /** Who the aura touches. */
  affects: AuraClause["affects"];
  /** Resolved radius, locale-formatted ("10 ft" / "3 m"); null when variable
   *  with no level match. */
  radiusLabel: string | null;
  /** The structured effect payload (the consumer renders the formula/word). */
  effect: AuraClause["effect"];
  /** Localized authored blurb (empty string when none authored). */
  description: string;
}

/**
 * Resolve + localize each aura/emanation clause for the rail. `level` resolves a
 * `"variable"` radius via `radiusByLevel` (the largest entry whose key ≤ level
 * wins; null when the character is below every threshold). Numeric radii format
 * locale-aware (EN ft / IT m). The structured `effect` passes through so the
 * consumer can render its formula (the engine never rolls — informational note).
 */
/**
 * Localized display name for a grant's source id — the feature id is the usual
 * case (Wrath of the Sea, Heroic Rally); feats, magic items, and SPELLS (a
 * while-active buff spell's start-of-turn temp-HP note, e.g. Heroism) resolve
 * through the same cascade. Falls back to the raw id so the throwing SRD resolver
 * never fires on an unknown source. Shared by the aura section + the
 * start-of-turn regen/temp-HP note (one helper, rule 6).
 */
export function grantSourceLabel(sourceId: string, locale: Locale): string {
  // Race-trait session ids carry the `race:<raceId>:<trait.id>` shape — resolve
  // them through the race SRD catalogue (Orc Relentless Endurance, etc.), else a
  // race-trait source would surface its raw session id.
  if (sourceId.startsWith("race:")) {
    const raceLabel = raceTraitSourceLabel(sourceId, locale);
    if (raceLabel) return raceLabel;
  }
  for (const kind of ["class-feature", "feat", "magic-item", "spell"] as const) {
    if (hasSrd(kind, sourceId, "name", locale)) {
      return localizeSrd(kind, sourceId, "name", locale);
    }
  }
  return sourceId;
}

/** Localized name for a `race:<raceId>:<trait.id>` trait session id (or null). */
function raceTraitSourceLabel(sourceId: string, locale: Locale): string | null {
  const firstColon = sourceId.indexOf(":");
  const secondColon = sourceId.indexOf(":", firstColon + 1);
  if (firstColon < 0 || secondColon < 0) return null;
  const raceId = sourceId.slice(firstColon + 1, secondColon);
  const traitId = sourceId.slice(secondColon + 1);
  const race = getRace(raceId);
  if (!race) return null;
  // The third segment is now the trait's stable id (GR 12+22) — match on the id,
  // never on a display string.
  const trait = race.traits.find((tr) => tr.id === traitId);
  if (!trait) return null;
  const key = rawRaceTraitCatKey(raceId, trait);
  return hasSrd("race", key, "name", locale)
    ? localizeSrd("race", key, "name", locale)
    : null;
}

/**
 * Resolve the ability tokens in an aura's dice formula against the character's
 * scores so the rail shows a CONCRETE formula (engine rolls no dice):
 * `"WISd6"` (a number of d6s = WIS mod, min 1) → `"4d6"`; `"1d8+WIS"` →
 * `"1d8+4"` (a zero modifier drops the term; negative folds the sign). Pure.
 */
export function resolveAuraDice(
  dice: string,
  scores: Readonly<Record<AbilityCode, number>>
): string {
  const mod = (ab: string): number => abilityModifier(scores[ab as AbilityCode]);
  return dice
    .replace(/^(STR|DEX|CON|INT|WIS|CHA)(?=d\d)/, (ab) => String(Math.max(mod(ab), 1)))
    .replace(/\+(STR|DEX|CON|INT|WIS|CHA)\b/g, (_m, ab: string) => {
      const v = mod(ab);
      if (v === 0) return "";
      return v > 0 ? `+${v}` : `${v}`;
    });
}

export function auraVMs(
  auras: ReadonlyArray<AuraClause>,
  level: number,
  locale: Locale
): AuraVM[] {
  return auras.map((a) => {
    let radiusFt: number | null;
    if (a.radius === "variable") {
      radiusFt = null;
      if (a.radiusByLevel) {
        for (const [from, ft] of Object.entries(a.radiusByLevel)) {
          if (level >= Number(from)) radiusFt = ft;
        }
      }
    } else {
      radiusFt = a.radius;
    }
    // S12b — a level-scaled aura die (Circle-of-Stars Archer/Chalice 1d8→2d8 at
    // L10) folds its `diceByLevel` map down to the concrete base for the
    // character's level BEFORE the ability tokens resolve, via the SAME shared
    // "highest threshold ≤ level" helper the form-attack + action resolvers use.
    // `dice` is the floor below the first threshold (resolveAuraDice then folds
    // the ability mod). Effects with no level map pass through unchanged.
    const effect =
      (a.effect.kind === "ranged-attack" || a.effect.kind === "heal") &&
      a.effect.diceByLevel
        ? {
            ...a.effect,
            dice: pickDiceByLevel(a.effect.diceByLevel, level) ?? a.effect.dice,
          }
        : a.effect;
    return {
      sourceId: a.sourceId,
      name: grantSourceLabel(a.sourceId, locale),
      auraId: a.auraId,
      affects: a.affects,
      radiusLabel:
        radiusFt == null || radiusFt <= 0 ? null : localeDistance(radiusFt, locale),
      effect,
      description: a.description ? localizeText(a.description, locale) : "",
    };
  });
}

// ─── S9 — consumed buff-potion duration banners ─────────────────────────────

/** A render-ready countdown for a CONSUMED buff potion (Potion of Speed / …). */
export interface PotionTimerVM {
  /** The item id (the `potion:<id>` timer key's suffix) — stable, for the key. */
  itemId: string;
  /** Localized magic-item name (the buff's source). */
  name: string;
  /** Rounds remaining in the buff's duration (counts down at each End Turn). */
  roundsLeft: number;
}

/**
 * S9 — every active CONSUMED buff-potion countdown, resolved from
 * `session.effectTimers` keys prefixed `potion:` (the self-sustaining timers the
 * store armed when the potion was drunk). The item NAME localizes here at the
 * presenter edge (SoC — the engine map is locale-free); the rail renders each as
 * a small duration banner reusing the SAME `combat.effectTimerShort` chrome the
 * while-active timers use. Empty when no potion is active.
 */
export function potionTimerVMs(
  effectTimers: Record<string, { roundsLeft: number }> | undefined,
  locale: Locale
): PotionTimerVM[] {
  if (!effectTimers) return [];
  const out: PotionTimerVM[] = [];
  for (const [key, timer] of Object.entries(effectTimers)) {
    if (!key.startsWith("potion:")) continue;
    const itemId = key.slice("potion:".length);
    out.push({
      itemId,
      name: hasSrd("magic-item", itemId, "name", locale)
        ? localizeSrd("magic-item", itemId, "name", locale)
        : itemId,
      roundsLeft: timer.roundsLeft,
    });
  }
  return out;
}

// ─── PRIM-copy-to-2nd-target ────────────────────────────────────────────────

/** A render-ready copy-to-2nd-target rider note (PRIM-copy-to-2nd-target). */
export interface CopyToTargetVM {
  sourceId: string;
  copyId: string;
  appliesToFeature?: string;
  /** Localized bilingual blurb of what the second target receives. */
  effect: string;
}

/** Localize each copy-to-2nd-target rider so the feature note renders ready strings. */
export function copyTargetVMs(
  copies: ReadonlyArray<CopyToTargetClause>,
  locale: Locale
): CopyToTargetVM[] {
  return copies.map((c) => ({
    sourceId: c.sourceId,
    copyId: c.copyId,
    ...(c.appliesToFeature && { appliesToFeature: c.appliesToFeature }),
    effect: localizeText(c.effect, locale),
  }));
}

// ─── PRIM-resource-conversion ───────────────────────────────────────────────

/**
 * One COMMITTABLE conversion option (PRIM-resource-conversion) — a concrete,
 * already-validated choice the player can take RIGHT NOW. The rail renders the
 * list per conversion entry and clicking one immediately commits the plan
 * (`planResourceConversion(entry, choice)` → `applyCommitOps`, with undo) —
 * the combat immediate-commit-with-undo model.
 */
export interface ConversionOptionVM {
  kind: "create-slot" | "slot-to-points" | "restore-pact";
  /** The use-time choice to feed `planResourceConversion`. */
  choice: {
    unitsSpent?: number;
    producedSlotLevel?: number;
    slotLevel?: number;
    pactSlotLevel?: number;
    pactRestoreAmount?: number;
  };
  /** The slot level produced (create-slot). */
  producedSlotLevel?: number;
  /** Units of `fromTracker` spent (create-slot — SP or Wild Shape uses). */
  costUnits?: number;
  /** The slot level expended (slot-to-points). */
  slotLevelSpent?: number;
  /** Units credited to `toTracker` (slot-to-points). */
  pointsGained?: number;
  /** Pact-Magic slots restored (restore-pact — Magical Cunning / Eldritch Master). */
  pactRestored?: number;
}

/** The live resource context an option list is validated against. */
export interface ConversionCtx {
  /** Level in the class that owns the conversion (gates `costTable.minLevel`). */
  classLevel: number;
  /** Remaining uses of a tracker id (`fromTracker` spendable budget). */
  trackerRemaining: (trackerId: string) => number;
  /** Spent uses of a tracker id (`toTracker` creditable headroom). */
  trackerDeficit: (trackerId: string) => number;
  /** Currently EXPENDED slots at a level (a produced slot un-expends one). */
  slotsExpended: (level: number) => number;
  /** Currently AVAILABLE (unexpended) slots at a level. */
  slotsAvailable: (level: number) => number;
  /**
   * Warlock Pact-Magic pool, present ONLY for a `pact-slot` conversion (Magical
   * Cunning / Eldritch Master): the single pact slot `level`, the pool `max`,
   * how many are `expended`, and whether Eldritch Master upgrades the restore to
   * the FULL pool (else ⌈max/2⌉). Absent → the `pact-slot` case offers nothing.
   */
  pactPool?: { level: number; max: number; expended: number; restoresAll: boolean };
}

/**
 * Build the VALID conversion options for one `resource-conversion` entry —
 * every constraint enforced up front so an invalid conversion is unreachable
 * (golden rule 20), and every option maps 1:1 onto a `planResourceConversion`
 * choice that the cost-engine will accept:
 *
 *  - **Creating Spell Slots** (Font of Magic `costTable`): one option per table
 *    row whose `minLevel` ≤ the class level, whose cost fits the remaining
 *    pool, and where a slot of that level is currently EXPENDED (producing a
 *    slot un-expends one — the engine's reversible representation).
 *  - **Nature Magician** (`perUnitSlotLevels`): one option per spendable unit
 *    count, deduped by produced level (the level caps at `maxSlotLevel`, so
 *    extra units past the cap are never offered), same expended-slot gate.
 *  - **Converting Spell Slots** (`produces: "sorcery-points"`): one option per
 *    slot level with an available slot, capped to the pool's spent headroom so
 *    no point of the credit can be lost (`gain-tracker` clamps at full).
 *  - **Magical Cunning / Eldritch Master** (`produces: "pact-slot"`): ONE option
 *    restoring ⌈max/2⌉ Pact-Magic slots (the full pool when Eldritch Master
 *    upgrades it), gated on the feature's Long-Rest charge AND ≥1 Pact slot
 *    currently expended, clamped to what is expended.
 *
 * Pure — no store access; the caller supplies the live counts.
 */
export function conversionOptionVMs(
  entry: ResourceConversionEntry,
  ctx: ConversionCtx
): ConversionOptionVM[] {
  const out: ConversionOptionVM[] = [];
  switch (entry.produces) {
    case "spell-slot": {
      if (!entry.fromTracker) break;
      const budget = ctx.trackerRemaining(entry.fromTracker);
      if (entry.costTable) {
        for (const row of entry.costTable) {
          if (row.minLevel > ctx.classLevel) continue;
          if (entry.maxSlotLevel != null && row.slotLevel > entry.maxSlotLevel) continue;
          if (row.cost > budget) continue;
          if (ctx.slotsExpended(row.slotLevel) < 1) continue;
          out.push({
            kind: "create-slot",
            choice: { producedSlotLevel: row.slotLevel },
            producedSlotLevel: row.slotLevel,
            costUnits: row.cost,
          });
        }
      } else if (entry.perUnitSlotLevels != null) {
        const seen = new Set<number>();
        for (let units = 1; units <= budget; units++) {
          const raw = units * entry.perUnitSlotLevels;
          const level =
            entry.maxSlotLevel != null ? Math.min(raw, entry.maxSlotLevel) : raw;
          if (level <= 0 || seen.has(level)) continue;
          // Past the cap, extra units buy nothing — stop offering them.
          if (entry.maxSlotLevel != null && raw > entry.maxSlotLevel) break;
          seen.add(level);
          if (ctx.slotsExpended(level) < 1) continue;
          out.push({
            kind: "create-slot",
            choice: { unitsSpent: units },
            producedSlotLevel: level,
            costUnits: units,
          });
        }
      }
      break;
    }
    case "sorcery-points": {
      if (!entry.toTracker) break;
      const deficit = ctx.trackerDeficit(entry.toTracker);
      for (let level = 1; level <= 9; level++) {
        if (ctx.slotsAvailable(level) < 1) continue;
        // Cap to the pool's headroom so no point of the credit is lost.
        if (level > deficit) continue;
        out.push({
          kind: "slot-to-points",
          choice: { slotLevel: level },
          slotLevelSpent: level,
          pointsGained: level,
        });
      }
      break;
    }
    case "pact-slot": {
      // Warlock Magical Cunning (L2) / Eldritch Master (L20) — un-expend Pact-
      // Magic slots, gated on (a) the feature's ONE Long-Rest charge being
      // available and (b) at least one Pact slot currently expended (nothing to
      // regain otherwise). Magical Cunning restores ⌈max/2⌉; Eldritch Master
      // upgrades it to the full pool. The offered amount is clamped to what is
      // expended so the option never over-restores (golden rule 20).
      const pool = ctx.pactPool;
      if (!pool || !entry.fromTracker) break;
      if (ctx.trackerRemaining(entry.fromTracker) < 1) break;
      if (pool.expended < 1) break;
      const full = pool.restoresAll ? pool.max : Math.ceil(pool.max / 2);
      const amount = Math.min(full, pool.expended);
      if (amount < 1) break;
      out.push({
        kind: "restore-pact",
        choice: { pactSlotLevel: pool.level, pactRestoreAmount: amount },
        pactRestored: amount,
      });
      break;
    }
  }
  return out;
}

// ─── Activatable features ───────────────────────────────────────────────────

/**
 * The stable id-suffix that marks a `while-active` toggle as a Bloodied-gated boon
 * (Boon of Desperate Resilience, Boon of the Furious Storm). The RAW rules let the
 * player flip these on only while Bloodied, so the bar HINTS their precondition.
 * Branched on this STABLE id suffix — NEVER an English label (golden rule 7).
 */
const BLOODIED_GATE_SUFFIX = "-bloodied";

/** A render-ready activatable-feature toggle: stable key + state + localized label. */
export interface ActivatableToggleVM {
  key: string;
  active: boolean;
  label: string;
  /**
   * FRONTIER-S3 — the rounds left on this state's combat-round countdown (Rage =
   * 10 → 9 → … → expires). Derived from `session.effectTimers[key]`; absent when
   * the state has no round timer (most toggles) so the chip shows no counter.
   */
  roundsLeft?: number;
  /**
   * S5 — this boon REQUIRES the character to be Bloodied (its activeKey ends in
   * `-bloodied`: Boon of Desperate Resilience / Boon of the Furious Storm). True
   * only when the gate is UNMET (the player is NOT currently Bloodied), so the bar
   * surfaces a "requires Bloodied" hint. Override-first: the toggle is NEVER
   * hard-disabled — a player with a non-standard max can still flip it (the engine
   * applies its grants whenever the key is active). Absent on ungated toggles.
   */
  bloodiedGateUnmet?: boolean;
}

/**
 * Dedupe the `while-active` groups by key (a feature can declare the same key
 * from two sources — first label wins) and localize each label, so the toggle
 * bar renders one button per distinct key with no locale read of its own.
 *
 * S5 — `bloodied` (whether the character is currently Bloodied) gates the boon
 * toggles whose key ends `-bloodied`: when NOT Bloodied, the VM carries
 * `bloodiedGateUnmet` so the bar hints the unmet precondition (override-first — a
 * hint, never a hard lock).
 */
export function activatableToggles(
  groups: ReadonlyArray<ActivatableGroup>,
  locale: Locale,
  effectTimers?: Record<string, { roundsLeft: number }>,
  bloodied = false
): ActivatableToggleVM[] {
  const seen = new Set<string>();
  const out: ActivatableToggleVM[] = [];
  for (const g of groups) {
    if (seen.has(g.key)) continue;
    seen.add(g.key);
    // FRONTIER-S3 — fold in the round countdown from the session timer (single
    // source of truth: derived here, never re-stated per surface). Only an ACTIVE
    // state carries a live timer.
    const roundsLeft = effectTimers?.[g.key]?.roundsLeft;
    // S5 — a Bloodied-gated boon (id suffix) hints when the gate is unmet.
    const bloodiedGateUnmet = g.key.endsWith(BLOODIED_GATE_SUFFIX) && !bloodied;
    out.push({
      key: g.key,
      active: g.active,
      label: localizeText(g.label, locale),
      ...(roundsLeft !== undefined ? { roundsLeft } : {}),
      ...(bloodiedGateUnmet ? { bloodiedGateUnmet: true } : {}),
    });
  }
  return out;
}
