/**
 * The core catalogue: the ordinary actions every creature at the table has, authored once.
 *
 * Stage 6 (design §2 D2) moves every OTHER executable mechanic into the encounter log — a
 * seated entity carries its own definitions, so the fold is identical on every client. What
 * stays static is exactly this: the `core:*` set, which no projection has to ship because it is
 * the same for a pixie and an ogre, and which the reducer's static catalogue keeps.
 *
 * Advantage, disadvantage and stealth are NOT in the stage-3 vocabulary, so Dodge, Disengage,
 * Help and Hide are `manual-table` programs: they spend the action and put a line in the log,
 * and the table adjudicates the rest. Half-building them would be worse than saying so.
 *
 * This module is DATA: it may import types from `@/lib/combat/mechanic` and nothing else.
 */
import type { Mechanic } from "@/lib/combat/mechanic";
import type { MechanicId } from "@/lib/combat/ids";

/** Movement every creature has: no action/bonus/reaction cost, gated to your own turn, budgeted
 *  against speed by the `move` step itself. */
export const move: Mechanic = {
  schema: 1,
  id: "core:move",
  source: "srd",
  active: [
    {
      id: "move",
      trigger: { kind: "invocation", economy: "free" },
      inputs: [{ id: "to", kind: "position" }],
      steps: [{ id: "step", kind: "move", to: "to" }],
    },
  ],
};

/** Dash: the action buys a second helping of your speed this turn (`TurnLedger.movementExtra`,
 *  reset at turn start), so `remainingMovement` and the ruler follow the rules. */
export const dash: Mechanic = {
  schema: 1,
  id: "core:dash",
  source: "srd",
  active: [
    {
      id: "dash",
      trigger: { kind: "invocation", economy: "action" },
      cost: [{ kind: "turn", claim: "action" }],
      steps: [{ id: "dash", kind: "dash" }],
    },
  ],
};

/** The four adjudicated actions: one `manual-table` step each, labelled by the mechanic's own
 *  id, claiming the action so the economy pill and the log are right. */
function adjudicated(id: MechanicId): Mechanic {
  return {
    schema: 1,
    id,
    source: "srd",
    active: [
      {
        id: "use",
        trigger: { kind: "invocation", economy: "action" },
        cost: [{ kind: "turn", claim: "action" }],
        steps: [{ id: "use", kind: "manual-table", label: id }],
      },
    ],
  };
}

export const dodge: Mechanic = adjudicated("core:dodge");
export const disengage: Mechanic = adjudicated("core:disengage");
export const help: Mechanic = adjudicated("core:help");
export const hide: Mechanic = adjudicated("core:hide");

export const CORE_MECHANICS: readonly Mechanic[] = [
  move,
  dash,
  dodge,
  disengage,
  help,
  hide,
];

export const CORE_MECHANIC_IDS: readonly MechanicId[] = CORE_MECHANICS.map((m) => m.id);
