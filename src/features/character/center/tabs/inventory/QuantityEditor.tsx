/**
 * QuantityEditor — ONE controlled quantity field for weapon / armor / gear rows.
 * Uses the shared `InlineEditable` (controlled): when not editing it always
 * renders the CURRENT value, so a stack that grew externally is never shown stale
 * (the old uncontrolled `<input defaultValue>` froze at its first value). Clamps
 * to ≥ 1 (golden rule 20).
 */
import { useTranslation } from "react-i18next";
import { InlineEditable } from "@/components/shared/InlineEditable";

export function QuantityEditor({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2">
      <label className="w-12 text-[0.65rem] font-medium text-text-secondary">
        {t("common.quantity")}
      </label>
      <InlineEditable
        type="number"
        editable
        affordance="box"
        value={value}
        min={1}
        onChange={(v) => onChange(Math.max(1, v))}
        ariaLabel={t("common.quantity")}
      />
    </div>
  );
}
