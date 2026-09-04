/**
 * The catalogue: every mechanic the reducer may execute, conformed once at load.
 * Public SRD data, the private content pack and homebrew all feed it through `buildCatalogue`.
 */
import type { MechanicId } from "./ids";
import type { FoldedState } from "./types";
import {
  conformMechanic,
  type Conformance,
  type Mechanic,
  type Program,
} from "./mechanic";

export interface Catalogue {
  readonly mechanics: ReadonlyMap<MechanicId, Mechanic>;
}

export interface CatalogueError {
  readonly id: string;
  readonly rule: string;
  readonly path: string;
}

export function emptyCatalogue(): Catalogue {
  return { mechanics: new Map() };
}

export function buildCatalogue(values: readonly unknown[]): {
  readonly catalogue: Catalogue;
  readonly errors: readonly CatalogueError[];
} {
  const mechanics = new Map<MechanicId, Mechanic>();
  const errors: CatalogueError[] = [];
  values.forEach((value, index) => {
    const result: Conformance = conformMechanic(value);
    if (result.ok) mechanics.set(result.mechanic.id, result.mechanic);
    else errors.push({ id: idOf(value, index), rule: result.rule, path: result.path });
  });
  return { catalogue: { mechanics }, errors };
}

function idOf(value: unknown, index: number): string {
  if (typeof value === "object" && value !== null && "id" in value) {
    const id = value.id;
    if (typeof id === "string") return id;
  }
  return `#${index}`;
}

/**
 * One mechanic, resolved the way the reducer resolves it: the definitions the seated entities
 * CARRIED into the log first (`FoldedState.mechanics`, design §2 D2), the static catalogue —
 * the `core:*` set every creature has — second. The order is the whole point: the fold must be
 * the same on a client that never loaded the bestiary and on the DM's, so a table's own data
 * can never lose to whatever a particular build happens to ship.
 */
export function mechanicOf(
  state: FoldedState,
  catalogue: Catalogue,
  id: MechanicId
): Mechanic | null {
  return state.mechanics[id] ?? catalogue.mechanics.get(id) ?? null;
}

export function programOf(
  state: FoldedState,
  catalogue: Catalogue,
  mechanic: MechanicId,
  program: string
): Program | null {
  const found = mechanicOf(state, catalogue, mechanic);
  if (!found?.active) return null;
  return found.active.find((candidate) => candidate.id === program) ?? null;
}
