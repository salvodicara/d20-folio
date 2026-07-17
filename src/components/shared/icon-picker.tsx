/**
 * IconPicker — the folio glyph picker (a popover grid of the fixed icon
 * vocabulary in `icon-registry`). Reused by combat-algorithm steps AND the
 * custom-feature form (the last raw-emoji surface, #78) instead of a second
 * hand-rolled control (#58). Writes the chosen icon id back into the `emoji` string.
 */

import { useTranslation } from "react-i18next";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ALGO_ICONS, resolveAlgoIcon } from "./icon-registry";

export function IconPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const { t } = useTranslation();
  const current = resolveAlgoIcon(value);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          className="algo-icon-trigger"
          aria-label={t("algorithm.chooseIcon")}
        >
          <Icon as={current.glyph} size="sm" decorative />
        </Button>
      </PopoverTrigger>
      <PopoverContent rubric={t("algorithm.chooseIcon")}>
        <div
          className="algo-icon-grid"
          role="listbox"
          aria-label={t("algorithm.chooseIcon")}
        >
          {ALGO_ICONS.map((icon) => (
            <button
              key={icon.id}
              type="button"
              role="option"
              aria-selected={icon.id === current.id}
              onClick={() => onChange(icon.id)}
              className={cn("algo-icon-opt", icon.id === current.id && "selected")}
              aria-label={t(`algorithm.icon.${icon.id}`)}
              title={t(`algorithm.icon.${icon.id}`)}
            >
              <Icon as={icon.glyph} size="sm" decorative />
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
