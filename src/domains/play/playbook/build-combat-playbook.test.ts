/**
 * The combat playbook core, read on real builds (dev scenarios infer features,
 * slots and trackers the way character creation does). Assertions are about
 * structure and why-keys, never prose.
 */
import { describe, expect, it } from "vitest";
import { buildScenario, type ScenarioSpec } from "@/lib/dev-scenarios";
import { concentrationValue } from "@/lib/concentration";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CharacterDoc } from "@/types/character";
import { buildCombatPlaybook } from "./build-combat-playbook";
import type { Playbook, PlaybookStep } from "./types";

type Extra = Partial<
  Pick<
    ScenarioSpec,
    "sessionHpCurrent" | "sessionTrackers" | "sessionSpellSlots" | "conditions"
  >
>;

const fighter = (level: number, extra: Extra = {}): CharacterDoc =>
  buildScenario({
    name: `Fighter ${level}`,
    raceId: "human",
    classId: "fighter",
    ...(level >= 3 ? { subclassId: "champion" } : {}),
    level,
    background: "soldier",
    abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 8 },
    weapons: [{ srdId: "longsword", quantity: 1 }],
    weaponMasteries: ["longsword"],
    ...extra,
  });

const cleric = (level: number, extra: Extra = {}): CharacterDoc =>
  buildScenario({
    name: `Cleric ${level}`,
    raceId: "human",
    classId: "cleric",
    ...(level >= 3 ? { subclassId: "life-domain" } : {}),
    level,
    background: "acolyte",
    abilityScores: { STR: 12, DEX: 10, CON: 14, INT: 10, WIS: 18, CHA: 12 },
    weapons: [{ srdId: "mace", quantity: 1 }],
    spells: [
      { srdId: "sacred-flame" },
      { srdId: "healing-word", prepared: true },
      { srdId: "bless", prepared: true },
      ...(level >= 3 ? [{ srdId: "spiritual-weapon", prepared: true }] : []),
    ],
    ...extra,
  });

const wizard = (level: number, extra: Extra = {}): CharacterDoc =>
  buildScenario({
    name: `Wizard ${level}`,
    raceId: "human",
    classId: "wizard",
    level,
    background: "sage",
    abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 18, WIS: 12, CHA: 10 },
    spells: [
      { srdId: "fire-bolt" },
      { srdId: "shield", prepared: true },
      { srdId: "magic-missile", prepared: true },
      ...(level >= 5
        ? [
            { srdId: "fireball", prepared: true },
            { srdId: "hold-person", prepared: true },
          ]
        : []),
    ],
    ...extra,
  });

const rogue = (level: number, extra: Extra = {}): CharacterDoc =>
  buildScenario({
    name: `Rogue ${level}`,
    raceId: "human",
    classId: "rogue",
    ...(level >= 3 ? { subclassId: "thief" } : {}),
    level,
    background: "criminal",
    abilityScores: { STR: 10, DEX: 18, CON: 14, INT: 12, WIS: 13, CHA: 14 },
    weapons: [
      { srdId: "shortsword", quantity: 1 },
      { srdId: "shortbow", quantity: 1 },
    ],
    weaponMasteries: ["shortsword", "shortbow"],
    ...extra,
  });

const concentrating = (doc: CharacterDoc, spellId: string): CharacterDoc => ({
  ...doc,
  session: { ...doc.session, concentration: concentrationValue(spellId) },
});

function step(pb: Playbook, id: string): PlaybookStep {
  const found = pb.steps.find((s) => s.id === id);
  if (!found) throw new Error(`no step ${id} in ${pb.steps.map((s) => s.id).join(", ")}`);
  return found;
}
const stepIds = (pb: Playbook): string[] => pb.steps.map((s) => s.id);
const whyKeys = (s: PlaybookStep): string[] => s.why.map((w) => w.key);
const optionIds = (s: PlaybookStep): string[] => s.options.map((o) => o.actionId);
const pick = (pb: Playbook, slot: string): string | undefined =>
  pb.plan.picks.find((p) => p.slot === slot)?.actionId;

describe("buildCombatPlaybook: shape and guarantees", () => {
  it("is deterministic and plain data", () => {
    const a = buildCombatPlaybook(cleric(5), { round: 1 });
    const b = buildCombatPlaybook(cleric(5), { round: 1 });
    expect(a).toEqual(b);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
    expect(a.version).toBe(1);
  });

  it("orders steps by economy slot, then priority", () => {
    const pb = buildCombatPlaybook(rogue(5));
    const order = ["movement", "action", "bonus", "free", "reaction"];
    const slots = pb.steps.map((s) => order.indexOf(s.slot));
    expect(slots).toEqual([...slots].sort((x, y) => x - y));
    for (const slot of order) {
      const pr = pb.steps.filter((s) => s.slot === slot).map((s) => s.priority);
      expect(pr).toEqual([...pr].sort((x, y) => y - x));
    }
  });

  it("explains every step and names the action behind every option", () => {
    for (const doc of [fighter(5), cleric(5), wizard(5), rogue(5)]) {
      for (const s of buildCombatPlaybook(doc).steps) {
        expect(s.why.length, s.id).toBeGreaterThan(0);
        expect(s.origin).toBe("generated");
        if (s.slot !== "movement") expect(s.options.length, s.id).toBeGreaterThan(0);
      }
    }
  });

  it("starts every turn with a move: into melee for a weapon fighter, at range for a caster", () => {
    expect(whyKeys(step(buildCombatPlaybook(fighter(1)), "movement:position"))).toContain(
      "move-to-melee"
    );
    expect(whyKeys(step(buildCombatPlaybook(wizard(1)), "movement:position"))).toContain(
      "keep-range"
    );
    expect(pick(buildCombatPlaybook(fighter(1)), "movement")).toBeUndefined();
    expect(buildCombatPlaybook(fighter(1)).plan.picks[0]).toEqual({
      slot: "movement",
      stepId: "movement:position",
    });
  });

  it("reads the hand-written playbook as stored, next to the generated one", () => {
    const pb = buildCombatPlaybook(MOCK_CHARACTER);
    expect(pb.authored).toBe(MOCK_CHARACTER.character.combatAlgorithm);
    expect(pb.authored.length).toBeGreaterThan(0);
    expect(pb.steps.length).toBeGreaterThan(0);
  });

  it("blocks every action, bonus and reaction step while Incapacitated", () => {
    const pb = buildCombatPlaybook(fighter(5, { conditions: ["stunned"] }));
    for (const s of pb.steps.filter((x) => x.slot !== "movement")) {
      expect(s.status, s.id).toBe("blocked");
      expect(whyKeys(s)).toContain("cannot-act");
    }
    expect(pb.plan.picks.filter((p) => p.slot !== "movement")).toEqual([]);
  });
});

describe("Fighter", () => {
  it("level 1: one attack with the mastered longsword, Second Wind when Bloodied", () => {
    const pb = buildCombatPlaybook(fighter(1));
    const attack = step(pb, "action:default-attack");
    expect(optionIds(attack)[0]).toBe("weapon-longsword");
    expect(attack.when).toEqual({ kind: "always" });
    expect(attack.why).toContainEqual(
      expect.objectContaining({ key: "weapon-mastery", params: { mastery: "Sap" } })
    );
    expect(whyKeys(attack)).not.toContain("extra-attack");

    const wind = step(pb, "bonus:self-heal-bloodied");
    expect(optionIds(wind)).toEqual(["fighter-second-wind-bonus"]);
    expect(wind.when).toEqual({ kind: "self-bloodied" });
    expect(wind.options[0]?.spend).toEqual(
      expect.objectContaining({ kind: "tracker", trackerId: "fighter-second-wind" })
    );
    expect(stepIds(pb)).not.toContain("free:burst-tough-foe");
  });

  it("level 1: plans Second Wind only once Bloodied", () => {
    expect(pick(buildCombatPlaybook(fighter(1)), "bonus")).toBeUndefined();
    const hurt = buildCombatPlaybook(fighter(1, { sessionHpCurrent: 3 }));
    expect(step(hurt, "bonus:self-heal-bloodied").applies).toBe(true);
    expect(pick(hurt, "bonus")).toBe("fighter-second-wind-bonus");
    expect(pick(hurt, "action")).toBe("weapon-longsword");
  });

  it("level 5: Extra Attack explains the attack; Action Surge waits for a tough foe", () => {
    const pb = buildCombatPlaybook(fighter(5));
    expect(step(pb, "action:default-attack").why).toContainEqual(
      expect.objectContaining({ key: "extra-attack", params: { attacks: 2 } })
    );
    const surge = step(pb, "free:burst-tough-foe");
    expect(optionIds(surge)).toEqual(["fighter-action-surge-free"]);
    expect(surge.when).toEqual({ kind: "tough-foe" });
    expect(whyKeys(surge)).toEqual(expect.arrayContaining(["extra-action", "recharges"]));
    expect(surge.applies).toBe("unknown");
    expect(pick(pb, "free")).toBeUndefined();
    expect(pick(buildCombatPlaybook(fighter(5), { toughFoe: true }), "free")).toBe(
      "fighter-action-surge-free"
    );
  });

  it("level 5: a used Action Surge is spent and never planned", () => {
    const pb = buildCombatPlaybook(
      fighter(5, { sessionTrackers: { "fighter-action-surge": { used: 1 } } }),
      { toughFoe: true }
    );
    const surge = step(pb, "free:burst-tough-foe");
    expect(surge.status).toBe("spent");
    expect(whyKeys(surge)).toContain("no-uses-left");
    expect(pick(pb, "free")).toBeUndefined();
  });
});

describe("Cleric", () => {
  it("level 1: Sacred Flame by default, Healing Word for a downed ally, no Channel Divinity yet", () => {
    const pb = buildCombatPlaybook(cleric(1));
    const attack = step(pb, "action:default-attack");
    expect(optionIds(attack)[0]).toBe("spell-sacred-flame");
    expect(whyKeys(attack)).toContain("cantrip-no-cost");

    const heal = step(pb, "bonus:heal-ally-down");
    expect(optionIds(heal)[0]).toBe("spell-healing-word");
    expect(heal.when).toEqual({ kind: "ally-down" });
    expect(whyKeys(heal)).toEqual(
      expect.arrayContaining(["revives-ally", "keeps-action-free", "costs-slot"])
    );
    expect(heal.options[0]?.spend).toEqual({ kind: "slot", level: 1 });
    expect(stepIds(pb)).not.toContain("action:burst-tough-foe");
  });

  it("level 5: Channel Divinity (Divine Spark) is the burst for a tough foe", () => {
    const burst = step(buildCombatPlaybook(cleric(5)), "action:burst-tough-foe");
    expect(optionIds(burst)).toContain("cleric-divine-spark-action");
    expect(burst.options[0]?.spend).toEqual(
      expect.objectContaining({ kind: "tracker", trackerId: "cleric-channel-divinity" })
    );
    expect(whyKeys(burst)).toEqual(expect.arrayContaining(["limited-use", "recharges"]));
  });

  it("level 5: round 1 opens with Spiritual Weapon and still attacks; one slot spell per turn", () => {
    const pb = buildCombatPlaybook(cleric(5), { round: 1 });
    expect(step(pb, "bonus:concentration-opener").why).toContainEqual(
      expect.objectContaining({ key: "one-concentration" })
    );
    expect(pick(pb, "bonus")).toBe("spell-spiritual-weapon");
    expect(pick(pb, "action")).toBe("spell-sacred-flame");
    expect(pb.plan.skipped).toContainEqual({
      stepId: "action:concentration-opener",
      reason: "one-concentration",
    });
  });

  it("a utility Concentration spell (Detect Magic) never opens the fight; Bless does", () => {
    const doc = buildScenario({
      name: "Cleric 5 (Detect Magic)",
      raceId: "human",
      classId: "cleric",
      subclassId: "life-domain",
      level: 5,
      background: "acolyte",
      abilityScores: { STR: 12, DEX: 10, CON: 14, INT: 10, WIS: 18, CHA: 12 },
      weapons: [{ srdId: "mace", quantity: 1 }],
      spells: [
        { srdId: "sacred-flame" },
        { srdId: "detect-magic", prepared: true },
        { srdId: "bless", prepared: true },
      ],
    });
    const opener = step(
      buildCombatPlaybook(doc, { round: 1 }),
      "action:concentration-opener"
    );
    expect(optionIds(opener)).toContain("spell-bless");
    expect(optionIds(opener)).not.toContain("spell-detect-magic");
  });

  it("level 5: an ally at 0 HP beats the opener", () => {
    const pb = buildCombatPlaybook(cleric(5), { round: 1, allyDown: true });
    expect(pick(pb, "bonus")).toBe("spell-healing-word");
    expect(pick(pb, "action")).toBe("spell-sacred-flame");
  });

  it("level 5: already concentrating blocks a second concentration spell", () => {
    const pb = buildCombatPlaybook(concentrating(cleric(5), "bless"), { round: 1 });
    const opener = step(pb, "bonus:concentration-opener");
    expect(opener.status).toBe("blocked");
    expect(opener.why).toContainEqual(
      expect.objectContaining({
        key: "already-concentrating",
        params: { spell: "bless" },
      })
    );
    expect(pick(pb, "bonus")).toBeUndefined();
  });
});

describe("Wizard", () => {
  it("level 1: Fire Bolt by default, Shield held for a hit, no area spell", () => {
    const pb = buildCombatPlaybook(wizard(1));
    expect(optionIds(step(pb, "action:default-attack"))[0]).toBe("spell-fire-bolt");
    const shield = step(pb, "reaction:reaction-defense");
    expect(optionIds(shield)).toEqual(["spell-shield"]);
    expect(shield.when).toEqual({ kind: "reaction", on: "hitOrMagicMissileTarget" });
    expect(shield.options[0]?.spend).toEqual({ kind: "slot", level: 1 });
    expect(pick(pb, "reaction")).toBe("spell-shield");
    expect(stepIds(pb)).not.toContain("action:area-when-grouped");
  });

  it("level 5: Fireball when 3 or more enemies are grouped, Fire Bolt otherwise", () => {
    const area = step(buildCombatPlaybook(wizard(5)), "action:area-when-grouped");
    expect(optionIds(area)).toEqual(["spell-fireball"]);
    expect(area.when).toEqual({ kind: "enemies-grouped", min: 3 });
    expect(area.options[0]?.spend).toEqual({ kind: "slot", level: 3 });
    expect(whyKeys(area)).toEqual(
      expect.arrayContaining(["area-hits-many", "costs-slot"])
    );

    expect(pick(buildCombatPlaybook(wizard(5), { enemiesGrouped: 3 }), "action")).toBe(
      "spell-fireball"
    );
    expect(pick(buildCombatPlaybook(wizard(5), { enemiesGrouped: 2 }), "action")).toBe(
      "spell-fire-bolt"
    );
    const grouped = buildCombatPlaybook(wizard(5), { enemiesGrouped: 3 });
    expect(grouped.plan.picks.filter((p) => p.slot === "action")).toHaveLength(1);
    expect(grouped.plan.skipped).toContainEqual({
      stepId: "action:default-attack",
      reason: "slot-taken",
    });
  });

  it("level 5: with no slot left Fireball is spent and Fire Bolt carries the turn", () => {
    const pb = buildCombatPlaybook(
      wizard(5, {
        sessionSpellSlots: { "1": { used: 4 }, "2": { used: 3 }, "3": { used: 2 } },
      }),
      { enemiesGrouped: 5 }
    );
    const area = step(pb, "action:area-when-grouped");
    expect(area.status).toBe("spent");
    expect(whyKeys(area)).toContain("no-slot-left");
    expect(pick(pb, "action")).toBe("spell-fire-bolt");
  });

  it("level 5: Hold Person is a concentration control spell, blocked while concentrating", () => {
    const control = step(buildCombatPlaybook(wizard(5)), "action:control-tough-foe");
    expect(optionIds(control)).toEqual(["spell-hold-person"]);
    expect(control.when).toEqual({ kind: "tough-foe" });
    expect(whyKeys(control)).toEqual(
      expect.arrayContaining(["controls-foe", "one-concentration"])
    );

    const busy = buildCombatPlaybook(concentrating(wizard(5), "hold-person"), {
      toughFoe: true,
    });
    expect(step(busy, "action:control-tough-foe").status).toBe("blocked");
    expect(pick(busy, "action")).toBe("spell-fire-bolt");
  });
});

describe("Rogue", () => {
  it("level 1: Sneak Attack rides the attack when it has Advantage or an ally is adjacent", () => {
    const pb = buildCombatPlaybook(rogue(1));
    const attack = step(pb, "action:default-attack");
    expect(optionIds(attack)).toEqual(["weapon-shortbow", "weapon-shortsword"]);
    expect(whyKeys(attack)).toContain("works-at-range");
    expect(whyKeys(step(pb, "movement:position"))).toContain("keep-range");
    expect(attack.why).toContainEqual(
      expect.objectContaining({
        key: "sneak-attack",
        params: { dice: "1d6" },
        when: { kind: "advantage-or-ally-adjacent" },
      })
    );
    expect(stepIds(pb).filter((id) => id.startsWith("bonus:"))).toEqual([]);
    expect(stepIds(pb)).not.toContain("reaction:reaction-defense");
  });

  it("level 5: Cunning Action gives Disengage, Hide and Dash as bonus steps", () => {
    const pb = buildCombatPlaybook(rogue(5));
    expect(step(pb, "action:default-attack").why).toContainEqual(
      expect.objectContaining({ key: "sneak-attack", params: { dice: "3d6" } })
    );
    expect(optionIds(step(pb, "bonus:disengage-when-adjacent"))).toEqual([
      "rogue-cunning-action-disengage",
    ]);
    expect(step(pb, "bonus:disengage-when-adjacent").when).toEqual({
      kind: "enemy-adjacent",
    });
    expect(optionIds(step(pb, "bonus:hide-when-possible"))).toEqual([
      "rogue-cunning-action-hide",
    ]);
    expect(optionIds(step(pb, "bonus:dash-when-far"))).toContain(
      "rogue-cunning-action-dash"
    );
    expect(optionIds(step(pb, "bonus:set-up-advantage"))).toEqual([
      "rogue-steady-aim-bonus",
    ]);
    expect(pick(pb, "bonus")).toBeUndefined();
    expect(pick(buildCombatPlaybook(rogue(5), { enemyAdjacent: true }), "bonus")).toBe(
      "rogue-cunning-action-disengage"
    );
  });

  it("level 5: Uncanny Dodge is the reaction when hit", () => {
    const pb = buildCombatPlaybook(rogue(5));
    const dodge = step(pb, "reaction:reaction-defense");
    expect(optionIds(dodge)).toEqual(["rogue-uncanny-dodge-reaction"]);
    expect(dodge.when).toEqual({ kind: "reaction", on: "hitByAttack" });
    expect(pick(pb, "reaction")).toBe("rogue-uncanny-dodge-reaction");
    expect(optionIds(step(pb, "reaction:opportunity-attack"))).toEqual([
      "base-opportunity-attack",
    ]);
  });
});

describe("player overrides", () => {
  it("a hidden step leaves the steps and the plan but is listed to show again", () => {
    const pb = buildCombatPlaybook(
      fighter(1, { sessionHpCurrent: 3 }),
      {},
      {
        hidden: ["bonus:self-heal-bloodied"],
      }
    );
    expect(stepIds(pb)).not.toContain("bonus:self-heal-bloodied");
    expect(pb.hidden).toEqual(["bonus:self-heal-bloodied"]);
    expect(pick(pb, "bonus")).toBeUndefined();
  });

  it("a pinned step goes first in its slot and wins the plan", () => {
    const pb = buildCombatPlaybook(
      cleric(5),
      { round: 1 },
      {
        pinned: ["action:concentration-opener"],
      }
    );
    const actionSteps = pb.steps.filter((s) => s.slot === "action");
    expect(actionSteps[0]?.id).toBe("action:concentration-opener");
    expect(actionSteps[0]?.pinned).toBe(true);
    expect(whyKeys(actionSteps[0] as PlaybookStep)).toContain("player-pinned");
    expect(pick(pb, "action")).toBe("spell-bless");
    expect(pick(pb, "bonus")).toBeUndefined();
  });

  it("a preferred option moves first in its step", () => {
    const pb = buildCombatPlaybook(
      rogue(5),
      {},
      {
        preferred: { "action:default-attack": "weapon-shortsword" },
      }
    );
    expect(optionIds(step(pb, "action:default-attack"))[0]).toBe("weapon-shortsword");
    expect(pick(pb, "action")).toBe("weapon-shortsword");
  });

  it("an override naming a step that does not exist changes nothing", () => {
    const plain = buildCombatPlaybook(wizard(5));
    const odd = buildCombatPlaybook(
      wizard(5),
      {},
      {
        hidden: ["action:nope"],
        pinned: ["bonus:nope"],
        preferred: { "action:default-attack": "spell-nope" },
      }
    );
    expect(odd.steps).toEqual(plain.steps);
  });
});
