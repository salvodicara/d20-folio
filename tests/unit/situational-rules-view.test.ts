import { describe, it, expect } from "vitest";
import { buildSituationalRulesView } from "@/lib/views/situational-rules-view";

/** The rule-5 presenter that folds the inline-BiText reference tables into localized strings. */
describe("buildSituationalRulesView (Rules-reference presenter)", () => {
  it("localizes every topic into EN plain strings; travel numbers stay raw", () => {
    const v = buildSituationalRulesView("en");
    expect(v.cover.map((r) => r.term)).toContain("Half Cover");
    expect(v.mounted.find((r) => r.id === "falling-off")?.desc).toContain(
      "DC 10 Dexterity"
    );
    expect(v.underwater.find((r) => r.id === "melee-underwater")?.desc).toContain(
      "Piercing"
    );
    const fast = v.travel.find((p) => p.id === "fast");
    expect(fast?.name).toBe("Fast");
    // Distances are kept as raw numbers for the view's D3 formatting.
    expect(fast?.perMinuteFt).toBe(400);
    expect(fast?.perDayMiles).toBe(30);
    expect(fast?.effect).toContain("passive Perception");
    expect(v.travel.find((p) => p.id === "normal")?.effect).toBeNull();
  });

  it("localizes every topic into IT", () => {
    const v = buildSituationalRulesView("it");
    expect(v.cover.map((r) => r.term)).toContain("Copertura Parziale");
    expect(v.mounted.map((r) => r.term)).toContain("Cadere di Sella");
    expect(v.underwater.map((r) => r.term)).toContain("Resistenza al Fuoco");
    expect(v.travel.find((p) => p.id === "fast")?.name).toBe("Veloce");
  });
});
