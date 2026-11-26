/**
 * The DM's own monster, from «Aggiungi mostri»: «Nuovo mostro» opens the form; saving
 * puts it in the DM's library, first in the list («I tuoi»). Each of the DM's own rows
 * can be edited, or deleted after a confirmation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/i18n/resolver", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/i18n/resolver")>()),
  localizeSrd: (_kind: string, id: string) => id,
}));

import { AddMonstersDialog } from "@/domains/combat/ui/AddMonstersDialog";
import { useLibraryStore } from "@/stores/libraryStore";
import type { CampaignDoc } from "@/types/campaign";

const campaign = {
  id: "camp",
  dmUid: "dm",
  members: ["dm"],
  memberDetails: {},
} as unknown as CampaignDoc;

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
  };
  useLibraryStore.setState({
    loaded: true,
    persist: () => {},
    entries: [
      {
        id: "lib-1",
        kind: "monster",
        savedAt: 1,
        item: { name: "Ash Raider", ac: 13, maxHp: 22 },
      },
    ],
  });
});

const open = () =>
  render(
    <AddMonstersDialog
      campaign={campaign}
      locale="en"
      uid="dm"
      onAdd={() => {}}
      onClose={() => {}}
    />
  );

describe("the DM's own monsters", () => {
  it("«New monster» saves one to the library", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "New monster" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Monster name" }), {
      target: { value: "Bog Hag" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "AC" }), {
      target: { value: "17" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Max HP" }), {
      target: { value: "82" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const names = useLibraryStore
      .getState()
      .entries.map((e) => (e.kind === "monster" ? e.item.name : ""));
    expect(names).toContain("Bog Hag");
  });

  it("an own monster is edited in place", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Edit: Ash Raider" }));
    const ac = screen.getByRole("textbox", { name: "AC" });
    expect(ac).toHaveValue("13");
    fireEvent.change(ac, { target: { value: "15" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const entry = useLibraryStore.getState().entries.find((e) => e.id === "lib-1");
    expect(entry?.kind === "monster" && entry.item.ac).toBe(15);
  });

  it("an own monster is deleted only after the DM confirms", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Delete: Ash Raider" }));
    expect(useLibraryStore.getState().entries).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(useLibraryStore.getState().entries).toHaveLength(0);
  });
});
