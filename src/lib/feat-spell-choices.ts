/**
 * Resolve feat-driven spell choices (Magic Initiate, Fey-Touched, etc.).
 *
 * Magic Initiate-style feats carry choice-cantrip / choice-spell grants
 * that the player must resolve at feat-acquisition time:
 *   - Magic Initiate (Cleric): 2 cantrips + 1 L1 spell from Cleric list
 *   - Fey-Touched: 1 spell of choice from Divination/Enchantment list (1st L)
 *   - Shadow-Touched: 1 spell of choice from Illusion/Necromancy (1st L)
 *
 * This module is the bridge between the declarative grants (in `feat.grants`)
 * and the actual `character.spells[]` injection. The picker UI calls
 * `pendingSpellChoicesForFeat(feat)` to know what to prompt, the user
 * resolves each pick, then `applySpellChoicePicks(spells, picks)` returns
 * the new spells array.
 *
 * Picks are stored as direct SrdSpellRef additions with `prepared: true`
 * AND `alwaysPrepared: true` — they belong to the feat, not the class's
 * prepared budget. The player can manually edit later (delete spell,
 * untoggle alwaysPrepared) for full homebrew control.
 */
import { spells as ALL_SPELLS } from "@/data/spells";
import { getClassFeatures } from "@/data/classes";
import type { SrdSpellRef, CustomSpell } from "@/types/character";
import type { Grant } from "@/lib/grants";
import { countTopLevelFreeCasts, freeCastTrackerKey } from "@/lib/grants";
import type { AbilityCode, ClassId, SpellSchool, SrdSpellData } from "@/data/types";

/** A single unresolved pending pick parsed from a feat's grants. */
export interface SpellChoiceSlot {
  /** "cantrip" or "spell" — drives the picker's filter on s.level. */
  kind: "cantrip" | "spell";
  /** Spell list to restrict the picker to (e.g. "cleric"). */
  classSpellList?: ClassId;
  /**
   * choice-spell-multi-list: union of class lists the pick may draw from
   * (Bard Magical Secrets → bard+cleric+druid+wizard; Lore's Magical
   * Discoveries → cleric+druid+wizard). A spell qualifies if it is on ANY
   * listed list. Combined with `classSpellList` when both are present; when
   * both are absent the pool is unrestricted ("any spell list").
   */
  classSpellLists?: ReadonlyArray<ClassId>;
  /** Max spell level. Cantrips force 0; non-cantrips use the grant's maxLevel. */
  maxLevel: number;
  /**
   * choice-spell ritualOnly: when true, the picker restricts the pool to
   * Ritual-tagged spells (`spell.ritual === true`) across ALL class lists —
   * Warlock Pact of the Tome's Book of Shadows ("two level 1 spells that have
   * the Ritual tag … from any class's spell list"). Combines with `maxLevel`
   * and any list restriction. Absent / false = the normal pool.
   */
  ritualOnly?: boolean;
  /**
   * choice-spell spellSchool: when set, the picker restricts the pool to spells
   * of this single school of magic (`spell.school === spellSchool`). The Wizard
   * subclass Savant features are the canonical case — each School Savant
   * (Abjuration / Divination / Evocation / Illusion) draws only that school's
   * Wizard spells ("Choose two Abjuration spells of level 2 or lower…"). Combines
   * with the class-list restriction (`classSpellList: "wizard"`) and `maxLevel`.
   * Absent = any school.
   */
  spellSchool?: SpellSchool;
  /**
   * choice-spell spellSchools: the multi-school sibling of `spellSchool` —
   * the pool is restricted to spells whose school is ANY of these (Fey-Touched
   * "Divination or Enchantment", Shadow-Touched "Illusion or Necromancy").
   */
  spellSchools?: ReadonlyArray<SpellSchool>;
  /**
   * choice-spell toSpellbook: when true, picks land in the Wizard's spellbook
   * as plain refs (`prepared: false`, no `alwaysPrepared`) so they prepare like
   * any other spellbook spell — the Savant features' "add them to your spellbook
   * for free". Absent / false keeps the Magic-Initiate-style
   * `prepared:true + alwaysPrepared:true` default.
   */
  toSpellbook?: boolean;
  /** How many picks the player makes for THIS slot (usually 1 or 2). */
  count: number;
  /** Stable id within the feat — slot-0, slot-1, ... — for React keys. */
  slotId: string;
  /**
   * The GRANTING SOURCE's stable id (feat / class-feature srdId), stamped by the
   * cross-source collector (`collectChoiceSlots`) — the picker resolves it to the
   * localized feature name so every spell slot SAYS where it comes from ("Magic
   * Initiate (Cleric)", "Abjuration Savant"). Absent for single-feat callers that
   * already render their own source context.
   */
  sourceId?: string;
  /**
   * Casting ability pinned by the source grant — applied to every pick
   * landing through this slot. Magic Initiate Cleric → "WIS", Magic
   * Initiate Wizard → "INT", etc. When unset (e.g. Fey-Touched, which
   * uses your spellcasting ability), the spell falls back to the
   * character's default casting ability at render time.
   */
  spellAbility?: AbilityCode;
  /**
   * 2024 Magic Initiate: the casting ability is the player's choice among this
   * set (Int/Wis/Cha). At apply time it's auto-defaulted to the character's BEST
   * of the set and stamped as `spellAbilityOverride` (override-first). When both
   * `spellAbility` and this are present, the fixed `spellAbility` wins.
   */
  spellAbilityChoice?: ReadonlyArray<AbilityCode>;
  /** Free-cast linkage stamped onto picks (free-cast heritage feats — see grant). */
  freeCastSource?: { sourceId: string; rest: "short" | "long"; usesPerRest: number };
  /**
   * Whether the GRANTING feat hands out ≥ 2 free-cast spells (Fey/Shadow/Vampire-
   * Touched: a fixed spell + this chosen one). When true the chosen pick gets a
   * PER-SPELL tracker key (`${featId}:${spellId}`) so it doesn't share — and
   * deadlock — one counter with the fixed spell. A single-free-cast feat keeps the
   * bare feat-id key (the existing one-counter model). Set by
   * `pendingSpellChoicesForFeat` from the feat's grant list.
   */
  freeCastMulti?: boolean;
}

/**
 * Context the spell-choice slot builder may use to resolve LEVEL-DEPENDENT
 * entitlements (the recurring Wizard School Savant). `spellSlotsByClass` maps a
 * `ClassId` → that class's spell-slot row at the character's CURRENT level in it
 * (`[L1count, L2count, …, L9count]`, the same shape the class table stores). A
 * level-agnostic caller (creation, a feat-only picker) passes nothing and the
 * builder falls back to each grant's static `amount`/`maxLevel` (the initial
 * picks only).
 */
export interface SpellChoiceCtx {
  spellSlotsByClass?: Partial<Record<ClassId, ReadonlyArray<number>>>;
  /**
   * The same per-class slot rows at the level BEFORE this advancement — supplied
   * ONLY when the recurring source is ALREADY OWNED (a level-up of an existing
   * School Savant). The slot then offers the DELTA picks (new entitlement minus
   * prior entitlement): +1 pick when a new spell-slot level just opened, no slot
   * at all on levels where none did. Omit for a newly-gained source (the savant
   * level itself) or a level-agnostic caller — the slot then offers the FULL
   * entitlement at `spellSlotsByClass` (or the static initial picks).
   */
  priorSpellSlotsByClass?: Partial<Record<ClassId, ReadonlyArray<number>>>;
}

/**
 * The 2024 Wizard School Savant entitlement, derived purely from the class's
 * spell-slot row. "Add two [school] spells of level ≤2 when you gain the feature
 * (L3), then ONE more of a level you can cast each time you gain a new spell-slot
 * level." So at a given level the savant has:
 *   - `maxLevel` = the highest spell-slot level the class can currently cast
 *     (the highest 1-based index of `slotsRow` with a non-zero count);
 *   - `count`    = `initialAmount + max(0, maxLevel − 2)` — 2 at L3 (maxLevel 2),
 *     3 at L5 (3), 5 at L9 (5), … 9 at L17 (9).
 *
 * `initialMaxLevel` (the grant's static `maxLevel`, normally 2) is the floor on
 * `maxLevel` so a low-level edge case never offers fewer than the initial picks.
 * Returns the static `{ count: initialAmount, maxLevel: initialMaxLevel }` when
 * the row is empty/all-zero (the class can't cast yet).
 */
export function savantSpellEntitlement(
  slotsRow: ReadonlyArray<number> | undefined,
  initialAmount: number,
  initialMaxLevel: number
): { count: number; maxLevel: number } {
  let maxSlotLevel = 0;
  for (let i = 0; i < (slotsRow?.length ?? 0); i += 1) {
    if ((slotsRow?.[i] ?? 0) > 0) maxSlotLevel = i + 1;
  }
  if (maxSlotLevel === 0) {
    return { count: initialAmount, maxLevel: initialMaxLevel };
  }
  const maxLevel = Math.max(initialMaxLevel, maxSlotLevel);
  const count = initialAmount + Math.max(0, maxSlotLevel - 2);
  return { count, maxLevel };
}

/** The character's best ability among a set, by score (ties → list order). */
function bestAbility(
  choices: ReadonlyArray<AbilityCode>,
  scores: Readonly<Record<AbilityCode, number>> | undefined
): AbilityCode | undefined {
  let best: AbilityCode | undefined;
  let bestScore = -Infinity;
  for (const a of choices) {
    const s = scores ? scores[a] : 0;
    if (best === undefined || s > bestScore) {
      best = a;
      bestScore = s;
    }
  }
  return best;
}

/**
 * Walk a feat's grants and emit one SpellChoiceSlot per choice-cantrip /
 * choice-spell grant. Returns an empty array for feats with neither.
 */
export function pendingSpellChoicesForFeat(
  feat: {
    grants?: ReadonlyArray<Grant>;
  },
  ctx?: SpellChoiceCtx
): SpellChoiceSlot[] {
  const slots: SpellChoiceSlot[] = [];
  let idx = 0;
  // Whether this feat hands out ≥ 2 free-cast spells (a fixed `free-cast-spell`
  // plus this chosen one) — drives the chosen pick's per-spell tracker key.
  const freeCastMulti = countTopLevelFreeCasts(feat.grants) >= 2;
  for (const g of feat.grants ?? []) {
    if (g.type === "choice-cantrip") {
      // amount:0 means "pool-widener, no picker" — skip.
      if (g.amount > 0) {
        slots.push({
          kind: "cantrip",
          classSpellList: g.classSpellList,
          maxLevel: 0,
          count: g.amount,
          slotId: `slot-${idx++}`,
          spellAbility: g.spellAbility,
          spellAbilityChoice: g.spellAbilityChoice,
        });
      }
    } else if (g.type === "choice-spell") {
      // RECURRING school-savant: the pick count + maxLevel scale with the named
      // class's spell-slot progression at the character's level (Wizard School
      // Savant: 2 + 1 per new spell-slot level). With no level context, fall back
      // to the static amount/maxLevel — the INITIAL picks only. When the caller
      // also supplies the PRIOR level's row (an already-owned savant being leveled
      // up), the slot offers the DELTA picks: entitlement(new) − entitlement(prior)
      // — one pick when a new spell-slot level just opened, no slot otherwise.
      let recur = { count: g.amount, maxLevel: g.maxLevel };
      if (g.recurringPerSpellLevel !== undefined) {
        recur = savantSpellEntitlement(
          ctx?.spellSlotsByClass?.[g.recurringPerSpellLevel],
          g.amount,
          g.maxLevel
        );
        const priorRow = ctx?.priorSpellSlotsByClass?.[g.recurringPerSpellLevel];
        if (priorRow !== undefined) {
          const prior = savantSpellEntitlement(priorRow, g.amount, g.maxLevel);
          recur = { count: recur.count - prior.count, maxLevel: recur.maxLevel };
        }
      }
      // amount:0 means "pool-widener, no picker" (e.g. bard-magical-secrets
      // widens the prepared-spell pool to Bard+Cleric+Druid+Wizard without
      // granting fixed extra spells). Never surface a 0-count picker.
      if (recur.count > 0) {
        slots.push({
          kind: "spell",
          classSpellList: g.classSpellList,
          classSpellLists: g.classSpellLists,
          maxLevel: recur.maxLevel,
          count: recur.count,
          slotId: `slot-${idx++}`,
          spellAbility: g.spellAbility,
          spellAbilityChoice: g.spellAbilityChoice,
          ritualOnly: g.ritualOnly,
          spellSchool: g.spellSchool,
          spellSchools: g.spellSchools,
          toSpellbook: g.toSpellbook,
          freeCastSource: g.freeCastSource,
          freeCastMulti,
        });
      }
    }
  }
  return slots;
}

/** Spell ids the player has selected, keyed by slot id. */
export type SpellChoicePicks = Record<string, ReadonlyArray<string>>;

/**
 * Apply the picked spell ids to a character's spells[] array. New refs
 * land with `prepared: true` AND `alwaysPrepared: true` — they belong to
 * the feat, not the class budget. When the slot pins a casting ability
 * (Magic Initiate Cleric → WIS), every ref added through that slot
 * carries `spellAbilityOverride` so DC/attack computation uses that
 * ability regardless of the character's class spellcasting ability.
 * Dedupes against any ref already on the character. Idempotent.
 *
 * `slots` is optional: when omitted, picks land without an ability
 * override (preserves the legacy callers + tests that didn't track it).
 * The actual mapping uses each slot's `spellAbility` field.
 */
export function applySpellChoicePicks(
  existing: ReadonlyArray<SrdSpellRef | CustomSpell>,
  picks: SpellChoicePicks,
  slots?: ReadonlyArray<SpellChoiceSlot>,
  abilityScores?: Readonly<Record<AbilityCode, number>>
): (SrdSpellRef | CustomSpell)[] {
  const haveIds = new Set<string>();
  for (const s of existing) {
    if (!("custom" in s)) haveIds.add(s.srdId);
  }
  const abilityBySlot = new Map<string, AbilityCode | undefined>();
  const freeCastBySlot = new Map<string, SpellChoiceSlot["freeCastSource"]>();
  const freeCastMultiBySlot = new Map<string, boolean | undefined>();
  const toSpellbookBySlot = new Map<string, boolean | undefined>();
  for (const slot of slots ?? []) {
    // Fixed `spellAbility` wins; otherwise a `spellAbilityChoice` set is
    // auto-defaulted to the character's best of that set (override-first).
    abilityBySlot.set(
      slot.slotId,
      slot.spellAbility ??
        (slot.spellAbilityChoice
          ? bestAbility(slot.spellAbilityChoice, abilityScores)
          : undefined)
    );
    freeCastBySlot.set(slot.slotId, slot.freeCastSource);
    freeCastMultiBySlot.set(slot.slotId, slot.freeCastMulti);
    toSpellbookBySlot.set(slot.slotId, slot.toSpellbook);
  }
  const added: SrdSpellRef[] = [];
  for (const [slotId, ids] of Object.entries(picks)) {
    const ability = abilityBySlot.get(slotId);
    const freeCastSource = freeCastBySlot.get(slotId);
    const freeCastMulti = freeCastMultiBySlot.get(slotId) ?? false;
    const toSpellbook = toSpellbookBySlot.get(slotId);
    for (const id of ids) {
      if (!haveIds.has(id)) {
        // Wizard School Savant: spellbook additions are NOT always-prepared —
        // they enter the spellbook (`prepared:false`) and the Wizard prepares
        // them like any other spellbook spell, counting against the prepared
        // budget when prepared. Magic-Initiate-style feat picks stay
        // always-prepared (the historic default).
        const ref: SrdSpellRef = toSpellbook
          ? { srdId: id, prepared: false }
          : { srdId: id, prepared: true, alwaysPrepared: true };
        if (ability) ref.spellAbilityOverride = ability;
        // Stamp the chosen spell's free-cast tracker key. When the feat hands out
        // ≥ 2 free-casts (Fey/Shadow/Vampire-Touched: a fixed spell + this chosen
        // one) the chosen pick gets its OWN per-spell key `${featId}:${spellId}`
        // (matching the grant evaluator) so it never shares — and deadlocks — one
        // counter with the fixed spell. A single-free-cast feat (Genie Magic,
        // free-cast heritage feats) keeps the bare feat-id key.
        if (freeCastSource) {
          ref.freeCastSource = {
            ...freeCastSource,
            sourceId: freeCastTrackerKey(freeCastSource.sourceId, id, freeCastMulti),
          };
        }
        added.push(ref);
        haveIds.add(id);
      }
    }
  }
  return [...existing, ...added];
}

/**
 * Returns true when every slot has the required number of picks.
 * Used by the parent wizard to gate "confirm".
 */
export function isSpellChoicesComplete(
  slots: ReadonlyArray<SpellChoiceSlot>,
  picks: SpellChoicePicks
): boolean {
  for (const slot of slots) {
    const chosen = picks[slot.slotId] ?? [];
    if (chosen.length !== slot.count) return false;
  }
  return true;
}

/**
 * The effective set of allowed class lists for a slot, unioning the single
 * `classSpellList` with the `classSpellLists` multi-list (choice-spell-multi-
 * list primitive). Returns `null` when the slot imposes NO list restriction
 * (neither field set) — i.e. "any spell list". An empty `classSpellLists`
 * array is treated the same as absent.
 */
export function allowedSpellListsForSlot(
  slot: Pick<SpellChoiceSlot, "classSpellList" | "classSpellLists">
): ReadonlySet<ClassId> | null {
  const lists = new Set<ClassId>();
  if (slot.classSpellList) lists.add(slot.classSpellList);
  for (const c of slot.classSpellLists ?? []) lists.add(c);
  return lists.size > 0 ? lists : null;
}

/**
 * The set of spell lists a class's PREPARED/known-spell pool may draw from at a
 * given level — the Bard "Magical Secrets" widening (bard:main, L10): "whenever
 * you gain a Bard level of 10+ and your prepared-spell count increases, you may
 * choose the new spells from the Bard, Cleric, Druid, and Wizard lists; you may
 * also replace one prepared spell with one from those lists." RAW: the widening
 * is PERSISTENT for every Bard level from 10 on, not a one-time L10 event.
 *
 * Derived purely from the ACCUMULATED grants, never from feature ids or display
 * strings (golden rule 7 — the grants ARE the source of truth). We walk every
 * class/subclass feature at level ≤ `level` and collect each `choice-spell`
 * grant that is a POOL-WIDENER (`amount: 0` — it adds no fixed picks, only
 * broadens the pool) carrying a list restriction (`classSpellLists` /
 * `classSpellList`), then UNION their lists with the advancing class's own list.
 *
 * Returns the union INCLUDING the class's own id. When no widener applies the
 * set is just `{ classId }` — identical to the historic class-list-only gate, so
 * callers can always filter on "spell is on ANY returned list" with no special
 * case. A non-spellcasting class with no wideners simply returns `{ classId }`.
 *
 * `subclassId` (optional, lower-cased here) scopes subclass-granted wideners to
 * the character's actual subclass.
 */
export function widenedSpellListsAtLevel(
  classId: string,
  level: number,
  subclassId?: string
): ReadonlySet<ClassId> {
  const cls = classId.toLowerCase() as ClassId;
  const sub = subclassId ? subclassId.toLowerCase() : undefined;
  const lists = new Set<ClassId>([cls]);
  for (const feature of getClassFeatures(cls)) {
    if (feature.level > level) continue;
    // A subclass-scoped feature only applies to the character's own subclass.
    if (feature.subclass && feature.subclass.toLowerCase() !== sub) continue;
    for (const g of feature.grants ?? []) {
      // Pool-widener = a choice-spell grant that adds NO fixed picks (amount 0)
      // but broadens the list the pool may draw from. A picker-bearing
      // (amount > 0) choice-spell is a separate always-prepared injection, not a
      // widening of the base prepared pool — it must NOT broaden this set.
      if (g.type !== "choice-spell" || g.amount !== 0) continue;
      if (g.classSpellList) lists.add(g.classSpellList);
      for (const c of g.classSpellLists ?? []) lists.add(c);
    }
  }
  return lists;
}

/**
 * Available spell ids for a given slot — used by the picker UI's list.
 * Filters by the slot's allowed class lists (single `classSpellList` and/or
 * the `classSpellLists` union — choice-spell-multi-list), level (cantrip /
 * non-cantrip with maxLevel), and excludes ids the character already owns to
 * avoid double-add. A spell qualifies if it is on ANY allowed list.
 */
export function listAvailableForSlot(
  slot: SpellChoiceSlot,
  existingSpellIds: ReadonlySet<string>
): ReadonlyArray<SrdSpellData> {
  const allowedLists = allowedSpellListsForSlot(slot);
  // `spell.classes` is loosely typed as string[]; compare on the string set.
  const allowed = allowedLists ? new Set<string>(allowedLists) : null;
  return ALL_SPELLS.filter((s) => {
    if (existingSpellIds.has(s.id)) return false;
    if (slot.kind === "cantrip" && s.level !== 0) return false;
    if (slot.kind === "spell" && (s.level === 0 || s.level > slot.maxLevel)) {
      return false;
    }
    // Pact of the Tome's Book of Shadows: the two L1 picks must carry the
    // Ritual tag. Applies independently of any class-list restriction (the
    // pool is "Ritual spells from ANY class list").
    if (slot.ritualOnly && !s.ritual) return false;
    // Wizard School Savant: restrict the pool to a single school of magic
    // (Abjuration Savant → only Abjuration spells, etc.). Combines with the
    // class-list restriction (Savant features set classSpellList: "wizard").
    if (slot.spellSchool && s.school !== slot.spellSchool) return false;
    // Fey-Touched-style multi-school slots: accept any of the listed schools.
    if (slot.spellSchools && !slot.spellSchools.includes(s.school)) return false;
    if (allowed && !s.classes.some((c) => allowed.has(c))) {
      return false;
    }
    return true;
  });
}
