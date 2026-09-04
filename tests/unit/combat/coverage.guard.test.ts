/**
 * Coverage is machine-derived from the catalogue, never hand-kept. The committed JSON must
 * equal what the generator produces from the current data; regenerate with
 * `WRITE_COMBAT_COVERAGE=1 pnpm test --run tests/unit/combat/coverage.guard.test.ts`.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCatalogue } from "@/lib/combat/catalogue";
import { coverageFor, type CoverageRow } from "@/lib/combat/coverage";
import { PROTOTYPE_MECHANICS } from "@/data/combat/prototype-catalogue";

const OUTPUT = resolvePath(process.cwd(), "docs/automation-coverage.prototype.json");

describe("coverage — derived from the catalogue", () => {
  const { catalogue } = buildCatalogue(PROTOTYPE_MECHANICS);
  const rows = coverageFor(catalogue);

  it("classifies every step of every program from the data alone", () => {
    const byId = new Map(
      rows.map((row) => [`${row.mechanic}/${row.program}/${row.step}`, row])
    );
    expect(byId.get("srd:weapon:longbow/attack/swing")?.status).toBe("physical-input");
    expect(byId.get("srd:spell:hunters-mark/cast/mark")?.status).toBe("automated");
    expect(byId.get("srd:spell:hunters-mark/move/move")?.status).toBe("automated");
    expect(byId.get("srd:spell:hunters-mark/move/*")?.status).toBe("window");
    expect(byId.get("proto:spell:giggle/cast/resist")?.status).toBe("physical-input");
    expect(rows.every((row: CoverageRow) => row.status !== "unsupported")).toBe(true);
  });

  it("a program the table has to adjudicate summarises as `table`, never `automated`", () => {
    // `core:dodge` and friends spend the action and log a line; advantage, disadvantage and
    // stealth are outside the stage-3 vocabulary, so the DM rules. The program row must say so
    // — a coverage record that calls them automated overstates the product.
    const byId = new Map(
      rows.map((row) => [`${row.mechanic}/${row.program}/${row.step}`, row])
    );
    for (const id of ["core:dodge", "core:disengage", "core:help", "core:hide"]) {
      expect(byId.get(`${id}/use/*`)?.status, id).toBe("table");
      expect(byId.get(`${id}/use/use`)?.status, id).toBe("table");
    }
    // A program with real automation is unaffected.
    expect(byId.get("core:dash/dash/*")?.status).toBe("automated");
    expect(byId.get("srd:spell:fireball/cast/*")?.status).toBe("automated");
  });

  it("the committed coverage record equals the regenerated one", () => {
    const generated = JSON.stringify({ schema: 1, rows }, null, 2) + "\n";
    if (process.env.WRITE_COMBAT_COVERAGE === "1") writeFileSync(OUTPUT, generated);
    expect(
      existsSync(OUTPUT),
      `missing ${OUTPUT}; regenerate with WRITE_COMBAT_COVERAGE=1`
    ).toBe(true);
    expect(readFileSync(OUTPUT, "utf8")).toBe(generated);
  });
});
