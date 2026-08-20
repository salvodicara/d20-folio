/**
 * The incoming-damage REACTION runtime, end-to-end through the coordinator:
 * one composed causal action carries the table-entered hit AND the picked
 * reaction — the entered damage lands, the program's `damage-taken` phase
 * compensates exactly (Uncanny Dodge halves an attack's damage), the round's
 * Reaction is claimed against the solo encounter's economy ledger, and ONE
 * journal undo restores both. A second reaction the same round rejects.
 */

import { describe, expect, it } from "vitest";

import {
  characterDamageReactionOptions,
  composeDamageEntryProgram,
  runDamageReactionEntry,
  undoDamageReactionEntry,
} from "@/lib/damage-reaction";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CharacterDoc } from "@/types/character";

const UID = "test-uid";

/** A clean solo hero: no temp HP, no concentration, fresh session. */
function heroDoc(): CharacterDoc {
  const doc = structuredClone(MOCK_CHARACTER);
  doc.session.hp = { current: 38, temp: 0 };
  doc.session.concentration = "";
  return doc;
}

function uncannyDodgeOption(doc: CharacterDoc) {
  const option = characterDamageReactionOptions(doc).find(
    (candidate) => candidate.featureId === "rogue-uncanny-dodge"
  );
  if (!option) throw new Error("uncanny dodge option missing");
  return option;
}

describe("damage-reaction runtime", () => {
  it("offers uncanny dodge as an answer-free attack-delivered reaction", () => {
    const option = uncannyDodgeOption(heroDoc());
    expect(option.rowId).toBe("rogue-uncanny-dodge-reaction");
    expect(option.deliveries).toEqual(["attack"]);
    expect(option.trigger).toBe("hitByAttack");
    expect(option.program.phases.every((phase) => phase.inputs.length === 0)).toBe(true);
  });

  it("composes the entered hit into the reaction program fail-closed", () => {
    const option = uncannyDodgeOption(heroDoc());
    const composed = composeDamageEntryProgram(option.program, "attack", [
      { amount: 10, damageType: "slashing" },
    ]);
    expect(composed).not.toBeNull();
    expect(composed?.id).toBe("action:rogue-uncanny-dodge:0:entered-hit");
    // Zero/negative or empty parts never compose.
    expect(composeDamageEntryProgram(option.program, "attack", [])).toBeNull();
    expect(
      composeDamageEntryProgram(option.program, "attack", [
        { amount: 0, damageType: "fire" },
      ])
    ).toBeNull();
  });

  it("halves an attack-delivered 10, claims the reaction, and one undo restores both", () => {
    const doc = heroDoc();
    const option = uncannyDodgeOption(doc);
    const run = runDamageReactionEntry(
      doc,
      UID,
      option,
      [{ amount: 10, damageType: "slashing" }],
      1
    );
    expect(run).not.toBeNull();
    if (!run) return;

    // The lazy solo-encounter start is its own one-way boundary commit.
    expect(run.encounterStart).not.toBeNull();
    expect(run.fullDamage).toBe(10);
    // Uncanny Dodge: the rogue TAKES ⌊10/2⌋ = 5 (reduction ⌈10/2⌉ = 5).
    expect(run.takenDamage).toBe(5);
    expect(run.reaction.world.vitals.hitPoints.current).toBe(33);
    expect(run.reaction.session.hp.current).toBe(33);

    // The round's Reaction is claimed on the solo participant's economy ledger.
    const economy = run.reaction.world.encounter?.participants.self?.economy;
    expect(economy?.reactions).toHaveLength(1);
    expect(economy?.reactions[0]).toMatchObject({
      kind: "program",
      requirementId: "reaction.rogue-uncanny-dodge.0",
    });

    // The spent reaction never lingers armed: no live program occurrence
    // remains that could halve a later hit without paying again.
    const lingering = Object.values(run.reaction.world.occurrences).filter(
      (occurrence) => occurrence.kind === "program" && occurrence.ending === null
    );
    expect(lingering).toHaveLength(0);

    // ONE exact journal undo restores the hit points AND the reaction claim.
    const after: CharacterDoc = { ...doc, session: run.reaction.session };
    const undone = undoDamageReactionEntry(after, UID, run.reaction.actionId);
    expect(undone).not.toBeNull();
    expect(undone?.world.vitals.hitPoints.current).toBe(38);
    expect(undone?.session.hp.current).toBe(38);
    expect(undone?.world.encounter?.participants.self?.economy.reactions).toHaveLength(0);
  });

  it("rejects a second reaction in the same round (the economy ledger caps one)", () => {
    const doc = heroDoc();
    const first = runDamageReactionEntry(
      doc,
      UID,
      uncannyDodgeOption(doc),
      [{ amount: 10, damageType: "slashing" }],
      1
    );
    expect(first).not.toBeNull();
    if (!first) return;
    const after: CharacterDoc = { ...doc, session: first.reaction.session };
    const second = runDamageReactionEntry(
      after,
      UID,
      uncannyDodgeOption(after),
      [{ amount: 8, damageType: "piercing" }],
      1
    );
    expect(second).toBeNull();
  });
});
