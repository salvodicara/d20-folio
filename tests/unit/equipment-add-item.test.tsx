/**
 * Unified Add-Item flow (E14/E15)
 *
 * The Equipment page exposes exactly ONE "Add Item" trigger (BOTH modes — §2.8,
 * loot lands mid-session) which
 * opens the single `AddItemModal` — a three-tab picker (Equipment / Magic Items /
 * Custom) that replaced the old two separate "Add Equipment" + "Add Magic Item"
 * buttons. These tests pin:
 *   1. the equipment page surfaces a single add trigger (no second magic-item one),
 *   2. opening it shows the three tabs,
 *   3. the Magic Items tab renders the magic-item browse body (a known SRD item),
 *   4. the page header migrated to the canonical `<PageHeader>` (`.page-head`).
 *
 * Also covers `AddItemModal` in isolation: each tab renders its embeddable body,
 * confirming the deleted standalone wrappers are not needed.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { srd } from "../_harness/loc";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { InventoryTab } from "@/features/character/center/tabs/InventoryTab";
import { AddItemModal } from "@/components/sheet/AddItemModal";
import { magicItemSpec } from "@/features/compendium/picker/specs/magic-item";
import { SRD_MAGIC_ITEMS } from "@/data/magic-items";
import { useCharacterStore } from "@/stores/characterStore";
import { useUIStore } from "@/stores/uiStore";
import { useToastStore } from "@/stores/toastStore";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CharacterDoc } from "@/types/character";

function load(doc: CharacterDoc = structuredClone(MOCK_CHARACTER)): void {
  useCharacterStore.setState({ character: doc, loading: false, error: null });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <InventoryTab />
    </MemoryRouter>
  );
}

describe("InventoryTab — unified Add Item", () => {
  beforeEach(() => {
    useCharacterStore.setState({ character: null, loading: false, error: null });
    useUIStore.setState({ sheetMode: "play" });
    useToastStore.setState({ toasts: [], timers: {} });
  });
  afterEach(() => {
    useUIStore.setState({ sheetMode: "play" });
    vi.restoreAllMocks();
  });

  it("renders an inline toolbar with search (no page header inside the cockpit tab)", () => {
    load();
    const { container } = renderPage();
    // The tab lives inside the cockpit — there is no standalone page header.
    expect(container.querySelector(".page-head")).toBeNull();
    expect(container.querySelector(".page-title-row")).toBeNull();
    // The inline toolbar exposes the search field.
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
  });

  it("spending a tracker-backed charge debits the SESSION tracker with a 5s undo", () => {
    // §2.6 — one-tap spend, undoable. The wand's pool is the item-id tracker
    // the Play-board cast debits (rule 6), never a parallel ref.charges copy.
    const doc = structuredClone(MOCK_CHARACTER);
    doc.character.equipment.push({
      srdId: "wand-of-web",
      quantity: 1,
      equipped: true,
      attuned: true,
    });
    doc.session.trackers["wand-of-web"] = { used: 2 };
    load(doc);
    renderPage();
    const wandRow = screen.getByText("Wand of Web").closest("article");
    expect(wandRow).not.toBeNull();
    fireEvent.click(within(wandRow as HTMLElement).getByRole("button", { name: "Use" }));
    expect(
      useCharacterStore.getState().character?.session.trackers["wand-of-web"]
    ).toEqual({ used: 3 });
    const toast = useToastStore.getState().toasts.at(-1);
    expect(toast?.onUndo).toBeDefined();
    toast?.onUndo?.();
    expect(
      useCharacterStore.getState().character?.session.trackers["wand-of-web"]
    ).toEqual({ used: 2 });
  });

  it("offers the add trigger in PLAY mode too (Constitution §2.8 — loot lands mid-session)", () => {
    load();
    renderPage();
    expect(screen.getByRole("button", { name: /Add Item/i })).toBeInTheDocument();
  });

  it("exposes exactly ONE add trigger in edit mode (no separate magic-item button)", () => {
    load();
    useUIStore.setState({ sheetMode: "edit" });
    renderPage();
    const addButtons = screen.getAllByRole("button", { name: /Add Item/i });
    expect(addButtons).toHaveLength(1);
    // The old standalone "Add Magic Item(s)" trigger must not exist anymore.
    expect(
      screen.queryByRole("button", { name: /Add Magic Item/i })
    ).not.toBeInTheDocument();
  });

  it("an empty pack teaches + offers Add Item; a fruitless search says so", () => {
    const doc = structuredClone(MOCK_CHARACTER);
    doc.character.weapons = [];
    doc.character.equipment = [];
    load(doc);
    const { unmount } = renderPage();
    expect(screen.getByText("Your pack is empty")).toBeInTheDocument();
    // The empty state carries its own Add Item CTA (plus the toolbar one).
    expect(screen.getAllByRole("button", { name: /Add Item/i }).length).toBeGreaterThan(
      1
    );
    // Nothing carried → no dangling "/ capacity" weight chip (honest blank).
    expect(screen.queryByText(/\/\s*120 lb/)).not.toBeInTheDocument();
    unmount();

    // A search that matches nothing across all sections says so.
    load();
    renderPage();
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "zzz-no-such-item" },
    });
    expect(screen.getByText("No items match your search.")).toBeInTheDocument();
  });

  // D6/D8/D9 — a magic item added from the compendium is stored as an SRD reference,
  // so it resolves to its real catalogue name + description (translatable), not a
  // frozen "custom" copy.
  it("renders an added magic item as a real SRD item (resolved name + description)", () => {
    load();
    const item =
      SRD_MAGIC_ITEMS.find((i) => i.type === "wondrous" && !i.attunement) ??
      SRD_MAGIC_ITEMS[0];
    if (!item) return;
    magicItemSpec.onAdd?.(item, {
      character: useCharacterStore.getState().character,
    } as never);
    renderPage();
    // The card shows the resolved SRD name (proves a reference, not a blank custom copy).
    expect(
      screen.getByText(srd("magic-item", item.id, "name", "en"))
    ).toBeInTheDocument();
  });

  // Item-representation consistency: a hand-authored ref (the mock potion) and a
  // picker-added ref of the SAME item must render identically — display props
  // (heal formula, consumable tracking) derive from SRD data, not the ref.
  it("renders a potion identically whether it is a minimal mock ref or picker-added", () => {
    load(); // the mock carries a minimal { srdId: "potion-of-healing", quantity: 3 } ref
    const potion = SRD_MAGIC_ITEMS.find((i) => i.id === "potion-of-healing");
    expect(potion).toBeDefined();
    if (!potion) return;
    // Add a SECOND potion-of-healing through the compendium add path.
    magicItemSpec.onAdd?.(potion, {
      character: useCharacterStore.getState().character,
    } as never);
    renderPage();
    // Both rows show the heal verdict (2d4+2) derived from the SRD entry — proving the
    // hand-authored ref and the picker ref converge on the same display.
    expect(screen.getAllByText(/2d4\+2/).length).toBeGreaterThanOrEqual(2);
  });

  // D6 — item weights surface on the expanded rows (computed from SRD data).
  it("shows the item weight in an expanded weapon's facts", () => {
    load();
    renderPage();
    // Expand the Rapier row (SRD weight 2 lb) and assert the weight fact is on its card.
    fireEvent.click(screen.getByRole("button", { name: /Expand: Rapier/i }));
    const rapierCard = screen.getByText("Rapier").closest("article.uc");
    expect(rapierCard).not.toBeNull();
    expect(within(rapierCard as HTMLElement).getByText("Weight")).toBeInTheDocument();
    expect(within(rapierCard as HTMLElement).getByText(/2 lb/)).toBeInTheDocument();
  });

  // D6 regression — an INERT gear row (no charges, no potion formula) must STILL
  // show its weight on expansion. The facts grid was previously gated behind
  // charges/potionFormula, so a plain gear item whose weight feeds the encumbrance
  // sum showed nothing on its card — the "weight feeds the sum but never appears on
  // the row" bug. The mock's Crowbar (SRD weight 5 lb) pins the fix.
  it("shows the weight on an expanded inert gear row (no charges / no formula)", () => {
    load();
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Expand: Crowbar/i }));
    const crowbarCard = screen.getByText("Crowbar").closest("article.uc");
    expect(crowbarCard).not.toBeNull();
    expect(within(crowbarCard as HTMLElement).getByText("Weight")).toBeInTheDocument();
    expect(within(crowbarCard as HTMLElement).getByText(/5 lb/)).toBeInTheDocument();
  });

  it("opens the unified modal with three tabs and the Magic Items tab renders the magic-item body", () => {
    load();
    useUIStore.setState({ sheetMode: "edit" });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Add Item/i }));

    // Three tabs present.
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Equipment" })).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Magic Items" })
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Custom" })).toBeInTheDocument();

    // Switch to Magic Items → the magic-item browse body renders (a known SRD item).
    fireEvent.click(within(dialog).getByRole("button", { name: "Magic Items" }));
    expect(within(dialog).getByText(/Potion of Healing/i)).toBeInTheDocument();
  });
});

describe("AddItemModal — tab bodies", () => {
  beforeEach(() => {
    load();
    useUIStore.setState({ sheetMode: "edit" });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nothing when closed", () => {
    const { container } = render(<AddItemModal open={false} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("defaults to the Equipment tab (SRD equipment search)", () => {
    render(<AddItemModal open onClose={() => {}} />);
    const dialog = screen.getByRole("dialog");
    // The equipment body owns a search input with the equipment placeholder.
    expect(within(dialog).getByPlaceholderText(/Search equipment/i)).toBeInTheDocument();
  });

  it("renders the Magic Items body on the magic tab", () => {
    render(<AddItemModal open onClose={() => {}} />);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Magic Items" }));
    expect(
      within(dialog).getByPlaceholderText(/Search magic items/i)
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/Potion of Healing/i)).toBeInTheDocument();
  });
});
