/**
 * Roll-time rules (ADR-0010, M1, #1432): the passive Grant kinds that change a roll
 * when it happens. Each one compiles here; `compileGrant` only delegates.
 *
 * A roll clause (Advantage, Disadvantage, attacks against the character) is a Rule on
 * a roll target, `roll:<roll>:<advantage|disadvantage>`. It is never folded into a
 * number: Advantage does not stack, and every reader names the source that gives it.
 * So clauses are kept one per source, in grant order, and {@link rollClauseRows}
 * turns the compiled clauses into the rows the roll readers take.
 *
 * Compiling is pure. What needs the evaluator's context stays with the evaluator:
 * a condition that suppresses the grant (it is not compiled at all), the source id,
 * the `while-active` state the grant came through, and the catalogue text.
 */
import type { Grant } from "@/lib/grant-schema";
import type { LocaleText } from "@/data/types";

type ClauseGrant = Extract<Grant, { type: "advantage-on" | "disadvantage-on" }>;

/** The rolls a clause can change. */
export type ClauseRoll = ClauseGrant["rollType"];
/** An attack clause narrower than "every attack roll" (`all` is never kept). */
export type ClauseScope = Exclude<
  Extract<ClauseGrant, { rollType: "attack" }>["scope"],
  "all"
>;
export type ClauseVerdict = "advantage" | "disadvantage";

export type RollClauseTarget =
  | `roll:${ClauseRoll}:${ClauseVerdict}`
  /** Attack rolls made against the character. */
  | `roll:incoming-attack:${ClauseVerdict}`;

/** A roll clause: one source's Advantage or Disadvantage on a kind of roll. */
export interface RollClauseRule {
  op: "clause";
  target: RollClauseTarget;
  /** Which rolls of that kind it covers ("str", "poisoned", "initiative"). */
  vs?: string;
  scope?: ClauseScope;
  /** Only in the first round of a fight. */
  round1?: true;
  /** A one-shot clause the next matching roll (or each one) spends. */
  consume?: "next" | "each";
  description?: LocaleText;
}

type RollGrant = Extract<
  Grant,
  {
    type:
      | "advantage-on"
      | "disadvantage-on"
      | "incoming-attack-advantage"
      | "incoming-attack-disadvantage";
  }
>;

/** Compile one roll-time Grant. A bare stub (only `type`) compiles without throwing. */
export function compileRollGrant(grant: RollGrant): RollClauseRule[] {
  const description = grant.description ? { description: grant.description } : {};
  switch (grant.type) {
    case "incoming-attack-advantage":
      return [{ op: "clause", target: "roll:incoming-attack:advantage", ...description }];
    case "incoming-attack-disadvantage":
      return [
        { op: "clause", target: "roll:incoming-attack:disadvantage", ...description },
      ];
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
          ...description,
        },
      ];
    }
  }
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
  consume?: "next" | "each";
}

/** One source's clause on attacks made against the character. */
export interface IncomingAttackRow<Text> {
  sourceId: string;
  description: Text;
  whileActiveKey?: string;
}

export interface ClauseRows<Text> {
  advantages: ClauseRow<Text>[];
  disadvantages: ClauseRow<Text>[];
  incomingAttackAdvantages: IncomingAttackRow<Text>[];
  incomingAttackDisadvantages: IncomingAttackRow<Text>[];
}

const CLAUSE_TARGET = /^roll:([a-z-]+):(advantage|disadvantage)$/;

/**
 * The readers' clause rows, from the compiled rules in grant order. `contextOf(i)`
 * is the evaluator's context of `rules[i]`; rules that are not clauses are skipped.
 */
export function rollClauseRows<Text>(
  rules: ReadonlyArray<{ op: string }>,
  contextOf: (index: number) => ClauseContext<Text>
): ClauseRows<Text> {
  const rows: ClauseRows<Text> = {
    advantages: [],
    disadvantages: [],
    incomingAttackAdvantages: [],
    incomingAttackDisadvantages: [],
  };
  rules.forEach((rule, index) => {
    if (rule.op !== "clause") return;
    const clause = rule as RollClauseRule;
    const [, roll, verdict] = CLAUSE_TARGET.exec(clause.target) ?? [];
    if (!roll || !verdict) return;
    const { sourceId, description, whileActiveKey } = contextOf(index);
    const active = whileActiveKey ? { whileActiveKey } : {};
    if (roll === "incoming-attack") {
      const row = { sourceId, description, ...active };
      if (verdict === "advantage") rows.incomingAttackAdvantages.push(row);
      else rows.incomingAttackDisadvantages.push(row);
      return;
    }
    const row: ClauseRow<Text> = {
      sourceId,
      rollType: roll as ClauseRoll,
      vs: clause.vs ?? "",
      description,
      ...(clause.round1 ? { round1: true } : {}),
      ...active,
      ...(clause.scope ? { scope: clause.scope } : {}),
    };
    if (verdict === "advantage") rows.advantages.push(row);
    // Only a Disadvantage row carries its consume policy: the Advantage rows never
    // have, and giving them one would change what the readers do (not an M1 step).
    else
      rows.disadvantages.push(clause.consume ? { ...row, consume: clause.consume } : row);
  });
  return rows;
}
