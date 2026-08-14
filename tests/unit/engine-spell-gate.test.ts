/**
 * The shared SPELL engine gate (Play board + Spells tab): an engine-executable
 * plain cast produces the flow request; every conservative exclusion — shared
 * encounter, spent Reaction, the once-per-turn leveled-slot rule, a
 * legacy-held concentration — stays legacy. The kernel-side replacement
 * semantics are proven by the world-store e2e; this suite pins the GATE.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import { engineSpellCastRequest } from "@/features/character/center/tabs/spells/engine-spell-gate";
import { spellIndex } from "@/data/spells";
import { concentrationValue } from "@/lib/concentration";
import { MOCK_CHARACTER } from "@/lib/mock";
import { localizeActions } from "@/lib/views/combat-action-view";
import { useCombatStore } from "@/stores/combatStore";
import type { CharacterDoc } from "@/types/character";

const BADGES = { mastery: "mastery", signature: "signature" };

function requestFor(
  character: CharacterDoc,
  spellId: string,
  overrides: Partial<Parameters<typeof engineSpellCastRequest>[0]> = {}
) {
  const action = localizeActions(character, "en", "spellbook").find(
    (row) => row.spellId === spellId
  );
  const spell = spellIndex.get(spellId);
  if (!action || !spell) throw new Error(`row for ${spellId}`);
  return engineSpellCastRequest({
    action,
    badges: BADGES,
    character,
    locale: "en",
    sheetCombat: false,
    spell,
    spellName: action.name,
    uid: "test-uid",
    ...overrides,
  });
}

describe("engineSpellCastRequest", () => {
  beforeEach(() => {
    useCombatStore.getState().endCombat();
  });

  it("approves a plain leveled cast with the exact economy mirror", () => {
    const request = requestFor(MOCK_CHARACTER, "healing-word");
    expect(request).not.toBeNull();
    expect(request).toMatchObject({
      concentrationSwap: null,
      economy: { slot: "bonus", spellLevel: 1, triggersAttack: false },
      hasAttack: false,
      spellId: "healing-word",
    });
  });

  it("stays legacy inside a shared encounter", () => {
    expect(requestFor(MOCK_CHARACTER, "healing-word", { sheetCombat: true })).toBeNull();
  });

  it("stays legacy once the turn's leveled slot is spent", () => {
    const combat = useCombatStore.getState();
    const key = `solo:${MOCK_CHARACTER.id}:${combat.round}`;
    combat.commitSpellSlotCast(key);
    expect(requestFor(MOCK_CHARACTER, "healing-word")).toBeNull();
  });

  it("keeps a legacy-held concentration swap on the legacy path", () => {
    const concentrating: CharacterDoc = {
      ...MOCK_CHARACTER,
      session: { ...MOCK_CHARACTER.session, concentration: concentrationValue("bless") },
    };
    // The session holds a spell but the world owns no engine occurrence, so
    // the kernel cannot replace it: the cast stays with the legacy swap flow.
    const spellId = [...spellIndex.values()].find(
      (spell) =>
        spell.concentration &&
        localizeActions(concentrating, "en", "spellbook").some(
          (row) => row.spellId === spell.id
        )
    )?.id;
    if (spellId === undefined) return;
    expect(requestFor(concentrating, spellId)).toBeNull();
  });
});
