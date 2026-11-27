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
import type { DamageType } from "@/types/damage";

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

type DieModifierGrant = GrantOf<"damage-die-modifier">;

/** A change to the weapon's own damage dice when rolled (Great Weapon Fighting). */
export interface DieModifierClauseRule {
  op: "clause";
  target: "roll:damage:die-modifier";
  mode: DieModifierGrant["mode"];
  appliesTo: DieModifierGrant["appliesTo"];
  floorBelow?: number;
  floorTo?: number;
  oncePerTurn?: boolean;
  baseDie?: string;
  unburdenedDie?: string;
  grappleDie?: string;
  abilityMod?: AbilityCode;
  damageType?: DamageType;
}

/** Incoming damage of these types is reduced by a rolled die (Resistance). */
export interface DieReductionClauseRule {
  op: "clause";
  target: "roll:incoming-damage:die-reduction";
  dice: string;
  damageTypes: readonly DamageType[];
  oncePerTurn: boolean;
}

/** A round-1 save-gated damage doubler note (shown, never applied). */
export interface Round1DoubleClauseRule {
  op: "clause";
  target: "roll:damage:round1-double";
  saveAbility: AbilityCode;
  saveDcAbility: AbilityCode;
}

/** How a save's damage resolves (Evasion: none on a success, half on a failure). */
export interface SaveDamageClauseRule {
  op: "clause";
  target: "roll:save:damage-rule";
  ability: AbilityCode;
  requiresDamageOnSuccess: "half";
  onSuccess: "none";
  onFailure: "half";
}

export type RollClauseRule =
  | VerdictClauseRule
  | RerollClauseRule
  | FloorClauseRule
  | DieClauseRule
  | ConcentrationProofClauseRule
  | DieModifierClauseRule
  | DieReductionClauseRule
  | Round1DoubleClauseRule
  | SaveDamageClauseRule;

/** Damage of this type ignores Resistance: from spells only, or from any roll. */
export type IgnoreResistanceTarget =
  `damage:ignore-resistance:${"spell" | "any"}:${string}`;
type IgnoreResistanceRule = { op: "flag"; target: IgnoreResistanceTarget };

type RollGrant = GrantOf<
  | "advantage-on"
  | "disadvantage-on"
  | "incoming-attack-advantage"
  | "incoming-attack-disadvantage"
  | "d20-reroll"
  | "roll-floor"
  | "roll-die-adjustment"
  | "concentration-damage-proof"
  | "damage-die-modifier"
  | "damage-die-reduction"
  | "damage-penetration"
  | "round1-damage-double"
  | "save-damage-rule"
>;

const textOf = (description: LocaleText | undefined) =>
  description ? { description } : {};

/** Compile one roll-time Grant. A bare stub (only `type`) compiles without throwing. */
export function compileRollGrant(
  grant: RollGrant
): Array<RollClauseRule | IgnoreResistanceRule> {
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
    case "damage-die-modifier": {
      // Every field travels unresolved (the weapon and the scores are the reader's).
      const optional = {
        floorBelow: grant.floorBelow,
        floorTo: grant.floorTo,
        oncePerTurn: grant.oncePerTurn,
        baseDie: grant.baseDie,
        unburdenedDie: grant.unburdenedDie,
        grappleDie: grant.grappleDie,
        abilityMod: grant.abilityMod,
        damageType: grant.damageType,
      };
      return [
        {
          op: "clause",
          target: "roll:damage:die-modifier",
          mode: grant.mode,
          appliesTo: grant.appliesTo,
          ...Object.fromEntries(
            Object.entries(optional).filter(([, value]) => value !== undefined)
          ),
        },
      ];
    }
    case "damage-die-reduction":
      return [
        {
          op: "clause",
          target: "roll:incoming-damage:die-reduction",
          dice: grant.dice,
          damageTypes: grant.damageTypes,
          oncePerTurn: grant.oncePerTurn ?? false,
        },
      ];
    case "damage-penetration":
      // A roll of any kind includes spells. (A bare stub has no types: no flags.)
      return ((grant.damageTypes as readonly DamageType[] | undefined) ?? []).flatMap(
        (type): IgnoreResistanceRule[] => [
          { op: "flag", target: `damage:ignore-resistance:spell:${type}` },
          ...(grant.appliesTo === "any"
            ? [{ op: "flag", target: `damage:ignore-resistance:any:${type}` } as const]
            : []),
        ]
      );
    case "round1-damage-double":
      return [
        {
          op: "clause",
          target: "roll:damage:round1-double",
          saveAbility: grant.saveAbility,
          saveDcAbility: grant.saveDcAbility,
        },
      ];
    case "save-damage-rule":
      // `suppressedByConditions` is gating: the evaluator drops the grant first.
      return [
        {
          op: "clause",
          target: "roll:save:damage-rule",
          ability: grant.ability,
          requiresDamageOnSuccess: grant.requiresDamageOnSuccess,
          onSuccess: grant.onSuccess,
          onFailure: grant.onFailure,
        },
      ];
  }
}

/** Whether a rule is one of this module's roll-time rules (never a stacked number). */
export function isRollTimeRule(rule: { op: string; target?: string }): boolean {
  return (
    rule.op === "clause" ||
    (rule.op === "flag" && rule.target?.startsWith("damage:ignore-resistance:") === true)
  );
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

export type DieModifierRow = { sourceId: string } & Omit<
  DieModifierClauseRule,
  "op" | "target"
>;
export type DieReductionRow = { sourceId: string } & Omit<
  DieReductionClauseRule,
  "op" | "target"
>;
export type Round1DoubleRow = { sourceId: string } & Omit<
  Round1DoubleClauseRule,
  "op" | "target"
>;
export type SaveDamageRow = { sourceId: string } & Omit<
  SaveDamageClauseRule,
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
  damageDieModifiers: DieModifierRow[];
  damageDieReductions: DieReductionRow[];
  round1DamageDoubles: Round1DoubleRow[];
  saveDamageRules: SaveDamageRow[];
}

/** The clause's own fields, without the rule's `op` and `target`. */
function fieldsOf<R extends RollClauseRule>(rule: R): Omit<R, "op" | "target"> {
  const fields: Record<string, unknown> = { ...rule };
  delete fields.op;
  delete fields.target;
  return fields as Omit<R, "op" | "target">;
}

const ROLL_TARGET = /^roll:([a-z0-9-]+):([a-z0-9-]+)$/;

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
    damageDieModifiers: [],
    damageDieReductions: [],
    round1DamageDoubles: [],
    saveDamageRules: [],
  };
  rules.forEach((rule, index) => {
    if (rule.op !== "clause") return;
    const clause = rule as RollClauseRule;
    const [, roll, what] = ROLL_TARGET.exec(clause.target) ?? [];
    if (!roll || !what) return;
    const { sourceId, description, whileActiveKey } = contextOf(index);
    const active = whileActiveKey ? { whileActiveKey } : {};
    if (what === "die-modifier")
      rows.damageDieModifiers.push({
        sourceId,
        ...fieldsOf(clause as DieModifierClauseRule),
      });
    else if (what === "die-reduction")
      rows.damageDieReductions.push({
        sourceId,
        ...fieldsOf(clause as DieReductionClauseRule),
      });
    else if (what === "round1-double")
      rows.round1DamageDoubles.push({
        sourceId,
        ...fieldsOf(clause as Round1DoubleClauseRule),
      });
    else if (what === "damage-rule")
      rows.saveDamageRules.push({
        ...fieldsOf(clause as SaveDamageClauseRule),
        sourceId,
      });
    else if ("faces" in clause) {
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
    } else if (what === "die") {
      const die = clause as DieClauseRule;
      rows.rollDieAdjustments.push({
        sourceId,
        rollType: roll as DieRoll,
        operation: die.operation,
        dice: die.dice,
        consume: die.consume,
        ...(die.appliesTo ? { appliesTo: die.appliesTo } : {}),
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
