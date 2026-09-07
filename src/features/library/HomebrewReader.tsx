import { advancedCollections } from "@/lib/homebrew/advanced";
import { AdvancedReader } from "./AdvancedFields";
import type { LibraryDefinition, JsonValue } from "@/lib/library/model";
import { conformDefinition } from "@/lib/homebrew/conformance";
import { authoringFields, effectFields } from "@/lib/homebrew/model";
import { authoringFamily, useHomebrewLabel } from "./homebrew-labels";
export function HomebrewReader({
  definition,
  printable = false,
}: {
  definition: LibraryDefinition;
  printable?: boolean;
}) {
  const label = useHomebrewLabel();
  const data = definition.payload.data;
  const value = (v: JsonValue | undefined, options?: readonly string[]): string =>
    typeof v === "boolean"
      ? label(v ? "yes" : "no")
      : typeof v === "string"
        ? options?.includes(v)
          ? v
            ? label("options." + v)
            : "—"
          : v
        : typeof v === "number"
          ? String(v)
          : v == null
            ? "—"
            : JSON.stringify(v);
  if (!authoringFamily(definition.family) || data.authoringVersion !== 1)
    return (
      <div className="homebrew-reader">
        <p>{definition.description}</p>
        <p>{label("preservedPayload")}</p>
        <pre>{JSON.stringify(data, null, 2)}</pre>
      </div>
    );
  const fields = authoringFields(definition.family);
  const diagnostics = conformDefinition(definition);
  const collectionKeys = advancedCollections(definition.family).map((c) => c.key);
  const retainedFields = Object.fromEntries(
    Object.entries(data).filter(
      ([key, value]) =>
        !fields.some((field) => field.key === key) &&
        !["effects", "authoringVersion", ...collectionKeys].includes(key) &&
        !(key === "unsupported" && Array.isArray(value) && value.length === 0)
    )
  );

  return (
    <article className="homebrew-reader">
      <h3>{definition.name}</h3>
      <p className="library-description">{definition.description}</p>
      {[...new Set(fields.map((f) => f.group))].map((group) => (
        <section key={group}>
          <h4>{label("groups." + group)}</h4>
          <dl className="homebrew-facts">
            {fields
              .filter((f) => f.group === group)
              .map((f) => (
                <div key={f.key}>
                  <dt>{label("fields." + f.key)}</dt>
                  <dd>{value(data[f.key], f.options) || "—"}</dd>
                </div>
              ))}
          </dl>
        </section>
      ))}
      <AdvancedReader definition={definition} printable={printable} />
      {!Array.isArray(data.effects) && (
        <details open={printable}>
          <summary>{label("preservedFields")}</summary>
          <pre>{JSON.stringify(data.effects, null, 2)}</pre>
        </details>
      )}
      {Array.isArray(data.effects) && data.effects.length > 0 && (
        <section>
          <h4>{label("effects")}</h4>
          {data.effects.map((e, i) =>
            e && typeof e === "object" && !Array.isArray(e) ? (
              <dl key={i} className="homebrew-facts">
                {effectFields().map((f) => (
                  <div key={f.key}>
                    <dt>{label("fields." + f.key)}</dt>
                    <dd>{value(e[f.key], f.options) || "—"}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <pre key={i}>{JSON.stringify(e)}</pre>
            )
          )}
        </section>
      )}
      {Object.keys(retainedFields).length > 0 && (
        <details open={printable}>
          <summary>{label("preservedFields")}</summary>
          <pre>{JSON.stringify(retainedFields, null, 2)}</pre>
        </details>
      )}
      {diagnostics.length > 0 && (
        <div role="status">
          <h4>{label("checkContent")}</h4>
          {diagnostics.map((d, i) => (
            <p key={i}>{label("diagnostics." + d.code)}</p>
          ))}
        </div>
      )}
      {Array.isArray(data.effects) &&
        data.effects.some(
          (e) =>
            e &&
            typeof e === "object" &&
            !Array.isArray(e) &&
            Object.keys(e).some((k) => !effectFields().some((f) => f.key === k))
        ) && (
          <details open={printable}>
            <summary>{label("preservedFields")}</summary>
            <pre>{JSON.stringify(data.effects, null, 2)}</pre>
          </details>
        )}
      <p className="homebrew-hint">{label("authoringOnly")}</p>
    </article>
  );
}
