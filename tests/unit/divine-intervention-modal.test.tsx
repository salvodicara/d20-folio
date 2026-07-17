/**
 * DivineInterventionModal (D4) — the guided spell picker for Cleric Divine
 * Intervention. Renders the engine-resolved pool (Cleric spells ≤ 5th) as a
 * searchable, level-grouped list; selecting a spell reports it to the parent (which
 * casts it without a slot + debits the 1/LR tracker). Thin render test of the WIRING
 * (the component reflects the pool + emits the chosen spell id); the pool itself is
 * pinned by `free-cast-from-list.test.ts` (the engine resolver).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { DivineInterventionModal } from "@/components/sheet/DivineInterventionModal";
import type { FreeCastFromListPool } from "@/lib/smart-tracker";

const pool: FreeCastFromListPool = {
  sourceId: "cleric-divine-intervention",
  trackerId: "cleric-divine-intervention",
  // A representative ≤5th Cleric subset (the real pool is engine-resolved + tested).
  spellIds: ["cure-wounds", "revivify", "guiding-bolt"],
  maxSpellLevel: 5,
  rest: "long",
  charges: 1,
  remaining: 1,
  // Feature pools are uniform 1-cost (a use IS a use).
  costBySpell: { "cure-wounds": 1, revivify: 1, "guiding-bolt": 1 },
};

describe("DivineInterventionModal", () => {
  it("renders nothing without a pool", () => {
    const { container } = render(
      <DivineInterventionModal
        pool={null}
        locale="en"
        onCast={() => {}}
        onCancel={() => {}}
      />
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("is an accessible dialog listing the eligible spells", () => {
    render(
      <DivineInterventionModal
        pool={pool}
        locale="en"
        onCast={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByRole("dialog")).toHaveAccessibleName(/choose a spell/i);
    // The rubric eyebrow still announces the feature.
    expect(screen.getByText(/divine intervention/i)).toBeInTheDocument();
    expect(screen.getByText("Cure Wounds")).toBeInTheDocument();
    expect(screen.getByText("Revivify")).toBeInTheDocument();
    expect(screen.getByText("Guiding Bolt")).toBeInTheDocument();
  });

  it("selecting a spell reports its id to the parent (the cast trigger)", () => {
    const onCast = vi.fn();
    render(
      <DivineInterventionModal
        pool={pool}
        locale="en"
        onCast={onCast}
        onCancel={() => {}}
      />
    );
    fireEvent.click(screen.getByText("Cure Wounds"));
    expect(onCast).toHaveBeenCalledWith("cure-wounds");
  });

  it("search filters the list (bilingual anchor on the localized name)", () => {
    render(
      <DivineInterventionModal
        pool={pool}
        locale="en"
        onCast={() => {}}
        onCancel={() => {}}
      />
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByRole("searchbox"), {
      target: { value: "revivify" },
    });
    expect(screen.getByText("Revivify")).toBeInTheDocument();
    expect(screen.queryByText("Cure Wounds")).not.toBeInTheDocument();
  });

  // The same shared picker also serves War God's Blessing (a fixed 2-spell,
  // Channel-Divinity-debiting pool) — its copy is keyed off the pool's sourceId.
  const warPool: FreeCastFromListPool = {
    sourceId: "cleric-war-war-gods-blessing",
    trackerId: "cleric-channel-divinity",
    spellIds: ["shield-of-faith", "spiritual-weapon"],
    maxSpellLevel: 2,
    rest: "short",
    charges: 3,
    remaining: 3,
    costBySpell: { "shield-of-faith": 1, "spiritual-weapon": 1 },
  };

  it("renders the War God's Blessing rubric + its two fixed spells for that pool", () => {
    render(
      <DivineInterventionModal
        pool={warPool}
        locale="en"
        onCast={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByText(/war god's blessing/i)).toBeInTheDocument();
    expect(screen.queryByText(/divine intervention/i)).not.toBeInTheDocument();
    expect(screen.getByText("Shield of Faith")).toBeInTheDocument();
    expect(screen.getByText("Spiritual Weapon")).toBeInTheDocument();
  });

  // S9 — the SAME picker serves the charged multi-spell ITEMS (Wand of Binding).
  // A pool whose sourceId is a magic-item id renders the item rubric + a per-row
  // charge-cost chip, and disables a row the pool can't afford.
  const wandPool: FreeCastFromListPool = {
    sourceId: "wand-of-binding",
    trackerId: "wand-of-binding",
    spellIds: ["hold-person", "hold-monster"],
    maxSpellLevel: 5,
    rest: "long",
    charges: 7,
    remaining: 4, // 4 charges left: Hold Person (2) affordable, Hold Monster (5) not.
    costBySpell: { "hold-person": 2, "hold-monster": 5 },
  };

  it("item pool: renders the item rubric and a per-spell charge-cost chip on each row", () => {
    render(
      <DivineInterventionModal
        pool={wandPool}
        locale="en"
        onCast={() => {}}
        onCancel={() => {}}
      />
    );
    // The rubric is the item name, not a feature name.
    expect(screen.getByText(/wand of binding/i)).toBeInTheDocument();
    expect(screen.queryByText(/divine intervention/i)).not.toBeInTheDocument();
    // Each row carries its cost chip — the numbers reach a pixel.
    expect(screen.getByText("2 ch.")).toBeInTheDocument();
    expect(screen.getByText("5 ch.")).toBeInTheDocument();
  });

  it("item pool: disables a row the pool cannot afford; an affordable row still casts", () => {
    const onCast = vi.fn();
    render(
      <DivineInterventionModal
        pool={wandPool}
        locale="en"
        onCast={onCast}
        onCancel={() => {}}
      />
    );
    // Hold Monster costs 5, only 4 remain → its button is disabled (non-interactive).
    const holdMonsterBtn = screen.getByText("Hold Monster").closest("button");
    expect(holdMonsterBtn).not.toBeNull();
    expect(holdMonsterBtn).toBeDisabled();
    if (holdMonsterBtn) fireEvent.click(holdMonsterBtn);
    expect(onCast).not.toHaveBeenCalled();
    // Hold Person costs 2, affordable → clicking it reports the cast.
    const holdPersonBtn = screen.getByText("Hold Person").closest("button");
    expect(holdPersonBtn).not.toBeNull();
    expect(holdPersonBtn).not.toBeDisabled();
    if (holdPersonBtn) fireEvent.click(holdPersonBtn);
    expect(onCast).toHaveBeenCalledWith("hold-person");
  });
});
