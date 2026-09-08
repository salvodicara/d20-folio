import { SubclassFields } from "./SubclassFields";
import { ClassFields } from "./ClassFields";
import { AdvancedFields } from "./AdvancedFields";
import { OriginFields, type OriginFieldsProps } from "./OriginFields";
import { originRecord } from "@/lib/homebrew/origins";
import { isOriginFamily } from "@/lib/homebrew/origins";
import { Checkbox } from "@/components/ui/selection";
import { authoringFamily, useHomebrewLabel } from "./homebrew-labels";
import type { LibraryDefinition, JsonValue } from "@/lib/library/model";
import {
  authoringFields,
  effectFields,
  blankEffect,
  initializeDefinition,
} from "@/lib/homebrew/model";
import { conformDefinition } from "@/lib/homebrew/conformance";
export function HomebrewFields({
  definition,
  disabled,
  onChange,
  loadOriginSources,
}: {
  definition: LibraryDefinition;
  disabled: boolean;
  onChange: (payload: LibraryDefinition["payload"]) => void;
  loadOriginSources?: OriginFieldsProps["loadOriginSources"];
}) {
  const label = useHomebrewLabel();
  if (!authoringFamily(definition.family)) return null;
  const data = definition.payload.data;
  if (data.authoringVersion !== 1)
    return (
      <div className="homebrew-setup">
        <p role="status">
          {label(Object.keys(data).length ? "preservedPayload" : "setupHelp")}
        </p>
        {!Object.keys(data).length && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(initializeDefinition(definition.family).payload)}
          >
            {label("setup." + definition.family)}
          </button>
        )}
      </div>
    );
  const edit = (key: string, value: JsonValue) =>
    onChange({ ...definition.payload, data: { ...data, [key]: value } });
  const fields = authoringFields(definition.family);
  const origin = isOriginFamily(definition.family);
  const classEditor = ["class", "subclass"].includes(definition.family);
  const groups = [...new Set(fields.map((f) => f.group))].sort(
    (a, b) =>
      Number(["provenance", "notes"].includes(a)) -
      Number(["provenance", "notes"].includes(b))
  );
  const control = (
    field: ReturnType<typeof authoringFields>[number],
    value: JsonValue | undefined,
    change: (v: JsonValue) => void,
    prefix = ""
  ) => {
    const name = "homebrew-" + prefix + field.key;
    return (
      <label
        key={name}
        className={
          field.type === "boolean"
            ? "homebrew-check"
            : field.multiline
              ? "homebrew-prose"
              : ""
        }
      >
        {field.type !== "boolean" && <span>{label("fields." + field.key)}</span>}
        {field.type === "select" ? (
          <select
            name={name}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => change(e.target.value)}
          >
            {(typeof value !== "string" || !field.options?.includes(value)) && (
              <option value={typeof value === "string" ? value : ""}>
                {label("diagnostics.unsupported-option")} ·{" "}
                {typeof value === "string"
                  ? value
                  : value === undefined
                    ? "—"
                    : JSON.stringify(value)}
              </option>
            )}
            {field.options?.map((v) => (
              <option key={v} value={v}>
                {v ? label("options." + v) : "—"}
              </option>
            ))}
          </select>
        ) : field.type === "boolean" ? (
          <>
            <Checkbox
              name={name}
              data-homebrew-field={name}
              aria-label={label("fields." + field.key)}
              disabled={disabled}
              checked={value === true}
              onCheckedChange={(checked) => change(checked === true)}
            />
            <span>{label("fields." + field.key)}</span>
          </>
        ) : field.multiline ? (
          <textarea
            name={name}
            rows={4}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => change(e.target.value)}
          />
        ) : (
          <input
            name={name}
            readOnly={field.key === "authoringVersion"}
            type={field.type === "number" ? "number" : "text"}
            min={field.min}
            max={field.max}
            step={field.type === "number" ? "any" : undefined}
            value={typeof value === "string" || typeof value === "number" ? value : ""}
            onChange={(e) =>
              change(
                field.type === "number" && e.target.value !== ""
                  ? Number(e.target.value)
                  : e.target.value
              )
            }
          />
        )}
      </label>
    );
  };
  const effects = Array.isArray(data.effects) ? data.effects : [];
  const diagnostics = conformDefinition(definition);
  const classText = (value: unknown) =>
    typeof value === "string" || typeof value === "number" ? String(value) : "—";
  const classLocation = (path: string) => {
    const parts = path.replace(/^payload.data\./, "").split(".");
    const group = parts[0] ?? "";
    if (group === "progression" && parts[1] && Array.isArray(data.progression)) {
      const row = originRecord(data.progression[Number(parts[1])]);
      return (
        label("classEditor.level") +
        " " +
        classText(row?.level) +
        " · " +
        classText(row?.name)
      );
    }
    if (
      ["programs", "resources"].includes(group) &&
      parts[1] &&
      Array.isArray(data[group])
    ) {
      const row = originRecord(data[group][Number(parts[1])]);
      return (
        label("collections." + group) +
        " · " +
        classText(row?.name ?? Number(parts[1]) + 1)
      );
    }
    return label(
      [
        "starting",
        "multiclass",
        "progression",
        "hitDie",
        "primaryAbilities",
        "savingThrows",
        "subclassLevels",
        "parentClass",
        "castingRelationship",
      ].includes(group)
        ? group === "parentClass"
          ? "classes.parent"
          : "classes." + group
        : group === "spellcasting"
          ? "classes.casting"
          : "checkContent"
    );
  };
  return (
    <div className="homebrew-fields">
      {groups.map((group) => {
        const content = (
          <fieldset disabled={disabled} className="homebrew-group">
            <legend>{label("groups." + group)}</legend>
            <div className="homebrew-grid">
              {fields
                .filter(
                  (f) =>
                    f.group === group &&
                    !(
                      (origin || classEditor) &&
                      ["originFeat", "tool", "authoringVersion"].includes(f.key)
                    )
                )
                .map((f) => control(f, data[f.key], (v) => edit(f.key, v)))}
            </div>
          </fieldset>
        );
        return (origin || classEditor) && group === "provenance" ? (
          <details key={group} className="origin-advanced">
            <summary>{label("origin.sourceIdentity")}</summary>
            <p className="homebrew-hint">{label("origin.sourceIdentityHelp")}</p>
            {content}
          </details>
        ) : (
          <div key={group}>{content}</div>
        );
      })}
      {definition.family === "subclass" && (
        <SubclassFields
          definition={definition}
          disabled={disabled}
          onChange={onChange}
          loadOriginSources={loadOriginSources}
        />
      )}
      {classEditor && (
        <ClassFields
          definition={definition}
          disabled={disabled}
          onChange={onChange}
          loadOriginSources={loadOriginSources}
        />
      )}
      {origin && (
        <OriginFields
          definition={definition}
          disabled={disabled}
          onChange={onChange}
          loadOriginSources={loadOriginSources}
        />
      )}
      {origin || classEditor ? (
        <details className="origin-advanced">
          <summary>{label("origin.advancedMechanics")}</summary>
          <p className="homebrew-hint">{label("origin.advancedHelp")}</p>
          <AdvancedFields
            guided={classEditor}
            definition={definition}
            disabled={disabled}
            onChange={onChange}
          />
        </details>
      ) : (
        <AdvancedFields definition={definition} disabled={disabled} onChange={onChange} />
      )}
      <fieldset disabled={disabled} className="homebrew-group">
        <legend>{label("effects")}</legend>
        <p className="homebrew-hint">{label("effectsHelp")}</p>
        {effects.map((effect, index) => {
          if (!effect || typeof effect !== "object" || Array.isArray(effect))
            return <p key={index}>{label("preservedPayload")}</p>;
          return (
            <details key={index} className="homebrew-effect" open>
              <summary>
                {label("effect")} {index + 1}
              </summary>
              <div className="homebrew-grid">
                {effectFields().map((f) =>
                  control(
                    f,
                    effect[f.key],
                    (v) =>
                      edit(
                        "effects",
                        effects.map((x, i) =>
                          i === index ? { ...effect, [f.key]: v } : x
                        )
                      ),
                    `effect-${index}-`
                  )
                )}
              </div>
              <button
                type="button"
                onClick={() =>
                  edit(
                    "effects",
                    effects.filter((_, i) => i !== index)
                  )
                }
              >
                {label("removeEffect")}
              </button>
            </details>
          );
        })}
        {!Array.isArray(data.effects) && <p role="status">{label("preservedPayload")}</p>}
        <button
          type="button"
          disabled={!Array.isArray(data.effects)}
          onClick={() =>
            edit("effects", [...effects, blankEffect() as unknown as JsonValue])
          }
        >
          {label("addEffect")}
        </button>
      </fieldset>
      <fieldset disabled={disabled} className="homebrew-group">
        <legend>{label("fields.unsupported")}</legend>
        <label>
          {label("unsupportedHelp")}
          <textarea
            name="homebrew-unsupported"
            disabled={
              !Array.isArray(data.unsupported) ||
              data.unsupported.some((v) => typeof v !== "string")
            }
            value={
              Array.isArray(data.unsupported) &&
              data.unsupported.every((v) => typeof v === "string")
                ? data.unsupported.join("\n")
                : JSON.stringify(data.unsupported)
            }
            onChange={(e) =>
              edit(
                "unsupported",
                e.target.value.split("\n").filter((v) => v.trim())
              )
            }
          />
        </label>
      </fieldset>
      <p className="homebrew-hint">{label("authoringOnly")}</p>
      {diagnostics.length > 0 && (
        <div className="homebrew-validation" role="status">
          <h3>{label("checkContent")}</h3>
          <ul>
            {diagnostics.map((d, i) => (
              <li key={i}>
                <strong>{label("diagnostics." + d.code)}</strong> ·{" "}
                {classEditor
                  ? classLocation(d.path)
                  : [...fields, ...effectFields()].some(
                        (f) => f.key === d.path.split(".").at(-1)
                      )
                    ? label("fields." + (d.path.split(".").at(-1) ?? "definition"))
                    : label("fieldIssue")}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
