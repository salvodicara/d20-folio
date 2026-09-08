import { HomebrewReader } from "./HomebrewReader";
import { parseDefinition } from "@/lib/library/model";
import { originRecord } from "@/lib/homebrew/origins";
import type { JsonValue, LibraryDefinition } from "@/lib/library/model";
import { useHomebrewLabel } from "./homebrew-labels";

import { originBenefitText, originRequirementText } from "./origin-text";
const str = (v: unknown) => (typeof v === "string" ? v : "");
export function OriginReader({
  definition,
  printable = false,
  bundle,
  included = false,
}: {
  definition: LibraryDefinition;
  printable?: boolean;
  bundle?: Record<string, JsonValue>;
  included?: boolean;
}) {
  const label = useHomebrewLabel(),
    data = definition.payload.data;
  const declarations = [
    "prerequisites",
    "benefits",
    "choices",
    "dependencies",
    "equipment",
  ];
  const known = Object.fromEntries(
    declarations.filter((key) => Object.hasOwn(data, key)).map((key) => [key, data[key]])
  );
  const benefitList = (raw: JsonValue | undefined) =>
    Array.isArray(raw) && raw.length > 0 ? (
      <ul>
        {raw.map((b, i) => (
          <li key={i}>{originBenefitText(b, label, resolvedDefinition)}</li>
        ))}
      </ul>
    ) : null;
  const dependencies = originRecord(data.dependencies) ?? bundle ?? {};
  const resolvedDefinition: LibraryDefinition = {
    ...definition,
    payload: {
      ...definition.payload,
      data: { ...data, dependencies: dependencies as Record<string, JsonValue> },
    },
  };
  const renderIncluded = (value: unknown) => {
    const node = originRecord(value);
    try {
      const child = parseDefinition(node?.definition);
      return (
        <>
          <HomebrewReader
            definition={child}
            printable={printable}
            originBundle={dependencies as Record<string, JsonValue>}
            included
          />
          <details open={printable}>
            <summary>{label("source")}</summary>
            <pre>
              {JSON.stringify(
                Object.fromEntries(
                  Object.entries(node ?? {}).filter(([key]) => key !== "definition")
                ),
                null,
                2
              )}
            </pre>
          </details>
        </>
      );
    } catch {
      return <pre>{JSON.stringify(value, null, 2)}</pre>;
    }
  };
  const choiceList = Array.isArray(data.choices) ? data.choices : [];
  const depName = (key: unknown) =>
    str(originRecord(originRecord(dependencies[str(key)])?.definition)?.name) ||
    label("origin.missingDependency");
  return (
    <div className="origin-reader">
      {Array.isArray(data.prerequisites) && data.prerequisites.length > 0 && (
        <section>
          <h4>{label("origin.requirementsTitle")}</h4>
          <ul>
            {data.prerequisites.map((p, i) => (
              <li key={i}>{originRequirementText(p, label, resolvedDefinition)}</li>
            ))}
          </ul>
        </section>
      )}
      {Array.isArray(data.benefits) && data.benefits.length > 0 && (
        <section>
          <h4>{label("origin.benefitsTitle")}</h4>
          {benefitList(data.benefits)}
        </section>
      )}
      {choiceList.length > 0 && (
        <section>
          <h4>{label("origin.choicesTitle")}</h4>
          {choiceList.map((value, i) => {
            const choice = originRecord(value);
            if (!choice) return <pre key={i}>{JSON.stringify(value)}</pre>;
            const parent = originRecord(choice.parent);
            const parentChoice = originRecord(
              choiceList.find((c) => originRecord(c)?.id === parent?.choiceId)
            );
            const parentOption = Array.isArray(parentChoice?.options)
              ? originRecord(
                  parentChoice.options.find(
                    (o) => originRecord(o)?.id === parent?.optionId
                  )
                )
              : null;
            return (
              <section className="origin-read-choice" key={i}>
                <h5>{str(choice.name) || label("origin.unnamedChoice")}</h5>
                <p>
                  {label("origin.chooseCount")}: {String(choice.count)}
                  {parent
                    ? " · " +
                      label("origin.availableAfter") +
                      ": " +
                      (str(parentChoice?.name) || label("origin.unnamedChoice")) +
                      " → " +
                      (str(parentOption?.name) || label("origin.unnamedOption"))
                    : ""}
                </p>
                {Array.isArray(choice.options) &&
                  choice.options.map((v, n) => {
                    const option = originRecord(v);
                    return (
                      <div className="origin-read-option" key={n}>
                        <strong>
                          {str(option?.name) || label("origin.unnamedOption")}
                        </strong>
                        {benefitList(option?.benefits as JsonValue)}
                      </div>
                    );
                  })}
              </section>
            );
          })}
        </section>
      )}
      {definition.family === "background" && (
        <section>
          <h4>{label("origin.backgroundPackage")}</h4>
          <p>{label("origin.backgroundHelp")}</p>
          <p>
            {label("fields.originFeat")}: {depName(data.originFeat)}
          </p>
          {Array.isArray(data.equipment) && data.equipment.length > 0 && (
            <ul>
              {data.equipment.map((key, i) => (
                <li key={i}>{depName(key)}</li>
              ))}
            </ul>
          )}
          <p>
            {label("fields.equipmentGold")}:{" "}
            {typeof data.equipmentGold === "number" ? data.equipmentGold : "—"}
          </p>
        </section>
      )}
      {!included && Object.entries(dependencies).length > 0 && (
        <section>
          <h4>{label("origin.dependencies")}</h4>
          {Object.entries(dependencies).map(([key, value]) => {
            const node = originRecord(value);
            return (
              <section key={key}>
                <h5>
                  {depName(key)} · {label("version")} {String(node?.sourceVersion)}
                </h5>
                {renderIncluded(value)}
              </section>
            );
          })}
        </section>
      )}
      {Object.hasOwn(data, "dependencies") && !originRecord(data.dependencies) && (
        <details open={printable}>
          <summary>
            {label("preservedFields")}: {label("origin.dependencies")}
          </summary>
          <pre>{JSON.stringify(data.dependencies, null, 2)}</pre>
        </details>
      )}
      <details open={printable}>
        <summary>{label("origin.completeDeclarations")}</summary>
        <pre>
          {JSON.stringify(
            Object.fromEntries(
              Object.entries(known).filter(([key]) => key !== "dependencies")
            ),
            null,
            2
          )}
        </pre>
      </details>
    </div>
  );
}
