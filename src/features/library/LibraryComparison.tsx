import { libraryKey } from "./labels";
import { useTranslation } from "react-i18next";
import { equal } from "@/lib/shared/model";
import type { LibraryDefinition } from "@/lib/library/model";
export function LibraryComparison({
  before,
  after,
}: {
  before: LibraryDefinition;
  after: LibraryDefinition;
}) {
  const { t } = useTranslation("common");
  const fields = ["name", "description", "tags", "payload"] as const;
  const changes = fields.filter((k) => !equal(before[k], after[k]));
  const value = (v: unknown) =>
    typeof v === "string"
      ? v
      : Array.isArray(v)
        ? v.join(", ")
        : JSON.stringify(v, null, 2);
  return changes.length ? (
    <div className="library-comparison">
      <div className="library-comparison-labels">
        <span />
        <strong>{t("libraryV2.before")}</strong>
        <strong>{t("libraryV2.after")}</strong>
      </div>
      {changes.map((k) => (
        <div key={k}>
          <strong>{t(libraryKey(k))}</strong>
          <del>
            <span className="library-compare-mobile-label">{t("libraryV2.before")}</span>
            {value(before[k]) || "—"}
          </del>
          <ins>
            <span className="library-compare-mobile-label">{t("libraryV2.after")}</span>
            {value(after[k]) || "—"}
          </ins>
        </div>
      ))}
    </div>
  ) : (
    <p>{t("libraryV2.noDifference")}</p>
  );
}
