/**
 * ArmorCard — the presentational armor / shield row (folio §5.8). Renders ONE
 * armor {@link ItemRowVM} from the {@link buildInventoryViewModel} presenter: a
 * `UniversalCard kind="armor"` with the equip / attune toggles + charge counter on
 * the trailing control cluster, the equipped / AC-formula / attuned / charges /
 * weight facts grid, and the description. SRD CONTENT arrives PRE-LOCALIZED on the
 * VM — ZERO BiText / `[locale]` reads here; the only `t(...)` formats APP strings
 * and the AC formula. Memoized (stable VM + stable callbacks).
 */
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { Trash2, Sparkles, Check, Shield, Zap, Weight, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";
import {
  UniversalCard,
  UniversalCardFacts,
  UniversalCardDesc,
} from "@/components/shared/UniversalCard";
import { formatWeight } from "@/lib/utils";
import { chipText } from "@/lib/views/combat-action-view";
import { formatArmorAcValue } from "@/lib/armor-display";
import type { Locale } from "@/lib/locale";
import type { ItemRowVM } from "@/lib/views/inventory-view";
import { QuantityEditor } from "./QuantityEditor";
import { ChargeUse } from "./ChargeUse";
import { itemSeal } from "./item-seal";
import type { ItemFieldValue } from "./WeaponCard";

export interface ArmorCardCallbacks {
  onToggle: (id: string, open: boolean) => void;
  onDelete: (vm: ItemRowVM) => void;
  onUpdateField: (idx: number, field: string, value: ItemFieldValue) => void;
  onToggleEquip: (idx: number) => void;
  onToggleAttune: (idx: number) => void;
  onSpendCharge: (vm: ItemRowVM) => void;
}

export interface ArmorCardProps extends ArmorCardCallbacks {
  vm: ItemRowVM;
  isEdit: boolean;
  isPlay: boolean;
  expanded: boolean;
  locale: Locale;
}

export const ArmorCard = memo(function ArmorCard({
  vm,
  isEdit,
  isPlay,
  expanded,
  locale,
  onToggle,
  onDelete,
  onUpdateField,
  onToggleEquip,
  onToggleAttune,
  onSpendCharge,
}: ArmorCardProps) {
  const { t } = useTranslation();

  const glossParts: string[] = [];
  if (vm.stealthDisadvantage) glossParts.push(t("equipment.stealthDisadvantage"));
  if (vm.unproficientArmor) glossParts.push(t("equipment.unproficient"));

  // The armor's ONE combat-relevant collapsed fact: its AC formula, as the
  // verdict chip ("AC 14 + DEX (max 2)" / a shield's "AC +2"). chipText gate:
  // the label drops if the composed chip exceeds the 20ch budget.
  const acValue = vm.armorAc
    ? formatArmorAcValue(
        {
          base: vm.armorAc.base,
          dexBonus: vm.armorAc.dexBonus,
          maxDex: vm.armorAc.maxDex,
        },
        vm.armorAc.category,
        t
      )
    : null;
  const verdict = acValue
    ? chipText(acValue, `${t("equipment.ac")} ${acValue}`)
    : undefined;

  // Icon-anchored facts (the typed-document reading spread) — equip/attune
  // state lives on the head's toggle buttons, never duplicated as a fact row.
  const facts = [
    acValue
      ? { label: t("equipment.ac"), value: acValue, icon: Shield }
      : { label: "", value: undefined },
    vm.charges
      ? {
          label: t("equipment.charges"),
          value: `${vm.charges.current} / ${vm.charges.max}`,
          icon: Zap,
        }
      : { label: "", value: undefined },
    vm.weight > 0
      ? {
          label: t("equipment.weight"),
          value: formatWeight(vm.weight * vm.quantity, locale),
          icon: Weight,
        }
      : { label: "", value: undefined },
    vm.cost
      ? {
          label: t("equipment.cost"),
          value: `${vm.cost.amount} ${t(`equipment.currencyAbbr.${vm.cost.unit}`)}`,
          icon: Coins,
        }
      : { label: "", value: undefined },
  ];

  return (
    <UniversalCard
      kind="armor"
      sealIcon={itemSeal(vm)}
      slot="free"
      name={vm.name}
      quantity={vm.quantity}
      gloss={glossParts.join(" · ")}
      verdict={verdict}
      verdictOutcome="physical"
      magical={vm.magicItemType != null}
      active={vm.equipped}
      isEdit={isEdit}
      open={expanded}
      onOpenChange={(o) => onToggle(vm.id, o)}
      ariaExpandLabel={t("common.expand")}
      editAction={
        <span className="flex items-center gap-1.5">
          {vm.charges && (
            <ChargeUse
              current={vm.charges.current}
              max={vm.charges.max}
              onUse={() => onSpendCharge(vm)}
              chargesLabel={t("equipment.charges")}
              useLabel={t("common.use")}
              useTitle={t("equipment.useCharge")}
            />
          )}
          <Button
            size="sm"
            variant={vm.equipped ? "primary" : "secondary"}
            onClick={(e) => {
              e.stopPropagation();
              onToggleEquip(vm.idx);
            }}
            title={vm.equipped ? t("equipment.unequip") : t("equipment.equip")}
          >
            {vm.equipped && <Icon as={Check} size="sm" decorative />}
            {vm.equipped ? t("equipment.equipped") : t("equipment.equip")}
          </Button>
          {vm.requiresAttunement && (
            <Button
              size="sm"
              variant={vm.attuned ? "primary" : "secondary"}
              onClick={(e) => {
                e.stopPropagation();
                onToggleAttune(vm.idx);
              }}
              title={vm.attuned ? t("equipment.attuned") : t("equipment.attune")}
            >
              {vm.attuned && <Icon as={Sparkles} size="sm" decorative />}
              {vm.attuned ? t("equipment.attuned") : t("equipment.attune")}
            </Button>
          )}
          {isEdit && (
            <Button
              size="sm"
              variant="ghost"
              iconOnly
              className="icon-danger"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(vm);
              }}
            >
              <Icon as={Trash2} size="sm" decorative />
              <span className="sr-only">
                {t("common.delete")} {vm.name}
              </span>
            </Button>
          )}
        </span>
      }
    >
      <UniversalCardFacts facts={facts} />
      <UniversalCardDesc>{vm.description}</UniversalCardDesc>
      {/* PLAY-NO-EDIT — quantity is play-adjustable (looted shields, a second
          buckler), never locked behind edit mode. */}
      {isPlay && (
        <div className="mt-2">
          <QuantityEditor
            value={vm.quantity}
            onChange={(v) => onUpdateField(vm.idx, "quantity", v)}
          />
        </div>
      )}
      {isEdit && (
        <div className="mt-2 flex flex-col gap-2">
          <QuantityEditor
            value={vm.quantity}
            onChange={(v) => onUpdateField(vm.idx, "quantity", v)}
          />
          <Textarea
            className="w-full"
            placeholder={t("common.notesPlaceholder")}
            rows={2}
            defaultValue={vm.notes}
            onBlur={(e) => onUpdateField(vm.idx, "notes", e.target.value)}
          />
        </div>
      )}
      {isPlay && vm.notes && <p className="uc-note">{vm.notes}</p>}
    </UniversalCard>
  );
});
