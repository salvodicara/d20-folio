/** JSON-plain combat outcome contracts shared by authored data, engine and IO. */

export type CombatAbilityCode = "STR" | "DEX" | "CON" | "INT" | "WIS" | "CHA";

export interface CombatOutcomeTarget {
  combatantId: string;
}

export type CombatAttackResult = "hit" | "miss" | "critical-hit";

export type CombatOutcomeFact =
  | { kind: "attack"; result: CombatAttackResult }
  | {
      kind: "save";
      ability: CombatAbilityCode;
      result: "success" | "failure";
    }
  | {
      kind: "damage-reduction";
      incoming: number;
      reduced: number;
      remaining: number;
    };

export interface CombatOutcomeReceipt {
  id: string;
  occurrenceId: string;
  actionId: string;
  /** Exact zero-based instance, or null when the table supplied only an aggregate. */
  instance: number | null;
  /** Number of indistinguishable instances represented (1 for an exact instance). */
  count: number;
  target: CombatOutcomeTarget;
  fact: CombatOutcomeFact;
}

export type CombatOutcomePredicate =
  | {
      actionId?: string;
      kind: "attack";
      result: CombatAttackResult | "success";
      target?: CombatOutcomeTarget;
    }
  | {
      actionId?: string;
      kind: "save";
      ability?: CombatAbilityCode;
      result: "success" | "failure";
      target?: CombatOutcomeTarget;
    }
  | {
      actionId?: string;
      kind: "damage-reduction";
      result: "negated" | "remaining";
      target?: CombatOutcomeTarget;
    };

export interface ReviewedCombatTargetOutcome {
  target: CombatOutcomeTarget;
  attack?:
    | { results: ReadonlyArray<CombatAttackResult> }
    | { attempts: number; hits: number; criticalHits?: number };
  save?: {
    ability: CombatAbilityCode;
    result: "success" | "failure";
    instances?: number;
  };
  damageReduction?: { incoming: number; remaining: number };
}
