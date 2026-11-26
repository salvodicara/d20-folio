/**
 * Divine Order «Thaumaturge. You know one extra cantrip from the Cleric spell list»
 * and Primal Order «Magician» the same from the Druid list (SRD 5.2.1). A sheet that
 * chose the order but never got the cantrip (built before creation asked it) owes it:
 * «Scelte da completare» counts it and asks it, and answering it clears the debt. A
 * sheet built with it owes nothing.
 */
import { afterEach, describe, expect, it } from "vitest";

import { getSpellById } from "@/data/spells";
import { buildNewCharacter } from "@/lib/creation/build";
import {
  creationDraftReducer,
  initialCreationDraft,
  type CreationDraftAction,
} from "@/lib/creation/draft";
import { applyOwedClassPicks, classPickPool } from "@/lib/owed-class-picks";
import { owedChoiceCount, unresolvedBuildChoices } from "@/lib/unresolved-build-choices";
import { owedClassPickRows } from "@/lib/views/owed-class-picks-view";
import { useCharacterStore } from "@/stores/characterStore";
import type { CharacterData, SessionState } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

const ORDERS = [
  {
    classId: "cleric",
    bundle: "cleric-divine-order",
    extra: "thaumaturge",
    plain: "protector",
  },
  { classId: "druid", bundle: "druid-primal-order", extra: "magician", plain: "warden" },
] as const;

function build(classId: string, bundle: string, order: string) {
  const actions: CreationDraftAction[] = [
    { type: "setName", name: "Audit" },
    { type: "setAlignment", alignment: "neutral" },
    { type: "selectClass", classId },
    { type: "selectRace", raceId: "halfling" },
    { type: "setLineageChoice", bundleKey: bundle, optionId: order },
    { type: "fillReadyMade" },
  ];
  const built = buildNewCharacter(
    actions.reduce(creationDraftReducer, initialCreationDraft()),
    {
      displayName: null,
    }
  );
  if (!built.ok) throw new Error(built.error);
  return { character: built.payload.character, session: built.payload.session };
}

/** The same sheet without the order's cantrip: one built before creation asked it. */
const withoutOrderCantrip = (character: CharacterData): CharacterData => ({
  ...character,
  spells: character.spells.filter((s) => "custom" in s || !s.grantedBy),
});

const cantripDebt = (
  character: CharacterData,
  session: Pick<SessionState, "grantBundleChoices">
) =>
  unresolvedBuildChoices(character, session).find(
    (c) => c.kind === "class-pick" && c.pick === "cantrips"
  );

describe("the order's extra cantrip, owed on a saved sheet", () => {
  for (const { classId, bundle, extra, plain } of ORDERS) {
    it(`${classId}: built with ${extra} at creation owes nothing`, () => {
      const { character, session } = build(classId, bundle, extra);
      expect(owedChoiceCount(character, session)).toBe(0);
    });

    it(`${classId}: ${extra} without the cantrip owes one ${classId} cantrip`, () => {
      const { character, session } = build(classId, bundle, extra);
      const old = withoutOrderCantrip(character);
      expect(cantripDebt(old, session)).toMatchObject({ classId, owed: 1 });
      expect(owedChoiceCount(old, session)).toBe(1);
      const rows = owedClassPickRows(old, "en", session.grantBundleChoices);
      expect(rows.map((r) => [r.key, r.owed])).toEqual([[`${classId}:cantrips`, 1]]);
    });

    it(`${classId}: ${plain} owes nothing`, () => {
      const { character, session } = build(classId, bundle, plain);
      expect(owedChoiceCount(character, session)).toBe(0);
    });

    it(`${classId}: answering the owed cantrip clears it`, () => {
      const { character, session } = build(classId, bundle, extra);
      const old = withoutOrderCantrip(character);
      const pool = classPickPool(old, classId, "cantrips");
      const id = pool[0] ?? "";
      expect(getSpellById(id)?.level).toBe(0);
      const next = applyOwedClassPicks(
        old,
        [{ classId, pick: "cantrips", ids: [id] }],
        session.grantBundleChoices
      );
      expect(next.spells.some((s) => "srdId" in s && s.srdId === id)).toBe(true);
      expect(owedChoiceCount(next, session)).toBe(0);
    });
  }
});

describe("the owed order cantrip saved through the store («Salva»)", () => {
  afterEach(() => {
    useCharacterStore.getState().setCharacter(null);
  });

  it("stores the cantrip and clears the debt", () => {
    const { character, session } = build("cleric", "cleric-divine-order", "thaumaturge");
    const old = withoutOrderCantrip(character);
    const doc = makeCharacterDoc({}, session);
    useCharacterStore.getState().setCharacter({ ...doc, character: old, session });
    const id = classPickPool(old, "cleric", "cantrips")[0] ?? "";
    useCharacterStore
      .getState()
      .resolveClassPicks([{ classId: "cleric", pick: "cantrips", ids: [id] }]);
    const saved = useCharacterStore.getState().character;
    expect(saved?.character.spells.some((s) => "srdId" in s && s.srdId === id)).toBe(
      true
    );
    expect(owedChoiceCount(saved?.character ?? old, session)).toBe(0);
  });
});
