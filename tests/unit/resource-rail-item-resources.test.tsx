import { act } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { srd } from "../_harness/loc";
import i18n from "@/i18n";
import { ItemResourceCommandProvider } from "@/features/character/center/ItemResourceCommandProvider";
import { ItemResourceRailRow } from "@/features/character/molecules/ItemResourceRailRow";
import { ResourceRail } from "@/features/character/molecules/ResourceRail";
import { MOCK_CHARACTER } from "@/lib/mock";
import { makeItemResourceIdentity } from "@/lib/resources";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useToastStore } from "@/stores/toastStore";
import { useUIStore } from "@/stores/uiStore";
import { useUndoStore } from "@/stores/undoStore";
import type { ItemResourceVM } from "@/lib/views/item-resource-view";
import type { CharacterDoc, ItemResourceState } from "@/types/character";
import { customInstanceId } from "./__helpers__/custom-items";

const ITEM_ID = "wand-of-magic-missiles";
const COPY_A = "rail-wand-a";
const COPY_B = "rail-wand-b";

function state(
  instanceId: string,
  current: number,
  overrides: Partial<ItemResourceState> = {}
): ItemResourceState {
  return {
    itemId: ITEM_ID,
    instanceId,
    revision: 0,
    resources: { charges: { capacity: 7, current, disabled: false } },
    disposition: "magical",
    causalHead: null,
    ...overrides,
  };
}

function character(): CharacterDoc {
  const doc = structuredClone(MOCK_CHARACTER);
  doc.character.weapons = [];
  doc.character.spellSlots = [];
  doc.character.features = [
    {
      custom: true,
      title: "Legacy duplicate fixture",
      emoji: "",
      source: "Test",
      tags: [],
      contentBlocks: [],
      trackers: [
        {
          id: ITEM_ID,
          label: "Legacy Wand Pool",
          total: "7",
          recovery: "long-rest",
          isPool: true,
        },
      ],
      instanceId: customInstanceId("Legacy duplicate fixture"),
    },
  ];
  doc.character.equipment = [
    { srdId: ITEM_ID, instanceId: COPY_A, equipped: true, quantity: 1 },
    { srdId: ITEM_ID, instanceId: COPY_B, equipped: true, quantity: 1 },
  ];
  doc.session.trackers = { [ITEM_ID]: { used: 4 } };
  doc.session.spellSlots = {};
  doc.session.itemResources = {
    [COPY_A]: state(COPY_A, 2),
    [COPY_B]: state(COPY_B, 6),
  };
  return doc;
}

function renderRail() {
  return render(
    <ItemResourceCommandProvider>
      <MemoryRouter>
        <ResourceRail />
      </MemoryRouter>
    </ItemResourceCommandProvider>
  );
}

function rowFor(label: string): HTMLElement {
  const row = screen.getByText(label).closest(".trk");
  if (!row) throw new Error(`No resource row for ${label}`);
  return row as HTMLElement;
}

function copyLabel(locale: "en" | "it", number: number): string {
  return i18n.t("magicItems.resourceCopy", {
    name: srd("magic-item", ITEM_ID, "name", locale),
    number,
  });
}

function resourceRowLabel(locale: "en" | "it", number: number): string {
  return `${copyLabel(locale, number)} · ${i18n.t("equipment.charges")}`;
}

describe("ResourceRail typed physical-item resources", () => {
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
    useCombatStore.getState().endCombat();
    useToastStore.getState().clearAll();
    useUndoStore.getState().clear(doc.id);
  });

  it("renders one exact row per copy with count, unit, and dawn—not a legacy row", () => {
    const { container } = renderRail();
    const first = rowFor(resourceRowLabel("en", 1));
    const second = rowFor(resourceRowLabel("en", 2));

    expect(within(first).getByLabelText("Charges: 2 / 7 charges")).toBeVisible();
    expect(within(second).getByLabelText("Charges: 6 / 7 charges")).toBeVisible();
    expect(within(first).getByText("at dawn")).toBeVisible();
    expect(within(second).getByText("at dawn")).toBeVisible();
    expect(first).not.toHaveTextContent("/LR");
    expect(second).not.toHaveTextContent("/LR");
    expect(screen.queryByText("Legacy Wand Pool")).toBeNull();
    expect(screen.queryByText(srd("magic-item", ITEM_ID, "name", "en"))).toBeNull();
    expect(container).not.toHaveTextContent(COPY_A);
    expect(container).not.toHaveTextContent(COPY_B);
  });

  it("spends only the addressed copy, then fact-preservingly undoes and redoes", async () => {
    renderRail();
    const firstLabel = resourceRowLabel("en", 1);
    fireEvent.click(
      within(rowFor(firstLabel)).getByRole("button", {
        name: i18n.t("magicItems.useResource", { resource: firstLabel }),
      })
    );

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

    act(() => {
      expect(useUndoStore.getState().undo()).toBe(true);
    });
    expect(
      useCharacterStore.getState().character?.session.itemResources?.[COPY_A]?.resources
        .charges?.current
    ).toBe(2);

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

  it("keeps disposed and disabled rows legible but removes their spend controls", () => {
    const doc = character();
    doc.session.itemResources = {
      [COPY_A]: state(COPY_A, 0, { disposition: "destroyed" }),
      [COPY_B]: state(COPY_B, 3, {
        resources: { charges: { capacity: 7, current: 3, disabled: true } },
      }),
    };
    useCharacterStore.setState({ character: doc });
    renderRail();

    const first = rowFor(resourceRowLabel("en", 1));
    const second = rowFor(resourceRowLabel("en", 2));
    expect(within(first).getByText("Resource unavailable")).toBeVisible();
    expect(within(second).getByText("Resource unavailable")).toBeVisible();
    expect(within(first).queryByRole("button", { name: /Use/ })).toBeNull();
    expect(within(second).queryByRole("button", { name: /Use/ })).toBeNull();
  });

  it("is a pure readout on a read-only sheet", () => {
    useCharacterStore.setState({ readonly: true });
    renderRail();
    const first = rowFor(resourceRowLabel("en", 1));
    expect(within(first).getByLabelText("Charges: 2 / 7 charges")).toBeVisible();
    expect(within(first).queryByRole("button", { name: /Use/ })).toBeNull();
  });

  it("localizes copy, resource, unit, and exact cadence in Italian", async () => {
    await i18n.changeLanguage("it");
    renderRail();
    const row = rowFor(resourceRowLabel("it", 1));
    expect(row).toHaveTextContent("Copia 1");
    expect(within(row).getByLabelText("Cariche: 2 / 7 cariche")).toBeVisible();
    expect(within(row).getByText("all'alba")).toBeVisible();
  });

  it("renders an uninitialized counter as roll-required without leaking identity", () => {
    const resource: ItemResourceVM = {
      identity: makeItemResourceIdentity("test-item", "hidden-copy", "rounds"),
      labelKey: "magicItems.resourceLabelRounds",
      unitKey: "units.rounds",
      current: null,
      capacity: 7,
      recoveryTriggers: [{ kind: "dusk" }],
      copyNumber: null,
      available: true,
      disabled: false,
      canSpend: true,
    };
    const { container } = render(
      <ItemResourceRailRow
        resource={resource}
        itemLabel="Test Hourglass"
        interactive={false}
      />
    );

    expect(screen.getByText("Test Hourglass · Rounds")).toBeVisible();
    expect(screen.getByText("Roll required")).toBeVisible();
    expect(screen.getByText("at dusk")).toBeVisible();
    expect(container).not.toHaveTextContent("hidden-copy");
  });
});
