import { describe, expect, it } from "vitest";

import { resolveDamage } from "@/lib/damage";
import { conformMechanicsTriggerEvidence } from "@/lib/mechanics-trigger";
import { MECHANICS_TRIGGER_EVIDENCE_SCHEMA } from "@/lib/mechanics-trigger-schema";

const MATERIAL = {
  campaignId: "campaign-1",
  kind: "shared-combat",
} as const;
const TARGET = { entityId: "target", material: MATERIAL, ordinal: 1 } as const;
const ATTACKER = { entityId: "attacker", material: MATERIAL, ordinal: 2 } as const;
const CLOCK = { epoch: 4, material: MATERIAL } as const;
const OCCURRENCE = { material: MATERIAL, occurrenceId: "occurrence-1" } as const;
const OCCURRENCE_GENERATION = { occurrence: OCCURRENCE, ordinal: 7 } as const;
const RESOURCE = {
  kind: "pool",
  owner: TARGET,
  resourceId: "uses",
} as const;

function damageResolution() {
  const attempt = resolveDamage(
    {
      delivery: "attack",
      packetId: "packet-1",
      parts: [{ amount: 7, damageType: "slashing", partId: "blade" }],
      target: TARGET,
      traits: ["weapon"],
    },
    { damageThreshold: null, rules: [] },
    []
  );
  if (attempt?.kind !== "resolved") throw new Error("fixture must resolve damage");
  return attempt.resolution;
}

const TRIGGERS = [
  { kind: "invocation" },
  {
    clock: CLOCK,
    combatant: TARGET,
    kind: "turn-boundary",
    phase: "start",
    round: 2,
    triggerEventId: "event-turn-start",
  },
  {
    kind: "resource-depleted",
    resource: RESOURCE,
    triggerEventId: "event-resource-depleted",
  },
  {
    kind: "hit-points-zero",
    target: TARGET,
    triggerEventId: "event-hit-points-zero",
  },
  {
    attacker: ATTACKER,
    criticalHit: true,
    kind: "damage-taken",
    resolution: damageResolution(),
    triggerEventId: "event-damage-taken",
  },
  {
    boundaryOrdinal: 1,
    clock: CLOCK,
    combatant: TARGET,
    kind: "rest-completed",
    rest: "long",
    triggerEventId: "event-rest-completed",
  },
  {
    boundaryOrdinal: 1,
    clock: CLOCK,
    kind: "day-phase",
    phase: "dawn",
    triggerEventId: "event-day-phase",
  },
  {
    kind: "source-end",
    occurrence: OCCURRENCE_GENERATION,
    triggerEventId: "event-source-end",
  },
  {
    execution: 3,
    kind: "program-phase-end",
    occurrence: OCCURRENCE_GENERATION,
    phaseId: "pulse",
    triggerEventId: "event-program-phase-end",
  },
  {
    area: OCCURRENCE_GENERATION,
    boundary: "enter",
    entity: TARGET,
    kind: "area-boundary",
    triggerEventId: "event-area-boundary",
  },
  {
    authority: "table",
    eventId: "lever-pulled",
    kind: "manual-table-event",
    triggerEventId: "event-manual-table",
  },
  {
    eventId: "pulse",
    kind: "root-pulse",
    triggerEventId: "event-root-pulse",
  },
] as const;

describe("mechanics trigger evidence", () => {
  it.each(TRIGGERS)("conforms and freezes exact $kind evidence", (input) => {
    const conformed = conformMechanicsTriggerEvidence(input);

    expect(conformed).toEqual(input);
    expect(conformed).not.toBe(input);
    expect(Object.isFrozen(conformed)).toBe(true);
  });

  it("rejects aliases, omitted temporal identity, and impossible counters", () => {
    expect(
      conformMechanicsTriggerEvidence({
        combatant: TARGET,
        kind: "turn-boundary",
        phase: "start",
        round: 2,
        triggerEventId: "event-turn-start",
      })
    ).toBeNull();
    expect(
      conformMechanicsTriggerEvidence({
        clock: CLOCK,
        combatant: TARGET,
        kind: "turn-boundary",
        phase: "start",
        round: 0,
        triggerEventId: "event-turn-start",
      })
    ).toBeNull();
    expect(
      conformMechanicsTriggerEvidence({
        kind: "source-end",
        sourceId: "legacy-source",
        triggerEventId: "event-source-end",
      })
    ).toBeNull();
    expect(
      conformMechanicsTriggerEvidence({
        ...TRIGGERS[4],
        amount: 7,
      })
    ).toBeNull();
  });

  it("requires emitted-event identity on every non-invocation variant only", () => {
    expect(TRIGGERS.map(({ kind }) => kind).sort()).toEqual(
      Object.keys(MECHANICS_TRIGGER_EVIDENCE_SCHEMA.variants).sort()
    );
    for (const input of TRIGGERS.slice(1)) {
      const withoutEventIdentity = structuredClone(input) as Record<string, unknown>;
      delete withoutEventIdentity.triggerEventId;
      expect(conformMechanicsTriggerEvidence(withoutEventIdentity)).toBeNull();
    }
    expect(
      conformMechanicsTriggerEvidence({
        ...TRIGGERS[0],
        triggerEventId: "event-invocation",
      })
    ).toBeNull();
  });

  it("rejects hostile references and preserves null attacker evidence", () => {
    expect(
      conformMechanicsTriggerEvidence({
        ...TRIGGERS[4],
        attacker: null,
      })
    ).toMatchObject({ attacker: null, kind: "damage-taken" });
    expect(
      conformMechanicsTriggerEvidence({
        kind: "source-end",
        occurrence: {
          occurrence: { material: MATERIAL, occurrenceId: "__proto__" },
          ordinal: 1,
        },
        triggerEventId: "event-source-end",
      })
    ).toBeNull();
    expect(
      conformMechanicsTriggerEvidence(Object.assign(Object.create(null), TRIGGERS[1]))
    ).toBeNull();
  });
});
