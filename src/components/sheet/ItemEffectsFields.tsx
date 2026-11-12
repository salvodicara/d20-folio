/**
 * The homebrew item form's optional effects, step 1 (coordinator 2026-11-12). Pattern
 * source: D&D Beyond's homebrew magic item form, whose "Requires Attunement", +N
 * "Bonus / Magic" modifier, "Has Charges" with its reset condition and rarity are
 * optional fields under the basics. Here each is collapsed behind «Aggiungi effetto»,
 * so a named item with a description stays as short as before; an added effect is a
 * small block with its own «Rimuovi». The existing form controls only (Select, Input,
 * Button). What the effects mean is `homebrew-item-effects`.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/shared/Select";
import { ALL_MAGIC_ITEM_RARITIES, type MagicItemRarity } from "@/data/types";
import type {
  ChargeRecovery,
  HomebrewItemKind,
  ItemEffects,
} from "@/lib/homebrew-item-effects";

type EffectId = "attunement" | "magicBonus" | "charges" | "rarity";

const ORDER: readonly EffectId[] = ["attunement", "magicBonus", "charges", "rarity"];

/** The fresh value of an effect when it is added. */
const FRESH: { [K in EffectId]: NonNullable<ItemEffects[K]> } = {
  attunement: true,
  magicBonus: 1,
  charges: { max: 3, recovery: "dawn", returns: "" },
  rarity: "uncommon",
};

const RECOVERY_LABEL: Record<ChargeRecovery, string> = {
  dawn: "custom.recoveryDawn",
  "long-rest": "custom.recoveryLong",
  "short-rest": "custom.recoveryShort",
  none: "custom.recoveryManual",
};

export function ItemEffectsFields({
  kind,
  value,
  onChange,
}: {
  kind: HomebrewItemKind;
  value: ItemEffects;
  onChange: (next: ItemEffects) => void;
}) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  // A +N needs a weapon or an armour; on plain gear it is not offered.
  const offered = ORDER.filter((id) => id !== "magicBonus" || kind !== "item");
  const shown = offered.filter((id) => value[id] !== undefined);
  const missing = offered.filter((id) => value[id] === undefined);

  const title = (id: EffectId): string =>
    id === "attunement"
      ? t("magicItems.attunementRequired")
      : id === "magicBonus"
        ? t("custom.magicBonus")
        : id === "charges"
          ? t("equipment.charges")
          : t("magicItems.rarity");

  const remove = (id: EffectId) =>
    onChange(Object.fromEntries(Object.entries(value).filter(([key]) => key !== id)));

  return (
    <div className="flex flex-col gap-2" data-testid="item-effects">
      {shown.map((id) => (
        <div
          key={id}
          role="group"
          aria-label={title(id)}
          className="flex flex-col gap-2 rounded-md border border-border p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[0.72rem] font-semibold text-text-primary">
              {title(id)}
            </span>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`${t("common.remove")}: ${title(id)}`}
              onClick={() => remove(id)}
            >
              <Icon as={X} size="sm" decorative />
            </Button>
          </div>
          {id === "magicBonus" && (
            <Select
              aria-label={title(id)}
              value={String(value.magicBonus)}
              onChange={(e) =>
                onChange({ ...value, magicBonus: Number(e.target.value) as 1 | 2 | 3 })
              }
              className="w-24"
            >
              {[1, 2, 3].map((n) => (
                <option key={n} value={n}>{`+${n}`}</option>
              ))}
            </Select>
          )}
          {id === "charges" && value.charges && (
            <ChargesFields
              value={value.charges}
              onChange={(charges) => onChange({ ...value, charges })}
            />
          )}
          {id === "rarity" && (
            <Select
              aria-label={title(id)}
              value={value.rarity}
              onChange={(e) =>
                onChange({ ...value, rarity: e.target.value as MagicItemRarity })
              }
            >
              {ALL_MAGIC_ITEM_RARITIES.map((r) => (
                <option key={r} value={r}>
                  {t(`magicItems.rarity_${r}`)}
                </option>
              ))}
            </Select>
          )}
        </div>
      ))}
      {missing.length > 0 &&
        (adding ? (
          <div
            role="group"
            aria-label={t("custom.addEffect")}
            className="flex flex-wrap gap-2"
          >
            {missing.map((id) => (
              <Button
                key={id}
                variant="secondary"
                size="sm"
                onClick={() => {
                  onChange({ ...value, [id]: FRESH[id] });
                  setAdding(false);
                }}
              >
                {title(id)}
              </Button>
            ))}
          </div>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
            <Icon as={Plus} size="sm" decorative />
            {t("custom.addEffect")}
          </Button>
        ))}
    </div>
  );
}

function ChargesFields({
  value,
  onChange,
}: {
  value: NonNullable<ItemEffects["charges"]>;
  onChange: (next: NonNullable<ItemEffects["charges"]>) => void;
}) {
  const { t } = useTranslation();
  return (
    // One per row on a phone (a select is at least 160 px wide), three across wider.
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <label className="flex min-w-0 flex-col gap-1 text-[0.65rem] text-text-secondary">
        {t("custom.totalUses")}
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          value={value.max}
          onChange={(e) =>
            onChange({ ...value, max: Math.max(1, Number(e.target.value)) })
          }
          className="num w-full"
        />
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-[0.65rem] text-text-secondary">
        {t("custom.recovery")}
        <Select
          value={value.recovery}
          onChange={(e) =>
            onChange({ ...value, recovery: e.target.value as ChargeRecovery })
          }
        >
          {(Object.keys(RECOVERY_LABEL) as ChargeRecovery[]).map((r) => (
            <option key={r} value={r}>
              {t(RECOVERY_LABEL[r])}
            </option>
          ))}
        </Select>
      </label>
      {value.recovery !== "none" && (
        <label className="flex min-w-0 flex-col gap-1 text-[0.65rem] text-text-secondary">
          {t("custom.chargesReturn")}
          <Input
            type="text"
            value={value.returns}
            placeholder={t("custom.chargesReturnPlaceholder")}
            onChange={(e) => onChange({ ...value, returns: e.target.value })}
            className="w-full"
          />
        </label>
      )}
    </div>
  );
}
