/**
 * Equipment step — the 2024 "Starting Equipment: Choose A or B" fork on the
 * shared `WizardForkTab` recipe, rendered TWICE: once for the class package and
 * once for the background package (2024 treats them as separate Equipment
 * lines). Each fork shows one tab per option (the Fighter has three); the active
 * option renders either the gear grid (a carved row per item with the gold
 * socket seal) or, for the all-gold option, a single gold cartouche. Items
 * arrive already localized as `StartingOptionVM[]` from the creation presenter.
 */
import { useTranslation } from "react-i18next";
import { Icon } from "@/components/ui/icon";
import { WizardForkTab } from "@/features/wizard/chrome";
import { equipmentSealIconById, toolSealIcon } from "@/components/shared/item-icons";
import { toolChoiceKindCategory } from "@/data/background-equipment";
import type { StartingItemVM, StartingOptionVM } from "@/lib/views/creation-view";

/**
 * The seal glyph for one starting-item line. A resolved item resolves by id; an
 * unpicked `fromToolChoice` placeholder reads the tool glyph for its choice kind's
 * representative category (instrument → a note, artisan → a hammer) so it's legible
 * at a glance — no "default" branch, the kind→category map is total.
 */
function startingItemGlyph(item: StartingItemVM) {
  if (item.placeholder) {
    return toolSealIcon(toolChoiceKindCategory(item.placeholder));
  }
  return equipmentSealIconById(item.id);
}

/** A single A/B(/C) fork for one source (class OR background). */
function EquipmentForkSection({
  heading,
  options,
  chosen,
  onChoose,
}: {
  heading: string;
  options: StartingOptionVM[];
  chosen: string;
  onChoose: (label: string) => void;
}) {
  const { t } = useTranslation();
  const gp = t("equipment.currencyAbbr.gp");
  const active = options.find((o) => o.label === chosen) ?? options[0];

  return (
    <div className="flex flex-col gap-3">
      <p className="wiz-asks-head">{heading}</p>

      {/* One tab per option — the SAME fork recipe as every wizard fork. The
          all-gold alternative names its purse ON the tab ("Option B · 50 gp"),
          so the fork is legible without clicking through every option. */}
      <div className="wiz-fork justify-center" role="group" aria-label={heading}>
        {options.map((opt) => (
          <WizardForkTab
            key={opt.label}
            active={active?.label === opt.label}
            onClick={() => onChoose(opt.label)}
          >
            {opt.items.length === 0
              ? t("create.equipOptionGold", { label: opt.label, gold: opt.gold, gp })
              : t("create.equipOption", { label: opt.label })}
          </WizardForkTab>
        ))}
      </div>

      {/* The active option's body — the gear grid, or the all-gold cartouche. */}
      {active && active.items.length > 0 ? (
        <>
          <ul className="wiz-equip-grid">
            {active.items.map((item, i) => (
              <li
                key={`${item.id}-${i}`}
                className={`wiz-equip-item${item.placeholder ? " wiz-equip-item--choice" : ""}`}
              >
                <span className="wiz-socket" aria-hidden>
                  <Icon as={startingItemGlyph(item)} size="sm" decorative />
                </span>
                {/* A `fromToolChoice` pack member the player hasn't picked yet —
                    the localized "… — your choice" chrome (the presenter is
                    i18next-free, so the label resolves here at the edge). */}
                <span className="wiz-equip-name">
                  {item.placeholder
                    ? t(`create.equipToolChoice_${item.placeholder}`)
                    : item.label}
                </span>
                {item.quantity > 1 && (
                  <span className="wiz-equip-qty tnum">×{item.quantity}</span>
                )}
                {item.category === "unknown" && (
                  <span className="wiz-equip-warn">{t("create.equipManual")}</span>
                )}
              </li>
            ))}
          </ul>
          {active.gold > 0 && (
            <p className="wiz-equip-coin">
              {t("create.equipPlusGold", { gold: active.gold, gp })}
            </p>
          )}
        </>
      ) : (
        active && (
          <div className="wiz-equip-gold">
            <span className="wiz-equip-gold-amt tnum">{active.gold}</span>
            <span className="wiz-equip-gold-unit">{gp}</span>
          </div>
        )
      )}
    </div>
  );
}

export function EquipmentPickerSection({
  classOptions,
  bgOptions,
  classChosen,
  bgChosen,
  onChooseClass,
  onChooseBg,
}: {
  classOptions: StartingOptionVM[];
  bgOptions: StartingOptionVM[];
  classChosen: string;
  bgChosen: string;
  onChooseClass: (label: string) => void;
  onChooseBg: (label: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-6">
      {classOptions.length > 0 && (
        <EquipmentForkSection
          heading={t("create.equipFromClass")}
          options={classOptions}
          chosen={classChosen}
          onChoose={onChooseClass}
        />
      )}
      {bgOptions.length > 0 && (
        <EquipmentForkSection
          heading={t("create.equipFromBackground")}
          options={bgOptions}
          chosen={bgChosen}
          onChoose={onChooseBg}
        />
      )}
    </div>
  );
}
