/**
 * encounter-bestiary — the DM's Add-monster modal + the derived add-mode spec.
 * `@/lib/firebase`/`dm-readers` are stubbed (encounter-bestiary → party-encounter →
 * campaign-io → firestore → firebase); `ensureSrdKind("monster")` makes the picker's
 * corpus + `localizeSrd` resolve (the load-before-render gate the real lazy factory awaits).
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import i18n from "@/i18n";
import { ensureSrdKind } from "@/i18n";
import { getMonster } from "@/data/monsters";
import type { PickerCtx } from "@/features/compendium/picker/types";

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/features/campaigns/dm-readers", () => ({
  recomputeDmReadersForChars: vi.fn(() => Promise.resolve()),
}));

import {
  EncounterAddMonsterModal,
  EncounterStatblockModal,
} from "@/features/campaigns/encounter-bestiary";
import { makeEncounterMonsterSpec } from "@/features/campaigns/encounter-monster-spec";
import { localizeSrd } from "@/i18n/resolver";

beforeAll(async () => {
  if (i18n.language !== "en") await i18n.changeLanguage("en");
  await ensureSrdKind("monster");
});

describe("EncounterAddMonsterModal — Bestiary + Custom tabs (§A.2)", () => {
  it("opens on the Bestiary tab with the overridden tab labels + the monster picker", () => {
    render(<EncounterAddMonsterModal onAdd={vi.fn()} onClose={vi.fn()} />);
    // The tab labels are overridden (Bestiary, not "SRD Database").
    expect(screen.getByRole("button", { name: "Bestiary" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Custom monster" })).toBeTruthy();
    // The picker's monster search placeholder proves the Bestiary tab mounted.
    expect(screen.getByPlaceholderText(/search monsters/i)).toBeTruthy();
  });

  it("the Custom tab mounts the manual AddMonsterForm", () => {
    render(<EncounterAddMonsterModal onAdd={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Custom monster" }));
    expect(screen.getByLabelText("Monster name")).toBeTruthy();
  });
});

describe("EncounterStatblockModal — DM statblock disclosure (§C.3)", () => {
  it("a real id renders the statblock with the canonical name title + identity line", () => {
    render(
      <EncounterStatblockModal
        srdId="goblin-warrior"
        combatantName="Goblin A"
        onClose={vi.fn()}
      />
    );
    // The ModalShell title is the combatant's user-typed name…
    expect(screen.getByText("Goblin A")).toBeTruthy();
    // …and the card prints the canonical localized statblock name (the dual-title).
    const canonical = localizeSrd("monster", "goblin-warrior", "name", "en");
    expect(screen.getAllByText(new RegExp(canonical, "i")).length).toBeGreaterThan(0);
  });

  it("a stale/unknown id degrades to the quiet empty state, never throwing", () => {
    expect(() =>
      render(
        <EncounterStatblockModal
          srdId="not-a-monster"
          combatantName="Mysterious Shape"
          onClose={vi.fn()}
        />
      )
    ).not.toThrow();
    expect(
      screen.getByText(i18n.getFixedT("en")("campaignHub.encounterStatblockMissing"))
    ).toBeTruthy();
  });
});

describe("makeEncounterMonsterSpec — the derived add-mode spec (§A.6)", () => {
  const t = i18n.getFixedT("en");
  const ctx: PickerCtx = { t, locale: "en", character: null, mode: "add" };

  it("supportsQuantity + a 20 cap + the encounter add label", () => {
    const spec = makeEncounterMonsterSpec(vi.fn(), t);
    const goblin = getMonster("goblin-warrior");
    if (!goblin) throw new Error("goblin-warrior missing");
    expect(spec.supportsQuantity).toBe(true);
    expect(spec.quantityMax?.(goblin)).toBe(20);
    expect(spec.addLabel?.(ctx)).toBe(t("campaignHub.encounterAddMonster"));
  });

  it("onAdd maps the statblock + chosen quantity through toMonsterInput (count 3)", () => {
    const onAdd = vi.fn();
    const spec = makeEncounterMonsterSpec(onAdd, t);
    const goblin = getMonster("goblin-warrior");
    if (!goblin) throw new Error("goblin-warrior missing");
    spec.onAdd?.(goblin, ctx, 3);
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        srdId: "goblin-warrior",
        count: 3,
        initiative: null,
        ac: goblin.ac,
        maxHp: goblin.hp.average,
      })
    );
  });

  it("onAdd defaults quantity to 1 when the picker passes undefined", () => {
    const onAdd = vi.fn();
    const spec = makeEncounterMonsterSpec(onAdd, t);
    const bear = getMonster("brown-bear");
    if (!bear) throw new Error("brown-bear missing");
    spec.onAdd?.(bear, ctx, undefined);
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ count: 1 }));
  });
});
