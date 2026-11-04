/**
 * A use's standing effect on its targets (Warding Bond on an ally, Hunter's Mark on
 * an enemy): one encounter effect per target, the duration its lifetime says, and
 * the caster's spellcasting modifier frozen on it.
 */
import { describe, expect, it } from "vitest";

import type { CombatStandingEffectSpec } from "@/lib/combat-resolution";
import { standingEffectsForTargets } from "@/lib/play/standing-effects";
import type { CombatantRef } from "@/types/combat-effect";

const caster: CombatantRef = {
  kind: "pc",
  combatantId: "pc-me",
  memberUid: "me",
  characterId: "c1",
};
const ally: CombatantRef = {
  kind: "pc",
  combatantId: "pc-ally",
  memberUid: "ally",
  characterId: "c2",
};
const position = {
  round: 2,
  currentCombatantId: "pc-me",
  phase: "turn-start" as const,
  order: ["pc-me", "pc-ally", "m-1"],
};
const spec = (
  lifetime: CombatStandingEffectSpec["lifetime"]
): CombatStandingEffectSpec => ({
  source: { kind: "spell", id: "warding-bond", actionId: "cast", castLevel: 2 },
  payload: { kind: "grant-group", activeKey: "spell-warding-bond" },
  lifetime,
});
let n = 0;
const newId = () => `fx-${String(++n)}`;

describe("standingEffectsForTargets", () => {
  it("leaves one effect per target with the caster's modifier frozen on it", () => {
    const [effect] = standingEffectsForTargets({
      spec: spec({ concentration: false }),
      caster,
      targets: [ally],
      position,
      spellcastingModifier: 4,
      newId,
    });
    expect(effect).toMatchObject({
      actor: caster,
      target: ally,
      source: { id: "warding-bond", castLevel: 2 },
      payload: { kind: "grant-group", activeKey: "spell-warding-bond" },
      bindings: { spellcastingModifier: 4 },
      duration: { kind: "encounter" },
    });
  });

  it("is held by Concentration, or ends at the caster's turn edge or after its rounds", () => {
    const one = (lifetime: CombatStandingEffectSpec["lifetime"]) =>
      standingEffectsForTargets({
        spec: spec(lifetime),
        caster,
        targets: [ally],
        position,
        newId,
      })[0]?.duration;
    expect(one({ concentration: true })).toEqual({
      kind: "concentration",
      actorId: "pc-me",
      sourceId: "warding-bond",
    });
    expect(
      one({ concentration: false, turnBoundary: { phase: "turn-start", turns: 1 } })
    ).toMatchObject({ kind: "turn-boundary", combatantId: "pc-me", round: 3 });
    expect(one({ concentration: false, maxRounds: 10 })).toEqual({
      kind: "turn-boundary",
      combatantId: "pc-me",
      round: 12,
      phase: "turn-end",
    });
  });
});
