/**
 * Golden replays: a JSON log folds to an expected state and an expected list of rejections.
 * One file per hard case and per acceptance story (`docs/TEST_PORTFOLIO.md` → "Golden replays").
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCatalogue } from "@/lib/combat/catalogue";
import { fold } from "@/lib/combat/fold";
import { resolve } from "@/lib/combat/resolve";
import type {
  Action,
  Encounter,
  FoldedState,
  Rejection,
  Relation,
} from "@/lib/combat/types";
import { PROTOTYPE_MECHANICS } from "@/data/combat/prototype-catalogue";
import { testEntity } from "./__helpers__/entities";
import { emptyState, openingActions, seqFactory } from "./__helpers__/state";

type LogEntry = Omit<Action, "seq"> & { readonly by: string };

interface Replay {
  readonly name: string;
  readonly dm: string;
  readonly entities: readonly Parameters<typeof testEntity>[0][];
  readonly initiative: Readonly<Record<string, number>>;
  readonly order: readonly string[];
  readonly relations?: readonly Relation[];
  readonly log: readonly LogEntry[];
  readonly expect: {
    readonly applied: number;
    readonly rejections: readonly {
      readonly action: string;
      readonly rejection: Rejection;
    }[];
    readonly state: Readonly<Record<string, unknown>>;
  };
}

const DIR = join(__dirname, "replays");
const { catalogue } = buildCatalogue(PROTOTYPE_MECHANICS);

function pick(state: FoldedState, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (node, key) => (node as Record<string, unknown> | undefined)?.[key],
      state
    );
}

describe("golden replays", () => {
  const files = readdirSync(DIR)
    .filter((file) => file.endsWith(".json"))
    .sort();
  it("has at least one replay", () => {
    expect(files.length).toBeGreaterThan(0);
  });
  for (const file of files) {
    const replay = JSON.parse(readFileSync(join(DIR, file), "utf8")) as Replay;
    it(`${file}: ${replay.name}`, () => {
      const seq = seqFactory(replay.dm);
      let state: FoldedState = { ...emptyState(), relations: replay.relations ?? [] };
      const opening = openingActions(
        replay.dm,
        seq,
        replay.entities.map((entity) => testEntity(entity)),
        replay.initiative,
        replay.order
      );
      for (const action of opening) {
        const result = resolve(state, action, catalogue);
        if (result.kind === "rejected") {
          throw new Error(`opening: ${JSON.stringify(result.rejection)}`);
        }
        state = result.state;
      }
      const log = replay.log.map(
        (entry, index): Action =>
          ({ ...entry, seq: { ms: 5_000 + index, counter: 0, by: entry.by } }) as Action
      );
      const encounter: Encounter = {
        schema: 1,
        id: file,
        host: { kind: "campaign", campaignId: "replay" },
        log,
        checkpoint: null,
      };
      const result = fold(encounter, catalogue, state);
      expect(result.rejections).toEqual(replay.expect.rejections);
      expect(result.applied).toBe(replay.expect.applied);
      for (const [path, expected] of Object.entries(replay.expect.state)) {
        expect(pick(result.state, path), path).toEqual(expected);
      }
    });
  }
});
