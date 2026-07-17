/**
 * CombatAlgorithm (folio combat playbook) — D22 UX-elevation pass.
 *
 * Covers the redesigned page: the canonical <PageHeader> (title + edit-only
 * Import-from-JSON action), the play-mode numbered flowchart spine, and the
 * cleaner edit mode (comfortable 40 px reorder/remove targets, per-step
 * grouping, and a confirm gate on the destructive step-removal). Uses
 * MOCK_CHARACTER (Elf Bard 9), whose `combatAlgorithm` already has three steps.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { CombatAlgorithm } from "@/features/character/center/tabs/CombatAlgorithm";
import {
  parseAlgorithmJson,
  serializeAlgorithmSteps,
} from "@/features/character/center/tabs/algorithm-json";
import { ALGO_ICONS } from "@/components/shared/icon-registry";
import { useCharacterStore } from "@/stores/characterStore";
import { useUIStore } from "@/stores/uiStore";
import { useConfirmStore } from "@/stores/confirmStore";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CharacterDoc } from "@/types/character";

function load(doc: CharacterDoc = structuredClone(MOCK_CHARACTER)): void {
  useCharacterStore.setState({ character: doc, loading: false, error: null });
}

/** A doc whose combat algorithm has been emptied (drives the empty state). */
function loadEmpty(): void {
  const doc = structuredClone(MOCK_CHARACTER);
  doc.character.combatAlgorithm = [];
  load(doc);
}

function renderPage() {
  return render(
    <MemoryRouter>
      <CombatAlgorithm />
    </MemoryRouter>
  );
}

describe("CombatAlgorithm", () => {
  beforeEach(() => {
    useCharacterStore.setState({ character: null, loading: false, error: null });
    useUIStore.setState({ sheetMode: "play" });
    useConfirmStore.setState({ open: false, options: null, _resolve: null });
  });
  afterEach(() => {
    useUIStore.setState({ sheetMode: "play" });
    useConfirmStore.setState({ open: false, options: null, _resolve: null });
  });

  it("renders nothing without a character", () => {
    const { container } = renderPage();
    expect(container.firstChild).toBeNull();
  });

  it("renders the section title via the folio .sec-head rubric", () => {
    load();
    renderPage();
    // As a cockpit section the title uses the folio `.sec-head` rubric (diamond +
    // display-italic title + rule), not the retired page-header contract.
    const heading = screen.getByRole("heading", { name: "Combat Algorithm" });
    expect(heading.closest(".sec-head")).not.toBeNull();
  });

  it("shows the empty-state prompt in play mode (no import action)", () => {
    loadEmpty();
    renderPage();
    expect(screen.getByText(/No combat algorithm defined/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Import from JSON" })
    ).not.toBeInTheDocument();
  });

  it("renders the numbered flowchart spine in play mode", () => {
    load();
    renderPage();
    // MOCK_CHARACTER has three steps → medallions 1, 2, 3 + the step titles.
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Battlefield Control")).toBeInTheDocument();
    // Play mode exposes no editing affordances.
    expect(
      screen.queryByRole("button", { name: "Import from JSON" })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Move up" })).not.toBeInTheDocument();
  });

  it("surfaces the Import-from-JSON action only in edit mode", () => {
    load();
    useUIStore.setState({ sheetMode: "edit" });
    renderPage();
    const importBtn = screen.getByRole("button", { name: "Import from JSON" });
    // The action rides the section header (`.sec-head`) rubric row.
    expect(importBtn.closest(".sec-head")).not.toBeNull();
  });

  it("gives reorder/remove controls comfortable (40 px / lg) tap targets in edit mode", () => {
    load();
    useUIStore.setState({ sheetMode: "edit" });
    renderPage();
    // Three steps → three move-up controls; each is an icon-only lg button.
    const moveUps = screen.getAllByRole("button", { name: "Move up" });
    expect(moveUps).toHaveLength(3);
    for (const btn of moveUps) {
      expect(btn.className).toContain("icon-only");
      expect(btn.className).toContain("lg");
    }
    // First step's move-up is disabled (can't go above the top).
    expect(moveUps[0]).toBeDisabled();
  });

  it("reorders steps with the move-down control", () => {
    load();
    useUIStore.setState({ sheetMode: "edit" });
    renderPage();
    const titleInputs = () => screen.getAllByLabelText<HTMLInputElement>("Step title…");
    expect(titleInputs()[0]?.value).toBe("Battlefield Control");
    // Move the first step down one slot.
    const moveDowns = screen.getAllByRole("button", { name: "Move down" });
    const first = moveDowns[0];
    expect(first).toBeDefined();
    if (first) fireEvent.click(first);
    expect(titleInputs()[0]?.value).toBe("Support & Healing");
    expect(titleInputs()[1]?.value).toBe("Battlefield Control");
  });

  it("confirms before removing a step and keeps it on cancel", async () => {
    load();
    useUIStore.setState({ sheetMode: "edit" });
    renderPage();
    const before =
      useCharacterStore.getState().character?.character.combatAlgorithm.length;
    expect(before).toBe(3);

    const removeBtns = screen.getAllByRole("button", { name: "Remove" });
    const stepRemove = removeBtns[0];
    expect(stepRemove).toBeDefined();
    if (stepRemove) fireEvent.click(stepRemove);

    // The promise-confirm dialog is now open.
    await waitFor(() => expect(useConfirmStore.getState().open).toBe(true));
    expect(useConfirmStore.getState().options?.tone).toBe("danger");

    // Cancel → step survives.
    act(() => useConfirmStore.getState().respond(false));
    await waitFor(() => expect(useConfirmStore.getState().open).toBe(false));
    expect(useCharacterStore.getState().character?.character.combatAlgorithm.length).toBe(
      3
    );
  });

  it("removes a step when the confirm is accepted", async () => {
    load();
    useUIStore.setState({ sheetMode: "edit" });
    renderPage();

    const removeBtns = screen.getAllByRole("button", { name: "Remove" });
    const stepRemove = removeBtns[0];
    expect(stepRemove).toBeDefined();
    if (stepRemove) fireEvent.click(stepRemove);

    await waitFor(() => expect(useConfirmStore.getState().open).toBe(true));
    act(() => useConfirmStore.getState().respond(true));

    await waitFor(() =>
      expect(
        useCharacterStore.getState().character?.character.combatAlgorithm.length
      ).toBe(2)
    );
    // The removed step's title is gone from the inputs.
    const remaining = useCharacterStore
      .getState()
      .character?.character.combatAlgorithm.map((s) => s.title);
    expect(remaining).not.toContain("Battlefield Control");
  });

  it("adds a new empty step from the dashed add-step affordance", () => {
    load();
    useUIStore.setState({ sheetMode: "edit" });
    renderPage();
    const addStep = screen.getByRole("button", { name: "Add Step" });
    fireEvent.click(addStep);
    expect(useCharacterStore.getState().character?.character.combatAlgorithm.length).toBe(
      4
    );
  });

  it("groups each step inside an info-card surface in edit mode", () => {
    load();
    useUIStore.setState({ sheetMode: "edit" });
    const { container } = renderPage();
    // One .info-card.algo-card per step → three grouped tiles.
    const cards = container.querySelectorAll(".info-card.algo-card");
    expect(cards).toHaveLength(3);
  });

  it("edits a bullet line inline and persists it", () => {
    load();
    useUIStore.setState({ sheetMode: "edit" });
    renderPage();
    const bulletInputs = screen.getAllByLabelText<HTMLInputElement>("Action or outcome…");
    const firstBullet = bulletInputs[0];
    expect(firstBullet).toBeDefined();
    if (firstBullet) {
      fireEvent.change(firstBullet, { target: { value: "YES → New plan" } });
    }
    const algo = useCharacterStore.getState().character?.character.combatAlgorithm;
    expect(algo?.[0]?.steps[0]?.bullets[0]).toBe("YES → New plan");
  });

  it("opens the JSON import modal PRE-FILLED with the worked example ONLY when the algorithm is empty", () => {
    loadEmpty();
    useUIStore.setState({ sheetMode: "edit" });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Import from JSON" }));
    // Empty algorithm → the box is pre-filled with a realistic, EDITABLE example —
    // not a blank box, and using a user-facing `icon` field, never a type name.
    const textarea = screen.getByLabelText<HTMLTextAreaElement>("Algorithm JSON");
    expect(textarea.value).toContain('"icon"');
    expect(textarea.value).toContain("Help an ally");
    expect(textarea.value).not.toContain("CombatAlgorithmStep");
    // A plain-language hint sits above it, and the reset offers the example back.
    expect(screen.getByText(/each step has an icon, a title/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset to example" })).toBeInTheDocument();
  });

  it("pre-fills the import box with the CURRENT algorithm when one exists (owner directive)", () => {
    load();
    useUIStore.setState({ sheetMode: "edit" });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Import from JSON" }));
    // Existing content → the box shows THAT content in import form, not the example.
    const textarea = screen.getByLabelText<HTMLTextAreaElement>("Algorithm JSON");
    expect(textarea.value).toContain("Battlefield Control");
    expect(textarea.value).toContain('"icon"');
    expect(textarea.value).not.toContain("Help an ally");
    // The hint + reset affordance speak about the CURRENT content, not the example.
    expect(screen.getByText(/your current algorithm/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset to current" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Reset to example" })
    ).not.toBeInTheDocument();
  });

  it("round-trips the pre-filled current content identically through Confirm (no drift)", () => {
    load();
    useUIStore.setState({ sheetMode: "edit" });
    renderPage();
    const before = structuredClone(
      useCharacterStore.getState().character?.character.combatAlgorithm
    );
    fireEvent.click(screen.getByRole("button", { name: "Import from JSON" }));
    // Confirm the untouched prefill — the stored steps must come back IDENTICAL.
    const textarea = screen.getByLabelText("Algorithm JSON");
    const dialog = textarea.closest('[role="dialog"]') ?? document.body;
    fireEvent.click(
      within(dialog as HTMLElement).getByRole("button", { name: "Confirm" })
    );
    expect(useCharacterStore.getState().character?.character.combatAlgorithm).toEqual(
      before
    );
  });

  it("serializeAlgorithmSteps → parseAlgorithmJson is round-trip safe (question/indent variants)", () => {
    // The mock's 3 steps cover question-present, indent-present and bare bullets;
    // add a fully-bare step to pin the optional-field omissions too.
    const steps = [
      ...structuredClone(MOCK_CHARACTER.character.combatAlgorithm),
      { emoji: "melee", title: "Bare", steps: [{ bullets: ["Swing"] }] },
    ];
    const serialized = serializeAlgorithmSteps(steps);
    expect(parseAlgorithmJson(serialized)).toEqual(steps);
    // The serialized form speaks the user-facing import vocabulary (`icon`).
    expect(serialized).toContain('"icon"');
    expect(serialized).not.toContain('"emoji"');
  });

  it("serialize NORMALIZES a legacy stored emoji to its registry id — the editor can never show an emoji", () => {
    // A live doc may still store legacy emoji seeds; the JSON surface speaks ids only.
    const legacy = [
      { emoji: "🎵", title: "Control", steps: [{ bullets: ["Sing"] }] },
      { emoji: "🛡️", title: "Guard", steps: [{ bullets: ["Block"] }] },
      { emoji: "🤷", title: "Unknown", steps: [{ bullets: ["Shrug"] }] },
    ];
    const serialized = serializeAlgorithmSteps(legacy);
    const icons = (JSON.parse(serialized) as { icon: string }[]).map((s) => s.icon);
    expect(icons).toEqual(["control", "defend", "burst"]); // unknown → default id
    const ids = ALGO_ICONS.map((i) => i.id);
    for (const icon of icons) expect(ids).toContain(icon);
    // Belt + braces: no non-ASCII (emoji) anywhere in the emitted icon values.
    for (const icon of icons) expect(icon).toMatch(/^[a-z]+$/);
  });

  it("parse CLAMPS the icon to the registry-id vocabulary (legacy emoji → id, unknown → default)", () => {
    const payload = JSON.stringify([
      { icon: "⚔️", title: "Legacy emoji in", steps: [{ bullets: ["Swing"] }] },
      { emoji: "✨", title: "Legacy emoji field", steps: [{ bullets: ["Cast"] }] },
      { icon: "🦄", title: "Unknown", steps: [{ bullets: ["?"] }] },
      { icon: "support", title: "Already an id", steps: [{ bullets: ["Heal"] }] },
    ]);
    const parsed = parseAlgorithmJson(payload);
    expect(Array.isArray(parsed)).toBe(true);
    if (Array.isArray(parsed)) {
      expect(parsed.map((s) => s.emoji)).toEqual(["melee", "magic", "burst", "support"]);
    }
  });

  it("rejects malformed JSON with a friendly syntax error (item i)", async () => {
    load();
    useUIStore.setState({ sheetMode: "edit" });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Import from JSON" }));
    const textarea = screen.getByLabelText("Algorithm JSON");
    fireEvent.change(textarea, { target: { value: "{ not valid json" } });
    const dialog = textarea.closest('[role="dialog"]') ?? document.body;
    fireEvent.click(
      within(dialog as HTMLElement).getByRole("button", { name: "Confirm" })
    );
    // A friendly why+how-to-fix message (mentions a missing comma/bracket/quote),
    // never a raw parser error or internal field name; the algorithm is untouched.
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/comma|bracket|quotation/i);
    expect(useCharacterStore.getState().character?.character.combatAlgorithm.length).toBe(
      3
    );
  });

  it("explains a wrong SHAPE (valid JSON, wrong fields) in plain language (item i)", async () => {
    load();
    useUIStore.setState({ sheetMode: "edit" });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Import from JSON" }));
    const textarea = screen.getByLabelText("Algorithm JSON");
    // Valid JSON, but a step missing its title + steps list.
    fireEvent.change(textarea, { target: { value: '[{ "icon": "melee" }]' } });
    const dialog = textarea.closest('[role="dialog"]') ?? document.body;
    fireEvent.click(
      within(dialog as HTMLElement).getByRole("button", { name: "Confirm" })
    );
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/icon, a title/i);
  });

  it("imports a valid example via the friendly `icon` alias and replaces the steps", () => {
    load();
    useUIStore.setState({ sheetMode: "edit" });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Import from JSON" }));
    const textarea = screen.getByLabelText("Algorithm JSON");
    // The user-facing `icon` field is accepted and normalized to the stored emoji.
    const payload = JSON.stringify([
      { icon: "magic", title: "Imported Step", steps: [{ bullets: ["Do a thing"] }] },
    ]);
    fireEvent.change(textarea, { target: { value: payload } });
    const dialog = textarea.closest('[role="dialog"]') ?? document.body;
    fireEvent.click(
      within(dialog as HTMLElement).getByRole("button", { name: "Confirm" })
    );
    const algo = useCharacterStore.getState().character?.character.combatAlgorithm;
    expect(algo).toHaveLength(1);
    expect(algo?.[0]?.title).toBe("Imported Step");
    expect(algo?.[0]?.emoji).toBe("magic"); // icon → emoji
  });

  it("still accepts the legacy `emoji` field (export round-trip)", () => {
    load();
    useUIStore.setState({ sheetMode: "edit" });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Import from JSON" }));
    const textarea = screen.getByLabelText("Algorithm JSON");
    const payload = JSON.stringify([
      { emoji: "melee", title: "Legacy Step", steps: [{ bullets: ["Swing"] }] },
    ]);
    fireEvent.change(textarea, { target: { value: payload } });
    const dialog = textarea.closest('[role="dialog"]') ?? document.body;
    fireEvent.click(
      within(dialog as HTMLElement).getByRole("button", { name: "Confirm" })
    );
    const algo = useCharacterStore.getState().character?.character.combatAlgorithm;
    expect(algo?.[0]?.emoji).toBe("melee");
  });
});
