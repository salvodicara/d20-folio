/**
 * My zone's turn-change questions (M9: «Goblin finisce il turno: è dentro Guardiani
 * Spirituali?») wait under the zone on Play until answered or until the next turn
 * change brings its own.
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  useZoneHitStore,
  type PendingZoneHit,
} from "@/features/campaigns/zone-hit-store";

const hit = (
  creatureId: string,
  kind: PendingZoneHit["kind"] = "end-turn"
): PendingZoneHit => ({
  key: `z1:${creatureId}:${kind}`,
  zone: { id: "z1" } as PendingZoneHit["zone"],
  creatureId,
  creatureName: creatureId,
  kind,
});

describe("pending zone hits", () => {
  beforeEach(() => useZoneHitStore.setState({ hits: [] }));

  it("a turn change replaces the questions of the last one", () => {
    const { turnChanged } = useZoneHitStore.getState();
    turnChanged([hit("m1"), hit("m2", "start-turn")]);
    turnChanged([hit("m3")]);
    expect(useZoneHitStore.getState().hits.map((h) => h.creatureId)).toEqual(["m3"]);
  });

  it("answering removes one; a zone that ended takes its questions with it", () => {
    const { turnChanged, remove, keepZones } = useZoneHitStore.getState();
    turnChanged([hit("m1"), hit("m2")]);
    remove("z1:m1:end-turn");
    expect(useZoneHitStore.getState().hits.map((h) => h.creatureId)).toEqual(["m2"]);
    keepZones(new Set(["other"]));
    expect(useZoneHitStore.getState().hits).toEqual([]);
  });
});
