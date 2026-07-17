/**
 * Combat cost engine (ARCHITECTURE.md combat model — the serializable commit primitive).
 *
 * The owner's binding decision is **immediate-commit-per-action-with-undo**:
 * each action/cast/attack deducts its resources the instant it's used and
 * pushes a reverse-applier into a short undo toast. `endTurn()` becomes pure
 * bookkeeping. This module is that primitive, split in two:
 *
 *  - `planCommit(cost, opts) → CommitOp[]` — PURE + serializable. Translates a
 *    chosen `CostSpec` (+ the cast level / spend amount / concentration the
 *    player picked) into the concrete mutations to apply. No store access.
 *  - `applyCommitOps(ops, store) → () => void` — runs the mutations against a
 *    `CommitStore` and returns a **reverse-applier** that undoes them (in
 *    reverse order). The store is passed in (not imported) so this module
 *    stays CI-pure and unit-testable with a mock.
 *
 * `assertNever` on both `CostSpec.kind` and `CommitOp.op` makes "a new resource
 * kind" a compile error — you can't add a cost without teaching the executor
 * how to spend AND reverse it (the price of serializable undo).
 *
 * Pure module — no React/store/Firebase imports.
 */

import type { ConcentrationRef, StoredConcentration } from "@/types/ids";

/** A resource an action/cast/attack consumes when used. Serializable. */
export type CostSpec =
  /** A spell slot of at least `minLevel` (the player may upcast higher). */
  | { kind: "spell-slot"; minLevel: number }
  /** N uses of a tracker; `pool` flags a variable-spend resource (Sorcery Points). */
  | { kind: "tracker"; trackerId: string; amount?: number; pool?: boolean }
  /** A per-rest free cast (charge tracked on the source feature's tracker). */
  | { kind: "free-cast"; sourceId: string }
  /** Wizard Spell Mastery — at-will, no resource. */
  | { kind: "mastery" }
  /** Wizard Signature Spell — free cast tracked on its own tracker. */
  | { kind: "signature"; trackerId: string }
  /** Ritual cast — no slot, no resource (just extra time). */
  | { kind: "ritual" }
  /** A consumable/charged item. */
  | { kind: "equipment"; key: string }
  /** No cost (an at-will action, a cantrip, a basic attack). */
  | { kind: "none" };

/** A concrete, serializable mutation produced by `planCommit`. */
export type CommitOp =
  /** `pactMagic` selects the Warlock Pact-Magic pool (its own usage counter via
   *  `slotUsageKey`); omitted/false = the normal/shared pool. */
  | { op: "spend-spell-slot"; level: number; pactMagic?: boolean }
  | { op: "spend-tracker"; trackerId: string; amount: number }
  | { op: "spend-equipment"; key: string }
  | { op: "set-concentration"; spell: ConcentrationRef }
  /**
   * PRIM-resource-conversion PRODUCE ops — the inverse of the spend ops above.
   * `gain-spell-slot` un-expends one slot of `level` (Font of Magic Creating
   * Spell Slots, Nature Magician; `pactMagic` un-expends a Pact-Magic slot for
   * Warlock Magical Cunning / Eldritch Master); `gain-tracker` credits `amount`
   * uses back to a pool (Font of Magic Converting Spell Slots → Sorcery
   * Points). Their undo spends the produced resource back.
   */
  | { op: "gain-spell-slot"; level: number; pactMagic?: boolean }
  | { op: "gain-tracker"; trackerId: string; amount: number }
  | { op: "noop" };

/** Options the player resolves at use-time, layered onto the static cost. */
export interface CommitOptions {
  /** Actual slot level for a `spell-slot` cost (≥ minLevel) — upcasting. */
  slotLevel?: number;
  /** Override the tracker spend (variable-cost pools: Sorcery Points, Lay on Hands). */
  trackerAmount?: number;
  /** When set, the action begins Concentration on this spell. */
  startsConcentration?: ConcentrationRef;
}

/** The store surface the executor needs. Passed in to keep this module pure. */
export interface CommitStore {
  useSpellSlot: (level: number, pactMagic?: boolean) => void;
  restoreSpellSlot: (level: number, pactMagic?: boolean) => void;
  useTracker: (trackerId: string, amount?: number) => void;
  restoreTracker: (trackerId: string, amount?: number) => void;
  useEquipmentItem: (key: string) => void;
  restoreEquipmentItem: (key: string) => void;
  getConcentration: () => StoredConcentration;
  setConcentration: (spell: StoredConcentration) => void;
}

/** Exhaustiveness guard — a new union member that isn't handled is a compile error. */
function assertNever(x: never): never {
  throw new Error(`Unhandled variant: ${JSON.stringify(x)}`);
}

/**
 * Translate a chosen cost + the player's use-time options into the ordered
 * list of mutations to apply. Pure and serializable — the result can be stored
 * (e.g. in an undo entry) and replayed. Concentration, when started, is always
 * the LAST op so its undo runs first (restoring the prior concentration before
 * resources are refunded reads naturally, though order is immaterial here).
 */
export function planCommit(cost: CostSpec, opts: CommitOptions = {}): CommitOp[] {
  const ops: CommitOp[] = [];
  switch (cost.kind) {
    case "spell-slot":
      ops.push({
        op: "spend-spell-slot",
        level: Math.max(cost.minLevel, opts.slotLevel ?? cost.minLevel),
      });
      break;
    case "tracker":
      ops.push({
        op: "spend-tracker",
        trackerId: cost.trackerId,
        amount: opts.trackerAmount ?? cost.amount ?? 1,
      });
      break;
    case "free-cast":
      // A per-rest free cast spends one charge of the source's implicit tracker.
      ops.push({ op: "spend-tracker", trackerId: cost.sourceId, amount: 1 });
      break;
    case "signature":
      ops.push({ op: "spend-tracker", trackerId: cost.trackerId, amount: 1 });
      break;
    case "equipment":
      ops.push({ op: "spend-equipment", key: cost.key });
      break;
    case "mastery":
    case "ritual":
    case "none":
      // No resource consumed.
      break;
    default:
      assertNever(cost);
  }
  if (opts.startsConcentration != null) {
    ops.push({ op: "set-concentration", spell: opts.startsConcentration });
  }
  return ops;
}

/**
 * PRIM-resource-conversion descriptor (the cost-engine's local view of a
 * `ResourceConversionEntry` — kept here so this module stays grants-free and
 * CI-pure). `produces` discriminates the conversion:
 *  - `"spell-slot"` — produce ONE slot. `perUnitSlotLevels` (Nature Magician):
 *    each spent unit of `fromTracker` = that many slot levels, so the produced
 *    level = `unitsSpent × perUnitSlotLevels` (capped at `maxSlotLevel`). Else
 *    `costTable` (Font of Magic) maps the chosen produced level → unit cost.
 *  - `"sorcery-points"` — spend ONE spell slot of `slotLevel`, gain that many
 *    Sorcery Points (units credited to `toTracker`).
 *  - `"pact-slot"` — spend ONE charge of `fromTracker` (the feature's 1/Long-Rest
 *    tracker) and un-expend `pactRestoreAmount` Warlock Pact-Magic slots at
 *    `pactSlotLevel` (Magical Cunning regains ⌈max/2⌉; Eldritch Master regains
 *    all). Pact Magic is a SINGLE-level pool, so "N slots" = N un-expend ops at
 *    that one level — no multi-level FIFO. The caller resolves the live amount +
 *    pact level (clamped to what is expended), so the plan never over-restores.
 */
export interface ResourceConversionSpec {
  produces: "spell-slot" | "sorcery-points" | "pact-slot";
  fromTracker?: string;
  toTracker?: string;
  perUnitSlotLevels?: number;
  costTable?: ReadonlyArray<{ slotLevel: number; cost: number; minLevel: number }>;
  maxSlotLevel?: number;
}

/** Player-resolved choices for a resource conversion. */
export interface ResourceConversionChoice {
  /** Units of `fromTracker` to spend (Nature Magician: Wild Shape uses). */
  unitsSpent?: number;
  /** The produced slot level (Font of Magic `costTable` path). */
  producedSlotLevel?: number;
  /** The spell-slot level consumed (Converting Spell Slots → Sorcery Points). */
  slotLevel?: number;
  /** Pact-slot path — the Pact-Magic slot level to un-expend (single-level pool). */
  pactSlotLevel?: number;
  /** Pact-slot path — how many Pact-Magic slots to restore (≤ currently expended). */
  pactRestoreAmount?: number;
}

/**
 * Plan a resource conversion into concrete, serializable, REVERSIBLE ops. Pure —
 * no store access, replayable, and feeds the same `applyCommitOps` undo seam as
 * every other action. Returns `[]` (no-op) when the choice is incoherent (e.g.
 * a slot level with no cost-table row), so an invalid conversion never mutates.
 */
export function planResourceConversion(
  spec: ResourceConversionSpec,
  choice: ResourceConversionChoice = {}
): CommitOp[] {
  const ops: CommitOp[] = [];
  switch (spec.produces) {
    case "spell-slot": {
      if (spec.perUnitSlotLevels != null && spec.fromTracker != null) {
        // Nature Magician — spend `unitsSpent` Wild Shape uses → one slot whose
        // level = units × perUnitSlotLevels (capped). Needs ≥ 1 unit.
        const units = choice.unitsSpent ?? 0;
        if (units <= 0) break;
        const rawLevel = units * spec.perUnitSlotLevels;
        const level = spec.maxSlotLevel
          ? Math.min(rawLevel, spec.maxSlotLevel)
          : rawLevel;
        if (level <= 0) break;
        ops.push({ op: "spend-tracker", trackerId: spec.fromTracker, amount: units });
        ops.push({ op: "gain-spell-slot", level });
      } else if (spec.costTable != null && spec.fromTracker != null) {
        // Font of Magic Creating Spell Slots — pay the table cost for the chosen
        // produced level.
        const level = choice.producedSlotLevel ?? 0;
        const row = spec.costTable.find((r) => r.slotLevel === level);
        if (!row) break;
        if (spec.maxSlotLevel != null && level > spec.maxSlotLevel) break;
        ops.push({ op: "spend-tracker", trackerId: spec.fromTracker, amount: row.cost });
        ops.push({ op: "gain-spell-slot", level });
      }
      break;
    }
    case "sorcery-points": {
      // Converting Spell Slots → Sorcery Points: spend one slot of `slotLevel`,
      // gain `slotLevel` points into `toTracker`.
      const level = choice.slotLevel ?? 0;
      if (level <= 0 || spec.toTracker == null) break;
      ops.push({ op: "spend-spell-slot", level });
      ops.push({ op: "gain-tracker", trackerId: spec.toTracker, amount: level });
      break;
    }
    case "pact-slot": {
      // Warlock Magical Cunning / Eldritch Master — spend the feature's ONE
      // Long-Rest charge and un-expend `pactRestoreAmount` Pact-Magic slots at
      // the single pact level. The caller pre-clamps the amount to what is
      // expended, so the plan never restores past the pool. Needs ≥ 1 slot.
      const amount = choice.pactRestoreAmount ?? 0;
      const level = choice.pactSlotLevel ?? 0;
      if (amount <= 0 || level <= 0 || spec.fromTracker == null) break;
      ops.push({ op: "spend-tracker", trackerId: spec.fromTracker, amount: 1 });
      for (let i = 0; i < amount; i++) {
        ops.push({ op: "gain-spell-slot", level, pactMagic: true });
      }
      break;
    }
    default:
      assertNever(spec.produces);
  }
  return ops;
}

/**
 * Apply the planned ops against a store and return a reverse-applier. Calling
 * the returned function undoes every op in reverse order — the function the
 * undo toast invokes. Concentration is reversed to its prior value (snapshotted
 * here, since `planCommit` is pure and can't read the store).
 */
export function applyCommitOps(ops: CommitOp[], store: CommitStore): () => void {
  const reverses: Array<() => void> = [];
  for (const op of ops) {
    switch (op.op) {
      case "spend-spell-slot": {
        store.useSpellSlot(op.level, op.pactMagic);
        reverses.push(() => store.restoreSpellSlot(op.level, op.pactMagic));
        break;
      }
      case "spend-tracker": {
        store.useTracker(op.trackerId, op.amount);
        reverses.push(() => store.restoreTracker(op.trackerId, op.amount));
        break;
      }
      case "spend-equipment": {
        store.useEquipmentItem(op.key);
        reverses.push(() => store.restoreEquipmentItem(op.key));
        break;
      }
      case "set-concentration": {
        const previous = store.getConcentration();
        store.setConcentration(op.spell);
        reverses.push(() => store.setConcentration(previous));
        break;
      }
      case "gain-spell-slot": {
        // Producing a slot = un-expending one of that level; undo re-expends it.
        store.restoreSpellSlot(op.level, op.pactMagic);
        reverses.push(() => store.useSpellSlot(op.level, op.pactMagic));
        break;
      }
      case "gain-tracker": {
        store.restoreTracker(op.trackerId, op.amount);
        reverses.push(() => store.useTracker(op.trackerId, op.amount));
        break;
      }
      case "noop":
        break;
      default:
        assertNever(op);
    }
  }
  // Undo in reverse order so dependent ops unwind cleanly.
  return () => {
    for (const reverse of [...reverses].reverse()) reverse();
  };
}
