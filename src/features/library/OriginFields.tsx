import { CheckboxField } from "@/components/ui/selection";
import { useEffect, useRef, useState } from "react";
import { OriginProficiency } from "./OriginProficiency";
import { HomebrewReader } from "./HomebrewReader";
import { ABILITIES, DAMAGE_TYPES } from "@/lib/homebrew/model";
import {
  ORIGIN_SKILLS,
  MOVEMENT_MODES,
  SENSES,
  includeOriginDependency,
  originRecord,
} from "@/lib/homebrew/origins";
import type { JsonValue, LibraryDefinition, LibraryVersion } from "@/lib/library/model";
import { useHomebrewLabel } from "./homebrew-labels";

type Row = Record<string, JsonValue>;
const row = (value: JsonValue | undefined): Row | null =>
  originRecord(value) as Row | null;
const list = (value: JsonValue | undefined): JsonValue[] =>
  Array.isArray(value) ? value : [];
const text = (value: JsonValue | undefined) => (typeof value === "string" ? value : "");
const BENEFITS = [
  "ability",
  "size",
  "movement",
  "sense",
  "proficiency",
  "resistance",
  "spellcasting",
  "reference",
] as const;
const REQUIREMENTS = [
  "level",
  "ability",
  "proficiency",
  "feat",
  "spellcasting",
  "all",
  "any",
] as const;
const sizes = ["tiny", "small", "medium", "large", "huge", "gargantuan"];
const categories = ["skill", "tool", "language", "save"];
const defaults: Record<string, Row> = {
  ability: { kind: "ability", ability: "strength", amount: 1 },
  size: { kind: "size", size: "medium" },
  movement: { kind: "movement", mode: "walk", meters: 9 },
  sense: { kind: "sense", sense: "darkvision", meters: 18 },
  proficiency: { kind: "proficiency", category: "skill", id: "athletics" },
  resistance: { kind: "resistance", damageType: "cold" },
  reference: { kind: "reference", dependency: "" },
  spellcasting: { kind: "spellcasting", ability: "intelligence", policy: "ability" },
};
const requirementDefaults: Record<string, Row> = {
  level: { kind: "level", minimum: 1 },
  ability: { kind: "ability", ability: "strength", minimum: 13 },
  proficiency: { kind: "proficiency", category: "skill", id: "athletics" },
  feat: { kind: "feat", mechanicId: "", dependency: "" },
  spellcasting: { kind: "spellcasting" },
  all: { kind: "all", requirements: [] },
  any: { kind: "any", requirements: [] },
};
function changeKind(value: Row, kind: string, variants: Record<string, Row>) {
  const known = new Set(Object.values(variants).flatMap(Object.keys));
  return {
    ...Object.fromEntries(Object.entries(value).filter(([key]) => !known.has(key))),
    ...variants[kind],
  };
}
export interface OriginFieldsProps {
  definition: LibraryDefinition;
  disabled: boolean;
  onChange: (payload: LibraryDefinition["payload"]) => void;
  loadOriginSources?: () => Promise<LibraryVersion[]>;
  scope?: "starting" | "multiclass" | { levelId: string };
}

/** Guided declarations edit the same typed payload used by conformance and immutable versions. */
export function OriginFields({
  definition,
  disabled,
  onChange,
  loadOriginSources,
  scope,
}: OriginFieldsProps) {
  const label = useHomebrewLabel();
  const classScope = ["class", "subclass"].includes(definition.family);
  const root = definition.payload.data;
  const levels = list(root.progression);
  const levelIndex =
    typeof scope === "object"
      ? levels.findIndex((value) => row(value)?.id === scope.levelId)
      : -1;
  const scoped =
    scope === undefined
      ? root
      : typeof scope === "string"
        ? row(root[scope])
        : levels.filter((value) => row(value)?.id === scope.levelId).length === 1
          ? row(levels[levelIndex])
          : null;
  const data = scoped ?? {};
  const choices = list(data.choices);
  const dependencies = row(root.dependencies) ?? {};
  const edit = (key: string, value: JsonValue) => {
    if (!scoped || disabled) return;
    const next = { ...data, [key]: value };
    const updated =
      scope === undefined
        ? next
        : typeof scope === "string"
          ? { ...root, [scope]: next }
          : {
              ...root,
              progression: levels.map((level, index) =>
                index === levelIndex ? next : level
              ),
            };
    onChange({ ...definition.payload, data: updated });
  };
  const nameOf = (key: string) => {
    const d = row(row(dependencies[key])?.definition);
    return text(d?.name) || label("origin.missingDependency");
  };
  const select = (
    title: string,
    value: JsonValue | undefined,
    values: readonly string[],
    change: (value: string) => void,
    names: (value: string) => string = (v) => label("options." + v)
  ) => (
    <label>
      <span>{label(title)}</span>
      <select value={text(value)} onChange={(e) => change(e.target.value)}>
        {!values.includes(text(value)) && (
          <option value={text(value)}>
            {value === "" || value === undefined
              ? label("origin.choose")
              : label("preservedFields") + ": " + text(value)}
          </option>
        )}
        {values.map((v) => (
          <option key={v} value={v}>
            {names(v)}
          </option>
        ))}
      </select>
    </label>
  );
  const input = (
    title: string,
    value: JsonValue | undefined,
    change: (value: JsonValue) => void,
    numeric = false,
    min = 0,
    max = 1000
  ) => (
    <label>
      <span>{label(title)}</span>
      <input
        type={numeric ? "number" : "text"}
        min={numeric ? min : undefined}
        max={numeric ? max : undefined}
        value={typeof value === "string" || typeof value === "number" ? value : ""}
        onChange={(e) =>
          change(
            numeric && e.target.value !== "" ? Number(e.target.value) : e.target.value
          )
        }
      />
    </label>
  );
  const preserved = (value: JsonValue | undefined) => (
    <details className="origin-preserved">
      <summary>{label("preservedFields")}</summary>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
  function proficiency(value: Row, change: (value: Row) => void) {
    const category = text(value.category);
    return (
      <>
        {select(
          "origin.proficiencyCategory",
          value.category,
          categories,
          (category) =>
            change({
              ...value,
              category,
              id:
                category === "skill"
                  ? "athletics"
                  : category === "save"
                    ? "strength"
                    : "",
            }),
          (v) => label("origin.categories." + v)
        )}
        {category === "skill" || category === "save" ? (
          select(
            "origin.proficiency",
            value.id,
            category === "skill" ? ORIGIN_SKILLS : ABILITIES,
            (id) => change({ ...value, id })
          )
        ) : (
          <OriginProficiency
            category={category === "language" ? "language" : "tool"}
            value={text(value.id)}
            onChange={(id) => change({ ...value, id })}
          />
        )}
      </>
    );
  }
  function benefits(raw: JsonValue | undefined, change: (value: JsonValue) => void) {
    if (!Array.isArray(raw)) return preserved(raw);
    return (
      <div className="origin-benefits">
        {raw.map((item, index) => {
          const value = row(item);
          if (!value || !BENEFITS.includes(text(value.kind) as (typeof BENEFITS)[number]))
            return <div key={index}>{preserved(item)}</div>;
          const patch = (next: Row) =>
            change(raw.map((v, i) => (i === index ? next : v)));
          const field = (key: string, v: JsonValue) => patch({ ...value, [key]: v });
          return (
            <fieldset className="origin-row" key={index}>
              <legend>
                {label("origin.benefit")} {index + 1}
              </legend>
              <div className="homebrew-grid">
                {select(
                  "origin.benefitType",
                  value.kind,
                  BENEFITS,
                  (kind) => patch(changeKind(value, kind, defaults)),
                  (v) => label("origin.benefits." + v)
                )}
                {value.kind === "ability" && (
                  <>
                    {select("origin.ability", value.ability, ABILITIES, (v) =>
                      field("ability", v)
                    )}
                    {input(
                      "origin.increase",
                      value.amount,
                      (v) => field("amount", v),
                      true,
                      1,
                      10
                    )}
                  </>
                )}
                {value.kind === "spellcasting" &&
                  select("origin.ability", value.ability, ABILITIES, (v) =>
                    field("ability", v)
                  )}
                {value.kind === "size" &&
                  select("fields.size", value.size, sizes, (v) => field("size", v))}
                {value.kind === "movement" && (
                  <>
                    {select(
                      "origin.movement",
                      value.mode,
                      MOVEMENT_MODES,
                      (v) => field("mode", v),
                      (v) => label("origin.modes." + v)
                    )}
                    {input(
                      "origin.distance",
                      value.meters,
                      (v) => field("meters", v),
                      true
                    )}
                  </>
                )}
                {value.kind === "sense" && (
                  <>
                    {select(
                      "origin.sense",
                      value.sense,
                      SENSES,
                      (v) => field("sense", v),
                      (v) => label("fields." + v)
                    )}
                    {input(
                      "origin.distance",
                      value.meters,
                      (v) => field("meters", v),
                      true
                    )}
                  </>
                )}
                {value.kind === "proficiency" && proficiency(value, patch)}
                {value.kind === "resistance" &&
                  select("fields.damageType", value.damageType, DAMAGE_TYPES, (v) =>
                    field("damageType", v)
                  )}
                {value.kind === "reference" &&
                  select(
                    "origin.includedBenefit",
                    value.dependency,
                    Object.keys(dependencies).filter((key) =>
                      ["feat", "feature", "spell"].includes(
                        text(row(row(dependencies[key])?.definition)?.family)
                      )
                    ),
                    (v) => field("dependency", v),
                    nameOf
                  )}
              </div>
              <button
                type="button"
                onClick={() => change(raw.filter((_, i) => i !== index))}
              >
                {label("origin.removeBenefit")}
              </button>
              {Object.keys(value).some(
                (key) => !Object.keys(defaults[text(value.kind)] ?? {}).includes(key)
              ) && preserved(value)}
            </fieldset>
          );
        })}
        <button
          type="button"
          disabled={raw.length >= 32}
          onClick={() => change([...raw, { ...defaults.ability }])}
        >
          {label("origin.addBenefit")}
        </button>
      </div>
    );
  }
  function requirements(
    raw: JsonValue | undefined,
    change: (value: JsonValue) => void,
    depth = 0,
    alternative = false
  ) {
    if (!Array.isArray(raw)) return preserved(raw);
    return (
      <div className="origin-requirements">
        {raw.map((item, index) => {
          const value = row(item);
          if (
            !value ||
            !REQUIREMENTS.includes(text(value.kind) as (typeof REQUIREMENTS)[number])
          )
            return <div key={index}>{preserved(item)}</div>;
          const patch = (next: Row) =>
            change(raw.map((v, i) => (i === index ? next : v)));
          const field = (key: string, v: JsonValue) => patch({ ...value, [key]: v });
          return (
            <fieldset className="origin-row" key={index}>
              <legend>
                {label("origin.requirement")} {index + 1}
              </legend>
              <div className="homebrew-grid">
                {select(
                  "origin.requirement",
                  value.kind,
                  REQUIREMENTS,
                  (kind) => patch(changeKind(value, kind, requirementDefaults)),
                  (v) =>
                    label(
                      classScope && v === "level"
                        ? "classEditor.level"
                        : "origin.requirements." + v
                    )
                )}
                {value.kind === "level" &&
                  input(
                    "origin.minimumLevel",
                    value.minimum,
                    (v) => field("minimum", v),
                    true,
                    1,
                    20
                  )}
                {value.kind === "ability" && (
                  <>
                    {select("origin.ability", value.ability, ABILITIES, (v) =>
                      field("ability", v)
                    )}
                    {input(
                      "origin.minimumScore",
                      value.minimum,
                      (v) => field("minimum", v),
                      true,
                      1,
                      30
                    )}
                  </>
                )}
                {value.kind === "proficiency" && proficiency(value, patch)}
                {value.kind === "feat" &&
                  select(
                    "origin.requiredFeat",
                    value.dependency,
                    Object.keys(dependencies).filter(
                      (key) => row(row(dependencies[key])?.definition)?.family === "feat"
                    ),
                    (dependency) => {
                      const def = row(row(dependencies[dependency])?.definition);
                      const authored = row(row(def?.payload)?.data);
                      patch({
                        ...value,
                        dependency,
                        mechanicId: text(authored?.mechanicId),
                      });
                    },
                    nameOf
                  )}
              </div>
              {(value.kind === "all" || value.kind === "any") &&
                depth < 8 &&
                requirements(
                  value.requirements,
                  (v) => field("requirements", v),
                  depth + 1,
                  value.kind === "any"
                )}
              <button
                type="button"
                onClick={() => change(raw.filter((_, i) => i !== index))}
              >
                {label("origin.removeRequirement")}
              </button>
              {Object.keys(value).some(
                (key) =>
                  !Object.keys(requirementDefaults[text(value.kind)] ?? {}).includes(key)
              ) && preserved(value)}
            </fieldset>
          );
        })}
        <button
          type="button"
          disabled={raw.length >= 32 || depth >= 8}
          onClick={() => change([...raw, { kind: "level", minimum: 1 }])}
        >
          {label(alternative ? "origin.addAlternative" : "origin.addRequirement")}
        </button>
      </div>
    );
  }
  if (!scoped)
    return preserved(typeof scope === "string" ? root[scope] : root.progression);
  return (
    <div className="origin-fields">
      {scope === undefined && definition.family === "background" && (
        <fieldset className="homebrew-group" disabled={disabled}>
          <legend>{label("origin.backgroundPackage")}</legend>
          <p className="homebrew-hint">{label("origin.backgroundHelp")}</p>
          <div className="homebrew-grid">
            <OriginProficiency
              category="tool"
              value={text(data.tool)}
              onChange={(id) => edit("tool", id)}
            />
            {select(
              "fields.originFeat",
              data.originFeat,
              [
                "",
                ...Object.keys(dependencies).filter((key) => {
                  const d = row(row(dependencies[key])?.definition);
                  return (
                    d?.family === "feat" &&
                    row(row(d.payload)?.data)?.category === "origin"
                  );
                }),
              ],
              (v) => edit("originFeat", v),
              (v) => (v ? nameOf(v) : label("origin.choose"))
            )}
          </div>
          <p>{label("origin.equipmentHelp")}</p>
          {Array.isArray(data.equipment) ? (
            <div className="origin-equipment">
              {Object.keys(dependencies)
                .filter((key) =>
                  ["weapon", "equipment"].includes(
                    text(row(row(dependencies[key])?.definition)?.family)
                  )
                )
                .map((key) => (
                  <CheckboxField
                    key={key}
                    disabled={disabled}
                    checked={list(data.equipment).includes(key)}
                    onCheckedChange={(checked) =>
                      edit(
                        "equipment",
                        checked
                          ? [...list(data.equipment), key]
                          : list(data.equipment).filter((v) => v !== key)
                      )
                    }
                    label={nameOf(key)}
                  />
                ))}
            </div>
          ) : (
            preserved(data.equipment)
          )}
        </fieldset>
      )}
      {scope === undefined && (
        <fieldset disabled={disabled} className="homebrew-group">
          <legend>{label("origin.dependencies")}</legend>
          <p className="homebrew-hint">{label("origin.dependenciesHelp")}</p>
          {Object.entries(dependencies).map(([key, value]) => (
            <p className="origin-dependency" key={key}>
              <strong>{nameOf(key)}</strong> · {label("version")}{" "}
              {typeof row(value)?.sourceVersion === "number"
                ? (row(value)?.sourceVersion as number)
                : "—"}
            </p>
          ))}
          <OriginDependencyPicker
            disabled={disabled}
            load={loadOriginSources}
            onChoose={(version) =>
              onChange(includeOriginDependency(definition, version).definition.payload)
            }
          />
        </fieldset>
      )}
      <fieldset disabled={disabled} className="homebrew-group">
        <legend>{label("origin.requirementsTitle")}</legend>
        <p className="homebrew-hint">
          {label(classScope ? "classEditor.requirementsHelp" : "origin.requirementsHelp")}
        </p>
        {requirements(data.prerequisites, (v) => edit("prerequisites", v))}
      </fieldset>
      <fieldset disabled={disabled} className="homebrew-group">
        <legend>{label("origin.benefitsTitle")}</legend>
        <p className="homebrew-hint">
          {label(classScope ? "classEditor.benefitsHelp" : "origin.benefitsHelp")}
        </p>
        {benefits(data.benefits, (v) => edit("benefits", v))}
      </fieldset>
      <fieldset disabled={disabled} className="homebrew-group">
        <legend>{label("origin.choicesTitle")}</legend>
        <p className="homebrew-hint">{label("origin.choicesHelp")}</p>
        {!Array.isArray(data.choices) && preserved(data.choices)}
        {choices.map((item, index) => {
          const value = row(item);
          if (!value) return <div key={index}>{preserved(item)}</div>;
          const patch = (next: Row) =>
            edit(
              "choices",
              choices.map((v, i) => (i === index ? next : v))
            );
          const field = (key: string, v: JsonValue) => patch({ ...value, [key]: v });
          const parent = row(value.parent),
            parentChoice = row(choices.find((v) => row(v)?.id === parent?.choiceId));
          const others = (
            ["class", "subclass"].includes(definition.family)
              ? choices.slice(0, index)
              : choices
          ).filter((v) => row(v)?.id !== value.id);
          return (
            <fieldset className="origin-choice" key={text(value.id) || index}>
              <legend>
                {label("origin.choice")} {index + 1}
              </legend>
              <div className="homebrew-grid">
                {input("origin.choiceName", value.name, (v) => field("name", v))}
                {input(
                  "origin.chooseCount",
                  value.count,
                  (v) => field("count", v),
                  true,
                  1,
                  32
                )}
                {select(
                  "origin.availableAfter",
                  parent?.choiceId ?? "",
                  ["", ...others.map((v) => text(row(v)?.id))],
                  (choiceId) =>
                    field(
                      "parent",
                      choiceId ? { ...parent, choiceId, optionId: "" } : null
                    ),
                  (id) =>
                    id
                      ? text(row(choices.find((v) => row(v)?.id === id))?.name) ||
                        label("origin.unnamedChoice")
                      : label("origin.always")
                )}
                {parent &&
                  select(
                    "origin.parentOption",
                    parent.optionId,
                    list(parentChoice?.options).map((v) => text(row(v)?.id)),
                    (optionId) => field("parent", { ...parent, optionId }),
                    (id) =>
                      text(
                        row(list(parentChoice?.options).find((v) => row(v)?.id === id))
                          ?.name
                      ) || label("origin.unnamedOption")
                  )}
              </div>
              {!Array.isArray(value.options) && preserved(value.options)}
              {list(value.options).map((opt, i) => {
                const option = row(opt);
                if (!option) return <div key={i}>{preserved(opt)}</div>;
                const change = (next: Row) =>
                  field(
                    "options",
                    list(value.options).map((v, j) => (j === i ? next : v))
                  );
                return (
                  <fieldset className="origin-option" key={text(option.id) || i}>
                    <legend>
                      {label("origin.option")} {i + 1}
                    </legend>
                    {input("origin.optionName", option.name, (name) =>
                      change({ ...option, name })
                    )}
                    {benefits(option.benefits, (benefits) =>
                      change({ ...option, benefits })
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        field(
                          "options",
                          list(value.options).filter((_, j) => j !== i)
                        )
                      }
                    >
                      {label("origin.removeOption")}
                    </button>
                  </fieldset>
                );
              })}
              <div className="identity-actions">
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => {
                    const next = [...choices];
                    [next[index - 1], next[index]] = [
                      next[index] ?? null,
                      next[index - 1] ?? null,
                    ];
                    edit("choices", next);
                  }}
                >
                  {label("moveEarlier")}
                </button>
                <button
                  type="button"
                  disabled={
                    !Array.isArray(value.options) || list(value.options).length >= 32
                  }
                  onClick={() =>
                    field("options", [
                      ...list(value.options),
                      { id: crypto.randomUUID(), name: "", benefits: [] },
                    ])
                  }
                >
                  {label("origin.addOption")}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    edit(
                      "choices",
                      choices.filter((_, i) => i !== index)
                    )
                  }
                >
                  {label("origin.removeChoice")}
                </button>
              </div>
            </fieldset>
          );
        })}
        <button
          type="button"
          disabled={!Array.isArray(data.choices) || choices.length >= 32}
          onClick={() =>
            edit("choices", [
              ...choices,
              { id: crypto.randomUUID(), name: "", count: 1, options: [], parent: null },
            ])
          }
        >
          {label("origin.addChoice")}
        </button>
      </fieldset>
    </div>
  );
}
export function OriginDependencyPicker({
  disabled,
  load,
  onChoose,
  family,
  chooseLabel = "origin.includeVersion",
}: {
  disabled: boolean;
  load?: () => Promise<LibraryVersion[]>;
  onChoose: (v: LibraryVersion) => void;
  family?: LibraryDefinition["family"];
  chooseLabel?: string;
}) {
  const label = useHomebrewLabel();
  const [sources, setSources] = useState<LibraryVersion[]>([]),
    [selected, setSelected] = useState(""),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(false);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    []
  );
  async function refresh() {
    if (!load) return;
    const token = ++generation.current;
    setLoading(true);
    setError(false);
    try {
      const result = await load();
      if (generation.current === token) {
        setSources(
          family ? result.filter((v) => v.definition.family === family) : result
        );
        setSelected("");
      }
    } catch {
      if (generation.current === token) setError(true);
    } finally {
      if (generation.current === token) setLoading(false);
    }
  }
  const selectedSource = selected === "" ? undefined : sources[Number(selected)];
  return (
    <div className="origin-source-picker">
      <button
        type="button"
        disabled={disabled || !load || loading}
        onClick={() => void refresh()}
      >
        {label(loading ? "origin.loading" : "origin.browseLibrary")}
      </button>
      {sources.length > 0 && (
        <>
          <label>
            {label("origin.libraryVersion")}
            <select value={selected} onChange={(e) => setSelected(e.target.value)}>
              <option value="">{label("origin.choose")}</option>
              {sources.map((v, i) => (
                <option key={i} value={i}>
                  {v.definition.name} · {label("version")} {v.version}
                  {family === "class" && " · " + v.ownerUid + " / " + v.entryId}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={disabled || selected === ""}
            onClick={() => {
              try {
                const source = sources[Number(selected)];
                if (source) onChoose(source);
                setError(false);
              } catch {
                setError(true);
              }
            }}
          >
            {label(chooseLabel)}
          </button>
        </>
      )}
      {selectedSource && <HomebrewReader definition={selectedSource.definition} />}
      {error && <p role="alert">{label("origin.sourceError")}</p>}
    </div>
  );
}
