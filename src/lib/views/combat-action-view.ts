/**
 * Combat action — presentation-layer view helpers (pure, framework-free).
 *
 * Extracted from `combat.tsx` so the component file only exports a component
 * (React Fast-Refresh requirement) and so this logic is unit-testable in
 * isolation. Each function maps a `ResolvedAction` (the engine's resolved
 * combat action, from smart-tracker) to a presentational concern: its log-icon
 * type, its sort order within an economy group, and its "At Higher Levels"
 * upcast copy. No state, no side effects.
 */
import type { ActionEffect } from "@/types/combat-log";
import type {
  ActionSummary,
  RawActionSummary,
  RawResolvedAction,
  ReplaceAttackWithCastEntry,
  ResolvedAction,
  ResolvedActionHeal,
} from "@/lib/smart-tracker";
import { resolveActions } from "@/lib/smart-tracker";
import type { BreakdownLine, RawBreakdownPart } from "@/lib/value-breakdown";
import type { AbilityCode, BiText } from "@/data/types";
import type { CharacterDoc } from "@/types/character";
import { hasSrd, localizeSrd } from "@/i18n/resolver";
import { formatModifier } from "@/lib/utils";
import { localizeText } from "@/lib/views/srd-i18n";
import { resolveConditionEffects } from "@/lib/condition-effects";
import type { GatedSlot } from "@/lib/condition-effects";
import { conditionLabel } from "@/lib/views/tracker-view";
import { clampExhaustion } from "@/lib/compute";
import {
  buildWeaponFacts,
  formatWeaponRange,
  type WeaponFactsVM,
} from "@/lib/views/weapon-facts-view";
import { buildRiders, type RiderVM } from "@/lib/views/rider-view";
import { className } from "@/lib/views/level-up-view";

type Locale = keyof BiText;

/**
 * The one-line budget for a collapsed action card's effect line (characters).
 * ONE constant shared by the presenter gate below and the subtitle-budget guard
 * test — the guard fails CI when any SRD action's chosen effect line (authored
 * `summary` or `description`, via `srdEffectText`) exceeds it in either locale,
 * so an over-budget line is unrepresentable in shipped data. Sized to the
 * curated base-action register (verb + target + numbers): one line on desktop,
 * at most two wrapped lines on a 390 px phone — never a mid-sentence ellipsis
 * (owner mandate 2026-06-12; DESIGN.md §3 No-Truncation Rule).
 */
export const EFFECT_LINE_BUDGET = 60;

/**
 * The presenter's omit-not-slice gate: a resolved effect line that fits the
 * budget passes through verbatim; a longer one (custom user prose — SRD lines
 * are guard-bounded) is OMITTED from the collapsed subtitle entirely. The full
 * description remains one tap away in the card's accordion. There is NO
 * truncation path: the old `shortenEffect` slice-to-"…" mechanism is deleted.
 */
function fitsEffectBudget(line: string): string | undefined {
  return line.length <= EFFECT_LINE_BUDGET ? line : undefined;
}

// ─── Action localization (the engine → display edge) ──────────────────────────

/** The bilingual dual-wield off-hand name suffix (presenter-owned literal). */
const OFFHAND_SUFFIX: Record<Locale, string> = {
  en: " (off-hand)",
  it: " (mano secondaria)",
};

/** The bilingual Pact-of-the-Blade Prone-rider note template (presenter-owned). */
const PACT_PRONE_NOTE: Record<Locale, (rider: string) => string> = {
  en: (r) => `${r}: spend a Pact Magic slot; target Prone (Huge or smaller)`,
  it: (r) =>
    `${r}: spendi uno slot Magia del Patto; bersaglio Prono (Enorme o più piccolo)`,
};

/**
 * The one-line budget for ANY card chip (characters) — the chip token contract
 * ("names wrap, chips don't", CARD-NAMES; owner 2026-06-12: "chips in action
 * cards should never be that big"). ONE constant shared by the {@link chipText}
 * gate below, the `.uc-verdict` nowrap recipe (folio.css — the CSS lock), and
 * the chip-budget guard test, which walks every chip every SRD action emits in
 * BOTH locales and fails CI on any over-budget composition — an oversized chip
 * is unrepresentable in shipped data. 20ch matches the bound the chip recipe
 * has carried since CARD-NAMES.
 */
export const CHIP_BUDGET = 20;

/**
 * The chip omit-not-wrap gate (every verdict-chip composer routes through it):
 * prefer the fully-labelled composition ("1d10+5 Heal"); when it exceeds the
 * budget drop the LABEL and keep the core token ("1d10+5") — the chip's
 * colour/icon still carries the semantics; when even the core exceeds
 * (unbounded custom content) return `undefined` — the card simply shows no
 * chip and the detail stays one tap away in the accordion. NEVER mid-word,
 * NEVER multi-line (DESIGN.md §3 No-Truncation Rule).
 */
export function chipText(core: string, composed?: string): string | undefined {
  if (composed && composed.length <= CHIP_BUDGET) return composed;
  if (core.length <= CHIP_BUDGET) return core;
  return undefined;
}

/**
 * The heal-provenance phrase for the breakdown tip ("Fighter level" / "livello
 * da Guerriero" — IT SRD 5.2.1 phrasing). The class name resolves through the
 * shared {@link className} helper (single source — golden rule 6); only the
 * connective word + word order is presenter-owned. It lives in the TIP now,
 * never in the chip: the chip shows the evaluated number (chip-compact).
 */
const CLASS_LEVEL_PHRASE: Record<Locale, (cls: string) => string> = {
  en: (cls) => `${cls} level`,
  it: (cls) => `livello da ${cls}`,
};

/**
 * Format the engine's EVALUATED {@link ResolvedActionHeal} into the compact,
 * locale-free heal-chip token ("1d10+5", "2d4+3", "1d10", flat "5"). The words
 * that used to live here ("Fighter level") moved to the breakdown tip
 * ({@link localizeHealBreakdown}) — the chip carries only what the player needs
 * to roll, with every known quantity already resolved by the engine.
 */
export function formatActionHeal(heal: ResolvedActionHeal): string {
  const bonus = heal.bonus !== 0 ? formatModifier(heal.bonus) : "";
  return heal.dice ? `${heal.dice}${bonus}` : String(heal.bonus);
}

/**
 * Compose the heal chip's provenance lines for the shared breakdown tip — the
 * SAME {@link BreakdownLine} register the weapon damage label + AC etc. ride
 * (`BreakdownTip`), so heal chips and every value's figure share ONE tip
 * component (golden rule 3). The die row is labelled with the action's own
 * localized name (exactly as a weapon's die row is labelled with the weapon);
 * the bonus row says WHERE the number comes from ("Fighter level +5" /
 * "livello da Guerriero +5", "+3 WIS"). No tip for an unprovenanced heal
 * (flat / dice-only) — the chip already says everything.
 */
export function localizeHealBreakdown(
  heal: ResolvedActionHeal,
  actionName: string,
  locale: Locale
): BreakdownLine[] | undefined {
  if (!heal.term || heal.bonus === 0 || !heal.dice) return undefined;
  const dieLine: BreakdownLine = { kind: "loc", value: heal.dice, label: actionName };
  if (heal.term.kind === "class-level") {
    return [
      dieLine,
      {
        kind: "loc",
        value: formatModifier(heal.bonus),
        label: CLASS_LEVEL_PHRASE[locale](className(heal.term.classId, locale)),
      },
    ];
  }
  return [
    dieLine,
    { kind: "ability", value: formatModifier(heal.bonus), ability: heal.term.ability },
  ];
}

/**
 * Localize one engine-emitted {@link RawActionSummary} into the display
 * {@link ActionSummary}: resolve the `LocText` range/duration/effect/trigger refs
 * to the active locale (gating `effect` on {@link EFFECT_LINE_BUDGET} — omitted
 * when over, NEVER sliced — and composing the pact Prone note) and format the
 * structured `weaponRange` into the `range` string. The RAW weapon facts (`properties` / `weaponCategory` /
 * `weaponMastery`) do NOT pass through — `localizeAction` folds them into the
 * unified {@link WeaponFactsVM} instead. Every numeric / token / formula field
 * passes through untouched.
 */
/**
 * Localize the engine's weapon-damage breakdown parts into display lines for
 * the damage tooltip — SRD content (weapon / feature / item names) resolves
 * HERE; the two APP strings (the ability short name, the "active" note) stay
 * structured for the edge's `t(...)`. ONE formatter for every surface that
 * shows the breakdown (combat action card + inventory WeaponCard), so the
 * tooltip reads identically everywhere (golden rule 6).
 */
export function localizeBreakdown(
  parts: ReadonlyArray<RawBreakdownPart>,
  locale: Locale
): BreakdownLine[] {
  return parts.map((p) => {
    if ("dice" in p) {
      // A die row (weapon/heal): the SRD NAME labels it; the dice string shows
      // verbatim (it is not a signed numeric contribution).
      return {
        kind: "loc",
        value: p.dice,
        label: localizeText(p.label.loc, locale),
        ...(p.note ? { note: p.note } : {}),
      };
    }
    const value = formatModifier(p.value);
    if ("term" in p.label) {
      return {
        kind: "term",
        value,
        term: p.label.term,
        ...(p.note ? { note: p.note } : {}),
      };
    }
    if ("ability" in p.label) {
      return {
        kind: "ability",
        value,
        ability: p.label.ability,
        ...(p.note ? { note: p.note } : {}),
      };
    }
    return {
      kind: "loc",
      value,
      label: localizeText(p.label.loc, locale),
      ...(p.note ? { note: p.note } : {}),
    };
  });
}

/**
 * Localize weapon-damage parts for the damage tooltip — a thin alias over the
 * generic {@link localizeBreakdown}. Kept named for the weapon surfaces (combat
 * card + inventory WeaponCard); damage now rides the ONE register (golden rule 3).
 */
export function localizeDamageBreakdown(
  parts: ReadonlyArray<RawBreakdownPart>,
  locale: Locale
): BreakdownLine[] {
  return localizeBreakdown(parts, locale);
}

function localizeSummary(
  summary: RawActionSummary,
  locale: Locale,
  actionName: string
): ActionSummary {
  const {
    range,
    weaponRange,
    duration,
    effect,
    pactProneRiders,
    trigger,
    heal,
    ...rest
  } = summary;
  // The RAW weapon facts are folded into the unified WeaponFactsVM by
  // `localizeAction` — strip them so no raw token leaks into the localized
  // summary (they have no localized counterpart by design). The per-source
  // damage breakdown likewise rides `weaponFacts.breakdown` (NOT the summary).
  delete rest.properties;
  delete rest.weaponCategory;
  delete rest.weaponMastery;
  // RA-13 — the resolved mastery numbers ride `weaponFacts` (the chip labels),
  // not the display summary.
  delete rest.masteryDetail;
  // RA-17 — the Heavy-property Disadvantage advisory rides `weaponFacts`, not the
  // display summary.
  delete rest.heavyDisadvantage;
  delete rest.damageBreakdown;
  delete rest.attackBreakdown;
  // The on-hit RIDERS carry a `source` NAME ref (a LocText) → they have no place
  // on the LOCALIZED summary; `localizeAction` resolves them into the render-ready
  // `riders: RiderVM[]` instead (the ONE shared rider strip both weapon surfaces
  // render). Strip the raw carriers so no LocText leaks into the display summary.
  delete rest.extraDamage;
  delete rest.dieModifiers;
  delete rest.onHitHeal;
  // Evaluated heal (feature/trait action chip) → the compact word-free token
  // ("1d10+5") + the provenance lines for the breakdown tip. A word-free
  // `healing` string (spells/potions: pure dice+flat) passes through `rest`.
  const healingChip = heal ? formatActionHeal(heal) : undefined;
  const healingBreakdown = heal
    ? localizeHealBreakdown(heal, actionName, locale)
    : undefined;
  // S8 ROLL-ENTRY — a feature `heal:` action that rolls a die (Second Wind 1d10 +
  // level) carries a self-applicable heal: surface the dice token (the player
  // rolls + enters it) + the deterministic bonus, so the card can apply
  // `enteredRoll + bonus` (golden rule 21 — the app never rolls). A dice-FREE
  // heal would be a true one-tap, but none exist in data; omitting `dice` here
  // leaves no roll-entry affordance (the chip already shows the flat value).
  const healApply = heal?.dice ? { dice: heal.dice, bonus: heal.bonus } : undefined;
  // The Temp-HP sibling (`summary.tempHpApply` — False Life's 2d4+4, or Fiendish
  // Vigor's dice-free one-tap 12) is LOCALE-FREE (a dice string + numbers), so —
  // unlike `healApply`, which the view derives from the stripped `heal` object —
  // the engine emits it directly and it flows through the `...rest` spread below
  // untouched. Called out here so the boundary is explicit: no derivation needed.
  // The Pact-of-the-Blade Prone note: compose the bilingual sentence here from
  // the rider name refs (the engine surfaced them; only the view has a locale).
  const proneEffect =
    pactProneRiders && pactProneRiders.length > 0
      ? pactProneRiders
          .map((r) => PACT_PRONE_NOTE[locale](localizeText(r, locale)))
          .join(" · ")
      : undefined;
  // The omit-not-slice gate: SRD lines are guard-bounded to the budget; an
  // over-budget line (unbounded custom prose) is dropped from the collapsed
  // subtitle — never ellipsized. The composed pact-Prone note is a complete
  // bounded clause (template + rider name), not sliced prose, so it passes as-is.
  const resolvedEffect = effect
    ? fitsEffectBudget(localizeText(effect, locale))
    : proneEffect;
  return {
    ...rest,
    ...(healingChip ? { healing: healingChip } : {}),
    ...(healingBreakdown ? { healingBreakdown } : {}),
    ...(healApply ? { healApply } : {}),
    ...(weaponRange
      ? { range: formatWeaponRange(weaponRange, locale) }
      : range
        ? { range: localizeText(range, locale) }
        : {}),
    ...(duration ? { duration: localizeText(duration, locale) } : {}),
    ...(resolvedEffect ? { effect: resolvedEffect } : {}),
    ...(trigger ? { trigger: localizeText(trigger, locale) } : {}),
  };
}

/**
 * Localize one engine-emitted {@link RawResolvedAction} into the display
 * {@link ResolvedAction}: resolve `name`/`description` to the active locale,
 * carry `name.en` as `nameEn` (so the combat search still matches either
 * language), localize the summary, and — for weapon rows — fold the RAW weapon
 * facts (formulas, range spec, property tokens, category, owned mastery) into
 * the unified facts VM. This is the ONE edge where a combat action's bilingual
 * data becomes display strings (docs/ARCHITECTURE.md).
 */
export function localizeAction(action: RawResolvedAction, locale: Locale): CombatAction {
  const { name, description, summary, ...rest } = action;
  // The render-ready on-hit rider strip (extra damage / die manipulation / on-hit
  // heal) — ONE seam both weapon surfaces feed, built from the engine's locale-free
  // rider data. Empty array when the action has no rider (the surface shows none).
  const riders = buildRiders(summary, locale);
  // The dual-wield off-hand row appends a fixed bilingual suffix to the weapon's
  // own name (composed here — the engine carries only the base name ref).
  const suffix = action.offhand ? OFFHAND_SUFFIX[locale] : "";
  const enSuffix = action.offhand ? OFFHAND_SUFFIX.en : "";
  const localizedName = localizeText(name, locale) + suffix;
  // The unified weapon facts block (the SAME recipe the inventory WeaponCard
  // renders) — built only for weapon rows carrying the structured attack facts.
  const weaponFacts =
    action.source === "weapon" && summary.damage && summary.attackBonus != null
      ? buildWeaponFacts(
          {
            damage: summary.damage,
            versatileDamage: summary.versatileDamage,
            damageType: summary.damageType ?? "bludgeoning",
            attackBonus: summary.attackBonus,
            rangeSpec: summary.weaponRange,
            properties: summary.properties,
            category: summary.weaponCategory,
            mastery: summary.weaponMastery,
            extraMasteries: summary.extraMasteries,
            // RA-13 — the resolved Topple DC / Graze number for the chip labels.
            masteryDetail: summary.masteryDetail,
            // RA-17 — the Heavy-property attack-roll Disadvantage advisory.
            heavyDisadvantage: summary.heavyDisadvantage ?? false,
            // The per-source damage breakdown ("+3 STR · +2 Rage") rides the
            // unified facts VM so the shared `WeaponFacts` component attaches the
            // `BreakdownTip` to its own damage label — ONE seam for both
            // weapon surfaces (golden rule 6).
            breakdown: summary.damageBreakdown
              ? localizeDamageBreakdown(summary.damageBreakdown, locale)
              : null,
            // The per-source to-hit breakdown ("+3 STR · +2 PB · +2 Archery") —
            // the to-hit sibling, surfaced on the to-hit value (#94).
            attackBreakdown: summary.attackBreakdown
              ? localizeBreakdown(summary.attackBreakdown, locale)
              : null,
            // The on-hit rider strip rides the unified facts VM so the shared
            // `WeaponFacts` component renders it identically on BOTH weapon
            // surfaces (combat card + inventory card) — golden rule 6.
            riders,
            // The on-hit REMINDER (Armorer Guardian Disadvantage, Dreadnaught
            // push/pull, the unarmed-strike unburdened-d8 gloss) rides the FULL
            // localized effect into the expanded weapon-facts panel — progressive
            // disclosure (golden rule 19), so a reminder too long for the collapsed
            // 60-char subtitle budget still SURFACES where it has room. The
            // collapsed gloss suppresses `summary.effect` once structured facts
            // exist (PlayTab), so there is no double-render.
            onHitNote: summary.effect ? localizeText(summary.effect, locale) : null,
          },
          locale
        )
      : undefined;
  return {
    ...rest,
    name: localizedName,
    nameEn: localizeText(name, "en") + enSuffix,
    // The action's NAME as the engine's localizable LocText reference — carried
    // verbatim so the combat LOG stores a stable, re-localizable reference
    // (golden rule 7) instead of the economy-suffixed row `id` or the
    // frozen localized `name`. `localizeText(name, locale)` resolves any variant
    // (srd id-ref / lit constant / custom string) at render. The off-hand
    // "(off-hand)" suffix is added to the display `name` ABOVE, AFTER localization,
    // so this base ref logs the bare weapon name without the suffix — an
    // acceptable minor residual.
    nameLoc: name,
    summary: localizeSummary(summary, locale, localizedName),
    ...(weaponFacts ? { weaponFacts } : {}),
    // A non-weapon action row (a weapon-attack cantrip etc.) carries no
    // `weaponFacts`, so its riders ride the action directly for the card to
    // render. Weapon rows render them through `weaponFacts.riders` (above), so the
    // card reads `riders` only when there is no `weaponFacts` (no double-render).
    ...(riders.length > 0 ? { riders } : {}),
    ...(description ? { description: localizeText(description, locale) } : {}),
  };
}

/**
 * A localized combat action extended with the unified weapon facts block for
 * weapon-source rows. `weaponFacts` is the SAME {@link WeaponFactsVM} the
 * inventory presenter builds for the same weapon, so the two surfaces show
 * identical weapon facts by construction (owner mandate 2026-06-12) — combat
 * adds only its CTA/economy extras on top.
 */
export interface CombatAction extends ResolvedAction {
  weaponFacts?: WeaponFactsVM;
  /**
   * The render-ready on-hit rider strip — present only for a NON-weapon action
   * row that carries riders (a weapon-attack cantrip like True Strike). Weapon
   * rows surface the SAME strip through `weaponFacts.riders`, so the card reads
   * this top-level field only when there is no `weaponFacts` (no double-render).
   */
  riders?: RiderVM[];
}

/**
 * Resolve + localize a character's combat actions for the Play surface.
 * `resolveActions` (engine) is locale-free; this presenter localizes every row
 * at the edge so `PlayTab` reads ready-to-render strings.
 */
export function localizeActions(character: CharacterDoc, locale: Locale): CombatAction[] {
  return resolveActions(character).map((a) => localizeAction(a, locale));
}

/**
 * Map a resolved combat action to its semantic {@link ActionEffect} (the action-
 * log row's GLYPH axis) so each `action-use`/`reaction-use` event gets its own
 * semantically-correct icon (the colour comes from the economy slot).
 *
 * The type follows the action's EFFECT first, then its resource SOURCE — so a
 * healing spell logs green/"heal" (not the purple/"spell-cast" of its slot) and
 * a damaging non-weapon spell logs red/"damage". Precedence:
 *   1. `summary.healing` present → "heal" (green Heart) — beats everything,
 *      including a source of spell/feature; the row is fundamentally a heal.
 *   2. non-weapon action that deals damage (`summary.damage` /
 *      `summary.damageType` / `summary.damageTypes`) → "damage" (red Sword);
 *      weapons already map to "attack" (also red) below, so only spells/features
 *      that deal damage are re-routed here.
 *   3. fall back to the resource source: spell→"spell-cast" (Sparkles),
 *      weapon→"attack" (Sword), feature→"tracker-use" (Diamond).
 *   4. unknown source → "generic" (Dot).
 *
 * Driving off effect keeps buffs/control spells (Bane, Suggestion — no heal, no
 * damage) on "spell-cast" and utility features on "tracker-use", while heals and
 * damaging spells get their correct hue.
 */
export function logTypeForAction(
  action: RawResolvedAction | ResolvedAction
): ActionEffect {
  const { healing, damage, damageType, damageTypes } = action.summary;
  // Either the localized `healing` string (spells/potions, or a localized action
  // summary) OR the engine's structured `heal` (a RAW action summary) marks a heal
  // row — both must light the green Heart, since this runs on both shapes. `heal`
  // lives only on `RawActionSummary`; read it through a narrowed view.
  const rawHeal = (action.summary as RawActionSummary).heal;
  if (healing || rawHeal) return "heal";
  const dealsDamage = Boolean(
    damage || damageType || (damageTypes && damageTypes.length > 0)
  );
  if (dealsDamage && action.source !== "weapon") return "damage";
  switch (action.source) {
    case "spell":
      return "spell-cast";
    case "weapon":
      return "attack";
    case "feature":
      return "tracker-use";
    default:
      return "generic";
  }
}

/**
 * D8 — within-group sort tier: weapons (0) → cantrips (1) → leveled spells (2)
 * → features / everything else (3).
 */
export function actionSortTier(a: RawResolvedAction | ResolvedAction): number {
  if (a.source === "weapon") return 0;
  if (a.source === "spell" && (a.spellLevel ?? 0) === 0) return 1;
  if (a.source === "spell") return 2;
  // source === "feature" — class features / racial traits.
  return 3;
}

/**
 * The ONE "attacks remaining" derivation for an Extra-Attack hero (golden rule 6),
 * read by the attack CTA (its struck-gold LIVE state + the "N of M" count on
 * hover/sr-only — the board carries no other attacks-remaining surface: group
 * headers are pure rubrics, owner order 2026-07-10). It counts the attacks left in
 * the CURRENTLY-OPEN Attack action (BG3 grammar: no standing count anywhere — the
 * Action coin spends fully on the first swing like any action). Returns `null`
 * when there is nothing to count:
 *  - `attackBudget <= 1` (the hero makes ONE attack per action; guard case —
 *    byte-identical everywhere), OR
 *  - no Attack action is mid-swing: a fresh turn (`attacksUsed % attackBudget === 0`
 *    with 0 used) or a COMPLETED action (a positive multiple — the last swing landed
 *    the coin on its ordinary spent face; the cards dim like any spent action).
 * Otherwise it is `attackBudget - (attacksUsed % attackBudget)` — the swings left in
 * the open action (a budget-2 hero reads 1 after the first swing; Action Surge opens
 * a fresh action so the count re-fills for the second one).
 */
export function attacksRemainingInAction(
  attacksUsed: number,
  attackBudget: number
): number | null {
  if (attackBudget <= 1) return null;
  const inGroup = attacksUsed % attackBudget;
  return attacksUsed > 0 && inGroup !== 0 ? attackBudget - inGroup : null;
}

/**
 * The highest spell level a `replace-attack-with-cast` rider (Eldritch Knight War
 * Magic / Improved War Magic) may replace an attack with — `-1` when the character
 * carries no such rider. ONE reducer shared by the commit routing (the economy
 * provider) and the card marker (PlayTab), so "which casts ride a swing" has a
 * single home (golden rule 6).
 */
export function maxReplaceAttackSpellLevel(
  entries: ReadonlyArray<ReplaceAttackWithCastEntry>
): number {
  return entries.reduce((max, r) => Math.max(max, r.maxSpellLevel), -1);
}

/**
 * Whether a resolved action is a PIP ATTACK — a swing that rides the open Attack
 * action's economy instead of claiming a fresh Action slot: a weapon attack taken
 * as the Attack action, or a War-Magic cantrip/spell within the replace-attack band
 * (`spellLevel <= warMagicMaxSpellLevel`). Pure (no store): the caller gates on
 * `attackBudget > 1` (Extra Attack) — at budget 1 the ordinary economy owns every
 * attack, so no card ever wears the attacks-remaining marker.
 */
export function isPipAttackAction(
  action: RawResolvedAction | ResolvedAction,
  warMagicMaxSpellLevel: number
): boolean {
  if (action.type !== "action") return false;
  if (action.source === "weapon") return true;
  if (action.source === "spell") {
    return (action.spellLevel ?? 0) <= warMagicMaxSpellLevel;
  }
  return false;
}

/**
 * D8 — the within-group comparator (weapons → cantrips → leveled spells
 * ascending by level → features; ties broken alpha). The ALL-board groups, the
 * single-type flat list, and the Base Actions section all route through this ONE
 * comparator so the row order is identical everywhere (the economy-slot grouping
 * stays the primary axis above it). Pure + stable (copies before sorting) so
 * callers can pass a memoized list safely.
 */
export function sortActions<T extends ResolvedAction>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const ta = actionSortTier(a);
    const tb = actionSortTier(b);
    if (ta !== tb) return ta - tb;
    // Within leveled spells: ascending spell level.
    if (ta === 2 && tb === 2) {
      const la = a.spellLevel ?? 1;
      const lb = b.spellLevel ?? 1;
      if (la !== lb) return la - lb;
    }
    // Stable alpha tie-break for same tier.
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

/**
 * D9 — the locale-resolved "At Higher Levels" upcast text for a resolved combat
 * action, or `null` when the action carries none. Mirrors the Spells page: look
 * the SRD spell up by `spellId`, read its `higherLevels[locale]`. Only leveled
 * spells with upcast text return a string; cantrips, custom spells, weapons, and
 * features return `null`. Shared by BOTH the action card and the reaction card
 * so an upcastable reaction spell (Counterspell, Shield, …) shows the same
 * callout it does on the Spells page — there's exactly ONE lookup, no drift.
 */
export function combatHigherLevels(
  action: RawResolvedAction | ResolvedAction,
  locale: "en" | "it"
): string | null {
  if (action.source !== "spell" || !action.spellId) return null;
  return hasSrd("spell", action.spellId, "higherLevels", locale)
    ? localizeSrd("spell", action.spellId, "higherLevels", locale)
    : null;
}

// ─── B3: "What's limiting you this turn" summary ──────────────────────────────

/**
 * One active limiter the player is acting under this turn — a stable `kind` id
 * (the i18n key the renderer maps to) plus the data to interpolate. Engine-core
 * stays i18n-free: this presenter resolves only the SRD condition NAME (the
 * cause), keeping it a localized string; the limiter SENTENCE itself ("Speed 0",
 * "Auto-fail STR/DEX saves") is a UI key the edge resolves via `t()`.
 */
export type TurnLimiterVM =
  /** Whole action-economy slots forbidden (Incapacitated/Stunned/Paralyzed/… —
   *  `blockedSlots`). `slots` is a STABLE ordered id list (action → bonus →
   *  reaction); the edge localizes each slot name (`combat.action`/`bonus`/
   *  `reaction`). breaksConcentration is NOT a limiter — it is owned by the
   *  concentration banner (single source / DRY). */
  | { kind: "blockedEconomy"; slots: ReadonlyArray<GatedSlot>; cause: string }
  /** Disadvantage on attack rolls (Frightened/Poisoned/Prone/…) — the netted
   *  attack state must actually be disadvantage (an advantage source cancels it). */
  | { kind: "attackDisadvantage"; cause: string }
  /** Speed reduced to 0 (Grappled/Restrained/Paralyzed/…). */
  | { kind: "speedZero"; cause: string }
  /** Auto-fail STR/DEX saves (Paralyzed/Stunned/Unconscious/…). `abilities`
   *  is a STABLE ordered id list (STR before DEX); the edge localizes each. */
  | { kind: "autoFailSaves"; abilities: ReadonlyArray<AbilityCode>; cause: string }
  /** −2 to all d20 Tests per exhaustion level (level carried for the sentence). */
  | { kind: "exhaustion"; level: number }
  /** RA-08 — more than one spell slot has been expended to cast a spell this turn
   *  (2024 "one spell slot per turn"). ADVISORY only — never a block. `count` is
   *  the number of slot-paid casts so far. */
  | { kind: "spellSlotLimit"; count: number };

/**
 * Compose the ordered list of limiters the player is acting under THIS turn,
 * from the SAME inputs the Play surface already reads — `resolveConditionEffects`
 * (B1's single self-side condition seam) + the netted `attackRollState` + the
 * active exhaustion level. ONE source of truth: the cause name for each limiter
 * is re-derived from the SAME resolver (the first active condition that produces
 * the effect), never re-stated.
 *
 * Returns `[]` when nothing limits the turn (golden rule 19 — the renderer shows
 * nothing). Ordering matches the player's decision priority: attack penalty →
 * movement → saves → exhaustion. Pure + locale-aware (the lib/views localizing
 * layer): resolves only the SRD condition names; the limiter sentences are UI
 * keys the renderer applies.
 *
 * Override-first: every limiter mirrors a player-controlled condition/exhaustion;
 * clearing the source empties the summary. The engine enforces nothing here —
 * it is a pure read-out.
 */
export function composeTurnLimiters(args: {
  conditions: ReadonlyArray<string>;
  /** The netted attack-roll state (B1's `attackRollState`) — only "disadvantage"
   *  surfaces an attack limiter; "advantage"/"none" do not (an advantage source
   *  cancels a condition's disadvantage, so the player is NOT limited). */
  attackRollState: "advantage" | "disadvantage" | "none";
  exhaustion: number;
  /** RA-08 — spell slots expended to cast a spell this turn (advisory when >1). */
  spellSlotCasts?: number;
  locale: Locale;
}): TurnLimiterVM[] {
  const { conditions, attackRollState, exhaustion, spellSlotCasts = 0, locale } = args;
  const effects = resolveConditionEffects(conditions);
  const limiters: TurnLimiterVM[] = [];

  // The first active condition that produced a given effect names the cause —
  // re-derived from the SAME resolver, never re-stated (single source of truth).
  const causeFor = (predicate: (e: typeof effects) => boolean): string | null => {
    const id = conditions.find((c) => predicate(resolveConditionEffects([c])));
    return id ? conditionLabel(id, locale) : null;
  };

  // 0. Blocked action economy — the most totalising constraint (you can't take
  //    the forbidden slots at all), so it leads. The forbidden slots are a STABLE
  //    ordered list; the edge localizes each slot name. The cause is the first
  //    active condition that forbids a slot (same single-source attribution as
  //    the other limiters). `breaksConcentration` stays OUT — the concentration
  //    banner owns it (DRY); depleted pools / already-spent economy also stay out
  //    (shown on the coins/cards — golden rule 19, no duplication).
  if (effects.blockedSlots.size > 0) {
    const cause = causeFor((e) => e.blockedSlots.size > 0);
    const slotOrder: ReadonlyArray<GatedSlot> = ["action", "bonus", "reaction"];
    const slots = slotOrder.filter((s) => effects.blockedSlots.has(s));
    if (cause) limiters.push({ kind: "blockedEconomy", slots, cause });
  }

  // 1. Attack disadvantage — only when the NETTED state is disadvantage (an
  //    advantage source from a grant/condition cancels it; then no limiter).
  if (attackRollState === "disadvantage") {
    const cause = causeFor((e) => e.disadvantages.some((d) => d.rollType === "attack"));
    if (cause) limiters.push({ kind: "attackDisadvantage", cause });
  }

  // 2. Speed 0.
  if (effects.speedZero) {
    const cause = causeFor((e) => e.speedZero);
    if (cause) limiters.push({ kind: "speedZero", cause });
  }

  // 3. Auto-fail saves (STR/DEX under Paralyzed/Stunned/…). The ability ids are
  //    a STABLE ordered list; the edge localizes each short name.
  if (effects.autoFailSaves.size > 0) {
    const cause = causeFor((e) => e.autoFailSaves.size > 0);
    // Canonical order so the rendered "STR/DEX" is stable, not Set-iteration order.
    const order: ReadonlyArray<AbilityCode> = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];
    const abilities = order.filter((a) => effects.autoFailSaves.has(a));
    if (cause) limiters.push({ kind: "autoFailSaves", abilities, cause });
  }

  // 4. Exhaustion — −2 to all d20 Tests per level (2024). Only when ≥1 level.
  const level = clampExhaustion(exhaustion);
  if (level > 0) limiters.push({ kind: "exhaustion", level });

  // 5. RA-08 — one spell slot per turn (2024 "Casting Spells"). ADVISORY, last:
  //    surfaces only once the player has expended MORE than one slot this turn (a
  //    likely rules slip), never a hard block — the engine enforces nothing here
  //    (override-first; homebrew / Action-Surge-into-a-second-cast edge cases exist).
  if (spellSlotCasts > 1)
    limiters.push({ kind: "spellSlotLimit", count: spellSlotCasts });

  return limiters;
}
