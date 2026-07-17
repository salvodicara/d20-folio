/**
 * Cunning Strike apply — `TurnEconomyProvider.applyCunningStrike` integration (A3).
 *
 * A Rogue's Cunning Strike option (Poison/Trip/Withdraw) is the per-attack picker
 * that debits the once-per-turn Sneak Attack USE. A tap:
 *  - debits the `rogue-sneak-attack` tracker EXACTLY once,
 *  - logs a `rider-use` event,
 *  - surfaces a 5s undo toast that restores the use + removes the log entry,
 *  - is a no-op once the use is already spent (never double-spends).
 * Driven through the REAL provider on a built dev scenario (the engine resolves
 * the catalogue; the provider owns the debit) — the wiring proof for the slice.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useEffect } from "react";
import { render, act } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { useTurnEconomy } from "@/features/character/center/useTurnEconomy";
import { useCharacterStore } from "@/stores/characterStore";
import { useUIStore } from "@/stores/uiStore";
import { useToastStore } from "@/stores/toastStore";
import { useCombatStore } from "@/stores/combatStore";
import { resolveCunningStrikeOptions } from "@/lib/smart-tracker";
import {
  buildCunningStrikeOptions,
  type CunningStrikeVM,
} from "@/lib/views/cunning-strike-view";
import { buildScenario, type ScenarioSpec } from "@/lib/dev-scenarios";
import type { CharacterDoc } from "@/types/character";
import type { ResolvedAction } from "@/lib/smart-tracker";
import type { AbilityCode } from "@/data/types";

const SNEAK = "rogue-sneak-attack";
const S: Record<AbilityCode, number> = {
  STR: 10,
  DEX: 16,
  CON: 12,
  INT: 10,
  WIS: 12,
  CHA: 8,
};

let applyApi: ((action: ResolvedAction, option: CunningStrikeVM) => void) | null = null;
function ApplyProbe() {
  const applyCunningStrike = useTurnEconomy().applyCunningStrike;
  useEffect(() => {
    applyApi = applyCunningStrike;
  }, [applyCunningStrike]);
  return null;
}

const spec: ScenarioSpec = {
  name: "Sable",
  raceId: "human",
  classId: "rogue",
  level: 7,
  background: "criminal",
  abilityScores: S,
  weapons: [{ srdId: "dagger", quantity: 1 }],
};

function mount(extra: Partial<ScenarioSpec> = {}): void {
  const doc = buildScenario({ ...spec, ...extra });
  doc.session.logEntries = [];
  useCharacterStore.setState({ character: doc, loading: false, error: null });
  render(
    <MemoryRouter>
      <TurnEconomyProvider>
        <ApplyProbe />
      </TurnEconomyProvider>
    </MemoryRouter>
  );
}

function currentDoc(): CharacterDoc {
  const doc = useCharacterStore.getState().character;
  if (!doc) throw new Error("no character loaded");
  return doc;
}
const sneakUsed = (): number => currentDoc().session.trackers[SNEAK]?.used ?? 0;
const log = () => currentDoc().session.logEntries;

/** The first Cunning Strike option VM (as PlayTab passes to applyCunningStrike). */
function firstOption(): CunningStrikeVM {
  const { options } = resolveCunningStrikeOptions(currentDoc());
  const [vm] = buildCunningStrikeOptions(
    options,
    { sneakAttackAvailable: true, sneakAttackDice: 4 },
    "en"
  );
  if (!vm) throw new Error("no Cunning Strike option");
  return vm;
}

function apply(option: CunningStrikeVM): void {
  if (!applyApi) throw new Error("applyCunningStrike not wired");
  const fn = applyApi;
  const action = { name: "Dagger" } as ResolvedAction;
  act(() => fn(action, option));
}

function fireLastUndo(): void {
  const toasts = useToastStore.getState().toasts;
  const toast = toasts[toasts.length - 1];
  if (!toast?.onUndo) throw new Error("no undo toast");
  const undo = toast.onUndo;
  act(() => undo());
}

beforeEach(() => {
  applyApi = null;
  useCharacterStore.setState({ character: null, loading: false, error: null });
  useUIStore.setState({ sheetMode: "play" });
  useToastStore.setState({ toasts: [], timers: {} });
  useCombatStore.setState({
    round: 1,
    initiative: "",
    selected: { action: [], bonus: [], free: [] },
    reactionUsed: false,
    movementUsedFt: 0,
    damageTakenThisRound: false,
  });
});

describe("applyCunningStrike — debit the Sneak Attack use", () => {
  it("a real Rogue (L7) surfaces Cunning Strike options", () => {
    mount();
    const { options } = resolveCunningStrikeOptions(currentDoc());
    expect(options.map((o) => o.optionId).sort()).toEqual(["poison", "trip", "withdraw"]);
  });

  it("debits the Sneak Attack use EXACTLY once + logs a rider-use event", () => {
    mount();
    expect(sneakUsed()).toBe(0);

    apply(firstOption());

    expect(sneakUsed()).toBe(1);
    expect(log()).toHaveLength(1);
    expect(log()[0]?.event.kind).toBe("rider-use");
  });

  it("the undo toast restores the use + removes the log entry", () => {
    mount();
    apply(firstOption());
    expect(sneakUsed()).toBe(1);

    fireLastUndo();
    expect(sneakUsed()).toBe(0);
    expect(log()).toHaveLength(0);
  });

  it("a spent Sneak Attack use is a no-op (never double-spends)", () => {
    mount({ sessionTrackers: { [SNEAK]: { used: 1 } } });
    apply(firstOption());
    expect(sneakUsed()).toBe(1);
    expect(log()).toHaveLength(0);
  });
});
