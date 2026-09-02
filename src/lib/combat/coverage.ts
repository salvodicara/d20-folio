/**
 * Coverage derived from the catalogue alone. A step is `automated` unless the data says the
 * table must supply something: a die (`physical-input`), a ruling (`table`), or a reaction
 * decision (`window`). Conformance failures surface as `unsupported` with their path, so a
 * mechanic can never be counted as automated by omission.
 */
import type { Catalogue, CatalogueError } from "./catalogue";
import type { Program, Step } from "./mechanic";

export type CoverageStatus =
  | "automated"
  | "physical-input"
  | "window"
  | "table"
  | "unsupported";

export interface CoverageRow {
  readonly mechanic: string;
  readonly program: string;
  readonly step: string;
  readonly status: CoverageStatus;
  readonly path?: string;
}

function stepStatus(program: Program, step: Step): CoverageStatus {
  const diceInputs = new Set(
    (program.inputs ?? [])
      .filter((i) => i.kind === "d20" || i.kind === "dice")
      .map((i) => i.id)
  );
  switch (step.kind) {
    case "attack":
    case "save":
      return "physical-input";
    case "damage":
      return step.parts.some((part) => diceInputs.has(part.dice))
        ? "physical-input"
        : "automated";
    case "manual-table":
      return "table";
    case "heal":
    case "effect-start":
    case "condition":
    case "move-mark":
    case "turn-claim":
    case "negate":
      return "automated";
    default: {
      const exhaustive: never = step;
      return exhaustive;
    }
  }
}

function programStatus(program: Program): CoverageStatus {
  if (program.trigger.kind === "event")
    return program.trigger.window ? "window" : "automated";
  return "automated";
}

export function coverageFor(
  catalogue: Catalogue,
  errors: readonly CatalogueError[] = []
): CoverageRow[] {
  const rows: CoverageRow[] = [];
  const ids = [...catalogue.mechanics.keys()].sort();
  for (const id of ids) {
    const mechanic = catalogue.mechanics.get(id);
    if (!mechanic) continue;
    for (const program of mechanic.active ?? []) {
      rows.push({
        mechanic: id,
        program: program.id,
        step: "*",
        status: programStatus(program),
      });
      for (const step of program.steps) {
        rows.push({
          mechanic: id,
          program: program.id,
          step: step.id,
          status: stepStatus(program, step),
        });
      }
    }
  }
  for (const error of errors) {
    rows.push({
      mechanic: error.id,
      program: "*",
      step: "*",
      status: "unsupported",
      path: error.path,
    });
  }
  return rows;
}
