/**
 * The condition rules the sheet used to show only as a label (Charmed, Deafened),
 * now gates like the others. The cases come from the one locale-free rules table
 * (`CONDITION_RULES`): every condition whose 2024 text blocks harming its source,
 * gives its source Advantage on social checks, or auto-fails ability checks that
 * need a lost sense must carry that gate and show it as a status-ledge line.
 */
import { describe, expect, it } from "vitest";
import { CONDITION_RULES } from "@/lib/condition";
import { resolveConditionEffects } from "@/lib/condition-effects";
import { composeStatusBadges, composeTurnLimiters } from "@/lib/views/combat-action-view";

type Requirement = { kind: string; mode?: string; outcome?: string; sense?: string };

/** Every requirement read as plain data, so a new kind or mode is seen too. */
const rows = Object.entries(CONDITION_RULES).flatMap(([id, rule]) => {
  if (rule.kind !== "occurrence") return [];
  const requirements: ReadonlyArray<Requirement> = rule.requirements;
  return [{ id, requirements }];
});

const blocksSource = rows
  .filter((r) => r.requirements.some((q) => q.kind === "harm-source-block"))
  .map((r) => r.id);
const sourceSocial = rows
  .filter((r) =>
    r.requirements.some((q) => q.kind === "source-social-check" && q.mode === "advantage")
  )
  .map((r) => r.id);
const senseFails = rows.flatMap((r) =>
  r.requirements
    .filter(
      (q) =>
        q.kind === "sense-dependent-ability-check" && q.outcome === "automatic-failure"
    )
    .map((q) => ({ id: r.id, sense: q.sense }))
);

const limitersOf = (id: string) =>
  composeTurnLimiters({ conditions: [id], attackRollState: "none", exhaustion: 0 });

describe("source and sense gates from the rules table", () => {
  it("finds Charmed and Deafened (and Blinded's sight)", () => {
    expect(blocksSource).toEqual(["charmed"]);
    expect(sourceSocial).toEqual(["charmed"]);
    expect(senseFails).toEqual([
      { id: "blinded", sense: "sight" },
      { id: "deafened", sense: "hearing" },
    ]);
  });

  it.each(rows.map((r) => [r.id] as const))("%s: gates match its rules", (id) => {
    const effects = resolveConditionEffects([id]);
    expect(effects.cantHarmSource).toBe(blocksSource.includes(id));
    expect(effects.sourceSocialAdvantage).toBe(sourceSocial.includes(id));
    expect([...effects.autoFailSenseChecks]).toEqual(
      senseFails.filter((row) => row.id === id).map((row) => row.sense)
    );
  });

  it.each(blocksSource.map((id) => [id] as const))(
    "%s: the ledge says you can't harm the source, and its social edge",
    (id) => {
      const kinds = limitersOf(id).map((l) => l.kind);
      expect(kinds).toContain("cantHarmSource");
      expect(kinds).toContain("sourceSocialAdvantage");
      const badges = composeStatusBadges(limitersOf(id));
      expect(badges).toEqual([
        expect.objectContaining({ kind: "condition", conditionId: id }),
      ]);
    }
  );

  it.each(senseFails.map((row) => [row.id, row.sense] as const))(
    "%s: the ledge says ability checks needing %s auto-fail",
    (id, sense) => {
      expect(limitersOf(id)).toContainEqual({
        kind: "autoFailSenseChecks",
        senses: [sense],
        causeId: id,
      });
    }
  );

  it("two sense conditions name both senses once, the first as the cause", () => {
    const limiters = composeTurnLimiters({
      conditions: ["deafened", "blinded"],
      attackRollState: "none",
      exhaustion: 0,
    });
    expect(limiters.filter((l) => l.kind === "autoFailSenseChecks")).toEqual([
      { kind: "autoFailSenseChecks", senses: ["sight", "hearing"], causeId: "deafened" },
    ]);
  });
});
