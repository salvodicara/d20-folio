/**
 * Custom Homebrew Creation Forms
 *
 * Inline forms for creating custom spells, equipment, and features
 * that don't exist in the SRD. Used within the Add modals.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Check } from "lucide-react";
import { useCharacterStore } from "@/stores/characterStore";
import { useLocale } from "@/hooks/useLocale";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { CheckboxField } from "@/components/ui/selection";
import { Icon } from "@/components/ui/icon";
import { Select } from "@/components/shared/Select";
import { IconPicker } from "@/components/shared/icon-picker";
import { DEFAULT_ALGO_ICON } from "@/components/shared/icon-registry";
import { cn } from "@/lib/utils";
import type {
  CustomSpell,
  CustomEquipment,
  CustomWeapon,
  CustomFeature,
} from "@/types/character";
import { ALL_DAMAGE_TYPES, ALL_SPELL_SCHOOLS } from "@/data/types";
import type { SpellSchool, DamageType } from "@/data/types";

// ─── Custom Spell Form ───────────────────────────────────────────────────────

interface CustomSpellFormProps {
  onCreated: () => void;
}

// The school + damage-type option lists come from the canonical runtime tuples in
// `@/data/types` (golden rule 6 — one source of truth, kept exhaustive over the
// union by construction), NOT re-spelled here.
const SPELL_SCHOOLS: readonly SpellSchool[] = ALL_SPELL_SCHOOLS;

export function CustomSpellForm({ onCreated }: CustomSpellFormProps) {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const character = useCharacterStore((s) => s.character);
  const [name, setName] = useState("");
  const [level, setLevel] = useState(1);
  const [school, setSchool] = useState<SpellSchool>("evocation");
  const [castingTime, setCastingTime] = useState("action");
  const [range, setRange] = useState(locale === "it" ? "18 metri" : "60 feet");
  // D2 — seed the locale-correct default (was the hardcoded English "Instantaneous"
  // leaking into the IT form), mirroring the locale-aware `range` default above.
  const [duration, setDuration] = useState(t("spells.instantaneous"));
  const [concentration, setConcentration] = useState(false);
  const [description, setDescription] = useState("");
  const [v, setV] = useState(true);
  const [s, setS] = useState(true);
  const [m, setM] = useState(false);

  function handleCreate() {
    if (!character || !name.trim()) return;
    const store = useCharacterStore.getState();

    const newSpell: CustomSpell = {
      custom: true,
      name: name.trim(),
      level,
      school,
      castingTime,
      range,
      components: { v, s, m },
      duration,
      concentration,
      description,
      prepared: true,
    };

    store.setCharacter({
      ...character,
      character: {
        ...character.character,
        spells: [...character.character.spells, newSpell],
      },
    });

    onCreated();
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mb-4 text-[0.65rem] font-bold uppercase tracking-wider text-text-secondary">
          {t("custom.createSpell")}
        </div>

        <div className="flex flex-col gap-3">
          <FormField label={t("common.name")} required>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("custom.spellName")}
              className="w-full"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label={t("common.level")}>
              <Select value={level} onChange={(e) => setLevel(Number(e.target.value))}>
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((l) => (
                  <option key={l} value={l}>
                    {l === 0 ? t("spells.cantrip") : t("spells.level", { level: l })}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label={t("spells.school")}>
              <Select
                value={school}
                onChange={(e) => setSchool(e.target.value as SpellSchool)}
              >
                {SPELL_SCHOOLS.map((s) => (
                  <option key={s} value={s}>
                    {t(`srd.school_${s}`)}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label={t("spells.castingTime")}>
              <Select
                value={castingTime}
                onChange={(e) => setCastingTime(e.target.value)}
              >
                {[
                  "action",
                  "bonus",
                  "reaction",
                  "1 minute",
                  "10 minutes",
                  "1 hour",
                  "8 hours",
                  "24 hours",
                ].map((ct) => (
                  <option key={ct} value={ct}>
                    {t(`srd.castingTime_${ct}`)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label={t("spells.range")}>
              <Input
                type="text"
                value={range}
                onChange={(e) => setRange(e.target.value)}
                className="w-full"
              />
            </FormField>
          </div>

          <FormField label={t("spells.duration")}>
            <Input
              type="text"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="w-full"
            />
          </FormField>

          <div className="flex items-center gap-4">
            <CheckboxField
              checked={concentration}
              onCheckedChange={setConcentration}
              label={t("spells.concentration")}
              className="text-[0.72rem] text-text-primary"
            />
            <CheckboxField
              checked={v}
              onCheckedChange={setV}
              label="V"
              className="text-[0.72rem] text-text-primary"
            />
            <CheckboxField
              checked={s}
              onCheckedChange={setS}
              label="S"
              className="text-[0.72rem] text-text-primary"
            />
            <CheckboxField
              checked={m}
              onCheckedChange={setM}
              label="M"
              className="text-[0.72rem] text-text-primary"
            />
          </div>

          <FormField label={t("common.description")}>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("custom.spellDescription")}
              rows={4}
              className="resize-none"
            />
          </FormField>
        </div>
      </div>

      <div className="border-t border-border px-4 py-3">
        <Button onClick={handleCreate} disabled={!name.trim()} block>
          <Icon as={Plus} size="sm" decorative />
          {t("custom.createSpellBtn")}
        </Button>
      </div>
    </div>
  );
}

// ─── Custom Equipment Form ───────────────────────────────────────────────────

interface CustomEquipmentFormProps {
  onCreated: () => void;
}

const DAMAGE_TYPES: readonly DamageType[] = ALL_DAMAGE_TYPES;

export function CustomEquipmentForm({ onCreated }: CustomEquipmentFormProps) {
  const { t } = useTranslation();
  const character = useCharacterStore((s) => s.character);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isWeapon, setIsWeapon] = useState(false);
  const [quantity, setQuantity] = useState(1);
  // "none" | "consumable" | "tracked" — mutually exclusive
  const [trackingMode, setTrackingMode] = useState<"none" | "consumable" | "tracked">(
    "none"
  );
  const [isPotion, setIsPotion] = useState(false);
  const [potionFormula, setPotionFormula] = useState("");
  // Weapon fields
  const [damageDie, setDamageDie] = useState("1d8");
  const [damageType, setDamageType] = useState<DamageType>("slashing");
  const [attackStat, setAttackStat] = useState<"STR" | "DEX">("STR");
  const [properties, setProperties] = useState("");
  // Armor fields (#U6) — custom armor with an AC contribution + category.
  const [isArmor, setIsArmor] = useState(false);
  const [armorCategory, setArmorCategory] = useState<
    "light" | "medium" | "heavy" | "shield"
  >("light");
  const [acBonus, setAcBonus] = useState("");

  function handleCreate() {
    if (!character || !name.trim()) return;
    const store = useCharacterStore.getState();

    if (isWeapon) {
      const weapon: CustomWeapon = {
        custom: true,
        name: name.trim(),
        quantity,
        damageDie,
        damageType,
        attackStat,
        properties,
        description: description.trim() || undefined,
      };
      store.setCharacter({
        ...character,
        character: {
          ...character.character,
          weapons: [...character.character.weapons, weapon],
        },
      });
    } else if (isArmor) {
      const parsedAc = parseInt(acBonus, 10);
      const armor: CustomEquipment = {
        custom: true,
        name: name.trim(),
        description: description.trim() || undefined,
        equipped: true,
        quantity,
        armorCategory,
        acBonus: Number.isNaN(parsedAc) ? undefined : parsedAc,
      };
      store.setCharacter({
        ...character,
        character: {
          ...character.character,
          equipment: [...character.character.equipment, armor],
        },
      });
    } else {
      const equipment: CustomEquipment = {
        custom: true,
        name: name.trim(),
        description: description.trim() || undefined,
        equipped: true,
        quantity,
        isConsumable: trackingMode === "consumable",
        tracked: trackingMode === "tracked",
        isPotion: trackingMode === "consumable" && isPotion,
        potionFormula:
          trackingMode === "consumable" && isPotion ? potionFormula : undefined,
      };
      store.setCharacter({
        ...character,
        character: {
          ...character.character,
          equipment: [...character.character.equipment, equipment],
        },
      });
    }

    onCreated();
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mb-4 text-[0.65rem] font-bold uppercase tracking-wider text-text-secondary">
          {t("custom.createEquipment")}
        </div>

        <div className="flex flex-col gap-3">
          <FormField label={t("common.name")} required>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("custom.itemName")}
              className="w-full"
            />
          </FormField>

          <FormField label={t("common.description")}>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("custom.itemDescription")}
              rows={3}
              className="resize-none"
            />
          </FormField>

          <div className="flex items-center gap-4">
            <CheckboxField
              checked={isWeapon}
              onCheckedChange={(c) => {
                setIsWeapon(c);
                if (c) setIsArmor(false);
              }}
              label={t("equipment.isWeapon")}
              className="text-[0.72rem] text-text-primary"
            />
            <CheckboxField
              checked={isArmor}
              onCheckedChange={(c) => {
                setIsArmor(c);
                if (c) setIsWeapon(false);
              }}
              label={t("equipment.isArmor")}
              className="text-[0.72rem] text-text-primary"
            />
          </div>

          <FormField label={t("common.quantity")}>
            <Input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
              min={1}
              className="num"
            />
          </FormField>

          {isWeapon ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <FormField label={t("custom.damageDie")}>
                  <Input
                    type="text"
                    value={damageDie}
                    onChange={(e) => setDamageDie(e.target.value)}
                    placeholder="1d8"
                    className="w-full"
                  />
                </FormField>
                <FormField label={t("custom.damageType")}>
                  <Select
                    value={damageType}
                    onChange={(e) => setDamageType(e.target.value as DamageType)}
                  >
                    {DAMAGE_TYPES.map((dt) => (
                      <option key={dt} value={dt}>
                        {t(`srd.damage_${dt}`)}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>
              <FormField label={t("custom.attackStat")}>
                <Select
                  value={attackStat}
                  onChange={(e) => setAttackStat(e.target.value as "STR" | "DEX")}
                  className="w-24"
                >
                  <option value="STR">{t("abilities.STR_short")}</option>
                  <option value="DEX">{t("abilities.DEX_short")}</option>
                </Select>
              </FormField>
              <FormField label={t("custom.properties")}>
                <Input
                  type="text"
                  value={properties}
                  onChange={(e) => setProperties(e.target.value)}
                  placeholder={t("custom.propertiesPlaceholder")}
                  className="w-full"
                />
              </FormField>
            </>
          ) : isArmor ? (
            <div className="grid grid-cols-2 gap-3">
              <FormField label={t("custom.armorCategory")}>
                <Select
                  value={armorCategory}
                  onChange={(e) =>
                    setArmorCategory(
                      e.target.value as "light" | "medium" | "heavy" | "shield"
                    )
                  }
                >
                  <option value="light">{t("custom.armorLight")}</option>
                  <option value="medium">{t("custom.armorMedium")}</option>
                  <option value="heavy">{t("custom.armorHeavy")}</option>
                  <option value="shield">{t("custom.armorShield")}</option>
                </Select>
              </FormField>
              <FormField label={t("custom.acBonus")}>
                <Input
                  type="number"
                  value={acBonus}
                  onChange={(e) => setAcBonus(e.target.value)}
                  placeholder={t("custom.acBonusPlaceholder")}
                  className="num w-full"
                />
              </FormField>
            </div>
          ) : (
            <>
              {/* Level 1: Track uses checkbox */}
              <CheckboxField
                checked={trackingMode !== "none"}
                onCheckedChange={(c) => {
                  setTrackingMode(c ? "tracked" : "none");
                  if (!c) setIsPotion(false);
                }}
                label={t("equipment.trackUses")}
                hint={t("equipment.trackUsesHint")}
                className="text-[0.72rem] text-text-primary"
              />

              {/* Level 2: Auto-remove sub-option — only when tracked */}
              {trackingMode !== "none" && (
                <CheckboxField
                  checked={trackingMode === "consumable"}
                  onCheckedChange={(c) => {
                    setTrackingMode(c ? "consumable" : "tracked");
                    if (!c) setIsPotion(false);
                  }}
                  label={t("equipment.autoRemove")}
                  hint={t("equipment.autoRemoveHint")}
                  className="ml-4 text-[0.72rem] text-text-primary"
                />
              )}

              {/* Level 3: Potion sub-flag — only when consumable */}
              {trackingMode === "consumable" && (
                <div className="ml-8 flex flex-col gap-2">
                  <CheckboxField
                    checked={isPotion}
                    onCheckedChange={setIsPotion}
                    label={t("equipment.potionConsumable")}
                    className="text-[0.72rem] text-text-primary"
                  />
                  {isPotion && (
                    <FormField label={t("custom.healingFormula")}>
                      <Input
                        type="text"
                        value={potionFormula}
                        onChange={(e) => setPotionFormula(e.target.value)}
                        placeholder="2d4+2"
                        className="w-full"
                      />
                    </FormField>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="border-t border-border px-4 py-3">
        <Button onClick={handleCreate} disabled={!name.trim()} block>
          <Icon as={Plus} size="sm" decorative />
          {t("custom.createEquipmentBtn")}
        </Button>
      </div>
    </div>
  );
}

// ─── Custom Feature Form ─────────────────────────────────────────────────────

interface CustomFeatureFormProps {
  onCreated: () => void;
  /**
   * When set, the form EDITS this existing custom feature in place (writing back
   * to `features[editIndex]`) instead of appending a new one — so a homebrew
   * feature can be corrected after creation (U6). Fields the form doesn't expose
   * (actions) are preserved; an existing tracker keeps its id so its spent-uses
   * survive a rename.
   */
  editFeature?: CustomFeature;
  editIndex?: number;
}

export function CustomFeatureForm({
  onCreated,
  editFeature,
  editIndex,
}: CustomFeatureFormProps) {
  const { t } = useTranslation();
  const character = useCharacterStore((s) => s.character);
  const isEditing = editFeature != null && editIndex != null;
  const initTracker = editFeature?.trackers?.[0];
  const [title, setTitle] = useState(editFeature?.title ?? "");
  const [source, setSource] = useState(editFeature?.source ?? "Homebrew");
  const [emoji, setEmoji] = useState(editFeature?.emoji ?? DEFAULT_ALGO_ICON.id);
  const [description, setDescription] = useState(
    editFeature?.contentBlocks[0]?.text ?? ""
  );
  const [hasTracker, setHasTracker] = useState(initTracker != null);
  const [trackerTotal, setTrackerTotal] = useState(initTracker?.total ?? "1");
  // Default to a real Select option ("long-rest"), not the bare "long" the create
  // form used to seed — that matched no <option>, so an un-touched recovery
  // silently stored the invalid "long".
  const [trackerRecovery, setTrackerRecovery] = useState<string>(
    initTracker?.recovery ?? "long-rest"
  );

  function handleSubmit() {
    if (!character || !title.trim()) return;
    const store = useCharacterStore.getState();

    const built: CustomFeature = {
      // Preserve any fields the form doesn't edit (e.g. custom actions) on edit.
      ...editFeature,
      custom: true,
      title: title.trim(),
      emoji: emoji || "✨",
      source,
      tags: editFeature?.tags ?? [],
      contentBlocks: [{ text: description, type: "text" }],
      trackers: hasTracker
        ? [
            {
              // Keep the existing tracker id on edit so its spent-uses survive.
              id:
                initTracker?.id ??
                `custom-${title.trim().toLowerCase().replace(/\s+/g, "-")}`,
              label: title.trim(),
              total: trackerTotal,
              recovery: trackerRecovery as "long-rest" | "short-rest" | "manual",
            },
          ]
        : [],
      actions: editFeature?.actions ?? [],
    };

    const features = isEditing
      ? character.character.features.map((f, i) => (i === editIndex ? built : f))
      : [...character.character.features, built];

    store.setCharacter({
      ...character,
      character: { ...character.character, features },
    });

    onCreated();
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mb-4 text-[0.65rem] font-bold uppercase tracking-wider text-text-secondary">
          {isEditing ? t("custom.editFeature") : t("custom.createFeature")}
        </div>

        <div className="flex flex-col gap-3">
          <FormField label={t("common.name")} required>
            <Input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("custom.featureName")}
              className="w-full"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label={t("custom.source")}>
              <Input
                type="text"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder={t("custom.sourcePlaceholder")}
                className="w-full"
              />
            </FormField>
            {/* #78 — the last raw-emoji surface: the shared folio glyph picker
                (stores a stable icon id; legacy emoji seeds still resolve). */}
            <FormField label={t("custom.emoji")}>
              <IconPicker value={emoji} onChange={setEmoji} />
            </FormField>
          </div>

          <FormField label={t("common.description")}>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("custom.featureDescription")}
              rows={4}
              className="resize-none"
            />
          </FormField>

          <div className="flex items-center gap-4">
            <CheckboxField
              checked={hasTracker}
              onCheckedChange={setHasTracker}
              label={t("equipment.hasUsageTracker")}
              className="text-[0.72rem] text-text-primary"
            />
          </div>

          {hasTracker && (
            <div className="grid grid-cols-2 gap-3">
              <FormField label={t("custom.totalUses")}>
                <Input
                  type="text"
                  value={trackerTotal}
                  onChange={(e) => setTrackerTotal(e.target.value)}
                  placeholder={t("custom.totalUsesPlaceholder")}
                  className="w-full"
                />
              </FormField>
              <FormField label={t("custom.recovery")}>
                <Select
                  value={trackerRecovery}
                  onChange={(e) => setTrackerRecovery(e.target.value)}
                >
                  <option value="long-rest">{t("custom.recoveryLong")}</option>
                  <option value="short-rest">{t("custom.recoveryShort")}</option>
                  <option value="manual">{t("custom.recoveryManual")}</option>
                </Select>
              </FormField>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border px-4 py-3">
        <Button onClick={handleSubmit} disabled={!title.trim()} block>
          <Icon as={isEditing ? Check : Plus} size="sm" decorative />
          {isEditing ? t("common.saveChanges") : t("custom.createFeatureBtn")}
        </Button>
      </div>
    </div>
  );
}

// ─── Shared ──────────────────────────────────────────────────────────────────

function FormField({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-[length:var(--text-micro)] font-bold uppercase tracking-wider text-text-secondary">
        {label}
        {required && <span className="ml-0.5 text-error">*</span>}
      </label>
      {children}
    </div>
  );
}

// ─── Tab switcher for modals ─────────────────────────────────────────────────

export function ModalTabSwitcher({
  activeTab,
  onTabChange,
}: {
  activeTab: "srd" | "custom";
  onTabChange: (tab: "srd" | "custom") => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex border-b border-border-subtle">
      <button
        onClick={() => onTabChange("srd")}
        className={cn(
          "flex-1 py-2 text-center text-[0.7rem] font-semibold transition-colors",
          activeTab === "srd"
            ? "border-b-2 border-accent text-accent"
            : "text-text-secondary hover:text-text-primary"
        )}
      >
        {t("custom.srdTab")}
      </button>
      <button
        onClick={() => onTabChange("custom")}
        className={cn(
          "flex-1 py-2 text-center text-[0.7rem] font-semibold transition-colors",
          activeTab === "custom"
            ? "border-b-2 border-accent text-accent"
            : "text-text-secondary hover:text-text-primary"
        )}
      >
        {t("custom.customTab")}
      </button>
    </div>
  );
}
