/**
 * The rolls a player enters on the sheet reach the session report (the engine lane's
 * diagnosis, miss 7: "a successful Concentration save writes nothing"; a Search,
 * Study or Influence check is logged with its use but dropped from the report). Like
 * a VTT's chat card: the line names the roll, its total and the DC.
 */
import i18next from "i18next";
import { beforeEach, describe, expect, it } from "vitest";

import enCombatLog from "@/i18n/en/ui/combatLog.json";
import en from "@/i18n/en/ui/sessionReport.json";
import enSkills from "@/i18n/en/ui/skills.json";
import itCombatLog from "@/i18n/it/ui/combatLog.json";
import it_ from "@/i18n/it/ui/sessionReport.json";
import itSkills from "@/i18n/it/ui/skills.json";
import type { PlayEvent } from "@/lib/session-log";
import { combatEventToPlayEvent } from "@/lib/session-log/character-events";
import {
  localizePlayEvent,
  type SessionReportNames,
} from "@/lib/views/session-report-view";
import { useCharacterStore } from "@/stores/characterStore";
import type { CombatEvent } from "@/types/combat-log";
import type { ConcentrationRef } from "@/types/ids";
import { conc } from "./__helpers__/concentration";
import { makeCharacterDoc } from "./_helpers";

function concentratingCleric() {
  return makeCharacterDoc(
    {
      classes: [{ classId: "cleric", level: 5 }],
      spells: [{ srdId: "bless", prepared: true }],
      hp: { max: 100 },
    },
    { hp: { current: 100, temp: 0 }, concentration: conc("bless") }
  );
}

function lastEvent(): CombatEvent | undefined {
  return useCharacterStore.getState().character?.session.logEntries.at(-1)?.event;
}

beforeEach(() => {
  useCharacterStore.setState({
    character: null,
    readonly: false,
    combatPersistence: null,
    parentPersistenceFlush: null,
    combatActiveEffects: [],
    combatPendingConcentrationSaves: [],
  });
});

describe("a Concentration save is a line, whichever way it goes", () => {
  it("kept: the spell, the DC and the total", () => {
    useCharacterStore.getState().setCharacter(concentratingCleric());
    useCharacterStore.getState().applyDamage(22);
    const pending = useCharacterStore.getState().combatPendingConcentrationSaves[0];
    if (!pending) throw new Error("no save queued");
    const commit = useCharacterStore
      .getState()
      .commitPendingConcentrationSave(pending, [15]);
    expect(commit?.result.reviewedOutcome.status).toBe("success");
    expect(lastEvent()).toEqual({
      kind: "concentration-save",
      spell: conc("bless"),
      dc: 11,
      total: commit?.result.total,
      passed: true,
    });
  });

  it("lost: the save line comes before the spell's end", () => {
    useCharacterStore.getState().setCharacter(concentratingCleric());
    useCharacterStore.getState().applyDamage(10);
    const pending = useCharacterStore.getState().combatPendingConcentrationSaves[0];
    if (!pending) throw new Error("no save queued");
    useCharacterStore.getState().commitPendingConcentrationSave(pending, [1]);
    const events = useCharacterStore
      .getState()
      .character?.session.logEntries.map((entry) => entry.event.kind);
    const save = events?.indexOf("concentration-save") ?? -1;
    expect(save).toBeGreaterThanOrEqual(0);
    expect(events?.indexOf("concentration-end")).toBeGreaterThan(save);
    expect(
      useCharacterStore
        .getState()
        .character?.session.logEntries.find((e) => e.event.kind === "concentration-save")
        ?.event
    ).toMatchObject({ dc: 10, passed: false });
  });

  it("undo takes the line back with the save", () => {
    useCharacterStore.getState().setCharacter(concentratingCleric());
    useCharacterStore.getState().applyDamage(22);
    const before = useCharacterStore.getState().character?.session.logEntries.length;
    const pending = useCharacterStore.getState().combatPendingConcentrationSaves[0];
    if (!pending) throw new Error("no save queued");
    const commit = useCharacterStore
      .getState()
      .commitPendingConcentrationSave(pending, [15]);
    commit?.undo();
    expect(useCharacterStore.getState().character?.session.logEntries.length).toBe(
      before
    );
  });
});

describe("the sheet's lines carry their roll to the session", () => {
  it("a Concentration save", () => {
    expect(
      combatEventToPlayEvent(
        {
          kind: "concentration-save",
          spell: "bless" as ConcentrationRef,
          dc: 10,
          total: 14,
          passed: true,
        },
        "pc-ana"
      )
    ).toEqual({
      kind: "concentration-save",
      actor: "pc-ana",
      spell: "bless",
      dc: 10,
      total: 14,
      passed: true,
    });
  });

  it("a check entered with its use", () => {
    expect(
      combatEventToPlayEvent(
        {
          kind: "action-use",
          action: { custom: "Search" },
          slot: "action",
          check: { skill: "perception", total: 17, dc: 15 },
        } as unknown as CombatEvent,
        "pc-ana"
      )
    ).toMatchObject({
      kind: "action",
      check: { skill: "perception", total: 17, dc: 15 },
    });
  });
});

describe("the report says the roll (EN and IT)", () => {
  const names: SessionReportNames = {
    pc: () => undefined,
    condition: (id) => id,
    action: () => "Search",
    spell: (ref) => (ref === "bless" ? "Bless" : ref),
    locale: "en",
  };

  async function line(lng: "en" | "it", event: PlayEvent): Promise<string | null> {
    const i18n = i18next.createInstance();
    await i18n.init({
      lng,
      resources: {
        en: { translation: { ...en, ...enSkills, ...enCombatLog } },
        it: { translation: { ...it_, ...itSkills, ...itCombatLog } },
      },
      interpolation: { escapeValue: false },
    });
    return localizePlayEvent(
      event,
      (k, a) => i18n.t(k, a),
      (id) => (id === "pc-ana" ? "Lara" : "?"),
      {
        ...names,
        action: () => (lng === "it" ? "Cercare" : "Search"),
        spell: () => (lng === "it" ? "Benedizione" : "Bless"),
        locale: lng,
      }
    );
  }

  const save = (passed: boolean): PlayEvent => ({
    kind: "concentration-save",
    actor: "pc-ana",
    spell: "bless" as ConcentrationRef,
    dc: 10,
    total: passed ? 14 : 6,
    passed,
  });

  it("a kept Concentration", async () => {
    expect(await line("en", save(true))).toBe(
      "Lara succeeds on the Concentration save for Bless (14 vs DC 10)"
    );
    expect(await line("it", save(true))).toBe(
      "Lara supera il TS di Concentrazione su Benedizione (14 contro CD 10)"
    );
  });

  it("a lost Concentration", async () => {
    expect(await line("en", save(false))).toBe(
      "Lara fails the Concentration save for Bless (6 vs DC 10)"
    );
    expect(await line("it", save(false))).toBe(
      "Lara fallisce il TS di Concentrazione su Benedizione (6 contro CD 10)"
    );
  });

  const search = (check: { skill: string; total: number; dc?: number }): PlayEvent => ({
    kind: "action",
    actor: "pc-ana",
    source: { custom: "Search" },
    slot: "action",
    check,
  });

  it("a check against a DC says its verdict", async () => {
    expect(await line("en", search({ skill: "perception", total: 17, dc: 15 }))).toBe(
      "Lara uses Search — Perception 17 vs DC 15: success"
    );
    expect(await line("it", search({ skill: "perception", total: 12, dc: 15 }))).toBe(
      "Lara usa Cercare — Percezione 12 contro CD 15: fallimento"
    );
  });

  it("a check without a DC says its total", async () => {
    expect(await line("it", search({ skill: "perception", total: 17 }))).toBe(
      "Lara usa Cercare — Percezione 17"
    );
  });
});
