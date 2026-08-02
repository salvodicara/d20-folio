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
  EncounterAddMonsterBody,
  EncounterAddMonsterModal,
  EncounterStatblockModal,
} from "@/features/campaigns/encounter-bestiary";
import { ModalShell } from "@/components/shared/ModalShell";
import { makeEncounterMonsterSpec } from "@/features/campaigns/encounter-monster-spec";
import { localizeSrd } from "@/i18n/resolver";
import { monsterXp } from "@/lib/monster";
import { fmtXp } from "@/lib/utils";
import type { EncounterBudgetView } from "@/features/campaigns/encounter-view";

/** A blank budget view — enough for the modal render tests (the readout's own state
 *  matrix is exercised in party-encounter.test.tsx). */
const BLANK_BUDGET: EncounterBudgetView = {
  budget: null,
  pendingPcs: 0,
  partySize: 0,
  costedXp: 0,
  uncostedGroups: 0,
  verdict: null,
};

beforeAll(async () => {
  if (i18n.language !== "en") await i18n.changeLanguage("en");
  await ensureSrdKind("monster");
});

describe("EncounterAddMonsterModal — Bestiary + Custom tabs (§A.2)", () => {
  it("opens on the Bestiary tab with the overridden tab labels + the monster picker", () => {
    render(
      <EncounterAddMonsterModal onAdd={vi.fn()} budget={BLANK_BUDGET} onClose={vi.fn()} />
    );
    // The tab labels are overridden (Bestiary, not "SRD Database").
    expect(screen.getByRole("button", { name: "Bestiary" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Custom monster" })).toBeTruthy();
    // The picker's monster search placeholder proves the Bestiary tab mounted.
    expect(screen.getByPlaceholderText(/search monsters/i)).toBeTruthy();
  });

  it("the Custom tab mounts the custom-monster library (opens on the create form when empty)", () => {
    render(
      <EncounterAddMonsterModal onAdd={vi.fn()} budget={BLANK_BUDGET} onClose={vi.fn()} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Custom monster" }));
    // An empty library opens directly on the create form (a blank list is a dead end).
    expect(screen.getByLabelText("Monster name")).toBeTruthy();
  });

  it("mounts the DM budget readout strip, ticking to the passed costed total (§D.1)", () => {
    render(
      <EncounterAddMonsterModal
        onAdd={vi.fn()}
        budget={{ ...BLANK_BUDGET, costedXp: 350 }}
        onClose={vi.fn()}
      />
    );
    // The readout's costed-XP run reflects the prop (SRD Step 3 deduct-as-you-add).
    expect(
      screen.getByText(
        i18n.getFixedT("en")("campaignHub.encounterBudgetXp", { xp: fmtXp(350, "en") })
      )
    ).toBeTruthy();
  });
});

describe("EncounterAddMonsterBody — single-mount body (cold-open flash fix)", () => {
  it("renders the tabs + picker WITHOUT its own dialog shell, so the caller's lifted shell is the only dialog", () => {
    // The body owns no ModalShell: `Party` renders ONE shell above the Suspense
    // boundary, so the dialog mounts once and only the body swaps in (no shell
    // tear-down + remount, no cold-open die flash).
    const { unmount } = render(
      <EncounterAddMonsterBody
        onAdd={vi.fn()}
        budget={BLANK_BUDGET}
        onDetailTitle={vi.fn()}
      />
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Bestiary" })).toBeTruthy();
    expect(screen.getByPlaceholderText(/search monsters/i)).toBeTruthy();
    unmount();
  });

  it("under a single lifted ModalShell there is exactly ONE dialog (mounts once)", () => {
    render(
      <ModalShell open onClose={vi.fn()} title="Add to the encounter">
        <EncounterAddMonsterBody
          onAdd={vi.fn()}
          budget={BLANK_BUDGET}
          onDetailTitle={vi.fn()}
        />
      </ModalShell>
    );
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("reports a null detail-title on tab change, so the caller's shell falls back to the default rubric", () => {
    const onDetailTitle = vi.fn();
    render(
      <EncounterAddMonsterBody
        onAdd={vi.fn()}
        budget={BLANK_BUDGET}
        onDetailTitle={onDetailTitle}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Custom monster" }));
    expect(onDetailTitle).toHaveBeenCalledWith(null);
  });
});

describe("EncounterStatblockModal — DM statblock disclosure (§C.3)", () => {
  it("a real id renders the statblock with the canonical name title + identity line", () => {
    render(
      <EncounterStatblockModal
        srdId="goblin-warrior"
        combatantName="Goblin A"
        combatantId="monster-1"
        onClose={vi.fn()}
      />
    );
    // The ModalShell title is the combatant's user-typed name…
    expect(screen.getByText("Goblin A")).toBeTruthy();
    // …and the card prints the canonical localized statblock name (the dual-title).
    const canonical = localizeSrd("monster", "goblin-warrior", "name", "en");
    expect(screen.getAllByText(new RegExp(canonical, "i")).length).toBeGreaterThan(0);
  });

  it("every scroll region it renders is keyboard-reachable", () => {
    // The statblock is long, read-only prose: a scrollable region with NO
    // focusable child, which a non-pointer user cannot reach to arrow-scroll
    // (axe `scrollable-region-focusable`, serious — it failed the a11y gate in
    // BOTH themes). The SUBJECTS ARE DERIVED from the rendered DOM, not named
    // here: any scroll container this modal grows must carry the tab stop.
    // Blind spot: jsdom computes no layout, so this pins the CONTRACT (a
    // scrolling utility ⇒ focusable), not whether content actually overflows;
    // `tests/e2e/a11y.spec.ts` measures the real page.
    const { baseElement } = render(
      <EncounterStatblockModal
        srdId="goblin-warrior"
        combatantName="Goblin A"
        combatantId="monster-1"
        onClose={vi.fn()}
      />
    );
    const scrollers = [
      ...baseElement.querySelectorAll<HTMLElement>(
        '[class*="overflow-y-auto"], [class*="overflow-auto"]'
      ),
    ];
    expect(scrollers.length, "the modal renders a scroll region").toBeGreaterThan(0);
    expect(
      scrollers
        .filter((el) => el.getAttribute("tabindex") !== "0")
        .map((el) => el.className)
    ).toEqual([]);
  });

  it("a stale/unknown id degrades to the quiet empty state, never throwing", () => {
    expect(() =>
      render(
        <EncounterStatblockModal
          srdId="not-a-monster"
          combatantName="Mysterious Shape"
          combatantId="monster-1"
          onClose={vi.fn()}
        />
      )
    ).not.toThrow();
    expect(
      screen.getByText(i18n.getFixedT("en")("campaignHub.encounterStatblockMissing"))
    ).toBeTruthy();
  });
});

describe("EncounterStatblockModal — lair XP toggle (§D.5)", () => {
  it("renders NO lair toggle for a statblock without xpInLair (goblin-warrior)", () => {
    render(
      <EncounterStatblockModal
        srdId="goblin-warrior"
        combatantName="Goblin A"
        combatantId="monster-1"
        apply={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("renders NO lair toggle when there is no DM apply (a non-writer)", () => {
    render(
      <EncounterStatblockModal
        srdId="aboleth"
        combatantName="The Deep One"
        combatantId="monster-1"
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("an xpInLair statblock + DM apply renders the toggle, checked ⇔ lair XP, both ways", () => {
    const aboleth = getMonster("aboleth");
    if (!aboleth || aboleth.xpInLair == null) throw new Error("aboleth/xpInLair missing");
    const base = monsterXp(aboleth);
    const lair = aboleth.xpInLair;

    // Unchecked while the combatant carries the BASE xp.
    const applyBase = vi.fn();
    const { unmount } = render(
      <EncounterStatblockModal
        srdId="aboleth"
        combatantName="The Deep One"
        combatantId="monster-1"
        currentXp={base}
        apply={applyBase}
        onClose={vi.fn()}
      />
    );
    const toggle = screen.getByRole("switch");
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    // Turning it ON seeds the lair value.
    fireEvent.click(toggle);
    expect(applyBase).toHaveBeenCalledTimes(1);
    const onFn = applyBase.mock.calls[0]?.[0] as (
      e: import("@/types/campaign").EncounterState
    ) => import("@/types/campaign").EncounterState;
    const seed = (xp?: number) => ({
      combatants: [
        {
          kind: "monster" as const,
          id: "monster-1",
          name: "The Deep One",
          ac: 17,
          initiative: null,
          conditions: [],
          maxHp: 150,
          tokens: [150],
          ...(xp != null ? { xp } : {}),
        },
      ],
      round: 1,
      currentCombatantId: null,
      epoch: 1,
      status: "active" as const,
    });
    const afterOn = onFn(seed(base));
    expect(afterOn.combatants[0]?.kind === "monster" && afterOn.combatants[0].xp).toBe(
      lair
    );
    unmount();

    // Checked while the combatant already carries the LAIR xp; toggling OFF restores base.
    const applyLair = vi.fn();
    render(
      <EncounterStatblockModal
        srdId="aboleth"
        combatantName="The Deep One"
        combatantId="monster-1"
        currentXp={lair}
        apply={applyLair}
        onClose={vi.fn()}
      />
    );
    const toggle2 = screen.getByRole("switch");
    expect(toggle2.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(toggle2);
    const offFn = applyLair.mock.calls[0]?.[0] as (
      e: import("@/types/campaign").EncounterState
    ) => import("@/types/campaign").EncounterState;
    const afterOff = offFn(seed(lair));
    expect(afterOff.combatants[0]?.kind === "monster" && afterOff.combatants[0].xp).toBe(
      base
    );
  });
});

describe("makeEncounterMonsterSpec — the derived add-mode spec (§A.6)", () => {
  const t = i18n.getFixedT("en");
  const ctx: PickerCtx = { t, locale: "en", character: null, mode: "add" };

  const noArt = () => undefined;

  it("supportsQuantity + a 20 cap + the encounter add label", () => {
    const spec = makeEncounterMonsterSpec(vi.fn(), t, noArt);
    const goblin = getMonster("goblin-warrior");
    if (!goblin) throw new Error("goblin-warrior missing");
    expect(spec.supportsQuantity).toBe(true);
    expect(spec.quantityMax?.(goblin)).toBe(20);
    expect(spec.addLabel?.(ctx)).toBe(t("campaignHub.encounterAddMonster"));
  });

  it("onAdd maps the statblock + chosen quantity through toMonsterInput (count 3)", () => {
    const onAdd = vi.fn();
    const spec = makeEncounterMonsterSpec(onAdd, t, noArt);
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
        // Part B — the creature type is always seeded (powers the card glyph).
        creatureType: goblin.type,
      })
    );
  });

  it("onAdd defaults quantity to 1 when the picker passes undefined", () => {
    const onAdd = vi.fn();
    const spec = makeEncounterMonsterSpec(onAdd, t, noArt);
    const bear = getMonster("brown-bear");
    if (!bear) throw new Error("brown-bear missing");
    spec.onAdd?.(bear, ctx, undefined);
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ count: 1 }));
  });

  it("copies the DM's SRD portrait override onto the added monster (Part B)", () => {
    const onAdd = vi.fn();
    const art = {
      portraitUrl: "https://x/monster-goblin-warrior.jpeg",
      portraitCrop: { x: 1, y: 2, width: 50, height: 60 },
    };
    const spec = makeEncounterMonsterSpec(onAdd, t, (id) =>
      id === "goblin-warrior" ? art : undefined
    );
    const goblin = getMonster("goblin-warrior");
    if (!goblin) throw new Error("goblin-warrior missing");
    spec.onAdd?.(goblin, ctx, 1);
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        portraitUrl: art.portraitUrl,
        portraitCrop: art.portraitCrop,
      })
    );
  });
});
