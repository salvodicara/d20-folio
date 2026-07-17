/**
 * ChoiceRePicker (#45 / U4) — the shared "re-pick a learned set" modal for the
 * RAW-swappable subclass choices (subclass maneuvers, Sorcerer metamagic, …).
 * Proves it commits the chosen ids and caps at the supplied total, using real
 * Sorcerer metamagic data as a representative option set (a PUBLIC catalogue —
 * the maneuver subclass lives in the content pack).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { srd } from "../_harness/loc";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { SRD_METAMAGIC } from "@/data/metamagic";
import { ChoiceRePicker } from "@/features/character/ChoiceRePicker";

const all = SRD_METAMAGIC;
const first = all[0];
if (!first) throw new Error("SRD_METAMAGIC is empty — the picker test needs data");
const options = all.map((m) => ({
  id: m.id,
  label: srd("metamagic", m.id, "name", "en"),
}));

function renderPicker(props: Partial<Parameters<typeof ChoiceRePicker>[0]> = {}) {
  return render(
    <ChoiceRePicker
      open
      onClose={() => {}}
      max={3}
      options={options}
      current={[]}
      onCommit={() => {}}
      eyebrow="Metamagic"
      title="Metamagic Options"
      label="Choose your metamagic options"
      {...props}
    />
  );
}

describe("ChoiceRePicker", () => {
  beforeEach(() => vi.clearAllMocks());

  it("commits the seeded selection on Save", () => {
    const onCommit = vi.fn();
    renderPicker({ current: [first.id], onCommit });
    expect(
      screen.getByText(srd("metamagic", first.id, "name", "en"))
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(onCommit).toHaveBeenCalledWith([first.id]);
  });

  it("adds options up to the supplied max", () => {
    const onCommit = vi.fn();
    renderPicker({ max: 3, current: [], onCommit });
    for (const m of all.slice(0, 3))
      fireEvent.click(screen.getByText(srd("metamagic", m.id, "name", "en")));
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(onCommit).toHaveBeenCalledWith(all.slice(0, 3).map((m) => m.id));
  });

  it("shows the count over the total", () => {
    renderPicker({ max: 5, current: [first.id] });
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/1\s*\/\s*5/)).toBeInTheDocument();
  });

  it("offers the 'More' detail on the SELECTED card only (#32/#33)", () => {
    // detailFor enables the unified seal-card detail affordance (reusing the
    // compendium read view) — on the selected card alone, so a long list
    // stays calm (owner, 2026-06-10: detail-on-selected, never per-row icons).
    renderPicker({
      current: [first.id],
      detailFor: (id) => <div>detail-body-{id}</div>,
      detailTitleFor: (id) => `title-${id}`,
    });
    const more = screen.getAllByRole("button", { name: /^more$/i });
    expect(more).toHaveLength(1);
    const firstMore = more[0];
    if (!firstMore) throw new Error("expected a More button");
    fireEvent.click(firstMore);
    expect(screen.getByText(`detail-body-${first.id}`)).toBeInTheDocument();
  });

  it("omits 'More' when no detailFor (e.g. weapon mastery — plain seal cards)", () => {
    renderPicker({ current: [first.id] });
    expect(screen.queryByRole("button", { name: /^more$/i })).not.toBeInTheDocument();
  });
});
