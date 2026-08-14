import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { spells } from "@/data/spells";
import { transcribeSpell } from "@/lib/mechanics-transcription";

/**
 * The corpus-wide transcription guard. Its subjects are DERIVED from the
 * composed spell catalogue itself, so a new or renamed spell can never fall out
 * of the sweep. What it cannot see: whether a clause SHOULD carry a different
 * classification than the transcriber assigned — that judgment lives in the
 * per-entity conformance tests and the generated coverage report.
 */
describe("corpus transcription", () => {
  it("classifies every composed spell without gaps", () => {
    expect(spells.length).toBeGreaterThan(0);
    const breakdown = new Map<string, number>();
    for (const spell of spells) {
      const transcription = transcribeSpell(spell);
      expect(transcription.entityId).toBe(spell.id);
      expect(transcription.clauses.length).toBeGreaterThan(0);
      for (const entry of transcription.clauses) {
        breakdown.set(entry.status, (breakdown.get(entry.status) ?? 0) + 1);
      }
      if (transcription.program) {
        expect(transcription.program.id).toBe(`spell:${spell.id}`);
        expect(
          transcription.clauses.some((entry) => entry.status === "unsupported")
        ).toBe(false);
      }
    }
    const automated = breakdown.get("automated") ?? 0;
    expect(automated).toBeGreaterThan(0);

    if (process.env.WRITE_AUTOMATION_COVERAGE === "1") {
      const entities = spells.flatMap((spell) => {
        if (spell.source !== "SRD") return [];
        const transcription = transcribeSpell(spell);
        return [
          {
            clauses: transcription.clauses,
            executable: transcription.program !== null,
            id: spell.id,
          },
        ];
      });
      const executable = spells.filter(
        (spell) => transcribeSpell(spell).program !== null
      ).length;
      writeFileSync(
        resolve(process.cwd(), "docs/automation-coverage.generated.json"),
        `${JSON.stringify(
          {
            entities,
            executablePrograms: executable,
            family: "spells",
            totalEntities: spells.length,
            totals: Object.fromEntries(breakdown),
          },
          null,
          2
        )}\n`
      );
    }
  });

  it("emits an executable fireball program with save, half damage and upcast", () => {
    const fireball = spells.find((spell) => spell.id === "fireball");
    expect(fireball).toBeDefined();
    if (!fireball) return;
    const transcription = transcribeSpell(fireball);
    expect(transcription.program).not.toBeNull();
    expect(
      transcription.clauses.map(({ clauseId, status }) => [clauseId, status])
    ).toEqual(
      expect.arrayContaining([
        ["slot-payment", "automated"],
        ["targeting", "automated"],
        ["area-selection", "spatial"],
        ["saving-throw", "physical-input"],
        ["damage-roll", "physical-input"],
        ["damage-roll-on-save", "automated"],
        ["damage-roll-application", "automated"],
      ])
    );
    const phase = transcription.program?.phases[0];
    expect(phase?.inputs.map(({ inputId }) => inputId)).toEqual([
      "slot",
      "targets",
      "saves",
      "damage-roll",
    ]);
    expect(phase?.steps.map(({ stepId }) => stepId)).toEqual([
      "damage-roll-apply",
      "damage-roll-apply-half",
    ]);
  });
});
