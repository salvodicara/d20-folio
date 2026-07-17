/**
 * Cast-options resolver — pure, testable.
 *
 * Given the character's spell-slot table and current usage, returns the
 * sorted list of slot levels ≥ baseLevel that still have at least one
 * unspent slot. Used by the Cast Level picker (UPCAST) to drive both the
 * "no choice" auto-cast path and the "multiple choices" modal.
 *
 * Optional second arm: when the spell being cast is also granted as a
 * "free cast" by a feat / feature (Fey-Touched Misty Step 1×/long-rest,
 * Shadow-Touched Invisibility 1×/long-rest, Magic Initiate L1 spell
 * 1×/long-rest), we surface a `kind: "free-cast"` row PER source. The UI
 * lets the player pick between burning a slot or spending the
 * tracker-bound free cast. Sources still on cooldown (uses >= chargesPerRest)
 * are dropped.
 */

import type { ScopedSlotLevelFormula } from "@/lib/grants";
import { METAMAGIC_BY_ID } from "@/data/metamagic";

/**
 * A single row in the Cast Level picker — a discriminated union of slot-based
 * casts (the common case) versus free casts granted by a feat / feature
 * (Fey-Touched Misty Step 1×/long-rest, Shadow-Touched Invisibility
 * 1×/long-rest, etc.) versus at-will mastery casts (Wizard L18 Spell Mastery).
 *
 * **Layering:** this type is OWNED by the engine, not the modal that renders it.
 * The cast-options resolver below produces these, the play-state engine consumes
 * them, and the UI (`components/sheet/CastLevelModal`) imports the type FROM
 * here — never the reverse (the engine must not depend on the UI; see
 * `tests/unit/architecture-direction.guard.test.ts`).
 */
export type CastLevelOption =
  | {
      kind?: "slot";
      /** Slot level (1-9). */
      level: number;
      /** Remaining slots at that level. */
      remaining: number;
      /** Total slots at that level. */
      total: number;
      /** True if this row is a pact-magic slot (Warlock). */
      pactMagic?: boolean;
    }
  | {
      kind: "free-cast";
      /** Feature id that owns the free-cast tracker. */
      sourceId: string;
      /** Localised source name (e.g. "Fey-Touched"). */
      sourceName: string;
      /** Casting level — for a slot-equivalent comparison the modal shows it. */
      level: number;
      /** Remaining free casts (charges still available). */
      remaining: number;
      /** Total free casts per rest period (typically 1). */
      total: number;
      /** Rest cadence — "long" or "short". */
      rest: "short" | "long";
    }
  | {
      /**
       * At-will free cast — Wizard L18 Spell Mastery. RAW says the chosen
       * spell can be cast at its lowest level WITHOUT a spell slot, no
       * tracker, when prepared. No charge counter, no decrement on use.
       */
      kind: "mastery";
      /** Localised source label, e.g. "Spell Mastery". */
      sourceName: string;
      /** Casting level — always the base level. */
      level: number;
    }
  | {
      /**
       * A cantrip cast (G6/W3) — slotless, no tracker. The modal opens for a
       * cantrip ONLY to let a Sorcerer attach a per-cast Metamagic option (which
       * DOES debit Sorcery Points); committing this option spends no slot, just
       * the selected Metamagic SP. `level` is always 0.
       */
      kind: "cantrip";
      level: 0;
    };

export interface SlotRow {
  level: number;
  total: number;
  pactMagic?: boolean;
}

/**
 * The stable usage-counter key for a spell slot in `session.spellSlots`.
 *
 * Pact-Magic and normal slots can share a level (a Sorcerer 3 / Warlock 2 has a
 * normal L1 pool AND a Pact L1 pool), so the usage counter MUST distinguish them
 * — keying by level alone collides the two pools into one counter (B3: spending a
 * shared L1 slot wrongly drained the Pact L1 cell and let `paymentAffordable`
 * over-spend across both pools). A normal slot keys by its bare level
 * (`String(level)`) — so a legacy doc keyed `"1"` resolves UNCHANGED as the
 * normal/shared pool — and a pact slot keys `pact-<level>`. EVERY read and write
 * of `session.spellSlots` routes through this ONE helper.
 */
export function slotUsageKey(slot: { level: number; pactMagic?: boolean }): string {
  return slot.pactMagic ? `pact-${slot.level}` : String(slot.level);
}

/**
 * Resolve which slot pool a bare-level slot cost draws from, when the cast site
 * carries only a level (a reaction / feature commit that never offered a pool
 * pick) and not the chosen {@link CastLevelOption}. Prefers the NORMAL pool when
 * one exists at that level (the standard default, and a Sorlock's reaction cast
 * spends a shared slot first); falls back to Pact Magic only when the level has
 * NO normal slot — so a pure Warlock (every slot is Pact) spends its `pact-N`
 * counter instead of writing a phantom normal key. Returns `false` (normal) when
 * neither exists (the spend is a no-op anyway).
 */
export function bareSlotIsPact(slots: ReadonlyArray<SlotRow>, level: number): boolean {
  const hasNormal = slots.some((s) => s.level === level && !s.pactMagic);
  if (hasNormal) return false;
  return slots.some((s) => s.level === level && s.pactMagic === true);
}

/**
 * One Metamagic option offered at cast time — ORTHOGONAL to the slot choice
 * (the player picks a slot AND zero-or-more Metamagic options), so this is a
 * SEPARATE list from {@link CastLevelOption}, never a 4th variant of it.
 *
 * `appliesToSpell` is the data-driven applicability verdict (Heightened only on
 * save spells, Quickened only on Action-time spells); an option that doesn't
 * apply is still SHOWN but disabled, with an honest "doesn't apply here" hint
 * (golden rule 20 — never silently hide). `affordable` gates spend against the
 * Sorcerer's remaining Sorcery Points (golden rule 20 — can't over-debit).
 */
export interface MetamagicCastOption {
  /** Stable option id (golden rule 7) — the renderer derives its label/cost. */
  id: string;
  /** Sorcery-point cost per use (from `SRD_METAMAGIC`). */
  cost: number;
  /** True when the remaining Sorcery Points cover this option's cost. */
  affordable: boolean;
  /** True when the option's per-cast applicability metadata matches the spell. */
  appliesToSpell: boolean;
  /**
   * RAW "one Metamagic option per cast" exception (BUG-6) — Empowered/Seeking
   * carry the explicit "even if you've already used another option" clause, so
   * the modal lets them stack ON TOP of the single primary. A falsy value = a
   * primary option (at most one per cast).
   */
  stacksWithPrimary: boolean;
}

/** The minimal spell facts the Metamagic applicability predicate reads. */
export interface MetamagicSpellFacts {
  /** Spell level (0 = cantrip) — gates the cantrip-excluding options (G6/W3). */
  level: number;
  /** Casting-time string ("action", "bonus", "reaction", "1 minute", …). */
  castingTime: string;
  /** True when the spell forces a saving throw (`SrdSpellData.saveAbility`). */
  forcesSave: boolean;
  /** True when the spell deals damage dice (`SrdSpellData.damageDice`). */
  dealsDamage: boolean;
  /** True when the spell makes a spell attack roll (`SrdSpellData.attackType`). */
  makesAttack: boolean;
}

/**
 * Whether a spell's casting time is an Action (the only time Quickened can
 * shorten). Reads the structured casting-time string by token — the engine's
 * casting-time vocabulary is `"action"` / `"bonus"` / `"reaction"` / a
 * duration ("1 minute") — so a leading `"action"` (case-insensitive) is the
 * Action verdict. Never a localized/display match (golden rule 7).
 */
function isActionCastingTime(castingTime: string): boolean {
  return castingTime.trim().toLowerCase().startsWith("action");
}

/**
 * The Metamagic options a Sorcerer can apply to THIS cast — their KNOWN options
 * (`knownIds`, flattened across `classes[]` by the caller) crossed with each
 * option's SP cost + per-cast applicability, gated by `sorceryRemaining`.
 *
 * Pure: branches only on the option id's data-driven `appliesWhen` metadata
 * (golden rule 7), never on a display string. An unknown id (a stale
 * pick) is skipped defensively. Order follows `knownIds`. Override-first — this
 * resolves the OPTIONS; the cast commit debits SP only for the ones the player
 * actually taps, undoably.
 */
export function metamagicOptionsForCast(
  knownIds: ReadonlyArray<string>,
  spell: MetamagicSpellFacts,
  sorceryRemaining: number
): MetamagicCastOption[] {
  const out: MetamagicCastOption[] = [];
  const seen = new Set<string>();
  for (const id of knownIds) {
    if (seen.has(id)) continue;
    const opt = METAMAGIC_BY_ID.get(id);
    if (!opt) continue;
    seen.add(id);
    const when = opt.appliesWhen;
    const appliesToSpell =
      (when?.requiresSave !== true || spell.forcesSave) &&
      (when?.requiresActionCastingTime !== true ||
        isActionCastingTime(spell.castingTime)) &&
      (when?.requiresDamage !== true || spell.dealsDamage) &&
      (when?.requiresAttack !== true || spell.makesAttack) &&
      (when?.excludesCantrip !== true || spell.level > 0);
    out.push({
      id: opt.id,
      cost: opt.cost,
      affordable: sorceryRemaining >= opt.cost,
      appliesToSpell,
      stacksWithPrimary: opt.stacksWithPrimary === true,
    });
  }
  return out;
}

/**
 * BUG-6 — the pure "toggle a Metamagic option in/out of the per-cast selection"
 * reducer, enforcing RAW's "one Metamagic option per casting" rule. 2024 lets you
 * use only ONE PRIMARY option on a cast, EXCEPT the stackers (Empowered/Seeking,
 * `stacksWithPrimary`) which add on top. Toggling `id`:
 *  - already selected → remove it;
 *  - a STACKER → add it (additive, never displaces a primary);
 *  - a PRIMARY → SWAP it in as the sole primary (drop any other primary, keep the
 *    stackers) — a radio-like primary so a 2nd primary replaces the first instead
 *    of both being debited.
 * `stackerIds` is the set of option ids whose `stacksWithPrimary` is true (from
 * the resolved options). Pure — no state, ids only (golden rule 7).
 */
export function toggleMetamagicSelection(
  selected: ReadonlyArray<string>,
  id: string,
  stackerIds: ReadonlySet<string>
): string[] {
  if (selected.includes(id)) return selected.filter((x) => x !== id);
  if (stackerIds.has(id)) return [...selected, id];
  // A primary swaps out any currently-selected primary.
  return [...selected.filter((x) => stackerIds.has(x)), id];
}

/**
 * Resolve a `scoped-extra-spell-slot` grant's declarative level formula against
 * the character's total level into a concrete slot level (1–9).
 *
 * - `half-level-round-up`: ⌈totalLevel / 2⌉, clamped to [1, cap] (Potent
 *   heritage feats — "half your level rounded up, max 5").
 * - `fixed`: the declared level.
 *
 * Pure; no RNG, no clock. A non-positive level resolves to 1 (a level-0
 * character still has a usable slot floor).
 */
export function resolveScopedSlotLevel(
  formula: ScopedSlotLevelFormula,
  totalLevel: number
): number {
  if (formula.kind === "fixed") {
    return Math.max(1, formula.level);
  }
  const half = Math.ceil(Math.max(0, totalLevel) / 2);
  return Math.min(formula.cap, Math.max(1, half));
}

/**
 * A scoped extra spell slot (a heritage feat's bonus spellcasting)
 * available for the spell being cast — a tracker-backed, upcast-capable bonus
 * slot castable ONLY when the spell is in the slot's scoped pool. `level` is the
 * already-resolved slot level; the row only appears when `level >= baseLevel`
 * (the slot can't cast a spell above its level). `usedNow >= 1` drops it.
 */
export interface ScopedSlotSource {
  sourceId: string;
  sourceName: string;
  /** Resolved slot level the spell is cast at. */
  level: number;
  /** Current tracker usage (1 = expended). */
  usedNow: number;
  /** Recovery cadence of the underlying 1-use tracker. */
  rest: "short" | "long";
}

/**
 * One free-cast source available for the spell being cast.
 * `usesPerRest` is the source's `chargesPerRest`; `usedNow` is the current
 * tracker `used` value. The row is dropped when usedNow >= usesPerRest.
 */
export interface FreeCastSource {
  sourceId: string;
  sourceName: string;
  usesPerRest: number;
  usedNow: number;
  rest: "short" | "long";
}

/**
 * Wizard L18 Spell Mastery — at-will free cast at base level. No tracker,
 * no usage cap. Surfaced as a separate row type for visual distinction.
 *
 * `autoMaxTempHp` (optional) is set when the at-will source MAXIMIZES the
 * spell's Temporary HP instead of rolling (Warlock Fiendish Vigor → False Life
 * → 12). The renderer can surface "Gain N temporary HP (maximized)" on the row;
 * applying the temp HP stays override-first.
 */
export interface MasterySource {
  sourceName: string;
  autoMaxTempHp?: number;
}

/**
 * Build available cast options at or above `baseLevel`.
 * - Pact-magic rows are tagged so the UI can badge them.
 * - Empty rows (used >= total) are dropped.
 * - Returned list is sorted ascending by level; free-cast rows come last
 *   (after the slot rows) so the default-position pick is the standard
 *   slot cast.
 *
 * `freeCastSources` is optional; passing an empty array (or omitting it)
 * preserves the legacy slot-only behavior.
 */
export function buildCastOptions(
  spellSlots: ReadonlyArray<SlotRow>,
  used: Readonly<Record<string, { used: number }>>,
  baseLevel: number,
  freeCastSources: ReadonlyArray<FreeCastSource> = [],
  masterySources: ReadonlyArray<MasterySource> = [],
  scopedSlotSources: ReadonlyArray<ScopedSlotSource> = []
): CastLevelOption[] {
  if (baseLevel <= 0) return [];
  const slots: CastLevelOption[] = [];
  for (const slot of spellSlots) {
    if (slot.level < baseLevel) continue;
    const usedAtLevel = used[slotUsageKey(slot)]?.used ?? 0;
    const remaining = slot.total - usedAtLevel;
    if (remaining <= 0) continue;
    slots.push({
      kind: "slot",
      level: slot.level,
      remaining,
      total: slot.total,
      pactMagic: slot.pactMagic === true,
    });
  }
  slots.sort((a, b) => a.level - b.level);
  const freeCasts: CastLevelOption[] = [];
  for (const src of freeCastSources) {
    const remaining = src.usesPerRest - src.usedNow;
    if (remaining <= 0) continue;
    freeCasts.push({
      kind: "free-cast",
      sourceId: src.sourceId,
      sourceName: src.sourceName,
      level: baseLevel,
      remaining,
      total: src.usesPerRest,
      rest: src.rest,
    });
  }
  // Scoped extra slots (heritage-feat spellcasting): a single tracker-backed,
  // upcast-capable slot at its resolved level. Surfaced as a `free-cast` row
  // (1 use, tracker-bound) BUT cast AT the slot's resolved level — never the
  // spell's base level. Dropped when the slot level is below the spell's base
  // level (a level-2 slot can't cast a level-3 spell) or already expended.
  for (const src of scopedSlotSources) {
    if (src.level < baseLevel) continue;
    if (src.usedNow >= 1) continue;
    freeCasts.push({
      kind: "free-cast",
      sourceId: src.sourceId,
      sourceName: src.sourceName,
      level: src.level,
      remaining: 1,
      total: 1,
      rest: src.rest,
    });
  }
  const masteries: CastLevelOption[] = masterySources.map((src) => ({
    kind: "mastery",
    sourceName: src.sourceName,
    level: baseLevel,
  }));
  // Order: slots → tracker-bounded free casts → at-will mastery rows.
  return [...slots, ...freeCasts, ...masteries];
}
