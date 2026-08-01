/**
 * AttackDeclaration (auto-narrated combat, Phase 1) — the in-encounter target +
 * HIT/MISS capture, and the SOLO-untouched rail.
 *
 * Two layers:
 *  1. the component in isolation — the target chips (visible, non-down monsters only),
 *     the HIT/MISS gate (disabled until a target is picked), the declareAttack write,
 *     and the dismiss (writes nothing);
 *  2. the PlayTab GATE — the panel opens ONLY when the sheet is in a live encounter; a
 *     weapon attack committed in SOLO opens NOTHING (the key rail, mutation-proved).
 *
 * Firebase is stubbed so it stays CI-pure; the store is seeded with the canonical mock,
 * so declareAttack runs optimistically (no persistence injected).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

vi.mock("@/lib/firebase", () => ({}));
vi.mock("@/hooks/useCharacterSubscription", () => ({
  useCharacterSubscription: () => {},
}));

import "@/i18n";
import { AttackDeclaration } from "@/features/character/center/AttackDeclaration";
import { PlayTab } from "@/features/character/center/tabs/PlayTab";
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { GlobalCombat } from "@/features/campaigns/global-combat-context";
import type { EncounterCombatantView } from "@/features/campaigns/encounter-view";

function monsterRow(id: string, name: string, down = false): EncounterCombatantView {
  return {
    id,
    kind: "monster",
    name,
    ac: 12,
    initiative: 10,
    conditions: [],
    currentHp: down ? 0 : 7,
    maxHp: 7,
    tempHp: 0,
    down,
    hidden: false,
    tokens: down ? [0] : [7],
  };
}

function pcRow(): EncounterCombatantView {
  return {
    id: `pc-${MOCK_CHARACTER.id}`,
    kind: "pc",
    name: MOCK_CHARACTER.character.name,
    ac: 15,
    initiative: 14,
    conditions: [],
    currentHp: 20,
    maxHp: 20,
    tempHp: 0,
    down: false,
    hidden: false,
    memberUid: "u1",
    characterId: MOCK_CHARACTER.id,
  };
}

/** A minimal live-encounter status for THIS mock character. The component + gate read
 *  only `view.rows`, `round`, and `characterId`; the rest is shaped to satisfy the type. */
function makeSheetCombat(rows: EncounterCombatantView[], round = 2): GlobalCombat {
  return {
    campaignId: "camp1",
    encounter: {} as GlobalCombat["encounter"],
    view: { rows, turnOrderIds: rows.map((r) => r.id), currentId: null },
    myId: `pc-${MOCK_CHARACTER.id}`,
    characterId: MOCK_CHARACTER.id,
    gathering: false,
    isMyTurn: true,
    initiativeBonus: 2,
    initiativeRoll: 12,
    round,
  };
}

beforeEach(() => {
  useCombatStatusStore.setState({ status: null, pip: null, pendingTurn: null });
  useCombatStore.getState().endCombat();
  useCharacterStore.setState({
    character: { ...MOCK_CHARACTER },
    readonly: false,
    combatRecentActions: [],
    combatPersistence: null,
  });
});

describe("AttackDeclaration — the in-encounter capture panel", () => {
  it("lists only the visible, non-down monsters (never the PC, never a downed foe)", () => {
    const gc = makeSheetCombat([
      monsterRow("monster-0", "Goblin"),
      monsterRow("monster-1", "Ogre", true), // downed → excluded
      pcRow(),
    ]);
    render(<AttackDeclaration sheetCombat={gc} onDone={() => {}} />);
    expect(screen.getByRole("button", { name: /target goblin/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /target ogre/i })).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: new RegExp(MOCK_CHARACTER.character.name, "i"),
      })
    ).toBeNull();
  });

  it("HIT/MISS stay disabled until a target is picked, then a HIT writes the ring", () => {
    const onDone = vi.fn();
    const gc = makeSheetCombat([monsterRow("monster-0", "Goblin")], 3);
    render(<AttackDeclaration sheetCombat={gc} onDone={onDone} />);

    const hit = screen.getByRole("button", { name: "Hit" });
    const miss = screen.getByRole("button", { name: "Miss" });
    expect(hit).toBeDisabled();
    expect(miss).toBeDisabled();
    // No target picked → tapping the disabled control never fabricates a declaration.
    expect(useCharacterStore.getState().combatRecentActions).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: /target goblin/i }));
    expect(hit).toBeEnabled();
    fireEvent.click(hit);

    expect(useCharacterStore.getState().combatRecentActions).toEqual([
      { id: "1", targetIds: ["monster-0"], outcome: "hit", round: 3 },
    ]);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("a MISS writes a miss declaration (no HP ever involved)", () => {
    const gc = makeSheetCombat([monsterRow("monster-0", "Goblin")], 1);
    render(<AttackDeclaration sheetCombat={gc} onDone={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /target goblin/i }));
    fireEvent.click(screen.getByRole("button", { name: "Miss" }));
    expect(useCharacterStore.getState().combatRecentActions).toEqual([
      { id: "1", targetIds: ["monster-0"], outcome: "miss", round: 1 },
    ]);
  });

  it("dismiss writes NOTHING (never fabricate an outcome)", () => {
    const onDone = vi.fn();
    const gc = makeSheetCombat([monsterRow("monster-0", "Goblin")]);
    render(<AttackDeclaration sheetCombat={gc} onDone={onDone} />);
    fireEvent.click(screen.getByRole("button", { name: /target goblin/i }));
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(useCharacterStore.getState().combatRecentActions).toEqual([]);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("with no visible enemies, shows the empty hint and keeps HIT/MISS disabled", () => {
    const gc = makeSheetCombat([pcRow()]);
    render(<AttackDeclaration sheetCombat={gc} onDone={() => {}} />);
    expect(screen.getByText(/no visible enemies/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hit" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Miss" })).toBeDisabled();
  });
});

describe("PlayTab gate — SOLO renders NO capture UI; an encounter opens it", () => {
  function renderPlay() {
    return render(
      <TurnEconomyProvider>
        <PlayTab />
      </TurnEconomyProvider>
    );
  }

  it("SOLO: committing a weapon attack opens NOTHING (the key rail)", () => {
    // No encounter status → useSheetCombat() is null.
    renderPlay();
    fireEvent.click(screen.getByRole("button", { name: /attack: rapier/i }));
    expect(screen.queryByTestId("attack-declaration")).toBeNull();
  });

  it("IN A LIVE ENCOUNTER: committing a weapon attack opens the target picker", () => {
    useCombatStatusStore.setState({
      status: makeSheetCombat([monsterRow("monster-0", "Goblin")]),
      pip: null,
    });
    renderPlay();
    expect(screen.queryByTestId("attack-declaration")).toBeNull(); // nothing until a swing
    fireEvent.click(screen.getByRole("button", { name: /attack: rapier/i }));
    const panel = screen.getByTestId("attack-declaration");
    expect(
      within(panel).getByRole("button", { name: /target goblin/i })
    ).toBeInTheDocument();
  });
});
