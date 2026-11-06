/**
 * Warding Bond: "each time it takes damage, you take the same amount of damage." The
 * damage rule resolves the share (`transfers`, after the target's Resistance); every
 * entry point that commits a hit hands it on, so the caster's sheet takes it
 * (rehearsal 2026-11-06 #4: the caster never took it, because the consumer was
 * deleted with the old effect appliers).
 *
 * The contract: a hit committed on the owner's sheet passes its transfers to the
 * registered sink, and the sink lands each one on the caster as a peer hit that is
 * not an attack (no Uncanny Dodge) and passes nothing further on.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { defaultCombatState } from "@/lib/combat-state";
import { MOCK_CHARACTER } from "@/lib/mock";
import { effectiveDoc } from "@/lib/play/effective-doc";
import { peerHit } from "@/lib/play/peer-damage";
import { useCharacterStore } from "@/stores/characterStore";
import type { ActiveCombatEffect } from "@/types/combat-effect";

const paladin = {
  kind: "pc" as const,
  combatantId: "pc-pal",
  memberUid: "pal",
  characterId: "char-pal",
};

const wardingBond: ActiveCombatEffect = {
  id: "wb-1",
  actor: paladin,
  target: {
    kind: "pc",
    combatantId: "pc-me",
    memberUid: "me",
    characterId: MOCK_CHARACTER.id,
  },
  source: { kind: "spell", id: "warding-bond", actionId: "spell-warding-bond" },
  payload: { kind: "grant-group", activeKey: "spell-warding-bond" },
  duration: { kind: "encounter" },
};

const store = () => useCharacterStore.getState();

beforeEach(() => {
  const character = structuredClone(MOCK_CHARACTER);
  character.session.hp = { ...character.session.hp, current: 40, temp: 0 };
  useCharacterStore.setState({
    character,
    readonly: false,
    encounterEffectProjection: null,
  });
  store().setDamageTransferSink(null);
});

describe("Warding Bond's shared damage leaves the bonded sheet", () => {
  it("a hit on the bonded ally hands the caster the same amount", () => {
    const sink = vi.fn();
    store().setDamageTransferSink(sink);
    store().setEncounterEffects(MOCK_CHARACTER.id, [wardingBond]);
    store().applyDamage(5);
    expect(sink).toHaveBeenCalledWith([{ target: paladin, amount: 5, effectId: "wb-1" }]);
  });

  it("an unbonded hit hands nothing on", () => {
    const sink = vi.fn();
    store().setDamageTransferSink(sink);
    store().applyDamage(5);
    expect(sink).not.toHaveBeenCalled();
  });
});

describe("a hit from another device hands the share on too", () => {
  it("the DM's hit on the bonded ally returns the caster's share", () => {
    const target = effectiveDoc(structuredClone(MOCK_CHARACTER), [wardingBond]);
    const current = { ...defaultCombatState(62), hp: { current: 40, temp: 0 } };
    const hit = peerHit(target, current, [], 6);
    expect(hit.state.hp.current).toBe(34);
    expect(hit.transfers).toEqual([{ target: paladin, amount: 6, effectId: "wb-1" }]);
  });
});
