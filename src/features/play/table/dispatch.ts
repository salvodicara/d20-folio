/**
 * The dispatch builders — a hotbar tile's three pure steps (stage 6 design §2 D7).
 *
 *   1. `planIntent`  — what must be rolled, or why nothing may be;
 *   2. `rollsFor`    — those inputs as `roll` action bodies, through the ONE dice seam;
 *   3. `intentBody`  — the `intent` that answers each input with the roll that settled it.
 *
 * No I/O and no store: the caller appends what these return through `tableStore.dispatch`, which
 * is what stamps identity and order. Keeping them pure is what makes the tile testable without
 * a table, and what lets the reaction card, the map's move and the hotbar share one path.
 *
 * **Rolls are never spent to learn a rejection.** `planIntent` runs the reducer's OWN preflight
 * (`preflightIntent`, `src/lib/combat/intent.ts`) rather than a second opinion of its own, so a
 * tile that is refused is refused for exactly the reason the fold would record — and the person
 * has not rolled a natural 20 into a rejected action to find out.
 */
import {
  answerKeyFor,
  isPerTargetAnswer,
  preflightIntent,
  riderAnswers,
} from "@/lib/combat/intent";
import type { Catalogue } from "@/lib/combat/catalogue";
import type { Input, Program } from "@/lib/combat/mechanic";
import type { ActionId, EntityId, MechanicId, WindowId } from "@/lib/combat/ids";
import type {
  Answer,
  Answers,
  FoldedState,
  IntentAction,
  PaymentChoice,
  Rejection,
} from "@/lib/combat/types";
import { isRollError, type RollError, type RollPurpose } from "@/lib/combat/dice";
import { roll, type PendingRoll, type SeedSource } from "@/lib/dice";

/** An `intent` action without its envelope — what `tableStore.dispatch` stamps. */
export type IntentBody = Omit<IntentAction, "id" | "seq" | "by">;

/** What the person chose on the surface, before a single die is rolled. */
export interface IntentArgs {
  readonly entity: EntityId;
  readonly mechanic: MechanicId;
  readonly program: string;
  /** The creatures the person picked; empty for a self or area program. */
  readonly targets: readonly EntityId[];
  /** Answers that are NOT rolls: the area's origin, a choice, a move's destination. */
  readonly answersSoFar: Answers;
  /** The slot level the caster spends, when the program's cost is a slot (an upcast). */
  readonly castLevel?: number;
  /** Which pool that slot comes from; ignored without `castLevel`. */
  readonly pool?: "standard" | "pact";
  /** The reaction window this intent answers, when it is a reaction. */
  readonly window?: WindowId | null;
}

/**
 * One roll the table still owes this intent.
 *
 * `key` is the answer key the reducer will read — the input's id, or `${id}:${target}` for a
 * per-target input, which is how a Fireball's saves stay attributed to the creature that rolled
 * them (`rollsUsable`, `resolve.ts`). `target` carries that creature explicitly rather than
 * leaving `rollsFor` to re-parse the key: the resolution is known here, and one parsing rule in
 * two modules is one rule too many.
 */
export interface PendingInput {
  readonly key: string;
  readonly input: Input;
  readonly target: EntityId | null;
}

export interface PlannedIntent {
  readonly inputs: readonly PendingInput[];
}

/** The slot payment an upcast declares; `[]` when the program pays no slot of its own. */
function paymentOf(args: IntentArgs): readonly PaymentChoice[] {
  return args.castLevel === undefined
    ? []
    : [{ kind: "slot", level: args.castLevel, pool: args.pool ?? "standard" }];
}

/** `args` as the action the reducer would judge, with whatever is answered so far. */
function probe(state: FoldedState, args: IntentArgs, answers: Answers): IntentAction {
  return {
    kind: "intent",
    // The preflight reads neither the identity nor the stamp; the store mints both when the
    // real action is appended. A placeholder here keeps the plan free of a clock.
    id: "",
    seq: { ms: 0, counter: 0, by: "" },
    by: "",
    entity: args.entity,
    mechanic: args.mechanic,
    program: args.program,
    targets: args.targets,
    answers,
    payment: paymentOf(args),
    window: args.window ?? null,
    basedOn: state.revision,
  };
}

/**
 * The rolls the intent needs, in the program's own input order and — for a per-target input —
 * in the resolved target order the reducer derives, followed by the rider answers a mark on a
 * target adds to an attack.
 *
 * Only `d20` and `dice` inputs: a `position`, `choice` or `table` input is ANSWERED by the
 * person (the map's origin cell, a picker), never rolled, and is expected in `answersSoFar`. An
 * input the caller has already answered is skipped, so re-planning after a partial answer never
 * re-rolls what is settled.
 *
 * Both the key rule and the rider derivation come from the reducer itself (`answerKeyFor`,
 * `riderAnswers`); nothing here re-decides either.
 */
function inputsFor(
  state: FoldedState,
  entity: EntityId,
  program: Program,
  targets: readonly EntityId[],
  answers: Answers
): PendingInput[] {
  const pending: PendingInput[] = [];
  const plan = (key: string, input: Input, target: EntityId | null): void => {
    // Deduplicated by KEY: the reducer reads one answer per mark however many riders it
    // carries, so two riders on one mark are one roll, not two.
    if (answers[key] !== undefined) return;
    if (pending.some((already) => already.key === key)) return;
    pending.push({ key, input, target });
  };

  for (const input of program.inputs ?? []) {
    if (input.kind !== "d20" && input.kind !== "dice") continue;
    if (isPerTargetAnswer(program, input.id)) {
      for (const target of targets) {
        plan(answerKeyFor(program, input.id, target), input, target);
      }
    } else {
      plan(input.id, input, null);
    }
  }

  // A mark's extra damage is a fact of the STATE, not of the attacker's mechanic, so it is
  // declared by no input — and only an `attack` step ever reads it.
  if (program.steps.some((step) => step.kind === "attack")) {
    for (const target of targets) {
      for (const rider of riderAnswers(state, entity, target)) {
        // Rolled BY THE ATTACKER (`target: null`): it is the attacker's rider, not the
        // target's save, and `rollsUsable` attributes it to the acting entity.
        plan(rider.key, { id: rider.key, kind: "dice", formula: rider.dice }, null);
      }
    }
  }
  return pending;
}

/**
 * What the table must roll for this intent — or the rejection the fold would record.
 *
 * `catalogue` is the static `core:*` set; the mechanics a seated entity carried into the log win
 * over it (`programOf`), which is why the state comes first here too.
 */
export function planIntent(
  state: FoldedState,
  catalogue: Catalogue,
  args: IntentArgs
): PlannedIntent | Rejection {
  const preflight = preflightIntent(
    state,
    probe(state, args, args.answersSoFar),
    catalogue
  );
  if ("reason" in preflight) return preflight;
  return {
    inputs: inputsFor(
      state,
      args.entity,
      preflight.program,
      preflight.targets,
      args.answersSoFar
    ),
  };
}

/** How a person's dice reach the log: the app draws a seed, or they read real dice. */
export type RollMode = "app" | "manual";

export interface RollContext {
  /** The uid appending the rolls — the action's author. */
  readonly by: string;
  /** The acting entity: the roller of every input that is not per-target. */
  readonly entity: EntityId;
  /** The DM's hidden rolls: players see "?" faces until the DM reveals them (rule 34). */
  readonly hidden?: boolean;
  /** `manual` only: the faces read off the physical dice, per input key, in formula order. */
  readonly faces?: Readonly<Record<string, readonly number[]>>;
  /** Injected by tests; the app takes the dice seam's own crypto source. */
  readonly seedSource?: SeedSource;
}

/** A `dice` input rolls damage; a `d20` input rolls whatever it is declared `for`. */
function purposeOf(input: Input): RollPurpose {
  return input.kind === "d20" ? input.for : "damage";
}

function formulaOf(input: Input): string {
  return input.kind === "dice" ? input.formula : "1d20";
}

/**
 * The `roll` action bodies for `inputs`, in order — the ONLY place the play surface draws dice
 * (ADR-0010: `src/lib/dice.ts` is the one seam, and this module never touches randomness itself).
 *
 * A per-target input is rolled BY ITS TARGET: the creature making the save owns the die, which
 * is exactly the attribution `resolve.ts` enforces when the intent answers with it.
 *
 * The first malformed roll comes back as the dice seam's own `RollError` rather than a partial
 * list — a manual entry with a missing or impossible face is a person's slip to correct, not a
 * half-rolled action to append.
 */
export function rollsFor(
  inputs: readonly PendingInput[],
  mode: RollMode,
  context: RollContext
): PendingRoll[] | RollError {
  const rolls: PendingRoll[] = [];
  for (const pending of inputs) {
    const options = {
      by: context.by,
      roller: pending.target ?? context.entity,
      reason: purposeOf(pending.input),
      hidden: context.hidden ?? false,
    };
    const built = roll(
      formulaOf(pending.input),
      mode === "app"
        ? { ...options, mode: "app" }
        : { ...options, mode: "manual", faces: context.faces?.[pending.key] ?? [] },
      context.seedSource
    );
    if (isRollError(built)) return built;
    rolls.push(built);
  }
  return rolls;
}

/**
 * The intent itself: every planned input answered by the id of the `roll` action that settled
 * it, on top of the answers the person gave, `basedOn` the revision this was decided against.
 *
 * `basedOn` is not a lock — the log is append-only and the fold is the judge — but it records
 * WHICH state the person was looking at, which is what a later reader needs to understand a
 * rejection.
 */
export function intentBody(
  state: FoldedState,
  args: IntentArgs,
  rollIds: Readonly<Record<string, ActionId>>
): IntentBody {
  const answers: Record<string, Answer> = { ...args.answersSoFar };
  for (const [key, id] of Object.entries(rollIds)) answers[key] = { roll: id };
  return {
    kind: "intent",
    entity: args.entity,
    mechanic: args.mechanic,
    program: args.program,
    targets: args.targets,
    answers,
    payment: paymentOf(args),
    window: args.window ?? null,
    basedOn: state.revision,
  };
}
