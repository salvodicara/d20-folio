import { describe, expect, it } from "vitest";
import itCombatLog from "@/i18n/it/ui/combatLog.json";

/**
 * A log line that ends with a feature, spell or state name ("Copertura Parziale",
 * "Schivata", "Ira") cannot carry a past participle agreeing with it: the name's
 * gender is unknown, so "{{name}} terminato" reads wrong for every feminine name.
 */
describe("Italian log lines stay neutral about the name's gender", () => {
  it("the state-end line does not agree a participle with {{name}}", () => {
    const line = itCombatLog.combatLog.effectExpired;
    expect(line).toContain("{{name}}");
    expect(line).not.toMatch(/\{\{name\}\}\s+terminat[oa]/);
  });
});
