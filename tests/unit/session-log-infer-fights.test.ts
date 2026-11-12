/**
 * A fight nobody started, found in the session by reading it (the owner's ask: the app
 * works out by itself whether a fight is on from what the players tap). Production,
 * 2026-11-12: two sessions of three had no fight marker at all, so 82% of the lines sat
 * "outside a fight". A run of combat lines (an attack, damage, a death save) close in
 * time, by two players or more, with no rest between, reads as one fight. Nothing is
 * written; a real fight's markers always win; the inferred fight is recognisable.
 */
import { describe, expect, it } from "vitest";

import {
  buildReport,
  foldSession,
  inferFights,
  INFERRED_FIGHT_IDLE_MS,
  isInferredFight,
} from "@/lib/session-log";
import type { LogItem, PlayEvent } from "@/lib/session-log";
import { isAttackSource } from "@/lib/session-log/attack-source";

const DM = "dm-uid";
const MIN = 60_000;

function line(id: string, by: string, atMin: number, ev: PlayEvent): LogItem {
  return { type: "event", id, by, at: atMin * MIN, event: ev };
}

const hit = (actor: string): PlayEvent => ({
  kind: "action",
  actor,
  targets: ["monster-1"],
  outcome: "hit",
});

const fights = (items: LogItem[]) =>
  buildReport(inferFights(foldSession(items, { dmUid: DM }))).map((section) =>
    section.kind === "encounter"
      ? `fight:${section.rounds.flatMap((r) => r.entries.map((e) => e.id)).join(",")}`
      : `outside:${section.entries.map((e) => e.id).join(",")}`
  );

describe("inferring a fight nobody started", () => {
  it("the party's attacks with no target and nobody hurt are a fight, read from the catalogue", () => {
    const uses = (
      actor: string,
      kind: "equipment" | "spell",
      key: string
    ): PlayEvent => ({
      kind: "action",
      actor,
      slot: "action",
      source: { srd: { kind, key, field: "name" } },
    });
    const items = [
      line("heal", "ben", 0, uses("pc-ben", "spell", "cure-wounds")),
      line("a1", "ana", 20, uses("pc-ana", "equipment", "longsword")),
      line("b1", "ben", 21, uses("pc-ben", "spell", "fire-bolt")),
      line("a2", "ana", 22, uses("pc-ana", "equipment", "longsword")),
    ];
    const read = (isAttack?: typeof isAttackSource) =>
      buildReport(inferFights(foldSession(items, { dmUid: DM }), { isAttack })).map(
        (s) => s.kind
      );
    expect(read(isAttackSource)).toEqual(["outside", "encounter"]);
    // Without the catalogue, an untargeted use is not a blow.
    expect(read()).toEqual(["outside"]);
  });

  it("a run of attacks and damage by two players is one fight; the walk around it is not", () => {
    expect(
      fights([
        line("walk", "ana", 0, { kind: "heal", amount: 2 }),
        line("a1", "ana", 30, hit("pc-ana")),
        line("b1", "ben", 31, { kind: "damage", amount: 4, target: "pc-ben" }),
        line("h1", "ben", 32, { kind: "heal", amount: 3, target: "pc-ben" }),
        line("a2", "ana", 33, { kind: "damage", amount: 6, target: "pc-ana" }),
        line("loot", "ana", 70, { kind: "heal", amount: 1 }),
      ])
    ).toEqual(["outside:walk", "fight:a1,b1,h1,a2", "outside:loot"]);
  });

  it("a long quiet spell or a rest splits two fights", () => {
    const idle = INFERRED_FIGHT_IDLE_MS / MIN;
    expect(
      fights([
        line("a1", "ana", 0, hit("pc-ana")),
        line("b1", "ben", 1, hit("pc-ben")),
        line("a2", "ana", 2 + idle, hit("pc-ana")),
        line("b2", "ben", 3 + idle, hit("pc-ben")),
        line("r", "ana", 4 + idle, { kind: "rest", rest: "short", actor: "pc-ana" }),
        line("a3", "ana", 5 + idle, hit("pc-ana")),
        line("b3", "ben", 6 + idle, hit("pc-ben")),
      ])
    ).toEqual(["fight:a1,b1", "fight:a2,b2", "outside:r", "fight:a3,b3"]);
  });

  it("one player alone, or a single blow, is not a fight", () => {
    expect(
      fights([
        line("a1", "ana", 0, hit("pc-ana")),
        line("a2", "ana", 1, { kind: "damage", amount: 3, target: "pc-ana" }),
        line("b1", "ben", 30, { kind: "damage", amount: 2, target: "pc-ben" }),
      ])
    ).toEqual(["outside:a1,a2,b1"]);
  });

  it("a fight the DM started keeps its own markers; nothing is inferred inside or across it", () => {
    const items = [
      line("a0", "ana", 0, hit("pc-ana")),
      line("s", DM, 1, { kind: "encounter-start", encounterId: "goblins" }),
      line("a1", "ana", 2, hit("pc-ana")),
      line("b1", "ben", 3, hit("pc-ben")),
      line("e", DM, 4, { kind: "encounter-end", encounterId: "goblins" }),
      line("b2", "ben", 5, hit("pc-ben")),
    ];
    const sections = buildReport(inferFights(foldSession(items, { dmUid: DM })));
    expect(
      sections.map((s) => (s.kind === "encounter" ? s.encounterId : "outside"))
    ).toEqual(["outside", "goblins", "outside"]);
  });

  it("an inferred fight says so; a real one does not", () => {
    const sections = buildReport(
      inferFights(
        foldSession(
          [
            line("a1", "ana", 0, hit("pc-ana")),
            line("b1", "ben", 1, {
              kind: "death-save",
              actor: "pc-ben",
              outcome: "failure",
            }),
            line("s", DM, 2, { kind: "encounter-start", encounterId: "goblins" }),
            line("a2", "ana", 3, hit("pc-ana")),
          ],
          { dmUid: DM }
        )
      )
    );
    expect(sections.map((s) => s.kind === "encounter" && isInferredFight(s))).toEqual([
      true,
      false,
    ]);
  });

  it("without inferring, the report is unchanged", () => {
    const items = [
      line("a1", "ana", 0, hit("pc-ana")),
      line("b1", "ben", 1, hit("pc-ben")),
    ];
    expect(buildReport(foldSession(items, { dmUid: DM })).map((s) => s.kind)).toEqual([
      "outside",
    ]);
  });
});
