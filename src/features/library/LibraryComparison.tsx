import { libraryKey } from "./labels";
import { useTranslation } from "react-i18next";
import { equal } from "@/lib/shared/model";
import type { LibraryDefinition, JsonValue } from "@/lib/library/model";
import { baseFields, effectFields } from "@/lib/homebrew/model";
import { baseFamily, useHomebrewLabel } from "./homebrew-labels";
export function LibraryComparison({
  before,
  after,
}: {
  before: LibraryDefinition;
  after: LibraryDefinition;
}) {
  const { t } = useTranslation("common"),
    label = useHomebrewLabel();
  const rows: {
    key: string;
    name: string;
    before: unknown;
    after: unknown;
    options?: readonly string[];
  }[] = [];
  for (const key of ["name", "description", "tags"] as const)
    if (!equal(before[key], after[key]))
      rows.push({
        key,
        name: t(libraryKey(key)),
        before: before[key],
        after: after[key],
      });
  if (!equal(before.payload, after.payload)) {
    if (
      baseFamily(after.family) &&
      before.family === after.family &&
      before.payload.data.authoringVersion === 1 &&
      after.payload.data.authoringVersion === 1
    ) {
      const descriptors = [...baseFields(after.family), ...effectFields()];
      const visit = (
        a: JsonValue | undefined,
        b: JsonValue | undefined,
        path: string
      ) => {
        if (equal(a, b)) return;
        if (
          a &&
          b &&
          typeof a === "object" &&
          typeof b === "object" &&
          Array.isArray(a) === Array.isArray(b)
        ) {
          for (const key of new Set([...Object.keys(a), ...Object.keys(b)]))
            visit(
              (a as Record<string, JsonValue>)[key],
              (b as Record<string, JsonValue>)[key],
              path + "." + key
            );
        } else {
          const key = path.split(".").at(-1),
            field = descriptors.find((f) => f.key === key),
            effect = path.match(/^effects\.(\d+)/);
          rows.push({
            key: path,
            name:
              (effect ? `${label("effect")} ${Number(effect[1]) + 1} · ` : "") +
              (field ? label("fields." + field.key) : label("preservedFields")),
            before: a,
            after: b,
            options: field?.options,
          });
        }
      };
      for (const key of new Set([
        ...Object.keys(before.payload.data),
        ...Object.keys(after.payload.data),
      ]))
        visit(before.payload.data[key], after.payload.data[key], key);
    } else
      rows.push({
        key: "payload",
        name: t(libraryKey("payload")),
        before: before.payload,
        after: after.payload,
      });
  }
  const value = (v: unknown, options?: readonly string[]) =>
    typeof v === "boolean"
      ? label(v ? "yes" : "no")
      : typeof v === "string"
        ? options?.includes(v) && v
          ? label("options." + v)
          : v
        : typeof v === "number"
          ? String(v)
          : v == null
            ? "—"
            : JSON.stringify(v, null, 2);
  return rows.length ? (
    <div className="library-comparison">
      <div className="library-comparison-labels">
        <span />
        <strong>{t("libraryV2.before")}</strong>
        <strong>{t("libraryV2.after")}</strong>
      </div>
      {rows.map((row) => (
        <div key={row.key}>
          <strong>{row.name}</strong>
          <del>
            <span className="library-compare-mobile-label">{t("libraryV2.before")}</span>
            {value(row.before, row.options) || "—"}
          </del>
          <ins>
            <span className="library-compare-mobile-label">{t("libraryV2.after")}</span>
            {value(row.after, row.options) || "—"}
          </ins>
        </div>
      ))}
    </div>
  ) : (
    <p>{t("libraryV2.noDifference")}</p>
  );
}
