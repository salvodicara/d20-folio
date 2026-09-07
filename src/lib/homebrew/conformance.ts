import {
  parseDefinition,
  type LibraryDefinition,
  type JsonValue,
} from "../library/model";
import {
  BASE_FAMILIES,
  baseFields,
  effectFields,
  type BaseFamily,
  type FieldDescriptor,
} from "./model";
export interface AuthoringDiagnostic {
  path: string;
  code: string;
  severity: "invalid" | "unsupported";
}
/** Finite NdS +/- constant or constant grammar; no randomness, expression execution or expansion. */
export function formulaBounds(input: unknown): { min: number; max: number } | null {
  if (typeof input !== "string" || input.length > 60) return null;
  const s = input.replace(/\s/g, "");
  if (/^\d{1,6}$/.test(s)) {
    const n = Number(s);
    return n <= 100000 ? { min: n, max: n } : null;
  }
  const m = /^(\d{1,3})d(\d{1,4})(?:([+-])(\d{1,6}))?$/.exec(s);
  if (!m) return null;
  const n = Number(m[1]),
    sides = Number(m[2]),
    offset = Number(m[4] ?? 0) * (m[3] === "-" ? -1 : 1);
  if (n < 1 || n > 100 || sides < 2 || sides > 1000 || Math.abs(offset) > 100000)
    return null;
  return { min: n + offset, max: n * sides + offset };
}
const textValue = (value: unknown): string => (typeof value === "string" ? value : "");
const stateKeys = ["quantity", "remainingCharges", "prepared", "equipped", "attuned"];
export function conformDefinition(definition: LibraryDefinition): AuthoringDiagnostic[] {
  const issues: AuthoringDiagnostic[] = [];
  const add = (
    path: string,
    code: string,
    severity: AuthoringDiagnostic["severity"] = "invalid"
  ) => issues.push({ path, code, severity });
  try {
    parseDefinition(definition);
  } catch {
    add("definition", "invalid-definition");
    return issues;
  }
  const d = definition.payload.data;
  if (!definition.name.trim()) add("name", "required");
  if (!BASE_FAMILIES.includes(definition.family as BaseFamily)) {
    add("family", "unsupported-family", "unsupported");
    return issues;
  }
  if (Object.keys(d).length === 0) {
    add("payload.data", "unconfigured");
    return issues;
  }
  if (d.authoringVersion !== 1) {
    for (const key of stateKeys)
      if (Object.hasOwn(d, key)) add("payload.data." + key, "instance-state");
    add("payload.data.authoringVersion", "unsupported-version", "unsupported");
    return issues;
  }
  const validate = (
    data: Record<string, JsonValue>,
    descriptors: readonly FieldDescriptor[],
    prefix: string,
    extras: string[] = []
  ) => {
    const known = new Set([...descriptors.map((x) => x.key), ...extras]);
    for (const key of Object.keys(data))
      if (!known.has(key))
        add(
          prefix + key,
          stateKeys.includes(key) ? "instance-state" : "unsupported-field",
          stateKeys.includes(key) ? "invalid" : "unsupported"
        );
    for (const field of descriptors) {
      const value = data[field.key],
        path = prefix + field.key;
      if (field.type === "number") {
        if (
          typeof value !== "number" ||
          !Number.isFinite(value) ||
          value < (field.min ?? -Infinity) ||
          value > (field.max ?? Infinity) ||
          (![
            "weight",
            "cost",
            "materialCost",
            "reach",
            "rangeNormal",
            "rangeLong",
            "rangeDistance",
            "areaSize",
          ].includes(field.key) &&
            !Number.isInteger(value))
        )
          add(path, "invalid-number");
      } else if (field.type === "boolean") {
        if (typeof value !== "boolean") add(path, "invalid-boolean");
      } else if (typeof value !== "string") add(path, "invalid-text");
      else if (value.length > 10000) add(path, "text-too-long");
      else if (field.type === "select" && !field.options?.includes(value))
        add(path, "unsupported-option", "unsupported");
      else if (field.type === "formula" && value !== "" && !formulaBounds(value))
        add(path, "invalid-formula");
    }
  };
  validate(d, baseFields(definition.family as BaseFamily), "payload.data.", [
    "effects",
    "unsupported",
  ]);
  const check = (condition: unknown, key: string, code: string) => {
    if (condition) add("payload.data." + key, code);
  };
  for (const key of ["source", "sourceVersion", "mechanicId"])
    check(typeof d[key] !== "string" || !textValue(d[key]).trim(), key, "required");
  if (!Array.isArray(d.unsupported) || d.unsupported.some((x) => typeof x !== "string"))
    add("payload.data.unsupported", "invalid-declarations");
  else if (d.unsupported.length)
    add("payload.data.unsupported", "unsupported-declaration", "unsupported");
  if (!Array.isArray(d.effects) || d.effects.length > 32)
    add("payload.data.effects", "invalid-effects");
  else
    d.effects.forEach((value, index) => {
      const path = `payload.data.effects.${index}.`;
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        add(path.slice(0, -1), "invalid-effect");
        return;
      }
      validate(value, effectFields(), path);
      const effectCheck = (condition: unknown, key: string, code: string) => {
        if (condition) add(path + key, code);
      };
      const bounds = formulaBounds(value.formula);
      effectCheck(
        value.kind !== "condition" && (!bounds || bounds.min < 0),
        "formula",
        "effect-formula"
      );
      effectCheck(
        value.kind === "damage" && !value.damageType,
        "damageType",
        "damage-type-required"
      );
      effectCheck(
        value.kind !== "damage" && value.damageType !== "",
        "damageType",
        "damage-type-unused"
      );
      effectCheck(
        value.kind === "condition" && !value.condition,
        "condition",
        "condition-required"
      );
      effectCheck(
        value.kind !== "condition" && value.condition !== "",
        "condition",
        "condition-unused"
      );
      effectCheck(
        value.kind === "condition" && value.formula !== "",
        "formula",
        "condition-formula"
      );
      effectCheck(
        ["round", "minute", "hour"].includes(textValue(value.durationKind)) &&
          !(Number(value.durationAmount) > 0),
        "durationAmount",
        "duration-required"
      );
      effectCheck(
        ["instant", "until-removed"].includes(textValue(value.durationKind)) &&
          value.durationAmount !== 0,
        "durationAmount",
        "duration-unused"
      );
      effectCheck(
        definition.family === "spell" &&
          ["failed-save", "successful-save"].includes(textValue(value.gate)) &&
          d.resolution !== "save",
        "gate",
        "save-required"
      );
      effectCheck(
        definition.family === "spell" &&
          value.gate === "hit" &&
          d.resolution !== "attack",
        "gate",
        "attack-required"
      );
      effectCheck(
        definition.family === "spell" &&
          value.target === "area" &&
          d.areaShape === "none",
        "target",
        "area-required"
      );
    });
  if (definition.family === "weapon") {
    const bounds = formulaBounds(d.damageFormula);
    check(!bounds || bounds.min < 0, "damageFormula", "damage-formula");
    check(Number(d.rangeLong) < Number(d.rangeNormal), "rangeLong", "range-order");
    check(
      (d.mode === "ranged" || d.propertyThrown || d.propertyAmmunition) &&
        !(Number(d.rangeNormal) > 0),
      "rangeNormal",
      "range-required"
    );
    check(
      d.mode === "melee" &&
        !d.propertyThrown &&
        !d.propertyAmmunition &&
        (d.rangeNormal !== 0 || d.rangeLong !== 0),
      "rangeNormal",
      "range-unused"
    );
    check(
      d.versatileFormula !== "" && !d.propertyVersatile,
      "versatileFormula",
      "versatile-property"
    );
    const versatileBounds = formulaBounds(d.versatileFormula);
    check(
      d.propertyVersatile && (!versatileBounds || versatileBounds.min < 0),
      "versatileFormula",
      "versatile-formula"
    );
    check(
      d.propertyVersatile && d.propertyTwoHanded,
      "propertyVersatile",
      "versatile-two-handed"
    );
    check(d.mode === "melee" && !(Number(d.reach) > 0), "reach", "reach-required");
  }
  if (definition.family === "equipment") {
    check(
      d.armorDex !== "capped" && d.armorDexCap !== 0,
      "armorDexCap",
      "dex-cap-policy"
    );
    check(
      d.category !== "armor" &&
        (d.armorBase !== 0 || d.armorDex !== "none" || d.armorDexCap !== 0),
      "armorBase",
      "armor-category"
    );
    check(
      d.category === "armor" && !(Number(d.armorBase) > 0),
      "armorBase",
      "armor-base-required"
    );
    check(
      d.category !== "shield" && d.shieldBonus !== 0,
      "shieldBonus",
      "shield-category"
    );
    check(
      d.category === "shield" && !(Number(d.shieldBonus) > 0),
      "shieldBonus",
      "shield-bonus-required"
    );
  }
  if (definition.family === "equipment" || definition.family === "feature") {
    const capacity = Number(definition.family === "equipment" ? d.maxCharges : d.maxUses);
    check(
      d.recoveryKind !== "none" && (!(capacity > 0) || d.recoveryBoundary === "none"),
      "recoveryBoundary",
      "recovery-resource"
    );
    check(
      d.recoveryKind === "none" && d.recoveryBoundary !== "none",
      "recoveryBoundary",
      "recovery-kind"
    );
    const bounds = formulaBounds(d.recoveryFormula);
    check(
      d.recoveryKind === "formula" && (!bounds || bounds.min < 0),
      "recoveryFormula",
      "recovery-formula"
    );
    check(
      d.recoveryKind === "formula" && bounds && bounds.max > capacity,
      "recoveryFormula",
      "recovery-capacity"
    );
    check(
      d.recoveryKind !== "formula" && d.recoveryFormula !== "",
      "recoveryFormula",
      "recovery-formula-unused"
    );
  }
  if (definition.family === "spell" || definition.family === "feature")
    check(
      d.activation === "reaction" &&
        (!d.reactionCondition || !textValue(d.reactionCondition).trim()),
      "reactionCondition",
      "reaction-condition"
    );
  if (definition.family === "spell") {
    check(
      d.activation === "time" &&
        (!d.activationTime || !textValue(d.activationTime).trim()),
      "activationTime",
      "activation-time"
    );
    check(
      !d.material &&
        (d.materialConsumed || d.materialCost !== 0 || d.materialDescription !== ""),
      "material",
      "material-required"
    );
    check(
      d.material && (!d.materialDescription || !textValue(d.materialDescription).trim()),
      "materialDescription",
      "material-description"
    );
    check(
      d.concentration && d.durationKind === "instant",
      "concentration",
      "concentration-duration"
    );
    check(
      ["round", "minute", "hour"].includes(textValue(d.durationKind)) &&
        !(Number(d.durationAmount) > 0),
      "durationAmount",
      "duration-required"
    );
    check(
      ["instant", "until-dispelled"].includes(textValue(d.durationKind)) &&
        d.durationAmount !== 0,
      "durationAmount",
      "duration-unused"
    );
    check(
      d.rangeKind === "distance" && !(Number(d.rangeDistance) > 0),
      "rangeDistance",
      "range-required"
    );
    check(
      d.rangeKind !== "distance" && d.rangeDistance !== 0,
      "rangeDistance",
      "range-unused"
    );
    check(
      d.areaShape !== "none" && !(Number(d.areaSize) > 0),
      "areaSize",
      "area-required"
    );
    check(d.areaShape === "none" && d.areaSize !== 0, "areaSize", "area-unused");
    check(
      d.resolution === "save" && d.saveAbility === "none",
      "saveAbility",
      "save-ability"
    );
    check(
      d.resolution !== "save" && d.saveAbility !== "none",
      "saveAbility",
      "save-unused"
    );
    check(
      d.dcPolicy === "fixed" && (d.resolution !== "save" || !(Number(d.fixedDc) > 0)),
      "fixedDc",
      "fixed-dc"
    );
    check(d.dcPolicy !== "fixed" && d.fixedDc !== 0, "fixedDc", "fixed-dc-unused");
    check(
      d.upcastFormula !== "" && d.scalingDependency === "none",
      "scalingDependency",
      "scaling-dependency"
    );
    check(
      d.scalingDependency !== "none" && !formulaBounds(d.upcastFormula),
      "upcastFormula",
      "scaling-formula"
    );
    check(
      d.level === 0 && d.scalingDependency === "slot-level",
      "scalingDependency",
      "cantrip-slot-scaling"
    );
  }
  if (definition.family === "feature") {
    check(
      d.activation === "passive" && d.resourceCost !== 0,
      "resourceCost",
      "passive-resource"
    );
    check(
      Number(d.resourceCost) > Number(d.maxUses),
      "resourceCost",
      "resource-capacity"
    );
    check(
      d.prerequisite === "level" && !(Number(d.prerequisiteLevel) > 0),
      "prerequisiteLevel",
      "prerequisite-level"
    );
    check(
      d.prerequisite === "ability" &&
        (d.prerequisiteAbility === "none" || !(Number(d.prerequisiteScore) > 0)),
      "prerequisiteAbility",
      "prerequisite-ability"
    );
    check(
      d.prerequisite !== "level" && d.prerequisiteLevel !== 0,
      "prerequisiteLevel",
      "prerequisite-unused"
    );
    check(
      d.prerequisite !== "ability" &&
        (d.prerequisiteAbility !== "none" || d.prerequisiteScore !== 0),
      "prerequisiteAbility",
      "prerequisite-unused"
    );
  }
  return issues;
}
