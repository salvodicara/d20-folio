/**
 * The monster adapter: `MonsterStatBlock` (typed SRD/pack/homebrew data) → `Mechanic`. The only
 * place that understands `MonsterEntry`; everything downstream sees ordinary mechanic data.
 * Spec: docs/superpowers/specs/2026-09-02-mechanics-authoring-spec.md §4.
 *
 * Stage 3 scope: `block.actions` only — a structured `attack` entry becomes an `attack` program, and
 * a `save` entry automates ONLY when it carries damage, becoming `save`+`damage`. An effect-only
 * save (a paralyzing gaze, a frightening roar) is DM-adjudicated until conditions-on-save are
 * authored: automating just its roll would spend the action and apply nothing.
 *
 * Everything else becomes `manual-table`, per §4's own rule — never a half-built kind. That fallback
 * covers prose-only entries (Multiattack included: the corpus carries no structured attack count for
 * it yet), spellcasting, effect-only saves, `onSuccess: "special"` outcomes, and clauses whose
 * damage type is a use-time choice. `traits`, `reactions`, `legendaryActions` and
 * `recharge`/`legendary` costs are `later` (authoring spec §6).
 */
import type {
  MonsterAttackEntry,
  MonsterEntry,
  MonsterSaveEntry,
  MonsterStatBlock,
} from "@/data/types";
import type { DamagePart, Input, Mechanic, Program, Step } from "./mechanic";

// `MonsterDamage.damageType` and `MonsterSaveEntry.save` are the same string-literal unions as this
// engine's `DamageType`/`Ability` (`src/types/damage.ts`, `src/types/combat-outcome.ts`), so they
// assign without casts.

function labelFor(block: MonsterStatBlock, entry: MonsterEntry): string {
  return `${block.id}.actions.${entry.id}`;
}

/** `null` parts means at least one damage clause has no fixed `damageType` (a use-time
 *  `damageChoice`) — not automatable yet; the caller falls back to `manual-table`. */
function damageParts(
  damage: MonsterAttackEntry["damage"]
): { readonly inputs: Input[]; readonly parts: DamagePart[] } | null {
  const inputs: Input[] = [];
  const parts: DamagePart[] = [];
  for (const [index, clause] of damage.entries()) {
    if (!clause.damageType) return null;
    const id = `damage-${index}`;
    inputs.push({ id, kind: "dice", formula: clause.dice });
    parts.push({ dice: id, type: clause.damageType });
  }
  return { inputs, parts };
}

function attackProgram(entry: MonsterAttackEntry): Program | null {
  const compiled = damageParts(entry.damage);
  if (!compiled) return null;
  const step: Step = {
    id: "hit",
    kind: "attack",
    roll: "roll",
    bonus: entry.toHit,
    damage: compiled.parts,
  };
  return {
    id: entry.id,
    trigger: { kind: "invocation", economy: "action" },
    cost: [{ kind: "turn", claim: "attack" }],
    targets: {
      count: 1,
      eligibility: {
        relation: entry.attack === "melee" ? "adjacent" : "visible",
        between: ["$self", "$target"],
        value: true,
      },
    },
    inputs: [{ id: "roll", kind: "d20", for: "attack" }, ...compiled.inputs],
    steps: [step],
  };
}

function saveProgram(entry: MonsterSaveEntry): Program | null {
  if (entry.onSuccess === "special") return null; // prose-only outcome
  const compiled = damageParts(entry.damage ?? []);
  if (!compiled) return null;
  // An effect-only save carries no automatable outcome: the condition it prints lives in prose, so
  // a save step alone would burn the action and apply nothing. The DM adjudicates it instead.
  if (compiled.parts.length === 0) return null;
  const steps: readonly Step[] = [
    {
      id: "resist",
      kind: "save",
      roll: "save",
      ability: entry.save,
      dc: entry.dc,
      onSuccess: entry.onSuccess === "half" ? "half" : "negate",
    },
    { id: "harm", kind: "damage", parts: compiled.parts, to: "$target" },
  ];
  return {
    id: entry.id,
    trigger: { kind: "invocation", economy: "action" },
    cost: [{ kind: "turn", claim: "action" }],
    targets: {
      count: 1,
      eligibility: { relation: "visible", between: ["$self", "$target"], value: true },
    },
    inputs: [
      { id: "save", kind: "d20", for: "save", ability: entry.save },
      ...compiled.inputs,
    ],
    steps,
  };
}

function manualProgram(entry: MonsterEntry, block: MonsterStatBlock): Program {
  return {
    id: entry.id,
    trigger: { kind: "invocation", economy: "action" },
    cost: [{ kind: "turn", claim: "action" }],
    steps: [{ id: "resolve", kind: "manual-table", label: labelFor(block, entry) }],
  };
}

export function monsterMechanics(block: MonsterStatBlock): Mechanic {
  const active: Program[] = block.actions.map((entry) => {
    const structured =
      entry.kind === "attack"
        ? attackProgram(entry)
        : entry.kind === "save"
          ? saveProgram(entry)
          : null;
    return structured ?? manualProgram(entry, block);
  });
  return { schema: 1, id: `monster:${block.id}`, source: "monster", active };
}
