import { advancedCollections, type AdvancedCollection } from "./advanced";
import {
  parseDefinition,
  type LibraryDefinition,
  type JsonValue,
} from "../library/model";
import {
  AUTHORING_FAMILIES,
  validResourceId,
  authoringFields,
  effectFields,
  type AuthoringFamily,
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
const stateKeys = [
  "quantity",
  "remainingCharges",
  "prepared",
  "equipped",
  "attuned",
  "currentHp",
  "temporaryHp",
  "remaining",
  "enabled",
  "conditions",
];
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
  if (!AUTHORING_FAMILIES.includes(definition.family as AuthoringFamily)) {
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
            "walkSpeed",
            "flySpeed",
            "swimSpeed",
            "climbSpeed",
            "burrowSpeed",
            "darkvision",
            "blindsight",
            "tremorsense",
            "truesight",
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
  validate(d, authoringFields(definition.family as AuthoringFamily), "payload.data.", [
    "effects",
    "unsupported",
    ...advancedCollections(definition.family as AuthoringFamily).map((c) => c.key),
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
  const validateEffects = (
    parent: Record<string, JsonValue>,
    prefix: string,
    checkResolution: boolean
  ) => {
    if (!Array.isArray(parent.effects) || parent.effects.length > 32)
      add(prefix + "effects", "invalid-effects");
    else
      parent.effects.forEach((value, index) => {
        const path = `${prefix}effects.${index}.`;
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          add(path.slice(0, -1), "invalid-effect");
          return;
        }
        const descriptors = effectFields();
        const unknownKind =
          typeof value.kind === "string" &&
          !descriptors
            .find((field) => field.key === "kind")
            ?.options?.includes(value.kind);
        validate(
          value,
          unknownKind
            ? descriptors.filter((field) => Object.hasOwn(value, field.key))
            : descriptors,
          path
        );
        if (unknownKind) return;
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
          checkResolution &&
            ["failed-save", "successful-save"].includes(textValue(value.gate)) &&
            parent.resolution !== "save",
          "gate",
          "save-required"
        );
        effectCheck(
          checkResolution && value.gate === "hit" && parent.resolution !== "attack",
          "gate",
          "attack-required"
        );
        effectCheck(
          checkResolution && value.target === "area" && parent.areaShape === "none",
          "target",
          "area-required"
        );
      });
  };
  validateEffects(d, "payload.data.", definition.family === "spell");
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
  if (definition.family === "monster" || definition.family === "campaign-rule") {
    const rows = (key: string): Record<string, JsonValue>[] =>
      Array.isArray(d[key])
        ? d[key].filter(
            (x): x is Record<string, JsonValue> =>
              !!x && typeof x === "object" && !Array.isArray(x)
          )
        : [];
    const walk = (
      parent: Record<string, JsonValue>,
      collections: readonly AdvancedCollection[],
      prefix: string
    ) => {
      for (const c of collections) {
        const values = parent[c.key];
        if (!Array.isArray(values) || values.length > c.max) {
          add(prefix + c.key, "invalid-collection");
          continue;
        }
        const ids = new Set<string>();
        values.forEach((v, i) => {
          const path = `${prefix}${c.key}.${i}.`;
          if (!v || typeof v !== "object" || Array.isArray(v)) {
            add(path.slice(0, -1), "invalid-row");
            return;
          }
          const kindField = c.fields.find((field) => field.key === "kind");
          const unknownKind =
            kindField?.type === "select" &&
            typeof v.kind === "string" &&
            !kindField.options?.includes(v.kind);
          validate(
            v,
            unknownKind
              ? c.fields.filter(
                  (field) =>
                    Object.hasOwn(v, field.key) ||
                    ["id", "name", "source"].includes(field.key)
                )
              : c.fields,
            path,
            c.collections?.map((x) => x.key)
          );
          const identity =
            c.kind === "dependency"
              ? "mechanicId"
              : c.kind === "skill"
                ? "skill"
                : c.fields.some((f) => f.key === "id")
                  ? "id"
                  : null;
          if (identity) {
            const id = textValue(v[identity]);
            if (!id.trim()) add(path + identity, "required");
            else if (ids.has(id)) add(path + identity, "duplicate-id");
            ids.add(id);
          }
          if (c.fields.some((f) => f.key === "name") && !textValue(v.name).trim())
            add(path + "name", "required");
          if (c.kind === "program" && !textValue(v.source).trim())
            add(path + "source", "required");
          if (unknownKind) return;
          if (c.kind === "program") {
            validateEffects(v, path, true);
            walk(
              v,
              (c.collections ?? []).filter((x) => x.key !== "effects"),
              path
            );
            const checkRow = (condition: unknown, key: string, code: string) => {
              if (condition) add(path + key, code);
            };
            checkRow(
              Number(v.rangeLong) < Number(v.rangeNormal),
              "rangeLong",
              "range-order"
            );
            checkRow(
              v.resolution === "attack" &&
                !(Number(v.reach) > 0 || Number(v.rangeNormal) > 0),
              "reach",
              "range-required"
            );
            checkRow(
              v.resolution === "save" &&
                (v.saveAbility === "none" || !(Number(v.saveDc) > 0)),
              "saveAbility",
              "save-required"
            );
            checkRow(
              v.resolution !== "save" && (v.saveAbility !== "none" || v.saveDc !== 0),
              "saveAbility",
              "save-unused"
            );
            checkRow(
              v.resolution !== "attack" && v.attackBonus !== 0,
              "attackBonus",
              "attack-unused"
            );
            checkRow(
              v.areaShape !== "none" && !(Number(v.areaSize) > 0),
              "areaSize",
              "area-required"
            );
            checkRow(
              v.areaShape === "none" && v.areaSize !== 0,
              "areaSize",
              "area-unused"
            );
            checkRow(
              v.activation === "reaction" && v.trigger === "none",
              "trigger",
              "reaction-trigger"
            );
            checkRow(
              v.kind !== "multiattack" &&
                v.activation !== (v.kind === "trait" ? "passive" : v.kind),
              "activation",
              "activation-kind"
            );
            checkRow(
              v.kind === "multiattack" &&
                (v.activation !== "action" ||
                  v.resolution !== "none" ||
                  !Array.isArray(v.steps) ||
                  !v.steps.length),
              "steps",
              "multiattack-steps"
            );
            checkRow(
              v.kind === "multiattack" && Array.isArray(v.effects) && v.effects.length,
              "effects",
              "multiattack-effects"
            );
            checkRow(
              v.kind !== "multiattack" && Array.isArray(v.steps) && v.steps.length,
              "steps",
              "steps-unused"
            );
            const resource = rows("resources").find((r) => r.id === v.resourceId);
            checkRow(v.resourceId !== "" && !resource, "resourceId", "missing-resource");
            checkRow(
              Number(v.resourceCost) > 0 && !resource,
              "resourceId",
              "missing-resource"
            );
            checkRow(
              resource && Number(v.resourceCost) > Number(resource.capacity),
              "resourceCost",
              "resource-capacity"
            );
            checkRow(
              v.kind === "legendary" && !(Number(v.resourceCost) > 0),
              "resourceCost",
              "legendary-cost"
            );
            if (Array.isArray(v.steps))
              v.steps.forEach((step, j) => {
                if (
                  !step ||
                  typeof step !== "object" ||
                  Array.isArray(step) ||
                  step.kind !== "program"
                )
                  return;
                const target = rows("programs").find((p) => p.id === step.programId);
                if (!target) add(path + `steps.${j}.programId`, "missing-program");
                else if (target.kind === "multiattack")
                  add(path + `steps.${j}.programId`, "nested-multiattack");
              });
            if (v.kind === "multiattack" && Array.isArray(v.steps)) {
              // Static declaration sum only: no recovery, draws or execution during validation.
              const costs = new Map<string, number>();
              const addCost = (program: Record<string, JsonValue>, count: number) => {
                if (
                  typeof program.resourceId === "string" &&
                  typeof program.resourceCost === "number" &&
                  Number.isFinite(program.resourceCost) &&
                  program.resourceCost >= 0
                )
                  costs.set(
                    program.resourceId,
                    (costs.get(program.resourceId) ?? 0) + program.resourceCost * count
                  );
              };
              addCost(v, 1);
              for (const step of v.steps) {
                if (
                  !step ||
                  typeof step !== "object" ||
                  Array.isArray(step) ||
                  step.kind !== "program" ||
                  typeof step.count !== "number" ||
                  !Number.isInteger(step.count) ||
                  step.count < 1
                )
                  continue;
                const target = rows("programs").find((p) => p.id === step.programId);
                if (
                  target &&
                  kindField?.options?.includes(textValue(target.kind)) &&
                  target.kind !== "multiattack"
                )
                  addCost(target, step.count);
              }
              if (
                rows("resources").some(
                  (resource) =>
                    typeof resource.id === "string" &&
                    typeof resource.capacity === "number" &&
                    (costs.get(resource.id) ?? 0) > resource.capacity
                )
              )
                add(path + "steps", "multiattack-resource-capacity");
            }
          }
          if (c.kind === "resource") {
            if (!validResourceId(v.id)) add(path + "id", "resource-id");
            const bounds = formulaBounds(v.recoveryFormula);
            if (
              (v.recoveryKind === "none" && v.recoveryBoundary !== "none") ||
              (v.recoveryKind !== "none" && v.recoveryBoundary === "none")
            )
              add(path + "recoveryBoundary", "recovery-kind");
            if (
              v.recoveryKind === "formula" &&
              (!bounds || bounds.min < 0 || bounds.max > Number(v.capacity))
            )
              add(path + "recoveryFormula", "recovery-formula");
            if (v.recoveryKind !== "formula" && v.recoveryFormula !== "")
              add(path + "recoveryFormula", "recovery-formula-unused");
            if (
              v.recoveryKind === "recharge" &&
              (v.recoveryBoundary !== "turn-start" || Number(v.rechargeThreshold) < 1)
            )
              add(path + "rechargeThreshold", "invalid-recharge");
            if (v.recoveryKind !== "recharge" && v.rechargeThreshold !== 0)
              add(path + "rechargeThreshold", "recharge-unused");
          }
          if (c.kind === "policy") {
            if (
              v.fact === "resource-capacity" &&
              !rows("resources").some((r) => r.id === v.resourceId)
            )
              add(path + "resourceId", "missing-resource");
            if (v.fact !== "resource-capacity" && v.resourceId !== "")
              add(path + "resourceId", "resource-unused");
            if (v.operation === "set" && Number(v.amount) < 0)
              add(path + "amount", "negative-set");
          }
          if (c.kind === "dependency" && v.mechanicId === d.mechanicId)
            add(path + "mechanicId", "self-dependency");
          if (c.kind === "defense") {
            if (
              v.kind === "condition-immunity"
                ? !v.condition || v.damageType !== ""
                : !v.damageType || v.condition !== ""
            )
              add(path + "kind", "defense-target");
          }
        });
      }
    };
    walk(d, advancedCollections(definition.family), "payload.data.");
    if (definition.family === "monster") {
      const bounds = formulaBounds(d.hpFormula);
      check(!bounds || bounds.min < 0, "hpFormula", "hp-formula");
    }
    if (definition.family === "campaign-rule" && d.application === "typed")
      check(
        !rows("policies").length && !rows("programs").length,
        "application",
        "typed-declarations-required"
      );
  }
  return issues;
}
