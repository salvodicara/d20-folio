/**
 * «Al colpo» (board 2b, D5a; BG3's «Choose how to react»): after a weapon hit, the
 * options it can add, each with its icon, cost and «Aggiungi»: Cunning Strike, the
 * weapon's Mastery, a rider with a cost. A tap applies it (undoable) and the row reads
 * «Aggiunto».
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import { useAfterHitStore } from "@/domains/play/after-hit-store";
import { AfterHitNote, PlayAfterHit } from "@/domains/play/ui/PlayAfterHit";
import { useCombatStore } from "@/stores/combatStore";
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { buildScenario } from "@/lib/dev-scenarios";
import { localizeActions } from "@/lib/views/combat-action-view";
import { useCharacterStore } from "@/stores/characterStore";
import { useUndoStore } from "@/stores/undoStore";
import type { CharacterDoc } from "@/types/character";

const SNEAK = "rogue-sneak-attack";

function live(): CharacterDoc {
  const doc = useCharacterStore.getState().character;
  if (!doc) throw new Error("no character");
  return doc;
}

function mount(actionId: (id: string) => boolean) {
  const action = localizeActions(live(), "en").find((a) => actionId(a.id));
  if (!action) throw new Error("no action");
  render(
    <MemoryRouter>
      <TurnEconomyProvider renderPrompts={false}>
        <PlayAfterHit action={action} locale="en" />
      </TurnEconomyProvider>
    </MemoryRouter>
  );
}

describe("PlayAfterHit", () => {
  beforeEach(() => {
    useUndoStore.getState().clear(null);
    const doc = buildScenario({
      name: "Sable",
      raceId: "human",
      classId: "rogue",
      level: 7,
      background: "criminal",
      abilityScores: { STR: 10, DEX: 16, CON: 12, INT: 10, WIS: 12, CHA: 8 },
      weapons: [{ srdId: "dagger", quantity: 1 }],
    });
    doc.session.logEntries = [];
    // A fight is on (round 2): the once-per-turn use is spent, not only logged.
    useCharacterStore.setState({
      character: doc,
      loading: false,
      error: null,
      combatRound: 2,
    });
  });

  it("a weapon attack lists Cunning Strike with its cost; adding one spends Sneak Attack", () => {
    mount((id) => id.includes("dagger"));
    const list = screen.getByRole("group", { name: "On a hit" });
    const poison = within(list).getByRole("button", {
      name: /^Add: Cunning Strike: Poison/,
    });
    expect(list.textContent).toMatch(/Costs 1 Sneak Attack die/);
    fireEvent.click(poison);
    expect(live().session.trackers[SNEAK]?.used ?? 0).toBe(1);
    expect(
      within(list)
        .getByRole("button", { name: /^Added: Cunning Strike: Poison/ })
        .getAttribute("aria-disabled")
    ).toBe("true");
  });

  it("a non-weapon action offers nothing", () => {
    mount((id) => id === "base-dash");
    expect(screen.queryByRole("group", { name: "On a hit" })).toBeNull();
  });

  it("outside a shared fight the note waits under the strip until «Done» or the next round", () => {
    const dagger = localizeActions(live(), "en").find((a) => a.id.includes("dagger"));
    if (!dagger) throw new Error("no dagger");
    const round = useCombatStore.getState().round;
    useAfterHitStore
      .getState()
      .offerFor({ characterId: live().id, actionId: dagger.id, round });
    render(
      <MemoryRouter>
        <TurnEconomyProvider renderPrompts={false}>
          <AfterHitNote locale="en" />
        </TurnEconomyProvider>
      </MemoryRouter>
    );
    expect(screen.getByText(`Did ${dagger.name} hit? Add to the hit:`)).toBeTruthy();
    act(() => useCombatStore.getState().setRound(round + 1));
    expect(screen.queryByRole("group", { name: "On a hit" })).toBeNull();
    act(() => {
      useCombatStore.getState().setRound(round);
    });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(useAfterHitStore.getState().offer).toBeNull();
  });
});
