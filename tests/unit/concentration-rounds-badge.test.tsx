/**
 * Phase 2 step 1 — the concentration badge (turn meter) and the rail's
 * concentration pill show the rounds left on what Concentration holds, read
 * through the status view. Bless lit on yourself counts down; Bless held only
 * for allies has no countdown on this sheet, so no number is shown.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
vi.mock("@/lib/firebase", () => ({}));
import { ThisTurnTracker } from "@/features/character/center/ThisTurnTracker";
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { ResourceRail } from "@/features/character/molecules/ResourceRail";
import { buildDevScenario } from "@/lib/dev-scenarios";
import { concentrationValue } from "@/lib/concentration";
import { getSpellById } from "@/data/spells";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";

/** Bless's declared round cap, read from the catalogue it checks. */
function blessRounds(): number {
  for (const grant of getSpellById("bless")?.grants ?? []) {
    if (grant.type === "while-active" && grant.duration?.maxRounds !== undefined) {
      return grant.duration.maxRounds;
    }
  }
  throw new Error("Bless declares no round cap");
}

function concentrateOnBless(litOnSelf: boolean): void {
  const doc = buildDevScenario("scn-life-cleric");
  if (!doc) throw new Error("missing scenario");
  useCharacterStore.setState({ character: doc, loading: false, error: null });
  const store = useCharacterStore.getState();
  store.setConcentration(concentrationValue("bless"), { undoable: false, silent: true });
  if (litOnSelf) store.setActiveFeature("spell-bless", true);
}

function mountMeter(): void {
  render(
    <MemoryRouter>
      <TurnEconomyProvider>
        <ThisTurnTracker attackRollState="none" />
      </TurnEconomyProvider>
    </MemoryRouter>
  );
}

function badge(): HTMLElement {
  const el = document.querySelector<HTMLElement>(
    '.status-badge[data-kind="concentration"]'
  );
  if (!el) throw new Error("no concentration badge");
  return el;
}

describe("concentration rounds", () => {
  beforeEach(() => {
    useCombatStore.setState({ round: 1 });
    useCharacterStore.setState({ character: null, loading: false, error: null });
  });

  it("the meter badge counts down the Bless you lit on yourself", () => {
    concentrateOnBless(true);
    mountMeter();
    const rounds = blessRounds();
    expect(badge().querySelector(".sb-count")?.textContent).toBe(
      `${rounds}${rounds} rounds left`
    );
    fireEvent.click(badge());
    expect(screen.getByRole("dialog").textContent).toContain(`${rounds} rounds left`);
  });

  it("the meter badge shows no number while Bless is only on allies", () => {
    concentrateOnBless(false);
    mountMeter();
    expect(badge().querySelector(".sb-count")).toBeNull();
  });

  it("the rail's concentration pill shows the same rounds", () => {
    concentrateOnBless(true);
    render(
      <MemoryRouter>
        <ResourceRail />
      </MemoryRouter>
    );
    expect(document.querySelector(".conc-pill .conc-rounds")?.textContent).toBe(
      `${blessRounds()} rounds left`
    );
  });
});
