import { beforeEach, describe, expect, it, vi } from "vitest";
import { FieldValue } from "firebase-admin/firestore";
import { buildDevScenario } from "@/lib/dev-scenarios";
import { serializeCharacterEnvelope } from "@/lib/character-codec";
import {
  parsePersistedPlayStateV1,
  sessionToPlayStateV1,
} from "@/lib/session-state-codec";
import { deriveStatuses } from "@/lib/status";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import type { CharacterDoc } from "@/types/character";
import { runGuardedMigration, type RawMap } from "../../scripts/lib/migration-kit";
import {
  packRefusal,
  planStatuses,
  reportForStatuses,
  verifyStatusesCorpus,
  writesForStatuses,
} from "../../scripts/migrate-statuses";

const PARENT = "users/u1/characters/c1";
const CHILD = `${PARENT}/combat/state`;

/** A real character family: the parent envelope and the play-state child exactly as
 *  the app persists them (`serializeCharacterEnvelope` + `sessionToPlayStateV1`). */
function family(doc: CharacterDoc, path = PARENT) {
  const envelope = serializeCharacterEnvelope(doc);
  return [
    { path, data: { schema: 3, build: envelope.build, state: {} } as RawMap },
    {
      path: `${path}/combat/state`,
      data: { playState: sessionToPlayStateV1(doc.session), round: 1 } as RawMap,
    },
  ];
}

/** Light statuses through the REAL store writers on a dev scenario. */
function lit(id: string, act: () => void): CharacterDoc {
  const doc = buildDevScenario(id);
  if (!doc) throw new Error(`missing ${id}`);
  useCharacterStore.getState().setCharacter(doc);
  act();
  const live = useCharacterStore.getState().character;
  if (!live) throw new Error("no character");
  return live;
}

function raging(): CharacterDoc {
  return lit("scn-barbarian-extra-attack", () =>
    useCharacterStore.getState().setActiveFeature("barbarian-rage", true)
  );
}

function storedStatuses(data: RawMap): unknown {
  return ((data.playState as RawMap).state as RawMap).statuses;
}

describe("migrate-statuses — the pure plan", () => {
  beforeEach(() => {
    useCombatStore.setState({ round: 1 });
    useCharacterStore.getState().setCharacter(null);
  });

  it("writes the derived statuses beside the old fields and touches nothing else", () => {
    const doc = raging();
    const plan = planStatuses(family(doc));
    expect(plan.issues).toEqual([]);
    expect(plan.counts).toMatchObject({ characters: 1, withStatuses: 1, toWrite: 1 });
    const [child] = plan.changedDocuments;
    expect(child?.path).toBe(CHILD);
    expect(storedStatuses(child?.after ?? {})).toEqual(deriveStatuses(doc));
    // Every old field survives byte for byte.
    const before = (child?.before.playState as RawMap).state as RawMap;
    const after = (child?.after.playState as RawMap).state as RawMap;
    const { statuses: _added, ...kept } = after;
    void _added;
    expect(kept).toEqual(before);
    expect(before.activeFeatures).toEqual(["barbarian-rage"]);
  });

  it("is idempotent: re-planning the migrated corpus changes nothing", () => {
    const sources = family(raging());
    const once = planStatuses(sources);
    const migrated = sources.map((source) => ({
      path: source.path,
      data: once.documents.find((d) => d.path === source.path)?.after ?? source.data,
    }));
    expect(planStatuses(migrated).changedDocuments).toEqual([]);
    expect(verifyStatusesCorpus(migrated)).toEqual([]);
    expect(verifyStatusesCorpus(sources).map((issue) => issue.code)).toEqual([
      "verification-failed",
    ]);
  });

  it("leaves a character with no status without the field", () => {
    const doc = buildDevScenario("scn-life-cleric");
    if (!doc) throw new Error("missing scenario");
    const plan = planStatuses(family(doc));
    expect(plan.changedDocuments).toEqual([]);
    expect(plan.counts).toMatchObject({ characters: 1, withStatuses: 0 });
  });

  it("rewrites a stale stored list, and clears one whose statuses all ended", () => {
    const doc = raging();
    const [parent, child] = family(doc);
    if (!parent || !child) throw new Error("family");
    const playState = child.data.playState as RawMap;
    const stale = {
      ...child,
      data: {
        ...child.data,
        playState: {
          ...playState,
          state: { ...(playState.state as RawMap), statuses: [{ key: "old" }] },
        },
      },
    };
    expect(
      storedStatuses(planStatuses([parent, stale]).changedDocuments[0]?.after ?? {})
    ).toEqual(deriveStatuses(doc));

    const calm = buildDevScenario("scn-barbarian-extra-attack");
    if (!calm) throw new Error("missing scenario");
    const [calmParent, calmChild] = family(calm);
    if (!calmParent || !calmChild) throw new Error("family");
    const calmState = calmChild.data.playState as RawMap;
    const leftover = {
      ...calmChild,
      data: {
        ...calmChild.data,
        playState: {
          ...calmState,
          state: { ...(calmState.state as RawMap), statuses: [{ key: "old" }] },
        },
      },
    };
    const cleared = planStatuses([calmParent, leftover]);
    expect(cleared.counts.toClear).toBe(1);
    expect(storedStatuses(cleared.changedDocuments[0]?.after ?? {})).toBeUndefined();
  });

  it("the migrated child still loads through the app's strict play-state reader", () => {
    const plan = planStatuses(family(raging()));
    const parsed = parsePersistedPlayStateV1(plan.changedDocuments[0]?.after.playState);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.session.activeFeatures).toEqual(["barbarian-rage"]);
  });

  it("refuses broken families instead of guessing", () => {
    const [parent, child] = family(raging());
    if (!parent || !child) throw new Error("family");
    const broken = { ...child, data: { ...child.data, playState: { version: 9 } } };
    const orphan = { path: "users/u2/characters/c2/combat/state", data: child.data };
    const plan = planStatuses([parent, broken, orphan, { path: "x/y", data: {} }]);
    expect(plan.changedDocuments).toEqual([]);
    expect(plan.issues.map((issue) => issue.code).sort()).toEqual([
      "invalid-play-state",
      "orphan-child",
      "unexpected-path",
    ]);
    // The report carries hashes and codes, never a raw path or payload.
    expect(JSON.stringify(reportForStatuses(plan))).not.toContain("users/");
  });

  it("owns exactly one field per write", () => {
    const plan = planStatuses(family(raging()));
    const [document] = plan.changedDocuments;
    if (!document) throw new Error("no change");
    expect(Object.keys(writesForStatuses(document).data)).toEqual([
      "playState.state.statuses",
    ]);
    const cleared = { ...document, after: document.before };
    expect(writesForStatuses(cleared).data["playState.state.statuses"]).toEqual(
      FieldValue.delete()
    );
  });

  it("refuses to run without the composed content pack", () => {
    expect(packRefusal(true, 3)).toBeUndefined();
    expect(packRefusal(false, 3)).toMatch(/Refusing/);
    expect(packRefusal(true, 0)).toMatch(/Refusing/);
  });
});

describe("migrate-statuses — the dry-run", () => {
  it("plans and reports but never opens a write batch", async () => {
    useCombatStore.setState({ round: 1 });
    const sources = family(raging());
    const batch = vi.fn();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await runGuardedMigration({
      migration: "statuses",
      label: "statuses-v1",
      discover: () =>
        Promise.resolve(
          sources.map((source) => ({
            source,
            ref: {} as never,
            updateTime: {} as never,
          }))
        ),
      plan: planStatuses,
      verify: verifyStatusesCorpus,
      writesFor: writesForStatuses,
      report: reportForStatuses,
      options: { mode: "dry-run" },
      db: { batch } as never,
    });
    expect(batch).not.toHaveBeenCalled();
    const printed = JSON.parse(String(log.mock.calls[0]?.[0])) as {
      counts: { toWrite: number };
    };
    expect(printed.counts.toWrite).toBe(1);
    log.mockRestore();
  });
});
