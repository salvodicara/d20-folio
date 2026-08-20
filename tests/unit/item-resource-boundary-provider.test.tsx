import { useRef } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { ItemResourceCommandProvider } from "@/features/character/center/ItemResourceCommandProvider";
import {
  useItemResourceCommands,
  type CommittedItemResourceBoundary,
} from "@/features/character/center/useItemResourceCommands";
import { MOCK_CHARACTER } from "@/lib/mock";
import { useCharacterStore } from "@/stores/characterStore";

const itemId = "wand-of-magic-missiles";
const firstId = "boundary-wand-one";
const secondId = "boundary-wand-two";

function character() {
  const doc = structuredClone(MOCK_CHARACTER);
  doc.character.equipment = [
    { srdId: itemId, instanceId: firstId, equipped: true, quantity: 1 },
    { srdId: itemId, instanceId: secondId, equipped: true, quantity: 1 },
  ];
  doc.session.itemResources = Object.fromEntries(
    [firstId, secondId].map((instanceId) => [
      instanceId,
      {
        itemId,
        instanceId,
        revision: 0,
        resources: { charges: { capacity: 7, current: 1, disabled: false } },
        disposition: "magical" as const,
        causalHead: null,
      },
    ])
  );
  return doc;
}

function current(instanceId: string): number | undefined {
  return useCharacterStore.getState().character?.session.itemResources?.[instanceId]
    ?.resources.charges?.current;
}

function Harness() {
  const commands = useItemResourceCommands();
  const committed = useRef<CommittedItemResourceBoundary | null>(null);
  return (
    <>
      <button
        onClick={() => {
          void commands.prepareBoundary({ kind: "dawn" }).then((prepared) => {
            if (prepared) committed.current = commands.commitBoundary(prepared);
          });
        }}
      >
        mark dawn
      </button>
      <button
        onClick={() => {
          if (committed.current) commands.revertBoundary(committed.current);
        }}
      >
        undo dawn
      </button>
      <button
        onClick={() => {
          if (committed.current) {
            committed.current = commands.replayBoundary(committed.current);
          }
        }}
      >
        redo dawn
      </button>
    </>
  );
}

function mount() {
  render(
    <ItemResourceCommandProvider>
      <Harness />
    </ItemResourceCommandProvider>
  );
}

async function answerCopy(number: number, value: number) {
  const dialog = await screen.findByRole("dialog", {
    name: new RegExp(`Wand of Magic Missiles · Copy ${number}`, "i"),
  });
  const input = screen.getByRole("spinbutton", { name: /amount recovered/i });
  fireEvent.change(input, { target: { value: String(value) } });
  fireEvent.click(screen.getByRole("button", { name: /continue/i }));
  await waitFor(() => expect(dialog).not.toBeInTheDocument());
}

beforeEach(() => {
  useCharacterStore.setState({
    character: character(),
    readonly: false,
    loading: false,
    error: null,
    parentPersistenceFlush: null,
  });
});

describe("item-resource recovery boundary provider", () => {
  it("keeps equal roll kinds separate per physical copy and replays the facts", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "mark dawn" }));
    await answerCopy(1, 2);
    await answerCopy(2, 4);

    await waitFor(() => {
      expect(current(firstId)).toBe(3);
      expect(current(secondId)).toBe(5);
    });

    act(() => screen.getByRole("button", { name: "undo dawn" }).click());
    expect(current(firstId)).toBe(1);
    expect(current(secondId)).toBe(1);

    act(() => screen.getByRole("button", { name: "redo dawn" }).click());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(current(firstId)).toBe(3);
    expect(current(secondId)).toBe(5);
  });

  it("cancelling a later copy leaves the entire boundary untouched", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "mark dawn" }));
    await answerCopy(1, 2);
    await screen.findByRole("dialog", {
      name: /Wand of Magic Missiles · Copy 2/i,
    });
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(current(firstId)).toBe(1);
    expect(current(secondId)).toBe(1);
  });
});
