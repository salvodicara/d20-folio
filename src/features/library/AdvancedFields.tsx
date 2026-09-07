import { Checkbox } from "@/components/ui/selection";
import {
  advancedCollections,
  blankAdvancedRow,
  type AdvancedCollection,
} from "@/lib/homebrew/advanced";
import type { FieldDescriptor } from "@/lib/homebrew/model";
import type { JsonValue, LibraryDefinition } from "@/lib/library/model";
import { useHomebrewLabel, authoringFamily } from "./homebrew-labels";
const record = (v: JsonValue | undefined): v is Record<string, JsonValue> =>
  !!v && typeof v === "object" && !Array.isArray(v);
export function AdvancedFields({
  definition,
  disabled,
  onChange,
}: {
  definition: LibraryDefinition;
  disabled: boolean;
  onChange: (payload: LibraryDefinition["payload"]) => void;
}) {
  const label = useHomebrewLabel();
  function control(
    f: FieldDescriptor,
    value: JsonValue | undefined,
    change: (v: JsonValue) => void,
    path: string
  ) {
    const name = "homebrew-" + path + "-" + f.key;
    return (
      <label key={f.key} className={f.type === "boolean" ? "homebrew-check" : ""}>
        <span>{label("fields." + f.key)}</span>
        {f.type === "boolean" ? (
          <Checkbox
            checked={value === true}
            disabled={disabled}
            aria-label={label("fields." + f.key)}
            onCheckedChange={(v) => change(v === true)}
          />
        ) : f.type === "select" ? (
          <select
            name={name}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => change(e.target.value)}
          >
            {(typeof value !== "string" || !f.options?.includes(value)) && (
              <option value={typeof value === "string" ? value : ""}>
                {label("diagnostics.unsupported-option")} · {JSON.stringify(value)}
              </option>
            )}
            {f.options?.map((v) => (
              <option key={v} value={v}>
                {v ? label("options." + v) : "—"}
              </option>
            ))}
          </select>
        ) : (
          <input
            name={name}
            type={f.type === "number" ? "number" : "text"}
            min={f.min}
            max={f.max}
            step="any"
            value={typeof value === "number" || typeof value === "string" ? value : ""}
            onChange={(e) =>
              change(
                f.type === "number" && e.target.value !== ""
                  ? Number(e.target.value)
                  : e.target.value
              )
            }
          />
        )}
      </label>
    );
  }
  function collection(
    c: AdvancedCollection,
    raw: JsonValue | undefined,
    change: (v: JsonValue) => void,
    path: string
  ) {
    const rows = Array.isArray(raw) ? raw : [];
    return (
      <fieldset
        key={path}
        disabled={disabled}
        className="homebrew-group homebrew-collection"
      >
        <legend>{label("collections." + c.key)}</legend>
        {!Array.isArray(raw) && <p role="status">{label("preservedPayload")}</p>}
        {rows.map((r, i) =>
          record(r) ? (
            <details className="homebrew-effect" key={i} open>
              <summary>
                {typeof r.name === "string" && r.name
                  ? r.name
                  : label("rows." + c.kind) + " " + String(i + 1)}
              </summary>
              <div className="homebrew-grid">
                {c.fields.map((f) =>
                  control(
                    f,
                    r[f.key],
                    (v) =>
                      change(rows.map((x, j) => (j === i ? { ...r, [f.key]: v } : x))),
                    path + "-" + String(i)
                  )
                )}
              </div>
              {c.collections?.map((n) =>
                collection(
                  n,
                  r[n.key],
                  (v) => change(rows.map((x, j) => (j === i ? { ...r, [n.key]: v } : x))),
                  path + "-" + String(i) + "-" + n.key
                )
              )}
              <div className="identity-actions">
                <button
                  type="button"
                  disabled={i === 0}
                  onClick={() => {
                    const next = [...rows];
                    [next[i - 1], next[i]] = [next[i] ?? null, next[i - 1] ?? null];
                    change(next);
                  }}
                >
                  {label("moveEarlier")}
                </button>
                <button
                  type="button"
                  onClick={() => change(rows.filter((_, j) => j !== i))}
                >
                  {label("removeRow")}
                </button>
              </div>
            </details>
          ) : (
            <p key={i} role="status">
              {label("preservedPayload")} <code>{JSON.stringify(r)}</code>
            </p>
          )
        )}
        <button
          type="button"
          data-add-collection={path}
          disabled={!Array.isArray(raw) || rows.length >= c.max}
          onClick={() => {
            const row = blankAdvancedRow(c.kind);
            if (Object.hasOwn(row, "id")) row.id = crypto.randomUUID();
            change([...rows, row]);
          }}
        >
          {label("addRows." + c.kind)}
        </button>
      </fieldset>
    );
  }
  return (
    <>
      {advancedCollections(
        authoringFamily(definition.family) ? definition.family : "weapon"
      ).map((c) =>
        collection(
          c,
          definition.payload.data[c.key],
          (v) =>
            onChange({
              ...definition.payload,
              data: { ...definition.payload.data, [c.key]: v },
            }),
          c.key
        )
      )}
    </>
  );
}
export function AdvancedReader({
  definition,
  printable = false,
}: {
  definition: LibraryDefinition;
  printable?: boolean;
}) {
  const label = useHomebrewLabel();
  const value = (v: JsonValue | undefined, f: FieldDescriptor) =>
    typeof v === "boolean"
      ? label(v ? "yes" : "no")
      : typeof v === "string" && f.options?.includes(v)
        ? v
          ? label("options." + v)
          : "—"
        : typeof v === "string" || typeof v === "number"
          ? String(v)
          : JSON.stringify(v);
  function collection(c: AdvancedCollection, raw: JsonValue | undefined, path: string) {
    if (!Array.isArray(raw))
      return (
        <details key={path} open={printable}>
          <summary>{label("preservedFields")}</summary>
          <pre>{JSON.stringify(raw, null, 2)}</pre>
        </details>
      );
    if (!raw.length) return null;
    return (
      <section key={path}>
        <h4>{label("collections." + c.key)}</h4>
        {raw.map((r, i) =>
          record(r) ? (
            <section key={i}>
              <dl className="homebrew-facts">
                {c.fields.map((f) => (
                  <div key={f.key}>
                    <dt>{label("fields." + f.key)}</dt>
                    <dd>{value(r[f.key], f)}</dd>
                  </div>
                ))}
              </dl>
              {c.collections?.map((n) =>
                collection(n, r[n.key], path + "-" + String(i) + "-" + n.key)
              )}
              {Object.keys(r).some(
                (k) =>
                  !c.fields.some((f) => f.key === k) &&
                  !c.collections?.some((n) => n.key === k)
              ) && (
                <details open={printable}>
                  <summary>{label("preservedFields")}</summary>
                  <pre>{JSON.stringify(r, null, 2)}</pre>
                </details>
              )}
            </section>
          ) : (
            <pre key={i}>{JSON.stringify(r, null, 2)}</pre>
          )
        )}
      </section>
    );
  }
  return (
    <>
      {advancedCollections(
        authoringFamily(definition.family) ? definition.family : "weapon"
      ).map((c) => collection(c, definition.payload.data[c.key], c.key))}
    </>
  );
}
