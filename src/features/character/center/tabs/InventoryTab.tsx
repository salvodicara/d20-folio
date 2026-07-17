/**
 * InventoryTab — the cockpit's Inventory domain (blueprint §2.4): a THIN
 * orchestrator. It reads the character from the store, builds ONE localized
 * view-model via the pure {@link buildInventoryViewModel} presenter
 * (`lib/views/inventory-view`), holds the local UI state (search / expanded row /
 * add-item modal) + the store mutators (delete / field-edit / equip / attune /
 * charge / use / currency, immediate-commit with a 5 s undo where applicable), and
 * renders the presentational section components — `WeaponCard`, `ArmorCard`,
 * `GearCard`, the currency ledger. SRD content is pre-localized on the VM, so THIS
 * file makes ZERO direct `[locale]`/BiText reads (docs/ARCHITECTURE.md;
 * golden rules 5 + 7).
 *
 * (folio §5.8 — the inventory card-page.)
 *
 * Outside combat — consumable / charge usage is IMMEDIATE with a 5 s undo toast.
 * Accordion expand (only one card open at a time). Currency stays on the
 * theme-aware metal tokens. Honest blanks throughout; bilingual EN + IT.
 */

import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Backpack } from "lucide-react";
import { useCharacterStore } from "@/stores/characterStore";
import { useUIStore } from "@/stores/uiStore";
import { registerUndoableToast } from "@/stores/undoStore";
import { useLocale } from "@/hooks/useLocale";
import { computeAC } from "@/lib/compute";
import { formatWeight } from "@/lib/utils";
import { matchesSearch } from "@/lib/search";
import { getEquipment } from "@/data/equipment";
import {
  buildInventoryViewModel,
  type WeaponRowVM,
  type ItemRowVM,
} from "@/lib/views/inventory-view";
import { AddItemModal } from "@/components/sheet/AddItemModal";
import { CollapsibleSearch } from "@/components/shared/CollapsibleSearch";
import { InfoCard } from "@/components/shared/InfoCard";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { CurrencyTokens } from "@/components/shared/CurrencyTokens";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { RunicEmptyState } from "@/components/ui/runic-empty-state";
import { WeaponCard, type ItemFieldValue } from "./inventory/WeaponCard";
import { ArmorCard } from "./inventory/ArmorCard";
import { GearCard } from "./inventory/GearCard";

type CurrencyKey = "gp" | "sp" | "cp" | "pp" | "ep";
// Order = highest→lowest denomination, ep last. The displayed abbreviation is
// i18n'd at render (EN gp/sp/cp/pp/ep → IT SRD 5.2.1 mo/ma/mr/mp/me) by
// `CurrencyTokens`.
const CURRENCY_KEYS: readonly CurrencyKey[] = ["pp", "gp", "sp", "cp", "ep"];

export function InventoryTab() {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const character = useCharacterStore((s) => s.character);
  const sheetMode = useUIStore((s) => s.sheetMode);
  const [addItemModalOpen, setAddItemModalOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const isEdit = sheetMode === "edit";
  const isPlay = sheetMode === "play";

  // The ONE localized view-model (presenter). Stable across search — filtering
  // operates on top of the row lists without recreating any VM, so the memo'd
  // cards bail on a search keystroke.
  const view = useMemo(
    () => (character ? buildInventoryViewModel(character, locale) : null),
    [character, locale]
  );

  // ── search filters (operate on the stable VM lists) ──────────────────────────
  const filteredWeapons = useMemo(() => {
    const list = view?.weapons ?? [];
    if (!search.trim()) return list;
    return list.filter((w) => matchesSearch(search, w.name, w.searchEn));
  }, [view, search]);
  const filteredArmor = useMemo(() => {
    const list = view?.armor ?? [];
    if (!search.trim()) return list;
    return list.filter((i) => matchesSearch(search, i.name, i.searchEn));
  }, [view, search]);
  const filteredGear = useMemo(() => {
    const list = view?.gear ?? [];
    if (!search.trim()) return list;
    return list.filter((i) => matchesSearch(search, i.name, i.searchEn));
  }, [view, search]);

  const onToggle = useCallback(
    (id: string, open: boolean) => setExpandedId(open ? id : null),
    []
  );

  // ── store mutators (override-first; immediate-commit + undo where applicable) ──

  const handleUseItem = useCallback(
    (item: ItemRowVM) => {
      if (!item.isConsumable && !item.tracked) return;
      if (item.quantity <= 0) return;
      const char = useCharacterStore.getState().character;
      if (!char) return;

      const prevEquipment = char.character.equipment;
      const newQty = item.quantity - 1;
      const newEquipment =
        item.isConsumable && newQty <= 0
          ? char.character.equipment.filter((ref) => {
              const id = "custom" in ref ? `custom-${ref.name}` : ref.srdId;
              return id !== item.id;
            })
          : char.character.equipment.map((ref) => {
              const id = "custom" in ref ? `custom-${ref.name}` : ref.srdId;
              return id === item.id ? { ...ref, quantity: newQty } : ref;
            });

      const message =
        item.isConsumable && newQty <= 0
          ? t("equipment.itemDepletedToast", { name: item.name })
          : t("combat.usedItemToast", { name: item.name, remaining: newQty });
      registerUndoableToast(
        { message },
        () => {
          useCharacterStore.getState().setCharacter({
            ...char,
            character: { ...char.character, equipment: newEquipment },
          });
          return () => {
            const current = useCharacterStore.getState().character;
            if (!current) return;
            useCharacterStore.getState().setCharacter({
              ...current,
              character: { ...current.character, equipment: prevEquipment },
            });
          };
        },
        { turnScoped: false }
      );
    },
    [t]
  );

  const handleDeleteWeapon = useCallback(
    (weapon: WeaponRowVM) => {
      const char = useCharacterStore.getState().character;
      if (!char) return;
      const removed = char.character.weapons[weapon.idx];
      if (!removed) return;
      const message = t("common.deleted", { name: weapon.name });
      registerUndoableToast(
        { message },
        () => {
          const cur = useCharacterStore.getState().character;
          if (!cur) return null;
          const list = [...cur.character.weapons];
          list.splice(weapon.idx, 1);
          useCharacterStore.getState().setCharacter({
            ...cur,
            character: { ...cur.character, weapons: list },
          });
          return () => {
            const current = useCharacterStore.getState().character;
            if (!current) return;
            const restored = [...current.character.weapons];
            restored.splice(weapon.idx, 0, removed);
            useCharacterStore.getState().setCharacter({
              ...current,
              character: { ...current.character, weapons: restored },
            });
          };
        },
        { turnScoped: false }
      );
    },
    [t]
  );

  const handleDeleteEquipment = useCallback(
    (item: ItemRowVM) => {
      const char = useCharacterStore.getState().character;
      if (!char) return;
      const removed = char.character.equipment[item.idx];
      if (!removed) return;
      const message = t("common.deleted", { name: item.name });
      registerUndoableToast(
        { message },
        () => {
          const cur = useCharacterStore.getState().character;
          if (!cur) return null;
          const list = [...cur.character.equipment];
          list.splice(item.idx, 1);
          useCharacterStore.getState().setCharacter({
            ...cur,
            character: { ...cur.character, equipment: list },
          });
          return () => {
            const current = useCharacterStore.getState().character;
            if (!current) return;
            const restored = [...current.character.equipment];
            restored.splice(item.idx, 0, removed);
            useCharacterStore.getState().setCharacter({
              ...current,
              character: { ...current.character, equipment: restored },
            });
          };
        },
        { turnScoped: false }
      );
    },
    [t]
  );

  const updateWeaponField = useCallback(
    (idx: number, field: string, value: ItemFieldValue) => {
      const store = useCharacterStore.getState();
      const char = store.character;
      if (!char) return;
      const weaponsCopy = [...char.character.weapons];
      const ref = weaponsCopy[idx];
      if (!ref) return;
      weaponsCopy[idx] = { ...ref, [field]: value === "" ? undefined : value };
      store.setCharacter({
        ...char,
        character: { ...char.character, weapons: weaponsCopy },
      });
    },
    []
  );

  const updateEquipmentField = useCallback(
    (idx: number, field: string, value: ItemFieldValue) => {
      const store = useCharacterStore.getState();
      const char = store.character;
      if (!char) return;
      const equipCopy = [...char.character.equipment];
      const ref = equipCopy[idx];
      if (!ref) return;
      equipCopy[idx] = { ...ref, [field]: value === "" ? undefined : value };
      store.setCharacter({
        ...char,
        character: { ...char.character, equipment: equipCopy },
      });
    },
    []
  );

  // Spend ONE charge — §2.6: one tap, undoable. A tracker-backed pool (a
  // `free-cast-spell` charge item — Wand of Web) debits the SESSION TRACKER,
  // the same counter the Play-board cast and the rail edit (golden rule 6);
  // a manual pool debits the stored `ref.charges`. Both get the 5 s undo.
  const spendCharge = useCallback(
    (item: ItemRowVM) => {
      const char = useCharacterStore.getState().character;
      if (!char || !item.charges || item.charges.current <= 0) return;
      const remaining = item.charges.current - 1;
      const message = t("equipment.usedChargeToast", { name: item.name, remaining });
      if (item.charges.trackerId) {
        const trackerId = item.charges.trackerId;
        registerUndoableToast(
          { message },
          () => {
            useCharacterStore.getState().useTracker(trackerId);
            return () => useCharacterStore.getState().restoreTracker(trackerId);
          },
          { turnScoped: false }
        );
        return;
      }
      const prevEquipment = char.character.equipment;
      const equipCopy = [...prevEquipment];
      const ref = equipCopy[item.idx];
      if (!ref?.charges) return;
      equipCopy[item.idx] = {
        ...ref,
        charges: { ...ref.charges, current: Math.max(0, ref.charges.current - 1) },
      };
      registerUndoableToast(
        { message },
        () => {
          useCharacterStore.getState().setCharacter({
            ...char,
            character: { ...char.character, equipment: equipCopy },
          });
          return () => {
            const current = useCharacterStore.getState().character;
            if (!current) return;
            useCharacterStore.getState().setCharacter({
              ...current,
              character: { ...current.character, equipment: prevEquipment },
            });
          };
        },
        { turnScoped: false }
      );
    },
    [t]
  );

  const toggleAttunement = useCallback((idx: number) => {
    const store = useCharacterStore.getState();
    const char = store.character;
    if (!char) return;
    const equipCopy = [...char.character.equipment];
    const ref = equipCopy[idx];
    if (!ref) return;
    // A minimally-stored ref may carry no `attuned` yet — the first toggle
    // bonds it (the affordance is data-derived, `refRequiresAttunement`).
    equipCopy[idx] = { ...ref, attuned: !(ref.attuned ?? false) };
    const newAC = computeAC(
      equipCopy,
      char.character.abilityScores,
      getEquipment,
      char.character.features
    );
    store.setCharacter({
      ...char,
      character: { ...char.character, equipment: equipCopy, ac: newAC },
    });
  }, []);

  const toggleEquip = useCallback((idx: number) => {
    const store = useCharacterStore.getState();
    const char = store.character;
    if (!char) return;
    const equipCopy = [...char.character.equipment];
    const ref = equipCopy[idx];
    if (!ref) return;
    equipCopy[idx] = { ...ref, equipped: !(ref.equipped ?? false) };
    const newAC = computeAC(
      equipCopy,
      char.character.abilityScores,
      getEquipment,
      char.character.features
    );
    store.setCharacter({
      ...char,
      character: { ...char.character, equipment: equipCopy, ac: newAC },
    });
  }, []);

  const updateCurrency = useCallback((key: CurrencyKey, value: number) => {
    const store = useCharacterStore.getState();
    const char = store.character;
    if (!char) return;
    const updated = { ...char.session.currency, [key]: value };
    store.setCharacter({
      ...char,
      session: { ...char.session, currency: updated },
    });
  }, []);

  if (!character || !view) return null;

  const { currency } = character.session;
  const { attunement, encumbrance } = view;
  const ownedRows = view.weapons.length + view.armor.length + view.gear.length;
  const matchedRows = filteredWeapons.length + filteredArmor.length + filteredGear.length;

  return (
    <div>
      {/* Tab toolbar — search + add + the attunement / encumbrance chips. */}
      <div className="tab-toolbar">
        <CollapsibleSearch
          value={search}
          onChange={setSearch}
          placeholder={t("equipment.searchPlaceholder")}
        />
        <div className="toolbar-end">
          {attunement.show && (
            <span
              className="toolbar-chip"
              data-state={attunement.bonded > attunement.cap ? "danger" : undefined}
              title={t("equipment.attunementHint")}
            >
              {t("equipment.attunementCount", {
                bonded: attunement.bonded,
                cap: attunement.cap,
              })}
            </span>
          )}
          {/* Honest blank: nothing carried → no chip (formatWeight renders 0 as
              empty, which read as a broken "/ 120 lb"). */}
          {encumbrance && encumbrance.carried > 0 && (
            <span
              className="toolbar-chip"
              data-state={encumbrance.over ? "danger" : undefined}
              title={t("equipment.encumbranceHint")}
            >
              {formatWeight(encumbrance.carried, locale)} /{" "}
              {formatWeight(encumbrance.capacity, locale)}
            </span>
          )}
          {/* PLAY-NO-EDIT (Constitution §2.8) — loot lands DURING a session, so
              adding an item never requires edit mode. Edit mode keeps curation
              (delete, overrides, custom fields). */}
          <Button size="sm" onClick={() => setAddItemModalOpen(true)}>
            <Icon as={Plus} size="sm" decorative />
            {t("equipment.addItem")}
          </Button>
        </div>
      </div>

      {/* Weapons */}
      {filteredWeapons.length > 0 && (
        <div className="mb-5">
          <SectionHeader title={t("equipment.weapons")} />
          <div className="uc-stack">
            {filteredWeapons.map((weapon) => (
              <WeaponCard
                key={weapon.id}
                vm={weapon}
                isEdit={isEdit}
                isPlay={isPlay}
                expanded={expandedId === weapon.id}
                locale={locale}
                enchantOptions={view.enchantOptions}
                onToggle={onToggle}
                onDelete={handleDeleteWeapon}
                onUpdateField={updateWeaponField}
              />
            ))}
          </div>
        </div>
      )}

      {/* Armor */}
      {filteredArmor.length > 0 && (
        <div className="mb-5">
          <SectionHeader title={t("equipment.armor")} />
          <div className="uc-stack">
            {filteredArmor.map((item) => (
              <ArmorCard
                key={item.id}
                vm={item}
                isEdit={isEdit}
                isPlay={isPlay}
                expanded={expandedId === item.id}
                locale={locale}
                onToggle={onToggle}
                onDelete={handleDeleteEquipment}
                onUpdateField={updateEquipmentField}
                onToggleEquip={toggleEquip}
                onToggleAttune={toggleAttunement}
                onSpendCharge={spendCharge}
              />
            ))}
          </div>
        </div>
      )}

      {/* Gear & Potions */}
      {filteredGear.length > 0 && (
        <div className="mb-5">
          <SectionHeader title={t("equipment.potionsAndGear")} />
          <div className="uc-stack">
            {filteredGear.map((item) => (
              <GearCard
                key={item.id}
                vm={item}
                isEdit={isEdit}
                isPlay={isPlay}
                expanded={expandedId === item.id}
                locale={locale}
                onToggle={onToggle}
                onDelete={handleDeleteEquipment}
                onUpdateField={updateEquipmentField}
                onUse={handleUseItem}
                onToggleEquip={toggleEquip}
                onToggleAttune={toggleAttunement}
                onSpendCharge={spendCharge}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty pack teaches; a fruitless search says so (honest blanks). */}
      {ownedRows === 0 ? (
        <RunicEmptyState
          glyph={Backpack}
          eyebrow={t("equipment.title")}
          title={t("equipment.emptyTitle")}
          blurb={t("equipment.emptyBlurb")}
          actions={
            <Button onClick={() => setAddItemModalOpen(true)}>
              <Icon as={Plus} size="sm" decorative />
              {t("equipment.addItem")}
            </Button>
          }
        />
      ) : matchedRows === 0 ? (
        <RunicEmptyState
          glyph={Backpack}
          size="sm"
          title={t("equipment.noItemsMatch")}
          blurb={t("common.searchMissHint")}
        />
      ) : null}

      {/* Currency */}
      <div>
        <SectionHeader title={t("equipment.currency")} />
        <InfoCard flush>
          {/* The character's PERSONAL currency only (the shared treasury lives in
              the campaign hub). Editable IN PLACE in BOTH modes via CurrencyTokens. */}
          <div className="flex items-center justify-between px-4 py-2.5">
            <CurrencyTokens
              editable
              values={currency}
              keys={CURRENCY_KEYS}
              onChange={(key, v) => updateCurrency(key, v)}
            />
          </div>
        </InfoCard>
      </div>

      <AddItemModal open={addItemModalOpen} onClose={() => setAddItemModalOpen(false)} />
    </div>
  );
}
