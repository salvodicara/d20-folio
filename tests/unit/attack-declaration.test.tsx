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
// The auto-apply seam is stubbed so the panel test stays pure (no campaign-io / Firebase)
// and can ASSERT the player's typed damage is applied to the encounter on a HIT.
vi.mock("@/features/character/center/apply-damage", () => ({
  applyDeclaredDamage: vi.fn(() => Promise.resolve()),
}));

import "@/i18n";
import { applyDeclaredDamage } from "@/features/character/center/apply-damage";
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

const applyMock = vi.mocked(applyDeclaredDamage);

/** Type `amount` into a damage NumberStepper (found by its accessible label). The stepper
 *  input filters+commits live, so a `change` is enough. */
function enterDamage(label: RegExp | string, amount: string): void {
  fireEvent.change(screen.getByRole("spinbutton", { name: label }), {
    target: { value: amount },
  });
}

beforeEach(() => {
  applyMock.mockClear();
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

  it("HIT stays disabled until a target AND a damage number, then applies + writes the ring", () => {
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
    // A target alone arms MISS, but a HIT still needs the damage the player rolled.
    expect(miss).toBeEnabled();
    expect(hit).toBeDisabled();
    enterDamage(/damage you rolled/i, "7");
    expect(hit).toBeEnabled();
    fireEvent.click(hit);

    // The typed damage AUTO-APPLIES to the target monster's HP…
    expect(applyMock).toHaveBeenCalledTimes(1);
    expect(applyMock).toHaveBeenCalledWith("camp1", [
      { targetId: "monster-0", amount: 7 },
    ]);
    // …and the declaration (amount-free — the amount rides the applied event) is written.
    expect(useCharacterStore.getState().combatRecentActions).toEqual([
      { id: "1", targetIds: ["monster-0"], outcome: "hit", round: 3 },
    ]);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("a MISS writes a miss declaration and applies NOTHING", () => {
    const gc = makeSheetCombat([monsterRow("monster-0", "Goblin")], 1);
    render(<AttackDeclaration sheetCombat={gc} onDone={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /target goblin/i }));
    fireEvent.click(screen.getByRole("button", { name: "Miss" }));
    expect(useCharacterStore.getState().combatRecentActions).toEqual([
      { id: "1", targetIds: ["monster-0"], outcome: "miss", round: 1 },
    ]);
    // A miss never touches monster HP.
    expect(applyMock).not.toHaveBeenCalled();
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

describe("AttackDeclaration — MULTI-select (Phase 2: a multi-target action)", () => {
  it("captures the target SET + the multi-instance bound, resolving as one 'Landed'", () => {
    const gc = makeSheetCombat(
      [
        monsterRow("monster-0", "Goblin"),
        monsterRow("monster-1", "Chief"),
        monsterRow("monster-2", "Ogre"),
      ],
      4
    );
    render(<AttackDeclaration sheetCombat={gc} maxTargets={3} onDone={() => {}} />);
    // Multi resolution reads "Landed", not "Hit" (still a single tap for the whole set).
    const landed = screen.getByRole("button", { name: "Landed" });
    expect(landed).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /target goblin/i }));
    fireEvent.click(screen.getByRole("button", { name: /target ogre/i }));
    // Each struck target gets its OWN damage field; Landed arms only once both are filled.
    enterDamage(/damage to goblin/i, "5");
    expect(landed).toBeDisabled();
    enterDamage(/damage to ogre/i, "9");
    fireEvent.click(landed);
    // The full SET rides one declaration, carrying the instance bound (3)…
    expect(useCharacterStore.getState().combatRecentActions).toEqual([
      {
        id: "1",
        targetIds: ["monster-0", "monster-2"],
        outcome: "hit",
        round: 4,
        instances: 3,
      },
    ]);
    // …and each dart's typed damage auto-applies to its target.
    expect(applyMock).toHaveBeenCalledWith("camp1", [
      { targetId: "monster-0", amount: 5 },
      { targetId: "monster-2", amount: 9 },
    ]);
  });

  it("never lets the player over-pick — chips past the cap disable", () => {
    const gc = makeSheetCombat([
      monsterRow("monster-0", "Goblin"),
      monsterRow("monster-1", "Chief"),
      monsterRow("monster-2", "Ogre"),
    ]);
    render(<AttackDeclaration sheetCombat={gc} maxTargets={2} onDone={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /target goblin/i }));
    fireEvent.click(screen.getByRole("button", { name: /target chief/i }));
    // At the cap of 2 → the unpicked third chip is disabled (can't exceed the bound).
    expect(screen.getByRole("button", { name: /target ogre/i })).toBeDisabled();
    // De-selecting frees a slot again.
    fireEvent.click(screen.getByRole("button", { name: /target chief/i }));
    expect(screen.getByRole("button", { name: /target ogre/i })).toBeEnabled();
  });

  it("a single-target action (maxTargets 1) stays single-select — Phase 1 unchanged", () => {
    const gc = makeSheetCombat([
      monsterRow("monster-0", "Goblin"),
      monsterRow("monster-1", "Chief"),
    ]);
    // maxTargets defaults to 1; picking a second target REPLACES the first (single-select),
    // and the resolution reads "Hit" (never the multi "Landed"), carrying NO instance bound.
    render(<AttackDeclaration sheetCombat={gc} onDone={() => {}} />);
    expect(screen.queryByRole("button", { name: "Landed" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /target goblin/i }));
    fireEvent.click(screen.getByRole("button", { name: /target chief/i }));
    enterDamage(/damage you rolled/i, "6");
    fireEvent.click(screen.getByRole("button", { name: "Hit" }));
    expect(useCharacterStore.getState().combatRecentActions).toEqual([
      { id: "1", targetIds: ["monster-1"], outcome: "hit", round: 2 },
    ]);
    expect(applyMock).toHaveBeenCalledWith("camp1", [
      { targetId: "monster-1", amount: 6 },
    ]);
  });
});

describe("AttackDeclaration — AREA SAVE (Phase 3: a Fireball-class spell)", () => {
  it("shows ONE 'Resolve' (no HIT/MISS), captures the whole area, and writes save:true", () => {
    const gc = makeSheetCombat(
      [
        monsterRow("monster-0", "Goblin"),
        monsterRow("monster-1", "Chief"),
        monsterRow("monster-2", "Ogre"),
      ],
      3
    );
    render(
      <AttackDeclaration sheetCombat={gc} maxTargets={Infinity} save onDone={() => {}} />
    );
    // A save spell has no attack roll — one Resolve, never HIT/MISS.
    expect(screen.queryByRole("button", { name: "Hit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Miss" })).toBeNull();
    const resolve = screen.getByRole("button", { name: "Resolve" });
    expect(resolve).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /target goblin/i }));
    fireEvent.click(screen.getByRole("button", { name: /target chief/i }));
    fireEvent.click(screen.getByRole("button", { name: /target ogre/i }));
    // A save shares ONE rolled number, applied in full to the whole area.
    expect(resolve).toBeDisabled();
    enterDamage(/damage you rolled/i, "24");
    fireEvent.click(resolve);
    // The whole declared set rides ONE save declaration — no instance bound.
    expect(useCharacterStore.getState().combatRecentActions).toEqual([
      {
        id: "1",
        targetIds: ["monster-0", "monster-1", "monster-2"],
        outcome: "hit",
        round: 3,
        save: true,
      },
    ]);
    // The rolled damage applies in FULL to every target (the DM then trims the savers).
    expect(applyMock).toHaveBeenCalledWith("camp1", [
      { targetId: "monster-0", amount: 24 },
      { targetId: "monster-1", amount: 24 },
      { targetId: "monster-2", amount: 24 },
    ]);
  });

  it("an area burst is UNBOUNDED — every chip stays enabled (never an over-pick cap)", () => {
    const gc = makeSheetCombat([
      monsterRow("monster-0", "Goblin"),
      monsterRow("monster-1", "Chief"),
      monsterRow("monster-2", "Ogre"),
    ]);
    render(
      <AttackDeclaration sheetCombat={gc} maxTargets={Infinity} save onDone={() => {}} />
    );
    fireEvent.click(screen.getByRole("button", { name: /target goblin/i }));
    fireEvent.click(screen.getByRole("button", { name: /target chief/i }));
    // No cap — the third chip is still selectable.
    expect(screen.getByRole("button", { name: /target ogre/i })).toBeEnabled();
  });

  it("a rider-bearing weapon (Topple) carries its applied-condition ids on the declaration", () => {
    const gc = makeSheetCombat([monsterRow("monster-0", "Goblin")]);
    render(<AttackDeclaration sheetCombat={gc} riders={["prone"]} onDone={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /target goblin/i }));
    enterDamage(/damage you rolled/i, "8");
    fireEvent.click(screen.getByRole("button", { name: "Hit" }));
    expect(useCharacterStore.getState().combatRecentActions).toEqual([
      { id: "1", targetIds: ["monster-0"], outcome: "hit", round: 2, riders: ["prone"] },
    ]);
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
