/**
 * GearCard — the presentational gear / potion / wondrous-item row (folio §5.8).
 * Renders ONE gear {@link ItemRowVM} from the {@link buildInventoryViewModel}
 * presenter: a `UniversalCard kind="potion"|"gear"` whose economy slot follows the
 * SAME universal derivation as the combat board (a potion is a Bonus Action), with
 * a heal-formula / pool verdict, the heal / charges / quantity / weight facts grid,
 * the description, and the play-time Use / charge / attune controls + edit fields
 * (including the custom tracking-mode checkbox hierarchy).
 *
 * SRD CONTENT arrives PRE-LOCALIZED on the VM — ZERO BiText / `[locale]` reads; the
 * only `t(...)` formats APP strings + raw numbers. Memoized (stable VM + callbacks).
 */
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { Trash2, Sparkles, Check, Heart, Zap, Layers, Weight, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { CheckboxField } from "@/components/ui/selection";
import { Icon } from "@/components/ui/icon";
import {
  UniversalCard,
  UniversalCardFacts,
  UniversalCardDesc,
  type VerdictOutcome,
} from "@/components/shared/UniversalCard";
import { consumableActionSlot } from "@/lib/srd-resolve";
import { formatWeight } from "@/lib/utils";
import { chipText } from "@/lib/views/combat-action-view";
import type { Locale } from "@/lib/locale";
import type { ItemRowVM } from "@/lib/views/inventory-view";
import { QuantityEditor } from "./QuantityEditor";
import { ChargeUse } from "./ChargeUse";
import { itemSeal } from "./item-seal";
import type { ItemFieldValue } from "./WeaponCard";

export interface GearCardCallbacks {
  onToggle: (id: string, open: boolean) => void;
  onDelete: (vm: ItemRowVM) => void;
  onUpdateField: (idx: number, field: string, value: ItemFieldValue) => void;
  onUse: (vm: ItemRowVM) => void;
  onToggleEquip: (idx: number) => void;
  onToggleAttune: (idx: number) => void;
  onSpendCharge: (vm: ItemRowVM) => void;
}

export interface GearCardProps extends GearCardCallbacks {
  vm: ItemRowVM;
  isEdit: boolean;
  isPlay: boolean;
  expanded: boolean;
  locale: Locale;
}

export const GearCard = memo(function GearCard({
  vm,
  isEdit,
  isPlay,
  expanded,
  locale,
  onToggle,
  onDelete,
  onUpdateField,
  onUse,
  onToggleEquip,
  onToggleAttune,
  onSpendCharge,
}: GearCardProps) {
  const { t } = useTranslation();

  // ONE quantity affordance: the `×N` name badge. Only a POOL resource keeps a
  // verdict-chip count.
  const showQty = vm.isPool ? 1 : vm.quantity;

  let verdict: string | undefined;
  let verdictOutcome: VerdictOutcome = "neutral";
  if (vm.potionFormula) {
    // chipText gate (chip token contract): the heal word drops if the composed
    // chip exceeds the budget — the green chip still says "heal".
    verdict = chipText(vm.potionFormula, `${vm.potionFormula} ${t("combat.heal")}`);
    verdictOutcome = "heal";
  } else if (vm.isPool) {
    verdict = chipText(
      String(vm.quantity),
      `${vm.quantity}${vm.unit ? ` ${vm.unit}` : ""}`
    );
  }

  // Icon-anchored facts (the typed-document reading spread).
  const facts = [
    vm.potionFormula
      ? { label: t("combat.heal"), value: vm.potionFormula, icon: Heart }
      : { label: "", value: undefined },
    vm.charges
      ? {
          label: t("equipment.charges"),
          value: `${vm.charges.current} / ${vm.charges.max}`,
          icon: Zap,
        }
      : { label: "", value: undefined },
    vm.tracked || vm.isConsumable
      ? {
          label: t("equipment.quantity"),
          value: `${vm.quantity}${vm.unit ? ` ${vm.unit}` : ""}`,
          icon: Layers,
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
  const hasFacts = facts.some((f) => f.value != null && f.value !== "");

  // Only genuine CONSUMABLES get the play-mode "Use" (decrement) button.
  const showUse = vm.isConsumable && isPlay;
  const hasControls =
    Boolean(vm.charges) || showUse || vm.wearable || vm.requiresAttunement || isEdit;

  return (
    <UniversalCard
      kind={vm.isPotion ? "potion" : "gear"}
      sealIcon={itemSeal(vm)}
      slot={consumableActionSlot({
        isPotion: vm.isPotion,
        isConsumable: vm.isConsumable,
      })}
      name={vm.name}
      quantity={showQty}
      verdict={verdict}
      verdictOutcome={verdictOutcome}
      magical={vm.magicItemType != null}
      active={vm.wearable && vm.equipped}
      isEdit={isEdit}
      open={expanded}
      onOpenChange={(o) => onToggle(vm.id, o)}
      ariaExpandLabel={t("common.expand")}
      editAction={
        hasControls ? (
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
            {showUse && (
              <Button
                size="sm"
                variant="primary"
                disabled={vm.quantity <= 0}
                onClick={(e) => {
                  e.stopPropagation();
                  onUse(vm);
                }}
              >
                {t("common.use")}
              </Button>
            )}
            {/* Wear/wield toggle — only for magic gear whose effects gate on
                being worn (the engine's `equipped` activity gate); inert gear
                earns no equip control. Same recipe as the armor card's. */}
            {vm.wearable && (
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
            )}
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
        ) : undefined
      }
    >
      {hasFacts && <UniversalCardFacts facts={facts} />}
      {/* Description — read-only in play mode, or for SRD items in edit mode */}
      {(isPlay || !vm.isCustom) && (
        <UniversalCardDesc>{vm.description}</UniversalCardDesc>
      )}
      {/* PLAY-NO-EDIT — quantity changes DURING play (looted arrows, spent
          rations), so the ONE QuantityEditor is available in play mode too,
          never locked behind edit mode. */}
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
          {vm.isCustom && (
            <Input
              type="text"
              className="w-full"
              defaultValue={vm.name}
              placeholder={t("common.name")}
              onBlur={(e) =>
                onUpdateField(vm.idx, "name", e.target.value.trim() || vm.name)
              }
            />
          )}
          {vm.isCustom && (
            <Textarea
              className="w-full"
              placeholder={t("common.descriptionPlaceholder")}
              rows={3}
              defaultValue={vm.description}
              onBlur={(e) => onUpdateField(vm.idx, "description", e.target.value)}
            />
          )}
          <QuantityEditor
            value={vm.quantity}
            onChange={(v) => onUpdateField(vm.idx, "quantity", v)}
          />
          {vm.isCustom && (
            <>
              {/* Level 1: Track uses */}
              <CheckboxField
                checked={vm.tracked || vm.isConsumable}
                onCheckedChange={(c) => {
                  onUpdateField(vm.idx, "tracked", c);
                  if (!c) {
                    onUpdateField(vm.idx, "isConsumable", false);
                    onUpdateField(vm.idx, "isPotion", false);
                    onUpdateField(vm.idx, "potionFormula", null);
                  }
                }}
                label={t("equipment.trackUses")}
                hint={t("equipment.trackUsesHint")}
                className="text-[0.72rem] text-text-primary"
              />
              {/* Level 2: Auto-remove sub-option */}
              {(vm.tracked || vm.isConsumable) && (
                <CheckboxField
                  checked={vm.isConsumable}
                  onCheckedChange={(c) => {
                    onUpdateField(vm.idx, "isConsumable", c);
                    if (!c) {
                      onUpdateField(vm.idx, "isPotion", false);
                      onUpdateField(vm.idx, "potionFormula", null);
                    }
                  }}
                  label={t("equipment.autoRemove")}
                  hint={t("equipment.autoRemoveHint")}
                  className="ml-4 text-[0.72rem] text-text-primary"
                />
              )}
              {/* Level 3: Potion sub-flag */}
              {vm.isConsumable && (
                <div className="ml-8 flex flex-col gap-2">
                  <CheckboxField
                    checked={vm.isPotion}
                    onCheckedChange={(c) => {
                      onUpdateField(vm.idx, "isPotion", c);
                      if (!c) onUpdateField(vm.idx, "potionFormula", null);
                    }}
                    label={t("equipment.potionConsumable")}
                    className="text-[0.72rem] text-text-primary"
                  />
                  {vm.isPotion && (
                    <Input
                      type="text"
                      className="w-full"
                      defaultValue={vm.potionFormula ?? ""}
                      placeholder="2d4+2"
                      onBlur={(e) =>
                        onUpdateField(vm.idx, "potionFormula", e.target.value || null)
                      }
                    />
                  )}
                </div>
              )}
            </>
          )}
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
