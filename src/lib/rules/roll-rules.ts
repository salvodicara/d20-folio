/**
 * Roll-time rules (ADR-0010, M1, #1432): the passive Grant kinds that change a roll
 * when it happens. Each one compiles here; `compileGrant` only delegates.
 *
 * A roll clause is a Rule on a roll target, `roll:<roll>:<what>`: Advantage or
 * Disadvantage (`roll:save:advantage`, `roll:incoming-attack:disadvantage`), a reroll
 * (`roll:d20:reroll`), a floor (`roll:check:floor`), a die on the roll
 * (`roll:save:die`), damage that cannot break Concentration
 * (`roll:concentration:damage-proof`). A clause is never folded into a number:
 * Advantage does not stack, and every reader names the source that gives it. So
 * clauses are kept one per source, in grant order, and {@link rollRows} turns the
 * compiled clauses into the rows the roll readers take.
 *
 * Compiling is pure. What needs the evaluator's context stays with the evaluator:
 * a condition that suppresses the grant (it is not compiled at all), the source id,
 * the `while-active` state the grant came through, and the catalogue text.
 */
import type { Grant } from "@/lib/grant-schema";
import type { AbilityCode, LocaleText } from "@/data/types";

type GrantOf<K extends Grant["type"]> = Extract<Grant, { type: K }>;
type VerdictGrant = GrantOf<"advantage-on" | "disadvantage-on">;

/** The rolls an Advantage or Disadvantage clause can change. */
export type ClauseRoll = VerdictGrant["rollType"];
/** An attack clause narrower than "every attack roll" (`all` is never kept). */
export type ClauseScope = Exclude<
  Extract<VerdictGrant, { rollType: "attack" }>["scope"],
  "all"
>;
export type ClauseVerdict = "advantage" | "disadvantage";
type FloorRoll = GrantOf<"roll-floor">["rollType"];
type DieRoll = GrantOf<"roll-die-adjustment">["rollType"];
type Consume = "next" | "each";

/** One source's Advantage or Disadvantage on a kind of roll. */
export interface VerdictClauseRule {
  op: "clause";
  target:
    | `roll:${ClauseRoll}:${ClauseVerdict}`
    /** Attack rolls made against the character. */
    | `roll:incoming-attack:${ClauseVerdict}`;
  /** Which rolls of that kind it covers ("str", "poisoned", "initiative"). */
  vs?: string;
  scope?: ClauseScope;
  /** Only in the first round of a fight. */
  round1?: true;
  /** A one-shot clause the next matching roll (or each one) spends. */
  consume?: Consume;
  description?: LocaleText;
}

/** Reroll the d20 of a D20 Test on these faces; the new roll stands. */
export interface RerollClauseRule {
  op: "clause";
  target: "roll:d20:reroll";
  faces: GrantOf<"d20-reroll">["faces"];
}

/** A d20 below `floor` counts as `floor`. */
export interface FloorClauseRule {
  op: "clause";
  target: `roll:${FloorRoll}:floor`;
  floor: number;
  appliesTo: GrantOf<"roll-floor">["appliesTo"];
  ability?: AbilityCode;
  description?: LocaleText;
}

/** A die added to or taken from the roll (Bless, Bane, Guidance). */
export interface DieClauseRule {
  op: "clause";
  target: `roll:${DieRoll}:die`;
  operation: "add" | "subtract";
  dice: string;
  consume: Consume;
  /** One skill only (Guidance). */
  appliesTo?: string;
}

/** Damage does not break Concentration on these spells. */
export interface ConcentrationProofClauseRule {
  op: "clause";
  target: "roll:concentration:damage-proof";
  spellId?: string;
  spells?: GrantOf<"concentration-damage-proof">["spells"];
  alsoWhileIncapacitated?: true;
}

export type RollClauseRule =
  | VerdictClauseRule
  | RerollClauseRule
  | FloorClauseRule
  | DieClauseRule
  | ConcentrationProofClauseRule;

type RollGrant = GrantOf<
  | "advantage-on"
  | "disadvantage-on"
  | "incoming-attack-advantage"
  | "incoming-attack-disadvantage"
  | "d20-reroll"
  | "roll-floor"
  | "roll-die-adjustment"
  | "concentration-damage-proof"
>;

const textOf = (description: LocaleText | undefined) =>
  description ? { description } : {};

/** Compile one roll-time Grant. A bare stub (only `type`) compiles without throwing. */
export function compileRollGrant(grant: RollGrant): RollClauseRule[] {
  switch (grant.type) {
    case "incoming-attack-advantage":
    case "incoming-attack-disadvantage": {
      const verdict = grant.type.slice("incoming-attack-".length) as ClauseVerdict;
      return [
        {
          op: "clause",
          target: `roll:incoming-attack:${verdict}`,
          ...textOf(grant.description),
        },
      ];
    }
    case "advantage-on":
    case "disadvantage-on": {
      const verdict = grant.type === "advantage-on" ? "advantage" : "disadvantage";
      const scope = grant.rollType === "attack" ? grant.scope : undefined;
      return [
        {
          op: "clause",
          target: `roll:${grant.rollType}:${verdict}`,
          vs: grant.vs,
          ...(scope && scope !== "all" ? { scope } : {}),
          ...("round1" in grant && grant.round1 ? { round1: true } : {}),
          ...(grant.consume ? { consume: grant.consume } : {}),
          ...textOf(grant.description),
        },
      ];
    }
    case "d20-reroll":
      return [{ op: "clause", target: "roll:d20:reroll", faces: grant.faces }];
    case "roll-floor":
      return [
        {
          op: "clause",
          target: `roll:${grant.rollType}:floor`,
          floor: grant.floor,
          appliesTo: grant.appliesTo,
          ...(grant.ability ? { ability: grant.ability } : {}),
          ...textOf(grant.description),
        },
      ];
    case "roll-die-adjustment":
      return [
        {
          op: "clause",
          target: `roll:${grant.rollType}:die`,
          operation: grant.operation,
          dice: grant.dice,
          consume: grant.consume,
          ...(grant.appliesTo ? { appliesTo: grant.appliesTo } : {}),
        },
      ];
    case "concentration-damage-proof":
      return [
        {
          op: "clause",
          target: "roll:concentration:damage-proof",
          ...(grant.spellId !== undefined ? { spellId: grant.spellId } : {}),
          ...(grant.spells !== undefined ? { spells: grant.spells } : {}),
          ...(grant.alsoWhileIncapacitated ? { alsoWhileIncapacitated: true } : {}),
        },
      ];
  }
}

/** Whether a rule is one of this module's roll-time rules (never a stacked number). */
export function isRollTimeRule(rule: { op: string }): boolean {
  return rule.op === "clause";
}

/** What the evaluator knows about one compiled clause. */
export interface ClauseContext<Text> {
  sourceId: string;
  /** The clause's text: the catalogue's, else the grant's own. */
  description: Text;
  /** The `while-active` state the grant came through, if any. */
  whileActiveKey?: string;
}

/** One source's Advantage or Disadvantage on a roll (the readers' row). */
export interface ClauseRow<Text> {
  sourceId: string;
  rollType: ClauseRoll;
  vs: string;
  description: Text;
  round1?: boolean;
  whileActiveKey?: string;
  scope?: ClauseScope;
  consume?: Consume;
}

/** One source's clause on attacks made against the character. */
export interface IncomingAttackRow<Text> {
  sourceId: string;
  description: Text;
  whileActiveKey?: string;
}

export interface FloorRow<Text> {
  sourceId: string;
  rollType: FloorRoll;
  floor: number;
  appliesTo: FloorClauseRule["appliesTo"];
  ability?: AbilityCode;
  description: Text;
  whileActiveKey?: string;
}

export type RerollRow = { sourceId: string } & Pick<RerollClauseRule, "faces">;
export type DieRow = { sourceId: string; rollType: DieRoll } & Omit<
  DieClauseRule,
  "op" | "target"
>;
export type ConcentrationProofRow = { sourceId: string } & Omit<
  ConcentrationProofClauseRule,
  "op" | "target"
>;

export interface RollRows<Text> {
  advantages: ClauseRow<Text>[];
  disadvantages: ClauseRow<Text>[];
  incomingAttackAdvantages: IncomingAttackRow<Text>[];
  incomingAttackDisadvantages: IncomingAttackRow<Text>[];
  rollFloors: FloorRow<Text>[];
  d20Rerolls: RerollRow[];
  rollDieAdjustments: DieRow[];
  concentrationDamageProof: ConcentrationProofRow[];
}

const ROLL_TARGET = /^roll:([a-z0-9-]+):([a-z-]+)$/;

/**
 * The readers' roll rows, from the compiled rules in grant order. `contextOf(i)` is
 * the evaluator's context of `rules[i]`; rules that are not clauses are skipped.
 */
export function rollRows<Text>(
  rules: ReadonlyArray<{ op: string }>,
  contextOf: (index: number) => ClauseContext<Text>
): RollRows<Text> {
  const rows: RollRows<Text> = {
    advantages: [],
    disadvantages: [],
    incomingAttackAdvantages: [],
    incomingAttackDisadvantages: [],
    rollFloors: [],
    d20Rerolls: [],
    rollDieAdjustments: [],
    concentrationDamageProof: [],
  };
  rules.forEach((rule, index) => {
    if (rule.op !== "clause") return;
    const clause = rule as RollClauseRule;
    const [, roll, what] = ROLL_TARGET.exec(clause.target) ?? [];
    if (!roll || !what) return;
    const { sourceId, description, whileActiveKey } = contextOf(index);
    const active = whileActiveKey ? { whileActiveKey } : {};
    if ("faces" in clause) {
      rows.d20Rerolls.push({ sourceId, faces: clause.faces });
    } else if ("floor" in clause) {
      rows.rollFloors.push({
        sourceId,
        rollType: roll as FloorRoll,
        floor: clause.floor,
        appliesTo: clause.appliesTo,
        ...(clause.ability ? { ability: clause.ability } : {}),
        description,
        ...active,
      });
    } else if ("dice" in clause) {
      rows.rollDieAdjustments.push({
        sourceId,
        rollType: roll as DieRoll,
        operation: clause.operation,
        dice: clause.dice,
        consume: clause.consume,
        ...(clause.appliesTo ? { appliesTo: clause.appliesTo } : {}),
      });
    } else if (what === "damage-proof") {
      const proof = clause as ConcentrationProofClauseRule;
      rows.concentrationDamageProof.push({
        sourceId,
        ...(proof.spellId !== undefined ? { spellId: proof.spellId } : {}),
        ...(proof.spells !== undefined ? { spells: proof.spells } : {}),
        ...(proof.alsoWhileIncapacitated ? { alsoWhileIncapacitated: true } : {}),
      });
    } else if (roll === "incoming-attack") {
      const row = { sourceId, description, ...active };
      if (what === "advantage") rows.incomingAttackAdvantages.push(row);
      else rows.incomingAttackDisadvantages.push(row);
    } else {
      const verdict = clause as VerdictClauseRule;
      const row: ClauseRow<Text> = {
        sourceId,
        rollType: roll as ClauseRoll,
        vs: verdict.vs ?? "",
        description,
        ...(verdict.round1 ? { round1: true } : {}),
        ...active,
        ...(verdict.scope ? { scope: verdict.scope } : {}),
      };
      if (what === "advantage") rows.advantages.push(row);
      // Only a Disadvantage row carries its consume policy: the Advantage rows never
      // have, and giving them one would change what the readers do (not an M1 step).
      else
        rows.disadvantages.push(
          verdict.consume ? { ...row, consume: verdict.consume } : row
        );
    }
  });
  return rows;
}
