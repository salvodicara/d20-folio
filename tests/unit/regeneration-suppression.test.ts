/**
 * The Troll's Regeneration switched off by Acid or Fire damage. SRD 5.2.1 Troll:
 * "The troll regains 15 Hit Points at the start of each of its turns. If the troll
 * takes Acid or Fire damage, this trait doesn't function on the troll's next turn."
 * The fact rides the corpus (`suppressedBy: ["acid", "fire"]`); the encounter's
 * damage log says which types landed and during whose turn.
 */
import { describe, expect, it } from "vitest";

import enMonster from "@/i18n/en/ui/monster.json";
import itMonster from "@/i18n/it/ui/monster.json";
import { getMonster } from "@/data/monsters";
import type { MonsterTraitFact } from "@/data/types";
import {
  addMonster,
  advanceTurn,
  beginEncounterTurns,
  startEncounter,
} from "@/features/campaigns/encounter";
import {
  REGENERATION_ACTION,
  REGENERATION_SUPPRESSED_ACTION,
  regenerationSuppressedBy,
  regenerationTurnStart,
} from "@/features/campaigns/encounter-trait-facts";
import {
  applyAdversaryDamage,
  applyAdversaryDamageParts,
} from "@/features/campaigns/encounter-world-command";
import type { DamageInstance } from "@/lib/damage-intake";
import type { EncounterMonster, EncounterState } from "@/types/campaign";

const CAMPAIGN_ID = "campaign-under-test";
type Regeneration = Extract<MonsterTraitFact, { kind: "regeneration" }>;

/** The Troll's printed fact, read from the corpus (not restated by hand). */
function trollFact(): Regeneration {
  const fact = getMonster("troll")
    ?.traits?.flatMap((entry) =>
      entry.kind === "narrative" && entry.fact ? [entry.fact] : []
    )
    .find((f): f is Regeneration => f.kind === "regeneration");
  if (!fact) throw new Error("the Troll carries no Regeneration fact");
  return fact;
}
const ONI: Regeneration = { kind: "regeneration", amount: 10, needsHp: true };

/** Troll (monster-1) acts first, the Bandit (monster-2) second. */
function fight(): EncounterState {
  let state = startEncounter({}, [], 1_000);
  state = addMonster(state, {
    ac: 15,
    count: 1,
    initiative: 14,
    maxHp: 94,
    name: "Troll",
    srdId: "troll",
  });
  state = addMonster(state, {
    ac: 13,
    count: 1,
    initiative: 3,
    maxHp: 20,
    name: "Bandit",
  });
  return beginEncounterTurns(state, ["monster-1", "monster-2"]);
}

const hit = (parts: DamageInstance[]) => (state: EncounterState) =>
  applyAdversaryDamageParts(state, CAMPAIGN_ID, "monster-1", parts);

function troll(state: EncounterState): EncounterMonster {
  const monster = state.combatants.find((c) => c.id === "monster-1");
  if (!monster || monster.kind !== "monster") throw new Error("missing troll");
  return monster;
}

/** Round 1: the Troll's turn passes, the Bandit's turn is current. */
const banditTurn = (state = fight()) => advanceTurn(state);

describe("the damage log records what landed", () => {
  it("a typed hit stamps the landed types and whose turn it was", () => {
    const state = hit([
      { amount: 7, type: "fire" },
      { amount: 5, type: "slashing" },
    ])(banditTurn());
    expect(state.events?.at(-1)).toMatchObject({
      kind: "hp-damage",
      targetId: "monster-1",
      amount: 12,
      damageTypes: ["fire", "slashing"],
      turnOf: "monster-2",
    });
  });

  it("an untyped total carries no types", () => {
    const state = applyAdversaryDamage(banditTurn(), CAMPAIGN_ID, "monster-1", 9);
    expect(state.events?.at(-1)).not.toHaveProperty("damageTypes");
  });
});

describe("regenerationSuppressedBy", () => {
  it("the Troll's fact names Acid and Fire", () => {
    expect(trollFact()).toMatchObject({ amount: 15, suppressedBy: ["acid", "fire"] });
  });

  it("Fire taken since its last turn switches it off on its next turn", () => {
    const burned = hit([{ amount: 10, type: "fire" }])(banditTurn());
    const next = advanceTurn(burned); // round 2, the Troll's turn
    expect(next.round).toBe(2);
    expect(next.currentCombatantId).toBe("monster-1");
    expect(regenerationSuppressedBy(next, "monster-1", trollFact())).toEqual(["fire"]);
  });

  it("Acid works the same way", () => {
    const next = advanceTurn(hit([{ amount: 4, type: "acid" }])(banditTurn()));
    expect(regenerationSuppressedBy(next, "monster-1", trollFact())).toEqual(["acid"]);
  });

  it("other damage types leave it working", () => {
    const next = advanceTurn(hit([{ amount: 10, type: "slashing" }])(banditTurn()));
    expect(regenerationSuppressedBy(next, "monster-1", trollFact())).toBeNull();
  });

  it("only the NEXT turn: the turn after that regenerates again", () => {
    const round2 = advanceTurn(hit([{ amount: 10, type: "fire" }])(banditTurn()));
    const round3 = advanceTurn(advanceTurn(round2));
    expect(round3.round).toBe(3);
    expect(round3.currentCombatantId).toBe("monster-1");
    expect(regenerationSuppressedBy(round3, "monster-1", trollFact())).toBeNull();
  });

  it("Fire taken during its own turn stops the next turn, not the current one", () => {
    const own = hit([{ amount: 6, type: "fire" }])(fight()); // round 1, the Troll's turn
    expect(regenerationSuppressedBy(own, "monster-1", trollFact())).toBeNull();
    const round2 = advanceTurn(advanceTurn(own));
    expect(regenerationSuppressedBy(round2, "monster-1", trollFact())).toEqual(["fire"]);
  });

  it("Fire the Troll takes none of (net 0) does not count", () => {
    let state = banditTurn();
    state = {
      ...state,
      combatants: state.combatants.map((c) =>
        c.id === "monster-1" && c.kind === "monster"
          ? { ...c, defenses: { damageImmunities: ["fire"] } }
          : c
      ),
    };
    const next = advanceTurn(
      hit([
        { amount: 10, type: "fire" },
        { amount: 3, type: "slashing" },
      ])(state)
    );
    expect(regenerationSuppressedBy(next, "monster-1", trollFact())).toBeNull();
  });

  it("a regenerator with no suppressing types is never switched off", () => {
    const next = advanceTurn(hit([{ amount: 10, type: "fire" }])(banditTurn()));
    expect(regenerationSuppressedBy(next, "monster-1", ONI)).toBeNull();
  });
});

describe("regenerationTurnStart", () => {
  it("heals the printed amount when nothing switched it off", () => {
    const next = advanceTurn(hit([{ amount: 30, type: "slashing" }])(banditTurn()));
    const { encounter, log } = regenerationTurnStart(
      next,
      CAMPAIGN_ID,
      "monster-1",
      trollFact()
    );
    expect(troll(encounter).hp.current).toBe(79);
    expect(encounter.events?.at(-1)).toMatchObject({
      kind: "hp-heal",
      amount: 15,
      action: REGENERATION_ACTION,
    });
    expect(log).toEqual([]);
  });

  it("skips the heal and says why in one log line, once per round", () => {
    const next = advanceTurn(hit([{ amount: 30, type: "fire" }])(banditTurn()));
    const { encounter, log } = regenerationTurnStart(
      next,
      CAMPAIGN_ID,
      "monster-1",
      trollFact()
    );
    expect(troll(encounter).hp.current).toBe(64);
    expect(encounter).toBe(next);
    expect(log).toEqual([
      {
        type: "event",
        id: `enc:${next.epoch}:regen-off:2:monster-1`,
        event: {
          kind: "action",
          actor: "monster-1",
          source: REGENERATION_SUPPRESSED_ACTION,
        },
      },
    ]);
    // The same turn asked twice writes the same line id (the log keeps one).
    expect(
      regenerationTurnStart(next, CAMPAIGN_ID, "monster-1", trollFact()).log[0]?.id
    ).toBe(log[0]?.id);
  });

  it("the log line reads in English and Italian", () => {
    const key = (REGENERATION_SUPPRESSED_ACTION as { ui: string }).ui.split(".");
    const read = (tree: unknown) =>
      key.reduce<unknown>(
        (node, part) => (node as Record<string, unknown> | undefined)?.[part],
        tree
      );
    expect(read(enMonster)).toEqual(expect.any(String));
    expect(read(itMonster)).toEqual(expect.any(String));
  });
});
