import { beforeEach, describe, expect, it } from "vitest";
import { getSrdFeatureSource } from "@/lib/srd-feature-lookup";
import { getSpellById } from "@/data/spells";
import { buildDevScenario } from "@/lib/dev-scenarios";
import { concentrationValue } from "@/lib/concentration";
import {
  concentrationRoundsLeft,
  deriveStatuses,
  statusRoundCounts,
  type Status,
} from "@/lib/status";
import { castSourceActiveKey, potionTimerKey } from "@/lib/smart-tracker";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import type { CharacterDoc } from "@/types/character";

/** The first `while-active` duration a catalogue entry declares for a key. */
function declaredDuration(
  grants: ReadonlyArray<{ type: string }> | undefined,
  activeKey: string
) {
  for (const grant of grants ?? []) {
    if (
      grant.type === "while-active" &&
      "activeKey" in grant &&
      grant.activeKey === activeKey &&
      "duration" in grant &&
      grant.duration
    ) {
      return grant.duration as {
        kind: string;
        maxRounds?: number;
        maintainedBy?: ReadonlyArray<"attack" | "bonus-extend">;
        endsEarlyOn?: ReadonlyArray<string>;
      };
    }
  }
  throw new Error(`no declared duration for ${activeKey}`);
}

function scenario(id: string): CharacterDoc {
  const doc = buildDevScenario(id);
  if (!doc) throw new Error(`unknown scenario ${id}`);
  return doc;
}

function liveDoc(): CharacterDoc {
  const doc = useCharacterStore.getState().character;
  if (!doc) throw new Error("no character");
  return doc;
}

function statusOf(key: string): Status | undefined {
  return deriveStatuses(liveDoc()).find((status) => status.key === key);
}

describe("deriveStatuses — one read of today's status fields", () => {
  beforeEach(() => {
    useCombatStore.setState({ round: 1 });
    useCharacterStore.getState().setCharacter(null);
  });

  it("is empty when nothing is active", () => {
    expect(deriveStatuses(scenario("scn-barbarian-extra-attack"))).toEqual([]);
  });

  it("reads Rage as a round countdown that maintenance, its triggers and a short rest end", () => {
    const rage = declaredDuration(
      getSrdFeatureSource("barbarian-rage")?.grants,
      "barbarian-rage"
    );
    useCharacterStore.getState().setCharacter(scenario("scn-barbarian-extra-attack"));
    useCharacterStore.getState().setActiveFeature("barbarian-rage", true);

    expect(statusOf("barbarian-rage")).toEqual({
      key: "barbarian-rage",
      source: "barbarian-rage",
      recipient: "self",
      concentration: false,
      lifetime: { kind: "rounds", roundsLeft: rage.maxRounds, tickedRound: 0 },
      endsOn: [
        { kind: "maintenance", by: rage.maintainedBy },
        ...(rage.endsEarlyOn ?? []).map((trigger) => ({ kind: "trigger", trigger })),
        { kind: "rest", rest: "short" },
      ],
    });
  });

  it("reads Shield as an exact owner-turn edge", () => {
    useCharacterStore.getState().setCharacter(scenario("scn-signature-wizard-20"));
    const store = useCharacterStore.getState();
    store.setActiveFeature("spell-shield", true);
    store.armEffectBoundary("spell-shield", { round: 2, phase: "turn-start" });

    const shield = statusOf("spell-shield");
    expect(shield?.source).toBe("shield");
    expect(shield?.concentration).toBe(false);
    expect(shield?.lifetime).toEqual({
      kind: "turn-edge",
      round: 2,
      phase: "turn-start",
    });
  });

  it("flags Bless lit on yourself as held by Concentration, with its cast level", () => {
    const bless = declaredDuration(getSpellById("bless")?.grants, "spell-bless");
    expect(getSpellById("bless")?.concentration).toBe(true);
    useCharacterStore.getState().setCharacter(scenario("scn-life-cleric"));
    const store = useCharacterStore.getState();
    store.setConcentration(concentrationValue("bless"), {
      undoable: false,
      silent: true,
    });
    store.setActiveFeature("spell-bless", true);
    store.setActiveSpellCastLevel("spell-bless", 2);

    const status = statusOf("spell-bless");
    expect(status).toMatchObject({
      source: "bless",
      castLevel: 2,
      concentration: true,
      lifetime: { kind: "rounds", roundsLeft: bless.maxRounds },
    });
    expect(status?.endsOn[0]).toEqual({ kind: "concentration" });
  });

  it("reads a drunk potion's countdown as a status of its item", () => {
    useCharacterStore.getState().setCharacter(scenario("scn-barbarian-extra-attack"));
    useCharacterStore.getState().armEffectTimer(potionTimerKey("potion-of-speed"), 10);

    expect(statusOf(potionTimerKey("potion-of-speed"))).toEqual({
      key: potionTimerKey("potion-of-speed"),
      source: "potion-of-speed",
      recipient: "self",
      concentration: false,
      lifetime: { kind: "rounds", roundsLeft: 10, tickedRound: 0 },
      endsOn: [],
    });
  });

  it("names a cast-source state after its source and keeps a homebrew toggle manual", () => {
    const key = castSourceActiveKey("cleric-war-war-gods-blessing", "spiritual-weapon");
    const doc = scenario("scn-life-cleric");
    const statuses = deriveStatuses({
      ...doc,
      session: { ...doc.session, activeFeatures: [key, "homebrew-glow"] },
    });
    expect(statuses.map((s) => [s.source, s.lifetime])).toEqual([
      ["cleric-war-war-gods-blessing", { kind: "manual" }],
      ["homebrew-glow", { kind: "manual" }],
    ]);
  });
});

describe("concentration rounds", () => {
  beforeEach(() => {
    useCombatStore.setState({ round: 1 });
    useCharacterStore.getState().setCharacter(null);
  });

  it("are the countdown of the status Concentration holds", () => {
    const bless = declaredDuration(getSpellById("bless")?.grants, "spell-bless");
    useCharacterStore.getState().setCharacter(scenario("scn-life-cleric"));
    const store = useCharacterStore.getState();
    store.setConcentration(concentrationValue("bless"), {
      undoable: false,
      silent: true,
    });
    store.setActiveFeature("spell-bless", true);
    const doc = liveDoc();

    expect(concentrationRoundsLeft(deriveStatuses(doc))).toBe(bless.maxRounds);
    useCharacterStore.getState().advanceEffectTimers(1);
    expect(concentrationRoundsLeft(deriveStatuses(liveDoc()))).toBe(
      (bless.maxRounds ?? 0) - 1
    );
  });

  it("are absent while Concentration holds no counting status (Bless only on allies)", () => {
    useCharacterStore.getState().setCharacter(scenario("scn-life-cleric"));
    useCharacterStore
      .getState()
      .setConcentration(concentrationValue("bless"), { undoable: false, silent: true });
    const doc = liveDoc();
    expect(concentrationRoundsLeft(deriveStatuses(doc))).toBeUndefined();
  });

  it("ignore a counting status Concentration does not hold", () => {
    const rage = declaredDuration(
      getSrdFeatureSource("barbarian-rage")?.grants,
      "barbarian-rage"
    );
    useCharacterStore.getState().setCharacter(scenario("scn-barbarian-extra-attack"));
    useCharacterStore.getState().setActiveFeature("barbarian-rage", true);
    const statuses = deriveStatuses(liveDoc());
    expect(concentrationRoundsLeft(statuses)).toBeUndefined();
    expect(statusRoundCounts(statuses)).toEqual({
      "barbarian-rage": { roundsLeft: rage.maxRounds },
    });
  });
});
