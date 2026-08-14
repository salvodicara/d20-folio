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
import { useLibraryStore } from "@/stores/libraryStore";
import { useUIStore } from "@/stores/uiStore";
import { registerUndoableToast } from "@/stores/undoStore";
import { useLocale } from "@/hooks/useLocale";
import { computeAC, isHeavyArmorEquipped } from "@/lib/compute";
import { effectiveEquipmentForItemResources } from "@/lib/aggregate-character";
import { resolveActiveStatesEndingOn } from "@/lib/smart-tracker";
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
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Icon } from "@/components/ui/icon";
import { RunicEmptyState } from "@/components/ui/runic-empty-state";
import { WeaponCard, type ItemFieldValue } from "./inventory/WeaponCard";
import { ArmorCard } from "./inventory/ArmorCard";
import { GearCard } from "./inventory/GearCard";
import { inventoryItemDisplayName } from "./inventory/inventory-card-helpers";
import { useItemResourceSpend } from "@/features/character/useItemResourceSpend";

type CurrencyKey = "gp" | "sp" | "cp" | "pp" | "ep";
// Order = highest→lowest denomination, ep last. The displayed abbreviation is
// i18n'd at render (EN gp/sp/cp/pp/ep → IT SRD 5.2.1 mo/ma/mr/mp/me) by
// `CurrencyTokens`.
const CURRENCY_KEYS: readonly CurrencyKey[] = ["pp", "gp", "sp", "cp", "ep"];

/**
 * A toolbar status chip whose EXPLANATION is on-demand — the carved `.toolbar-chip`
 * pill made a real trigger for the app's one info-popover recipe (the
 * `GlossaryTip`/`ActionRiders` family: `Popover` + `.glossary-pop`, click/tap so
 * it works on every device).
 *
 * It replaces a native `title=`, which Chromium paints outside the page and touch
 * has no gesture for at all — so on a phone the push/drag/lift number (RA-27) and
 * the attunement rule were simply UNREACHABLE. Every sibling number on the sheet
 * discloses through this recipe; these now do too.
 */
function ChipHint({
  rubric,
  text,
  hint,
  danger,
  namesItself,
}: {
  /** The popover heading — an EXISTING canonical label key, never a new string. */
  rubric: string;
  /** The chip's own reading — the numbers the player scans ("45 lb / 120 lb"). */
  text: string;
  /** The plain-language explanation body. */
  hint: string;
  /** Over-limit (capacity exceeded / attunement over cap) — the crimson chip. */
  danger?: boolean;
  /**
   * `true` when `text` ALREADY names the chip in EVERY locale (the attunement
   * count reads "Attuned 2 / 3" · "Sintonizzati 2 / 3"), so its contents are the
   * accessible name as written. The CALLER declares it because only the caller
   * knows the shape of its i18n string: inferring it by looking for the rubric
   * inside the text works in English and breaks on any locale that inflects
   * (IT rubric "Sintonizzato" vs the count's "Sintonizzati" → "Sintonizzato:
   * Sintonizzati 2 / 3", the very stutter this avoids).
   */
  namesItself?: boolean;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="toolbar-chip"
          // NOT `data-state`: Radix's popover trigger owns that attribute on this
          // element (open/closed), so the over-limit flag rides its own.
          data-over={danger ? "" : undefined}
          // A chip that shows only numbers gets its rubric prefixed, so the name
          // says WHICH numbers ("Carrying Capacity: 45 lb / 120 lb") and still
          // CONTAINS the visible text (WCAG 2.5.3) — a bare rubric would replace
          // the reading and a screen reader would never hear the data. A chip
          // that already names itself keeps its contents as the name.
          aria-label={namesItself ? undefined : `${rubric}: ${text}`}
        >
          {text}
        </button>
      </PopoverTrigger>
      <PopoverContent
        rubric={rubric}
        side="bottom"
        align="end"
        collisionPadding={12}
        className="glossary-pop"
        aria-label={rubric}
      >
        {hint}
      </PopoverContent>
    </Popover>
  );
}

export function InventoryTab() {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const character = useCharacterStore((s) => s.character);
  const sheetMode = useUIStore((s) => s.sheetMode);
  const { spend: spendItemResource } = useItemResourceSpend();
  const [addItemModalOpen, setAddItemModalOpen] = useState(false);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
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
    (rowId: string, open: boolean) => setExpandedRowId(open ? rowId : null),
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
      const consumedRef = char.character.equipment[item.idx];
      const newQty = item.quantity - 1;
      const removedInstanceId =
        item.isConsumable && newQty <= 0 && consumedRef && !("custom" in consumedRef)
          ? consumedRef.instanceId
          : undefined;
      const priorResourceState = removedInstanceId
        ? char.session.itemResources?.[removedInstanceId]
        : undefined;
      const newEquipment =
        item.isConsumable && newQty <= 0
          ? char.character.equipment.filter((_ref, index) => index !== item.idx)
          : char.character.equipment.map((ref, index) =>
              index === item.idx ? { ...ref, quantity: newQty } : ref
            );

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
            session: removedInstanceId
              ? {
                  ...char.session,
                  itemResources: Object.fromEntries(
                    Object.entries(char.session.itemResources ?? {}).filter(
                      ([instanceId]) => instanceId !== removedInstanceId
                    )
                  ),
                }
              : char.session,
          });
          return () => {
            const current = useCharacterStore.getState().character;
            if (!current) return;
            useCharacterStore.getState().setCharacter({
              ...current,
              character: { ...current.character, equipment: prevEquipment },
              session:
                removedInstanceId && priorResourceState
                  ? {
                      ...current.session,
                      itemResources: {
                        ...current.session.itemResources,
                        [removedInstanceId]: priorResourceState,
                      },
                    }
                  : current.session,
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
      const instanceId = "custom" in removed ? undefined : removed.instanceId;
      const priorResourceState = instanceId
        ? char.session.itemResources?.[instanceId]
        : undefined;
      const message = t("common.deleted", { name: item.name });
      registerUndoableToast(
        { message },
        () => {
          const store = useCharacterStore.getState();
          if (instanceId) {
            if (!store.removeItemResourceInstance(instanceId)) return null;
          } else {
            const cur = store.character;
            if (!cur || cur.character.equipment[item.idx] !== removed) return null;
            const list = [...cur.character.equipment];
            list.splice(item.idx, 1);
            store.setCharacter({
              ...cur,
              character: { ...cur.character, equipment: list },
            });
          }
          return () => {
            const current = useCharacterStore.getState().character;
            if (!current) return false;
            if (
              instanceId &&
              current.character.equipment.some(
                (ref) => !("custom" in ref) && ref.instanceId === instanceId
              )
            ) {
              return false;
            }
            const restored = [...current.character.equipment];
            restored.splice(Math.min(item.idx, restored.length), 0, removed);
            useCharacterStore.getState().setCharacter({
              ...current,
              character: { ...current.character, equipment: restored },
              session:
                instanceId && priorResourceState
                  ? {
                      ...current.session,
                      itemResources: {
                        ...current.session.itemResources,
                        [instanceId]: priorResourceState,
                      },
                    }
                  : current.session,
            });
            return true;
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
      // Identity is (kind, name), so a RENAME must move the library entry rather than
      // strand the old-named one — capture the name as it read before this edit.
      const previousName = "custom" in ref ? ref.name : undefined;
      weaponsCopy[idx] = { ...ref, [field]: value === "" ? undefined : value };
      const next = { ...char.character, weapons: weaponsCopy };
      store.setCharacter({ ...char, character: next });
      // Custom IS the library: an edited homebrew weapon updates its entry (no-op for
      // an SRD ref). The library write itself is debounced in the persistence seam.
      useLibraryStore.getState().syncFromCharacter(next, "weapon", idx, previousName);
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
      const previousName = "custom" in ref ? ref.name : undefined;
      equipCopy[idx] = { ...ref, [field]: value === "" ? undefined : value };
      const next = { ...char.character, equipment: equipCopy };
      store.setCharacter({ ...char, character: next });
      useLibraryStore.getState().syncFromCharacter(next, "equipment", idx, previousName);
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

  // Typed physical-item counters use the SAME prepare/input/CAS/undo command
  // cycle as item-powered spell casts and combat actions. Inventory contributes
  // only the generic one-unit affordance; it never writes resource state itself.
  const handleSpendItemResource = useCallback(
    (item: ItemRowVM, resource: ItemRowVM["resources"][number]) => {
      void spendItemResource(resource, inventoryItemDisplayName(item, t));
    },
    [spendItemResource, t]
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
    const effectiveEquipment = effectiveEquipmentForItemResources(
      equipCopy,
      char.session.itemResources
    );
    const newAC = computeAC(
      effectiveEquipment,
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
    const effectiveEquipment = effectiveEquipmentForItemResources(
      equipCopy,
      char.session.itemResources
    );
    const newAC = computeAC(
      effectiveEquipment,
      char.character.abilityScores,
      getEquipment,
      char.character.features
    );
    const nextCharacter = {
      ...char,
      character: { ...char.character, equipment: equipCopy, ac: newAC },
    };
    store.setCharacter(nextCharacter);
    if (isHeavyArmorEquipped(effectiveEquipment, getEquipment)) {
      for (const key of resolveActiveStatesEndingOn(nextCharacter, "heavy-armor")) {
        store.setActiveFeature(key, false);
      }
    }
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
            <ChipHint
              rubric={t("equipment.attuned")}
              text={t("equipment.attunementCount", {
                bonded: attunement.bonded,
                cap: attunement.cap,
              })}
              hint={t("equipment.attunementHint")}
              danger={attunement.bonded > attunement.cap}
              // `attunementCount` opens with the rubric in BOTH locales
              // ("Attuned 2 / 3" · "Sintonizzati 2 / 3").
              namesItself
            />
          )}
          {/* Honest blank: nothing carried → no chip (formatWeight renders 0 as
              empty, which read as a broken "/ 120 lb"). */}
          {encumbrance && encumbrance.carried > 0 && (
            <ChipHint
              rubric={t("abilities.carryingCapacity")}
              text={`${formatWeight(encumbrance.carried, locale)} / ${formatWeight(
                encumbrance.capacity,
                locale
              )}`}
              hint={t("equipment.encumbranceHint", {
                pushDragLift: formatWeight(encumbrance.pushDragLift, locale),
              })}
              danger={encumbrance.over}
            />
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
                expanded={expandedRowId === weapon.id}
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
                key={item.rowId}
                vm={item}
                isEdit={isEdit}
                isPlay={isPlay}
                expanded={expandedRowId === item.rowId}
                locale={locale}
                onToggle={(_, open) => onToggle(item.rowId, open)}
                onDelete={handleDeleteEquipment}
                onUpdateField={updateEquipmentField}
                onToggleEquip={toggleEquip}
                onToggleAttune={toggleAttunement}
                onSpendCharge={spendCharge}
                onSpendResource={handleSpendItemResource}
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
                key={item.rowId}
                vm={item}
                isEdit={isEdit}
                isPlay={isPlay}
                expanded={expandedRowId === item.rowId}
                locale={locale}
                onToggle={(_, open) => onToggle(item.rowId, open)}
                onDelete={handleDeleteEquipment}
                onUpdateField={updateEquipmentField}
                onUse={handleUseItem}
                onToggleEquip={toggleEquip}
                onToggleAttune={toggleAttunement}
                onSpendCharge={spendCharge}
                onSpendResource={handleSpendItemResource}
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
