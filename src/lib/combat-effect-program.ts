/** Pure validation, review and planning for authored ordered combat effects. */

import {
  ALL_ABILITY_CODES,
  ALL_DAMAGE_SOURCES,
  type AbilityCode,
  type CombatEffectAreaFact,
  type CombatEffectAmountSpec,
  type CombatEffectAmountTerm,
  type CombatEffectBinding,
  type CombatEffectBoundValue,
  type CombatEffectComparison,
  type CombatEffectDamageTypeSpec,
  type CombatEffectGate,
  type CombatEffectGateResult,
  type CombatEffectInput,
  type CombatEffectLayer,
  type CombatEffectLifetime,
  type CombatEffectParticipantRole,
  type CombatEffectPhase,
  type CombatEffectPredicate,
  type CombatEffectProgram,
  type CombatEffectScope,
  type CombatEffectScaledValue,
  type CombatEffectStep,
  type CombatEffectSubject,
  type CombatEffectTrigger,
  type ConditionId,
  type CreatureSize,
  type DamageSource,
} from "@/data/types";
import { DAMAGE_TYPES as CANONICAL_DAMAGE_TYPES, type DamageType } from "@/types/damage";
import { evaluateD20Test } from "@/lib/d20-test";
import { combatTableEntityRef } from "@/lib/combat-test-context";
import { evaluateIntegerExpression } from "@/lib/integer-expression";
import {
  conformCombatEffectAtomicReadSet,
  isAtomicOccurrenceRuleIdentity,
  type AtomicOwner,
  type CombatEffectAtomicReadSet,
  type CombatEffectAtomicReadSetHeader,
} from "@/lib/combat-effect-atomic";
import { isActiveCombatEffect } from "@/lib/combat-effect-io";
import { turnBoundaryAfter } from "@/lib/combat-effects";
import { resolveCombatEffectGrants } from "@/lib/resolve-grant-sources";
import type {
  ActiveCombatEffect,
  CombatantRef,
  EncounterPosition,
} from "@/types/combat-effect";
import type { CombatOutcomeTarget } from "@/types/combat-outcome";
import type { D20TestRequest, D20TestResult } from "@/types/d20-test";

const ID = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const MAX_ID_LENGTH = 96;
const MAX_REPEAT = 1_000;
const MAX_DICE = 100;
const MAX_DIE_SIDES = 1_000;
const MAX_AMOUNT_TERMS = 16;
const SCOPES = new Set<CombatEffectScope>(["program", "target", "instance"]);
const ABILITIES = new Set<string>(ALL_ABILITY_CODES);
const DAMAGE_TYPES = new Set<string>(CANONICAL_DAMAGE_TYPES);
const DAMAGE_SOURCES = new Set<string>(ALL_DAMAGE_SOURCES);
const BINDINGS = new Set<CombatEffectBinding>([
  "caster-spell-save-dc",
  "caster-spellcasting-modifier",
  "triggering-damage",
]);
const PARTICIPANT_ROLES = new Set<CombatEffectParticipantRole>([
  "owner",
  "caster",
  "activator",
  "triggering-attacker",
  "victim",
]);
const SIZES: ReadonlyArray<CreatureSize> = [
  "Tiny",
  "Small",
  "Medium",
  "Large",
  "Huge",
  "Gargantuan",
];
const AREA_FACTS = new Set([
  "difficult-terrain",
  "obscured",
  "ranged-weapon-impossible",
  "strong-wind",
]);
const CONDITIONS = new Set<ConditionId>([
  "blinded",
  "charmed",
  "deafened",
  "exhaustion",
  "frightened",
  "grappled",
  "incapacitated",
  "invisible",
  "paralyzed",
  "petrified",
  "poisoned",
  "prone",
  "restrained",
  "stunned",
  "unconscious",
]);

type JsonObject = Record<string, unknown>;

export interface CombatEffectValidationResult {
  valid: boolean;
  errors: ReadonlyArray<string>;
}

function object(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeInteger(value: unknown, min = Number.MIN_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && (value as number) >= min;
}

function finite(value: unknown, min = -Infinity): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min;
}

function validId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_ID_LENGTH &&
    ID.test(value) &&
    value !== "constructor" &&
    value !== "prototype"
  );
}

function validCondition(value: unknown): value is ConditionId {
  return typeof value === "string" && CONDITIONS.has(value as ConditionId);
}

function requiredMapValue<K, V>(map: ReadonlyMap<K, V>, key: K, label: string): V {
  const value = map.get(key);
  if (value === undefined) throw new TypeError(`Missing validated ${label}`);
  return value;
}

function exactKeys(
  value: JsonObject,
  path: string,
  required: ReadonlyArray<string>,
  optional: ReadonlyArray<string>,
  errors: string[]
): void {
  const allowed = new Set([...required, ...optional]);
  for (const key of required) {
    if (!Object.hasOwn(value, key)) errors.push(`${path}.${key}: missing`);
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`${path}.${key}: unknown field`);
  }
}

function validateJsonPlain(
  value: unknown,
  path: string,
  errors: string[],
  ancestors = new WeakSet<object>()
): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) errors.push(`${path}: number must be finite`);
    return;
  }
  if (typeof value !== "object") {
    errors.push(`${path}: must be JSON-plain`);
    return;
  }
  if (ancestors.has(value)) {
    errors.push(`${path}: cyclic value`);
    return;
  }
  ancestors.add(value);
  if (Object.getOwnPropertySymbols(value).length > 0) {
    errors.push(`${path}: symbol properties are not JSON data`);
  }
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      errors.push(`${path}: must use a plain array`);
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (
      Object.keys(descriptors).length !== value.length + 1 ||
      !Object.hasOwn(descriptors, "length")
    ) {
      errors.push(`${path}: sparse or decorated arrays are not allowed`);
    }
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
        errors.push(`${path}[${index}]: expected an enumerable data element`);
      } else {
        validateJsonPlain(descriptor.value, `${path}[${index}]`, errors, ancestors);
      }
    }
  } else {
    const proto: unknown = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      errors.push(`${path}: must use a plain object`);
    }
    for (const [key, descriptor] of Object.entries(
      Object.getOwnPropertyDescriptors(value)
    )) {
      if (!descriptor.enumerable || !("value" in descriptor)) {
        errors.push(`${path}.${key}: accessors and hidden properties are not allowed`);
      } else {
        validateJsonPlain(descriptor.value, `${path}.${key}`, errors, ancestors);
      }
    }
  }
  ancestors.delete(value);
}

function validateId(value: unknown, path: string, errors: string[]): void {
  if (!validId(value)) errors.push(`${path}: invalid stable id`);
}

function validateScope(value: unknown, path: string, errors: string[]): void {
  if (!SCOPES.has(value as CombatEffectScope)) errors.push(`${path}: invalid scope`);
}

function validateBinding(value: unknown, path: string, errors: string[]): void {
  if (!BINDINGS.has(value as CombatEffectBinding)) {
    errors.push(`${path}: invalid binding`);
  }
}

function validateBoundValue(
  value: unknown,
  path: string,
  errors: string[],
  optional = false
): void {
  if (value === undefined && optional) return;
  if (safeInteger(value, 0)) return;
  if (!object(value)) {
    errors.push(`${path}: expected non-negative integer or binding`);
    return;
  }
  exactKeys(value, path, ["kind", "binding"], [], errors);
  if (value.kind !== "binding") errors.push(`${path}.kind: expected binding`);
  validateBinding(value.binding, `${path}.binding`, errors);
}

function validateSkill(value: unknown, path: string, errors: string[]): void {
  const values = Array.isArray(value) ? value : [value];
  if (values.length === 0) {
    errors.push(`${path}: expected non-empty skill set`);
    return;
  }
  const seen = new Set<string>();
  values.forEach((skill, index) => {
    const skillPath = Array.isArray(value) ? `${path}[${index}]` : path;
    if (!validId(skill)) errors.push(`${skillPath}: invalid skill id`);
    else if (seen.has(skill)) errors.push(`${skillPath}: duplicate skill`);
    if (typeof skill === "string") seen.add(skill);
  });
}

function validateSizeAdvantage(value: unknown, path: string, errors: string[]): void {
  if (!object(value)) {
    errors.push(`${path}: expected size advantage clause`);
    return;
  }
  exactKeys(value, path, ["subject", "comparison", "size", "sourceId"], [], errors);
  validateSubject(value.subject, `${path}.subject`, errors);
  if (value.comparison !== "lte" && value.comparison !== "gte") {
    errors.push(`${path}.comparison: expected lte or gte`);
  }
  if (!SIZES.includes(value.size as CreatureSize)) {
    errors.push(`${path}.size: invalid creature size`);
  }
  validateId(value.sourceId, `${path}.sourceId`, errors);
}

function validateRollSpec(value: unknown, path: string, errors: string[]): void {
  if (!object(value)) {
    errors.push(`${path}: expected roll spec`);
    return;
  }
  exactKeys(value, path, ["count", "sides"], ["bonus", "critical"], errors);
  if (object(value.count)) validateScaledValue(value.count, `${path}.count`, errors);
  else if (!safeInteger(value.count, 1) || value.count > MAX_DICE) {
    errors.push(`${path}.count: expected 1..${MAX_DICE} or a scaled value`);
  }
  if (!safeInteger(value.sides, 2) || value.sides > MAX_DIE_SIDES) {
    errors.push(`${path}.sides: expected 2..${MAX_DIE_SIDES}`);
  }
  if (Object.hasOwn(value, "bonus") && !safeInteger(value.bonus)) {
    errors.push(`${path}.bonus: expected safe integer`);
  }
  if (Object.hasOwn(value, "critical")) {
    if (!object(value.critical)) errors.push(`${path}.critical: expected clause`);
    else {
      exactKeys(value.critical, `${path}.critical`, ["gateId", "multiplier"], [], errors);
      validateId(value.critical.gateId, `${path}.critical.gateId`, errors);
      if (!safeInteger(value.critical.multiplier, 2)) {
        errors.push(`${path}.critical.multiplier: expected integer of at least 2`);
      }
    }
  }
}

function validateScaledValue(value: unknown, path: string, errors: string[]): void {
  if (!object(value)) {
    errors.push(`${path}: expected scaled value`);
    return;
  }
  exactKeys(value, path, ["base"], ["perSlot", "byCharacterLevel", "perCounter"], errors);
  if (!safeInteger(value.base, 0))
    errors.push(`${path}.base: expected non-negative integer`);
  if (Object.hasOwn(value, "perSlot")) {
    const clause = value.perSlot;
    if (!object(clause)) errors.push(`${path}.perSlot: expected clause`);
    else {
      exactKeys(clause, `${path}.perSlot`, ["above", "amount"], [], errors);
      if (!safeInteger(clause.above, 0)) {
        errors.push(`${path}.perSlot.above: expected non-negative integer`);
      }
      if (!safeInteger(clause.amount, 0)) {
        errors.push(`${path}.perSlot.amount: expected non-negative integer`);
      }
    }
  }
  if (Object.hasOwn(value, "byCharacterLevel")) {
    if (!Array.isArray(value.byCharacterLevel) || value.byCharacterLevel.length === 0) {
      errors.push(`${path}.byCharacterLevel: expected non-empty thresholds`);
    } else {
      let prior = 0;
      value.byCharacterLevel.forEach((row, index) => {
        const rowPath = `${path}.byCharacterLevel[${index}]`;
        if (!object(row)) {
          errors.push(`${rowPath}: expected threshold`);
          return;
        }
        exactKeys(row, rowPath, ["minLevel", "value"], [], errors);
        if (!safeInteger(row.minLevel, 1) || row.minLevel <= prior) {
          errors.push(`${rowPath}.minLevel: expected strictly increasing positive level`);
        }
        if (!safeInteger(row.value, 0)) {
          errors.push(`${rowPath}.value: expected non-negative integer`);
        }
        if (safeInteger(row.minLevel, 1)) prior = row.minLevel;
      });
    }
  }
  if (Object.hasOwn(value, "perCounter")) {
    const clause = value.perCounter;
    if (!object(clause)) errors.push(`${path}.perCounter: expected clause`);
    else {
      exactKeys(clause, `${path}.perCounter`, ["counterId", "amount"], [], errors);
      validateId(clause.counterId, `${path}.perCounter.counterId`, errors);
      if (!safeInteger(clause.amount, 0)) {
        errors.push(`${path}.perCounter.amount: expected non-negative integer`);
      }
    }
  }
}

function validateTrigger(value: unknown, path: string, errors: string[]): void {
  if (!object(value)) {
    errors.push(`${path}: expected trigger`);
    return;
  }
  switch (value.kind) {
    case "resolve":
    case "enter-area":
    case "leave-area":
      exactKeys(value, path, ["kind"], [], errors);
      return;
    case "turn-start":
    case "turn-end":
      exactKeys(value, path, ["kind", "subject"], ["offsetTurns", "everyTurns"], errors);
      if (value.subject !== "source" && value.subject !== "target") {
        errors.push(`${path}.subject: invalid subject`);
      }
      if (Object.hasOwn(value, "offsetTurns") && !safeInteger(value.offsetTurns, 0)) {
        errors.push(`${path}.offsetTurns: expected non-negative integer`);
      }
      if (Object.hasOwn(value, "everyTurns") && !safeInteger(value.everyTurns, 1)) {
        errors.push(`${path}.everyTurns: expected positive integer`);
      }
      return;
    case "activate":
      exactKeys(value, path, ["kind", "action"], [], errors);
      if (!new Set(["action", "bonus", "reaction", "free"]).has(value.action as string)) {
        errors.push(`${path}.action: invalid action`);
      }
      return;
    case "source-end":
      exactKeys(value, path, ["kind", "phaseId"], [], errors);
      validateId(value.phaseId, `${path}.phaseId`, errors);
      return;
    case "layer-destroyed":
      exactKeys(value, path, ["kind", "layerId"], [], errors);
      validateId(value.layerId, `${path}.layerId`, errors);
      return;
    case "manual":
      exactKeys(value, path, ["kind", "eventId"], [], errors);
      validateId(value.eventId, `${path}.eventId`, errors);
      return;
    default:
      errors.push(`${path}.kind: invalid trigger kind`);
  }
}

function validateGateAbility(value: unknown, path: string, errors: string[]): void {
  if (!Array.isArray(value)) {
    if (!ABILITIES.has(value as string)) errors.push(`${path}: invalid ability`);
    return;
  }
  if (value.length === 0) {
    errors.push(`${path}: expected a non-empty allowed ability set`);
    return;
  }
  const seen = new Set<string>();
  value.forEach((ability, index) => {
    if (!ABILITIES.has(ability as string)) {
      errors.push(`${path}[${index}]: invalid ability`);
    } else if (seen.has(ability as string)) {
      errors.push(`${path}[${index}]: duplicate ability`);
    }
    if (typeof ability === "string") seen.add(ability);
  });
}

function validateGate(value: unknown, path: string, errors: string[]): void {
  if (!object(value)) {
    errors.push(`${path}: expected gate`);
    return;
  }
  if (value.kind === "attack") {
    exactKeys(value, path, ["id", "kind", "scope"], ["attackType", "when"], errors);
    if (
      Object.hasOwn(value, "attackType") &&
      value.attackType !== "melee" &&
      value.attackType !== "ranged"
    ) {
      errors.push(`${path}.attackType: invalid attack type`);
    }
  } else if (value.kind === "save") {
    exactKeys(
      value,
      path,
      ["id", "kind", "scope", "ability"],
      ["dc", "when", "sizeAdvantage"],
      errors
    );
    validateGateAbility(value.ability, `${path}.ability`, errors);
    if (Object.hasOwn(value, "dc")) validateBoundValue(value.dc, `${path}.dc`, errors);
  } else if (value.kind === "check") {
    exactKeys(
      value,
      path,
      ["id", "kind", "scope", "ability", "dc"],
      ["skill", "when", "sizeAdvantage"],
      errors
    );
    validateGateAbility(value.ability, `${path}.ability`, errors);
    validateBoundValue(value.dc, `${path}.dc`, errors);
    if (Object.hasOwn(value, "skill"))
      validateSkill(value.skill, `${path}.skill`, errors);
  } else {
    errors.push(`${path}.kind: invalid gate kind`);
    return;
  }
  validateId(value.id, `${path}.id`, errors);
  validateScope(value.scope, `${path}.scope`, errors);
  if (Object.hasOwn(value, "when")) validatePredicate(value.when, `${path}.when`, errors);
  if (Object.hasOwn(value, "sizeAdvantage")) {
    validateSizeAdvantage(value.sizeAdvantage, `${path}.sizeAdvantage`, errors);
  }
}

function validateInput(value: unknown, path: string, errors: string[]): void {
  if (!object(value)) {
    errors.push(`${path}: expected input`);
    return;
  }
  if (value.kind === "roll" || value.kind === "table-roll") {
    exactKeys(
      value,
      path,
      ["id", "kind", "scope", "roll"],
      ["when", "rerollValues"],
      errors
    );
    validateRollSpec(value.roll, `${path}.roll`, errors);
    if (Object.hasOwn(value, "rerollValues")) {
      if (value.kind !== "table-roll") {
        errors.push(`${path}.rerollValues: only table rolls author reroll values`);
      }
      if (!Array.isArray(value.rerollValues) || value.rerollValues.length === 0) {
        errors.push(`${path}.rerollValues: expected non-empty faces`);
      } else if (object(value.roll) && safeInteger(value.roll.sides, 2)) {
        const sides = value.roll.sides;
        const seen = new Set<number>();
        value.rerollValues.forEach((face, index) => {
          if (!safeInteger(face, 1) || face > sides) {
            errors.push(`${path}.rerollValues[${index}]: invalid die face`);
          } else if (seen.has(face)) {
            errors.push(`${path}.rerollValues[${index}]: duplicate face`);
          }
          if (typeof face === "number") seen.add(face);
        });
        if (seen.size === sides) {
          errors.push(`${path}.rerollValues: policy must leave an accepted face`);
        }
      }
    }
  } else if (value.kind === "choice") {
    exactKeys(value, path, ["id", "kind", "scope", "options"], ["when"], errors);
    if (!Array.isArray(value.options) || value.options.length < 2) {
      errors.push(`${path}.options: expected at least two choices`);
    } else {
      const seen = new Set<string>();
      value.options.forEach((option, index) => {
        if (!validId(option)) errors.push(`${path}.options[${index}]: invalid stable id`);
        if (typeof option === "string" && seen.has(option)) {
          errors.push(`${path}.options[${index}]: duplicate choice`);
        }
        if (typeof option === "string") seen.add(option);
      });
    }
  } else {
    errors.push(`${path}.kind: invalid input kind`);
    return;
  }
  validateId(value.id, `${path}.id`, errors);
  validateScope(value.scope, `${path}.scope`, errors);
  if (Object.hasOwn(value, "when")) validatePredicate(value.when, `${path}.when`, errors);
}

function validateAmountTerm(value: unknown, path: string, errors: string[]): void {
  if (!object(value)) {
    errors.push(`${path}: expected amount term`);
    return;
  }
  const transforms = ["multiplier", "add", "rounding"];
  if (value.kind === "fixed") {
    exactKeys(value, path, ["kind", "value"], transforms, errors);
    if (!safeInteger(value.value, 0))
      errors.push(`${path}.value: expected non-negative integer`);
  } else if (value.kind === "input") {
    exactKeys(value, path, ["kind", "inputId"], transforms, errors);
    validateId(value.inputId, `${path}.inputId`, errors);
  } else if (value.kind === "counter") {
    exactKeys(value, path, ["kind", "counterId"], transforms, errors);
    validateId(value.counterId, `${path}.counterId`, errors);
  } else if (value.kind === "scaled") {
    exactKeys(value, path, ["kind", "value"], transforms, errors);
    validateScaledValue(value.value, `${path}.value`, errors);
  } else if (value.kind === "binding") {
    exactKeys(value, path, ["kind", "binding"], transforms, errors);
    validateBinding(value.binding, `${path}.binding`, errors);
  } else {
    errors.push(`${path}.kind: invalid amount term kind`);
    return;
  }
  if (Object.hasOwn(value, "multiplier") && !finite(value.multiplier, 0)) {
    errors.push(`${path}.multiplier: expected non-negative finite number`);
  }
  if (Object.hasOwn(value, "add") && !safeInteger(value.add)) {
    errors.push(`${path}.add: expected safe integer`);
  }
  if (
    Object.hasOwn(value, "rounding") &&
    value.rounding !== "floor" &&
    value.rounding !== "ceil"
  ) {
    errors.push(`${path}.rounding: invalid rounding policy`);
  }
}

function validateAmount(value: unknown, path: string, errors: string[]): void {
  if (!object(value)) {
    errors.push(`${path}: expected amount`);
    return;
  }
  if (value.kind !== "sum") {
    validateAmountTerm(value, path, errors);
    return;
  }
  exactKeys(value, path, ["kind", "terms"], ["multiplier", "add", "rounding"], errors);
  if (
    !Array.isArray(value.terms) ||
    value.terms.length < 2 ||
    value.terms.length > MAX_AMOUNT_TERMS
  ) {
    errors.push(`${path}.terms: expected 2..${MAX_AMOUNT_TERMS} amount terms`);
  } else {
    value.terms.forEach((term, index) =>
      validateAmountTerm(term, `${path}.terms[${index}]`, errors)
    );
  }
  if (Object.hasOwn(value, "multiplier") && !finite(value.multiplier, 0)) {
    errors.push(`${path}.multiplier: expected non-negative finite number`);
  }
  if (Object.hasOwn(value, "add") && !safeInteger(value.add)) {
    errors.push(`${path}.add: expected safe integer`);
  }
  if (
    Object.hasOwn(value, "rounding") &&
    value.rounding !== "floor" &&
    value.rounding !== "ceil"
  ) {
    errors.push(`${path}.rounding: invalid rounding policy`);
  }
}

function validateDamageType(value: unknown, path: string, errors: string[]): void {
  if (!object(value)) {
    errors.push(`${path}: expected damage type spec`);
    return;
  }
  if (value.kind === "fixed") {
    exactKeys(value, path, ["kind", "damageType"], [], errors);
    if (!DAMAGE_TYPES.has(value.damageType as string)) {
      errors.push(`${path}.damageType: invalid damage type`);
    }
  } else if (value.kind === "choice") {
    exactKeys(value, path, ["kind", "inputId"], [], errors);
    validateId(value.inputId, `${path}.inputId`, errors);
  } else if (value.kind === "table") {
    exactKeys(value, path, ["kind", "inputId", "rows"], [], errors);
    validateId(value.inputId, `${path}.inputId`, errors);
    if (!Array.isArray(value.rows) || value.rows.length === 0) {
      errors.push(`${path}.rows: expected non-empty table`);
    } else {
      value.rows.forEach((row, index) => {
        const rowPath = `${path}.rows[${index}]`;
        if (!object(row)) {
          errors.push(`${rowPath}: expected table row`);
          return;
        }
        exactKeys(row, rowPath, ["min", "max", "damageType"], [], errors);
        if (!safeInteger(row.min) || !safeInteger(row.max) || row.min > row.max) {
          errors.push(`${rowPath}: invalid inclusive range`);
        }
        if (!DAMAGE_TYPES.has(row.damageType as string)) {
          errors.push(`${rowPath}.damageType: invalid damage type`);
        }
      });
    }
  } else {
    errors.push(`${path}.kind: invalid damage type kind`);
  }
}

function validateComparison(value: unknown, path: string, errors: string[]): void {
  if (!new Set(["eq", "ne", "lt", "lte", "gt", "gte"]).has(value as string)) {
    errors.push(`${path}: invalid comparison`);
  }
}

function validatePredicate(value: unknown, path: string, errors: string[]): void {
  if (!object(value)) {
    errors.push(`${path}: expected predicate`);
    return;
  }
  switch (value.kind) {
    case "gate":
      exactKeys(value, path, ["kind", "gateId", "result"], [], errors);
      validateId(value.gateId, `${path}.gateId`, errors);
      if (
        !new Set(["hit", "miss", "critical-hit", "success", "failure"]).has(
          value.result as string
        )
      ) {
        errors.push(`${path}.result: invalid gate result`);
      }
      return;
    case "choice":
      exactKeys(value, path, ["kind", "inputId", "equals"], [], errors);
      validateId(value.inputId, `${path}.inputId`, errors);
      validateId(value.equals, `${path}.equals`, errors);
      return;
    case "table-roll":
      exactKeys(value, path, ["kind", "inputId", "min", "max"], [], errors);
      validateId(value.inputId, `${path}.inputId`, errors);
      if (!safeInteger(value.min) || !safeInteger(value.max) || value.min > value.max) {
        errors.push(`${path}: invalid table-roll range`);
      }
      return;
    case "counter":
      exactKeys(value, path, ["kind", "counterId", "comparison", "value"], [], errors);
      validateId(value.counterId, `${path}.counterId`, errors);
      validateComparison(value.comparison, `${path}.comparison`, errors);
      if (!safeInteger(value.value)) errors.push(`${path}.value: expected safe integer`);
      return;
    case "layer":
      exactKeys(value, path, ["kind", "layerId", "state"], [], errors);
      validateId(value.layerId, `${path}.layerId`, errors);
      if (value.state !== "active" && value.state !== "destroyed") {
        errors.push(`${path}.state: invalid layer state`);
      }
      return;
    case "trigger-fact":
      if (value.fact === "attack-result") {
        exactKeys(value, path, ["kind", "fact", "equals"], [], errors);
        if (value.equals !== "hit" && value.equals !== "miss") {
          errors.push(`${path}.equals: invalid attack result`);
        }
      } else if (value.fact === "attack-critical") {
        exactKeys(value, path, ["kind", "fact", "equals"], [], errors);
        if (typeof value.equals !== "boolean") {
          errors.push(`${path}.equals: expected boolean`);
        }
      } else if (
        value.fact === "triggering-damage" ||
        value.fact === "triggering-range"
      ) {
        exactKeys(value, path, ["kind", "fact", "comparison", "value"], [], errors);
        validateComparison(value.comparison, `${path}.comparison`, errors);
        if (!safeInteger(value.value, 0)) {
          errors.push(`${path}.value: expected non-negative integer`);
        }
      } else if (
        value.fact === "triggering-damage-source" ||
        value.fact === "triggering-damage-type"
      ) {
        exactKeys(value, path, ["kind", "fact", "equals"], [], errors);
        if (value.fact === "triggering-damage-type") {
          if (!DAMAGE_TYPES.has(value.equals as string)) {
            errors.push(`${path}.equals: invalid damage type`);
          }
        } else {
          validateId(value.equals, `${path}.equals`, errors);
        }
      } else {
        errors.push(`${path}.fact: invalid trigger fact`);
      }
      return;
    case "state":
      exactKeys(
        value,
        path,
        ["kind", "subject", "field", "comparison", "value"],
        [],
        errors
      );
      validateSubject(value.subject, `${path}.subject`, errors);
      if (!new Set(["hp", "max-hp", "temp-hp"]).has(value.field as string)) {
        errors.push(`${path}.field: invalid state field`);
      }
      validateComparison(value.comparison, `${path}.comparison`, errors);
      if (!safeInteger(value.value, 0))
        errors.push(`${path}.value: expected non-negative integer`);
      return;
    case "resource":
      exactKeys(
        value,
        path,
        ["kind", "subject", "resourceId", "comparison", "value"],
        [],
        errors
      );
      validateSubject(value.subject, `${path}.subject`, errors);
      validateId(value.resourceId, `${path}.resourceId`, errors);
      validateComparison(value.comparison, `${path}.comparison`, errors);
      if (!safeInteger(value.value, 0))
        errors.push(`${path}.value: expected non-negative integer`);
      return;
    case "condition":
      exactKeys(value, path, ["kind", "subject", "condition", "present"], [], errors);
      validateSubject(value.subject, `${path}.subject`, errors);
      if (!CONDITIONS.has(value.condition as ConditionId)) {
        errors.push(`${path}.condition: invalid condition`);
      }
      if (typeof value.present !== "boolean")
        errors.push(`${path}.present: expected boolean`);
      return;
    case "standing":
      exactKeys(value, path, ["kind", "subject", "effectId", "present"], [], errors);
      validateSubject(value.subject, `${path}.subject`, errors);
      validateId(value.effectId, `${path}.effectId`, errors);
      if (typeof value.present !== "boolean")
        errors.push(`${path}.present: expected boolean`);
      return;
    case "stable":
      exactKeys(value, path, ["kind", "subject", "value"], [], errors);
      validateSubject(value.subject, `${path}.subject`, errors);
      if (typeof value.value !== "boolean")
        errors.push(`${path}.value: expected boolean`);
      return;
    case "landed-damage":
      exactKeys(value, path, ["kind", "stepId", "comparison", "value"], [], errors);
      validateId(value.stepId, `${path}.stepId`, errors);
      validateComparison(value.comparison, `${path}.comparison`, errors);
      if (!safeInteger(value.value, 0))
        errors.push(`${path}.value: expected non-negative integer`);
      return;
    case "not":
      exactKeys(value, path, ["kind", "predicate"], [], errors);
      validatePredicate(value.predicate, `${path}.predicate`, errors);
      return;
    case "all":
    case "any":
      exactKeys(value, path, ["kind", "predicates"], [], errors);
      if (!Array.isArray(value.predicates) || value.predicates.length === 0) {
        errors.push(`${path}.predicates: expected non-empty predicates`);
      } else {
        value.predicates.forEach((entry, index) =>
          validatePredicate(entry, `${path}.predicates[${index}]`, errors)
        );
      }
      return;
    default:
      errors.push(`${path}.kind: invalid predicate kind`);
  }
}

function validateSubject(value: unknown, path: string, errors: string[]): void {
  if (
    value !== "source" &&
    value !== "target" &&
    !PARTICIPANT_ROLES.has(value as CombatEffectParticipantRole)
  ) {
    errors.push(`${path}: invalid subject`);
  }
}

function validateTargeting(value: unknown, path: string, errors: string[]): void {
  if (!object(value)) {
    errors.push(`${path}: expected targeting`);
    return;
  }
  exactKeys(
    value,
    path,
    ["affinity"],
    ["excludeSelf", "maxTargets", "maxTargetsPerUpcast", "sharedAmount"],
    errors
  );
  if (!new Set(["ally", "enemy", "self", "any"]).has(value.affinity as string)) {
    errors.push(`${path}.affinity: invalid affinity`);
  }
  for (const field of ["excludeSelf", "sharedAmount"] as const) {
    if (Object.hasOwn(value, field) && typeof value[field] !== "boolean") {
      errors.push(`${path}.${field}: expected boolean`);
    }
  }
  for (const field of ["maxTargets", "maxTargetsPerUpcast"] as const) {
    if (Object.hasOwn(value, field) && !safeInteger(value[field], 1)) {
      errors.push(`${path}.${field}: expected positive integer`);
    }
  }
}

function validateGateUse(value: unknown, path: string, errors: string[]): void {
  if (!object(value)) {
    errors.push(`${path}: expected gate use`);
    return;
  }
  exactKeys(value, path, ["gateId", "pass", "otherwise"], [], errors);
  validateId(value.gateId, `${path}.gateId`, errors);
  if (!new Set(["hit", "miss", "success", "failure"]).has(value.pass as string)) {
    errors.push(`${path}.pass: invalid pass result`);
  }
  if (value.otherwise !== "skip" && value.otherwise !== "half") {
    errors.push(`${path}.otherwise: invalid failure outcome`);
  }
}

function validateLifetime(value: unknown, path: string, errors: string[]): void {
  if (!object(value)) {
    errors.push(`${path}: expected lifetime`);
    return;
  }
  if (value.kind === "source-end" || value.kind === "manual") {
    exactKeys(value, path, ["kind"], [], errors);
  } else if (value.kind === "phase-end") {
    exactKeys(value, path, ["kind", "phaseId"], [], errors);
    validateId(value.phaseId, `${path}.phaseId`, errors);
  } else if (value.kind === "turn-boundary") {
    exactKeys(value, path, ["kind", "subject", "phase", "offsetTurns"], [], errors);
    validateSubject(value.subject, `${path}.subject`, errors);
    if (value.phase !== "turn-start" && value.phase !== "turn-end") {
      errors.push(`${path}.phase: invalid turn boundary`);
    }
    if (!safeInteger(value.offsetTurns, 0)) {
      errors.push(`${path}.offsetTurns: expected non-negative integer`);
    }
  } else if (value.kind === "elapsed") {
    exactKeys(value, path, ["kind", "amount", "unit"], [], errors);
    if (!safeInteger(value.amount, 1)) {
      errors.push(`${path}.amount: expected positive integer`);
    }
    if (!new Set(["round", "minute", "hour", "day"]).has(value.unit as string)) {
      errors.push(`${path}.unit: invalid elapsed-time unit`);
    }
  } else {
    errors.push(`${path}.kind: invalid lifetime kind`);
  }
}

function validateStep(value: unknown, path: string, errors: string[]): void {
  if (!object(value)) {
    errors.push(`${path}: expected step`);
    return;
  }
  const base = ["id", "kind", "scope"];
  const optionalBase = ["when"];
  switch (value.kind) {
    case "damage":
      exactKeys(
        value,
        path,
        [...base, "subject", "amount", "damageType"],
        [...optionalBase, "damageSource", "gate", "packetId"],
        errors
      );
      validateSubject(value.subject, `${path}.subject`, errors);
      validateAmount(value.amount, `${path}.amount`, errors);
      validateDamageType(value.damageType, `${path}.damageType`, errors);
      if (
        Object.hasOwn(value, "damageSource") &&
        !DAMAGE_SOURCES.has(value.damageSource as string)
      ) {
        errors.push(`${path}.damageSource: invalid damage source`);
      }
      if (Object.hasOwn(value, "gate"))
        validateGateUse(value.gate, `${path}.gate`, errors);
      if (Object.hasOwn(value, "packetId")) {
        validateId(value.packetId, `${path}.packetId`, errors);
      }
      break;
    case "heal":
    case "temp-hp":
      exactKeys(value, path, [...base, "subject", "amount"], optionalBase, errors);
      validateSubject(value.subject, `${path}.subject`, errors);
      validateAmount(value.amount, `${path}.amount`, errors);
      break;
    case "layer":
      exactKeys(value, path, [...base, "layerId", "operation"], optionalBase, errors);
      validateId(value.layerId, `${path}.layerId`, errors);
      if (value.operation !== "destroy" && value.operation !== "restore") {
        errors.push(`${path}.operation: invalid layer operation`);
      }
      break;
    case "damage-reduction":
      exactKeys(
        value,
        path,
        [...base, "subject", "amount"],
        [...optionalBase, "damageTypes"],
        errors
      );
      validateSubject(value.subject, `${path}.subject`, errors);
      validateAmount(value.amount, `${path}.amount`, errors);
      if (Object.hasOwn(value, "damageTypes")) {
        if (!Array.isArray(value.damageTypes) || value.damageTypes.length === 0) {
          errors.push(`${path}.damageTypes: expected non-empty damage types`);
        } else {
          const seen = new Set<string>();
          value.damageTypes.forEach((damageType, index) => {
            if (!DAMAGE_TYPES.has(damageType as string)) {
              errors.push(`${path}.damageTypes[${index}]: invalid damage type`);
            } else if (seen.has(damageType as string)) {
              errors.push(`${path}.damageTypes[${index}]: duplicate damage type`);
            }
            if (typeof damageType === "string") seen.add(damageType);
          });
        }
      }
      break;
    case "area-state":
      exactKeys(
        value,
        path,
        [...base, "operation", "fact"],
        [...optionalBase, "lifetime"],
        errors
      );
      if (value.operation !== "apply" && value.operation !== "remove") {
        errors.push(`${path}.operation: invalid area-state operation`);
      }
      if (!AREA_FACTS.has(value.fact as string)) {
        errors.push(`${path}.fact: invalid area-state fact`);
      }
      if (Object.hasOwn(value, "lifetime")) {
        validateLifetime(value.lifetime, `${path}.lifetime`, errors);
        if (value.operation !== "apply") {
          errors.push(`${path}.lifetime: only an applied area fact owns a lifetime`);
        }
      }
      break;
    case "relocation-event":
      exactKeys(
        value,
        path,
        [...base, "subject", "mode", "destination"],
        optionalBase,
        errors
      );
      validateSubject(value.subject, `${path}.subject`, errors);
      if (value.mode !== "teleport" && value.mode !== "plane-transfer") {
        errors.push(`${path}.mode: invalid relocation mode`);
      }
      if (!object(value.destination)) {
        errors.push(`${path}.destination: expected destination review`);
      } else if (value.destination.kind === "manual") {
        exactKeys(value.destination, `${path}.destination`, ["kind"], [], errors);
      } else if (value.destination.kind === "table") {
        exactKeys(
          value.destination,
          `${path}.destination`,
          ["kind", "inputId"],
          [],
          errors
        );
        validateId(value.destination.inputId, `${path}.destination.inputId`, errors);
      } else {
        errors.push(`${path}.destination.kind: invalid destination review`);
      }
      break;
    case "condition":
      exactKeys(
        value,
        path,
        [...base, "subject", "operation", "condition"],
        [...optionalBase, "lifetime"],
        errors
      );
      validateSubject(value.subject, `${path}.subject`, errors);
      if (value.operation !== "apply" && value.operation !== "remove") {
        errors.push(`${path}.operation: invalid condition operation`);
      }
      if (!CONDITIONS.has(value.condition as ConditionId)) {
        errors.push(`${path}.condition: invalid condition`);
      }
      if (Object.hasOwn(value, "lifetime")) {
        validateLifetime(value.lifetime, `${path}.lifetime`, errors);
        if (value.operation !== "apply") {
          errors.push(`${path}.lifetime: only an applied condition owns a lifetime`);
        }
      }
      break;
    case "standing":
      exactKeys(
        value,
        path,
        [...base, "subject", "operation", "effectId"],
        [...optionalBase, "lifetime"],
        errors
      );
      validateSubject(value.subject, `${path}.subject`, errors);
      if (value.operation !== "start" && value.operation !== "end") {
        errors.push(`${path}.operation: invalid standing operation`);
      }
      validateId(value.effectId, `${path}.effectId`, errors);
      if (Object.hasOwn(value, "lifetime")) {
        validateLifetime(value.lifetime, `${path}.lifetime`, errors);
        if (value.operation !== "start") {
          errors.push(`${path}.lifetime: only a started standing effect owns a lifetime`);
        }
      }
      break;
    case "resource":
      exactKeys(
        value,
        path,
        [...base, "subject", "operation", "resourceId", "amount"],
        optionalBase,
        errors
      );
      validateSubject(value.subject, `${path}.subject`, errors);
      if (value.operation !== "spend" && value.operation !== "gain") {
        errors.push(`${path}.operation: invalid resource operation`);
      }
      validateId(value.resourceId, `${path}.resourceId`, errors);
      validateAmount(value.amount, `${path}.amount`, errors);
      break;
    case "stabilize":
      exactKeys(value, path, [...base, "subject"], optionalBase, errors);
      validateSubject(value.subject, `${path}.subject`, errors);
      break;
    case "counter":
      exactKeys(
        value,
        path,
        [...base, "counterId", "operation", "amount"],
        optionalBase,
        errors
      );
      validateId(value.counterId, `${path}.counterId`, errors);
      if (value.operation !== "add" && value.operation !== "set") {
        errors.push(`${path}.operation: invalid counter operation`);
      }
      validateAmount(value.amount, `${path}.amount`, errors);
      break;
    case "end-program":
      exactKeys(value, path, base, optionalBase, errors);
      break;
    case "heal-from-landed-damage":
      exactKeys(
        value,
        path,
        [...base, "subject", "damageStepIds", "fraction"],
        optionalBase,
        errors
      );
      validateSubject(value.subject, `${path}.subject`, errors);
      if (!Array.isArray(value.damageStepIds) || value.damageStepIds.length === 0) {
        errors.push(`${path}.damageStepIds: expected non-empty references`);
      } else {
        const seen = new Set<string>();
        value.damageStepIds.forEach((id, index) => {
          validateId(id, `${path}.damageStepIds[${index}]`, errors);
          if (typeof id === "string" && seen.has(id)) {
            errors.push(`${path}.damageStepIds[${index}]: duplicate reference`);
          }
          if (typeof id === "string") seen.add(id);
        });
      }
      if (!finite(value.fraction, Number.MIN_VALUE) || value.fraction > 1) {
        errors.push(`${path}.fraction: expected finite value in (0, 1]`);
      }
      break;
    default:
      errors.push(`${path}.kind: invalid step kind`);
      return;
  }
  validateId(value.id, `${path}.id`, errors);
  validateScope(value.scope, `${path}.scope`, errors);
  if (Object.hasOwn(value, "when")) validatePredicate(value.when, `${path}.when`, errors);
}

function scopeRank(scope: CombatEffectScope): number {
  return scope === "program" ? 0 : scope === "target" ? 1 : 2;
}

interface ProgramRefs {
  gates: Map<string, CombatEffectGate>;
  inputs: Map<string, CombatEffectInput>;
  counters: Map<string, { id: string; initial: number; scope?: CombatEffectScope }>;
  layers: Map<string, CombatEffectLayer>;
  phases: Set<string>;
  steps: Map<string, { step: CombatEffectStep; phaseId: string; index: number }>;
}

function collectProgramRefs(program: CombatEffectProgram, errors: string[]): ProgramRefs {
  const gates = new Map<string, CombatEffectGate>();
  const inputs = new Map<string, CombatEffectInput>();
  const counters = new Map<
    string,
    { id: string; initial: number; scope?: CombatEffectScope }
  >();
  const layers = new Map<string, CombatEffectLayer>();
  const phases = new Set<string>();
  const steps = new Map<
    string,
    { step: CombatEffectStep; phaseId: string; index: number }
  >();
  const all = new Map<string, string>();
  const register = (id: string, path: string) => {
    const prior = all.get(id);
    if (prior) errors.push(`${path}: duplicate id (already used at ${prior})`);
    else all.set(id, path);
  };

  register(program.id, "program.id");

  for (const [index, gate] of (program.gates ?? []).entries()) {
    register(gate.id, `program.gates[${index}].id`);
    gates.set(gate.id, gate);
  }
  for (const [index, input] of (program.inputs ?? []).entries()) {
    register(input.id, `program.inputs[${index}].id`);
    inputs.set(input.id, input);
  }
  for (const [index, counter] of (program.counters ?? []).entries()) {
    register(counter.id, `program.counters[${index}].id`);
    counters.set(counter.id, counter);
  }
  for (const [index, layer] of (program.layers ?? []).entries()) {
    register(layer.id, `program.layers[${index}].id`);
    layers.set(layer.id, layer);
  }
  for (const [phaseIndex, phase] of program.phases.entries()) {
    register(phase.id, `program.phases[${phaseIndex}].id`);
    phases.add(phase.id);
    if (phase.repeat) {
      register(phase.repeat.id, `program.phases[${phaseIndex}].repeat.id`);
    }
    phase.steps.forEach((step, stepIndex) => {
      register(step.id, `program.phases[${phaseIndex}].steps[${stepIndex}].id`);
      steps.set(step.id, { step, phaseId: phase.id, index: stepIndex });
    });
  }
  return { gates, inputs, counters, layers, phases, steps };
}

function validateScopeRef(
  refScope: CombatEffectScope,
  useScope: CombatEffectScope,
  path: string,
  errors: string[]
): void {
  if (scopeRank(refScope) > scopeRank(useScope)) {
    errors.push(`${path}: ${refScope} reference is unavailable from ${useScope} scope`);
  }
}

function validateAmountRefs(
  amount: CombatEffectAmountSpec,
  useScope: CombatEffectScope,
  path: string,
  refs: ProgramRefs,
  errors: string[]
): void {
  if (amount.kind === "sum") {
    amount.terms.forEach((term, index) =>
      validateAmountRefs(term, useScope, `${path}.terms[${index}]`, refs, errors)
    );
    return;
  }
  if (amount.kind === "input") {
    const input = refs.inputs.get(amount.inputId);
    if (!input) errors.push(`${path}.inputId: missing input reference`);
    else {
      validateScopeRef(input.scope, useScope, `${path}.inputId`, errors);
      if (input.kind === "choice") errors.push(`${path}.inputId: choice is not numeric`);
    }
  } else if (amount.kind === "counter") {
    const counter = refs.counters.get(amount.counterId);
    if (!counter) {
      errors.push(`${path}.counterId: missing counter reference`);
    } else {
      validateScopeRef(counter.scope ?? "program", useScope, `${path}.counterId`, errors);
    }
  } else if (amount.kind === "scaled") {
    validateScaledValueRefs(amount.value, `${path}.value`, refs, errors);
  }
}

function validateScaledValueRefs(
  value: CombatEffectScaledValue,
  path: string,
  refs: ProgramRefs,
  errors: string[]
): void {
  if (value.perCounter) {
    const counter = refs.counters.get(value.perCounter.counterId);
    if (!counter) {
      errors.push(`${path}.perCounter.counterId: missing counter reference`);
    } else if ((counter.scope ?? "program") !== "program") {
      errors.push(`${path}.perCounter.counterId: scaled values require program scope`);
    }
  }
}

function validateDamageTypeRefs(
  spec: CombatEffectDamageTypeSpec,
  useScope: CombatEffectScope,
  path: string,
  refs: ProgramRefs,
  errors: string[]
): void {
  if (spec.kind === "fixed") return;
  const input = refs.inputs.get(spec.inputId);
  if (!input) {
    errors.push(`${path}.inputId: missing input reference`);
    return;
  }
  validateScopeRef(input.scope, useScope, `${path}.inputId`, errors);
  if (spec.kind === "choice") {
    if (input.kind !== "choice") {
      errors.push(`${path}.inputId: expected choice input`);
    } else if (input.options.some((option) => !DAMAGE_TYPES.has(option))) {
      errors.push(`${path}.inputId: every choice must be one damage type`);
    }
    return;
  }
  if (input.kind !== "table-roll") {
    errors.push(`${path}.inputId: expected table-roll input`);
    return;
  }
  if (typeof input.roll.count !== "number") {
    errors.push(`${path}.inputId: table-roll dice count must be fixed`);
    return;
  }
  const minimum = input.roll.count + (input.roll.bonus ?? 0);
  const maximum = input.roll.count * input.roll.sides + (input.roll.bonus ?? 0);
  const sorted = [...spec.rows].sort((a, b) => a.min - b.min);
  let cursor = minimum;
  for (const row of sorted) {
    if (row.min !== cursor) {
      errors.push(`${path}.rows: table must cover ${minimum}..${maximum} exactly once`);
      return;
    }
    cursor = row.max + 1;
  }
  if (cursor !== maximum + 1) {
    errors.push(`${path}.rows: table must cover ${minimum}..${maximum} exactly once`);
  }
}

function validateGateResult(
  gate: CombatEffectGate,
  result: CombatEffectGateResult,
  path: string,
  errors: string[]
): void {
  const valid =
    gate.kind === "attack"
      ? result === "hit" || result === "miss" || result === "critical-hit"
      : result === "success" || result === "failure";
  if (!valid) errors.push(`${path}: result does not match ${gate.kind} gate`);
}

type PredicateLeaf = Exclude<
  CombatEffectPredicate,
  { kind: "not" } | { kind: "all" | "any" }
>;

function visitPredicateLeaves(
  predicate: CombatEffectPredicate,
  path: string,
  visit: (leaf: PredicateLeaf, path: string) => void
): void {
  if (predicate.kind === "not") {
    visitPredicateLeaves(predicate.predicate, `${path}.predicate`, visit);
  } else if (predicate.kind === "all" || predicate.kind === "any") {
    predicate.predicates.forEach((entry, index) =>
      visitPredicateLeaves(entry, `${path}.predicates[${index}]`, visit)
    );
  } else {
    visit(predicate as PredicateLeaf, path);
  }
}

function validatePredicateRefs(
  predicate: CombatEffectPredicate,
  useScope: CombatEffectScope,
  path: string,
  refs: ProgramRefs,
  errors: string[],
  position?: { phaseId: string; stepIndex: number; packetId?: string }
): void {
  visitPredicateLeaves(predicate, path, (leaf, leafPath) => {
    switch (leaf.kind) {
      case "gate": {
        const gate = refs.gates.get(leaf.gateId);
        if (!gate) errors.push(`${leafPath}.gateId: missing gate reference`);
        else {
          validateScopeRef(gate.scope, useScope, `${leafPath}.gateId`, errors);
          validateGateResult(gate, leaf.result, `${leafPath}.result`, errors);
        }
        break;
      }
      case "choice": {
        const input = refs.inputs.get(leaf.inputId);
        if (!input) errors.push(`${leafPath}.inputId: missing input reference`);
        else {
          validateScopeRef(input.scope, useScope, `${leafPath}.inputId`, errors);
          if (input.kind !== "choice" || !input.options.includes(leaf.equals)) {
            errors.push(`${leafPath}: choice predicate is outside its authored options`);
          }
        }
        break;
      }
      case "table-roll": {
        const input = refs.inputs.get(leaf.inputId);
        if (!input) errors.push(`${leafPath}.inputId: missing input reference`);
        else {
          validateScopeRef(input.scope, useScope, `${leafPath}.inputId`, errors);
          if (input.kind !== "table-roll")
            errors.push(`${leafPath}.inputId: expected table-roll input`);
        }
        break;
      }
      case "counter": {
        const counter = refs.counters.get(leaf.counterId);
        if (!counter) {
          errors.push(`${leafPath}.counterId: missing counter reference`);
        } else {
          validateScopeRef(
            counter.scope ?? "program",
            useScope,
            `${leafPath}.counterId`,
            errors
          );
        }
        break;
      }
      case "layer": {
        const layer = refs.layers.get(leaf.layerId);
        if (!layer) errors.push(`${leafPath}.layerId: missing layer reference`);
        else validateScopeRef(layer.scope, useScope, `${leafPath}.layerId`, errors);
        break;
      }
      case "trigger-fact":
        break;
      case "state":
      case "resource":
      case "condition":
      case "standing":
      case "stable":
        if (leaf.subject === "target" && useScope === "program") {
          errors.push(
            `${leafPath}.subject: target state is unavailable from program scope`
          );
        }
        break;
      case "landed-damage": {
        const step = refs.steps.get(leaf.stepId);
        if (!step || step.step.kind !== "damage") {
          errors.push(`${leafPath}.stepId: expected damage-step reference`);
        } else if (
          position &&
          (step.phaseId !== position.phaseId || step.index >= position.stepIndex)
        ) {
          errors.push(`${leafPath}.stepId: damage must precede this predicate`);
        } else if (
          position?.packetId &&
          (step.step.packetId ?? step.step.id) === position.packetId
        ) {
          errors.push(`${leafPath}.stepId: damage must come from an earlier packet`);
        }
        break;
      }
    }
  });
}

function inputPredicateIsAnswerOnly(predicate: CombatEffectPredicate): boolean {
  let answerOnly = true;
  visitPredicateLeaves(predicate, "predicate", (leaf) => {
    if (
      leaf.kind !== "gate" &&
      leaf.kind !== "choice" &&
      leaf.kind !== "table-roll" &&
      leaf.kind !== "trigger-fact"
    ) {
      answerOnly = false;
    }
  });
  return answerOnly;
}

function inputIdsInPredicate(
  predicate: CombatEffectPredicate,
  out: string[] = []
): string[] {
  visitPredicateLeaves(predicate, "predicate", (leaf) => {
    if (leaf.kind === "choice" || leaf.kind === "table-roll") out.push(leaf.inputId);
  });
  return out;
}

function predicateContains(
  container: CombatEffectPredicate,
  required: CombatEffectPredicate
): boolean {
  if (JSON.stringify(canonical(container)) === JSON.stringify(canonical(required)))
    return true;
  if (required.kind === "all") {
    return required.predicates.every((entry) => predicateContains(container, entry));
  }
  if (container.kind === "all") {
    return container.predicates.some((entry) => predicateContains(entry, required));
  }
  return (
    container.kind === "table-roll" &&
    required.kind === "table-roll" &&
    container.inputId === required.inputId &&
    container.min >= required.min &&
    container.max <= required.max
  );
}

function validateProgramRefs(
  program: CombatEffectProgram,
  refs: ProgramRefs,
  errors: string[]
) {
  const gateUseScopes = new Map<string, Set<CombatEffectScope>>();
  const usedInputs = new Set<string>();
  const notePredicateUses = (
    predicate: CombatEffectPredicate,
    scope: CombatEffectScope
  ): void => {
    visitPredicateLeaves(predicate, "predicate", (leaf) => {
      if (leaf.kind === "gate") {
        const scopes = gateUseScopes.get(leaf.gateId) ?? new Set<CombatEffectScope>();
        scopes.add(scope);
        gateUseScopes.set(leaf.gateId, scopes);
      } else if (leaf.kind === "choice" || leaf.kind === "table-roll") {
        usedInputs.add(leaf.inputId);
      }
    });
  };
  const inputOrder = new Map(
    (program.inputs ?? []).map((input, index) => [input.id, index])
  );
  for (const [index, gate] of (program.gates ?? []).entries()) {
    if (!gate.when) continue;
    const path = `program.gates[${index}].when`;
    if (!inputPredicateIsAnswerOnly(gate.when)) {
      errors.push(
        `${path}: conditional gates may depend only on reviewed gate/input answers or trigger facts`
      );
    }
    validatePredicateRefs(gate.when, gate.scope, path, refs, errors);
    notePredicateUses(gate.when, gate.scope);
  }
  for (const [index, input] of (program.inputs ?? []).entries()) {
    if (!input.when) continue;
    const path = `program.inputs[${index}].when`;
    if (!inputPredicateIsAnswerOnly(input.when)) {
      errors.push(
        `${path}: conditional inputs may depend only on reviewed gate/input answers`
      );
    }
    validatePredicateRefs(input.when, input.scope, path, refs, errors);
    notePredicateUses(input.when, input.scope);
    for (const inputId of inputIdsInPredicate(input.when)) {
      const dependencyIndex = inputOrder.get(inputId);
      if (dependencyIndex === undefined || dependencyIndex >= index) {
        errors.push(`${path}: input dependencies must precede the conditional input`);
      }
    }
  }
  for (const [index, input] of (program.inputs ?? []).entries()) {
    if (input.kind === "choice" || !input.roll.critical) continue;
    const gate = refs.gates.get(input.roll.critical.gateId);
    const path = `program.inputs[${index}].roll.critical.gateId`;
    if (!gate || gate.kind !== "attack") {
      errors.push(`${path}: expected attack-gate reference`);
      continue;
    }
    validateScopeRef(gate.scope, input.scope, path, errors);
    const scopes = gateUseScopes.get(gate.id) ?? new Set<CombatEffectScope>();
    scopes.add(input.scope);
    gateUseScopes.set(gate.id, scopes);
  }
  program.phases.forEach((phase, phaseIndex) => {
    const phasePath = `program.phases[${phaseIndex}]`;
    if (
      phase.instances !== undefined &&
      !phase.steps.some((step) => step.scope === "instance")
    ) {
      errors.push(`${phasePath}.instances: requires an instance-scoped step`);
    }
    if (phase.instances !== undefined && typeof phase.instances !== "number") {
      validateScaledValueRefs(phase.instances, `${phasePath}.instances`, refs, errors);
    }
    if (phase.trigger.kind === "source-end" && !refs.phases.has(phase.trigger.phaseId)) {
      errors.push(`${phasePath}.trigger.phaseId: missing phase reference`);
    }
    if (
      phase.trigger.kind === "layer-destroyed" &&
      !refs.layers.has(phase.trigger.layerId)
    ) {
      errors.push(`${phasePath}.trigger.layerId: missing layer reference`);
    } else if (phase.trigger.kind === "layer-destroyed") {
      const layer = refs.layers.get(phase.trigger.layerId);
      if (layer?.scope !== "program") {
        errors.push(
          `${phasePath}.trigger.layerId: destruction triggers require program scope`
        );
      }
    }
    if (phase.repeat?.endWhen) {
      validatePredicateRefs(
        phase.repeat.endWhen,
        "program",
        `${phasePath}.repeat.endWhen`,
        refs,
        errors,
        { phaseId: phase.id, stepIndex: phase.steps.length }
      );
      notePredicateUses(phase.repeat.endWhen, "program");
    }
    const packetRuns = new Map<
      string,
      {
        lastIndex: number;
        scope: CombatEffectScope;
        subject: CombatEffectSubject;
        damageSource?: DamageSource;
      }
    >();
    phase.steps.forEach((step, stepIndex) => {
      if (step.kind !== "damage") return;
      const packetId = step.packetId ?? step.id;
      const prior = packetRuns.get(packetId);
      if (prior) {
        if (prior.lastIndex !== stepIndex - 1) {
          errors.push(
            `${phasePath}.steps[${stepIndex}].packetId: packet components must be contiguous`
          );
        }
        if (prior.scope !== step.scope || prior.subject !== step.subject) {
          errors.push(
            `${phasePath}.steps[${stepIndex}].packetId: packet scope and subject must match`
          );
        }
        if (prior.damageSource !== step.damageSource) {
          errors.push(
            `${phasePath}.steps[${stepIndex}].packetId: packet damage source must match`
          );
        }
      }
      packetRuns.set(packetId, {
        lastIndex: stepIndex,
        scope: step.scope,
        subject: step.subject,
        ...(step.damageSource === undefined ? {} : { damageSource: step.damageSource }),
      });
    });
    phase.steps.forEach((step, stepIndex) => {
      const path = `${phasePath}.steps[${stepIndex}]`;
      if ("subject" in step && step.subject === "target" && step.scope === "program") {
        errors.push(`${path}.subject: target is ambiguous at program scope`);
      }
      if (step.when) {
        validatePredicateRefs(step.when, step.scope, `${path}.when`, refs, errors, {
          phaseId: phase.id,
          stepIndex,
          ...(step.kind === "damage" ? { packetId: step.packetId ?? step.id } : {}),
        });
        notePredicateUses(step.when, step.scope);
      }
      const stepRefs: string[] = [];
      if (step.when) collectPredicateRequirements(step.when, stepRefs);
      if (step.kind === "damage") {
        collectAmountRequirements(step.amount, stepRefs);
        if (step.damageType.kind !== "fixed")
          stepRefs.push(`input:${step.damageType.inputId}`);
      } else if (
        step.kind === "heal" ||
        step.kind === "temp-hp" ||
        step.kind === "resource" ||
        step.kind === "counter" ||
        step.kind === "damage-reduction"
      ) {
        collectAmountRequirements(step.amount, stepRefs);
      } else if (step.kind === "relocation-event" && step.destination.kind === "table") {
        stepRefs.push(`input:${step.destination.inputId}`);
      }
      for (const reference of stepRefs) {
        if (!reference.startsWith("input:")) continue;
        const inputId = reference.slice("input:".length);
        usedInputs.add(inputId);
        const conditional = refs.inputs.get(inputId);
        if (
          conditional?.when &&
          (!step.when || !predicateContains(step.when, conditional.when))
        ) {
          errors.push(
            `${path}: use of conditional input ${conditional.id} must be dominated by its when predicate`
          );
        }
      }
      if (step.kind === "damage") {
        validateAmountRefs(step.amount, step.scope, `${path}.amount`, refs, errors);
        validateDamageTypeRefs(
          step.damageType,
          step.scope,
          `${path}.damageType`,
          refs,
          errors
        );
        if (step.amount.kind === "input") usedInputs.add(step.amount.inputId);
        if (step.damageType.kind !== "fixed") usedInputs.add(step.damageType.inputId);
        if (step.gate) {
          const gate = refs.gates.get(step.gate.gateId);
          if (!gate) errors.push(`${path}.gate.gateId: missing gate reference`);
          else {
            validateScopeRef(gate.scope, step.scope, `${path}.gate.gateId`, errors);
            validateGateResult(gate, step.gate.pass, `${path}.gate.pass`, errors);
            const scopes = gateUseScopes.get(gate.id) ?? new Set<CombatEffectScope>();
            scopes.add(step.scope);
            gateUseScopes.set(gate.id, scopes);
            if (gate.when && (!step.when || !predicateContains(step.when, gate.when))) {
              errors.push(
                `${path}: use of conditional gate ${gate.id} must be dominated by its when predicate`
              );
            }
          }
        }
      } else if (
        step.kind === "heal" ||
        step.kind === "temp-hp" ||
        step.kind === "resource" ||
        step.kind === "counter" ||
        step.kind === "damage-reduction"
      ) {
        validateAmountRefs(step.amount, step.scope, `${path}.amount`, refs, errors);
        if (step.amount.kind === "input") usedInputs.add(step.amount.inputId);
        if (step.kind === "counter") {
          const counter = refs.counters.get(step.counterId);
          if (!counter) errors.push(`${path}.counterId: missing counter reference`);
          else {
            validateScopeRef(
              counter.scope ?? "program",
              step.scope,
              `${path}.counterId`,
              errors
            );
          }
        }
      } else if (step.kind === "layer") {
        const layer = refs.layers.get(step.layerId);
        if (!layer) errors.push(`${path}.layerId: missing layer reference`);
        else validateScopeRef(layer.scope, step.scope, `${path}.layerId`, errors);
      } else if (step.kind === "relocation-event" && step.destination.kind === "table") {
        const input = refs.inputs.get(step.destination.inputId);
        if (!input || input.kind !== "table-roll") {
          errors.push(`${path}.destination.inputId: expected table-roll reference`);
        } else {
          validateScopeRef(
            input.scope,
            step.scope,
            `${path}.destination.inputId`,
            errors
          );
          usedInputs.add(input.id);
        }
      } else if (step.kind === "heal-from-landed-damage") {
        for (const [refIndex, stepId] of step.damageStepIds.entries()) {
          const damage = refs.steps.get(stepId);
          if (!damage || damage.step.kind !== "damage") {
            errors.push(
              `${path}.damageStepIds[${refIndex}]: expected damage-step reference`
            );
          } else if (damage.phaseId !== phase.id || damage.index >= stepIndex) {
            errors.push(
              `${path}.damageStepIds[${refIndex}]: damage must precede heal in this phase`
            );
          }
        }
      }
      if (
        (step.kind === "condition" ||
          step.kind === "standing" ||
          step.kind === "area-state") &&
        step.lifetime?.kind === "phase-end" &&
        !refs.phases.has(step.lifetime.phaseId)
      ) {
        errors.push(`${path}.lifetime.phaseId: missing phase reference`);
      }
    });
  });
  for (const gate of program.gates ?? []) {
    const scopes = gateUseScopes.get(gate.id);
    if (!scopes || scopes.size === 0)
      errors.push(`program.gates.${gate.id}: unused gate`);
    if (gate.scope === "program" && !scopes?.has("program")) {
      errors.push(`program.gates.${gate.id}: program gate needs a program-scoped use`);
    }
  }
  for (const input of program.inputs ?? []) {
    if (!usedInputs.has(input.id))
      errors.push(`program.inputs.${input.id}: unused input`);
    if (input.kind !== "choice" && object(input.roll.count)) {
      validateScaledValueRefs(
        input.roll.count as CombatEffectScaledValue,
        `program.inputs.${input.id}.roll.count`,
        refs,
        errors
      );
    }
  }
  validateConditionalCycles(program, errors);
  const sourceEnd = new Map(
    program.phases.flatMap((phase) =>
      phase.trigger.kind === "source-end"
        ? [[phase.id, phase.trigger.phaseId] as const]
        : []
    )
  );
  for (const start of sourceEnd.keys()) {
    const seen = new Set<string>();
    let cursor: string | undefined = start;
    while (cursor !== undefined) {
      if (seen.has(cursor)) {
        errors.push(`program.phases.${start}.trigger: cyclic source-end chain`);
        break;
      }
      seen.add(cursor);
      cursor = sourceEnd.get(cursor);
    }
  }
}

function validateConditionalCycles(program: CombatEffectProgram, errors: string[]): void {
  const edges = new Map<string, string[]>();
  const add = (key: string, predicate?: CombatEffectPredicate, criticalGate?: string) => {
    const references: string[] = [];
    if (predicate) collectPredicateRequirements(predicate, references);
    if (criticalGate) references.push(`gate:${criticalGate}`);
    edges.set(key, references);
  };
  for (const gate of program.gates ?? []) add(`gate:${gate.id}`, gate.when);
  for (const input of program.inputs ?? []) {
    add(
      `input:${input.id}`,
      input.when,
      input.kind === "choice" ? undefined : input.roll.critical?.gateId
    );
  }
  const done = new Set<string>();
  const visiting = new Set<string>();
  const visit = (key: string): void => {
    if (done.has(key)) return;
    if (visiting.has(key)) {
      errors.push(`${key}: cyclic conditional dependency`);
      return;
    }
    visiting.add(key);
    for (const dependency of edges.get(key) ?? []) {
      if (edges.has(dependency)) visit(dependency);
    }
    visiting.delete(key);
    done.add(key);
  };
  for (const key of edges.keys()) visit(key);
}

/** Strict authoring-boundary validation, including every reference and scope. */
export function validateCombatEffectProgram(
  value: unknown
): CombatEffectValidationResult {
  const errors: string[] = [];
  validateJsonPlain(value, "program", errors);
  if (errors.length) return { valid: false, errors };
  if (!object(value))
    return { valid: false, errors: [...errors, "program: expected object"] };
  exactKeys(
    value,
    "program",
    ["version", "id", "phases"],
    ["gates", "inputs", "counters", "layers"],
    errors
  );
  if (value.version !== 1) errors.push("program.version: expected 1");
  validateId(value.id, "program.id", errors);

  const optionalArrays = ["gates", "inputs", "counters", "layers"] as const;
  for (const field of optionalArrays) {
    if (
      Object.hasOwn(value, field) &&
      (!Array.isArray(value[field]) || value[field].length === 0)
    ) {
      errors.push(`program.${field}: omit or provide a non-empty array`);
    }
  }
  if (Array.isArray(value.gates)) {
    value.gates.forEach((gate, index) =>
      validateGate(gate, `program.gates[${index}]`, errors)
    );
  }
  if (Array.isArray(value.inputs)) {
    value.inputs.forEach((input, index) =>
      validateInput(input, `program.inputs[${index}]`, errors)
    );
  }
  if (Array.isArray(value.counters)) {
    value.counters.forEach((counter, index) => {
      const path = `program.counters[${index}]`;
      if (!object(counter)) {
        errors.push(`${path}: expected counter`);
        return;
      }
      exactKeys(counter, path, ["id", "initial"], ["scope"], errors);
      validateId(counter.id, `${path}.id`, errors);
      if (!safeInteger(counter.initial, 0))
        errors.push(`${path}.initial: expected non-negative integer`);
      if (Object.hasOwn(counter, "scope")) {
        validateScope(counter.scope, `${path}.scope`, errors);
      }
    });
  }
  if (Array.isArray(value.layers)) {
    value.layers.forEach((layer, index) => {
      const path = `program.layers[${index}]`;
      if (!object(layer)) {
        errors.push(`${path}: expected layer`);
        return;
      }
      exactKeys(layer, path, ["id", "scope", "initial"], [], errors);
      validateId(layer.id, `${path}.id`, errors);
      validateScope(layer.scope, `${path}.scope`, errors);
      if (layer.initial !== "active" && layer.initial !== "destroyed") {
        errors.push(`${path}.initial: invalid layer state`);
      }
    });
  }
  if (!Array.isArray(value.phases) || value.phases.length === 0) {
    errors.push("program.phases: expected non-empty phases");
  } else {
    value.phases.forEach((phase, phaseIndex) => {
      const path = `program.phases[${phaseIndex}]`;
      if (!object(phase)) {
        errors.push(`${path}: expected phase`);
        return;
      }
      exactKeys(
        phase,
        path,
        ["id", "trigger", "steps"],
        ["targeting", "instances", "repeat"],
        errors
      );
      validateId(phase.id, `${path}.id`, errors);
      validateTrigger(phase.trigger, `${path}.trigger`, errors);
      if (Object.hasOwn(phase, "targeting")) {
        validateTargeting(phase.targeting, `${path}.targeting`, errors);
      }
      if (Object.hasOwn(phase, "instances")) {
        if (typeof phase.instances === "number") {
          if (!safeInteger(phase.instances, 1) || phase.instances > MAX_REPEAT) {
            errors.push(`${path}.instances: expected 1..${MAX_REPEAT}`);
          }
        } else {
          validateScaledValue(phase.instances, `${path}.instances`, errors);
        }
      }
      if (!Array.isArray(phase.steps) || phase.steps.length === 0) {
        errors.push(`${path}.steps: expected non-empty steps`);
      } else {
        phase.steps.forEach((step, index) =>
          validateStep(step, `${path}.steps[${index}]`, errors)
        );
      }
      if (Object.hasOwn(phase, "repeat")) {
        if (!object(phase.repeat)) {
          errors.push(`${path}.repeat: expected repeat rule`);
        } else {
          exactKeys(
            phase.repeat,
            `${path}.repeat`,
            ["id", "maxOccurrences"],
            ["endWhen"],
            errors
          );
          validateId(phase.repeat.id, `${path}.repeat.id`, errors);
          if (
            !safeInteger(phase.repeat.maxOccurrences, 1) ||
            phase.repeat.maxOccurrences > MAX_REPEAT
          ) {
            errors.push(`${path}.repeat.maxOccurrences: expected 1..${MAX_REPEAT}`);
          }
          if (Object.hasOwn(phase.repeat, "endWhen")) {
            validatePredicate(phase.repeat.endWhen, `${path}.repeat.endWhen`, errors);
          }
        }
      }
    });
  }

  if (errors.length === 0) {
    const program = value as unknown as CombatEffectProgram;
    const refs = collectProgramRefs(program, errors);
    validateProgramRefs(program, refs, errors);
  }
  return { valid: errors.length === 0, errors };
}

export function assertCombatEffectProgram(
  value: unknown
): asserts value is CombatEffectProgram {
  const result = validateCombatEffectProgram(value);
  if (!result.valid)
    throw new TypeError(`Invalid combat effect program:\n${result.errors.join("\n")}`);
}

export type CombatEffectEntityRef =
  | { kind: "source"; id: string }
  | { kind: "target"; target: CombatOutcomeTarget };

export interface CombatEffectTriggerFacts {
  attack?: { result: "hit" | "miss"; critical: boolean; range?: number };
  damage?: {
    amount: number;
    sourceId: string;
    damageType?: DamageType;
    range?: number;
  };
}

export interface CombatEffectParticipantFact {
  participant: CombatEffectEntityRef;
  size: CreatureSize;
}

export interface CombatEffectBindings {
  casterSpellSaveDc?: number;
  casterSpellcastingModifier?: number;
}

export interface CombatEffectExecution {
  occurrenceId: string;
  phaseId: string;
  sourceId: string;
  targets: ReadonlyArray<CombatOutcomeTarget>;
  instances: number;
  /** One reviewed target assignment per total authored instance; duplicates are legal. */
  instanceTargets?: ReadonlyArray<CombatOutcomeTarget>;
  /** Zero-based external cadence occurrence. Non-repeating phases use 0. */
  occurrence?: number;
  castLevel?: number;
  /** Exact catalogue/action identity persisted on program-created occurrences. */
  effectSource?: ActiveCombatEffect["source"];
  /** Whether a source-end occurrence is owned by this source's Concentration. */
  sourceConcentration?: boolean;
  /** Exact deterministic clock snapshot for authored turn-boundary lifetimes. */
  encounterPosition?: EncounterPosition;
  characterLevel?: number;
  /** Current persisted program tallies; omitted counters use their authored initial value. */
  tallies?: Readonly<Record<string, number>>;
  /** Current persisted layer states; omitted layers use their authored initial state. */
  layerStates?: Readonly<Record<string, "active" | "destroyed">>;
  /** Current area facts; elapsed expiry remains owned by an external clock. */
  areaStates?: ReadonlyArray<CombatEffectAreaFact>;
  bindings?: CombatEffectBindings;
  participants?: Partial<Record<CombatEffectParticipantRole, CombatEffectEntityRef>>;
  participantFacts?: ReadonlyArray<CombatEffectParticipantFact>;
  triggerFacts?: CombatEffectTriggerFacts;
  /** Fully resolved universal D20 contexts for every scoped gate question. */
  gateContexts?: ReadonlyArray<{
    gateId: string;
    target?: CombatOutcomeTarget;
    instance?: number;
    /** Required only when the gate authors more than one allowed ability. */
    ability?: AbilityCode;
    /** Required only when the gate authors more than one allowed skill. */
    skill?: string;
    context: D20TestRequest;
  }>;
}

export interface CombatEffectDieReplacementFact {
  sourceId: string;
  resourceId?: string;
  face: number;
}

export interface CombatEffectDieFact {
  dieId: string;
  initialFace: number;
  /** Ordered replacements; the last face is the effective physical result. */
  replacements: ReadonlyArray<CombatEffectDieReplacementFact>;
}

/** Transient reviewed roll observation with exact replacement/resource provenance. */
export interface CombatEffectDiceFact {
  dice: ReadonlyArray<CombatEffectDieFact>;
  consumedResourceIds: ReadonlyArray<string>;
  total: number;
}

interface RequirementBase {
  key: string;
  refId: string;
  scope: CombatEffectScope;
  target?: CombatOutcomeTarget;
  instance?: number;
}

export type CombatEffectRequirement =
  | (RequirementBase & {
      kind: "attack";
      attackType?: "melee" | "ranged";
      context: D20TestRequest;
    })
  | (RequirementBase & {
      kind: "save";
      ability: AbilityCode;
      dc?: number;
      context: D20TestRequest;
    })
  | (RequirementBase & {
      kind: "check";
      ability: AbilityCode;
      dc: number;
      skill?: string;
      context: D20TestRequest;
    })
  | (RequirementBase & {
      kind: "roll" | "table-roll";
      roll: { count: number; sides: number; bonus: number };
      rerollValues?: ReadonlyArray<number>;
    })
  | (RequirementBase & {
      kind: "choice";
      options: ReadonlyArray<string>;
    });

export interface CombatEffectProvidedAnswer {
  key: string;
  value: D20TestResult | CombatEffectDiceFact | string;
}

export type ReviewedCombatEffectAnswer = CombatEffectRequirement & {
  value: D20TestResult | CombatEffectDiceFact | string;
};

/**
 * Transient review snapshot. It embeds the validated program so one planning
 * attempt is immutable; do not persist it in character state or treat it as a
 * durable cursor/fingerprint across catalogue changes. This module deliberately
 * exposes no durable lifecycle-state API yet.
 */
export interface ReviewedCombatEffectArtifact {
  schema: 1;
  program: CombatEffectProgram;
  occurrenceId: string;
  phaseId: string;
  trigger: CombatEffectTrigger;
  sourceId: string;
  targets: ReadonlyArray<CombatOutcomeTarget>;
  instances: number;
  instanceTargets?: ReadonlyArray<CombatOutcomeTarget>;
  occurrence: number;
  castLevel?: number;
  effectSource?: ActiveCombatEffect["source"];
  sourceConcentration?: boolean;
  encounterPosition?: EncounterPosition;
  characterLevel?: number;
  tallies: Readonly<Record<string, number>>;
  layerStates?: Readonly<Record<string, "active" | "destroyed">>;
  areaStates?: ReadonlyArray<CombatEffectAreaFact>;
  bindings?: CombatEffectBindings;
  participants?: Partial<Record<CombatEffectParticipantRole, CombatEffectEntityRef>>;
  participantFacts?: ReadonlyArray<CombatEffectParticipantFact>;
  triggerFacts?: CombatEffectTriggerFacts;
  gateContexts: ReadonlyArray<{
    gateId: string;
    target?: CombatOutcomeTarget;
    instance?: number;
    ability?: AbilityCode;
    skill?: string;
    context: D20TestRequest;
  }>;
  answers: ReadonlyArray<ReviewedCombatEffectAnswer>;
}

function runtimeId(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 256) {
    throw new TypeError(`${path}: expected non-empty runtime id`);
  }
}

function validateRuntimeTarget(value: unknown, path: string): CombatOutcomeTarget {
  if (!object(value)) throw new TypeError(`${path}: expected target`);
  const errors: string[] = [];
  exactKeys(value, path, ["combatantId"], [], errors);
  validateJsonPlain(value, path, errors);
  if (errors.length) throw new TypeError(errors.join("\n"));
  runtimeId(value.combatantId, `${path}.combatantId`);
  return value as unknown as CombatOutcomeTarget;
}

function validateEntityRef(value: unknown, path: string): CombatEffectEntityRef {
  if (!object(value)) throw new TypeError(`${path}: expected participant reference`);
  const errors: string[] = [];
  if (value.kind === "source") {
    exactKeys(value, path, ["kind", "id"], [], errors);
    if (errors.length) throw new TypeError(errors.join("\n"));
    runtimeId(value.id, `${path}.id`);
  } else if (value.kind === "target") {
    exactKeys(value, path, ["kind", "target"], [], errors);
    if (errors.length) throw new TypeError(errors.join("\n"));
    validateRuntimeTarget(value.target, `${path}.target`);
  } else {
    throw new TypeError(`${path}.kind: invalid participant reference`);
  }
  return value as unknown as CombatEffectEntityRef;
}

function bindingValue(
  binding: CombatEffectBinding,
  execution: Pick<CombatEffectExecution, "bindings" | "triggerFacts">
): number {
  const value =
    binding === "caster-spell-save-dc"
      ? execution.bindings?.casterSpellSaveDc
      : binding === "caster-spellcasting-modifier"
        ? execution.bindings?.casterSpellcastingModifier
        : execution.triggerFacts?.damage?.amount;
  if (!safeInteger(value, binding === "caster-spellcasting-modifier" ? -Infinity : 0)) {
    throw new TypeError(`execution.bindings: missing ${binding}`);
  }
  return value;
}

function resolveBoundValue(
  value: CombatEffectBoundValue,
  execution: Pick<CombatEffectExecution, "bindings" | "triggerFacts">
): number {
  return typeof value === "number" ? value : bindingValue(value.binding, execution);
}

function entityRefKey(ref: CombatEffectEntityRef): string {
  return ref.kind === "source" ? `source:${ref.id}` : `target:${ref.target.combatantId}`;
}

function validateTriggerFacts(value: CombatEffectTriggerFacts | undefined): void {
  if (value === undefined) return;
  if (!object(value)) throw new TypeError("execution.triggerFacts: expected object");
  const errors: string[] = [];
  exactKeys(value, "execution.triggerFacts", [], ["attack", "damage"], errors);
  if (Object.hasOwn(value, "attack")) {
    if (!object(value.attack))
      errors.push("execution.triggerFacts.attack: expected object");
    else {
      exactKeys(
        value.attack,
        "execution.triggerFacts.attack",
        ["result", "critical"],
        ["range"],
        errors
      );
      if (value.attack.result !== "hit" && value.attack.result !== "miss") {
        errors.push("execution.triggerFacts.attack.result: invalid result");
      }
      if (typeof value.attack.critical !== "boolean") {
        errors.push("execution.triggerFacts.attack.critical: expected boolean");
      }
      if (value.attack.result === "miss" && value.attack.critical === true) {
        errors.push("execution.triggerFacts.attack: a miss cannot be critical");
      }
      if (Object.hasOwn(value.attack, "range") && !finite(value.attack.range, 0)) {
        errors.push("execution.triggerFacts.attack.range: expected non-negative number");
      }
    }
  }
  if (Object.hasOwn(value, "damage")) {
    if (!object(value.damage))
      errors.push("execution.triggerFacts.damage: expected object");
    else {
      exactKeys(
        value.damage,
        "execution.triggerFacts.damage",
        ["amount", "sourceId"],
        ["damageType", "range"],
        errors
      );
      if (!safeInteger(value.damage.amount, 0)) {
        errors.push(
          "execution.triggerFacts.damage.amount: expected non-negative integer"
        );
      }
      validateId(value.damage.sourceId, "execution.triggerFacts.damage.sourceId", errors);
      if (
        Object.hasOwn(value.damage, "damageType") &&
        !DAMAGE_TYPES.has(value.damage.damageType as string)
      ) {
        errors.push("execution.triggerFacts.damage.damageType: invalid damage type");
      }
      if (Object.hasOwn(value.damage, "range") && !finite(value.damage.range, 0)) {
        errors.push("execution.triggerFacts.damage.range: expected non-negative number");
      }
    }
  }
  if (errors.length) throw new TypeError(errors.join("\n"));
}

function scopedStateKey(
  id: string,
  scope: CombatEffectScope,
  context: ProgramContext
): string {
  if (scope === "program") return id;
  if (scope === "target") return `${id}@target:${context.targetIndex}`;
  return `${id}@instance:${context.instance}`;
}

function validateScopedRuntimeRecord<T>(
  field: "tallies" | "layerStates",
  supplied: Readonly<Record<string, T>> | undefined,
  definitions: ReadonlyArray<{ id: string; scope: CombatEffectScope; initial: T }>,
  execution: CombatEffectExecution,
  validValue: (value: unknown) => boolean
): void {
  if (supplied !== undefined && !object(supplied)) {
    throw new TypeError(`execution.${field}: expected record`);
  }
  const allowed = new Set(
    definitions.flatMap((definition) =>
      contexts(definition.scope, execution).map((context) =>
        scopedStateKey(definition.id, definition.scope, context)
      )
    )
  );
  for (const [key, value] of Object.entries(supplied ?? {})) {
    if (!allowed.has(key)) throw new TypeError(`execution.${field}.${key}: unknown key`);
    if (!validValue(value))
      throw new TypeError(`execution.${field}.${key}: invalid value`);
  }
}

function phaseFor(program: CombatEffectProgram, execution: CombatEffectExecution) {
  const phase = program.phases.find((candidate) => candidate.id === execution.phaseId);
  if (!phase)
    throw new TypeError(`execution.phaseId: unknown phase ${execution.phaseId}`);
  return phase;
}

function validateEffectSourceFact(value: unknown, path: string): void {
  if (!object(value)) throw new TypeError(`${path}: expected effect source`);
  const errors: string[] = [];
  exactKeys(value, path, ["kind", "id", "actionId"], ["castLevel"], errors);
  if (value.kind !== "spell" && value.kind !== "feature") {
    errors.push(`${path}.kind: expected spell or feature`);
  }
  for (const field of ["id", "actionId"] as const) {
    if (typeof value[field] !== "string" || value[field].length === 0) {
      errors.push(`${path}.${field}: expected non-empty id`);
    }
  }
  if (value.castLevel !== undefined && !safeInteger(value.castLevel, 1)) {
    errors.push(`${path}.castLevel: expected positive integer`);
  }
  if (errors.length) throw new TypeError(errors.join("\n"));
}

function validateEncounterPositionFact(value: unknown, path: string): void {
  if (!object(value)) throw new TypeError(`${path}: expected encounter position`);
  const errors: string[] = [];
  exactKeys(value, path, ["round", "currentCombatantId", "phase", "order"], [], errors);
  if (!safeInteger(value.round, 0)) errors.push(`${path}.round: expected integer`);
  if (
    value.currentCombatantId !== null &&
    (typeof value.currentCombatantId !== "string" ||
      value.currentCombatantId.length === 0)
  ) {
    errors.push(`${path}.currentCombatantId: expected id or null`);
  }
  if (value.phase !== "turn-start" && value.phase !== "turn-end") {
    errors.push(`${path}.phase: invalid phase`);
  }
  if (
    !Array.isArray(value.order) ||
    value.order.length === 0 ||
    value.order.length > 512 ||
    value.order.some((id) => typeof id !== "string" || id.length === 0) ||
    new Set(value.order).size !== value.order.length ||
    (typeof value.currentCombatantId === "string" &&
      !value.order.includes(value.currentCombatantId))
  ) {
    errors.push(`${path}.order: expected unique combatant order containing current`);
  }
  if (errors.length) throw new TypeError(errors.join("\n"));
}

function validateExecution(
  program: CombatEffectProgram,
  execution: CombatEffectExecution
) {
  const rawExecution: unknown = execution;
  if (!object(rawExecution)) throw new TypeError("execution: expected object");
  const executionErrors: string[] = [];
  exactKeys(
    rawExecution,
    "execution",
    ["occurrenceId", "phaseId", "sourceId", "targets", "instances"],
    [
      "instanceTargets",
      "occurrence",
      "castLevel",
      "effectSource",
      "sourceConcentration",
      "encounterPosition",
      "characterLevel",
      "tallies",
      "layerStates",
      "areaStates",
      "bindings",
      "participants",
      "participantFacts",
      "triggerFacts",
      "gateContexts",
    ],
    executionErrors
  );
  validateJsonPlain(rawExecution, "execution", executionErrors);
  if (executionErrors.length) throw new TypeError(executionErrors.join("\n"));
  runtimeId(execution.occurrenceId, "execution.occurrenceId");
  runtimeId(execution.sourceId, "execution.sourceId");
  runtimeId(execution.phaseId, "execution.phaseId");
  if (!Array.isArray(execution.targets))
    throw new TypeError("execution.targets: expected array");
  const seen = new Set<string>();
  execution.targets.forEach((rawTarget, index) => {
    const target = validateRuntimeTarget(rawTarget, `execution.targets[${index}]`);
    const key = target.combatantId;
    if (seen.has(key))
      throw new TypeError(`execution.targets[${index}]: duplicate target`);
    seen.add(key);
  });
  if (execution.effectSource !== undefined) {
    validateEffectSourceFact(execution.effectSource, "execution.effectSource");
    if (
      execution.effectSource.castLevel !== undefined &&
      execution.effectSource.castLevel !== execution.castLevel
    ) {
      throw new TypeError(
        "execution.effectSource.castLevel: must equal execution.castLevel"
      );
    }
  }
  if (
    execution.sourceConcentration !== undefined &&
    typeof execution.sourceConcentration !== "boolean"
  ) {
    throw new TypeError("execution.sourceConcentration: expected boolean");
  }
  if (execution.sourceConcentration && execution.effectSource === undefined) {
    throw new TypeError(
      "execution.effectSource: required for a Concentration-owned occurrence"
    );
  }
  if (execution.encounterPosition !== undefined) {
    validateEncounterPositionFact(
      execution.encounterPosition,
      "execution.encounterPosition"
    );
  }
  if (execution.bindings !== undefined) {
    if (!object(execution.bindings)) {
      throw new TypeError("execution.bindings: expected record");
    }
    const errors: string[] = [];
    exactKeys(
      execution.bindings,
      "execution.bindings",
      [],
      ["casterSpellSaveDc", "casterSpellcastingModifier"],
      errors
    );
    if (
      Object.hasOwn(execution.bindings, "casterSpellSaveDc") &&
      !safeInteger(execution.bindings.casterSpellSaveDc, 0)
    ) {
      errors.push("execution.bindings.casterSpellSaveDc: expected non-negative integer");
    }
    if (
      Object.hasOwn(execution.bindings, "casterSpellcastingModifier") &&
      !safeInteger(execution.bindings.casterSpellcastingModifier)
    ) {
      errors.push("execution.bindings.casterSpellcastingModifier: expected safe integer");
    }
    if (errors.length) throw new TypeError(errors.join("\n"));
  }
  if (execution.participants !== undefined) {
    if (!object(execution.participants)) {
      throw new TypeError("execution.participants: expected record");
    }
    for (const [role, ref] of Object.entries(execution.participants)) {
      if (!PARTICIPANT_ROLES.has(role as CombatEffectParticipantRole)) {
        throw new TypeError(`execution.participants.${role}: invalid role`);
      }
      validateEntityRef(ref, `execution.participants.${role}`);
    }
  }
  if (execution.participantFacts !== undefined) {
    if (!Array.isArray(execution.participantFacts)) {
      throw new TypeError("execution.participantFacts: expected array");
    }
    const keys = new Set<string>();
    execution.participantFacts.forEach((fact, index) => {
      if (!object(fact)) {
        throw new TypeError(`execution.participantFacts[${index}]: expected object`);
      }
      const errors: string[] = [];
      exactKeys(
        fact,
        `execution.participantFacts[${index}]`,
        ["participant", "size"],
        [],
        errors
      );
      if (!SIZES.includes(fact.size as CreatureSize)) {
        errors.push(`execution.participantFacts[${index}].size: invalid size`);
      }
      if (errors.length) throw new TypeError(errors.join("\n"));
      const ref = validateEntityRef(
        fact.participant,
        `execution.participantFacts[${index}].participant`
      );
      const key = entityRefKey(ref);
      if (keys.has(key)) {
        throw new TypeError(
          `execution.participantFacts[${index}]: duplicate participant`
        );
      }
      keys.add(key);
    });
  }
  validateTriggerFacts(execution.triggerFacts);
  if (execution.areaStates !== undefined) {
    if (
      !Array.isArray(execution.areaStates) ||
      execution.areaStates.some(
        (fact: unknown) => typeof fact !== "string" || !AREA_FACTS.has(fact)
      ) ||
      new Set(execution.areaStates).size !== execution.areaStates.length
    ) {
      throw new TypeError("execution.areaStates: invalid area facts");
    }
  }
  if (!safeInteger(execution.instances, 1) || execution.instances > MAX_REPEAT) {
    throw new TypeError(`execution.instances: expected 1..${MAX_REPEAT}`);
  }
  if (execution.gateContexts !== undefined && !Array.isArray(execution.gateContexts)) {
    throw new TypeError("execution.gateContexts: expected array");
  }
  const gateIds = new Set((program.gates ?? []).map((gate) => gate.id));
  const gateContextKeys = new Set<string>();
  for (const [index, entry] of (execution.gateContexts ?? []).entries()) {
    if (!object(entry))
      throw new TypeError(`execution.gateContexts[${index}]: expected object`);
    const errors: string[] = [];
    exactKeys(
      entry,
      `execution.gateContexts[${index}]`,
      ["gateId", "context"],
      ["target", "instance", "ability", "skill"],
      errors
    );
    if (!gateIds.has(entry.gateId as string)) {
      errors.push(`execution.gateContexts[${index}].gateId: unknown gate`);
    }
    if (Object.hasOwn(entry, "instance") && !safeInteger(entry.instance, 0)) {
      errors.push(
        `execution.gateContexts[${index}].instance: expected non-negative integer`
      );
    }
    if (Object.hasOwn(entry, "ability") && !ABILITIES.has(entry.ability as string)) {
      errors.push(`execution.gateContexts[${index}].ability: invalid ability`);
    }
    if (Object.hasOwn(entry, "skill") && !validId(entry.skill)) {
      errors.push(`execution.gateContexts[${index}].skill: invalid skill`);
    }
    if (Object.hasOwn(entry, "target")) {
      validateRuntimeTarget(entry.target, `execution.gateContexts[${index}].target`);
    }
    validateJsonPlain(entry.context, `execution.gateContexts[${index}].context`, errors);
    if (errors.length) throw new TypeError(errors.join("\n"));
    const target = entry.target as CombatOutcomeTarget | undefined;
    const instance = typeof entry.instance === "number" ? String(entry.instance) : "";
    const key = `${String(entry.gateId)}\u0000${target?.combatantId ?? ""}\u0000${instance}`;
    if (gateContextKeys.has(key)) {
      throw new TypeError(`execution.gateContexts[${index}]: duplicate context`);
    }
    gateContextKeys.add(key);
  }
  const phase = phaseFor(program, execution);
  const needsTarget = phase.steps.some(
    (step) => step.scope !== "program" || ("subject" in step && step.subject === "target")
  );
  if (needsTarget && execution.targets.length === 0) {
    throw new TypeError("execution.targets: phase requires at least one target");
  }
  if (
    phase.targeting?.maxTargets !== undefined &&
    execution.targets.length > phase.targeting.maxTargets
  ) {
    throw new TypeError("execution.targets: exceeds phase target maximum");
  }
  const occurrence = execution.occurrence ?? 0;
  if (!safeInteger(occurrence, 0))
    throw new TypeError("execution.occurrence: expected non-negative integer");
  if (!phase.repeat && occurrence !== 0) {
    throw new TypeError("execution.occurrence: non-repeating phase only accepts 0");
  }
  if (phase.repeat && occurrence >= phase.repeat.maxOccurrences) {
    throw new TypeError("execution.occurrence: exceeds authored repeat bound");
  }
  for (const [field, value] of [
    ["castLevel", execution.castLevel],
    ["characterLevel", execution.characterLevel],
  ] as const) {
    if (value !== undefined && (!safeInteger(value, 1) || value > 20)) {
      throw new TypeError(`execution.${field}: expected level 1..20`);
    }
  }
  if (execution.tallies !== undefined && !object(execution.tallies)) {
    throw new TypeError("execution.tallies: expected record");
  }
  const counters = new Map(
    (program.counters ?? []).map((counter) => [counter.id, counter])
  );
  const authoredInstances = phase.instances ?? 1;
  const expectedInstances =
    typeof authoredInstances === "number"
      ? authoredInstances
      : resolveScaledValue(
          authoredInstances,
          execution,
          new Map(
            [...counters].map(([id, counter]) => [
              id,
              execution.tallies?.[id] ?? counter.initial,
            ])
          )
        );
  if (expectedInstances < 1 || expectedInstances > MAX_REPEAT) {
    throw new RangeError(`program phase instances resolve outside 1..${MAX_REPEAT}`);
  }
  if (execution.instances !== expectedInstances) {
    throw new TypeError(
      `execution.instances: expected authored phase count ${expectedInstances}`
    );
  }
  const usesInstances = phase.steps.some((step) => step.scope === "instance");
  if (usesInstances) {
    if (!Array.isArray(execution.instanceTargets)) {
      throw new TypeError(
        "execution.instanceTargets: instance-scoped phase requires assignments"
      );
    }
    if (execution.instanceTargets.length !== expectedInstances) {
      throw new TypeError(
        `execution.instanceTargets: expected ${expectedInstances} assignments`
      );
    }
    execution.instanceTargets.forEach((target, index) => {
      const validated = validateRuntimeTarget(
        target,
        `execution.instanceTargets[${index}]`
      );
      if (!seen.has(validated.combatantId)) {
        throw new TypeError(
          `execution.instanceTargets[${index}]: assignment is outside reviewed targets`
        );
      }
    });
  } else if (execution.instanceTargets !== undefined) {
    throw new TypeError(
      "execution.instanceTargets: omit assignments for a non-instance phase"
    );
  }
  validateScopedRuntimeRecord(
    "tallies",
    execution.tallies,
    [...counters.values()].map((counter) => ({
      id: counter.id,
      scope: counter.scope ?? "program",
      initial: counter.initial,
    })),
    execution,
    (value) => safeInteger(value, 0)
  );
  validateScopedRuntimeRecord(
    "layerStates",
    execution.layerStates,
    (program.layers ?? []).map((layer) => ({
      id: layer.id,
      scope: layer.scope,
      initial: layer.initial,
    })),
    execution,
    (value) => value === "active" || value === "destroyed"
  );
  return phase;
}

function normalizeExecution(
  program: CombatEffectProgram,
  execution: CombatEffectExecution
): CombatEffectExecution & {
  occurrence: number;
  tallies: Readonly<Record<string, number>>;
  layerStates: Readonly<Record<string, "active" | "destroyed">>;
  areaStates: ReadonlyArray<CombatEffectAreaFact>;
  bindings: CombatEffectBindings;
  participants: Partial<Record<CombatEffectParticipantRole, CombatEffectEntityRef>>;
  participantFacts: ReadonlyArray<CombatEffectParticipantFact>;
  triggerFacts: CombatEffectTriggerFacts;
  gateContexts: NonNullable<CombatEffectExecution["gateContexts"]>;
} {
  validateExecution(program, execution);
  return {
    ...execution,
    targets: execution.targets.map((target) => ({ ...target })),
    ...(execution.instanceTargets === undefined
      ? {}
      : {
          instanceTargets: execution.instanceTargets.map((target) => ({ ...target })),
        }),
    occurrence: execution.occurrence ?? 0,
    tallies: normalizeScopedRuntimeRecord(
      (program.counters ?? []).map((counter) => ({
        id: counter.id,
        scope: counter.scope ?? "program",
        initial: counter.initial,
      })),
      execution,
      execution.tallies
    ),
    layerStates: normalizeScopedRuntimeRecord(
      program.layers ?? [],
      execution,
      execution.layerStates
    ),
    areaStates: [...(execution.areaStates ?? [])],
    bindings: { ...(execution.bindings ?? {}) },
    participants: structuredClone(execution.participants ?? {}),
    participantFacts: structuredClone(execution.participantFacts ?? []),
    triggerFacts: structuredClone(execution.triggerFacts ?? {}),
    gateContexts: execution.gateContexts ?? [],
  };
}

function normalizeScopedRuntimeRecord<T>(
  definitions: ReadonlyArray<{ id: string; scope: CombatEffectScope; initial: T }>,
  execution: CombatEffectExecution,
  supplied: Readonly<Record<string, T>> | undefined
): Readonly<Record<string, T>> {
  return Object.fromEntries(
    definitions.flatMap((definition) =>
      contexts(definition.scope, execution).map((context) => {
        const key = scopedStateKey(definition.id, definition.scope, context);
        return [key, supplied?.[key] ?? definition.initial] as const;
      })
    )
  );
}

function requirementKey(
  category: "gate" | "input",
  refId: string,
  scope: CombatEffectScope,
  targetIndex?: number,
  instance?: number
): string {
  if (scope === "program") return `${category}:${refId}@program`;
  if (scope === "target") return `${category}:${refId}@target:${targetIndex}`;
  return `${category}:${refId}@instance:${instance}`;
}

interface ProgramContext {
  target: CombatOutcomeTarget | null;
  targetIndex: number | null;
  instance: number | null;
}

function contexts(
  scope: CombatEffectScope,
  execution: CombatEffectExecution
): ProgramContext[] {
  if (scope === "program") return [{ target: null, targetIndex: null, instance: null }];
  if (scope === "target") {
    return execution.targets.map((target, targetIndex) => ({
      target,
      targetIndex,
      instance: null,
    }));
  }
  const assignments = execution.instanceTargets;
  if (!assignments) {
    throw new TypeError("execution.instanceTargets: missing validated assignments");
  }
  return assignments.map((target, instance) => ({
    target,
    targetIndex: execution.targets.findIndex((candidate) =>
      sameTarget(candidate, target)
    ),
    instance,
  }));
}

function participantRef(
  subject: CombatEffectSubject,
  context: ProgramContext,
  execution: CombatEffectExecution
): CombatEffectEntityRef {
  if (subject === "source") return { kind: "source", id: execution.sourceId };
  if (subject === "target") {
    if (context.target === null)
      throw new TypeError("Target subject requires target context");
    return { kind: "target", target: context.target };
  }
  const ref = execution.participants?.[subject];
  if (!ref) throw new TypeError(`execution.participants.${subject}: required by program`);
  return ref;
}

function participantSize(
  subject: CombatEffectSubject,
  context: ProgramContext,
  execution: CombatEffectExecution
): CreatureSize {
  const key = entityRefKey(participantRef(subject, context, execution));
  const fact = execution.participantFacts?.find(
    (candidate) => entityRefKey(candidate.participant) === key
  );
  if (!fact)
    throw new TypeError(`execution.participantFacts: missing size for ${subject}`);
  return fact.size;
}

function collectPredicateRequirements(
  predicate: CombatEffectPredicate,
  out: string[]
): void {
  visitPredicateLeaves(predicate, "predicate", (leaf) => {
    if (leaf.kind === "gate") out.push(`gate:${leaf.gateId}`);
    else if (leaf.kind === "choice" || leaf.kind === "table-roll") {
      out.push(`input:${leaf.inputId}`);
    }
  });
}

function collectAmountRequirements(amount: CombatEffectAmountSpec, out: string[]): void {
  if (amount.kind === "sum") {
    for (const term of amount.terms) collectAmountRequirements(term, out);
  } else if (amount.kind === "input") out.push(`input:${amount.inputId}`);
}

function referencedRequirements(phase: CombatEffectPhase): string[] {
  const refs: string[] = [];
  for (const step of phase.steps) {
    if (step.when) collectPredicateRequirements(step.when, refs);
    if (step.kind === "damage") {
      if (step.gate) refs.push(`gate:${step.gate.gateId}`);
      collectAmountRequirements(step.amount, refs);
      if (step.damageType.kind !== "fixed") refs.push(`input:${step.damageType.inputId}`);
    } else if (
      step.kind === "heal" ||
      step.kind === "temp-hp" ||
      step.kind === "resource" ||
      step.kind === "counter" ||
      step.kind === "damage-reduction"
    ) {
      collectAmountRequirements(step.amount, refs);
    } else if (step.kind === "relocation-event" && step.destination.kind === "table") {
      refs.push(`input:${step.destination.inputId}`);
    }
  }
  if (phase.repeat?.endWhen) collectPredicateRequirements(phase.repeat.endWhen, refs);
  return [...new Set(refs)];
}

function sameTarget(
  left: CombatOutcomeTarget | undefined,
  right: CombatOutcomeTarget | null
): boolean {
  return (
    (left === undefined && right === null) ||
    (left !== undefined && right !== null && left.combatantId === right.combatantId)
  );
}

function gateContextFor(
  gate: CombatEffectGate,
  execution: CombatEffectExecution,
  context: ProgramContext
): { context: D20TestRequest; ability?: AbilityCode; skill?: string } {
  const target = gate.scope === "program" ? null : context.target;
  const instance = gate.scope === "instance" ? context.instance : null;
  const matches = (execution.gateContexts ?? []).filter(
    (candidate) =>
      candidate.gateId === gate.id &&
      sameTarget(candidate.target, target) &&
      (candidate.instance ?? null) === instance
  );
  if (matches.length !== 1) {
    throw new TypeError(`execution.gateContexts: expected one context for ${gate.id}`);
  }
  const matched = matches[0];
  const supplied = matched?.context;
  if (!supplied)
    throw new TypeError(`execution.gateContexts: missing context for ${gate.id}`);
  const errors: string[] = [];
  validateJsonPlain(supplied, `execution.gateContexts.${gate.id}`, errors);
  if (errors.length) throw new TypeError(errors.join("\n"));
  const expectedKind =
    gate.kind === "attack"
      ? "attack"
      : gate.kind === "save"
        ? "saving-throw"
        : "ability-check";
  if (supplied.kind !== expectedKind) {
    throw new TypeError(`execution.gateContexts.${gate.id}: expected ${expectedKind}`);
  }
  const expectedActor =
    gate.kind === "attack"
      ? execution.sourceId
      : (target?.combatantId ?? execution.sourceId);
  if (supplied.actor.entityId !== combatTableEntityRef(expectedActor).entityId) {
    throw new TypeError(
      `execution.gateContexts.${gate.id}: actor does not match gate scope`
    );
  }
  if (
    target &&
    supplied.target !== null &&
    supplied.target.entityId !== combatTableEntityRef(target.combatantId).entityId
  ) {
    throw new TypeError(`execution.gateContexts.${gate.id}: target does not match scope`);
  }
  if (gate.kind === "attack") {
    if (matched.ability !== undefined || matched.skill !== undefined) {
      throw new TypeError(
        `execution.gateContexts.${gate.id}: attack has no ability or skill`
      );
    }
    if (
      supplied.kind !== "attack" ||
      target === null ||
      supplied.target.entityId !== combatTableEntityRef(target.combatantId).entityId
    ) {
      throw new TypeError(`execution.gateContexts.${gate.id}: attack target is required`);
    }
  } else if (
    gate.dc !== undefined &&
    (supplied.kind === "ability-check" || supplied.kind === "saving-throw")
  ) {
    const dc = resolveBoundValue(gate.dc, execution);
    const suppliedDc =
      supplied.difficultyClass === null
        ? null
        : evaluateIntegerExpression(supplied.difficultyClass, {});
    if (suppliedDc !== dc) {
      throw new TypeError(
        `execution.gateContexts.${gate.id}: DC conflicts with authoring`
      );
    }
  }
  if (gate.kind === "attack") return { context: supplied };
  const abilities: ReadonlyArray<AbilityCode> =
    typeof gate.ability === "string" ? [gate.ability] : gate.ability;
  const ability: AbilityCode | undefined =
    matched.ability ?? (abilities.length === 1 ? abilities[0] : undefined);
  if (ability === undefined) {
    throw new TypeError(
      `execution.gateContexts.${gate.id}.ability: reviewed choice is required`
    );
  }
  if (!abilities.includes(ability)) {
    throw new TypeError(
      `execution.gateContexts.${gate.id}.ability: choice is not authored`
    );
  }
  let skill: string | undefined;
  if (gate.kind === "check" && gate.skill !== undefined) {
    const skills = typeof gate.skill === "string" ? [gate.skill] : gate.skill;
    skill = matched.skill ?? (skills.length === 1 ? skills[0] : undefined);
    if (skill === undefined) {
      throw new TypeError(
        `execution.gateContexts.${gate.id}.skill: reviewed choice is required`
      );
    }
    if (!skills.includes(skill)) {
      throw new TypeError(
        `execution.gateContexts.${gate.id}.skill: choice is not authored`
      );
    }
  } else if (matched.skill !== undefined) {
    throw new TypeError(`execution.gateContexts.${gate.id}: gate has no skill choice`);
  }
  if (gate.sizeAdvantage) {
    const size = participantSize(gate.sizeAdvantage.subject, context, execution);
    const actual = SIZES.indexOf(size);
    const threshold = SIZES.indexOf(gate.sizeAdvantage.size);
    const applies =
      gate.sizeAdvantage.comparison === "lte" ? actual <= threshold : actual >= threshold;
    const authored = supplied.rollRules.advantageSourceIds.includes(
      gate.sizeAdvantage.sourceId
    );
    if (authored !== applies) {
      throw new TypeError(
        `execution.gateContexts.${gate.id}: size-derived advantage conflicts with participant facts`
      );
    }
  }
  return { context: supplied, ability, ...(skill ? { skill } : {}) };
}

function expandConditionalRequirementRefs(
  references: ReadonlyArray<string>,
  gates: ReadonlyMap<string, CombatEffectGate>,
  inputs: ReadonlyMap<string, CombatEffectInput>
): string[] {
  const expanded: string[] = [];
  const seen = new Set<string>();
  const visiting = new Set<string>();
  const visit = (reference: string) => {
    if (seen.has(reference)) return;
    if (visiting.has(reference)) {
      throw new TypeError(`program ${reference}: cyclic conditional dependency`);
    }
    visiting.add(reference);
    if (reference.startsWith("gate:")) {
      const gate = gates.get(reference.slice("gate:".length));
      if (gate?.when) {
        const dependencies: string[] = [];
        collectPredicateRequirements(gate.when, dependencies);
        dependencies.forEach(visit);
      }
    } else if (reference.startsWith("input:")) {
      const input = inputs.get(reference.slice("input:".length));
      if (input?.when) {
        const dependencies: string[] = [];
        collectPredicateRequirements(input.when, dependencies);
        dependencies.forEach(visit);
      }
      if (input && input.kind !== "choice" && input.roll.critical) {
        visit(`gate:${input.roll.critical.gateId}`);
      }
    }
    visiting.delete(reference);
    seen.add(reference);
    expanded.push(reference);
  };
  references.forEach(visit);
  return expanded;
}

function evaluatePredicateTree(
  predicate: CombatEffectPredicate,
  leafValue: (leaf: PredicateLeaf) => boolean | undefined
): boolean | undefined {
  if (predicate.kind === "not") {
    const nested = evaluatePredicateTree(predicate.predicate, leafValue);
    return nested === undefined ? undefined : !nested;
  }
  if (predicate.kind === "all") {
    let unknown = false;
    for (const entry of predicate.predicates) {
      const value = evaluatePredicateTree(entry, leafValue);
      if (value === false) return false;
      if (value === undefined) unknown = true;
    }
    return unknown ? undefined : true;
  }
  if (predicate.kind === "any") {
    let unknown = false;
    for (const entry of predicate.predicates) {
      const value = evaluatePredicateTree(entry, leafValue);
      if (value === true) return true;
      if (value === undefined) unknown = true;
    }
    return unknown ? undefined : false;
  }
  return leafValue(predicate as PredicateLeaf);
}

function answerPredicateValue(
  predicate: Extract<CombatEffectPredicate, { kind: "gate" | "choice" | "table-roll" }>,
  context: ProgramContext,
  gates: ReadonlyMap<string, CombatEffectGate>,
  inputs: ReadonlyMap<string, CombatEffectInput>,
  answerValue: (key: string) => unknown
): boolean | undefined {
  if (predicate.kind === "gate") {
    const gate = requiredMapValue(gates, predicate.gateId, "gate");
    const answer = answerValue(answerKeyForContext("gate", gate.id, gate.scope, context));
    const outcome = resolvedGateOutcome(gate, answer);
    return outcome === undefined
      ? undefined
      : gateResultMatches(predicate.result, outcome);
  }
  const input = requiredMapValue(inputs, predicate.inputId, "input");
  const answer = answerValue(
    answerKeyForContext("input", input.id, input.scope, context)
  );
  if (answer === undefined) return undefined;
  if (predicate.kind === "choice") return answer === predicate.equals;
  if (!object(answer) || !safeInteger(answer.total)) return undefined;
  return answer.total >= predicate.min && answer.total <= predicate.max;
}

function partialAnswerPredicate(
  predicate: CombatEffectPredicate,
  context: ProgramContext,
  gates: ReadonlyMap<string, CombatEffectGate>,
  inputs: ReadonlyMap<string, CombatEffectInput>,
  answers: ReadonlyMap<string, unknown>,
  execution: CombatEffectExecution
): boolean | undefined {
  return evaluatePredicateTree(predicate, (leaf) => {
    if (leaf.kind === "trigger-fact") {
      return triggerFactPredicateValue(leaf, execution.triggerFacts);
    }
    if (leaf.kind !== "gate" && leaf.kind !== "choice" && leaf.kind !== "table-roll") {
      throw new TypeError("Conditional input contains a non-answer predicate");
    }
    return answerPredicateValue(leaf, context, gates, inputs, (key) => answers.get(key));
  });
}

function triggerFactPredicateValue(
  predicate: Extract<CombatEffectPredicate, { kind: "trigger-fact" }>,
  facts: CombatEffectTriggerFacts | undefined
): boolean | undefined {
  if (predicate.fact === "attack-result") {
    return facts?.attack ? facts.attack.result === predicate.equals : undefined;
  }
  if (predicate.fact === "attack-critical") {
    return facts?.attack ? facts.attack.critical === predicate.equals : undefined;
  }
  if (predicate.fact === "triggering-damage") {
    return facts?.damage
      ? compare(facts.damage.amount, predicate.comparison, predicate.value)
      : undefined;
  }
  if (predicate.fact === "triggering-range") {
    const range = facts?.damage?.range ?? facts?.attack?.range;
    return range === undefined
      ? undefined
      : compare(range, predicate.comparison, predicate.value);
  }
  if (predicate.fact === "triggering-damage-source") {
    return facts?.damage && "equals" in predicate
      ? facts.damage.sourceId === predicate.equals
      : undefined;
  }
  return facts?.damage?.damageType === undefined || !("equals" in predicate)
    ? undefined
    : facts.damage.damageType === predicate.equals;
}

function resolvedGateOutcome(
  gate: CombatEffectGate,
  value: unknown
): CombatEffectGateResult | undefined {
  if (!object(value) || !object(value.outcome)) return undefined;
  const outcome = value.outcome;
  if (gate.kind === "attack") {
    if (outcome.kind !== "attack") return undefined;
    return outcome.critical === true
      ? "critical-hit"
      : outcome.hit === true
        ? "hit"
        : outcome.hit === false
          ? "miss"
          : undefined;
  }
  return outcome.status === "success" || outcome.status === "failure"
    ? outcome.status
    : undefined;
}

function gateResultMatches(
  expected: CombatEffectGateResult,
  actual: CombatEffectGateResult
): boolean {
  return expected === "hit"
    ? actual === "hit" || actual === "critical-hit"
    : expected === actual;
}

function requirementForGate(
  gate: CombatEffectGate,
  execution: CombatEffectExecution,
  context: ProgramContext
): CombatEffectRequirement {
  const base: RequirementBase = {
    key: requirementKey(
      "gate",
      gate.id,
      gate.scope,
      context.targetIndex ?? undefined,
      context.instance ?? undefined
    ),
    refId: gate.id,
    scope: gate.scope,
    ...(context.target === null ? {} : { target: context.target }),
    ...(context.instance === null ? {} : { instance: context.instance }),
  };
  const resolved = gateContextFor(gate, execution, context);
  if (gate.kind === "attack") {
    return {
      ...base,
      kind: "attack",
      context: resolved.context,
      ...(gate.attackType ? { attackType: gate.attackType } : {}),
    };
  }
  if (resolved.ability === undefined) {
    throw new TypeError(`execution.gateContexts.${gate.id}: missing validated ability`);
  }
  if (gate.kind === "save") {
    return {
      ...base,
      kind: "save",
      ability: resolved.ability,
      context: resolved.context,
      ...(gate.dc === undefined ? {} : { dc: resolveBoundValue(gate.dc, execution) }),
    };
  }
  return {
    ...base,
    kind: "check",
    ability: resolved.ability,
    dc: resolveBoundValue(gate.dc, execution),
    context: resolved.context,
    ...(resolved.skill ? { skill: resolved.skill } : {}),
  };
}

function requirementForInput(
  input: CombatEffectInput,
  execution: CombatEffectExecution,
  context: ProgramContext,
  critical: boolean
): CombatEffectRequirement {
  const base: RequirementBase = {
    key: requirementKey(
      "input",
      input.id,
      input.scope,
      context.targetIndex ?? undefined,
      context.instance ?? undefined
    ),
    refId: input.id,
    scope: input.scope,
    ...(context.target === null ? {} : { target: context.target }),
    ...(context.instance === null ? {} : { instance: context.instance }),
  };
  if (input.kind === "choice") return { ...base, kind: "choice", options: input.options };
  let count =
    typeof input.roll.count === "number"
      ? input.roll.count
      : resolveScaledValue(input.roll.count, execution);
  if (critical && input.roll.critical) count *= input.roll.critical.multiplier;
  if (!safeInteger(count, 1) || count > MAX_DICE) {
    throw new RangeError(`input ${input.id}: resolved dice count must be 1..${MAX_DICE}`);
  }
  return {
    ...base,
    kind: input.kind,
    roll: { count, sides: input.roll.sides, bonus: input.roll.bonus ?? 0 },
    ...(input.rerollValues ? { rerollValues: input.rerollValues } : {}),
  };
}

function resolveScaledValue(
  value: CombatEffectScaledValue,
  execution: CombatEffectExecution,
  counters?: ReadonlyMap<string, number>
): number {
  let result = value.base;
  if (value.byCharacterLevel) {
    if (execution.characterLevel === undefined) {
      throw new TypeError("execution.characterLevel: required by authored scaling");
    }
    for (const row of value.byCharacterLevel) {
      if (row.minLevel <= execution.characterLevel) result = row.value;
    }
  }
  if (value.perSlot) {
    if (execution.castLevel === undefined) {
      throw new TypeError("execution.castLevel: required by authored scaling");
    }
    result +=
      Math.max(0, execution.castLevel - value.perSlot.above) * value.perSlot.amount;
  }
  if (value.perCounter) {
    const counter =
      counters?.get(value.perCounter.counterId) ??
      execution.tallies?.[value.perCounter.counterId];
    if (counter === undefined) {
      throw new TypeError(
        `execution.tallies.${value.perCounter.counterId}: required by scaling`
      );
    }
    result += counter * value.perCounter.amount;
  }
  if (!safeInteger(result, 0)) throw new RangeError("Resolved scaled value is invalid");
  return result;
}

/** Exact questions needed for this phase/target/instance invocation, in authored order. */
export function deriveCombatEffectRequirements(
  program: CombatEffectProgram,
  execution: CombatEffectExecution,
  provided: ReadonlyArray<CombatEffectProvidedAnswer> = []
): ReadonlyArray<CombatEffectRequirement> {
  assertCombatEffectProgram(program);
  const normalized = normalizeExecution(program, execution);
  const phase = phaseFor(program, normalized);
  const gateMap = new Map((program.gates ?? []).map((gate) => [gate.id, gate]));
  const inputMap = new Map((program.inputs ?? []).map((input) => [input.id, input]));
  const providedMap = new Map<string, unknown>();
  for (const answer of provided) {
    if (providedMap.has(answer.key))
      throw new TypeError(`answers: duplicate answer ${answer.key}`);
    providedMap.set(answer.key, answer.value);
  }
  const requirements: CombatEffectRequirement[] = [];
  for (const reference of expandConditionalRequirementRefs(
    referencedRequirements(phase),
    gateMap,
    inputMap
  )) {
    const [category, id] = reference.split(":") as ["gate" | "input", string];
    if (category === "gate") {
      const gate = requiredMapValue(gateMap, id, "gate");
      for (const context of contexts(gate.scope, normalized)) {
        if (
          gate.when &&
          partialAnswerPredicate(
            gate.when,
            context,
            gateMap,
            inputMap,
            providedMap,
            normalized
          ) !== true
        ) {
          continue;
        }
        requirements.push(requirementForGate(gate, normalized, context));
      }
    } else {
      const input = requiredMapValue(inputMap, id, "input");
      for (const context of contexts(input.scope, normalized)) {
        if (
          input.when &&
          partialAnswerPredicate(
            input.when,
            context,
            gateMap,
            inputMap,
            providedMap,
            normalized
          ) !== true
        ) {
          continue;
        }
        let critical = false;
        if (input.kind !== "choice" && input.roll.critical) {
          const gate = requiredMapValue(
            gateMap,
            input.roll.critical.gateId,
            "critical gate"
          );
          const answer = providedMap.get(
            answerKeyForContext("gate", gate.id, gate.scope, context)
          );
          const outcome = resolvedGateOutcome(gate, answer);
          if (outcome === undefined) continue;
          critical = outcome === "critical-hit";
        }
        requirements.push(requirementForInput(input, normalized, context, critical));
      }
    }
  }
  return requirements;
}

function validateRequirementAnswer(
  requirement: CombatEffectRequirement,
  value: unknown,
  path: string
): asserts value is D20TestResult | CombatEffectDiceFact | string {
  if (
    requirement.kind === "attack" ||
    requirement.kind === "save" ||
    requirement.kind === "check"
  ) {
    if (!object(value)) throw new TypeError(`${path}: expected universal D20 result`);
    const review = value.review;
    const resolved = evaluateD20Test(
      object(review) ? review.request : undefined,
      {},
      value.observation
    );
    if (!resolved) {
      throw new TypeError(`${path}: invalid universal D20 result`);
    }
    if (JSON.stringify(canonical(resolved)) !== JSON.stringify(canonical(value))) {
      throw new TypeError(`${path}: D20 result does not match its reviewed input`);
    }
    if (
      JSON.stringify(canonical(resolved.review.request)) !==
      JSON.stringify(canonical(requirement.context))
    ) {
      throw new TypeError(`${path}: D20 context does not match the gate requirement`);
    }
    if (resolved.outcome.status !== "success" && resolved.outcome.status !== "failure") {
      throw new TypeError(`${path}: gate requires a reviewed success/failure outcome`);
    }
    return;
  }
  if (requirement.kind === "choice") {
    if (typeof value !== "string" || !requirement.options.includes(value)) {
      throw new TypeError(`${path}: expected one authored choice`);
    }
    return;
  }
  if (!object(value)) throw new TypeError(`${path}: expected physical dice fact`);
  const errors: string[] = [];
  exactKeys(value, path, ["dice", "consumedResourceIds", "total"], [], errors);
  validateJsonPlain(value, path, errors);
  if (errors.length) throw new TypeError(errors.join("\n"));
  const finalFaces: number[] = [];
  const consumed: string[] = [];
  const dieIds = new Set<string>();
  if (!Array.isArray(value.dice) || value.dice.length !== requirement.roll.count) {
    errors.push(
      `${path}.dice: expected ${requirement.roll.count} physical d${requirement.roll.sides} trails`
    );
  } else {
    value.dice.forEach((rawDie, dieIndex) => {
      const diePath = `${path}.dice[${dieIndex}]`;
      if (!object(rawDie)) {
        errors.push(`${diePath}: expected die trail`);
        return;
      }
      exactKeys(rawDie, diePath, ["dieId", "initialFace", "replacements"], [], errors);
      if (typeof rawDie.dieId !== "string" || rawDie.dieId.length === 0) {
        errors.push(`${diePath}.dieId: expected non-empty id`);
      } else if (dieIds.has(rawDie.dieId)) {
        errors.push(`${diePath}.dieId: duplicate die id`);
      } else {
        dieIds.add(rawDie.dieId);
      }
      if (
        !safeInteger(rawDie.initialFace, 1) ||
        rawDie.initialFace > requirement.roll.sides
      ) {
        errors.push(`${diePath}.initialFace: invalid d${requirement.roll.sides} face`);
      }
      let finalFace = rawDie.initialFace;
      const observedFaces: number[] = safeInteger(rawDie.initialFace, 1)
        ? [rawDie.initialFace]
        : [];
      if (!Array.isArray(rawDie.replacements)) {
        errors.push(`${diePath}.replacements: expected array`);
      } else {
        rawDie.replacements.forEach((rawReplacement, replacementIndex) => {
          const replacementPath = `${diePath}.replacements[${replacementIndex}]`;
          if (!object(rawReplacement)) {
            errors.push(`${replacementPath}: expected replacement`);
            return;
          }
          exactKeys(
            rawReplacement,
            replacementPath,
            ["sourceId", "face"],
            ["resourceId"],
            errors
          );
          for (const field of ["sourceId", "resourceId"] as const) {
            if (
              Object.hasOwn(rawReplacement, field) &&
              (typeof rawReplacement[field] !== "string" ||
                rawReplacement[field].length === 0)
            ) {
              errors.push(`${replacementPath}.${field}: expected non-empty id`);
            }
          }
          if (
            !safeInteger(rawReplacement.face, 1) ||
            rawReplacement.face > requirement.roll.sides
          ) {
            errors.push(
              `${replacementPath}.face: invalid d${requirement.roll.sides} face`
            );
          } else {
            finalFace = rawReplacement.face;
            observedFaces.push(rawReplacement.face);
          }
          if (typeof rawReplacement.resourceId === "string") {
            consumed.push(rawReplacement.resourceId);
          }
        });
      }
      if (requirement.rerollValues && observedFaces.length > 0) {
        const rerollValues = new Set(requirement.rerollValues);
        observedFaces.slice(0, -1).forEach((face, faceIndex) => {
          if (!rerollValues.has(face)) {
            errors.push(
              `${diePath}: accepted face ${face} at trail index ${faceIndex} was replaced`
            );
          }
        });
        const accepted = observedFaces.at(-1);
        if (accepted !== undefined && rerollValues.has(accepted)) {
          errors.push(`${diePath}: final face ${accepted} must be rerolled`);
        }
      }
      if (safeInteger(finalFace, 1)) finalFaces.push(finalFace);
    });
  }
  if (
    !Array.isArray(value.consumedResourceIds) ||
    value.consumedResourceIds.some(
      (resourceId) => typeof resourceId !== "string" || resourceId.length === 0
    ) ||
    JSON.stringify(value.consumedResourceIds) !== JSON.stringify(consumed)
  ) {
    errors.push(`${path}.consumedResourceIds: must match replacement resources in order`);
  }
  if (!safeInteger(value.total)) {
    errors.push(`${path}.total: expected safe integer`);
  } else if (
    finalFaces.length === requirement.roll.count &&
    value.total !== finalFaces.reduce((sum, face) => sum + face, requirement.roll.bonus)
  ) {
    errors.push(`${path}.total: must equal final faces plus authored bonus`);
  }
  if (errors.length) throw new TypeError(errors.join("\n"));
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (object(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])])
    );
  }
  return value;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function frozenCanonical<T>(value: T): Readonly<T> {
  return deepFreeze(canonical(value) as T);
}

/** Build the immutable replay artifact only after every required answer is present. */
export function createReviewedCombatEffectArtifact(
  program: CombatEffectProgram,
  execution: CombatEffectExecution,
  provided: ReadonlyArray<CombatEffectProvidedAnswer>
): Readonly<ReviewedCombatEffectArtifact> {
  const normalized = normalizeExecution(program, execution);
  const requirements = deriveCombatEffectRequirements(program, normalized, provided);
  const byKey = new Map<string, unknown>();
  provided.forEach((answer, index) => {
    runtimeId(answer.key, `answers[${index}].key`);
    if (byKey.has(answer.key))
      throw new TypeError(`answers[${index}].key: duplicate answer`);
    byKey.set(answer.key, answer.value);
  });
  const expected = new Set(requirements.map((requirement) => requirement.key));
  for (const key of byKey.keys()) {
    if (!expected.has(key)) throw new TypeError(`answers: unexpected answer ${key}`);
  }
  const answers = requirements.map((requirement, index): ReviewedCombatEffectAnswer => {
    if (!byKey.has(requirement.key)) {
      throw new TypeError(`answers: missing answer ${requirement.key}`);
    }
    const value = byKey.get(requirement.key);
    validateRequirementAnswer(requirement, value, `answers[${index}].value`);
    return { ...requirement, value };
  });
  const phase = phaseFor(program, normalized);
  const artifact: ReviewedCombatEffectArtifact = {
    schema: 1,
    program,
    occurrenceId: normalized.occurrenceId,
    phaseId: normalized.phaseId,
    trigger: phase.trigger,
    sourceId: normalized.sourceId,
    targets: normalized.targets.map((target) => ({ ...target })),
    instances: normalized.instances,
    ...(normalized.instanceTargets === undefined
      ? {}
      : { instanceTargets: normalized.instanceTargets }),
    occurrence: normalized.occurrence,
    ...(normalized.castLevel === undefined ? {} : { castLevel: normalized.castLevel }),
    ...(normalized.effectSource === undefined
      ? {}
      : { effectSource: normalized.effectSource }),
    ...(normalized.sourceConcentration === undefined
      ? {}
      : { sourceConcentration: normalized.sourceConcentration }),
    ...(normalized.encounterPosition === undefined
      ? {}
      : { encounterPosition: normalized.encounterPosition }),
    ...(normalized.characterLevel === undefined
      ? {}
      : { characterLevel: normalized.characterLevel }),
    tallies: normalized.tallies,
    layerStates: normalized.layerStates,
    areaStates: normalized.areaStates,
    bindings: normalized.bindings,
    participants: normalized.participants,
    participantFacts: normalized.participantFacts,
    triggerFacts: normalized.triggerFacts,
    gateContexts: normalized.gateContexts,
    answers,
  };
  return frozenCanonical(artifact);
}

export function serializeReviewedCombatEffectArtifact(
  artifact: ReviewedCombatEffectArtifact
): string {
  assertArtifact(artifact);
  return JSON.stringify(canonical(artifact));
}

export interface CombatEffectStateView {
  hp: number;
  maxHp: number;
  tempHp: number;
  stable: boolean;
  deathSaves: { successes: number; failures: number };
  conditions: ReadonlyArray<ConditionId>;
  /** Every active condition maps to its exact lifetime; null means indefinite. */
  conditionLifetimes: Readonly<Record<string, CombatEffectLifetime | null>>;
  standing: ReadonlyArray<string>;
  /** Every standing effect maps to its exact lifetime; null means indefinite. */
  standingLifetimes: Readonly<Record<string, CombatEffectLifetime | null>>;
  resources: Readonly<Record<string, number>>;
  /** Durable source-state switches (activeFeatures and future exact-key states).
   * Entries are per-key so a one-shot consumption never CASes an owner-wide array. */
  stateFlags: Readonly<Record<string, boolean>>;
}

export interface CombatEffectProvenance {
  occurrenceId: string;
  programId: string;
  phaseId: string;
  stepId: string;
  target: CombatOutcomeTarget | null;
  instance: number | null;
  iteration: number;
}

function encodedIdentity(parts: ReadonlyArray<string>): string {
  return parts.map((part) => `${part.length}:${part}`).join("|");
}

/** Stable semantic identity for one program-created world occurrence. Corrected
 * command attempts therefore reuse the same id after the prior attempt is undone. */
export function combatEffectOccurrenceId(
  mutation: Extract<CombatEffectMutation, { kind: "condition" | "standing" }>
): string {
  const target =
    mutation.recipient.kind === "source"
      ? `source:${mutation.recipient.id}`
      : `target:${mutation.recipient.target.combatantId}`;
  const semantic =
    mutation.kind === "condition"
      ? `condition:${mutation.condition}`
      : `standing:${mutation.effectId}`;
  const provenance = mutation.provenance;
  return `program:${encodedIdentity([
    provenance.occurrenceId,
    provenance.programId,
    provenance.phaseId,
    provenance.stepId,
    target,
    String(provenance.instance ?? ""),
    String(provenance.iteration),
    semantic,
  ])}`;
}

interface MutationBase {
  provenance: CombatEffectProvenance;
  recipient: CombatEffectEntityRef;
}

export type CombatEffectDamageResolution =
  | { kind: "unconditional"; disposition: "full"; criticalHit: false }
  | {
      kind: "gate";
      gateId: string;
      gateKind: "attack" | "save" | "check";
      ability?: AbilityCode;
      result: CombatEffectGateResult;
      disposition: "full" | "half";
      criticalHit: boolean;
      /** Exact authored save baseline before a target-side rule such as Evasion
       * rewrites it. Required for save gates; absent for attacks/checks. */
      baselineSave?: {
        success: "none" | "half" | "full";
        failure: "none" | "half" | "full";
      };
    };

export interface CombatEffectDamageComponent {
  stepId: string;
  /** Post-gate, pre-defense amount; typed defenses run once in the draft reducer. */
  amount: number;
  damageType: DamageType;
  damageSource?: DamageSource;
  resolution: CombatEffectDamageResolution;
}

export interface CombatEffectDamageDefenseGroup {
  damageType: DamageType;
  amount: number;
  componentStepIds: ReadonlyArray<string>;
}

export type CombatEffectMutation =
  | (MutationBase & {
      kind: "damage";
      packetId: string;
      damageSource?: DamageSource;
      /** One atomic damage source; lifecycle/concentration resolve once per packet. */
      components: ReadonlyArray<CombatEffectDamageComponent>;
      /** Same-type packet parts coalesced before any flat per-hit reduction. */
      defenseGroups: ReadonlyArray<CombatEffectDamageDefenseGroup>;
    })
  | (MutationBase & { kind: "heal" | "temp-hp"; amount: number })
  | (MutationBase & {
      kind: "condition";
      operation: "apply" | "remove";
      condition: ConditionId;
      lifetime?: CombatEffectLifetime;
    })
  | (MutationBase & {
      kind: "standing";
      operation: "start" | "end";
      effectId: string;
      lifetime?: CombatEffectLifetime;
    })
  | (MutationBase & {
      kind: "resource";
      operation: "spend" | "gain";
      resourceId: string;
      amount: number;
    })
  | (MutationBase & {
      kind: "damage-reduction";
      amount: number;
      damageTypes?: ReadonlyArray<DamageType>;
      triggeringDamage: NonNullable<CombatEffectTriggerFacts["damage"]>;
    })
  | (MutationBase & { kind: "stabilize" })
  | (MutationBase & {
      /** Internal deterministic follow-up. The amount is already post-defense and
       * therefore must never pass through defenses a second time. */
      kind: "resolved-damage";
      amount: number;
      sourceEffectId: string;
      /** Transfer-effect ids already traversed by this causal damage chain. */
      transferPath: ReadonlyArray<string>;
    })
  | (MutationBase & {
      /** Internal exact-key inverse for a consumed state-backed one-shot. */
      kind: "state-flag";
      operation: "activate" | "deactivate";
      stateKey: string;
    });

type CombatEffectGeneratedMutation = Extract<
  CombatEffectMutation,
  { kind: "resolved-damage" | "state-flag" }
>;

type CombatEffectAuthoredMutation = Exclude<
  CombatEffectMutation,
  CombatEffectGeneratedMutation
>;

export type CombatEffectGeneratedSource =
  | {
      kind: "state-flag";
      recipient: CombatEffectEntityRef;
      stateKey: string;
      expectedActive: true;
      /** Exact floor metadata read while reducing the parent damage. */
      hitPoints: number;
    }
  | {
      kind: "effect-occurrence";
      /** Ledger owner from whose planning snapshot the effect was read. */
      recipient: CombatEffectEntityRef;
      /** Complete rule-bearing occurrence; no effect fact is inferred from its id. */
      effect: ActiveCombatEffect;
      expectedHeadOpId: string;
      expectedActive: true;
    };

export type CombatEffectGeneratedMutationIntent =
  | {
      mutation: Extract<CombatEffectGeneratedMutation, { kind: "state-flag" }>;
      source: Extract<CombatEffectGeneratedSource, { kind: "state-flag" }>;
    }
  | {
      mutation: Extract<CombatEffectGeneratedMutation, { kind: "resolved-damage" }>;
      source: Extract<CombatEffectGeneratedSource, { kind: "effect-occurrence" }>;
    };

/** Interpreter-stamped causal link. Disposable drafts describe the observed
 * source only; they can never choose a parent receipt. */
export interface CombatEffectGeneratedBy {
  parentConsequenceIndex: number;
  source: CombatEffectGeneratedSource;
}

interface CombatEffectMutationReceiptState {
  /** Exact mutation-owned state before and after this ordered draft operation. */
  before: CombatEffectStateView;
  after: CombatEffectStateView;
  appliedAmount?: number;
  appliedComponents?: ReadonlyArray<{ stepId: string; appliedAmount: number }>;
  persistentConsequences?: CombatEffectPersistentConsequences;
}

export type CombatEffectMutationReceipt =
  | (CombatEffectAuthoredMutation &
      CombatEffectMutationReceiptState & { generatedBy?: never })
  | (CombatEffectGeneratedMutation &
      CombatEffectMutationReceiptState & { generatedBy: CombatEffectGeneratedBy });

export type CombatEffectConsequence =
  | CombatEffectMutationReceipt
  | {
      kind: "counter";
      provenance: CombatEffectProvenance;
      counterId: string;
      stateKey?: string;
      before: number;
      after: number;
    }
  | { kind: "end-program"; provenance: CombatEffectProvenance };

export type CombatEffectEvent =
  | {
      kind: "layer";
      provenance: CombatEffectProvenance;
      layerId: string;
      stateKey: string;
      before: "active" | "destroyed";
      after: "active" | "destroyed";
    }
  | {
      kind: "area-state";
      provenance: CombatEffectProvenance;
      operation: "apply" | "remove";
      fact: CombatEffectAreaFact;
      before: boolean;
      after: boolean;
      lifetime?: CombatEffectLifetime;
    }
  | {
      kind: "relocation-event";
      provenance: CombatEffectProvenance;
      recipient: CombatEffectEntityRef;
      mode: "teleport" | "plane-transfer";
      destination:
        | { kind: "manual" }
        | { kind: "table"; inputId: string; roll: CombatEffectDiceFact };
    };

export interface CombatEffectDraftMutationResult {
  before: CombatEffectStateView;
  after: CombatEffectStateView;
  appliedAmount?: number;
  appliedComponents?: ReadonlyArray<{ stepId: string; appliedAmount: number }>;
  persistentConsequences?: CombatEffectPersistentConsequences;
  /** Deterministic follow-ups are interpreted through the same read/apply/receipt
   * checks as authored steps; drafts never hide remote damage in an adapter intent. */
  generatedMutations?: ReadonlyArray<CombatEffectGeneratedMutationIntent>;
}

export type CombatEffectOccurrenceChangeReason =
  | "program-apply"
  | "program-remove"
  | "program-start"
  | "program-end"
  | "damage-consume";

export type CombatEffectOccurrencePayloadFingerprint =
  | { kind: "grant-group"; activeKey: string; phase?: "active" | "aftereffect" }
  | {
      kind: "target-mark";
      activeKey: string;
      scope: "marked" | "cursed" | "vowed";
    }
  | { kind: "condition"; conditionId: string }
  | { kind: "program-standing"; effectId: string };

export interface CombatEffectOccurrenceOwnerFingerprint {
  occurrenceId: string;
  programId: string;
  phaseId: string;
  stepId: string;
  operationId: string;
  instance: number | null;
  iteration: number;
}

/** The immutable rule-bearing identity of an occurrence. The occurrence id and
 * ledger head stay separate CAS fields; adapter-specific clocks are deliberately
 * excluded from this storage-neutral fingerprint. */
export interface CombatEffectOccurrenceFingerprint {
  programOwner: CombatEffectOccurrenceOwnerFingerprint | null;
  payload: CombatEffectOccurrencePayloadFingerprint;
}

/** Complete rule-bearing identity projected from one materialized occurrence. */
export function combatEffectOccurrenceFingerprint(
  effect: Readonly<ActiveCombatEffect>
): Readonly<CombatEffectOccurrenceFingerprint> {
  if (!isActiveCombatEffect(effect)) {
    throw new TypeError("Combat-effect occurrence fingerprint requires a valid effect");
  }
  const owner = effect.programOwner;
  const payload = effect.payload;
  if (
    (payload.kind === "condition" &&
      !CONDITIONS.has(payload.conditionId as ConditionId)) ||
    (owner !== undefined &&
      payload.kind !== "condition" &&
      payload.kind !== "program-standing")
  ) {
    throw new TypeError("Combat-effect occurrence has invalid rule ownership");
  }
  return frozenCanonical({
    programOwner:
      owner === undefined
        ? null
        : {
            occurrenceId: owner.occurrenceId,
            programId: owner.programId,
            phaseId: owner.phaseId,
            stepId: owner.stepId,
            operationId: owner.operationId,
            instance: owner.instance,
            iteration: owner.iteration,
          },
    payload:
      payload.kind === "grant-group"
        ? {
            kind: payload.kind,
            activeKey: payload.activeKey,
            ...(payload.phase === undefined ? {} : { phase: payload.phase }),
          }
        : payload.kind === "target-mark"
          ? {
              kind: payload.kind,
              activeKey: payload.activeKey,
              scope: payload.scope,
            }
          : payload.kind === "condition"
            ? { kind: payload.kind, conditionId: payload.conditionId }
            : { kind: payload.kind, effectId: payload.effectId },
  });
}

export interface CombatEffectOccurrenceSnapshot {
  effectId: string;
  headOpId: string;
  active: boolean;
  terminal: boolean;
  fingerprint: CombatEffectOccurrenceFingerprint;
}

/** Deterministic first ledger head for a program-created occurrence. The commit
 * adapter uses this same id for the materialized apply operation. */
export function combatEffectOccurrenceInitialHeadId(effectId: string): string {
  if (typeof effectId !== "string" || effectId.length === 0) {
    throw new TypeError("Combat-effect occurrence requires a non-empty id");
  }
  return `program-op:${encodedIdentity(["apply", effectId])}`;
}

/** Storage-neutral exact world-occurrence delta. The atomic adapter materializes
 * an ActiveCombatEffect using its local/shared combatant identity map. */
export interface CombatEffectOccurrenceChange {
  effectId: string;
  provenance: CombatEffectProvenance;
  recipient: CombatEffectEntityRef;
  /** Null means this exact id must not exist. A non-null value fences the
   * occurrence's current append-only ledger head, not merely its active bit. */
  expectedHeadOpId: string | null;
  expectedActive: boolean;
  active: boolean;
  reason: CombatEffectOccurrenceChangeReason;
  /** Required when an existing occurrence changes state. This prevents a
   * same-id entry with unrelated authored ownership or payload from matching. */
  expectedEffect?: CombatEffectOccurrenceFingerprint;
  /** Complete immutable occurrence identity for a creation. It is derived from
   * reviewed execution facts and committed inside the plan/command payload. */
  materializedEffect?: ActiveCombatEffect;
  descriptor?:
    | {
        kind: "condition";
        condition: ConditionId;
        lifetime?: CombatEffectLifetime;
      }
    | {
        kind: "standing";
        effectId: string;
        lifetime?: CombatEffectLifetime;
      };
}

/** Deterministic persistent side effects owned by the same damage/condition
 * operation. They commit and reverse with its ordinary state changes. */
export interface CombatEffectPersistentConsequences {
  occurrenceChanges: ReadonlyArray<CombatEffectOccurrenceChange>;
}

/** Pure forward-CAS predicate shared by local and campaign materializers. */
export function combatEffectOccurrenceChangeMatchesSnapshot(
  change: Readonly<CombatEffectOccurrenceChange>,
  current: Readonly<CombatEffectOccurrenceSnapshot> | null
): boolean {
  if (change.expectedHeadOpId === null) {
    return (
      current === null &&
      change.expectedEffect === undefined &&
      change.materializedEffect !== undefined &&
      !change.expectedActive &&
      change.active
    );
  }
  return (
    current !== null &&
    !current.terminal &&
    current.effectId === change.effectId &&
    current.headOpId === change.expectedHeadOpId &&
    current.active === change.expectedActive &&
    change.expectedEffect !== undefined &&
    change.materializedEffect === undefined &&
    sameCanonical(current.fingerprint, change.expectedEffect)
  );
}

/** Isolated mutable copy. Discarding it must have no externally visible effect. */
export interface CombatEffectDisposableDraft {
  /** Initial immutable compare-and-swap facts for this exact program header. */
  atomicReadSet(header: CombatEffectAtomicReadSetHeader): unknown;
  /** Durable base state only. Source-owned condition/standing projections stay in
   * their exact occurrence ledger and are queried through the methods below. */
  read(ref: CombatEffectEntityRef): CombatEffectStateView;
  /** Predicate reads must be explicitly bound, including observed absence. */
  resourceValue(ref: CombatEffectEntityRef, resourceId: string): number;
  conditionPresent(ref: CombatEffectEntityRef, condition: ConditionId): boolean;
  standingPresent(ref: CombatEffectEntityRef, effectId: string): boolean;
  apply(mutation: Readonly<CombatEffectMutation>): CombatEffectDraftMutationResult;
}

/**
 * Planning boundary only. The interpreter never receives a live commit adapter;
 * it creates and discards a working draft and returns a compare-and-swap plan.
 */
export interface CombatEffectPlanningState {
  createDisposableDraft(): CombatEffectDisposableDraft;
}

export interface CombatEffectPlan {
  schema: 1;
  occurrenceId: string;
  sourceId: string;
  programId: string;
  phaseId: string;
  /** Zero-based cadence occurrence. Part of command identity for repeating phases. */
  occurrence: number;
  readSet: CombatEffectAtomicReadSet;
  consequences: ReadonlyArray<CombatEffectConsequence>;
  events?: ReadonlyArray<CombatEffectEvent>;
  initialTallies: Readonly<Record<string, number>>;
  finalTallies: Readonly<Record<string, number>>;
  initialLayerStates?: Readonly<Record<string, "active" | "destroyed">>;
  finalLayerStates?: Readonly<Record<string, "active" | "destroyed">>;
  initialAreaStates?: ReadonlyArray<CombatEffectAreaFact>;
  finalAreaStates?: ReadonlyArray<CombatEffectAreaFact>;
  ended: boolean;
}

function executionFromArtifact(
  artifact: ReviewedCombatEffectArtifact
): CombatEffectExecution {
  return {
    occurrenceId: artifact.occurrenceId,
    phaseId: artifact.phaseId,
    sourceId: artifact.sourceId,
    targets: artifact.targets,
    instances: artifact.instances,
    ...(artifact.instanceTargets === undefined
      ? {}
      : { instanceTargets: artifact.instanceTargets }),
    occurrence: artifact.occurrence,
    ...(artifact.castLevel === undefined ? {} : { castLevel: artifact.castLevel }),
    ...(artifact.effectSource === undefined
      ? {}
      : { effectSource: artifact.effectSource }),
    ...(artifact.sourceConcentration === undefined
      ? {}
      : { sourceConcentration: artifact.sourceConcentration }),
    ...(artifact.encounterPosition === undefined
      ? {}
      : { encounterPosition: artifact.encounterPosition }),
    ...(artifact.characterLevel === undefined
      ? {}
      : { characterLevel: artifact.characterLevel }),
    tallies: artifact.tallies,
    ...(artifact.layerStates === undefined ? {} : { layerStates: artifact.layerStates }),
    ...(artifact.areaStates === undefined ? {} : { areaStates: artifact.areaStates }),
    ...(artifact.bindings === undefined ? {} : { bindings: artifact.bindings }),
    ...(artifact.participants === undefined
      ? {}
      : { participants: artifact.participants }),
    ...(artifact.participantFacts === undefined
      ? {}
      : { participantFacts: artifact.participantFacts }),
    ...(artifact.triggerFacts === undefined
      ? {}
      : { triggerFacts: artifact.triggerFacts }),
    gateContexts: artifact.gateContexts,
  };
}

function assertArtifact(artifact: ReviewedCombatEffectArtifact): void {
  if (!object(artifact)) throw new TypeError("Invalid reviewed artifact");
  const errors: string[] = [];
  exactKeys(
    artifact,
    "artifact",
    [
      "schema",
      "program",
      "occurrenceId",
      "phaseId",
      "trigger",
      "sourceId",
      "targets",
      "instances",
      "occurrence",
      "tallies",
      "gateContexts",
      "answers",
    ],
    [
      "instanceTargets",
      "castLevel",
      "effectSource",
      "sourceConcentration",
      "encounterPosition",
      "characterLevel",
      "layerStates",
      "areaStates",
      "bindings",
      "participants",
      "participantFacts",
      "triggerFacts",
    ],
    errors
  );
  validateJsonPlain(artifact, "artifact", errors);
  if (errors.length) throw new TypeError(errors.join("\n"));
  if ((artifact as JsonObject).schema !== 1) errors.push("artifact.schema: expected 1");
  if (!Array.isArray(artifact.answers)) errors.push("artifact.answers: expected array");
  if (errors.length) throw new TypeError(errors.join("\n"));
  assertCombatEffectProgram(artifact.program);
  const execution = executionFromArtifact(artifact);
  const requirements = deriveCombatEffectRequirements(
    artifact.program,
    execution,
    artifact.answers
  );
  if (
    !Array.isArray(artifact.answers) ||
    artifact.answers.length !== requirements.length
  ) {
    throw new TypeError("Invalid reviewed artifact answers");
  }
  requirements.forEach((requirement, index) => {
    const answer = artifact.answers[index];
    if (!answer || answer.key !== requirement.key) {
      throw new TypeError(`Invalid reviewed artifact answer ${index}`);
    }
    const { value, ...actualRequirement } = answer;
    if (
      JSON.stringify(canonical(actualRequirement)) !==
      JSON.stringify(canonical(requirement))
    ) {
      throw new TypeError(`Invalid reviewed artifact requirement ${index}`);
    }
    validateRequirementAnswer(requirement, value, `artifact.answers[${index}].value`);
  });
  const phase = phaseFor(artifact.program, execution);
  if (
    JSON.stringify(canonical(phase.trigger)) !==
    JSON.stringify(canonical(artifact.trigger))
  ) {
    throw new TypeError("Invalid reviewed artifact trigger");
  }
}

function answerKeyForContext(
  category: "gate" | "input",
  id: string,
  scope: CombatEffectScope,
  context: ProgramContext
): string {
  return requirementKey(
    category,
    id,
    scope,
    context.targetIndex ?? undefined,
    context.instance ?? undefined
  );
}

function compare(left: number, operator: CombatEffectComparison, right: number): boolean {
  switch (operator) {
    case "eq":
      return left === right;
    case "ne":
      return left !== right;
    case "lt":
      return left < right;
    case "lte":
      return left <= right;
    case "gt":
      return left > right;
    case "gte":
      return left >= right;
  }
}

function assertStateView(value: unknown): asserts value is CombatEffectStateView {
  const errors: string[] = [];
  validateJsonPlain(value, "state", errors);
  if (errors.length) throw new TypeError(errors.join("\n"));
  if (!object(value)) throw new TypeError("Combat-effect draft returned invalid state");
  exactKeys(
    value,
    "state",
    [
      "hp",
      "maxHp",
      "tempHp",
      "stable",
      "deathSaves",
      "conditions",
      "conditionLifetimes",
      "standing",
      "standingLifetimes",
      "resources",
      "stateFlags",
    ],
    [],
    errors
  );
  if (errors.length) throw new TypeError(errors.join("\n"));
  if (object(value.deathSaves)) {
    exactKeys(
      value.deathSaves,
      "state.deathSaves",
      ["successes", "failures"],
      [],
      errors
    );
  }
  const lifetimeSets: ReadonlyArray<
    readonly [
      "conditionLifetimes" | "standingLifetimes",
      unknown,
      (candidate: unknown) => boolean,
    ]
  > = [
    ["conditionLifetimes", value.conditions, validCondition],
    ["standingLifetimes", value.standing, validId],
  ];
  for (const [field, active, validKey] of lifetimeSets) {
    const lifetimes = value[field];
    if (!object(lifetimes)) {
      errors.push(`state.${field}: expected record`);
      continue;
    }
    for (const [id, lifetime] of Object.entries(lifetimes)) {
      if (!validKey(id)) errors.push(`state.${field}.${id}: invalid active id`);
      if (lifetime !== null) {
        validateLifetime(lifetime, `state.${field}.${id}`, errors);
      }
    }
    const activeIds: ReadonlyArray<unknown> = Array.isArray(active) ? active : [];
    if (
      !Array.isArray(active) ||
      Object.keys(lifetimes).length !== activeIds.length ||
      activeIds.some((id) => typeof id !== "string" || !Object.hasOwn(lifetimes, id))
    ) {
      errors.push(`state.${field}: keys must exactly match active state`);
    }
  }
  if (
    !safeInteger(value.hp, 0) ||
    !safeInteger(value.maxHp, 0) ||
    value.hp > value.maxHp ||
    !safeInteger(value.tempHp, 0) ||
    typeof value.stable !== "boolean" ||
    !object(value.deathSaves) ||
    !safeInteger(value.deathSaves.successes, 0) ||
    value.deathSaves.successes > 3 ||
    !safeInteger(value.deathSaves.failures, 0) ||
    value.deathSaves.failures > 3 ||
    !Array.isArray(value.conditions) ||
    value.conditions.some((condition) => !validCondition(condition)) ||
    new Set(value.conditions).size !== value.conditions.length ||
    !object(value.conditionLifetimes) ||
    !Array.isArray(value.standing) ||
    value.standing.some((id) => !validId(id)) ||
    new Set(value.standing).size !== value.standing.length ||
    !object(value.standingLifetimes) ||
    !object(value.resources) ||
    Object.entries(value.resources).some(
      ([id, amount]) => !validId(id) || !safeInteger(amount, 0)
    ) ||
    !object(value.stateFlags) ||
    Object.entries(value.stateFlags).some(
      ([id, active]) => !validId(id) || typeof active !== "boolean"
    )
  ) {
    errors.push("state: invalid combat state values");
  }
  if (errors.length) throw new TypeError(errors.join("\n"));
}

/** Strict JSON-safe state-view guard shared by durable command boundaries. */
export function isCombatEffectStateView(value: unknown): value is CombatEffectStateView {
  try {
    assertStateView(value);
    return true;
  } catch {
    return false;
  }
}

interface LandedDamage {
  stepId: string;
  target: CombatOutcomeTarget | null;
  instance: number | null;
  iteration: number;
  amount: number;
}

interface InterpreterRuntime {
  artifact: ReviewedCombatEffectArtifact;
  execution: CombatEffectExecution;
  readSet: CombatEffectAtomicReadSet;
  adapter: CombatEffectDisposableDraft;
  gates: Map<string, CombatEffectGate>;
  inputs: Map<string, CombatEffectInput>;
  answers: Map<string, ReviewedCombatEffectAnswer>;
  counterDefs: Map<string, { id: string; initial: number; scope?: CombatEffectScope }>;
  counters: Map<string, number>;
  layers: Map<string, CombatEffectLayer>;
  layerStates: Map<string, "active" | "destroyed">;
  areaStates: Set<CombatEffectAreaFact>;
  landed: LandedDamage[];
  consequences: CombatEffectConsequence[];
  events: CombatEffectEvent[];
  generatedMutationCount: number;
}

function recipient(
  subject: CombatEffectSubject,
  context: ProgramContext,
  runtime: InterpreterRuntime
): CombatEffectEntityRef {
  return participantRef(subject, context, runtime.execution);
}

function combatantForAtomicOwner(owner: Readonly<AtomicOwner>): CombatantRef {
  if (owner.kind === "monster") {
    return {
      kind: "monster",
      combatantId: owner.combatantId,
    };
  }
  return {
    kind: "pc",
    combatantId: owner.combatantId,
    memberUid: owner.surface === "local" ? owner.uid : owner.memberUid,
    characterId: owner.characterId,
  };
}

function ownerForExecutionRef(
  readSet: Readonly<CombatEffectAtomicReadSet>,
  ref: Readonly<CombatEffectEntityRef>
): AtomicOwner {
  const matches = readSet.bindings.filter((binding) => sameCanonical(binding.ref, ref));
  const binding = matches[0];
  if (matches.length !== 1 || !binding) {
    throw new TypeError("Occurrence materialization has an unbound recipient");
  }
  return binding.owner;
}

function effectBindingsForOccurrence(
  execution: Readonly<CombatEffectExecution>
): ActiveCombatEffect["bindings"] | undefined {
  const spellcastingModifier = execution.bindings?.casterSpellcastingModifier;
  return spellcastingModifier === undefined ? undefined : { spellcastingModifier };
}

function durationForOccurrence(
  lifetime: CombatEffectLifetime | undefined,
  actor: Readonly<CombatantRef>,
  target: Readonly<CombatantRef>,
  execution: Readonly<CombatEffectExecution>
): ActiveCombatEffect["duration"] {
  if (lifetime?.kind === "source-end" && execution.sourceConcentration) {
    if (!execution.effectSource) {
      throw new TypeError("Concentration occurrence requires its exact source");
    }
    return {
      kind: "concentration",
      actorId: actor.combatantId,
      sourceId: execution.effectSource.id,
    };
  }
  if (lifetime?.kind !== "turn-boundary") return { kind: "encounter" };
  const position = execution.encounterPosition;
  if (!position) {
    throw new TypeError("Turn-boundary occurrence requires an encounter position");
  }
  const boundary = turnBoundaryAfter(
    lifetime.subject === "source" ? actor.combatantId : target.combatantId,
    lifetime.offsetTurns,
    lifetime.phase,
    position
  );
  if (!boundary) {
    throw new TypeError("Turn-boundary occurrence cannot resolve its combatant clock");
  }
  return boundary;
}

function materializeProgramOccurrence(
  change: Readonly<CombatEffectOccurrenceChange>,
  runtime: Readonly<InterpreterRuntime>
): Readonly<ActiveCombatEffect> {
  if (!change.descriptor || !runtime.execution.effectSource) {
    throw new TypeError("Occurrence creation requires exact reviewed source metadata");
  }
  const sourceOwner = ownerForExecutionRef(runtime.readSet, {
    kind: "source",
    id: runtime.execution.sourceId,
  });
  const targetOwner = ownerForExecutionRef(runtime.readSet, change.recipient);
  const actor = combatantForAtomicOwner(sourceOwner);
  const target = combatantForAtomicOwner(targetOwner);
  return frozenCanonical({
    id: change.effectId,
    actor,
    target,
    source: {
      ...runtime.execution.effectSource,
      ...(runtime.execution.castLevel === undefined
        ? {}
        : { castLevel: runtime.execution.castLevel }),
    },
    payload:
      change.descriptor.kind === "condition"
        ? { kind: "condition", conditionId: change.descriptor.condition }
        : { kind: "program-standing", effectId: change.descriptor.effectId },
    programOwner: {
      occurrenceId: change.provenance.occurrenceId,
      programId: change.provenance.programId,
      phaseId: change.provenance.phaseId,
      stepId: change.provenance.stepId,
      operationId: combatEffectOccurrenceInitialHeadId(change.effectId),
      instance: change.provenance.instance,
      iteration: change.provenance.iteration,
    },
    ...(change.descriptor.lifetime === undefined
      ? {}
      : { authoredLifetime: change.descriptor.lifetime }),
    ...(effectBindingsForOccurrence(runtime.execution) === undefined
      ? {}
      : { bindings: effectBindingsForOccurrence(runtime.execution) }),
    duration: durationForOccurrence(
      change.descriptor.lifetime,
      actor,
      target,
      runtime.execution
    ),
  });
}

function materializePersistentConsequences(
  consequences: Readonly<CombatEffectPersistentConsequences>,
  runtime: Readonly<InterpreterRuntime>
): Readonly<CombatEffectPersistentConsequences> {
  return frozenCanonical({
    occurrenceChanges: consequences.occurrenceChanges.map((change) =>
      change.expectedHeadOpId === null
        ? {
            ...change,
            materializedEffect: materializeProgramOccurrence(change, runtime),
          }
        : change
    ),
  });
}

function counterValue(
  counterId: string,
  context: ProgramContext,
  runtime: InterpreterRuntime
): number {
  const counter = requiredMapValue(runtime.counterDefs, counterId, "counter");
  return requiredMapValue(
    runtime.counters,
    scopedStateKey(counterId, counter.scope ?? "program", context),
    "counter state"
  );
}

function layerState(
  layerId: string,
  context: ProgramContext,
  runtime: InterpreterRuntime
): "active" | "destroyed" {
  const layer = requiredMapValue(runtime.layers, layerId, "layer");
  return requiredMapValue(
    runtime.layerStates,
    scopedStateKey(layerId, layer.scope, context),
    "layer state"
  );
}

function answerFor(
  category: "gate" | "input",
  id: string,
  scope: CombatEffectScope,
  context: ProgramContext,
  runtime: InterpreterRuntime
): ReviewedCombatEffectAnswer {
  const answer = runtime.answers.get(answerKeyForContext(category, id, scope, context));
  if (!answer) throw new TypeError(`Reviewed artifact is missing ${category} ${id}`);
  return answer;
}

function gateOutcome(
  gateId: string,
  context: ProgramContext,
  runtime: InterpreterRuntime
): CombatEffectGateResult {
  const gate = requiredMapValue(runtime.gates, gateId, "gate");
  const answer = answerFor("gate", gateId, gate.scope, context, runtime);
  const outcome = resolvedGateOutcome(gate, answer.value);
  if (outcome === undefined) {
    throw new TypeError(`Reviewed artifact gate ${gateId} has no D20 outcome`);
  }
  return outcome;
}

function inputValue(
  inputId: string,
  context: ProgramContext,
  runtime: InterpreterRuntime
): CombatEffectDiceFact | string {
  const input = requiredMapValue(runtime.inputs, inputId, "input");
  return answerFor("input", inputId, input.scope, context, runtime).value as
    | CombatEffectDiceFact
    | string;
}

function transformAmount(
  base: number,
  amount: Pick<CombatEffectAmountSpec, "multiplier" | "add" | "rounding">
): number {
  const raw = base * (amount.multiplier ?? 1) + (amount.add ?? 0);
  const result = amount.rounding === "ceil" ? Math.ceil(raw) : Math.floor(raw);
  if (!safeInteger(result, 0))
    throw new RangeError("Resolved amount is not a safe non-negative integer");
  return result;
}

function resolveAmountTerm(
  amount: CombatEffectAmountTerm,
  context: ProgramContext,
  runtime: InterpreterRuntime
): number {
  if (amount.kind === "fixed") return transformAmount(amount.value, amount);
  if (amount.kind === "counter") {
    return transformAmount(counterValue(amount.counterId, context, runtime), amount);
  }
  if (amount.kind === "binding") {
    return transformAmount(bindingValue(amount.binding, runtime.execution), amount);
  }
  if (amount.kind === "scaled") {
    return transformAmount(
      resolveScaledValue(amount.value, runtime.execution, runtime.counters),
      amount
    );
  }
  const value = inputValue(amount.inputId, context, runtime);
  if (typeof value === "string")
    throw new TypeError("Choice input cannot resolve an amount");
  return transformAmount(value.total, amount);
}

function resolveAmount(
  amount: CombatEffectAmountSpec,
  context: ProgramContext,
  runtime: InterpreterRuntime
): number {
  if (amount.kind !== "sum") return resolveAmountTerm(amount, context, runtime);
  let total = 0;
  for (const term of amount.terms) {
    const next = total + resolveAmountTerm(term, context, runtime);
    if (!safeInteger(next, 0)) {
      throw new RangeError("Resolved amount sum is not a safe non-negative integer");
    }
    total = next;
  }
  return transformAmount(total, amount);
}

function resolveDamageType(
  spec: CombatEffectDamageTypeSpec,
  context: ProgramContext,
  runtime: InterpreterRuntime
): DamageType {
  if (spec.kind === "fixed") return spec.damageType;
  const value = inputValue(spec.inputId, context, runtime);
  if (spec.kind === "choice") {
    if (typeof value !== "string" || !DAMAGE_TYPES.has(value)) {
      throw new TypeError("Damage choice did not resolve to one damage type");
    }
    return value as DamageType;
  }
  if (typeof value === "string")
    throw new TypeError("Damage table requires a roll total");
  const row = spec.rows.find(
    (candidate) => value.total >= candidate.min && value.total <= candidate.max
  );
  if (!row) throw new TypeError("Damage table roll has no authored row");
  return row.damageType;
}

function contextualLanded(
  stepId: string,
  context: ProgramContext,
  iteration: number,
  runtime: InterpreterRuntime
): number {
  return runtime.landed
    .filter(
      (entry) =>
        entry.stepId === stepId &&
        entry.iteration === iteration &&
        (context.target === null ||
          sameTarget(entry.target ?? undefined, context.target)) &&
        (context.instance === null || entry.instance === context.instance)
    )
    .reduce((sum, entry) => sum + entry.amount, 0);
}

function predicateValue(
  predicate: CombatEffectPredicate,
  context: ProgramContext,
  iteration: number,
  runtime: InterpreterRuntime
): boolean | undefined {
  return evaluatePredicateTree(predicate, (leaf) => {
    switch (leaf.kind) {
      case "gate":
      case "choice":
      case "table-roll":
        return answerPredicateValue(
          leaf,
          context,
          runtime.gates,
          runtime.inputs,
          (key) => runtime.answers.get(key)?.value
        );
      case "counter":
        return compare(
          counterValue(leaf.counterId, context, runtime),
          leaf.comparison,
          leaf.value
        );
      case "layer":
        return layerState(leaf.layerId, context, runtime) === leaf.state;
      case "trigger-fact":
        return triggerFactPredicateValue(leaf, runtime.execution.triggerFacts);
      case "state":
      case "resource":
      case "condition":
      case "standing":
      case "stable": {
        const subject = recipient(leaf.subject, context, runtime);
        if (leaf.kind === "condition") {
          return (
            runtime.adapter.conditionPresent(subject, leaf.condition) === leaf.present
          );
        }
        if (leaf.kind === "standing") {
          return runtime.adapter.standingPresent(subject, leaf.effectId) === leaf.present;
        }
        const state = runtime.adapter.read(subject);
        assertStateView(state);
        if (leaf.kind === "state") {
          const value =
            leaf.field === "hp"
              ? state.hp
              : leaf.field === "max-hp"
                ? state.maxHp
                : state.tempHp;
          return compare(value, leaf.comparison, leaf.value);
        }
        if (leaf.kind === "resource") {
          return compare(
            runtime.adapter.resourceValue(subject, leaf.resourceId),
            leaf.comparison,
            leaf.value
          );
        }
        return state.stable === leaf.value;
      }
      case "landed-damage":
        return compare(
          contextualLanded(leaf.stepId, context, iteration, runtime),
          leaf.comparison,
          leaf.value
        );
    }
  });
}

function predicateMatches(
  predicate: CombatEffectPredicate,
  context: ProgramContext,
  iteration: number,
  runtime: InterpreterRuntime
): boolean {
  return predicateValue(predicate, context, iteration, runtime) === true;
}

function provenance(
  step: CombatEffectStep,
  context: ProgramContext,
  iteration: number,
  runtime: InterpreterRuntime
): CombatEffectProvenance {
  return {
    occurrenceId: runtime.artifact.occurrenceId,
    programId: runtime.artifact.program.id,
    phaseId: runtime.artifact.phaseId,
    stepId: step.id,
    target: context.target,
    instance: context.instance,
    iteration,
  };
}

function numericStateDelta(
  mutation: CombatEffectMutation,
  before: CombatEffectStateView,
  after: CombatEffectStateView
): number {
  switch (mutation.kind) {
    case "damage":
    case "resolved-damage":
      return before.hp + before.tempHp - after.hp - after.tempHp;
    case "heal":
      return after.hp - before.hp;
    case "temp-hp":
      return Math.max(0, after.tempHp - before.tempHp);
    case "resource":
      return Math.abs(
        (after.resources[mutation.resourceId] ?? 0) -
          (before.resources[mutation.resourceId] ?? 0)
      );
    case "damage-reduction":
      return 0;
    default:
      throw new TypeError(`${mutation.kind} is not a numeric mutation`);
  }
}

const OCCURRENCE_CHANGE_REASONS = new Set<CombatEffectOccurrenceChangeReason>([
  "program-apply",
  "program-remove",
  "program-start",
  "program-end",
  "damage-consume",
]);

function validateOccurrenceFingerprint(
  value: unknown,
  path: string,
  errors: string[]
): value is CombatEffectOccurrenceFingerprint {
  if (!object(value)) {
    errors.push(`${path}: expected object`);
    return false;
  }
  exactKeys(value, path, ["programOwner", "payload"], [], errors);
  const owner = value.programOwner;
  if (owner !== null) {
    if (!object(owner)) {
      errors.push(`${path}.programOwner: expected object or null`);
    } else {
      exactKeys(
        owner,
        `${path}.programOwner`,
        [
          "occurrenceId",
          "programId",
          "phaseId",
          "stepId",
          "operationId",
          "instance",
          "iteration",
        ],
        [],
        errors
      );
      for (const field of [
        "occurrenceId",
        "programId",
        "phaseId",
        "stepId",
        "operationId",
      ] as const) {
        if (typeof owner[field] !== "string" || owner[field].length === 0) {
          errors.push(`${path}.programOwner.${field}: expected non-empty id`);
        }
      }
      if (owner.instance !== null && !safeInteger(owner.instance, 0)) {
        errors.push(
          `${path}.programOwner.instance: expected non-negative integer or null`
        );
      }
      if (!safeInteger(owner.iteration, 0)) {
        errors.push(`${path}.programOwner.iteration: expected non-negative integer`);
      }
    }
  }
  const payload = value.payload;
  if (!object(payload)) {
    errors.push(`${path}.payload: expected object`);
    return false;
  }
  if (payload.kind === "grant-group") {
    exactKeys(payload, `${path}.payload`, ["kind", "activeKey"], ["phase"], errors);
    if (typeof payload.activeKey !== "string" || payload.activeKey.length === 0) {
      errors.push(`${path}.payload.activeKey: expected non-empty id`);
    }
    if (
      payload.phase !== undefined &&
      payload.phase !== "active" &&
      payload.phase !== "aftereffect"
    ) {
      errors.push(`${path}.payload.phase: expected active or aftereffect`);
    }
  } else if (payload.kind === "target-mark") {
    exactKeys(payload, `${path}.payload`, ["kind", "activeKey", "scope"], [], errors);
    if (typeof payload.activeKey !== "string" || payload.activeKey.length === 0) {
      errors.push(`${path}.payload.activeKey: expected non-empty id`);
    }
    if (
      payload.scope !== "marked" &&
      payload.scope !== "cursed" &&
      payload.scope !== "vowed"
    ) {
      errors.push(`${path}.payload.scope: expected target-mark scope`);
    }
  } else if (payload.kind === "condition") {
    exactKeys(payload, `${path}.payload`, ["kind", "conditionId"], [], errors);
    if (!CONDITIONS.has(payload.conditionId as ConditionId)) {
      errors.push(`${path}.payload.conditionId: expected condition id`);
    }
  } else if (payload.kind === "program-standing") {
    exactKeys(payload, `${path}.payload`, ["kind", "effectId"], [], errors);
    if (typeof payload.effectId !== "string" || payload.effectId.length === 0) {
      errors.push(`${path}.payload.effectId: expected non-empty id`);
    }
    if (owner === null) {
      errors.push(`${path}.programOwner: program standing requires an owner`);
    }
  } else {
    errors.push(`${path}.payload.kind: expected occurrence payload`);
  }
  return true;
}

function fingerprintMatchesProgramRemoval(
  fingerprint: CombatEffectOccurrenceFingerprint,
  mutation: Extract<CombatEffectMutation, { kind: "condition" | "standing" }>
): boolean {
  const owner = fingerprint.programOwner;
  const payload = fingerprint.payload;
  if (!object(owner) || !object(payload)) return false;
  return (
    owner.occurrenceId === mutation.provenance.occurrenceId &&
    owner.programId === mutation.provenance.programId &&
    (mutation.kind === "condition"
      ? payload.kind === "condition" && payload.conditionId === mutation.condition
      : payload.kind === "program-standing" && payload.effectId === mutation.effectId)
  );
}

function materializedEffectMatchesCreation(
  change: Readonly<CombatEffectOccurrenceChange>
): boolean {
  const effect = change.materializedEffect;
  const descriptor = change.descriptor;
  if (
    !effect ||
    !descriptor ||
    !isAtomicOccurrenceRuleIdentity(effect) ||
    effect.id !== change.effectId ||
    effect.applied !== undefined ||
    !sameCanonical(effect.authoredLifetime, descriptor.lifetime)
  ) {
    return false;
  }
  return sameCanonical(combatEffectOccurrenceFingerprint(effect), {
    programOwner: {
      occurrenceId: change.provenance.occurrenceId,
      programId: change.provenance.programId,
      phaseId: change.provenance.phaseId,
      stepId: change.provenance.stepId,
      operationId: combatEffectOccurrenceInitialHeadId(change.effectId),
      instance: change.provenance.instance,
      iteration: change.provenance.iteration,
    },
    payload:
      descriptor.kind === "condition"
        ? { kind: "condition", conditionId: descriptor.condition }
        : { kind: "program-standing", effectId: descriptor.effectId },
  });
}

function validatePersistentConsequences(
  value: unknown,
  mutation: Readonly<CombatEffectMutation>,
  materialization: "draft" | "committed" = "committed"
): asserts value is CombatEffectPersistentConsequences {
  const errors: string[] = [];
  validateJsonPlain(value, "persistent consequences", errors);
  if (errors.length) throw new TypeError(errors.join("\n"));
  if (!object(value)) throw new TypeError("persistent consequences: expected object");
  exactKeys(value, "persistent consequences", ["occurrenceChanges"], [], errors);
  if (!Array.isArray(value.occurrenceChanges)) {
    errors.push("persistent consequences: expected occurrenceChanges array");
  }
  if (errors.length) throw new TypeError(errors.join("\n"));
  const occurrenceEntries = value.occurrenceChanges as unknown[];
  const occurrenceIds = new Set<string>();
  for (const [index, raw] of occurrenceEntries.entries()) {
    if (!object(raw)) {
      errors.push(`persistent consequences.occurrenceChanges[${index}]: expected object`);
      continue;
    }
    exactKeys(
      raw,
      `persistent consequences.occurrenceChanges[${index}]`,
      [
        "effectId",
        "provenance",
        "recipient",
        "expectedHeadOpId",
        "expectedActive",
        "active",
        "reason",
      ],
      ["expectedEffect", "materializedEffect", "descriptor"],
      errors
    );
    if (typeof raw.effectId !== "string" || raw.effectId.length === 0) {
      errors.push(`persistent consequences.occurrenceChanges[${index}].effectId`);
    } else if (occurrenceIds.has(raw.effectId)) {
      errors.push(
        `persistent consequences.occurrenceChanges[${index}]: duplicate effect`
      );
    } else occurrenceIds.add(raw.effectId);
    if (
      JSON.stringify(canonical(raw.provenance)) !==
        JSON.stringify(canonical(mutation.provenance)) ||
      JSON.stringify(canonical(raw.recipient)) !==
        JSON.stringify(canonical(mutation.recipient))
    ) {
      errors.push(`persistent consequences.occurrenceChanges[${index}]: stale owner`);
    }
    if (
      (raw.expectedHeadOpId !== null &&
        (typeof raw.expectedHeadOpId !== "string" ||
          raw.expectedHeadOpId.length === 0)) ||
      typeof raw.expectedActive !== "boolean" ||
      typeof raw.active !== "boolean" ||
      raw.expectedActive === raw.active ||
      !OCCURRENCE_CHANGE_REASONS.has(raw.reason as CombatEffectOccurrenceChangeReason)
    ) {
      errors.push(`persistent consequences.occurrenceChanges[${index}]: invalid state`);
    }
    if (raw.expectedEffect !== undefined) {
      validateOccurrenceFingerprint(
        raw.expectedEffect,
        `persistent consequences.occurrenceChanges[${index}].expectedEffect`,
        errors
      );
    }
    if (
      raw.materializedEffect !== undefined &&
      !isAtomicOccurrenceRuleIdentity(raw.materializedEffect)
    ) {
      errors.push(
        `persistent consequences.occurrenceChanges[${index}].materializedEffect`
      );
    }
    if (materialization === "draft" && raw.materializedEffect !== undefined) {
      errors.push(
        `persistent consequences.occurrenceChanges[${index}].materializedEffect: draft must omit engine-owned identity`
      );
    }
    if (raw.descriptor !== undefined) {
      if (!object(raw.descriptor)) {
        errors.push(`persistent consequences.occurrenceChanges[${index}].descriptor`);
      } else if (raw.descriptor.kind === "condition") {
        exactKeys(
          raw.descriptor,
          `persistent consequences.occurrenceChanges[${index}].descriptor`,
          ["kind", "condition"],
          ["lifetime"],
          errors
        );
        if (!CONDITIONS.has(raw.descriptor.condition as ConditionId)) {
          errors.push(`persistent consequences.occurrenceChanges[${index}].condition`);
        }
      } else if (raw.descriptor.kind === "standing") {
        exactKeys(
          raw.descriptor,
          `persistent consequences.occurrenceChanges[${index}].descriptor`,
          ["kind", "effectId"],
          ["lifetime"],
          errors
        );
        if (typeof raw.descriptor.effectId !== "string" || !raw.descriptor.effectId) {
          errors.push(`persistent consequences.occurrenceChanges[${index}].standing`);
        }
      } else {
        errors.push(`persistent consequences.occurrenceChanges[${index}].descriptor`);
      }
      if (object(raw.descriptor) && Object.hasOwn(raw.descriptor, "lifetime")) {
        validateLifetime(
          raw.descriptor.lifetime,
          `persistent consequences.occurrenceChanges[${index}].descriptor.lifetime`,
          errors
        );
      }
    }
  }
  if (mutation.kind === "condition" || mutation.kind === "standing") {
    const changes = occurrenceEntries as ReadonlyArray<CombatEffectOccurrenceChange>;
    const expectedReason =
      mutation.kind === "condition"
        ? mutation.operation === "apply"
          ? "program-apply"
          : "program-remove"
        : mutation.operation === "start"
          ? "program-start"
          : "program-end";
    if (changes.some((change) => change.reason !== expectedReason)) {
      errors.push(`${mutation.kind} occurrence change has the wrong reason`);
    }
    if (mutation.operation === "apply" || mutation.operation === "start") {
      const change = changes[0];
      if (
        changes.length !== 1 ||
        !change ||
        change.expectedHeadOpId !== null ||
        change.expectedEffect !== undefined ||
        (materialization === "committed"
          ? !materializedEffectMatchesCreation(change)
          : change.materializedEffect !== undefined) ||
        change.expectedActive ||
        !change.active ||
        change.effectId !== combatEffectOccurrenceId(mutation) ||
        (mutation.kind === "condition"
          ? change.descriptor?.kind !== "condition" ||
            change.descriptor.condition !== mutation.condition ||
            JSON.stringify(canonical(change.descriptor.lifetime)) !==
              JSON.stringify(canonical(mutation.lifetime))
          : change.descriptor?.kind !== "standing" ||
            change.descriptor.effectId !== mutation.effectId ||
            JSON.stringify(canonical(change.descriptor.lifetime)) !==
              JSON.stringify(canonical(mutation.lifetime)))
      ) {
        errors.push(`${mutation.kind} create must own one exact occurrence`);
      }
    } else if (
      changes.some(
        (change) =>
          typeof change.expectedHeadOpId !== "string" ||
          change.expectedEffect === undefined ||
          change.materializedEffect !== undefined ||
          !fingerprintMatchesProgramRemoval(change.expectedEffect, mutation) ||
          !change.expectedActive ||
          change.active ||
          change.descriptor !== undefined
      )
    ) {
      errors.push(`${mutation.kind} removal must deactivate owned occurrences`);
    }
  } else if (
    mutation.kind !== "damage" &&
    mutation.kind !== "resolved-damage" &&
    occurrenceEntries.length > 0
  ) {
    errors.push(`${mutation.kind} cannot change persistent occurrences`);
  }
  if (
    (mutation.kind === "damage" || mutation.kind === "resolved-damage") &&
    (occurrenceEntries as ReadonlyArray<CombatEffectOccurrenceChange>).some(
      (change) =>
        change.reason !== "damage-consume" ||
        typeof change.expectedHeadOpId !== "string" ||
        change.expectedEffect === undefined ||
        !change.expectedActive ||
        change.active ||
        change.descriptor !== undefined
    )
  ) {
    errors.push("damage may only consume exact active occurrences");
  }
  if (errors.length) throw new TypeError(errors.join("\n"));
}

/** Strict receipt guard reused by the durable command deserializer. */
export function isCombatEffectPersistentConsequences(
  value: unknown,
  mutation: Readonly<CombatEffectMutation>
): value is CombatEffectPersistentConsequences {
  try {
    validatePersistentConsequences(value, mutation);
    return true;
  } catch {
    return false;
  }
}

const STATE_VIEW_FIELDS = [
  "hp",
  "maxHp",
  "tempHp",
  "stable",
  "deathSaves",
  "conditions",
  "conditionLifetimes",
  "standing",
  "standingLifetimes",
  "resources",
  "stateFlags",
] as const satisfies ReadonlyArray<keyof CombatEffectStateView>;

function sameCanonical(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function changedRecordKeys(
  before: Readonly<Record<string, unknown>>,
  after: Readonly<Record<string, unknown>>
): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys]
    .filter(
      (key) =>
        Object.hasOwn(before, key) !== Object.hasOwn(after, key) ||
        !sameCanonical(before[key], after[key])
    )
    .sort();
}

function assertMutationOwnedState(
  mutation: Readonly<CombatEffectMutation>,
  before: Readonly<CombatEffectStateView>,
  after: Readonly<CombatEffectStateView>
): void {
  const allowed = new Set<keyof CombatEffectStateView>(
    mutation.kind === "damage" || mutation.kind === "resolved-damage"
      ? ["hp", "tempHp", "stable", "deathSaves", "conditions", "conditionLifetimes"]
      : mutation.kind === "heal"
        ? ["hp", "stable", "deathSaves", "conditions", "conditionLifetimes"]
        : mutation.kind === "temp-hp"
          ? ["tempHp"]
          : mutation.kind === "resource"
            ? ["resources"]
            : mutation.kind === "stabilize"
              ? ["stable", "deathSaves"]
              : mutation.kind === "state-flag"
                ? ["stateFlags"]
                : []
  );
  const foreign = STATE_VIEW_FIELDS.filter(
    (field) => !allowed.has(field) && !sameCanonical(before[field], after[field])
  );
  if (foreign.length > 0) {
    throw new TypeError(
      `${mutation.kind} draft receipt changed unowned state: ${foreign.join(", ")}`
    );
  }
  if (mutation.kind === "resource") {
    const changed = changedRecordKeys(before.resources, after.resources);
    if (changed.some((key) => key !== mutation.resourceId)) {
      throw new TypeError("resource draft receipt changed another resource");
    }
    const prior = before.resources[mutation.resourceId];
    const next = after.resources[mutation.resourceId];
    if (
      prior === undefined ||
      next === undefined ||
      (mutation.operation === "spend" ? next > prior : next < prior)
    ) {
      throw new TypeError("resource draft receipt has the wrong direction");
    }
  }
  if (mutation.kind === "state-flag") {
    const changed = changedRecordKeys(before.stateFlags, after.stateFlags);
    const expectedBefore = mutation.operation === "deactivate";
    const expectedAfter = !expectedBefore;
    if (
      changed.length !== 1 ||
      changed[0] !== mutation.stateKey ||
      before.stateFlags[mutation.stateKey] !== expectedBefore ||
      after.stateFlags[mutation.stateKey] !== expectedAfter
    ) {
      throw new TypeError("state-flag draft receipt has the wrong exact-key transition");
    }
  }
}

/** Shared trust-boundary predicate for durable command deserialization. */
export function isCombatEffectMutationOwnedState(
  mutation: Readonly<CombatEffectMutation>,
  before: Readonly<CombatEffectStateView>,
  after: Readonly<CombatEffectStateView>
): boolean {
  try {
    assertMutationOwnedState(mutation, before, after);
    return true;
  } catch {
    return false;
  }
}

function validateCombatantRef(
  value: unknown,
  path: string,
  errors: string[]
): value is CombatantRef {
  if (!object(value)) {
    errors.push(`${path}: expected combatant reference`);
    return false;
  }
  if (value.kind === "pc") {
    exactKeys(
      value,
      path,
      ["kind", "combatantId", "memberUid", "characterId"],
      [],
      errors
    );
    for (const field of ["combatantId", "memberUid", "characterId"] as const) {
      if (typeof value[field] !== "string" || value[field].length === 0) {
        errors.push(`${path}.${field}: expected non-empty id`);
      }
    }
    return true;
  }
  if (value.kind === "monster") {
    exactKeys(value, path, ["kind", "combatantId"], [], errors);
    if (typeof value.combatantId !== "string" || value.combatantId.length === 0) {
      errors.push(`${path}.combatantId: expected non-empty id`);
    }
    return true;
  }
  errors.push(`${path}.kind: invalid combatant reference`);
  return false;
}

function validateObservedEffect(
  value: unknown,
  path: string,
  errors: string[]
): value is ActiveCombatEffect {
  const priorErrorCount = errors.length;
  validateJsonPlain(value, path, errors);
  if (errors.length !== priorErrorCount) return false;
  if (!object(value)) {
    errors.push(`${path}: expected active combat effect`);
    return false;
  }
  exactKeys(
    value,
    path,
    ["id", "actor", "target", "source", "payload", "duration"],
    ["programOwner", "authoredLifetime", "bindings", "applied"],
    errors
  );
  if (typeof value.id !== "string" || value.id.length === 0) {
    errors.push(`${path}.id: expected non-empty id`);
  }
  validateCombatantRef(value.actor, `${path}.actor`, errors);
  validateCombatantRef(value.target, `${path}.target`, errors);
  if (!object(value.source)) {
    errors.push(`${path}.source: expected source`);
  } else {
    exactKeys(
      value.source,
      `${path}.source`,
      ["kind", "id", "actionId"],
      ["castLevel"],
      errors
    );
    if (value.source.kind !== "spell" && value.source.kind !== "feature") {
      errors.push(`${path}.source.kind: invalid source kind`);
    }
    for (const field of ["id", "actionId"] as const) {
      if (typeof value.source[field] !== "string" || value.source[field].length === 0) {
        errors.push(`${path}.source.${field}: expected non-empty id`);
      }
    }
    if (value.source.castLevel !== undefined && !safeInteger(value.source.castLevel, 1)) {
      errors.push(`${path}.source.castLevel: expected positive integer`);
    }
  }
  validateOccurrenceFingerprint(
    {
      programOwner: value.programOwner ?? null,
      payload: value.payload,
    },
    `${path}.fingerprint`,
    errors
  );
  if (value.authoredLifetime !== undefined) {
    validateLifetime(value.authoredLifetime, `${path}.authoredLifetime`, errors);
  }
  if (value.bindings !== undefined) {
    if (!object(value.bindings)) {
      errors.push(`${path}.bindings: expected object`);
    } else {
      exactKeys(value.bindings, `${path}.bindings`, [], ["spellcastingModifier"], errors);
      if (
        value.bindings.spellcastingModifier !== undefined &&
        !safeInteger(value.bindings.spellcastingModifier)
      ) {
        errors.push(`${path}.bindings.spellcastingModifier: expected integer`);
      }
    }
  }
  if (value.applied !== undefined) {
    if (!object(value.applied)) {
      errors.push(`${path}.applied: expected object`);
    } else {
      exactKeys(value.applied, `${path}.applied`, [], ["currentHpDelta"], errors);
      if (
        value.applied.currentHpDelta !== undefined &&
        !safeInteger(value.applied.currentHpDelta)
      ) {
        errors.push(`${path}.applied.currentHpDelta: expected integer`);
      }
    }
  }
  if (!object(value.duration)) {
    errors.push(`${path}.duration: expected duration`);
  } else if (value.duration.kind === "encounter") {
    exactKeys(value.duration, `${path}.duration`, ["kind"], [], errors);
  } else if (value.duration.kind === "concentration") {
    exactKeys(
      value.duration,
      `${path}.duration`,
      ["kind", "actorId", "sourceId"],
      [],
      errors
    );
    for (const field of ["actorId", "sourceId"] as const) {
      if (
        typeof value.duration[field] !== "string" ||
        value.duration[field].length === 0
      ) {
        errors.push(`${path}.duration.${field}: expected non-empty id`);
      }
    }
  } else if (value.duration.kind === "turn-boundary") {
    exactKeys(
      value.duration,
      `${path}.duration`,
      ["kind", "combatantId", "round", "phase"],
      [],
      errors
    );
    if (
      typeof value.duration.combatantId !== "string" ||
      value.duration.combatantId.length === 0
    ) {
      errors.push(`${path}.duration.combatantId: expected non-empty id`);
    }
    if (!safeInteger(value.duration.round, 0)) {
      errors.push(`${path}.duration.round: expected non-negative integer`);
    }
    if (value.duration.phase !== "turn-start" && value.duration.phase !== "turn-end") {
      errors.push(`${path}.duration.phase: invalid turn boundary`);
    }
  } else {
    errors.push(`${path}.duration.kind: invalid duration`);
  }
  if (!isActiveCombatEffect(value)) {
    errors.push(`${path}: invalid active combat effect`);
    return false;
  }
  return true;
}

function combatantMatchesEntityRef(
  combatant: Readonly<CombatantRef>,
  recipient: Readonly<CombatEffectEntityRef>
): boolean {
  const combatantId =
    recipient.kind === "source" ? recipient.id : recipient.target.combatantId;
  return combatant.combatantId === combatantId;
}

function validatedGeneratedIntent(
  value: unknown,
  index: number,
  parent: Readonly<Extract<CombatEffectMutation, { kind: "damage" | "resolved-damage" }>>,
  parentAppliedAmount: number,
  parentBefore: Readonly<CombatEffectStateView>,
  parentAfter: Readonly<CombatEffectStateView>,
  siblingStateKeys: Set<string>,
  siblingSourceEffectIds: Set<string>
): CombatEffectGeneratedMutationIntent {
  const path = `generatedMutations[${index}]`;
  const errors: string[] = [];
  validateJsonPlain(value, path, errors);
  if (errors.length > 0) throw new TypeError(errors.join("\n"));
  if (!object(value)) {
    throw new TypeError(`${path}: expected generated intent`);
  }
  exactKeys(value, path, ["mutation", "source"], [], errors);
  if (!object(value.mutation) || !object(value.source)) {
    errors.push(`${path}: expected mutation and source`);
  } else if (value.mutation.kind === "state-flag") {
    const mutation = value.mutation;
    const source = value.source;
    exactKeys(
      mutation,
      `${path}.mutation`,
      ["kind", "operation", "stateKey", "provenance", "recipient"],
      [],
      errors
    );
    exactKeys(
      source,
      `${path}.source`,
      ["kind", "recipient", "stateKey", "expectedActive", "hitPoints"],
      [],
      errors
    );
    if (mutation.operation !== "deactivate") {
      errors.push(
        `${path}.mutation.operation: generated flags only consume active state`
      );
    }
    try {
      runtimeId(mutation.stateKey, `${path}.mutation.stateKey`);
      if (siblingStateKeys.has(mutation.stateKey)) {
        errors.push(`${path}.mutation.stateKey: duplicate sibling state flag`);
      } else {
        siblingStateKeys.add(mutation.stateKey);
      }
      validateEntityRef(mutation.recipient, `${path}.mutation.recipient`);
      validateEntityRef(source.recipient, `${path}.source.recipient`);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
    if (source.kind !== "state-flag") {
      errors.push(`${path}.source.kind: expected state-flag observation`);
    }
    if (
      source.stateKey !== mutation.stateKey ||
      source.expectedActive !== true ||
      !safeInteger(source.hitPoints, 1)
    ) {
      errors.push(`${path}.source: stale state-floor observation`);
    }
    if (
      !sameCanonical(mutation.recipient, parent.recipient) ||
      !sameCanonical(source.recipient, parent.recipient)
    ) {
      errors.push(`${path}.source.recipient: state flag escaped parent`);
    }
    if (
      typeof mutation.stateKey === "string" &&
      (parentBefore.stateFlags[mutation.stateKey] !== true ||
        parentAfter.stateFlags[mutation.stateKey] !== true ||
        (safeInteger(source.hitPoints, 1) && parentAfter.hp !== source.hitPoints))
    ) {
      errors.push(`${path}.source: parent did not observe one active state flag`);
    }
  } else if (value.mutation.kind === "resolved-damage") {
    const mutation = value.mutation;
    const source = value.source;
    exactKeys(
      mutation,
      `${path}.mutation`,
      ["kind", "amount", "sourceEffectId", "transferPath", "provenance", "recipient"],
      [],
      errors
    );
    exactKeys(
      source,
      `${path}.source`,
      ["kind", "recipient", "effect", "expectedHeadOpId", "expectedActive"],
      [],
      errors
    );
    if (!safeInteger(mutation.amount, 0)) {
      errors.push(`${path}.mutation.amount: expected non-negative integer`);
    } else if (mutation.amount !== parentAppliedAmount) {
      errors.push(`${path}.mutation.amount: must equal parent applied amount`);
    }
    let mutationRecipient: CombatEffectEntityRef | null = null;
    let sourceRecipient: CombatEffectEntityRef | null = null;
    try {
      runtimeId(mutation.sourceEffectId, `${path}.mutation.sourceEffectId`);
      if (siblingSourceEffectIds.has(mutation.sourceEffectId)) {
        errors.push(`${path}.mutation.sourceEffectId: duplicate sibling transfer effect`);
      } else {
        siblingSourceEffectIds.add(mutation.sourceEffectId);
      }
      mutationRecipient = validateEntityRef(
        mutation.recipient,
        `${path}.mutation.recipient`
      );
      sourceRecipient = validateEntityRef(source.recipient, `${path}.source.recipient`);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
    if (source.kind !== "effect-occurrence") {
      errors.push(`${path}.source.kind: expected effect occurrence`);
    } else {
      const effect = source.effect;
      const validEffect = validateObservedEffect(effect, `${path}.source.effect`, errors);
      if (
        typeof source.expectedHeadOpId !== "string" ||
        source.expectedHeadOpId.length === 0 ||
        source.expectedActive !== true
      ) {
        errors.push(`${path}.source: expected one exact active ledger head`);
      }
      if (!sameCanonical(source.recipient, parent.recipient)) {
        errors.push(`${path}.source.recipient: transfer source escaped parent`);
      }
      if (validEffect && sourceRecipient && mutationRecipient) {
        if (
          effect.id !== mutation.sourceEffectId ||
          !combatantMatchesEntityRef(effect.target, sourceRecipient) ||
          !combatantMatchesEntityRef(effect.actor, mutationRecipient)
        ) {
          errors.push(`${path}.source.effect: stale transfer occurrence identity`);
        }
        try {
          if (
            !resolveCombatEffectGrants(effect).some(
              (grant) => grant.type === "damage-transfer"
            )
          ) {
            errors.push(`${path}.source.effect: occurrence does not transfer damage`);
          }
        } catch {
          errors.push(`${path}.source.effect: unresolved rule source`);
        }
      }
    }
    if (!Array.isArray(mutation.transferPath) || mutation.transferPath.length === 0) {
      errors.push(`${path}.mutation.transferPath: expected non-empty path`);
    } else {
      const transferPath = mutation.transferPath;
      for (const [pathIndex, effectId] of transferPath.entries()) {
        try {
          runtimeId(effectId, `${path}.mutation.transferPath[${pathIndex}]`);
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
        }
      }
      const prefix = parent.kind === "resolved-damage" ? parent.transferPath : [];
      if (
        transferPath.length !== prefix.length + 1 ||
        prefix.some((effectId, pathIndex) => transferPath[pathIndex] !== effectId) ||
        transferPath.at(-1) !== mutation.sourceEffectId ||
        new Set(transferPath).size !== transferPath.length
      ) {
        errors.push(`${path}.mutation.transferPath: must append one unvisited effect`);
      }
    }
  } else {
    errors.push(`${path}.mutation.kind: invalid deterministic follow-up`);
  }
  if (
    object(value.mutation) &&
    !sameCanonical(value.mutation.provenance, parent.provenance)
  ) {
    errors.push(`${path}.mutation.provenance: must match parent`);
  }
  if (errors.length > 0) throw new TypeError(errors.join("\n"));
  return frozenCanonical(value as unknown as CombatEffectGeneratedMutationIntent);
}

function applyMutation(
  mutation: CombatEffectMutation,
  runtime: InterpreterRuntime,
  generatedBy?: CombatEffectGeneratedBy
):
  | {
      appliedAmount: number;
      appliedComponents?: ReadonlyArray<{ stepId: string; appliedAmount: number }>;
    }
  | undefined {
  const internalMutation =
    mutation.kind === "resolved-damage" || mutation.kind === "state-flag";
  if (internalMutation !== (generatedBy !== undefined)) {
    throw new TypeError(
      "Internal combat-effect mutation requires exact generated lineage"
    );
  }
  if (
    generatedBy !== undefined &&
    (!safeInteger(generatedBy.parentConsequenceIndex, 0) ||
      generatedBy.parentConsequenceIndex >= runtime.consequences.length)
  ) {
    throw new TypeError("Generated combat-effect mutation has a stale parent index");
  }
  const immutable = frozenCanonical(mutation);
  const observedBefore = runtime.adapter.read(immutable.recipient);
  assertStateView(observedBefore);
  const result = runtime.adapter.apply(immutable);
  const receiptErrors: string[] = [];
  validateJsonPlain(result, "draft receipt", receiptErrors);
  if (receiptErrors.length) throw new TypeError(receiptErrors.join("\n"));
  if (!object(result)) {
    throw new TypeError("Combat-effect draft must return a mutation receipt");
  }
  exactKeys(
    result,
    "draft receipt",
    ["before", "after"],
    [
      "appliedAmount",
      "appliedComponents",
      "persistentConsequences",
      "generatedMutations",
    ],
    receiptErrors
  );
  if (receiptErrors.length) throw new TypeError(receiptErrors.join("\n"));
  assertStateView(result.before);
  assertStateView(result.after);
  const observedAfter = runtime.adapter.read(immutable.recipient);
  assertStateView(observedAfter);
  if (!sameCanonical(observedBefore, result.before)) {
    throw new TypeError("Combat-effect draft receipt has a stale before state");
  }
  if (!sameCanonical(observedAfter, result.after)) {
    throw new TypeError("Combat-effect draft receipt does not match its after state");
  }
  assertMutationOwnedState(immutable, result.before, result.after);
  let persistentConsequences: Readonly<CombatEffectPersistentConsequences> | undefined;
  if (result.persistentConsequences !== undefined) {
    validatePersistentConsequences(result.persistentConsequences, immutable, "draft");
    persistentConsequences = materializePersistentConsequences(
      result.persistentConsequences,
      runtime
    );
    validatePersistentConsequences(persistentConsequences, immutable);
  }
  if (
    (immutable.kind === "condition" || immutable.kind === "standing") &&
    persistentConsequences === undefined
  ) {
    throw new TypeError(`${immutable.kind} draft receipt must own occurrences`);
  }
  let rawGeneratedMutations: ReadonlyArray<unknown> = [];
  if (result.generatedMutations !== undefined) {
    if (
      (immutable.kind !== "damage" && immutable.kind !== "resolved-damage") ||
      !Array.isArray(result.generatedMutations)
    ) {
      throw new TypeError(`${immutable.kind} draft receipt has invalid follow-ups`);
    }
    rawGeneratedMutations = result.generatedMutations;
    runtime.generatedMutationCount += rawGeneratedMutations.length;
    if (runtime.generatedMutationCount > 256) {
      throw new RangeError("Combat-effect generated-mutation limit exceeded");
    }
  }
  const needsAmount =
    mutation.kind === "damage" ||
    mutation.kind === "resolved-damage" ||
    mutation.kind === "heal" ||
    mutation.kind === "temp-hp" ||
    mutation.kind === "resource" ||
    mutation.kind === "damage-reduction";
  if (!needsAmount) {
    if (
      Object.hasOwn(result, "appliedAmount") ||
      Object.hasOwn(result, "appliedComponents")
    ) {
      throw new TypeError(`${mutation.kind} draft receipt has numeric fields`);
    }
    const receipt = frozenCanonical({
      ...immutable,
      before: result.before,
      after: result.after,
      ...(generatedBy === undefined ? {} : { generatedBy }),
      ...(persistentConsequences === undefined ? {} : { persistentConsequences }),
    }) as Readonly<CombatEffectMutationReceipt>;
    runtime.consequences.push(receipt);
    return undefined;
  }
  if (!safeInteger(result.appliedAmount, 0)) {
    throw new TypeError(
      `Combat-effect draft must return appliedAmount for ${mutation.kind}`
    );
  }
  const parentAppliedAmount = result.appliedAmount;
  let appliedComponents:
    | ReadonlyArray<{ stepId: string; appliedAmount: number }>
    | undefined;
  if (mutation.kind === "damage") {
    if (
      !Array.isArray(result.appliedComponents) ||
      result.appliedComponents.length !== mutation.components.length
    ) {
      throw new TypeError(
        "Combat-effect damage draft must return one applied component per component"
      );
    }
    appliedComponents = result.appliedComponents.map((entry, index) => {
      if (!object(entry)) {
        throw new TypeError(`draft receipt.appliedComponents[${index}]: expected object`);
      }
      const errors: string[] = [];
      exactKeys(
        entry,
        `draft receipt.appliedComponents[${index}]`,
        ["stepId", "appliedAmount"],
        [],
        errors
      );
      const component = mutation.components[index];
      if (
        !component ||
        entry.stepId !== component.stepId ||
        !safeInteger(entry.appliedAmount, 0)
      ) {
        errors.push(
          `draft receipt.appliedComponents[${index}]: invalid component amount`
        );
      }
      if (errors.length) throw new TypeError(errors.join("\n"));
      return {
        stepId: entry.stepId as string,
        appliedAmount: entry.appliedAmount as number,
      };
    });
    const landed = appliedComponents.reduce(
      (sum, component) => sum + component.appliedAmount,
      0
    );
    if (result.appliedAmount !== landed) {
      throw new TypeError("Damage appliedAmount must equal its applied components");
    }
  } else if (Object.hasOwn(result, "appliedComponents")) {
    throw new TypeError(`${mutation.kind} draft receipt must omit appliedComponents`);
  }
  const expectedAmount = numericStateDelta(mutation, result.before, result.after);
  if (mutation.kind === "damage-reduction") {
    if (
      !sameCanonical(result.before, result.after) ||
      result.appliedAmount > mutation.amount ||
      result.appliedAmount > mutation.triggeringDamage.amount
    ) {
      throw new TypeError("damage-reduction draft receipt has wrong appliedAmount");
    }
  }
  if (
    mutation.kind === "damage-reduction"
      ? false
      : mutation.kind === "damage"
        ? expectedAmount < 0 || expectedAmount > result.appliedAmount
        : mutation.kind === "resolved-damage"
          ? expectedAmount < 0 || expectedAmount > result.appliedAmount
          : result.appliedAmount !== expectedAmount
  ) {
    throw new TypeError(`${mutation.kind} draft receipt has wrong appliedAmount`);
  }
  if (
    (mutation.kind === "heal" ||
      mutation.kind === "temp-hp" ||
      mutation.kind === "resource") &&
    result.appliedAmount > mutation.amount
  ) {
    throw new TypeError(`${mutation.kind} draft receipt exceeds authored amount`);
  }
  if (mutation.kind === "resolved-damage" && result.appliedAmount !== mutation.amount) {
    throw new TypeError("resolved-damage draft receipt must apply its exact amount");
  }
  const siblingStateKeys = new Set<string>();
  const siblingSourceEffectIds = new Set<string>();
  const generatedMutations = rawGeneratedMutations.map((generated, index) =>
    validatedGeneratedIntent(
      generated,
      index,
      immutable as Readonly<
        Extract<CombatEffectMutation, { kind: "damage" | "resolved-damage" }>
      >,
      parentAppliedAmount,
      result.before,
      result.after,
      siblingStateKeys,
      siblingSourceEffectIds
    )
  );
  const consequenceIndex = runtime.consequences.length;
  const receipt = frozenCanonical({
    ...immutable,
    before: result.before,
    after: result.after,
    appliedAmount: result.appliedAmount,
    ...(generatedBy === undefined ? {} : { generatedBy }),
    ...(appliedComponents === undefined ? {} : { appliedComponents }),
    ...(persistentConsequences === undefined ? {} : { persistentConsequences }),
  }) as Readonly<CombatEffectMutationReceipt>;
  runtime.consequences.push(receipt);
  for (const generated of generatedMutations) {
    applyMutation(generated.mutation, runtime, {
      parentConsequenceIndex: consequenceIndex,
      source: generated.source,
    });
  }
  return {
    appliedAmount: result.appliedAmount,
    ...(appliedComponents === undefined ? {} : { appliedComponents }),
  };
}

function damageComponent(
  step: Extract<CombatEffectStep, { kind: "damage" }>,
  context: ProgramContext,
  runtime: InterpreterRuntime
): CombatEffectDamageComponent | null {
  if (!step.gate) {
    return {
      stepId: step.id,
      amount: resolveAmount(step.amount, context, runtime),
      damageType: resolveDamageType(step.damageType, context, runtime),
      ...(step.damageSource === undefined ? {} : { damageSource: step.damageSource }),
      resolution: { kind: "unconditional", disposition: "full", criticalHit: false },
    };
  }
  const gate = requiredMapValue(runtime.gates, step.gate.gateId, "gate");
  const result = gateOutcome(step.gate.gateId, context, runtime);
  const passes = gateResultMatches(step.gate.pass, result);
  if (!passes && step.gate.otherwise === "skip") return null;
  const answer = answerFor("gate", gate.id, gate.scope, context, runtime);
  const ability =
    answer.kind === "save" || answer.kind === "check" ? answer.ability : undefined;
  const full = resolveAmount(step.amount, context, runtime);
  const alternateDisposition: "half" | "none" =
    step.gate.otherwise === "half" ? "half" : "none";
  const baselineSave: Extract<
    CombatEffectDamageResolution,
    { kind: "gate" }
  >["baselineSave"] =
    gate.kind === "save"
      ? {
          success:
            step.gate.pass === "success" ? ("full" as const) : alternateDisposition,
          failure:
            step.gate.pass === "failure" ? ("full" as const) : alternateDisposition,
        }
      : undefined;
  return {
    stepId: step.id,
    amount: passes ? full : Math.floor(full / 2),
    damageType: resolveDamageType(step.damageType, context, runtime),
    ...(step.damageSource === undefined ? {} : { damageSource: step.damageSource }),
    resolution: {
      kind: "gate",
      gateId: gate.id,
      gateKind: gate.kind,
      ...(ability === undefined ? {} : { ability }),
      result,
      disposition: passes ? "full" : "half",
      criticalHit: result === "critical-hit",
      ...(baselineSave === undefined ? {} : { baselineSave }),
    },
  };
}

function executeDamagePacket(
  steps: ReadonlyArray<Extract<CombatEffectStep, { kind: "damage" }>>,
  context: ProgramContext,
  iteration: number,
  runtime: InterpreterRuntime
): boolean {
  const components = steps.flatMap((step) => {
    if (step.when && !predicateMatches(step.when, context, iteration, runtime)) return [];
    const component = damageComponent(step, context, runtime);
    return component ? [component] : [];
  });
  if (components.length === 0) return false;
  const groups = new Map<DamageType, CombatEffectDamageDefenseGroup>();
  for (const component of components) {
    const prior = groups.get(component.damageType);
    groups.set(
      component.damageType,
      prior
        ? {
            ...prior,
            amount: prior.amount + component.amount,
            componentStepIds: [...prior.componentStepIds, component.stepId],
          }
        : {
            damageType: component.damageType,
            amount: component.amount,
            componentStepIds: [component.stepId],
          }
    );
  }
  const first = steps[0];
  if (!first) throw new TypeError("Damage packet cannot be empty");
  const applied = applyMutation(
    {
      kind: "damage",
      provenance: provenance(first, context, iteration, runtime),
      recipient: recipient(first.subject, context, runtime),
      packetId: first.packetId ?? first.id,
      ...(first.damageSource === undefined ? {} : { damageSource: first.damageSource }),
      components,
      defenseGroups: [...groups.values()],
    },
    runtime
  );
  if (!applied?.appliedComponents) {
    throw new TypeError("Damage packet returned no applied components");
  }
  for (const component of applied.appliedComponents) {
    runtime.landed.push({
      stepId: component.stepId,
      target: context.target,
      instance: context.instance,
      iteration,
      amount: component.appliedAmount,
    });
  }
  return false;
}

function executeStep(
  step: CombatEffectStep,
  context: ProgramContext,
  iteration: number,
  runtime: InterpreterRuntime
): boolean {
  if (step.when && !predicateMatches(step.when, context, iteration, runtime))
    return false;
  if (step.kind === "damage") {
    return executeDamagePacket([step], context, iteration, runtime);
  }
  const source = provenance(step, context, iteration, runtime);
  if (step.kind === "counter") {
    const definition = requiredMapValue(runtime.counterDefs, step.counterId, "counter");
    const stateKey = scopedStateKey(
      step.counterId,
      definition.scope ?? "program",
      context
    );
    const before = requiredMapValue(runtime.counters, stateKey, "counter state");
    const amount = resolveAmount(step.amount, context, runtime);
    const after = step.operation === "add" ? before + amount : amount;
    if (!safeInteger(after, 0)) throw new RangeError("Counter result is invalid");
    runtime.counters.set(stateKey, after);
    runtime.consequences.push(
      frozenCanonical({
        kind: "counter",
        provenance: source,
        counterId: step.counterId,
        ...((definition.scope ?? "program") === "program" ? {} : { stateKey }),
        before,
        after,
      })
    );
    return false;
  }
  if (step.kind === "layer") {
    const definition = requiredMapValue(runtime.layers, step.layerId, "layer");
    const stateKey = scopedStateKey(step.layerId, definition.scope, context);
    const before = requiredMapValue(runtime.layerStates, stateKey, "layer state");
    const after: "active" | "destroyed" =
      step.operation === "destroy" ? "destroyed" : "active";
    runtime.layerStates.set(stateKey, after);
    runtime.events.push(
      frozenCanonical({
        kind: "layer",
        provenance: source,
        layerId: step.layerId,
        stateKey,
        before,
        after,
      })
    );
    return false;
  }
  if (step.kind === "area-state") {
    const before = runtime.areaStates.has(step.fact);
    if (step.operation === "apply") runtime.areaStates.add(step.fact);
    else runtime.areaStates.delete(step.fact);
    runtime.events.push(
      frozenCanonical({
        kind: "area-state",
        provenance: source,
        operation: step.operation,
        fact: step.fact,
        before,
        after: runtime.areaStates.has(step.fact),
        ...(step.lifetime ? { lifetime: step.lifetime } : {}),
      })
    );
    return false;
  }
  if (step.kind === "relocation-event") {
    const destination =
      step.destination.kind === "manual"
        ? ({ kind: "manual" } as const)
        : (() => {
            const value = inputValue(step.destination.inputId, context, runtime);
            if (typeof value === "string") {
              throw new TypeError("Relocation table requires a reviewed roll");
            }
            return {
              kind: "table" as const,
              inputId: step.destination.inputId,
              roll: value,
            };
          })();
    runtime.events.push(
      frozenCanonical({
        kind: "relocation-event",
        provenance: source,
        recipient: recipient(step.subject, context, runtime),
        mode: step.mode,
        destination,
      })
    );
    return false;
  }
  if (step.kind === "end-program") {
    runtime.consequences.push(
      frozenCanonical({ kind: "end-program", provenance: source })
    );
    return true;
  }
  if (step.kind === "heal-from-landed-damage") {
    const landed = step.damageStepIds.reduce(
      (sum, stepId) => sum + contextualLanded(stepId, context, iteration, runtime),
      0
    );
    const amount = Math.floor(landed * step.fraction);
    applyMutation(
      {
        kind: "heal",
        provenance: source,
        recipient: recipient(step.subject, context, runtime),
        amount,
      },
      runtime
    );
    return false;
  }
  if (step.kind === "heal" || step.kind === "temp-hp") {
    applyMutation(
      {
        kind: step.kind,
        provenance: source,
        recipient: recipient(step.subject, context, runtime),
        amount: resolveAmount(step.amount, context, runtime),
      },
      runtime
    );
    return false;
  }
  if (step.kind === "resource") {
    applyMutation(
      {
        kind: "resource",
        provenance: source,
        recipient: recipient(step.subject, context, runtime),
        operation: step.operation,
        resourceId: step.resourceId,
        amount: resolveAmount(step.amount, context, runtime),
      },
      runtime
    );
    return false;
  }
  if (step.kind === "damage-reduction") {
    const triggeringDamage = runtime.execution.triggerFacts?.damage;
    if (!triggeringDamage) {
      throw new TypeError("execution.triggerFacts.damage: required by damage reduction");
    }
    applyMutation(
      {
        kind: "damage-reduction",
        provenance: source,
        recipient: recipient(step.subject, context, runtime),
        amount: resolveAmount(step.amount, context, runtime),
        ...(step.damageTypes ? { damageTypes: step.damageTypes } : {}),
        triggeringDamage,
      },
      runtime
    );
    return false;
  }
  if (step.kind === "condition") {
    applyMutation(
      {
        kind: "condition",
        provenance: source,
        recipient: recipient(step.subject, context, runtime),
        operation: step.operation,
        condition: step.condition,
        ...(step.lifetime ? { lifetime: step.lifetime } : {}),
      },
      runtime
    );
    return false;
  }
  if (step.kind === "standing") {
    applyMutation(
      {
        kind: "standing",
        provenance: source,
        recipient: recipient(step.subject, context, runtime),
        operation: step.operation,
        effectId: step.effectId,
        ...(step.lifetime ? { lifetime: step.lifetime } : {}),
      },
      runtime
    );
    return false;
  }
  applyMutation(
    {
      kind: "stabilize",
      provenance: source,
      recipient: recipient(step.subject, context, runtime),
    },
    runtime
  );
  return false;
}

/**
 * Plan a complete artifact against an isolated draft. This never commits live
 * state: callers atomically compare-and-swap the returned receipts elsewhere.
 */
export function interpretCombatEffectArtifact(
  artifact: ReviewedCombatEffectArtifact,
  planningState: CombatEffectPlanningState
): Readonly<CombatEffectPlan> {
  assertArtifact(artifact);
  if (
    !object(planningState) ||
    typeof planningState.createDisposableDraft !== "function"
  ) {
    throw new TypeError("Combat-effect planning state must create a disposable draft");
  }
  const execution = executionFromArtifact(artifact);
  const phase = phaseFor(artifact.program, execution);
  const adapter = planningState.createDisposableDraft();
  if (
    !object(adapter) ||
    typeof adapter.atomicReadSet !== "function" ||
    typeof adapter.read !== "function" ||
    typeof adapter.resourceValue !== "function" ||
    typeof adapter.conditionPresent !== "function" ||
    typeof adapter.standingPresent !== "function" ||
    typeof adapter.apply !== "function"
  ) {
    throw new TypeError("Combat-effect planning state returned an invalid draft");
  }
  const readSetHeader: CombatEffectAtomicReadSetHeader = {
    occurrenceId: artifact.occurrenceId,
    programId: artifact.program.id,
    sourceId: artifact.sourceId,
  };
  const readSet = conformCombatEffectAtomicReadSet(
    adapter.atomicReadSet(readSetHeader),
    readSetHeader
  );
  if (!readSet) {
    throw new TypeError(
      "Combat-effect planning draft returned an invalid atomic read set"
    );
  }
  const runtime: InterpreterRuntime = {
    artifact,
    execution,
    readSet,
    adapter,
    gates: new Map((artifact.program.gates ?? []).map((gate) => [gate.id, gate])),
    inputs: new Map((artifact.program.inputs ?? []).map((input) => [input.id, input])),
    answers: new Map(artifact.answers.map((answer) => [answer.key, answer])),
    counterDefs: new Map(
      (artifact.program.counters ?? []).map((counter) => [counter.id, counter])
    ),
    counters: new Map(Object.entries(artifact.tallies)),
    layers: new Map((artifact.program.layers ?? []).map((layer) => [layer.id, layer])),
    layerStates: new Map(Object.entries(artifact.layerStates ?? {})),
    areaStates: new Set(artifact.areaStates ?? []),
    landed: [],
    consequences: [],
    events: [],
    generatedMutationCount: 0,
  };
  let ended = false;
  const occurrence = artifact.occurrence;
  for (let index = 0; index < phase.steps.length; ) {
    const step = phase.steps[index];
    if (!step) throw new TypeError("Validated phase contains an empty step");
    const damageSteps: Array<Extract<CombatEffectStep, { kind: "damage" }>> = [];
    if (step.kind === "damage") {
      const packetId = step.packetId ?? step.id;
      while (index < phase.steps.length) {
        const candidate = phase.steps[index];
        if (
          !candidate ||
          candidate.kind !== "damage" ||
          (candidate.packetId ?? candidate.id) !== packetId
        ) {
          break;
        }
        damageSteps.push(candidate);
        index += 1;
      }
    } else {
      index += 1;
    }
    for (const context of contexts(step.scope, execution)) {
      const didEnd =
        damageSteps.length > 0
          ? executeDamagePacket(damageSteps, context, occurrence, runtime)
          : executeStep(step, context, occurrence, runtime);
      if (didEnd) {
        ended = true;
        break;
      }
    }
    if (ended) break;
  }
  if (
    !ended &&
    phase.repeat &&
    (occurrence + 1 >= phase.repeat.maxOccurrences ||
      (phase.repeat.endWhen &&
        predicateMatches(
          phase.repeat.endWhen,
          { target: null, targetIndex: null, instance: null },
          occurrence,
          runtime
        )))
  ) {
    runtime.consequences.push(
      frozenCanonical({
        kind: "end-program",
        provenance: {
          occurrenceId: artifact.occurrenceId,
          programId: artifact.program.id,
          phaseId: artifact.phaseId,
          stepId: phase.repeat.id,
          target: null,
          instance: null,
          iteration: occurrence,
        },
      })
    );
    ended = true;
  }
  return frozenCanonical({
    schema: 1,
    occurrenceId: artifact.occurrenceId,
    sourceId: artifact.sourceId,
    programId: artifact.program.id,
    phaseId: artifact.phaseId,
    occurrence,
    readSet,
    consequences: runtime.consequences,
    ...(runtime.events.length ? { events: runtime.events } : {}),
    initialTallies: artifact.tallies,
    finalTallies: Object.fromEntries(runtime.counters),
    ...(artifact.program.layers?.length
      ? {
          initialLayerStates: artifact.layerStates ?? {},
          finalLayerStates: Object.fromEntries(runtime.layerStates),
        }
      : {}),
    ...(artifact.areaStates?.length ||
    phase.steps.some((candidate) => candidate.kind === "area-state")
      ? {
          initialAreaStates: artifact.areaStates ?? [],
          finalAreaStates: [...runtime.areaStates].sort(),
        }
      : {}),
    ended,
  });
}

export type NormalizedLegacyAmount =
  | { kind: "fixed"; value: number }
  | { kind: "roll"; roll: { count: number; sides: number; bonus?: number } };

export type NormalizedLegacyGate =
  | { kind: "attack"; attackType?: "melee" | "ranged" }
  | { kind: "save"; ability: AbilityCode; dc?: number }
  | { kind: "check"; ability: AbilityCode; dc: number; skill?: string };

export interface NormalizedLegacyCombatEffect {
  id: string;
  gate?: NormalizedLegacyGate;
  damage?: ReadonlyArray<{
    id: string;
    amount: NormalizedLegacyAmount;
    damageType: DamageType;
    onGateFailure?: "skip" | "half";
    packetId?: string;
  }>;
  heal?: NormalizedLegacyAmount;
  tempHp?: NormalizedLegacyAmount;
  condition?: { operation: "apply" | "remove"; condition: ConditionId };
  stabilize?: true;
}

/** Compile already-normalized legacy facts into one compatible resolve phase. */
export function compileLegacyCombatEffect(
  legacy: NormalizedLegacyCombatEffect
): Readonly<CombatEffectProgram> {
  const gates: CombatEffectGate[] = legacy.gate
    ? [{ id: "gate", scope: "instance", ...legacy.gate }]
    : [];
  const inputs: CombatEffectInput[] = [];
  const amount = (value: NormalizedLegacyAmount, id: string): CombatEffectAmountSpec => {
    if (value.kind === "fixed") return { kind: "fixed", value: value.value };
    inputs.push({ id, kind: "roll", scope: "instance", roll: value.roll });
    return { kind: "input", inputId: id };
  };
  const gatePass = legacy.gate?.kind === "attack" ? "hit" : "failure";
  const steps: CombatEffectStep[] = [];
  for (const damage of legacy.damage ?? []) {
    steps.push({
      id: damage.id,
      kind: "damage",
      scope: "instance",
      subject: "target",
      amount: amount(damage.amount, `${damage.id}-roll`),
      damageType: { kind: "fixed", damageType: damage.damageType },
      ...(damage.packetId ? { packetId: damage.packetId } : {}),
      ...(legacy.gate
        ? {
            gate: {
              gateId: "gate",
              pass: gatePass,
              otherwise: damage.onGateFailure ?? "skip",
            },
          }
        : {}),
    });
  }
  if (legacy.heal) {
    steps.push({
      id: "heal",
      kind: "heal",
      scope: "instance",
      subject: "target",
      amount: amount(legacy.heal, "heal-roll"),
    });
  }
  if (legacy.tempHp) {
    steps.push({
      id: "temp-hp",
      kind: "temp-hp",
      scope: "instance",
      subject: "target",
      amount: amount(legacy.tempHp, "temp-hp-roll"),
    });
  }
  if (legacy.condition) {
    steps.push({
      id: "condition",
      kind: "condition",
      scope: "instance",
      subject: "target",
      ...legacy.condition,
      ...(legacy.gate
        ? {
            when: {
              kind: "gate",
              gateId: "gate",
              result: gatePass,
            } as const,
          }
        : {}),
    });
  }
  if (legacy.stabilize) {
    steps.push({
      id: "stabilize",
      kind: "stabilize",
      scope: "instance",
      subject: "target",
    });
  }
  const program: CombatEffectProgram = {
    version: 1,
    id: legacy.id,
    ...(gates.length ? { gates } : {}),
    ...(inputs.length ? { inputs } : {}),
    phases: [{ id: "resolve", trigger: { kind: "resolve" }, steps }],
  };
  assertCombatEffectProgram(program);
  return frozenCanonical(program);
}
