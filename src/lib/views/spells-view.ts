/**
 * Spells presenter (`lib/views`) — the pure, framework-free seam that turns a
 * character + its aggregated grants into a render-ready spell view-model
 * (docs/ARCHITECTURE.md). The SpellsTab orchestrator reads ONE
 * view-model in a single memo; its section components are presentational.
 *
 * ## What it does
 *  - Resolves the EFFECTIVE spell list (stored + grant-inferred always-prepared)
 *    and groups it by level.
 *  - Localizes every SRD content string HERE via {@link localizeSrd} keyed by the
 *    stable spell id (name / range / duration / description / higherLevels /
 *    effectWord / material) — so when the BiText on `src/data/**` is later
 *    stripped, this surface keeps rendering. Custom (homebrew) spells carry their
 *    own single-locale text and bypass the resolver via {@link localizeCustom}.
 *  - Resolves the full per-spell cast STATE (prepared / always-prepared / cantrip
 *    / concentration / ritual / mastery / signature / ability-override) and the
 *    per-spell attack/DC (honoring a per-spell ability override) READ-ONLY.
 *  - Computes the cast-summary numbers (save DC, attack bonus, prepared count +
 *    max, over-limit) and the per-level slot summary.
 *
 * ## What it does NOT do
 *  - No React, no Zustand, no Firebase, no i18next (pure-modules-guard pins it).
 *  - Raw NUMBERS stay raw — modifier signs (`+3`), DC strings, "x / y" formatting,
 *    and APP i18n strings (school name, casting-time label, verdict words, facts
 *    labels) are resolved at the EDGE with `t(...)`. The view-model carries stable
 *    ids / keys / numbers for those; only SRD CONTENT is pre-localized.
 *
 * The result is a stable list of `SpellCardVM` keyed on the character/session/
 * locale — search + level filtering operate on top of it without recreating any
 * card VM, so the memo'd cards bail on a search keystroke (the perf contract the
 * `spells-tab-memo` test pins).
 */

import type { Locale } from "@/lib/locale";
import type {
  CharacterData,
  CharacterDoc,
  CustomSpell,
  SessionState,
  SrdSpellRef,
} from "@/types/character";
import type { AbilityCode, SrdSpellData } from "@/data/types";
import { spellIndex } from "@/data/spells";
import { totalLevel } from "@/lib/classes";
import {
  effectiveAbilityScores,
  effectiveSpellSaveDc,
  effectiveSpellAttackBonus,
  buildSpellSaveDcBreakdown,
  buildSpellAttackBreakdown,
  resolveSpellDieAugment,
  resolveCastingModifier,
} from "@/lib/compute";
import { localizeBreakdown } from "@/lib/views/combat-action-view";
import type { BreakdownLine } from "@/lib/value-breakdown";
import { resolveSpellAbility } from "@/lib/resolve-spell-ability";
import { resolveSpellOwningClassId } from "@/lib/spell-owning-class";
import { resolveEffectiveSpells } from "@/lib/expanded-spells";
import { canRitualCast } from "@/lib/ritual";
import { resolveAllGrantSources } from "@/lib/resolve-grant-sources";
import { slotUsageKey } from "@/lib/cast-options";
import { evaluateGrants, type SpellDieAugmentEntry } from "@/lib/grants";
import { grantSourceName } from "@/lib/views/srd-i18n";
import { customConcentrationValue } from "@/lib/concentration";
import { localizeSrd, localizeCustom, hasSrd } from "@/i18n/resolver";

type SpellRef = SrdSpellRef | CustomSpell;

/** The cast-summary strip values (raw numbers; `t()` localizes the labels). */
export interface CastSummaryVM {
  /** Effective save DC (override-aware) and the pure (override-free) reset target. */
  saveDC: number | null;
  pureSaveDC: number | null;
  /** Effective spell-attack bonus and its pure reset target. */
  attackBonus: number | null;
  pureAttackBonus: number | null;
  /**
   * The per-source composition of the save DC / attack bonus for the breakdown
   * tip ("8 base · +4 PB · +3 WIS"). Empty under a manual override (a hand-set
   * value has no engine composition — override-first), so the consumer suppresses
   * the tip. The SAME `BreakdownTip` register every value rides (golden rule 3).
   */
  saveDCBreakdown: ReadonlyArray<BreakdownLine>;
  attackBreakdown: ReadonlyArray<BreakdownLine>;
  ability: AbilityCode;
  isPreparedCaster: boolean;
  preparedCount: number;
  preparedMax: number;
  /** The computed (non-override) prepared max — the inline-override reset target. */
  purePreparedMax: number;
  overLimit: boolean;
}

/** One per-level slot row (raw counts; the rail/edit grid renders pips). */
export interface SlotSummaryVM {
  level: number;
  total: number;
  remaining: number;
  /** True for a Warlock Pact-Magic pool (a Sorlock has a normal AND a pact row
   *  at the same level — each tracks its OWN usage counter, B3). */
  pactMagic: boolean;
}

/** The per-spell facts-grid rows that carry SRD-localized values. */
export interface SpellFactsVM {
  range: string;
  /** Localized duration, or null when "Instantaneous" (the row is omitted). */
  duration: string | null;
  /** Material component text (custom spells only); null for SRD spells. */
  material: string | null;
}

/** One spell card's complete, localized, render-ready view-model. */
export interface SpellCardVM {
  /** Stable React key + identity (SRD id, or `custom-<idx>`). */
  key: string;
  /** Index into the STORED `spells[]` array (−1 for an inferred-only spell). */
  idx: number;
  /** Discriminator — SRD spells localize via the resolver; custom carry own text. */
  kind: "srd" | "custom";
  /** The underlying SRD data (null for custom) — for the verdict/facts the edge
   *  still reads structured fields (damageType, saveAbility, …) off it. */
  data: SrdSpellData | null;
  /** The stored ref (for edit writes + notes). */
  ref: SpellRef;

  // ── localized SRD content (already resolved for `locale`) ──
  name: string;
  /** Canonical EN name — the accent-insensitive search anchor (SRD only; custom
   *  spells repeat their single-locale name). Lets the surface filter without a
   *  BiText read. */
  searchEn: string;
  description: string;
  /** Localized "At Higher Levels", or null when the spell has none. */
  higherLevels: string | null;
  facts: SpellFactsVM;

  // ── cast state ──
  level: number;
  isCantrip: boolean;
  concentration: boolean;
  ritual: boolean;
  /** Currently concentrating on THIS spell (its srdId == session.concentration). */
  concentratingNow: boolean;
  isPrepared: boolean;
  isAlwaysPrepared: boolean;
  /** Toggle is locked-on (cantrip or always-prepared). */
  prepLocked: boolean;
  /** This row shows a prep column (prepared caster, or a cantrip). */
  showPrep: boolean;
  /** Dimmed: a prepared caster's leveled, un-prepared, non-edit row. */
  dimmed: boolean;
  /** Ritual cast available right now (level>0, ritual, prepared/Ritual-Adept). */
  canRitual: boolean;

  /** The localized control/debuff outcome WORD for the verdict chip (Bane's
   *  "−d4 rolls", Command's effect), or null when the spell carries none. */
  effectWord: string | null;

  // ── per-spell attack / DC (override-aware) ──
  /** The per-spell ability override (e.g. Magic Initiate Cleric → WIS), else null. */
  overrideAbility: AbilityCode | null;
  /** Effective attack bonus for THIS spell (per-spell override or the caster's). */
  attackBonus: number | null;
  /** Effective save DC for THIS spell. */
  saveDC: number | null;

  // ── wizard high-level flags ──
  wizardMastery: boolean;
  wizardSignature: boolean;
}

/**
 * The localized grant-SOURCE display-name lookup (`sourceId → localized name`)
 * for free-cast attribution in the cast toast/modal (Fey-Touched, Magic Initiate,
 * a heritage-feat spell). The sources span feats / class features /
 * subclass / species traits — the engine emits them with a `BiText` name (still
 * in place pre-strip), so this is the SEAM that resolves them for the locale,
 * keeping the surface free of any direct `[locale]` read. Returns a Map so the
 * caller looks up by stable `sourceId` and falls back to the id when unknown.
 */
export function grantSourceNames(
  character: CharacterData,
  locale: Locale
): Map<string, string> {
  return new Map(
    resolveAllGrantSources(character).map(
      (s) => [s.id, grantSourceName(s, locale)] as const
    )
  );
}

/** A level group: the level + its ordered card VMs. */
export interface SpellLevelGroupVM {
  level: number;
  spells: SpellCardVM[];
}

/** The complete Spells-tab view-model. */
export interface SpellsViewModel {
  isCaster: boolean;
  castSummary: CastSummaryVM | null;
  slots: SlotSummaryVM[];
  /** Spell groups ascending by level. Stable across search/filter (filter on top). */
  levels: SpellLevelGroupVM[];
  /** Total effective spell count (empty-state discriminator). */
  spellCount: number;
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Localize an SRD spell field, falling back to the spell's English `id` text on
 *  a missing name (never happens for catalogue spells; keeps the type total). */
function srdField(id: string, field: string, locale: Locale): string {
  return localizeSrd("spell", id, field, locale);
}

/** Build one SRD-spell card VM (everything localized for `locale`). */
function buildSrdCardVM(args: {
  ref: SrdSpellRef;
  data: SrdSpellData;
  idx: number;
  character: CharacterData;
  session: SessionState;
  locale: Locale;
  classId: string;
  casterAbility: AbilityCode | null;
  /** D2 — the EFFECTIVE ability scores (set-score item floors); the per-spell
   *  ability-override DC/attack derive from these, never the raw stored scores. */
  effectiveScores: Record<AbilityCode, number>;
  isPreparedCaster: boolean;
  isEdit: boolean;
  computedAtkBonus: number | null;
  computedSaveDC: number | null;
  spellDieAugments: ReadonlyArray<SpellDieAugmentEntry>;
  /** Grant-derived DC bumps (`spell-save-dc-bonus`) — scoped per owning class. */
  dcBonusEntries: ReadonlyArray<{ amount: number; scope: string }>;
  /** Grant-derived attack bumps (`spell-attack-bonus`) — scoped per owning class. */
  atkBonusEntries: ReadonlyArray<{ amount: number; scope: string }>;
  /** Global manual DC override (null = derive). Wins over per-spell derivation. */
  saveDCOverride: number | null;
  /** Global manual attack-bonus override (null = derive). Wins per-spell. */
  attackBonusOverride: number | null;
}): SpellCardVM {
  const {
    ref,
    data: rawData,
    idx,
    character,
    session,
    locale,
    classId,
    casterAbility,
    effectiveScores,
    isPreparedCaster,
    isEdit,
    computedAtkBonus,
    computedSaveDC,
    spellDieAugments,
    dcBonusEntries,
    atkBonusEntries,
    saveDCOverride,
    attackBonusOverride,
  } = args;

  // PRIM-spell-die-augment — re-size the printed damage die when a feature
  // upgrades it (Ranger Foe Slayer: Hunter's Mark d6→d10). Single seam: the VM
  // carries the AUGMENTED `data` so every consumer (verdict chip, detail) shows
  // the upgraded die with no extra wiring. Override-first; engine rolls no dice.
  const augmentedDice = resolveSpellDieAugment(
    spellDieAugments,
    rawData.id,
    rawData.damageDice
  );
  const data: SrdSpellData =
    augmentedDice === rawData.damageDice
      ? rawData
      : { ...rawData, damageDice: augmentedDice };

  const id = data.id;
  const name = srdField(id, "name", locale);
  const level = data.level;
  const isCantrip = level === 0;
  const isPrepared = ref.prepared ?? false;
  const isAlwaysPrepared = ref.alwaysPrepared === true;
  const prepLocked = isCantrip || isAlwaysPrepared;
  const showPrep = isPreparedCaster || isCantrip;
  const concentratingNow = session.concentration === data.id;
  const dimmed =
    isPreparedCaster && !isCantrip && !isPrepared && !isAlwaysPrepared && !isEdit;

  // Per-spell ability — the spell's effective casting ability after the feat /
  // species / MULTICLASS-owning-class cascade (`resolveSpellAbility`). For a
  // multiclass caster this is the OWNING class's ability (2024 RAW: Guiding Bolt
  // → WIS, Fireball → INT on one Cleric/Wizard); for a single-class caster it is
  // the one caster ability (== `casterAbility`), so nothing changes. Pass the
  // spell's class-list so the owning class can be derived.
  const refAbility = resolveSpellAbility(ref, character, data.classes);
  // The owning class id (for class-SCOPED grant bumps — "+1 to your Sorcerer
  // spells"). A literal/species override has no owning class → primary scope.
  const owningClassId =
    ref.spellAbilityOverride != null || ref.speciesSpellAbility
      ? classId
      : resolveSpellOwningClassId(data.classes, character, classId);
  // The per-spell ability differs from the caster's default ⇒ the card advertises
  // its owning ability. `overrideAbility` is non-null ONLY when the ABILITY
  // diverges (a Magic-Initiate pin, a species pick, OR the multiclass owning
  // ability) — this stays ability-only because the SpellCard "ability differs"
  // hint reads it. The DC/attack RECOMPUTE, however, must also fire when only the
  // owning CLASS diverges (same ability, e.g. Bard/Sorcerer both CHA): the
  // precomputed `computedSaveDC`/`computedAtkBonus` fold the PRIMARY-class-scoped
  // bump, so a class-scoped grant (Innate Sorcery → `scope:"sorcerer"` +1, Rod of
  // the Pact Keeper → `scope:"warlock"`) on a non-primary owning class would be
  // dropped — or OVER-counted on a primary-owned spell — without this (B6).
  const diverges = refAbility !== null && refAbility !== casterAbility;
  const overrideAbility: AbilityCode | null = diverges ? refAbility : null;
  // The ability to recompute FROM: the spell's owning ability — which already
  // equals `casterAbility` when only the class differs (`resolveSpellAbility`
  // returns the primary ability when no other class owns the spell), so
  // `refAbility` is the single right source here. `recomputeAbility` is non-null
  // ONLY when we must recompute — the ability OR the owning class diverges from
  // the primary AND an owning ability exists (null for a custom/non-caster spell →
  // fall to the precomputed value). It doubles as the truthiness gate + score key.
  const recomputeAbility: AbilityCode | null =
    refAbility !== null && (overrideAbility !== null || owningClassId !== classId)
      ? refAbility
      : null;
  // Override-first (rule 3): a GLOBAL manual DC/attack override wins over the
  // per-spell derivation — the player pinned the whole number. Otherwise the
  // per-spell value = owning ability + PB + the owning-class-scoped grant bump.
  const charLevel = totalLevel(character);
  const attackBonus = recomputeAbility
    ? effectiveSpellAttackBonus(
        charLevel,
        effectiveScores[recomputeAbility],
        resolveCastingModifier(atkBonusEntries, owningClassId),
        attackBonusOverride,
        session.exhaustion,
        character.proficiencyBonusOverride
      )
    : computedAtkBonus;
  const saveDC = recomputeAbility
    ? effectiveSpellSaveDc(
        charLevel,
        effectiveScores[recomputeAbility],
        resolveCastingModifier(dcBonusEntries, owningClassId),
        saveDCOverride,
        character.proficiencyBonusOverride
      )
    : computedSaveDC;

  // The "Instantaneous" branch is a FACT (omit the duration row), so read the
  // STRUCTURED `instantaneous` field — never a localized/prose string (golden rule
  // 22). The localized duration DISPLAY string is resolved via `srdField`.
  const duration = data.instantaneous ? null : srdField(id, "duration", locale);

  return {
    key: id || String(idx),
    idx,
    kind: "srd",
    data,
    ref,
    name,
    searchEn: localizeSrd("spell", id, "name", "en"),
    description: srdField(id, "description", locale),
    higherLevels: hasSrd("spell", id, "higherLevels", locale)
      ? srdField(id, "higherLevels", locale)
      : null,
    facts: { range: srdField(id, "range", locale), duration, material: null },
    effectWord: hasSrd("spell", id, "effectWord", locale)
      ? srdField(id, "effectWord", locale)
      : null,
    level,
    isCantrip,
    concentration: data.concentration,
    ritual: data.ritual,
    concentratingNow,
    isPrepared,
    isAlwaysPrepared,
    prepLocked,
    showPrep,
    dimmed,
    canRitual:
      !isCantrip && data.ritual && canRitualCast({ spell: data, classId, isPrepared }),
    overrideAbility,
    attackBonus,
    saveDC,
    wizardMastery: ref.wizardSpellMastery === true,
    wizardSignature: ref.wizardSignatureSpell === true,
  };
}

/** Build one custom (homebrew) card VM — its text bypasses the SRD resolver. */
function buildCustomCardVM(args: {
  ref: CustomSpell;
  idx: number;
  session: SessionState;
}): SpellCardVM {
  const { ref, idx, session } = args;
  const isCantrip = ref.level === 0;
  return {
    key: `custom-${idx}`,
    idx,
    kind: "custom",
    data: null,
    ref,
    name: localizeCustom(ref.name),
    searchEn: localizeCustom(ref.name),
    description: localizeCustom(ref.description),
    higherLevels: ref.higherLevels ? localizeCustom(ref.higherLevels) : null,
    facts: {
      range: ref.range ? localizeCustom(ref.range) : "",
      duration: ref.duration ? localizeCustom(ref.duration) : null,
      material:
        ref.components.m && ref.components.material
          ? localizeCustom(ref.components.material)
          : null,
    },
    level: ref.level,
    isCantrip,
    concentration: ref.concentration,
    ritual: false,
    concentratingNow: session.concentration === customConcentrationValue(ref.name),
    isPrepared: ref.prepared ?? false,
    isAlwaysPrepared: false,
    prepLocked: true,
    showPrep: true,
    dimmed: false,
    canRitual: false,
    effectWord: null,
    overrideAbility: null,
    attackBonus: null,
    saveDC: null,
    wizardMastery: false,
    wizardSignature: false,
  };
}

/**
 * Count of prepared non-cantrip spells (prepared casters only). Subclass-granted
 * "always prepared" spells never count against the limit. Reads the EFFECTIVE
 * list so a minimized doc (which dropped the granted always-prepared spells)
 * counts identically to an expanded one.
 */
function preparedCount(effective: SpellRef[], isPreparedCaster: boolean): number {
  if (!isPreparedCaster) return 0;
  return effective.filter((s) => {
    const level = "custom" in s ? s.level : (spellIndex.get(s.srdId)?.level ?? 0);
    if (level === 0 || s.prepared !== true) return false;
    if ("custom" in s) return true;
    return s.alwaysPrepared !== true;
  }).length;
}

// ── the presenter ──────────────────────────────────────────────────────────────

/**
 * Build the complete, localized Spells-tab view-model from a character document,
 * its primary class id, and the active locale. Pure — the React orchestrator
 * feeds this straight into its render. `isEdit` only affects the `dimmed` flag
 * (an un-prepared row is not dimmed while editing).
 */
export function buildSpellsViewModel(
  doc: CharacterDoc,
  classId: string,
  locale: Locale,
  isEdit: boolean
): SpellsViewModel {
  const { character, session } = doc;
  const sc = character.spellcasting;
  const isCaster = !!sc;

  const effective = resolveEffectiveSpells(character, session);

  // Grant aggregate (once) — feeds the casting-modifier bumps below AND the
  // per-card spell-die augments. B6 follow-up: thread the SAME active-feature +
  // bundle-choice context the combat path passes (smart-tracker `spellGrantAggregate`)
  // so a `while-active` class-scoped casting bump (Innate Sorcery's +1 DC/attack,
  // Robe-of-the-Archmagi-while-active) reaches the Spells-tab card identically to
  // combat — the Spells-tab DC EQUALS the combat-tab DC by construction (rule 6).
  const grantAggregate = evaluateGrants(
    resolveAllGrantSources(character),
    new Set(session.activeFeatures ?? []),
    new Map(Object.entries(session.grantBundleChoices ?? {}))
  );
  // D2 — the EFFECTIVE ability scores (set-score item floors + additive item
  // bonuses), the SAME derivation the cockpit display surfaces use. The spell save
  // DC + spell attack derive from these, so a Headband of Intellect wizard's spell
  // DC/attack reflect INT 19, and an Ioun Stone of Intellect adds its +2 (rule 6).
  // Behaviour-preserving with no ability-score item (floors/bonus empty).
  const effectiveScores = effectiveAbilityScores(
    character.abilityScores,
    grantAggregate.abilityScoreFloors,
    grantAggregate.itemAbilityScoreBonus,
    grantAggregate.itemAbilityScoreCap
  );

  // Cast-summary numbers (override-aware + the pure reset targets).
  let castSummary: CastSummaryVM | null = null;
  if (sc) {
    const level = totalLevel(character);
    const isPreparedCaster = sc.preparedCaster;
    // AX exposure audit — grant-derived bumps to the DC / spell attack
    // (`spell-save-dc-bonus` / `spell-attack-bonus`: Rod of the Pact Keeper,
    // Robe of the Archmagi, "+1 to your Sorcerer spells"). Part of the PURE
    // computed value (the reset target); a manual override replaces the whole
    // number, so the bump is skipped on the override path (override-first).
    const dcGrantBonus = resolveCastingModifier(grantAggregate.spellSaveDcBonus, classId);
    const atkGrantBonus = resolveCastingModifier(
      grantAggregate.spellAttackBonus,
      classId
    );
    // Pure (reset target) = effective value with NO manual override; the helper
    // folds the override-gated casting bump, so the effective value reuses it
    // (override → bump skipped, no override → `pure*`). One seam, no twin formula.
    const pureSaveDC = effectiveSpellSaveDc(
      level,
      effectiveScores[sc.ability],
      dcGrantBonus,
      null,
      character.proficiencyBonusOverride
    );
    const pureAtkBonus = effectiveSpellAttackBonus(
      level,
      effectiveScores[sc.ability],
      atkGrantBonus,
      null,
      session.exhaustion,
      character.proficiencyBonusOverride
    );
    const computedSaveDC = effectiveSpellSaveDc(
      level,
      effectiveScores[sc.ability],
      dcGrantBonus,
      sc.saveDCOverride,
      character.proficiencyBonusOverride
    );
    const computedAtkBonus = effectiveSpellAttackBonus(
      level,
      effectiveScores[sc.ability],
      atkGrantBonus,
      sc.attackBonusOverride,
      session.exhaustion,
      character.proficiencyBonusOverride
    );
    const prepared = preparedCount(effective, isPreparedCaster);
    const preparedMax = sc.preparedMaxOverride ?? sc.preparedMax;
    // Breakdown tips (override → empty, so the consumer suppresses the tip).
    const saveDcParts = buildSpellSaveDcBreakdown({
      level,
      abilityScore: effectiveScores[sc.ability],
      ability: sc.ability,
      pbOverride: character.proficiencyBonusOverride,
      override: sc.saveDCOverride,
      castingModifier: dcGrantBonus,
    });
    const atkParts = buildSpellAttackBreakdown({
      level,
      abilityScore: effectiveScores[sc.ability],
      ability: sc.ability,
      pbOverride: character.proficiencyBonusOverride,
      override: sc.attackBonusOverride,
      castingModifier: atkGrantBonus,
      exhaustion: session.exhaustion,
    });
    castSummary = {
      saveDC: computedSaveDC,
      pureSaveDC,
      attackBonus: computedAtkBonus,
      pureAttackBonus: pureAtkBonus,
      saveDCBreakdown: saveDcParts ? localizeBreakdown(saveDcParts, locale) : [],
      attackBreakdown: atkParts ? localizeBreakdown(atkParts, locale) : [],
      ability: sc.ability,
      isPreparedCaster,
      preparedCount: prepared,
      preparedMax,
      purePreparedMax: sc.preparedMax,
      overLimit: prepared > preparedMax,
    };
  }

  // Per-level slot summary (raw counts).
  const slots: SlotSummaryVM[] = character.spellSlots.map((slot) => {
    // Each pool reads its OWN counter (normal `String(level)` / pact `pact-N`),
    // so a Sorlock's normal + pact L1 rows never share a remaining count (B3).
    const used = session.spellSlots[slotUsageKey(slot)]?.used ?? 0;
    return {
      level: slot.level,
      total: slot.total,
      remaining: slot.total - used,
      pactMagic: slot.pactMagic === true,
    };
  });

  // Per-spell card VMs, grouped by level (ascending). Stable across search/filter.
  const isPreparedCaster = sc?.preparedCaster === true;
  const casterAbility = sc?.ability ?? null;
  const computedAtkBonus = castSummary?.attackBonus ?? null;
  const computedSaveDC = castSummary?.saveDC ?? null;
  // PRIM-spell-die-augment — from the hoisted aggregate; applied per card.
  const spellDieAugments = grantAggregate.spellDieAugments;
  // Class-scoped DC/attack grant bumps + global overrides — threaded per card so
  // a multiclass spell's per-OWNING-class DC folds the right scoped bump and
  // honors the global override (override-first). Single-class scopes to primary.
  const dcBonusEntries = grantAggregate.spellSaveDcBonus;
  const atkBonusEntries = grantAggregate.spellAttackBonus;
  const saveDCOverride = sc?.saveDCOverride ?? null;
  const attackBonusOverride = sc?.attackBonusOverride ?? null;
  const byLevel = new Map<number, SpellCardVM[]>();
  for (const ref of effective) {
    const idx = character.spells.indexOf(ref);
    let vm: SpellCardVM;
    if ("custom" in ref) {
      vm = buildCustomCardVM({ ref, idx, session });
    } else {
      const data = spellIndex.get(ref.srdId);
      if (!data) continue; // an unknown srdId has no card to render
      vm = buildSrdCardVM({
        ref,
        data,
        idx,
        character,
        session,
        locale,
        classId,
        casterAbility,
        effectiveScores,
        isPreparedCaster,
        isEdit,
        computedAtkBonus,
        computedSaveDC,
        spellDieAugments,
        dcBonusEntries,
        atkBonusEntries,
        saveDCOverride,
        attackBonusOverride,
      });
    }
    const arr = byLevel.get(vm.level) ?? [];
    arr.push(vm);
    byLevel.set(vm.level, arr);
  }
  const levels: SpellLevelGroupVM[] = [...byLevel.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([level, spells]) => ({ level, spells }));

  const spellCount = levels.reduce((acc, g) => acc + g.spells.length, 0);

  return { isCaster, castSummary, slots, levels, spellCount };
}
