import { useState } from "react";
import { conformClassPair, decodeClassDefinition } from "@/lib/homebrew/classes";
import { includeOriginDependency, originRecord } from "@/lib/homebrew/origins";
import { OriginDependencyPicker, type OriginFieldsProps } from "./OriginFields";
import { useHomebrewLabel } from "./homebrew-labels";

/** Parent selection changes the same pinned closure as every other included creation. */
export function SubclassFields({
  definition,
  disabled,
  onChange,
  loadOriginSources,
}: OriginFieldsProps) {
  const label = useHomebrewLabel();
  const [error, setError] = useState(false);
  const data = definition.payload.data;
  const parent = originRecord(data.parentClass);
  const dependencies = originRecord(data.dependencies);
  const pinned = originRecord(dependencies?.[String(parent?.dependency)]);
  const pinnedDefinition = originRecord(pinned?.definition);
  const parentData = originRecord(originRecord(pinnedDefinition?.payload)?.data);
  const source = originRecord(pinned?.source);
  const display = (value: unknown) =>
    typeof value === "string" || typeof value === "number" ? String(value) : "";
  const relationship = display(data.castingRelationship);
  return (
    <>
      <fieldset disabled={disabled} className="homebrew-group">
        <legend>{label("classes.parent")}</legend>
        <p className="homebrew-hint">{label("subclassEditor.parentHelp")}</p>
        {pinnedDefinition ? (
          <>
            <p>
              <strong>{display(pinnedDefinition.name)}</strong> · {label("version")}{" "}
              {display(pinned?.sourceVersion)}
            </p>
            <details className="origin-advanced">
              <summary>{label("origin.sourceIdentity")}</summary>
              <p>
                {label("subclassEditor.versionOwner")} · {display(source?.ownerUid)}
              </p>
            </details>
            <p>
              <strong>{label("classes.subclassLevels")}</strong>:{" "}
              {Array.isArray(parentData?.subclassLevels)
                ? parentData.subclassLevels.map(display).join(", ")
                : label("preservedFields")}
            </p>
            <p className="homebrew-hint">{label("subclassEditor.scheduleHelp")}</p>
          </>
        ) : (
          <p role="status">{label("subclassEditor.noParent")}</p>
        )}
        {parent && dependencies ? (
          <OriginDependencyPicker
            disabled={disabled}
            family="class"
            chooseLabel="subclassEditor.chooseParent"
            load={loadOriginSources}
            onChoose={(version) => {
              if (disabled) return;
              try {
                const decoded = decodeClassDefinition(version.definition);
                if (!decoded.ok || decoded.family !== "class")
                  throw new Error("invalid-parent");
                const included = includeOriginDependency(definition, version);
                included.definition.payload.data.parentClass = {
                  ...parent,
                  dependency: included.key,
                  mechanicId: decoded.data.mechanicId,
                };
                const pair = conformClassPair(included.definition, version);
                if (
                  pair.some((issue) =>
                    ["parent-version-mismatch", "incompatible-parent-class"].includes(
                      issue.code
                    )
                  )
                )
                  throw new Error("parent-mismatch");
                onChange(included.definition.payload);
                setError(false);
              } catch {
                setError(true);
              }
            }}
          />
        ) : (
          <details className="origin-preserved">
            <summary>{label("preservedFields")}</summary>
            <pre>
              {JSON.stringify(
                { parentClass: data.parentClass, dependencies: data.dependencies },
                null,
                2
              )}
            </pre>
          </details>
        )}
        {error && <p role="alert">{label("subclassEditor.parentError")}</p>}
      </fieldset>
      <fieldset disabled={disabled} className="homebrew-group">
        <legend>{label("classes.castingRelationship")}</legend>
        <label>
          <span>{label("subclassEditor.relationship")}</span>
          <select
            value={relationship}
            onChange={(e) =>
              onChange({
                ...definition.payload,
                data: { ...data, castingRelationship: e.target.value },
              })
            }
          >
            {!["inherit", "augment", "replace"].includes(relationship) && (
              <option value={relationship}>
                {label("preservedFields")} · {JSON.stringify(data.castingRelationship)}
              </option>
            )}
            {["inherit", "augment", "replace"].map((mode) => (
              <option key={mode} value={mode}>
                {label("classes.relationships." + mode)}
              </option>
            ))}
          </select>
        </label>
        <p className="homebrew-hint">{label("subclassEditor.relationshipHelp")}</p>
      </fieldset>
    </>
  );
}
