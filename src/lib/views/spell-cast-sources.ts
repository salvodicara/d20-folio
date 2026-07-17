/**
 * Shared spell cast-option assembly (ARCHITECTURE.md combat model parity).
 *
 * THE single source of a spell's castable options — upcast slots, per-rest free
 * casts (feat grants, a chosen spell's `freeCastSource`, Wizard Signature
 * Spells), at-will Wizard Spell Mastery, AND at-will Eldritch Invocation casts
 * (Armor of Shadows → Mage Armor, Mask of Many Faces → Disguise Self, …). Both
 * the Spells page and the Combat page render from this, so the two pipelines
 * can't drift.
 *
 * Pure-ish: reads the character + session, evaluates grants. No store writes.
 */
import type { BiText } from "@/data/types";
import type { CharacterDoc } from "@/types/character";
import {
  buildCastOptions,
  metamagicOptionsForCast,
  resolveScopedSlotLevel,
  type CastLevelOption,
  type FreeCastSource,
  type MasterySource,
  type MetamagicCastOption,
  type ScopedSlotSource,
} from "@/lib/cast-options";
import { evaluateGrants, type ScopedSlotSpellScope, type Grant } from "@/lib/grants";
import { resolveAllGrantSources, flattenEntryPicks } from "@/lib/resolve-grant-sources";
import { grantSourceName, localizeText } from "@/lib/views/srd-i18n";
import { srdText } from "@/lib/loc-text";
import { totalLevel as characterLevel } from "@/lib/classes";
import { resolveTrackers, resolveChargesFormula } from "@/lib/smart-tracker";
import { spellIndex } from "@/data/spells";
import { FEATS_BY_ID } from "@/data/feats";

/** The Sorcery-Point pool tracker every Sorcerer Metamagic use debits. */
const SORCERY_POINT_TRACKER_ID = "sorcerer-font-of-magic";

/** Bilingual badge labels for the mastery / signature free-cast rows. */
export interface CastBadgeLabels {
  mastery: string;
  signature: string;
}

/**
 * Every still-available free-cast source for `spellId`: feat/feature grants
 * (Fey-Touched, Magic Initiate, …), a chosen spell's ref-level `freeCastSource`
 * (free-cast heritage feats), and Wizard Signature Spells. Skips fully-spent ones.
 */
export function freeCastSourcesForSpell(
  character: CharacterDoc,
  spellId: string,
  locale: keyof BiText,
  signatureLabel: string
): FreeCastSource[] {
  const grantSources = resolveAllGrantSources(character.character);
  const nameById = new Map(
    grantSources.map((s) => [s.id, grantSourceName(s, locale)] as const)
  );
  // The displayed source NAME of a free cast is the localized FEAT name — resolved
  // by the feat-id PREFIX of the per-spell tracker key `${featId}:${spellId}` (a
  // bare key — a magic item, a single-free-cast feat — resolves directly). NEVER
  // the raw tracker id (that leaked `fey-touched:misty-step` into the cast modal);
  // a feat name that fails to resolve (a real bug) falls back to the localized
  // SPELL name, never an id — so no language/key leak can reach the UI by design.
  const sourceNameFor = (trackerKey: string, fallbackSpellId: string): string =>
    nameById.get(trackerKey.split(":")[0] ?? trackerKey) ??
    nameById.get(trackerKey) ??
    localizeText(srdText("spell", fallbackSpellId, "name"), locale);
  const session = character.session;
  const out: FreeCastSource[] = [];

  for (const entry of evaluateGrants(
    grantSources,
    new Set(character.session.activeFeatures ?? []),
    new Map(Object.entries(character.session.grantBundleChoices ?? {}))
  ).freeCasts) {
    if (entry.spellId !== spellId) continue;
    // Character-level gate (a heritage feat's second spell at character level 3).
    if (entry.minLevel != null && characterLevel(character.character) < entry.minLevel)
      continue;
    // Level/ability-scaled charges resolve here, where the character is in scope
    // (Forest Gnome: Speak with Animals "PB times per Long Rest"; Star Map /
    // Misty Wanderer / Mapping Magic: an ability-modifier count). The shared
    // `resolveChargesFormula` understands the same vocabulary as tracker totals
    // (PB, an ability code, level, arithmetic); a blank formula falls back to the
    // fixed `chargesPerRest`.
    const charges = resolveChargesFormula(
      entry.chargesFormula,
      entry.chargesPerRest,
      character
    );
    const usedNow = session.trackers[entry.sourceId]?.used ?? 0;
    if (usedNow >= charges) continue;
    out.push({
      sourceId: entry.sourceId,
      sourceName: sourceNameFor(entry.sourceId, entry.spellId),
      usesPerRest: charges,
      usedNow,
      rest: entry.rest,
    });
  }

  const ref = character.character.spells.find(
    (s) => !("custom" in s) && s.srdId === spellId
  );
  if (ref && !("custom" in ref) && ref.freeCastSource) {
    const fc = ref.freeCastSource;
    const usedNow = session.trackers[fc.sourceId]?.used ?? 0;
    if (usedNow < fc.usesPerRest && !out.some((o) => o.sourceId === fc.sourceId)) {
      out.push({
        sourceId: fc.sourceId,
        sourceName: sourceNameFor(fc.sourceId, spellId),
        usesPerRest: fc.usesPerRest,
        usedNow,
        rest: fc.rest,
      });
    }
  }

  // Wizard L20 Signature Spells — a 2/short-rest tracker shared by the two
  // picks, available only at the spell's base level (L3, handled by caller).
  if (ref && !("custom" in ref) && ref.wizardSignatureSpell === true) {
    const usedNow = session.trackers["wizard-signature-spells"]?.used ?? 0;
    if (usedNow < 2) {
      out.push({
        sourceId: "wizard-signature-spells",
        sourceName: signatureLabel,
        usesPerRest: 2,
        usedNow,
        rest: "short",
      });
    }
  }
  return out;
}

/**
 * Every at-will (unbounded, slotless) cast source for `spellId` — Warlock's
 * at-will Eldritch Invocations (Armor of Shadows, Mask of Many Faces, …). Each
 * is surfaced as an at-will (`kind: "mastery"`) row labelled with the granting
 * invocation's localized name. Returned as `MasterySource[]` so it reuses the
 * existing at-will cast-option row — no new UI primitive, no tracker, no cap.
 */
export function atWillCastSourcesForSpell(
  character: CharacterDoc,
  spellId: string,
  locale: keyof BiText
): MasterySource[] {
  const grantSources = resolveAllGrantSources(character.character);
  const nameById = new Map(
    grantSources.map((s) => [s.id, grantSourceName(s, locale)] as const)
  );
  const out: MasterySource[] = [];
  for (const entry of evaluateGrants(
    grantSources,
    new Set(character.session.activeFeatures ?? []),
    new Map(Object.entries(character.session.grantBundleChoices ?? {}))
  ).atWillCasts) {
    if (entry.spellId !== spellId) continue;
    out.push({
      sourceName: nameById.get(entry.sourceId) ?? entry.sourceId,
      // Fiendish Vigor → False Life surfaces the maximized temp-HP total (12)
      // so the at-will row can show "Gain N temporary HP (maximized)".
      ...(entry.autoMaxTempHp !== undefined
        ? { autoMaxTempHp: entry.autoMaxTempHp }
        : {}),
    });
  }
  return out;
}

/**
 * The set of spell ids a `scoped-extra-spell-slot` scope can cast, resolved
 * from the character. Pure data lookup — no RNG, no clock.
 *
 * - `heritage-feat-spells`: every always-prepared spell the character has from
 *   a heritage-category feat. Read straight off the feat data so adding or
 *   removing such a feat updates the eligible pool with no other wiring.
 *   Cantrips are excluded — the slot can only cast levelled spells.
 */
export function scopedSlotEligibleSpellIds(
  character: CharacterDoc,
  scope: ScopedSlotSpellScope
): ReadonlySet<string> {
  const out = new Set<string>();
  // `scope` is a single-member union today (`"heritage-feat-spells"`) — the
  // only modeled scoped-slot spell pool — so the body resolves it directly. A
  // future second scope would branch here on `scope`.
  void scope;
  for (const f of character.character.features) {
    if ("custom" in f) continue;
    const feat = FEATS_BY_ID.get(f.srdId);
    if (!feat || feat.category !== "heritage") continue;
    for (const g of feat.grants ?? ([] as ReadonlyArray<Grant>)) {
      if (g.type === "always-prepared-spell") out.add(g.spellId);
    }
  }
  return out;
}

/**
 * Every scoped extra-slot source (a heritage feat's bonus spellcasting slot)
 * available to cast `spellId`. For each `scoped-extra-spell-slot` grant whose
 * scope includes `spellId`, resolves the slot level from the character's total
 * level and the 1-use tracker's current usage. The slot is dropped here only
 * when fully spent; `buildCastOptions` additionally drops it when its level is
 * below the spell's base level. `recovery: "short-or-long"` surfaces as a
 * `"short"` cadence row (regained on the earlier of the two rests).
 */
export function scopedSlotSourcesForSpell(
  character: CharacterDoc,
  spellId: string,
  locale: keyof BiText
): ScopedSlotSource[] {
  const grantSources = resolveAllGrantSources(character.character);
  const nameById = new Map(
    grantSources.map((s) => [s.id, grantSourceName(s, locale)] as const)
  );
  const totalLvl = characterLevel(character.character);
  const session = character.session;
  const out: ScopedSlotSource[] = [];
  for (const entry of evaluateGrants(
    grantSources,
    new Set(character.session.activeFeatures ?? []),
    new Map(Object.entries(character.session.grantBundleChoices ?? {}))
  ).scopedExtraSlots) {
    const eligible = scopedSlotEligibleSpellIds(character, entry.scope);
    if (!eligible.has(spellId)) continue;
    const usedNow = session.trackers[entry.sourceId]?.used ?? 0;
    out.push({
      sourceId: entry.sourceId,
      sourceName: nameById.get(entry.sourceId) ?? entry.sourceId,
      level: resolveScopedSlotLevel(entry.levelFormula, totalLvl),
      usedNow,
      rest: entry.recovery === "long" ? "long" : "short",
    });
  }
  return out;
}

/**
 * Build the full ordered cast-option list for a spell at `baseLevel`: upcast
 * slots → free casts → at-will mastery. `signatureBaseLevel` lets the caller
 * pass whether the spell is being cast at its base level (Signature/Mastery
 * only apply there). Returns [] for cantrips (baseLevel 0).
 */
export function resolveSpellCastOptions(
  character: CharacterDoc,
  spellId: string,
  baseLevel: number,
  atBaseLevel: boolean,
  locale: keyof BiText,
  labels: CastBadgeLabels
): CastLevelOption[] {
  if (baseLevel <= 0) return [];
  const ref = character.character.spells.find(
    (s) => !("custom" in s) && s.srdId === spellId
  );
  // Signature/free-casts surface only at base level; the helper above already
  // gates spend, here we gate the "at base level" rule for ref-flag sources.
  const allFree = freeCastSourcesForSpell(character, spellId, locale, labels.signature);
  const freeCasts = atBaseLevel
    ? allFree
    : allFree.filter((f) => f.sourceId !== "wizard-signature-spells");
  const isMastery =
    atBaseLevel && !!ref && !("custom" in ref) && ref.wizardSpellMastery === true;
  const masteries: MasterySource[] = isMastery ? [{ sourceName: labels.mastery }] : [];
  // At-will Eldritch Invocation casts (Armor of Shadows, Mask of Many Faces, …):
  // surfaced as at-will rows at the spell's base level only, labelled with the
  // invocation's name. Like Wizard Spell Mastery they never upcast and never
  // decrement a tracker.
  if (atBaseLevel) {
    masteries.push(...atWillCastSourcesForSpell(character, spellId, locale));
  }
  // Scoped extra slots (heritage feats): a tracker-backed bonus slot at its
  // resolved level for heritage-feat spells. Unlike free-casts it CASTS at the
  // slot level (an upcast), so it's offered at every base level the slot can
  // reach — `buildCastOptions` drops it when the slot level < base level.
  const scopedSlots = scopedSlotSourcesForSpell(character, spellId, locale);
  return buildCastOptions(
    character.character.spellSlots,
    character.session.spellSlots,
    baseLevel,
    freeCasts,
    masteries,
    scopedSlots
  );
}

/**
 * The remaining Sorcery Points a character has — the `sorcerer-font-of-magic`
 * pool tracker's resolved total minus its session usage. `0` when the character
 * has no such tracker (not a Sorcerer / no Font of Magic yet). The single seam
 * the Metamagic cast affordance reads its budget from (the modal's live "N SP
 * left" headroom + the per-option affordability gate).
 */
export function remainingSorceryPoints(character: CharacterDoc): number {
  const tracker = resolveTrackers(character).find(
    (tr) => tr.id === SORCERY_POINT_TRACKER_ID
  );
  if (!tracker) return 0;
  const used = character.session.trackers[SORCERY_POINT_TRACKER_ID]?.used ?? 0;
  return Math.max(0, tracker.total - used);
}

/**
 * The Metamagic options a Sorcerer can apply to THIS cast of `spellId` — the
 * SHARED seam both the Spells page and the Combat page call (golden rule 6),
 * so the per-cast Metamagic affordance can't drift between the two cast paths.
 *
 * Flattens `metamagicChoices` across `classes[]` (a Sorcerer/X multiclass still
 * spends from `sorcerer-font-of-magic`), reads remaining Sorcery Points from the
 * pool tracker, and crosses them with each option's SP cost + data-driven
 * per-cast applicability (Heightened only on save spells, Quickened only on
 * Action-time spells, Empowered/Transmuted only on damage spells, Seeking only
 * on attack spells, Extended/Twinned never on cantrips). CANTRIPS now return
 * their applicable options (G6/W3 — slotless cast still debits SP). Returns `[]`
 * for a custom (homebrew) spell with no SRD facts, or a non-Sorcerer (no known
 * options). Pure — reads doc + session, no writes; the cast COMMIT debits SP,
 * undoably.
 */
export function resolveMetamagicForCast(
  character: CharacterDoc,
  spellId: string
): MetamagicCastOption[] {
  const knownIds = flattenEntryPicks(character.character.classes, "metamagicChoices");
  if (knownIds.length === 0) return [];
  const spell = spellIndex.get(spellId);
  // G6/W3 — 2024 reversed the 2014 "Metamagic never touches cantrips" assumption:
  // most options DO apply to cantrips (Distant/Empowered/Subtle/Seeking/Quickened/
  // Transmuted on a damage cantrip; Careful/Heightened on a save cantrip). We no
  // longer blanket-drop level-0 spells — the per-option `appliesWhen` predicate
  // (incl. `excludesCantrip` for Extended/Twinned) decides applicability. An
  // unknown/custom spell still has no SRD facts to gate on, so surface nothing.
  if (!spell) return [];
  return metamagicOptionsForCast(
    knownIds,
    {
      level: spell.level,
      castingTime: spell.castingTime,
      forcesSave: spell.saveAbility != null,
      dealsDamage: spell.damageDice != null,
      makesAttack: spell.attackType != null,
    },
    remainingSorceryPoints(character)
  );
}
