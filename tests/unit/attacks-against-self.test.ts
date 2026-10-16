/**
 * What your own conditions do to the creatures attacking you, on the status ledge.
 * The cases come from the one locale-free rules table (`CONDITION_RULES`): every
 * `against-self` attack roll mode, every "can't see you" attack rule, Prone's
 * within/beyond split and every automatic Critical Hit range must reach the ledge
 * as a line on that condition's badge. The SRD 5.2.1 texts pin the headline cases.
 */
import { describe, expect, it } from "vitest";
import { CONDITION_RULES } from "@/lib/condition";
import { attacksAgainstSelf, type AttacksAgainstLine } from "@/lib/play/attacks-against";
import { composeStatusBadges, composeTurnLimiters } from "@/lib/views/combat-action-view";

type Row = { kind: string; [key: string]: unknown };

/** Every effect and requirement read as plain data, so a new kind is seen too. */
const expected = Object.entries(CONDITION_RULES).flatMap(([id, rule]) => {
  if (rule.kind !== "occurrence") return [];
  const effects: ReadonlyArray<Row> = rule.effects;
  const requirements: ReadonlyArray<Row> = rule.requirements;
  const lines: AttacksAgainstLine[] = [
    ...effects
      .filter(
        (e) =>
          e.kind === "roll-mode" &&
          e.perspective === "against-self" &&
          e.test === "attack"
      )
      .map((e) => ({ kind: "roll", mode: e.mode }) as AttacksAgainstLine),
    ...requirements.flatMap((q): AttacksAgainstLine[] => {
      if (q.kind === "visibility-attack-roll" && q.perspective === "against-self")
        return [{ kind: "unseen", mode: q.mode } as AttacksAgainstLine];
      if (q.kind === "prone-attacks-against")
        return [
          {
            kind: "range",
            thresholdFt: q.thresholdFt,
            within: q.within,
            beyond: q.beyond,
          } as AttacksAgainstLine,
        ];
      if (q.kind === "automatic-critical-on-hit")
        return [{ kind: "autoCrit", distanceFt: q.distanceFt } as AttacksAgainstLine];
      return [];
    }),
  ];
  return lines.length > 0 ? [{ id, lines }] : [];
});

const limitersOf = (id: string) =>
  composeTurnLimiters({ conditions: [id], attackRollState: "none", exhaustion: 0 });

describe("attacks against you, from the rules table", () => {
  it("covers the conditions whose 2024 text changes attacks against you", () => {
    expect(expected.map((row) => row.id).sort()).toEqual([
      "blinded",
      "invisible",
      "paralyzed",
      "petrified",
      "prone",
      "restrained",
      "stunned",
      "unconscious",
    ]);
  });

  it("states the SRD headline rules", () => {
    // "Attack rolls against the creature have Advantage. Any attack that hits the
    // creature is a Critical Hit if the attacker is within 5 feet of the creature."
    for (const id of ["paralyzed", "unconscious"]) {
      expect(attacksAgainstSelf(id)).toEqual([
        { kind: "roll", mode: "advantage" },
        { kind: "autoCrit", distanceFt: 5 },
      ]);
    }
    // "Advantage if the attacker is within 5 feet … Otherwise … Disadvantage."
    expect(attacksAgainstSelf("prone")).toEqual([
      { kind: "range", thresholdFt: 5, within: "advantage", beyond: "disadvantage" },
    ]);
    // Invisible: attackers that can't see you have Disadvantage.
    expect(attacksAgainstSelf("invisible")).toEqual([
      { kind: "unseen", mode: "disadvantage" },
    ]);
    expect(attacksAgainstSelf("charmed")).toEqual([]);
    expect(attacksAgainstSelf("on-fire-custom")).toEqual([]);
  });

  it.each(expected.map((row) => [row.id, row.lines] as const))(
    "%s: every attacks-against rule is a ledge line on its own badge",
    (id, lines) => {
      expect(attacksAgainstSelf(id)).toEqual(lines);
      const badges = composeStatusBadges(limitersOf(id));
      const badge = badges.find((b) => b.kind === "condition" && b.conditionId === id);
      expect(badge?.limiters.filter((l) => l.kind === "attacksAgainst")).toEqual(
        lines.map((line) => ({ kind: "attacksAgainst", causeId: id, line }))
      );
    }
  );
});
