import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SRD_GEAR } from "@/data/gear";
import { srdCatalogues } from "@/i18n/srd-en";
import { useHomebrewLabel } from "./homebrew-labels";
const toolIds = SRD_GEAR.filter(
  (item) => item.category === "tool" || item.id === "tinkers-tools"
).map((item) => item.id);
export function OriginProficiency({
  category,
  value,
  disabled,
  onChange,
}: {
  category: "tool" | "language";
  value: string;
  disabled?: boolean;
  onChange: (id: string) => void;
}) {
  const { i18n } = useTranslation("common"),
    label = useHomebrewLabel();
  const catalog = srdCatalogues(i18n.language.startsWith("it") ? "it" : "en");
  const ids = category === "tool" ? toolIds : Object.keys(catalog?.language ?? {});
  const [custom, setCustom] = useState(false);
  const unknown = !!value && !ids.includes(value);
  const name = (id: string) =>
    String(
      (category === "tool"
        ? catalog?.equipment[id]?.name
        : catalog?.language[id]?.name) ?? id
    );
  return (
    <div className="origin-proficiency">
      <label>
        {label(category === "tool" ? "origin.tool" : "origin.language")}
        <select
          disabled={disabled}
          value={custom || unknown ? "__custom" : value}
          onChange={(e) => {
            if (e.target.value === "__custom") {
              setCustom(true);
              onChange("");
            } else {
              setCustom(false);
              onChange(e.target.value);
            }
          }}
        >
          <option value="">{label("origin.choose")}</option>
          {ids.map((id) => (
            <option value={id} key={id}>
              {name(id)}
            </option>
          ))}
          <option value="__custom">{label("origin.customProficiency")}</option>
        </select>
      </label>
      {(custom || unknown) && (
        <div>
          <p className="homebrew-hint">{label("origin.customProficiencyHelp")}</p>
          <label>
            {label("origin.customReference")}
            <input
              disabled={disabled}
              value={unknown ? value : ""}
              onChange={(e) => onChange(e.target.value)}
            />
          </label>
        </div>
      )}
    </div>
  );
}
