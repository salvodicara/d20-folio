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
 *     --baseline-root /absolute/path/to/the/deployed/release/app
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
const ECONOMY_CATEGORIES: Record<ActionEconomyCategory, true> = {
  attack: true,
  dash: true,
  disengage: true,
  hide: true,
  utilize: true,
  magic: true,
};
const TRIGGER_EVENTS: Record<TriggerEvent, true> = { attack: true, "bonus-extend": true };

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

/** One turn whose Action is `action`, in the canonical stored form. */
function turnWith(action: Partial<Selected>): unknown {
  const seed = {
    key: "3:pc-x",
    selected: {
      action: [{ id: "spell-fire-bolt", name: { custom: "Fire Bolt" }, slot: "action" }],
      bonus: [],
      free: [],
    },
  };
  const canonical = canonicalCombatField("turnEconomy", seed) as {
    selected: { action: Array<Record<string, unknown>> };
  };
  const copy = structuredClone(canonical);
  Object.assign(copy.selected.action[0] ?? {}, action);
  return copy;
}

export function buildInput(): CompatInput {
  const base = writtenDoc(MOCK_CHARACTER);
  const cases: CompatCase[] = [
    ...Object.keys(ECONOMY_CATEGORIES).map((value) => ({
      list: "turnEconomy.action.economyCategory",
      value,
      doc: {
        ...base,
        turnEconomy: turnWith({ economyCategory: value as ActionEconomyCategory }),
      },
    })),
    ...Object.keys(TRIGGER_EVENTS).map((value) => ({
      list: "turnEconomy.action.triggerEvents",
      value,
      doc: { ...base, turnEconomy: turnWith({ triggerEvents: [value as TriggerEvent] }) },
    })),
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
  return { cases, lists };
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
  /** 0 when the live client reads everything this tree can write. */
  problems: number;
}

export function summarize(
  input: CompatInput,
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
  void input;
  return { closedLists, characters, playStateLists, problems };
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
