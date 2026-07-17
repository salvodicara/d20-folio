/**
 * On-cast effect resolver (S4 follow-on — the narrow on-cast trigger primitive).
 *
 * A pure, leaf resolver: given a SPELL CAST (the spell's stable id + the slot
 * level it was cast at) and the casting character, it enumerates the character's
 * features that declare an `onCast` trigger (`SrdClassFeatureData.mechanics.onCast`)
 * and emits the deterministic side-effects that fire. The spec is discriminated
 * on `effect`, so each leg has its own resolver + applier, sharing this same
 * feature enumeration. Branching is on the stable school TOKEN + stable feature
 * srdId, NEVER a display string (golden rule 7).
 *
 * The two effects modelled today:
 *  - **Wizard Abjurer Arcane Ward refill** (`effect: "refill-tracker"`; wikidot
 *    `wizard:abjurer`, 2024 RAW): "Whenever you cast an Abjuration spell with a
 *    spell slot, the ward regains a number of Hit Points equal to twice the level
 *    of the spell slot." The ward is the feature's tracker (max = 2× Wizard level
 *    + INT mod); its `used` is damage absorbed, so a refill REDUCES `used` by
 *    `2 × slotLevel`, clamped at 0 (= the ward at max) by the store mutator.
 *  - **Wizard Diviner Expert Divination slot-regain** (`effect:
 *    "regain-lower-slot"`; wikidot `wizard:diviner`, 2024 RAW): "When you cast a
 *    Divination spell using a level 2+ spell slot, you regain one expended spell
 *    slot. The slot you regain must be of a level lower than the slot you expended
 *    and can't be higher than level 5." The seam un-expends the HIGHEST eligible
 *    expended NORMAL slot (level < cast level, ≤ max-regain). No frequency limit
 *    in the 2024 wording.
 *
 * Leaf module: imports only the SRD spell lookup + the shared feature-source
 * lookup (no Firebase, no UI), so the cast-commit seam can depend on it freely.
 */
import { getSpellById } from "@/data/spells";
import { getSrdFeatureSource } from "@/lib/srd-feature-lookup";
import { slotUsageKey } from "@/lib/cast-options";
import type { CharacterDoc } from "@/types/character";
import type { OnCastTriggerSpec } from "@/data/types";

/**
 * Enumerate the on-cast triggers a cast fires: every of the character's features
 * whose `mechanics.onCast` spec matches the cast spell's school and slot level.
 * Shared by both effect resolvers below (one enumeration, branch on `effect`).
 * A non-slot cast (`slotLevel < 1`) / unknown spell / non-trigger feature yields
 * nothing (RAW: every leg fires "with a spell slot").
 */
function matchingOnCastSpecs(
  character: CharacterDoc,
  spellId: string | undefined,
  slotLevel: number
): Array<{ srdId: string; spec: OnCastTriggerSpec }> {
  if (!spellId) return [];
  const spell = getSpellById(spellId);
  if (!spell) return [];
  const school = spell.school;

  const out: Array<{ srdId: string; spec: OnCastTriggerSpec }> = [];
  for (const featureRef of character.character.features) {
    if ("custom" in featureRef) continue;
    const source = getSrdFeatureSource(featureRef.srdId);
    // `onCast` lives only on class-feature mechanics; the union narrows on it.
    const onCast =
      source && "mechanics" in source && source.mechanics && "onCast" in source.mechanics
        ? source.mechanics.onCast
        : undefined;
    if (!onCast) continue;
    if (slotLevel < onCast.minSlotLevel) continue;
    // A spec with no `school` is school-agnostic (Wild Magic Surge → any Sorcerer
    // spell); otherwise the cast spell's stable school token must match.
    if (onCast.school !== undefined && school !== onCast.school) continue;
    out.push({ srdId: featureRef.srdId, spec: onCast });
  }
  return out;
}

/** A resolved on-cast refill the cast-commit seam should apply: restore
 *  `amount` uses of `trackerId` (clamped at 0 = the resource at max). */
export interface OnCastTrackerRefill {
  /** The tracker to refill (the owning feature's srdId — Arcane Ward). */
  trackerId: string;
  /** HP to regain = `refillTrackerPerSlotLevel × slotLevel`. Always > 0. */
  amount: number;
}

/**
 * Resolve the Arcane-Ward-style tracker refills triggered by casting `spellId`
 * with a spell slot of level `slotLevel`. Returns one entry per matching
 * `refill-tracker` feature (today: at most the single Arcane Ward) — an empty
 * array when nothing fires:
 *  - the cast wasn't slot-paid (`slotLevel < 1`) — a cantrip / at-will never
 *    triggers (RAW: "with a spell slot");
 *  - the spell isn't of the feature's `school`;
 *  - the character has no `refill-tracker` feature (a non-Abjurer).
 *
 * The school is read from the SRD spell (`getSpellById(spellId).school`) — a
 * stable token, never a display string. A custom/unknown spell id resolves to no
 * spell ⇒ no refill (the engine can't know a homebrew spell's school).
 */
export function resolveOnCastTrackerRefills(
  character: CharacterDoc,
  spellId: string | undefined,
  slotLevel: number
): OnCastTrackerRefill[] {
  const refills: OnCastTrackerRefill[] = [];
  for (const { srdId, spec } of matchingOnCastSpecs(character, spellId, slotLevel)) {
    if (spec.effect !== "refill-tracker") continue;
    refills.push({
      trackerId: srdId,
      amount: spec.refillTrackerPerSlotLevel * slotLevel,
    });
  }
  return refills;
}

/** A resolved on-cast slot regain the cast-commit seam should apply: un-expend
 *  ONE normal (non-pact) spell slot of `level` (Expert Divination). */
export interface OnCastSlotRegain {
  /** The slot LEVEL to un-expend (lower than the cast slot, ≤ the spec max). */
  level: number;
}

/**
 * Resolve the Expert-Divination-style lower-slot regain triggered by casting a
 * Divination spell (`spellId`) with a spell slot of level `slotLevel`. Returns a
 * single regain (or `null` when nothing fires):
 *  - no `regain-lower-slot` feature, wrong school, or cast below `minSlotLevel`
 *    (handled by the shared enumeration — a level-1 Divination cast never fires);
 *  - no EXPENDED normal slot exists at an eligible level (every lower slot full).
 *
 * RAW (wikidot `wizard:diviner`): the regained slot must be of a level LOWER than
 * the cast slot and no higher than `maxRegainLevel` (5). We un-expend the HIGHEST
 * eligible expended NORMAL (non-pact) slot — the most valuable the player can get
 * back. Pact-Magic slots are excluded (they aren't Wizard slots). Reads the live
 * `session.spellSlots` (`used`) against the max table so it only regains a slot
 * the character has actually expended.
 */
export function resolveOnCastSlotRegain(
  character: CharacterDoc,
  spellId: string | undefined,
  slotLevel: number
): OnCastSlotRegain | null {
  for (const { spec } of matchingOnCastSpecs(character, spellId, slotLevel)) {
    if (spec.effect !== "regain-lower-slot") continue;
    const ceiling = Math.min(slotLevel - 1, spec.maxRegainLevel);
    // Walk eligible levels high→low; un-expend the first with an expended normal
    // slot (the most valuable). The max table is the source of which slots exist.
    for (let level = ceiling; level >= 1; level--) {
      const slot = character.character.spellSlots.find(
        (s) => s.level === level && !s.pactMagic
      );
      if (!slot) continue;
      const used = character.session.spellSlots[slotUsageKey({ level })]?.used ?? 0;
      if (used > 0) return { level };
    }
    // Only one regain-lower-slot feature is ever present; stop after it resolves.
    return null;
  }
  return null;
}

/**
 * Whether casting `spellId` with a slot of level `slotLevel` should surface the
 * DISPLAY-ONLY Wild Magic Surge reminder (Sorcerer Wild Magic). RAW: "Once per
 * turn, you can roll 1d20 immediately after you cast a Sorcerer spell with a spell
 * slot. If you roll a 20, roll on the Wild Magic Surge table." True when the
 * character has a `wild-magic-surge` on-cast feature AND the cast spell is a
 * Sorcerer spell cast with a slot (a non-Sorcerer spell, a cantrip / free cast,
 * or a non-Wild-Magic Sorcerer never fires). The app NEVER rolls the d20 and
 * NEVER auto-triggers the table (golden rule 21) — the reminder is a nudge; the
 * once-per-turn limit is the player's judgment.
 */
export function resolveOnCastSurgeReminder(
  character: CharacterDoc,
  spellId: string | undefined,
  slotLevel: number
): boolean {
  const spell = spellId ? getSpellById(spellId) : undefined;
  // RAW gates on a SORCERER spell; a custom/unknown spell has no class list → no
  // reminder (the engine can't know a homebrew spell's class).
  if (!spell || !spell.classes.includes("sorcerer")) return false;
  return matchingOnCastSpecs(character, spellId, slotLevel).some(
    ({ spec }) => spec.effect === "wild-magic-surge"
  );
}

/** The minimal slice of the character store the refill apply/undo needs — the
 *  live character + the two tracker mutators (over-mockable in a unit test). */
export interface OnCastRefillStore {
  character: CharacterDoc | null;
  /** Reduce a tracker's `used` by `amount`, clamped at 0 (= the resource at max). */
  restoreTracker: (trackerId: string, amount?: number) => void;
  /** Increase a tracker's `used` by `amount` (re-spend). */
  useTracker: (trackerId: string, amount?: number) => void;
}

/** The minimal slice of the character store the slot-regain apply/undo needs —
 *  the two normal-slot mutators (`restoreSpellSlot` un-expends, `useSpellSlot`
 *  re-expends). Mockable in a unit test without mounting the provider. */
export interface OnCastSlotRegainStore {
  /** Un-expend ONE normal slot of `level` (decrement `used`, floored at 0). */
  restoreSpellSlot: (level: number, pactMagic?: boolean) => void;
  /** Re-expend ONE normal slot of `level` (increment `used`) — the undo inverse. */
  useSpellSlot: (level: number, pactMagic?: boolean) => void;
}

/**
 * Apply the resolved on-cast refills to the store and return the inverse
 * (undo). The wiring the cast-commit seam (`commitCastOption`) relies on — kept
 * here as a pure, store-injected helper so it can be unit-tested without
 * mounting the provider (golden rule 13 — the cheapest test that pins the
 * wiring). Each refill REDUCES `used` (clamped at 0); undo re-spends EXACTLY the
 * HP that was restored (clamp-aware), so undoing a near-full ward never
 * over-spends. Returns a no-op closure when nothing fires.
 */
export function applyOnCastTrackerRefills(
  store: OnCastRefillStore,
  refills: ReadonlyArray<OnCastTrackerRefill>
): () => void {
  // Capture the ACTUAL applied reduction per refill BEFORE mutating, so undo is
  // exact even when the refill clamps (a near-full ward absorbs < `amount`).
  const applied = refills.map((r) => {
    const priorUsed = store.character?.session.trackers[r.trackerId]?.used ?? 0;
    return {
      trackerId: r.trackerId,
      restored: priorUsed - Math.max(0, priorUsed - r.amount),
    };
  });
  for (const r of refills) store.restoreTracker(r.trackerId, r.amount);
  return () => {
    for (const a of applied)
      if (a.restored > 0) store.useTracker(a.trackerId, a.restored);
  };
}

/**
 * Apply the resolved Expert-Divination slot regain to the store and return the
 * inverse (undo). The wiring `commitCastOption` relies on — un-expend the chosen
 * lower slot (`restoreSpellSlot`), and undo re-expends EXACTLY that slot
 * (`useSpellSlot`), so the regain is folded into the cast's ONE undoable unit
 * (override-first — the player can still hand-edit slots). A `null` regain (the
 * resolver found nothing eligible) yields a no-op closure.
 */
export function applyOnCastSlotRegain(
  store: OnCastSlotRegainStore,
  regain: OnCastSlotRegain | null
): () => void {
  if (!regain) return () => {};
  store.restoreSpellSlot(regain.level);
  return () => store.useSpellSlot(regain.level);
}
