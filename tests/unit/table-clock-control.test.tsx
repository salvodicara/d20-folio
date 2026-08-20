import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({}));

import { ItemResourceCommandProvider } from "@/features/character/center/ItemResourceCommandProvider";
import { TableClockControl } from "@/features/character/molecules/TableClockControl";
import i18n from "@/i18n";
import { MOCK_CHARACTER } from "@/lib/mock";
import { availableTableClockBoundaries } from "@/lib/views/item-resource-boundary-view";
import { useCharacterStore } from "@/stores/characterStore";
import { useToastStore } from "@/stores/toastStore";
import { useUndoStore } from "@/stores/undoStore";
import type { CharacterDoc, ItemResourceState } from "@/types/character";

const itemId = "winged-boots";
const firstId = "table-clock-boots-one";
const secondId = "table-clock-boots-two";

function resourceState(instanceId: string, current = 1): ItemResourceState {
  return {
    itemId,
    instanceId,
    revision: 0,
    resources: { charges: { capacity: 4, current, disabled: false } },
    disposition: "magical",
    causalHead: null,
  };
}

function character(instanceIds = [firstId], current = 1): CharacterDoc {
  const doc = structuredClone(MOCK_CHARACTER);
  doc.character.equipment = instanceIds.map((instanceId) => ({
    srdId: itemId,
    instanceId,
    quantity: 1,
    equipped: true,
    attuned: true,
  }));
  doc.session.itemResources = Object.fromEntries(
    instanceIds.map((instanceId) => [instanceId, resourceState(instanceId, current)])
  );
  return doc;
}

function current(instanceId: string): number | undefined {
  return useCharacterStore.getState().character?.session.itemResources?.[instanceId]
    ?.resources.charges?.current;
}

function mount() {
  return render(
    <ItemResourceCommandProvider>
      <TableClockControl />
    </ItemResourceCommandProvider>
  );
}

async function declareDawn() {
  fireEvent.click(screen.getByRole("button", { name: "Table clock" }));
  const dawn = await screen.findByRole("button", { name: "Declare dawn" });
  fireEvent.click(dawn);
  return dawn;
}

async function answerRecovery(value: number) {
  const input = await screen.findByRole("spinbutton", { name: /amount recovered/i });
  fireEvent.change(input, { target: { value: String(value) } });
  fireEvent.click(screen.getByRole("button", { name: /continue/i }));
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
  useUndoStore.getState().clear();
  useToastStore.getState().clearAll();
  useCharacterStore.setState({
    character: character(),
    readonly: false,
    loading: false,
    error: null,
    parentPersistenceFlush: null,
  });
});

describe("TableClockControl", () => {
  it("derives only exact dawn/dusk boundaries with a recoverable typed resource", () => {
    const doc = structuredClone(MOCK_CHARACTER);
    const instanceId = "exact-table-clock-copy";
    const catalogueItem = {
      id: "exact-table-clock-item",
      resources: [
        {
          kind: "counter" as const,
          id: "sun",
          unit: "charges" as const,
          capacity: { kind: "fixed" as const, amount: 5 },
          initial: { kind: "full" as const },
          recoveries: [
            {
              trigger: { kind: "dawn" as const },
              amount: { kind: "fixed" as const, amount: 1 },
            },
          ],
        },
        {
          kind: "counter" as const,
          id: "moon",
          unit: "charges" as const,
          capacity: { kind: "fixed" as const, amount: 5 },
          initial: { kind: "full" as const },
          recoveries: [
            {
              trigger: { kind: "dusk" as const },
              amount: { kind: "fixed" as const, amount: 1 },
            },
          ],
        },
        {
          kind: "counter" as const,
          id: "rest",
          unit: "charges" as const,
          capacity: { kind: "fixed" as const, amount: 5 },
          initial: { kind: "full" as const },
          recoveries: [
            {
              trigger: { kind: "long-rest" as const },
              amount: { kind: "full" as const },
            },
          ],
        },
      ],
    };
    const catalogue = [catalogueItem];
    doc.character.equipment = [{ srdId: catalogueItem.id, instanceId, quantity: 1 }];
    doc.session.itemResources = {
      [instanceId]: {
        itemId: catalogueItem.id,
        instanceId,
        revision: 0,
        resources: {
          sun: { capacity: 5, current: 1, disabled: false },
          moon: { capacity: 5, current: 1, disabled: false },
          rest: { capacity: 5, current: 1, disabled: false },
        },
        disposition: "magical",
        causalHead: null,
      },
    };

    expect(availableTableClockBoundaries(doc, catalogue)).toEqual(["dawn", "dusk"]);
    for (const counter of Object.values(
      doc.session.itemResources[instanceId]?.resources ?? {}
    )) {
      counter.current = counter.capacity;
    }
    expect(availableTableClockBoundaries(doc, catalogue)).toEqual([]);
  });

  it("commits one boundary entry, then causally undoes and fact-preserving redoes it", async () => {
    mount();
    await declareDawn();
    await answerRecovery(2);

    await waitFor(() => expect(current(firstId)).toBe(3));
    expect(useUndoStore.getState().past).toHaveLength(1);

    act(() => void useUndoStore.getState().undo());
    expect(current(firstId)).toBe(1);

    // A new eligible copy after the undo is not part of the original declaration.
    const live = useCharacterStore.getState().character;
    if (!live) throw new Error("missing character");
    useCharacterStore.setState({
      character: {
        ...live,
        character: {
          ...live.character,
          equipment: [
            ...live.character.equipment,
            {
              srdId: itemId,
              instanceId: secondId,
              quantity: 1,
              equipped: true,
              attuned: true,
            },
          ],
        },
        session: {
          ...live.session,
          itemResources: {
            ...live.session.itemResources,
            [secondId]: resourceState(secondId),
          },
        },
      },
    });

    act(() => void useUndoStore.getState().redo());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(current(firstId)).toBe(3);
    expect(current(secondId)).toBe(1);
    expect(useUndoStore.getState().past).toHaveLength(1);
    expect(useUndoStore.getState().future).toHaveLength(0);
  });

  it("preflights every copy before mutation and ignores a repeated in-flight click", async () => {
    useCharacterStore.setState({ character: character([firstId, secondId]) });
    mount();
    const dawn = await declareDawn();
    fireEvent.click(dawn);

    await screen.findByRole("dialog", { name: /Winged Boots · Copy 1/i });
    await answerRecovery(2);
    await screen.findByRole("dialog", { name: /Winged Boots · Copy 2/i });

    expect(current(firstId)).toBe(1);
    expect(current(secondId)).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(current(firstId)).toBe(1);
    expect(current(secondId)).toBe(1);
    expect(useUndoStore.getState().past).toHaveLength(0);
  });

  it("hides when every matching resource is full or the sheet is read-only", () => {
    useCharacterStore.setState({ character: character([firstId], 4) });
    const { rerender } = mount();
    expect(screen.queryByRole("button", { name: "Table clock" })).toBeNull();

    useCharacterStore.setState({ character: character(), readonly: true });
    rerender(
      <ItemResourceCommandProvider>
        <TableClockControl />
      </ItemResourceCommandProvider>
    );
    expect(screen.queryByRole("button", { name: "Table clock" })).toBeNull();
  });
});
