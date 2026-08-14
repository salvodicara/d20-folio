import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { srd } from "../_harness/loc";
import i18n from "@/i18n";
import { InventoryTab } from "@/features/character/center/tabs/InventoryTab";
import { inventoryItemDisplayName } from "@/features/character/center/tabs/inventory/inventory-card-helpers";
import { itemSeal } from "@/features/character/center/tabs/inventory/item-seal";
import { magicItemSealIcon } from "@/components/shared/item-icons";
import { buildInventoryViewModel } from "@/lib/views/inventory-view";
import { MOCK_CHARACTER } from "@/lib/mock";
import { useCharacterStore } from "@/stores/characterStore";
import { useToastStore } from "@/stores/toastStore";
import { useUIStore } from "@/stores/uiStore";
import type { CharacterDoc, SrdEquipmentRef } from "@/types/character";

const ITEM_ID = "wand-of-web";
const ITEM_NAME = srd("magic-item", ITEM_ID, "name", "en");

const CASES: ReadonlyArray<{
  label: string;
  refs: ReadonlyArray<SrdEquipmentRef>;
  rowIds: ReadonlyArray<string>;
}> = [
  {
    label: "instance-backed duplicates",
    refs: [
      { srdId: ITEM_ID, instanceId: "wand-a", quantity: 1 },
      { srdId: ITEM_ID, instanceId: "wand-b", quantity: 1 },
    ],
    rowIds: ["equipment-instance:wand-a", "equipment-instance:wand-b"],
  },
  {
    label: "legacy duplicates",
    refs: [
      { srdId: ITEM_ID, quantity: 1 },
      { srdId: ITEM_ID, quantity: 1 },
    ],
    rowIds: ["equipment-legacy:0", "equipment-legacy:1"],
  },
];

function docWith(refs: ReadonlyArray<SrdEquipmentRef>): CharacterDoc {
  const doc = structuredClone(MOCK_CHARACTER);
  doc.character.weapons = [];
  doc.character.equipment = refs.map((ref) => ({ ...ref }));
  return doc;
}

function renderTab(doc: CharacterDoc) {
  useCharacterStore.setState({ character: doc, loading: false, error: null });
  return render(
    <MemoryRouter>
      <InventoryTab />
    </MemoryRouter>
  );
}

describe("inventory physical-instance row identity", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    useCharacterStore.setState({ character: null, loading: false, error: null });
    useUIStore.setState({ sheetMode: "play" });
    useToastStore.setState({ toasts: [], timers: {} });
  });

  it.each(CASES)(
    "$label keeps one catalogue identity and seal but unique row identities",
    ({ refs, rowIds }) => {
      const rows = buildInventoryViewModel(docWith(refs), "en").gear;

      expect(rows.map((row) => row.rowId)).toEqual(rowIds);
      expect(new Set(rows.map((row) => row.rowId)).size).toBe(rows.length);
      expect(rows.map((row) => row.id)).toEqual([ITEM_ID, ITEM_ID]);
      expect(rows.map((row) => row.name)).toEqual([ITEM_NAME, ITEM_NAME]);
      expect(rows.map(itemSeal)).toEqual([
        magicItemSealIcon("wand"),
        magicItemSealIcon("wand"),
      ]);
    }
  );

  it.each(CASES)("$label expands each same-name row independently", ({ refs }) => {
    const doc = docWith(refs);
    const rows = buildInventoryViewModel(doc, "en").gear;
    const { container } = renderTab(doc);
    const cards = screen.getAllByRole("article");
    const getToggles = () =>
      cards.map((card, index) => {
        const row = rows[index];
        if (!row) throw new Error(`inventory row ${index} missing`);
        const displayName = inventoryItemDisplayName(row, i18n.t);
        return within(card).getByRole("button", {
          name: `${i18n.t("common.expand")}: ${displayName}`,
        });
      });

    let toggles = getToggles();
    expect(toggles.map((button) => button.getAttribute("aria-expanded"))).toEqual([
      "false",
      "false",
    ]);

    const firstToggle = toggles[0];
    if (!firstToggle) throw new Error("first duplicate toggle missing");
    fireEvent.click(firstToggle);
    toggles = getToggles();
    expect(toggles.map((button) => button.getAttribute("aria-expanded"))).toEqual([
      "true",
      "false",
    ]);

    const secondToggle = toggles[1];
    if (!secondToggle) throw new Error("second duplicate toggle missing");
    fireEvent.click(secondToggle);
    toggles = getToggles();
    expect(toggles.map((button) => button.getAttribute("aria-expanded"))).toEqual([
      "false",
      "true",
    ]);

    for (const ref of refs) {
      if (ref.instanceId !== undefined) {
        expect(container).not.toHaveTextContent(ref.instanceId);
      }
    }
  });
});
