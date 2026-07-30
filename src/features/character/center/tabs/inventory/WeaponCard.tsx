/**
 * WeaponCard — the presentational weapon row (folio §5.8). Renders ONE
 * {@link WeaponRowVM} from the {@link buildInventoryViewModel} presenter: a
 * `UniversalCard kind="weapon"` carrying the §11-chromatic damage verdict, the
 * to-hit · category · properties gloss, the UNIFIED weapon facts block (the
 * ONE shared `WeaponFacts` component the combat action card renders too —
 * owner mandate 2026-06-12) with the inventory's weight/enchant extras, the
 * description, and (in edit mode) the full custom-weapon + override fields.
 *
 * SRD CONTENT (name / description / chips) arrives PRE-LOCALIZED on the VM —
 * this component reads ZERO BiText / `[locale]`. The only `t(...)` here
 * resolves APP strings + raw-number formatting.
 *
 * Memoized — the orchestrator passes a STABLE VM + stable callbacks, so a search
 * keystroke bails the still-visible rows.
 */
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { Trash2, Weight, Coins, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";
import { Select } from "@/components/shared/Select";
import { weaponSealIcon } from "@/components/shared/item-icons";
import { UniversalCard, UniversalCardDesc } from "@/components/shared/UniversalCard";
import { WeaponFacts, type WeaponExtraFact } from "@/components/shared/WeaponFacts";
import { RiderSummary } from "@/components/shared/ActionRiders";
import { formatModifier, formatWeight } from "@/lib/utils";
import { chipText } from "@/lib/views/combat-action-view";
import type { Locale } from "@/lib/locale";
import type { EnchantOptionVM, WeaponRowVM } from "@/lib/views/inventory-view";
import { QuantityEditor } from "./QuantityEditor";
import { damageTypeAbbr, damageVerdictOutcome } from "./inventory-card-helpers";

/** Field-update value union shared by the inventory edit handlers. */
export type ItemFieldValue = string | number | boolean | null;

export interface WeaponCardCallbacks {
  onToggle: (id: string, open: boolean) => void;
  onDelete: (vm: WeaponRowVM) => void;
  onUpdateField: (idx: number, field: string, value: ItemFieldValue) => void;
}

export interface WeaponCardProps extends WeaponCardCallbacks {
  vm: WeaponRowVM;
  isEdit: boolean;
  isPlay: boolean;
  expanded: boolean;
  locale: Locale;
  /** The +N magic-weapon items in the inventory this row can bind to
   *  (PRIM-item-bound-bonus). Empty → the enchant picker is hidden. */
  enchantOptions: ReadonlyArray<EnchantOptionVM>;
}

const DAMAGE_TYPES = [
  "slashing",
  "piercing",
  "bludgeoning",
  "fire",
  "cold",
  "lightning",
  "thunder",
  "acid",
  "poison",
  "necrotic",
  "radiant",
  "psychic",
  "force",
] as const;

export const WeaponCard = memo(function WeaponCard({
  vm,
  isEdit,
  isPlay,
  expanded,
  locale,
  enchantOptions,
  onToggle,
  onDelete,
  onUpdateField,
}: WeaponCardProps) {
  const { t } = useTranslation();

  const damageTypeWord = t(`srd.damage_${vm.damageType}`);
  const formula = vm.facts.damageTwoHanded
    ? `${vm.facts.damageOneHanded} / ${vm.facts.damageTwoHanded}`
    : vm.facts.damageOneHanded;
  const dmgAbbr = damageTypeAbbr(vm.damageType, t);

  // PLAY-NO-EDIT — play mode always has detail now (the quantity editor), so a
  // bare custom weapon with no chips/description still opens.
  const hasDetail =
    vm.facts.chips.length > 0 || Boolean(vm.description) || isEdit || isPlay;

  // Gloss = to-hit (labelled) · category · short property list — read off the
  // SAME chips the facts block renders (one source).
  const categoryLabel = vm.facts.chips.find((c) => c.kind === "category")?.label;
  const propertyLabels = vm.facts.chips
    .filter((c) => c.kind === "property")
    .map((c) => c.label);
  const glossParts: string[] = [`${formatModifier(vm.attackBonus)} ${t("srd.toHit")}`];
  if (categoryLabel) glossParts.push(categoryLabel);
  if (propertyLabels.length > 0) glossParts.push(propertyLabels.join(", "));

  // The inventory's per-surface extra facts rows (the weapon-as-an-object
  // facts: carried weight, the bound enchant naming WHY the figures carry +N).
  // Damage / to-hit / range + the chips + the per-source damage breakdown all
  // render through the shared `WeaponFacts` (from `vm.facts`, incl.
  // `vm.facts.breakdown`) — identical to the combat card by construction.
  const extraFacts: WeaponExtraFact[] = [
    ...(vm.weight > 0
      ? [
          {
            label: t("equipment.weight"),
            value: formatWeight(vm.weight * vm.quantity, locale),
            icon: Weight,
          },
        ]
      : []),
    // The SRD list price — the weapon-as-an-object "value" fact.
    ...(vm.cost
      ? [
          {
            label: t("equipment.cost"),
            value: `${vm.cost.amount} ${t(`equipment.currencyAbbr.${vm.cost.unit}`)}`,
            icon: Coins,
          },
        ]
      : []),
    // The bound magic enchant (PRIM-item-bound-bonus) — names WHY the to-hit /
    // damage carry the +N that is already folded into the figures above.
    ...(vm.enchantName
      ? [
          {
            label: t("equipment.enchantLabel"),
            value: `${vm.enchantName} (${formatModifier(vm.enchantBonus)})`,
            icon: Sparkles,
          },
        ]
      : []),
  ];

  const srSummary = [
    `${formula} ${damageTypeWord}`,
    `${formatModifier(vm.attackBonus)} ${t("srd.toHit")}`,
    vm.isProficient ? undefined : t("equipment.unproficient"),
  ]
    .filter(Boolean)
    .join(". ");

  return (
    <UniversalCard
      kind="weapon"
      sealIcon={weaponSealIcon(vm.id)}
      slot="action"
      name={vm.name}
      quantity={vm.quantity}
      gloss={glossParts.join(" · ")}
      verdict={chipText(formula, `${formula} ${dmgAbbr}`)}
      verdictOutcome={damageVerdictOutcome(vm.damageType)}
      // #87 — the collapsed-face on-hit rider summary, the SAME pill the combat
      // card shows (golden rule 6: both weapon surfaces read identically). Hidden
      // in edit mode (the row reclaims width for the name/fields). Omitted when the
      // weapon carries no rider.
      riderSummary={
        !isEdit && vm.facts.riders.length > 0 ? (
          <RiderSummary riders={vm.facts.riders} />
        ) : undefined
      }
      isEdit={isEdit}
      open={expanded}
      onOpenChange={(o) => onToggle(vm.id, o)}
      ariaExpandLabel={t("common.expand")}
      srSummary={srSummary}
      editAction={
        isEdit ? (
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
        ) : undefined
      }
    >
      {hasDetail && (
        <>
          {/* The ONE shared weapon facts block (damage / to-hit / range + the
              glossed category / property / owned-mastery chips) — identical to
              the combat action card by construction. */}
          <WeaponFacts facts={vm.facts} extraFacts={extraFacts} />
          <UniversalCardDesc>{vm.description}</UniversalCardDesc>
          {/* PLAY-NO-EDIT — quantity is play-adjustable (thrown daggers
              recovered, javelins looted), never locked behind edit mode. */}
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
              <QuantityEditor
                value={vm.quantity}
                onChange={(v) => onUpdateField(vm.idx, "quantity", v)}
              />
              {vm.isCustom && (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <label className="text-[0.65rem] font-medium text-text-secondary">
                        {t("custom.damageDie")}
                      </label>
                      <Input
                        type="text"
                        className="sm w-16"
                        defaultValue={vm.rawDamageDie}
                        placeholder="1d8"
                        onBlur={(e) =>
                          onUpdateField(
                            vm.idx,
                            "damageDie",
                            e.target.value.trim() || "1d8"
                          )
                        }
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <label className="text-[0.65rem] font-medium text-text-secondary">
                        {t("custom.attackStat")}
                      </label>
                      <Select
                        size="sm"
                        defaultValue={vm.rawAttackStat}
                        onChange={(e) =>
                          onUpdateField(vm.idx, "attackStat", e.target.value)
                        }
                      >
                        <option value="STR">{t("abilities.STR_short")}</option>
                        <option value="DEX">{t("abilities.DEX_short")}</option>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <label className="text-[0.65rem] font-medium text-text-secondary">
                      {t("custom.damageType")}
                    </label>
                    <Select
                      size="sm"
                      defaultValue={vm.rawDamageType}
                      onChange={(e) =>
                        onUpdateField(vm.idx, "damageType", e.target.value)
                      }
                    >
                      {DAMAGE_TYPES.map((dt) => (
                        <option key={dt} value={dt}>
                          {t(`srd.damage_${dt}`)}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Input
                    type="text"
                    className="w-full"
                    defaultValue={vm.rawProperties}
                    placeholder={t("custom.propertiesPlaceholder")}
                    onBlur={(e) => onUpdateField(vm.idx, "properties", e.target.value)}
                  />
                </>
              )}
              {/* Weapon enchant (PRIM-item-bound-bonus, closes
                  needs-UI:weapon-enchant-picker) — bind a +N magic-weapon item
                  from the inventory to THIS row; the bonus auto-flows into
                  to-hit + damage (id-bound; the label is derived). Hidden when
                  the inventory has no such item. SRD weapons only — a custom
                  weapon already owns its whole formula. */}
              {!vm.isCustom && enchantOptions.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <label className="text-[0.65rem] font-medium text-text-secondary">
                    {t("equipment.enchantLabel")}
                  </label>
                  <Select
                    size="sm"
                    value={vm.enchantItemId ?? ""}
                    onChange={(e) =>
                      onUpdateField(vm.idx, "enchantItemId", e.target.value || null)
                    }
                  >
                    <option value="">{t("equipment.enchantNone")}</option>
                    {enchantOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label} ({formatModifier(o.bonus)})
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              {/* Override fields — available for all weapons */}
              <div className="flex flex-wrap gap-2">
                <div className="flex items-center gap-1.5">
                  <label className="text-[0.65rem] font-medium text-text-secondary">
                    {t("custom.atkBonusOverride")}
                  </label>
                  <Input
                    type="number"
                    className="sm w-16"
                    defaultValue={vm.attackBonusOverride ?? ""}
                    placeholder="—"
                    onBlur={(e) =>
                      onUpdateField(
                        vm.idx,
                        "attackBonusOverride",
                        e.target.value === "" ? null : Number(e.target.value)
                      )
                    }
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <label className="text-[0.65rem] font-medium text-text-secondary">
                    {t("custom.dmgOverride")}
                  </label>
                  <Input
                    type="text"
                    className="sm w-20"
                    defaultValue={vm.damageOverride ?? ""}
                    placeholder="—"
                    onBlur={(e) =>
                      onUpdateField(vm.idx, "damageOverride", e.target.value || null)
                    }
                  />
                </div>
              </div>
              {vm.isCustom && (
                <Textarea
                  className="w-full"
                  placeholder={t("common.descriptionPlaceholder")}
                  rows={2}
                  defaultValue={vm.description}
                  onBlur={(e) => onUpdateField(vm.idx, "description", e.target.value)}
                />
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
        </>
      )}
    </UniversalCard>
  );
});
