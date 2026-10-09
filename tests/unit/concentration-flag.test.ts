/**
 * Phase 2 step 5 — Concentration is a flag on the statuses it holds, and
 * ending it ends them in one place (`setConcentration` → `endStatuses`).
 * Cases come from the catalogue (the spells' own `while-active` wrappers) and
 * from the real store writers.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { spells } from "@/data/spells";
import { buildDevScenario } from "@/lib/dev-scenarios";
import { concentrationValue, customConcentrationValue } from "@/lib/concentration";
import {
  concentrationStatusKeys,
  deriveStatuses,
  endStatuses,
  endsConcentration,
} from "@/lib/status";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

/** Every SRD concentration spell that holds at least one status. */
const HOLDING_SPELLS = spells.filter(
  (spell) =>
    spell.concentration && spell.grants?.some((grant) => grant.type === "while-active")
);

function liveDoc(): CharacterDoc {
  const doc = useCharacterStore.getState().character;
  if (!doc) throw new Error("no character");
  return doc;
}

describe("concentrationStatusKeys", () => {
  it("covers real spells", () => {
    expect(HOLDING_SPELLS.length).toBeGreaterThan(5);
  });

  it.each(HOLDING_SPELLS.map((spell) => [spell.id, spell] as const))(
    "%s holds exactly its own while-active keys",
    (id, spell) => {
      expect(concentrationStatusKeys(concentrationValue(id))).toEqual(
        spell.grants?.flatMap((grant) =>
          grant.type === "while-active" ? [grant.activeKey] : []
        )
      );
    }
  );

  it("holds nothing for no concentration or a custom spell", () => {
    expect(concentrationStatusKeys("")).toEqual([]);
    expect(concentrationStatusKeys(customConcentrationValue("Bless"))).toEqual([]);
  });
});

describe("endsConcentration", () => {
  it("is true only when an ended status is one Concentration holds", () => {
    const bless = concentrationValue("bless");
    expect(endsConcentration(bless, ["spell-bless"])).toBe(true);
    expect(endsConcentration(bless, ["barbarian-rage", "spell-shield"])).toBe(false);
    expect(endsConcentration("", ["spell-bless"])).toBe(false);
  });
});

describe("endStatuses", () => {
  it("removes the ended keys from every status field and keeps the rest", () => {
    const session = {
      activeFeatures: ["spell-bless", "barbarian-rage"],
      activeSpellCastLevels: { "spell-bless": 2 },
      effectTimers: {
        "spell-bless": { roundsLeft: 4 },
        "barbarian-rage": { roundsLeft: 90 },
      },
      effectBoundaries: { "spell-bless": { round: 3, phase: "turn-start" as const } },
    };
    expect(endStatuses(session, ["spell-bless"])).toEqual({
      activeFeatures: ["barbarian-rage"],
      activeSpellCastLevels: undefined,
      effectTimers: { "barbarian-rage": { roundsLeft: 90 } },
      effectBoundaries: undefined,
    });
  });

  it("returns the fields untouched when nothing ends", () => {
    const session = { activeFeatures: ["x"], effectTimers: { x: { roundsLeft: 1 } } };
    const patch = endStatuses(session, []);
    expect(patch.activeFeatures).toBe(session.activeFeatures);
    expect(patch.effectTimers).toBe(session.effectTimers);
  });
});

describe("dropping Concentration ends what it holds", () => {
  beforeEach(() => {
    useCombatStore.setState({ round: 1 });
    useCharacterStore.getState().setCharacter(null);
  });

  it("a manual drop ends Bless lit on yourself, and no other status", () => {
    const doc = buildDevScenario("scn-life-cleric");
    if (!doc) throw new Error("missing scenario");
    useCharacterStore.getState().setCharacter(doc);
    const store = useCharacterStore.getState();
    store.setConcentration(concentrationValue("bless"), {
      undoable: false,
      silent: true,
    });
    store.setActiveFeature("spell-bless", true);
    store.setActiveFeature("homebrew-glow", true);
    expect(deriveStatuses(liveDoc()).map((s) => [s.key, s.concentration])).toEqual([
      ["spell-bless", true],
      ["homebrew-glow", false],
    ]);

    useCharacterStore.getState().setConcentration("", { undoable: false });
    expect(deriveStatuses(liveDoc()).map((s) => s.key)).toEqual(["homebrew-glow"]);
  });

  it("dropping a Polymorph form ends its Concentration through the one teardown", () => {
    const doc = makeCharacterDoc({ classId: "druid", level: 5 });
    useCharacterStore.getState().setCharacter(doc);
    useCharacterStore.getState().assumePolymorphForm("brown-bear");
    useCharacterStore.setState((state) => ({
      character: state.character && {
        ...state.character,
        session: { ...state.character.session, concentrationCastLevel: 5 },
      },
    }));
    const logBefore = liveDoc().session.logEntries.length;

    const undo = useCharacterStore.getState().dropPolymorphForm();
    const dropped = liveDoc().session;
    expect(dropped.concentration).toBe("");
    expect(dropped.concentrationCastLevel).toBeUndefined();
    expect(dropped.logEntries.slice(logBefore).map((entry) => entry.event)).toEqual([
      { kind: "concentration-end", spell: concentrationValue("polymorph") },
    ]);

    undo?.();
    const restored = liveDoc().session;
    expect(restored.concentration).toBe(concentrationValue("polymorph"));
    expect(restored.concentrationCastLevel).toBe(5);
    expect(restored.polymorphForm?.beastId).toBe("brown-bear");
    expect(restored.logEntries).toHaveLength(logBefore);
  });
});
