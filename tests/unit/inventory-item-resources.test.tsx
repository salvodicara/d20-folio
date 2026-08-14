import { act } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { srd } from "../_harness/loc";
import i18n from "@/i18n";
import { ItemResourceCommandProvider } from "@/features/character/center/ItemResourceCommandProvider";
import { InventoryTab } from "@/features/character/center/tabs/InventoryTab";
import { MOCK_CHARACTER } from "@/lib/mock";
import { useCharacterStore } from "@/stores/characterStore";
import { useToastStore } from "@/stores/toastStore";
import { useUIStore } from "@/stores/uiStore";
import { useUndoStore } from "@/stores/undoStore";
import type { CharacterDoc, ItemResourceState } from "@/types/character";

const ITEM_ID = "wand-of-magic-missiles";
const COPY_A = "wand-inventory-a";
const COPY_B = "wand-inventory-b";

function resourceState(instanceId: string, current: number): ItemResourceState {
  return {
    itemId: ITEM_ID,
    instanceId,
    revision: 0,
    resources: { charges: { capacity: 7, current, disabled: false } },
    disposition: "magical",
    causalHead: null,
  };
}

function character(): CharacterDoc {
  const doc = structuredClone(MOCK_CHARACTER);
  doc.character.weapons = [];
  doc.character.equipment = [
    { srdId: ITEM_ID, instanceId: COPY_A, equipped: true, quantity: 1 },
    { srdId: ITEM_ID, instanceId: COPY_B, equipped: true, quantity: 1 },
  ];
  doc.session.itemResources = {
    [COPY_A]: resourceState(COPY_A, 2),
    [COPY_B]: resourceState(COPY_B, 6),
  };
  return doc;
}

function renderInventory() {
  return render(
    <ItemResourceCommandProvider>
      <MemoryRouter>
        <InventoryTab />
      </MemoryRouter>
    </ItemResourceCommandProvider>
  );
}

function articleFor(name: string): HTMLElement {
  const article = screen.getByText(name).closest("article");
  if (!article) throw new Error(`No inventory article for ${name}`);
  return article;
}

describe("Inventory typed physical-item resources", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    const doc = character();
    useCharacterStore.setState({
      character: doc,
      readonly: false,
      loading: false,
      error: null,
      parentPersistenceFlush: null,
    });
    useUIStore.setState({ sheetMode: "play" });
    useToastStore.getState().clearAll();
    useUndoStore.getState().clear(doc.id);
  });

  it("shows localized counts, units, and exact dawn cadence without opaque ids", () => {
    const { container } = renderInventory();
    const itemName = srd("magic-item", ITEM_ID, "name", "en");
    const firstName = i18n.t("magicItems.resourceCopy", {
      name: itemName,
      number: 1,
    });
    const secondName = i18n.t("magicItems.resourceCopy", {
      name: itemName,
      number: 2,
    });

    const first = articleFor(firstName);
    const second = articleFor(secondName);
    fireEvent.click(
      within(first).getByRole("button", {
        name: `${i18n.t("common.expand")}: ${firstName}`,
      })
    );

    expect(first).toHaveTextContent("Charges");
    expect(first).toHaveTextContent("2 / 7 charges");
    expect(first).toHaveTextContent("Resource recovery");
    expect(first).toHaveTextContent("at dawn");
    expect(second).toHaveTextContent("6 / 7");
    expect(container).not.toHaveTextContent("/LR");
    expect(container).not.toHaveTextContent(COPY_A);
    expect(container).not.toHaveTextContent(COPY_B);
  });

  it("spends only the addressed copy through the command cycle, then undoes and redoes", async () => {
    renderInventory();
    const itemName = srd("magic-item", ITEM_ID, "name", "en");
    const firstName = i18n.t("magicItems.resourceCopy", {
      name: itemName,
      number: 1,
    });

    fireEvent.click(within(articleFor(firstName)).getByRole("button", { name: "Use" }));

    await waitFor(() =>
      expect(
        useCharacterStore.getState().character?.session.itemResources?.[COPY_A]?.resources
          .charges?.current
      ).toBe(1)
    );
    expect(
      useCharacterStore.getState().character?.session.itemResources?.[COPY_B]?.resources
        .charges?.current
    ).toBe(6);
    expect(useUndoStore.getState().past).toHaveLength(1);

    act(() => {
      expect(useUndoStore.getState().undo()).toBe(true);
    });
    expect(
      useCharacterStore.getState().character?.session.itemResources?.[COPY_A]?.resources
        .charges?.current
    ).toBe(2);
    expect(
      useCharacterStore.getState().character?.session.itemResources?.[COPY_B]?.resources
        .charges?.current
    ).toBe(6);

    act(() => {
      expect(useUndoStore.getState().redo()).toBe(true);
    });
    expect(
      useCharacterStore.getState().character?.session.itemResources?.[COPY_A]?.resources
        .charges?.current
    ).toBe(1);
    expect(
      useCharacterStore.getState().character?.session.itemResources?.[COPY_B]?.resources
        .charges?.current
    ).toBe(6);
  });

  it("localizes the same typed facts in Italian", async () => {
    await i18n.changeLanguage("it");
    renderInventory();
    const itemName = srd("magic-item", ITEM_ID, "name", "it");
    const firstName = i18n.t("magicItems.resourceCopy", {
      name: itemName,
      number: 1,
    });
    const first = articleFor(firstName);
    fireEvent.click(
      within(first).getByRole("button", {
        name: `${i18n.t("common.expand")}: ${firstName}`,
      })
    );

    expect(first).toHaveTextContent("Cariche");
    expect(first).toHaveTextContent("2 / 7 cariche");
    expect(first).toHaveTextContent("Recupero risorsa");
    expect(first).toHaveTextContent("all'alba");
  });

  it("presents a disposed copy as unavailable without a spend control", () => {
    const doc = character();
    const firstState = doc.session.itemResources?.[COPY_A];
    if (!firstState) throw new Error("first resource state missing");
    firstState.disposition = "destroyed";
    useCharacterStore.setState({ character: doc });

    renderInventory();
    const itemName = srd("magic-item", ITEM_ID, "name", "en");
    const firstName = i18n.t("magicItems.resourceCopy", {
      name: itemName,
      number: 1,
    });
    const secondName = i18n.t("magicItems.resourceCopy", {
      name: itemName,
      number: 2,
    });

    const first = articleFor(firstName);
    expect(first).toHaveTextContent("Resource unavailable");
    expect(within(first).queryByRole("button", { name: "Use" })).toBeNull();
    expect(
      within(articleFor(secondName)).getByRole("button", { name: "Use" })
    ).toBeEnabled();
  });
});
