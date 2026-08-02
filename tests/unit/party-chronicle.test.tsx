/**
 * party-chronicle — thin render tests for the DM-facing Combat Chronicle UI: the live
 * feed's one-tap attacker attribution (pre-picked to the current combatant, skippable,
 * NEVER auto) and the editable end entry (line deletion honored, markdown built,
 * Save/Skip wired). `@/lib/firebase` is stubbed because the components transitively
 * import `campaign-io` → `@/lib/firebase`.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import i18n from "@/i18n";

vi.mock("@/lib/firebase", () => ({ db: {} }));

import { ChronicleFeed, EndEncounterDialog } from "@/features/campaigns/party-chronicle";
import {
  setEventAttacker,
  skipEventAttacker,
  undoHpEvent,
} from "@/features/campaigns/combat-chronicle";
import type { EncounterCombatantView } from "@/features/campaigns/encounter-view";
import type { ReconciledEvent } from "@/features/campaigns/chronicle-reconcile";
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

/** Wrap a stored event as a reconciled feed line (the ChronicleFeed/EndEncounterDialog
 *  input shape now that the feed is the RECONCILED view). */
const reco = (
  event: CombatChronicleEvent,
  o: Omit<ReconciledEvent, "event"> = {}
): ReconciledEvent => ({ event, ...o });

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
        events={[reco(damageEvent)]}
        rows={ROWS}
        memberDetails={{}}
        currentId="pc-mara"
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
        events={[reco(damageEvent)]}
        rows={ROWS}
        memberDetails={{}}
        currentId="pc-mara"
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
        events={[reco(damageEvent)]}
        rows={ROWS}
        memberDetails={{}}
        currentId="pc-mara"
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
        events={[reco({ ...damageEvent, attackerId: "pc-mara" })]}
        rows={ROWS}
        memberDetails={{}}
        currentId="pc-mara"
        apply={vi.fn()}
      />
    );
    // The attributed line uses "hits" and offers NO picker chip for Mara.
    expect(screen.getByText(/Mara hits Goblin for 8/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "No one" })).toBeNull();
  });

  it("offers a one-tap UNDO on a monster HP line (removes the line + restores HP)", () => {
    let captured: (e: EncounterState) => EncounterState = (e) => e;
    const apply = vi.fn((fn: (e: EncounterState) => EncounterState) => {
      captured = fn;
    });
    render(
      <ChronicleFeed
        events={[reco({ ...damageEvent, attackerId: "pc-mara" }, { auto: true })]}
        rows={ROWS}
        memberDetails={{}}
        currentId="pc-mara"
        apply={apply}
      />
    );
    // A CERTAIN auto-applied player hit still carries the DM's undo affordance.
    fireEvent.click(screen.getByRole("button", { name: "Undo this line" }));
    expect(apply).toHaveBeenCalledTimes(1);
    // The reducer IS undoHpEvent — it clears the line and heals the token back to full.
    const seed: EncounterState = {
      combatants: [
        {
          kind: "monster",
          id: "monster-1",
          name: "Goblin",
          ac: 13,
          initiative: 12,
          conditions: [],
          maxHp: 12,
          tokens: [4],
        },
      ],
      round: 1,
      currentCombatantId: "pc-mara",
      epoch: 1,
      status: "active",
      events: [{ ...damageEvent, attackerId: "pc-mara" }],
    };
    const next = captured(seed);
    expect(next).toEqual(undoHpEvent(seed, "0"));
    expect(next.events).toEqual([]);
    expect(next.combatants[0]).toMatchObject({ tokens: [12] }); // 4 + 8 healed back
  });

  it("shows NO undo on a PC-target HP line (a PC's HP is not on the encounter)", () => {
    render(
      <ChronicleFeed
        events={[
          reco({
            id: "0",
            round: 1,
            kind: "hp-damage",
            targetId: "pc-mara",
            amount: 5,
            current: 17,
            max: 22,
          }),
        ]}
        rows={ROWS}
        memberDetails={{}}
        currentId="pc-mara"
        apply={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: "Undo this line" })).toBeNull();
  });

  it("a CERTAIN auto-attributed hit reads as a confirmed line with no picker", () => {
    render(
      <ChronicleFeed
        events={[reco({ ...damageEvent, attackerId: "pc-mara" }, { auto: true })]}
        rows={ROWS}
        memberDetails={{}}
        currentId="pc-mara"
        apply={vi.fn()}
      />
    );
    expect(screen.getByText(/Mara hits Goblin for 8/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "No one" })).toBeNull();
  });

  it("an UNCERTAIN auto-attribution wears the marker AND offers the override picker", () => {
    render(
      <ChronicleFeed
        events={[
          reco(
            { ...damageEvent, attackerId: "pc-mara" },
            { auto: true, uncertain: true }
          ),
        ]}
        rows={ROWS}
        memberDetails={{}}
        currentId="pc-mara"
        apply={vi.fn()}
      />
    );
    // Subtle marker present (title/aria), and the DM can re-point the attribution.
    expect(screen.getByRole("img", { name: /uncertain/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mara" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "No one" })).toBeTruthy();
  });

  it("renders a synthesized player-declared MISS line (certain, no picker)", () => {
    render(
      <ChronicleFeed
        events={[
          reco({
            id: "miss-mara:1:monster-1",
            round: 1,
            kind: "attack-miss",
            attackerId: "pc-mara",
            targetId: "monster-1",
          }),
        ]}
        rows={ROWS}
        memberDetails={{}}
        currentId="pc-mara"
        apply={vi.fn()}
      />
    );
    expect(screen.getByText(/Mara misses Goblin/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "No one" })).toBeNull();
  });

  it("records ONLY what landed — the feed has no miss/pass logging affordance", () => {
    render(
      <ChronicleFeed
        events={[]}
        rows={ROWS}
        memberDetails={{}}
        currentId="pc-mara"
        apply={vi.fn()}
      />
    );
    // The chronicle is the deterministic record of what landed; missed swings + drama
    // belong in the DM's narrative note, not a per-turn button.
    expect(screen.queryByRole("button", { name: /Log a pass/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Log a miss/ })).toBeNull();
  });

  it("a fused MULTI-target line renders one summary line + an UNCERTAIN marker, no picker", () => {
    // Rows for a three-foe volley (the Chief + Ogre alongside the Goblin).
    const rows3: EncounterCombatantView[] = [
      ...ROWS,
      { ...ROWS[1], id: "monster-2", name: "Chief" } as EncounterCombatantView,
    ];
    const fused: ReconciledEvent = reco(
      {
        kind: "attack-multi",
        id: "multi-mara:5",
        round: 1,
        attackerId: "pc-mara",
        targetIds: ["monster-1", "monster-2"],
        amounts: [
          { targetId: "monster-1", amount: 22 },
          { targetId: "monster-2", amount: 11 },
        ],
      },
      { auto: true, uncertain: true }
    );
    render(
      <ChronicleFeed
        events={[fused]}
        rows={rows3}
        memberDetails={{}}
        currentId="pc-mara"
        apply={vi.fn()}
      />
    );
    // ONE line summarizing both real amounts (never two individual drop lines).
    expect(screen.getByText(/Mara hits Goblin \(22\) and Chief \(11\)/)).toBeTruthy();
    // The subtle uncertain marker is present…
    expect(screen.getByLabelText(/Uncertain/)).toBeTruthy();
    // …but a fused multi line is NOT an hp-damage line, so it offers NO attacker picker
    // (its override is deletion at end-entry, like any synthesized line).
    expect(screen.queryByRole("button", { name: "No one" })).toBeNull();
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
  const reconciled: ReconciledEvent[] = [
    reco(damageEvent),
    reco({ id: "1", round: 1, kind: "down", targetId: "monster-1" }),
  ];

  it("builds a titled markdown chapter with the outcome and calls onSave", () => {
    const onSave = vi.fn<(chapter: string) => Promise<void>>(() => Promise.resolve());
    render(
      <EndEncounterDialog
        encounter={encounter}
        reconciled={reconciled}
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
        reconciled={reconciled}
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
        reconciled={reconciled}
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
