#!/usr/bin/env node
/**
 * Forward compatibility before a deploy: does the client that is live today read what
 * this tree writes? A stale tab, a player's second device and the DM's view of a member
 * keep running the deployed release's code after the deploy, and its strict combat
 * reader refuses a whole combat/state document over one value it does not know (since
 * #1140 a cast stores economy category «magic»: the live parser refused it and the
 * sheet showed its error page). The derived diff and the compat survey cannot see this:
 * they read stored documents, and the new value only appears once the new client plays.
 *
 * This tree builds the documents with its own code: one combat/state per value of each
 * closed list its writers can store, and every dev character written whole. The
 * release's own `parseCombatState` reads them (the probe runs inside the release tree).
 * It also checks the lists the release's strict play-state codec filters by: a value
 * this tree can store that the release's list lacks is dropped on read, and the strict
 * round-trip then refuses the document.
 *
 * Local only: no Firebase, no production read. Output: values of closed lists and
 * counts; dev characters by count, never by id.
 *
 *   node --import ./scripts/alias-loader.mjs scripts/survey-forward-compat.ts \
 *     --baseline-root /absolute/path/to/the/deployed/release/app \
 *     [--release v0.26.1 --write-fixture tests/unit/__fixtures__/forward-compat-v0.26.1.json]
 * The fixture freezes the release's accepted shape; the gate test reads it in CI.
 */
/// <reference types="node" />
/// <reference types="vite/client" />

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process, { argv as processArgv } from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import type { ActionEconomyCategory } from "@/data/types";
import { CREATURE_SIZE_ORDER } from "@/data/types";
import { snapshotTurnEconomy } from "@/features/character/center/combat-hydration";
import { sessionToCombatState } from "@/lib/combat-state";
import { canonicalCombatField, parseCombatState } from "@/lib/combat-state-codec";
import { DEV_SCENARIOS, buildDevScenario } from "@/lib/dev-scenarios";
import { FAMILIAR_CREATURE_TYPES } from "@/lib/familiar-ids";
import { MOCK_CHARACTER } from "@/lib/mock";
import { parsePersistedPlayStateV1 } from "@/lib/session-state-codec";
import { CONDITION_IDS } from "@/types/condition";
import type { CombatState } from "@/types/combat-state";
import type { CharacterDoc } from "@/types/character";
import { DAMAGE_TYPES } from "@/types/damage";
import { useCombatStore, type SelectedAction } from "@/stores/combatStore";

import {
  readCases,
  type CompatCase,
  type CompatInput,
  type CompatList,
  type CompatOutput,
} from "./lib/forward-compat-probe";

type Selected = NonNullable<CombatState["turnEconomy"]>["selected"]["action"][number];
type TriggerEvent = NonNullable<Selected["triggerEvents"]>[number];

/** Every economy category this tree can store on a turn's Action. A `Record` over the
 *  union: a category added to the type and not here fails the type check. */
export const ECONOMY_CATEGORIES: Record<ActionEconomyCategory, true> = {
  attack: true,
  dash: true,
  disengage: true,
  hide: true,
  utilize: true,
  magic: true,
};
export const TRIGGER_EVENTS: Record<TriggerEvent, true> = {
  attack: true,
  "bonus-extend": true,
};

/** A combat/state document as this tree's writer stores it (combat-state-io's
 *  `combatStateWriteData`, without the server timestamp). */
export function writtenDoc(doc: CharacterDoc): Record<string, unknown> {
  const state = sessionToCombatState(doc.session);
  const play = parsePersistedPlayStateV1(state.playState);
  if (!play.ok) throw new Error(`play state: ${play.reason}`);
  return {
    hp: { current: state.hp.current, temp: state.hp.temp },
    conditions: state.conditions,
    bardicInspirationDie: state.bardicInspirationDie ?? "",
    ...(state.heroicInspiration !== undefined
      ? { heroicInspiration: state.heroicInspiration }
      : {}),
    initiativeRoll: state.initiativeRoll,
    deathSaves: {
      successes: state.deathSaves.successes,
      failures: state.deathSaves.failures,
    },
    round: state.round,
    ...(state.turnEconomy ? { turnEconomy: state.turnEconomy } : {}),
    playState: play.value,
  };
}

/** The turn the real writer (`snapshotTurnEconomy`) stores for one Action, in the
 *  canonical stored form. A cast's row is a spell row; any other a feature row. */
function storedTurn(action: Partial<SelectedAction>): {
  turnEconomy: unknown;
  stored: Partial<Selected>;
} {
  useCombatStore.getState().endCombat();
  const id = action.economyCategory === "magic" ? "spell-fire-bolt" : "base-action";
  useCombatStore
    .getState()
    .selectAction({ id, name: id, nameLoc: { custom: id }, slot: "action", ...action });
  const snapshot = snapshotTurnEconomy(useCombatStore.getState(), "3:pc-x");
  useCombatStore.getState().endCombat();
  return {
    turnEconomy: canonicalCombatField("turnEconomy", snapshot),
    stored: snapshot.selected.action[0] ?? {},
  };
}

/** One case per value the writer actually stores; a value of the type it never stores
 *  (since #1168, «magic») is listed apart: information, never a problem. */
function writerCases(
  list: string,
  values: readonly string[],
  action: (value: string) => Partial<SelectedAction>,
  storedValue: (stored: Partial<Selected>) => string | undefined,
  base: Record<string, unknown>,
  notStored: Record<string, string[]>
): CompatCase[] {
  return values.flatMap((value) => {
    const { turnEconomy, stored } = storedTurn(action(value));
    if (storedValue(stored) !== value) {
      (notStored[list] ??= []).push(value);
      return [];
    }
    return [{ list, value, doc: { ...base, turnEconomy } }];
  });
}

export function buildInput(): CompatInput & { notStored: Record<string, string[]> } {
  const base = writtenDoc(MOCK_CHARACTER);
  const notStored: Record<string, string[]> = {};
  const cases: CompatCase[] = [
    ...writerCases(
      "turnEconomy.action.economyCategory",
      Object.keys(ECONOMY_CATEGORIES),
      (value) => ({ economyCategory: value as ActionEconomyCategory }),
      (stored) => stored.economyCategory,
      base,
      notStored
    ),
    ...writerCases(
      "turnEconomy.action.triggerEvents",
      Object.keys(TRIGGER_EVENTS),
      (value) => ({ triggerEvents: [value as TriggerEvent] }),
      (stored) => stored.triggerEvents?.[0],
      base,
      notStored
    ),
    { list: "character", value: "mock", doc: base },
    ...Object.keys(DEV_SCENARIOS).flatMap((id, index) => {
      const doc = buildDevScenario(id);
      return doc
        ? [{ list: "character", value: `#${String(index + 1)}`, doc: writtenDoc(doc) }]
        : [];
    }),
  ];
  const lists: CompatList[] = [
    {
      list: "damage types",
      module: "@/types/damage",
      exportName: "DAMAGE_TYPES",
      values: [...DAMAGE_TYPES],
    },
    {
      list: "conditions",
      module: "@/types/condition",
      exportName: "CONDITION_IDS",
      values: [...CONDITION_IDS],
    },
    {
      list: "creature sizes",
      module: "@/data/types",
      exportName: "CREATURE_SIZE_ORDER",
      values: [...CREATURE_SIZE_ORDER],
    },
    {
      list: "familiar creature types",
      module: "@/lib/familiar-ids",
      exportName: "FAMILIAR_CREATURE_TYPES",
      values: [...FAMILIAR_CREATURE_TYPES],
    },
  ];
  return { cases, lists, notStored };
}

export interface ForwardCompatSurvey {
  /** Per closed list: the values the live client accepts, and the ones it refuses
   *  (with where), beside what this tree's own reader does. */
  closedLists: Record<
    string,
    { accepted: string[]; refused: Record<string, string>; refusedByThisTree: string[] }
  >;
  /** The dev characters written whole: how many the live client reads, and why not. */
  characters: { written: number; accepted: number; refused: Record<string, number> };
  /** The play-state lists: values this tree can store that the live list lacks. */
  playStateLists: Record<string, string[] | "absent in the live release">;
  /** Information only: values of a closed list's type that this tree's writer never
   *  stores, so the live client never meets them. */
  notStored: Record<string, string[]>;
  /** 0 when the live client reads everything this tree can write. */
  problems: number;
}

export function summarize(
  input: CompatInput & { notStored?: Record<string, string[]> },
  live: CompatOutput,
  current: CompatOutput["cases"]
): ForwardCompatSurvey {
  const closedLists: ForwardCompatSurvey["closedLists"] = {};
  const characters = { written: 0, accepted: 0, refused: {} as Record<string, number> };
  live.cases.forEach((row, index) => {
    if (row.list === "character") {
      characters.written += 1;
      if (row.result === "accepted") characters.accepted += 1;
      else
        characters.refused[row.where ?? "?"] =
          (characters.refused[row.where ?? "?"] ?? 0) + 1;
      return;
    }
    const entry = (closedLists[row.list] ??= {
      accepted: [],
      refused: {},
      refusedByThisTree: [],
    });
    if (row.result === "accepted") entry.accepted.push(row.value);
    else entry.refused[row.value] = row.where ?? "?";
    if (current[index]?.result === "refused") entry.refusedByThisTree.push(row.value);
  });
  const playStateLists: ForwardCompatSurvey["playStateLists"] = {};
  for (const row of live.lists)
    playStateLists[row.list] =
      "absent" in row ? "absent in the live release" : row.missing;
  const problems =
    Object.values(closedLists).reduce((n, e) => n + Object.keys(e.refused).length, 0) +
    (characters.written - characters.accepted) +
    Object.values(playStateLists).reduce(
      (n, v) => n + (Array.isArray(v) ? v.length : 1),
      0
    );
  return {
    closedLists,
    characters,
    playStateLists,
    notStored: input.notStored ?? {},
    problems,
  };
}

/**
 * The live client's accepted shape, frozen as a fixture so CI can gate on it without the
 * release checkout: per closed list, the values (of the ones this tree can write) that
 * the release reads. `tests/unit/forward-compat-gate.test.ts` then requires every value
 * this tree's writers store to be among them.
 */
export interface AcceptedShape {
  release: string;
  /** How it was made: the command, so the next release regenerates it the same way. */
  generatedBy: string;
  lists: Record<string, string[]>;
}

export function acceptedShape(
  release: string,
  input: CompatInput,
  live: CompatOutput
): AcceptedShape {
  const lists: Record<string, string[]> = {};
  for (const row of live.cases) {
    if (row.list === "character" || row.result !== "accepted") continue;
    (lists[row.list] ??= []).push(row.value);
  }
  for (const row of live.lists) {
    const offered = input.lists.find((l) => l.list === row.list)?.values ?? [];
    lists[row.list] =
      "absent" in row ? [] : offered.filter((v) => !row.missing.includes(v));
  }
  return {
    release,
    generatedBy:
      "node --import ./scripts/alias-loader.mjs scripts/survey-forward-compat.ts --baseline-root <release app> --release <name> --write-fixture <this file>",
    lists,
  };
}

const run$ = promisify(execFile);

async function run(): Promise<void> {
  const rootIndex = processArgv.indexOf("--baseline-root");
  const root = rootIndex > 0 ? processArgv[rootIndex + 1] : undefined;
  if (!root)
    throw new Error("--baseline-root /absolute/path/to/the/deployed/release is required");
  const input = buildInput();
  const dir = await mkdtemp(join(tmpdir(), "folio-forward-compat-"));
  try {
    const inFile = join(dir, "in.json");
    const outFile = join(dir, "out.json");
    await writeFile(inFile, JSON.stringify(input), { mode: 0o600 });
    const probe = fileURLToPath(
      new URL("./lib/forward-compat-probe.ts", import.meta.url)
    );
    await run$(
      process.execPath,
      [
        "--import",
        join(resolve(root), "scripts/alias-loader.mjs"),
        probe,
        inFile,
        outFile,
      ],
      { cwd: resolve(root), maxBuffer: 64 * 1024 * 1024 }
    );
    const live = JSON.parse(await readFile(outFile, "utf8")) as CompatOutput;
    const current = readCases(parseCombatState, input.cases);
    console.log(JSON.stringify(summarize(input, live, current), null, 2));
    const fixtureIndex = processArgv.indexOf("--write-fixture");
    const fixture = fixtureIndex > 0 ? processArgv[fixtureIndex + 1] : undefined;
    const release = processArgv[processArgv.indexOf("--release") + 1];
    if (fixture && release) {
      await writeFile(
        fixture,
        `${JSON.stringify(acceptedShape(release, input, live), null, 2)}\n`
      );
      console.log(`fixture written: ${fixture}`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

if (processArgv[1] && import.meta.url === pathToFileURL(resolve(processArgv[1])).href) {
  run().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
