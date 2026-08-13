import { describe, expect, it } from "vitest";

import { resolveDamage } from "@/lib/damage";
import { conformMechanicsTriggerEvidence } from "@/lib/mechanics-trigger";

const MATERIAL = {
  campaignId: "campaign-1",
  kind: "shared-combat",
} as const;
const TARGET = { entityId: "target", material: MATERIAL } as const;
const ATTACKER = { entityId: "attacker", material: MATERIAL } as const;
const CLOCK = { epoch: 4, material: MATERIAL } as const;
const OCCURRENCE = { material: MATERIAL, occurrenceId: "occurrence-1" } as const;
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
  },
  { kind: "resource-depleted", resource: RESOURCE },
  { kind: "hit-points-zero", target: TARGET },
  {
    attacker: ATTACKER,
    criticalHit: true,
    kind: "damage-taken",
    resolution: damageResolution(),
  },
  {
    clock: CLOCK,
    combatant: TARGET,
    kind: "rest-completed",
    rest: "long",
  },
  { clock: CLOCK, kind: "day-phase", phase: "dawn" },
  { kind: "source-end", occurrence: OCCURRENCE },
  {
    execution: 3,
    kind: "program-phase-end",
    occurrence: OCCURRENCE,
    phaseId: "pulse",
  },
  {
    area: OCCURRENCE,
    boundary: "enter",
    entity: TARGET,
    kind: "area-boundary",
  },
  {
    authority: "table",
    eventId: "lever-pulled",
    kind: "manual-table-event",
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
      })
    ).toBeNull();
    expect(
      conformMechanicsTriggerEvidence({
        clock: CLOCK,
        combatant: TARGET,
        kind: "turn-boundary",
        phase: "start",
        round: 0,
      })
    ).toBeNull();
    expect(
      conformMechanicsTriggerEvidence({
        kind: "source-end",
        sourceId: "legacy-source",
      })
    ).toBeNull();
    expect(
      conformMechanicsTriggerEvidence({
        ...TRIGGERS[4],
        amount: 7,
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
        occurrence: { material: MATERIAL, occurrenceId: "__proto__" },
      })
    ).toBeNull();
    expect(
      conformMechanicsTriggerEvidence(Object.assign(Object.create(null), TRIGGERS[1]))
    ).toBeNull();
  });
});
