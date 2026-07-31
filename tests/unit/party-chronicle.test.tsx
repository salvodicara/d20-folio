/**
 * party-chronicle — thin render tests for the DM-facing Combat Chronicle UI: the live
 * feed's one-tap attacker attribution (pre-picked to the current combatant, skippable,
 * NEVER auto), the pull-only miss/pass logger, and the editable end entry (line
 * deletion honored, markdown built, Save/Skip wired). `@/lib/firebase` is stubbed
 * because the components transitively import `campaign-io` → `@/lib/firebase`.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import i18n from "@/i18n";

vi.mock("@/lib/firebase", () => ({ db: {} }));

import { ChronicleFeed, EndEncounterDialog } from "@/features/campaigns/party-chronicle";
import {
  setEventAttacker,
  skipEventAttacker,
} from "@/features/campaigns/combat-chronicle";
import type { EncounterCombatantView } from "@/features/campaigns/encounter-view";
import type { EncounterState } from "@/types/campaign";
import type { CombatChronicleEvent } from "@/types/combat-chronicle";

beforeAll(async () => {
  if (i18n.language !== "en") await i18n.changeLanguage("en");
});

/** Assert-present helper (the repo forbids `!` / non-null assertions in tests). */
function must<T>(v: T | null | undefined, msg: string): T {
  if (v === null || v === undefined) throw new Error(msg);
  return v;
}

const ROWS: EncounterCombatantView[] = [
  {
    id: "pc-mara",
    kind: "pc",
    name: "Mara",
    ac: 15,
    initiative: 14,
    conditions: [],
    currentHp: 22,
    maxHp: 22,
    tempHp: 0,
    down: false,
    hidden: false,
    memberUid: "mara",
    characterId: "char-mara",
  },
  {
    id: "monster-1",
    kind: "monster",
    name: "Goblin",
    ac: 13,
    initiative: 12,
    conditions: [],
    currentHp: 4,
    maxHp: 12,
    tempHp: 0,
    down: false,
    hidden: false,
    tokens: [4],
  },
];

const damageEvent: CombatChronicleEvent = {
  id: "0",
  round: 1,
  kind: "hp-damage",
  targetId: "monster-1",
  amount: 8,
  current: 4,
  max: 12,
};

function stateWith(events: CombatChronicleEvent[]): EncounterState {
  return {
    combatants: [],
    round: 1,
    currentCombatantId: "pc-mara",
    epoch: 1,
    status: "active",
    events,
  };
}

describe("ChronicleFeed — the live feed + one-tap attribution", () => {
  it("renders the localized damage line and, on an un-attributed hit, the picker", () => {
    const apply = vi.fn();
    render(
      <ChronicleFeed
        events={[damageEvent]}
        rows={ROWS}
        memberDetails={{}}
        currentId="pc-mara"
        gathering={false}
        apply={apply}
      />
    );
    expect(screen.getByText(/Goblin takes 8/)).toBeTruthy();
    // The attacker picker offers the OTHER combatant (Mara) + a skip chip — never the
    // target itself (Goblin has no chip in the picker).
    expect(screen.getByRole("button", { name: "Mara" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "No one" })).toBeTruthy();
  });

  it("a chip tap attributes to that combatant (never auto-guesses)", () => {
    let captured: (e: EncounterState) => EncounterState = (e) => e;
    const apply = vi.fn((fn: (e: EncounterState) => EncounterState) => {
      captured = fn;
    });
    render(
      <ChronicleFeed
        events={[damageEvent]}
        rows={ROWS}
        memberDetails={{}}
        currentId="pc-mara"
        gathering={false}
        apply={apply}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Mara" }));
    expect(apply).toHaveBeenCalledTimes(1);
    // Apply the captured reducer to prove it sets the attacker (equivalent to setEventAttacker).
    const next = captured(stateWith([{ ...damageEvent }]));
    expect(next.events?.[0]).toMatchObject({ attackerId: "pc-mara" });
    // Sanity: the reducer IS setEventAttacker, not a guess.
    expect(next.events?.[0]).toEqual(
      setEventAttacker(stateWith([{ ...damageEvent }]), "0", "pc-mara").events?.[0]
    );
  });

  it("the skip chip resolves as unattributed", () => {
    let captured: (e: EncounterState) => EncounterState = (e) => e;
    const apply = vi.fn((fn: (e: EncounterState) => EncounterState) => {
      captured = fn;
    });
    render(
      <ChronicleFeed
        events={[damageEvent]}
        rows={ROWS}
        memberDetails={{}}
        currentId="pc-mara"
        gathering={false}
        apply={apply}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "No one" }));
    const next = captured(stateWith([{ ...damageEvent }]));
    expect(next.events?.[0]).toEqual(
      skipEventAttacker(stateWith([{ ...damageEvent }]), "0").events?.[0]
    );
  });

  it("no attacker picker once the hit is attributed", () => {
    render(
      <ChronicleFeed
        events={[{ ...damageEvent, attackerId: "pc-mara" }]}
        rows={ROWS}
        memberDetails={{}}
        currentId="pc-mara"
        gathering={false}
        apply={vi.fn()}
      />
    );
    // The attributed line uses "hits" and offers NO picker chip for Mara.
    expect(screen.getByText(/Mara hits Goblin for 8/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "No one" })).toBeNull();
  });

  it("miss/pass are pull-only — Log pass records, and there is no auto miss", () => {
    let captured: (e: EncounterState) => EncounterState = (e) => e;
    const apply = vi.fn((fn: (e: EncounterState) => EncounterState) => {
      captured = fn;
    });
    render(
      <ChronicleFeed
        events={[]}
        rows={ROWS}
        memberDetails={{}}
        currentId="pc-mara"
        gathering={false}
        apply={apply}
      />
    );
    // Nothing logged until tapped.
    fireEvent.click(screen.getByRole("button", { name: /Log a pass/ }));
    const next = captured(stateWith([]));
    expect(next.events?.[0]).toMatchObject({ kind: "turn-pass", actorId: "pc-mara" });
  });

  it("hides the miss/pass logger while gathering (no active combatant)", () => {
    render(
      <ChronicleFeed
        events={[]}
        rows={ROWS}
        memberDetails={{}}
        currentId={null}
        gathering
        apply={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: /Log a pass/ })).toBeNull();
  });
});

describe("EndEncounterDialog — the editable end entry", () => {
  const encounter: EncounterState = {
    ...stateWith([
      damageEvent,
      { id: "1", round: 1, kind: "down", targetId: "monster-1" },
    ]),
    // A defeated monster group in the roster → inferOutcome === "victory".
    combatants: [
      {
        kind: "monster",
        id: "monster-1",
        name: "Goblin",
        ac: 13,
        initiative: 12,
        conditions: [],
        maxHp: 12,
        tokens: [0],
      },
    ],
  };

  it("builds a titled markdown chapter with the outcome and calls onSave", () => {
    const onSave = vi.fn<(chapter: string) => Promise<void>>(() => Promise.resolve());
    render(
      <EndEncounterDialog
        encounter={encounter}
        rows={ROWS}
        memberDetails={{}}
        onSave={onSave}
        onSkip={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Save to Chronicle/ }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const chapter = must(onSave.mock.calls[0], "onSave not called")[0];
    expect(chapter.startsWith("## ")).toBe(true);
    expect(chapter).toContain("Goblin takes 8");
    expect(chapter).toContain("Goblin falls");
    // Outcome inferred victory (the only monster is down).
    expect(chapter).toContain("The party is victorious");
  });

  it("honors a deleted line — it is absent from the saved chapter", () => {
    const onSave = vi.fn<(chapter: string) => Promise<void>>(() => Promise.resolve());
    render(
      <EndEncounterDialog
        encounter={encounter}
        rows={ROWS}
        memberDetails={{}}
        onSave={onSave}
        onSkip={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    // Delete the "Goblin falls" record line (the second delete button).
    const deletes = screen.getAllByRole("button", { name: /Remove this line/ });
    fireEvent.click(must(deletes[1], "no second delete"));
    fireEvent.click(screen.getByRole("button", { name: /Save to Chronicle/ }));
    const chapter = must(onSave.mock.calls[0], "onSave not called")[0];
    expect(chapter).toContain("Goblin takes 8");
    expect(chapter).not.toContain("Goblin falls");
  });

  it("Skip saves nothing", () => {
    const onSkip = vi.fn();
    const onSave = vi.fn<(chapter: string) => Promise<void>>(() => Promise.resolve());
    render(
      <EndEncounterDialog
        encounter={encounter}
        rows={ROWS}
        memberDetails={{}}
        onSave={onSave}
        onSkip={onSkip}
        onCancel={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /^Skip$/ }));
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });
});
