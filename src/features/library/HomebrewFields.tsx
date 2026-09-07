import { Checkbox } from "@/components/ui/selection";
import { baseFamily, useHomebrewLabel } from "./homebrew-labels";
import type { LibraryDefinition, JsonValue } from "@/lib/library/model";
import {
  baseFields,
  effectFields,
  blankEffect,
  initializeDefinition,
  type BaseFamily,
} from "@/lib/homebrew/model";
import { conformDefinition } from "@/lib/homebrew/conformance";
export function HomebrewFields({
  definition,
  disabled,
  onChange,
}: {
  definition: LibraryDefinition;
  disabled: boolean;
  onChange: (payload: LibraryDefinition["payload"]) => void;
}) {
  const label = useHomebrewLabel();
  if (!baseFamily(definition.family)) return null;
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
            onClick={() =>
              onChange(initializeDefinition(definition.family as BaseFamily).payload)
            }
          >
            {label("setup." + definition.family)}
          </button>
        )}
      </div>
    );
  const edit = (key: string, value: JsonValue) =>
    onChange({ ...definition.payload, data: { ...data, [key]: value } });
  const fields = baseFields(definition.family);
  const groups = [...new Set(fields.map((f) => f.group))].sort(
    (a, b) =>
      Number(["provenance", "notes"].includes(a)) -
      Number(["provenance", "notes"].includes(b))
  );
  const control = (
    field: ReturnType<typeof baseFields>[number],
    value: JsonValue | undefined,
    change: (v: JsonValue) => void,
    prefix = ""
  ) => {
    const name = "homebrew-" + prefix + field.key;
    return (
      <label key={name} className={field.type === "boolean" ? "homebrew-check" : ""}>
        {field.type !== "boolean" && <span>{label("fields." + field.key)}</span>}
        {field.type === "select" ? (
          <select
            name={name}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => change(e.target.value)}
          >
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
  return (
    <div className="homebrew-fields">
      {groups.map((group) => (
        <fieldset key={group} disabled={disabled} className="homebrew-group">
          <legend>{label("groups." + group)}</legend>
          <div className="homebrew-grid">
            {fields
              .filter((f) => f.group === group)
              .map((f) => control(f, data[f.key], (v) => edit(f.key, v)))}
          </div>
        </fieldset>
      ))}
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
                {[...fields, ...effectFields()].some(
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
