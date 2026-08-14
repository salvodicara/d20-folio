import { useRef } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ItemResourceCommandProvider } from "@/features/character/center/ItemResourceCommandProvider";
import {
  useItemResourceCommands,
  type CommittedItemResourceCommand,
} from "@/features/character/center/useItemResourceCommands";
import { getMagicItem } from "@/data/magic-items";
import { itemResourceSpend } from "@/lib/item-resource-commands";
import {
  makeItemResourceIdentity,
  planResourceCommand,
  type ResourceItemSpec,
} from "@/lib/resources";
import { MOCK_CHARACTER } from "@/lib/mock";
import { useCharacterStore } from "@/stores/characterStore";
import { useToastStore } from "@/stores/toastStore";

const instanceId = "wand-provider-copy";
const identity = makeItemResourceIdentity(
  "wand-of-magic-missiles",
  instanceId,
  "charges"
);
const catalogueItem = getMagicItem(identity.itemId);
if (!catalogueItem?.resources) throw new Error("Wand resource fixture is missing");
const item: ResourceItemSpec = {
  itemId: catalogueItem.id,
  resources: catalogueItem.resources,
};

function character() {
  const doc = structuredClone(MOCK_CHARACTER);
  doc.character.equipment = [
    { srdId: identity.itemId, quantity: 1, instanceId, equipped: true },
  ];
  delete doc.session.itemResources;
  return doc;
}

function Harness({ amount = 1 }: { amount?: number }) {
  const commands = useItemResourceCommands();
  const committed = useRef<CommittedItemResourceCommand | null>(null);
  return (
    <>
      <button
        onClick={() => {
          void commands
            .prepare(itemResourceSpend(identity, amount), "Wand of Magic Missiles")
            .then((prepared) => {
              if (prepared) committed.current = commands.commit(prepared);
            });
        }}
      >
        use resource
      </button>
      <button
        onClick={() => {
          if (committed.current) commands.revert(committed.current);
        }}
      >
        undo resource
      </button>
      <button
        onClick={() => {
          if (committed.current) committed.current = commands.replay(committed.current);
        }}
      >
        redo resource
      </button>
    </>
  );
}

function renderHarness(amount = 1) {
  return render(
    <ItemResourceCommandProvider>
      <Harness amount={amount} />
    </ItemResourceCommandProvider>
  );
}

beforeEach(() => {
  useCharacterStore.setState({
    character: character(),
    readonly: false,
    loading: false,
    error: null,
    parentPersistenceFlush: null,
  });
  useToastStore.getState().clearAll();
});

describe("ItemResourceCommandProvider", () => {
  it("commits one physical copy, then semantically undoes and redoes it", async () => {
    renderHarness();
    fireEvent.click(screen.getByRole("button", { name: "use resource" }));
    await waitFor(() =>
      expect(
        useCharacterStore.getState().character?.session.itemResources?.[instanceId]
          ?.resources.charges?.current
      ).toBe(6)
    );
    expect(
      useCharacterStore.getState().character?.session.itemResources?.[instanceId]
        ?.revision
    ).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "undo resource" }));
    expect(
      useCharacterStore.getState().character?.session.itemResources?.[instanceId]
        ?.resources.charges?.current
    ).toBeUndefined(); // catalogue-full default is restored without duplicating it
    expect(
      useCharacterStore.getState().character?.session.itemResources?.[instanceId]
        ?.revision
    ).toBe(2);

    fireEvent.click(screen.getByRole("button", { name: "redo resource" }));
    expect(
      useCharacterStore.getState().character?.session.itemResources?.[instanceId]
        ?.resources.charges?.current
    ).toBe(6);
    expect(
      useCharacterStore.getState().character?.session.itemResources?.[instanceId]
        ?.revision
    ).toBe(3);
  });

  it("cancelling a last-charge table roll spends nothing", async () => {
    renderHarness(7);
    fireEvent.click(screen.getByRole("button", { name: "use resource" }));
    expect(
      await screen.findByRole("dialog", { name: "Wand of Magic Missiles" })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(useCharacterStore.getState().character?.session.itemResources).toBeUndefined();
  });

  it("applies the entered last-charge d20 consequence and reverses it causally", async () => {
    const initial = planResourceCommand(
      item,
      { srdId: identity.itemId, instanceId },
      undefined,
      {
        kind: "spend",
        occurrenceId: "seed-one-charge",
        expectedRevision: 0,
        resourceId: identity.resourceId,
        amount: 6,
        inputs: {},
      }
    );
    if (initial.status !== "planned") throw new Error("could not seed resource");
    const doc = useCharacterStore.getState().character;
    if (!doc) throw new Error("missing character");
    useCharacterStore.getState().setCharacter({
      ...doc,
      session: {
        ...doc.session,
        itemResources: { [instanceId]: initial.operation.after },
      },
    });

    renderHarness();
    fireEvent.click(screen.getByRole("button", { name: "use resource" }));
    const depletion = await screen.findByRole("spinbutton", {
      name: /last charge/i,
    });
    fireEvent.focus(depletion);
    fireEvent.change(depletion, { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() =>
      expect(
        useCharacterStore.getState().character?.session.itemResources?.[instanceId]
          ?.disposition
      ).toBe("destroyed")
    );

    fireEvent.click(screen.getByRole("button", { name: "undo resource" }));
    expect(
      useCharacterStore.getState().character?.session.itemResources?.[instanceId]
        ?.disposition
    ).toBe("magical");
    expect(
      useCharacterStore.getState().character?.session.itemResources?.[instanceId]
        ?.resources.charges?.current
    ).toBe(1);
  });

  it("freezes the reviewed revision and refuses a concurrent state change", async () => {
    renderHarness(7);
    fireEvent.click(screen.getByRole("button", { name: "use resource" }));
    await screen.findByRole("dialog");

    const competing = planResourceCommand(
      item,
      { srdId: identity.itemId, instanceId },
      undefined,
      {
        kind: "spend",
        occurrenceId: "competing-use",
        expectedRevision: 0,
        resourceId: identity.resourceId,
        amount: 1,
        inputs: {},
      }
    );
    if (competing.status !== "planned") throw new Error("could not plan competitor");
    act(() => {
      expect(
        useCharacterStore
          .getState()
          .applyItemResourceOperation(
            item,
            { srdId: identity.itemId, instanceId },
            competing.operation
          ).status
      ).toBe("applied");
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(
      useCharacterStore.getState().character?.session.itemResources?.[instanceId]
        ?.resources.charges?.current
    ).toBe(6);
  });

  it("refuses a reviewed spend if the exact item becomes inactive while input is open", async () => {
    renderHarness(7);
    fireEvent.click(screen.getByRole("button", { name: "use resource" }));
    await screen.findByRole("dialog");

    const doc = useCharacterStore.getState().character;
    if (!doc) throw new Error("missing character");
    act(() => {
      useCharacterStore.getState().setCharacter({
        ...doc,
        character: {
          ...doc.character,
          equipment: doc.character.equipment.map((entry) =>
            !("custom" in entry) && entry.instanceId === instanceId
              ? { ...entry, equipped: false }
              : entry
          ),
        },
      });
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(useCharacterStore.getState().character?.session.itemResources).toBeUndefined();
  });

  it("allows causal undo after the item is unequipped but refuses redo", async () => {
    renderHarness();
    fireEvent.click(screen.getByRole("button", { name: "use resource" }));
    await waitFor(() =>
      expect(
        useCharacterStore.getState().character?.session.itemResources?.[instanceId]
          ?.resources.charges?.current
      ).toBe(6)
    );

    const doc = useCharacterStore.getState().character;
    if (!doc) throw new Error("missing character");
    act(() => {
      useCharacterStore.getState().setCharacter({
        ...doc,
        character: {
          ...doc.character,
          equipment: doc.character.equipment.map((entry) =>
            !("custom" in entry) && entry.instanceId === instanceId
              ? { ...entry, equipped: false }
              : entry
          ),
        },
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "undo resource" }));
    expect(
      useCharacterStore.getState().character?.session.itemResources?.[instanceId]
        ?.resources.charges?.current
    ).toBeUndefined();
    fireEvent.click(screen.getByRole("button", { name: "redo resource" }));
    expect(
      useCharacterStore.getState().character?.session.itemResources?.[instanceId]
        ?.resources.charges?.current
    ).toBeUndefined();
  });

  it("does not open or mutate on a read-only sheet", async () => {
    useCharacterStore.setState({ readonly: true });
    renderHarness(7);
    fireEvent.click(screen.getByRole("button", { name: "use resource" }));
    await act(async () => Promise.resolve());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(useCharacterStore.getState().character?.session.itemResources).toBeUndefined();
  });
});
