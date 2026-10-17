/**
 * The playbook's exploration context, read on real builds: out of combat there
 * is no action economy, so every step sits in the `anytime` slot, no reaction
 * waits for a trigger, and the recommendations are rituals, utility cantrips,
 * checks, healing and what a Short Rest gives back. Assertions are about
 * structure and why-keys, never prose.
 */
import { describe, expect, it } from "vitest";
import { buildScenario, type ScenarioSpec } from "@/lib/dev-scenarios";
import { concentrationValue } from "@/lib/concentration";
import type { CharacterDoc } from "@/types/character";
import { buildCombatPlaybook } from "./build-combat-playbook";
import type { Playbook, PlaybookStep } from "./types";

type Extra = Partial<
  Pick<
    ScenarioSpec,
    "sessionHpCurrent" | "sessionTrackers" | "sessionSpellSlots" | "conditions"
  >
>;

const EXPLORING = { mode: "exploration" } as const;

/** A Wizard 5 ritual caster: two rituals left unprepared (Ritual Adept). */
const wizard = (extra: Extra = {}): CharacterDoc =>
  buildScenario({
    name: "Wizard 5",
    raceId: "human",
    classId: "wizard",
    level: 5,
    background: "sage",
    abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 18, WIS: 12, CHA: 10 },
    spells: [
      { srdId: "fire-bolt" },
      { srdId: "light" },
      { srdId: "mage-hand" },
      { srdId: "detect-magic" },
      { srdId: "identify" },
      { srdId: "find-familiar", prepared: true },
      { srdId: "shield", prepared: true },
      { srdId: "magic-missile", prepared: true },
    ],
    ...extra,
  });

/** A Life Cleric 5: Detect Magic prepared, Purify Food and Drink not. */
const cleric = (extra: Extra = {}): CharacterDoc =>
  buildScenario({
    name: "Cleric 5",
    raceId: "human",
    classId: "cleric",
    subclassId: "life-domain",
    level: 5,
    background: "acolyte",
    abilityScores: { STR: 12, DEX: 10, CON: 14, INT: 10, WIS: 18, CHA: 12 },
    weapons: [{ srdId: "mace", quantity: 1 }],
    spells: [
      { srdId: "sacred-flame" },
      { srdId: "guidance" },
      { srdId: "light" },
      { srdId: "healing-word", prepared: true },
      { srdId: "cure-wounds", prepared: true },
      { srdId: "bless", prepared: true },
      { srdId: "detect-magic", prepared: true },
      { srdId: "purify-food-and-drink" },
    ],
    ...extra,
  });

const rogue = (extra: Extra = {}): CharacterDoc =>
  buildScenario({
    name: "Rogue 5",
    raceId: "human",
    classId: "rogue",
    subclassId: "thief",
    level: 5,
    background: "criminal",
    abilityScores: { STR: 10, DEX: 18, CON: 14, INT: 12, WIS: 13, CHA: 14 },
    weapons: [
      { srdId: "shortsword", quantity: 1 },
      { srdId: "shortbow", quantity: 1 },
    ],
    ...extra,
  });

const fighter = (extra: Extra = {}): CharacterDoc =>
  buildScenario({
    name: "Fighter 2",
    raceId: "human",
    classId: "fighter",
    level: 2,
    background: "soldier",
    abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 8 },
    weapons: [{ srdId: "longsword", quantity: 1 }],
    ...extra,
  });

const paladin = (extra: Extra = {}): CharacterDoc =>
  buildScenario({
    name: "Paladin 3",
    raceId: "human",
    classId: "paladin",
    level: 3,
    background: "acolyte",
    abilityScores: { STR: 16, DEX: 10, CON: 14, INT: 8, WIS: 12, CHA: 16 },
    weapons: [{ srdId: "longsword", quantity: 1 }],
    equipment: [{ srdId: "potion-of-healing", quantity: 2 }],
    ...extra,
  });

function step(pb: Playbook, id: string): PlaybookStep {
  const found = pb.steps.find((s) => s.id === id);
  if (!found) throw new Error(`no step ${id} in ${pb.steps.map((s) => s.id).join(", ")}`);
  return found;
}
const stepIds = (pb: Playbook): string[] => pb.steps.map((s) => s.id);
const whyKeys = (s: PlaybookStep): string[] => s.why.map((w) => w.key);
const optionIds = (s: PlaybookStep): string[] => s.options.map((o) => o.actionId);
const picked = (pb: Playbook): Array<string | undefined> =>
  pb.plan.picks.map((p) => p.actionId ?? p.stepId);

describe("exploration playbook: shape", () => {
  it("is deterministic plain data, marked as exploration, with no action economy", () => {
    const a = buildCombatPlaybook(wizard(), EXPLORING);
    expect(a).toEqual(buildCombatPlaybook(wizard(), EXPLORING));
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
    expect(a.mode).toBe("exploration");
    expect(buildCombatPlaybook(wizard()).mode).toBe("combat");
    for (const doc of [wizard(), cleric(), rogue(), fighter()]) {
      const pb = buildCombatPlaybook(doc, EXPLORING);
      expect(pb.steps.length).toBeGreaterThan(0);
      for (const s of pb.steps) {
        expect(s.slot, s.id).toBe("anytime");
        expect(s.when.kind, s.id).not.toBe("reaction");
        expect(s.why.length, s.id).toBeGreaterThan(0);
      }
      for (const p of pb.plan.picks) expect(p.slot).toBe("anytime");
      expect(pb.plan.skipped.map((x) => x.reason)).not.toContain("slot-taken");
    }
  });

  it("drops the turn-only steps: no movement, attack, reaction or opportunity attack", () => {
    const ids = stepIds(buildCombatPlaybook(wizard(), EXPLORING));
    for (const turnOnly of ["position", "default-attack", "reaction-defense"]) {
      expect(
        ids.some((id) => id.endsWith(`:${turnOnly}`)),
        turnOnly
      ).toBe(false);
    }
    expect(ids.every((id) => id.startsWith("anytime:"))).toBe(true);
  });

  it("orders steps by priority", () => {
    const pr = buildCombatPlaybook(cleric({ sessionHpCurrent: 10 }), EXPLORING).steps.map(
      (s) => s.priority
    );
    expect(pr).toEqual([...pr].sort((x, y) => y - x));
  });
});

describe("Wizard ritual caster", () => {
  it("casts every ritual in the spellbook as a ritual, prepared or not, with no slot", () => {
    const rituals = step(
      buildCombatPlaybook(wizard(), EXPLORING),
      "anytime:ritual-no-slot"
    );
    expect(optionIds(rituals)).toEqual([
      "spell-detect-magic",
      "spell-identify",
      "spell-find-familiar",
    ]);
    for (const o of rituals.options) {
      expect(o.spend, o.actionId).toBeUndefined();
      expect(o.limits ?? [], o.actionId).not.toContain("one-slot-spell");
    }
    expect(rituals.options[0]?.limits).toEqual(["one-concentration"]);
    expect(rituals.why).toContainEqual(
      expect.objectContaining({ key: "ritual-no-slot", params: { minutes: 10 } })
    );
    expect(rituals.when).toEqual({ kind: "always" });
  });

  it("keeps rituals ready with every slot spent", () => {
    const pb = buildCombatPlaybook(
      wizard({
        sessionSpellSlots: { "1": { used: 4 }, "2": { used: 3 }, "3": { used: 2 } },
      }),
      EXPLORING
    );
    const rituals = step(pb, "anytime:ritual-no-slot");
    expect(rituals.status).toBe("ready");
    expect(rituals.options.every((o) => o.available)).toBe(true);
    expect(picked(pb)).toContain("spell-detect-magic");
  });

  it("while concentrating, skips a concentration ritual for one that needs none", () => {
    const doc = wizard();
    const busy: CharacterDoc = {
      ...doc,
      session: { ...doc.session, concentration: concentrationValue("detect-magic") },
    };
    const pb = buildCombatPlaybook(busy, EXPLORING);
    const rituals = step(pb, "anytime:ritual-no-slot");
    expect(rituals.status).toBe("ready");
    expect(rituals.options[0]?.available).toBe(false);
    expect(picked(pb)).toContain("spell-identify");
  });

  it("offers the utility cantrips, never the damage cantrip", () => {
    const utility = step(
      buildCombatPlaybook(wizard(), EXPLORING),
      "anytime:utility-cantrip"
    );
    expect(optionIds(utility)).toEqual(["spell-light", "spell-mage-hand"]);
    expect(whyKeys(utility)).toContain("cantrip-no-cost");
  });
});

describe("Cleric", () => {
  it("rituals need the spell prepared: Detect Magic yes, Purify Food and Drink no", () => {
    const rituals = step(
      buildCombatPlaybook(cleric(), EXPLORING),
      "anytime:ritual-no-slot"
    );
    expect(optionIds(rituals)).toEqual(["spell-detect-magic"]);
  });

  it("when hurt, heals with a feature use first (Divine Spark), then the cheapest slot", () => {
    const pb = buildCombatPlaybook(cleric({ sessionHpCurrent: 20 }), EXPLORING);
    const heal = step(pb, "anytime:recover-hp");
    expect(heal.when).toEqual({ kind: "self-hurt" });
    expect(heal.applies).toBe(true);
    expect(optionIds(heal).slice(0, 3)).toEqual([
      "cleric-divine-spark-action",
      "spell-healing-word",
      "spell-cure-wounds",
    ]);
    expect(heal.options[0]?.spend).toEqual(
      expect.objectContaining({ kind: "tracker", recovery: "short-rest" })
    );
    expect(whyKeys(heal)).toEqual(
      expect.arrayContaining(["cheapest-first", "recharges"])
    );
    expect(picked(pb)[0]).toBe("cleric-divine-spark-action");
  });

  it("at full HP the heal step is listed but not planned", () => {
    const pb = buildCombatPlaybook(cleric(), EXPLORING);
    expect(step(pb, "anytime:recover-hp").applies).toBe(false);
    expect(pb.plan.picks.map((p) => p.stepId)).not.toContain("anytime:recover-hp");
  });

  it("offers Guidance and Light as utility, and the checks", () => {
    const pb = buildCombatPlaybook(cleric(), EXPLORING);
    expect(optionIds(step(pb, "anytime:utility-cantrip"))).toEqual([
      "spell-guidance",
      "spell-light",
    ]);
    expect(optionIds(step(pb, "anytime:exploration-check"))).toEqual([
      "base-search",
      "base-study",
      "base-influence",
      "base-hide",
    ]);
  });
});

describe("Rogue", () => {
  it("has no rituals or cantrips: checks, with no Cunning Action or Sneak Attack", () => {
    const pb = buildCombatPlaybook(rogue(), EXPLORING);
    expect(stepIds(pb)).not.toContain("anytime:ritual-no-slot");
    expect(stepIds(pb)).not.toContain("anytime:utility-cantrip");
    const checks = step(pb, "anytime:exploration-check");
    expect(optionIds(checks)).toEqual([
      "base-search",
      "base-study",
      "base-influence",
      "base-hide",
    ]);
    expect(checks.why).toContainEqual(
      expect.objectContaining({ key: "exploration-check", params: { check: "search" } })
    );
    expect(checks.options.every((o) => o.spend === undefined)).toBe(true);
    const all = pb.steps.flatMap(optionIds);
    expect(all.some((id) => id.startsWith("rogue-cunning-action"))).toBe(false);
    expect(pb.steps.flatMap((s) => s.why).map((w) => w.key)).not.toContain(
      "sneak-attack"
    );
  });
});

describe("healing and Short Rest hints", () => {
  it("Fighter: Second Wind heals out of combat, and the Short Rest gives it back", () => {
    const pb = buildCombatPlaybook(
      fighter({
        sessionHpCurrent: 10,
        sessionTrackers: { "fighter-second-wind": { used: 1 } },
      }),
      EXPLORING
    );
    expect(optionIds(step(pb, "anytime:recover-hp"))).toEqual([
      "fighter-second-wind-bonus",
    ]);
    const rest = step(pb, "anytime:short-rest-recovery");
    expect(rest.options).toEqual([]);
    expect(rest.why).toContainEqual(
      expect.objectContaining({
        key: "recovers-on-short-rest",
        params: { used: 1, total: 2 },
        source: { kind: "feature", id: "fighter-second-wind" },
      })
    );
    expect(rest.why).toContainEqual(
      expect.objectContaining({ key: "hit-dice-heal", params: { left: 2, total: 2 } })
    );
    expect(pb.plan.picks.map((p) => p.stepId)).toContain("anytime:short-rest-recovery");
  });

  it("Fighter: nothing spent and full HP gives no Short Rest hint", () => {
    expect(stepIds(buildCombatPlaybook(fighter(), EXPLORING))).not.toContain(
      "anytime:short-rest-recovery"
    );
  });

  it("Paladin: Lay on Hands before a Potion of Healing, which is spent from the pack", () => {
    const heal = step(
      buildCombatPlaybook(paladin({ sessionHpCurrent: 5 }), EXPLORING),
      "anytime:recover-hp"
    );
    expect(optionIds(heal)).toEqual([
      "paladin-lay-on-hands-bonus",
      "item-potion-of-healing",
    ]);
    expect(heal.options[1]?.spend).toEqual({ kind: "item", itemId: "potion-of-healing" });
    expect(whyKeys(heal)).toContain("uses-item");
  });

  it("Incapacitated blocks the actions but still shows what a Short Rest gives back", () => {
    const pb = buildCombatPlaybook(
      fighter({
        sessionHpCurrent: 10,
        sessionTrackers: { "fighter-second-wind": { used: 1 } },
        conditions: ["stunned"],
      }),
      EXPLORING
    );
    expect(step(pb, "anytime:recover-hp").status).toBe("blocked");
    expect(step(pb, "anytime:short-rest-recovery").status).toBe("ready");
  });
});
