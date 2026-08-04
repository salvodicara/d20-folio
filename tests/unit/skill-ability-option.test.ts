import { describe, expect, it } from "vitest";
import { deriveSavesAndChecks } from "@/lib/views/saves-checks-view";
import { makeCharacterDoc } from "./_helpers";

describe("skill ability options", () => {
  const barbarian = (raging: boolean) =>
    makeCharacterDoc(
      {
        classId: "barbarian",
        level: 3,
        abilityScores: { STR: 18, DEX: 14, CON: 14, INT: 8, WIS: 10, CHA: 12 },
        features: [{ srdId: "barbarian-rage" }, { srdId: "barbarian-primal-knowledge" }],
        skills: { perception: "proficient", intimidation: "proficient" },
      },
      { activeFeatures: raging ? ["barbarian-rage"] : [] }
    );

  it("uses the better optional ability only while its source is active", () => {
    const calm = barbarian(false);
    const active = barbarian(true);
    const calmView = deriveSavesAndChecks(calm.character, calm.session);
    const activeView = deriveSavesAndChecks(active.character, active.session);
    const skill = (rows: typeof activeView.skills, id: string) =>
      rows.find((row) => row.id === id);

    expect(skill(calmView.skills, "perception")).toMatchObject({
      ability: "WIS",
      bonus: 2,
    });
    expect(skill(activeView.skills, "perception")).toMatchObject({
      ability: "STR",
      bonus: 6,
    });
    expect(skill(activeView.skills, "intimidation")).toMatchObject({
      ability: "STR",
      bonus: 6,
    });
    expect(skill(activeView.skills, "arcana")?.ability).toBe("INT");
  });

  it("keeps passive scores on their ordinary ability", () => {
    const active = barbarian(true);
    const view = deriveSavesAndChecks(active.character, active.session);

    expect(view.passives.find((row) => row.id === "perception")?.bonus).toBe(12);
  });
});
