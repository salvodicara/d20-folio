/**
 * «From what?» (#1333): the spell or feature a condition chip came from, named in the
 * Conditions picker, stored on the session and read by the solo repeat-save strip.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({}));

import {
  answerSoloRepeatSaveSaved,
  raiseSoloRepeatSaves,
  useSoloRepeatSaveStore,
} from "@/features/character/center/solo-repeat-save-store";
import { addCondition, removeCondition } from "@/lib/play/conditions";
import { applySheetEvent } from "@/lib/play/sheet-events";
import {
  repeatSaveOriginsFor,
  sheetOriginConditions,
  soloRepeatSavesDue,
} from "@/lib/play/solo-repeat-saves";
import {
  parsePersistedPlayStateV1,
  sessionToPlayStateV1,
  sessionToState,
  stateToSession,
} from "@/lib/session-state-codec";
import { useCharacterStore } from "@/stores/characterStore";
import { useUndoStore } from "@/stores/undoStore";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

const ids = (conditionId: string) => repeatSaveOriginsFor(conditionId).map((o) => o.id);

describe("repeatSaveOriginsFor", () => {
  it("Paralyzed offers Hold Person and Hold Monster", () => {
    expect(ids("paralyzed")).toEqual(
      expect.arrayContaining(["hold-person", "hold-monster"])
    );
    expect(repeatSaveOriginsFor("paralyzed")).toContainEqual({
      kind: "spell",
      id: "hold-person",
    });
  });

  it("only sources whose repeat save the strip asks: Sleep's save track is not one", () => {
    expect(ids("incapacitated")).toContain("tashas-hideous-laughter");
    expect(ids("incapacitated")).not.toContain("sleep");
  });

  it("a condition no source repeats a save for offers nothing (no extra step)", () => {
    expect(repeatSaveOriginsFor("prone").map((o) => o.id)).not.toContain("hold-person");
    expect(repeatSaveOriginsFor("grappled")).toEqual([]);
  });
});

describe("the stored origin", () => {
  const doc = (): CharacterDoc => makeCharacterDoc({ classId: "fighter", level: 3 });

  it("is stored with the chip, and removing the chip forgets it", () => {
    const base = doc();
    const added = addCondition(base, "paralyzed", undefined, undefined, "hold-person");
    expect(added?.conditionOrigins).toEqual({ paralyzed: "hold-person" });
    const removed = removeCondition(
      { ...base, session: added ?? base.session },
      "paralyzed"
    );
    expect(removed?.session.conditionOrigins).toEqual({});
  });

  it("rides the add-condition sheet event", () => {
    const next = applySheetEvent(doc(), {
      kind: "add-condition",
      condition: "paralyzed",
      origin: "hold-person",
    });
    expect(next?.session.conditionOrigins).toEqual({ paralyzed: "hold-person" });
  });

  it("survives the codec's save and reload", () => {
    const d = doc();
    d.session = {
      ...d.session,
      conditions: ["paralyzed"],
      conditionOrigins: { paralyzed: "hold-person" },
    };
    const back = stateToSession(
      JSON.parse(JSON.stringify(sessionToState(d.session))) as Record<string, unknown>
    );
    expect(back.conditionOrigins).toEqual({ paralyzed: "hold-person" });
  });

  it("survives the stored play state's parse on reload", () => {
    const d = doc();
    d.session = { ...d.session, conditionOrigins: { paralyzed: "hold-person" } };
    const parsed = parsePersistedPlayStateV1(
      JSON.parse(JSON.stringify(sessionToPlayStateV1(d.session)))
    );
    expect(parsed.ok && parsed.session.conditionOrigins).toEqual({
      paralyzed: "hold-person",
    });
  });

  it("raises Hold Person's WIS strip with no DC; an unnamed chip raises none", () => {
    const named = sheetOriginConditions({
      conditions: ["paralyzed", "prone"],
      conditionOrigins: { paralyzed: "hold-person" },
    });
    expect(named).toEqual([
      {
        key: "condition:paralyzed",
        conditionId: "paralyzed",
        source: { kind: "spell", id: "hold-person" },
      },
    ]);
    const [strip] = soloRepeatSavesDue(named);
    expect(strip).toMatchObject({ ability: "WIS", at: "target-turn-end" });
    expect(strip).not.toHaveProperty("dc");
  });

  it("an id that names no catalogue entry raises nothing", () => {
    expect(
      sheetOriginConditions({
        conditions: ["paralyzed"],
        conditionOrigins: { paralyzed: "not-a-spell" },
      })
    ).toEqual([]);
  });
});

describe("on the real store", () => {
  beforeEach(() => {
    useUndoStore.getState().clear(null);
    useSoloRepeatSaveStore.getState().set([]);
    useCharacterStore.getState().setCharacter(null);
    const d = makeCharacterDoc({ classId: "fighter", level: 3 });
    d.id = "c1";
    useCharacterStore.setState({ readonly: false, loading: false, error: null });
    useCharacterStore.getState().setCharacter(d);
  });
  const origins = () => useCharacterStore.getState().character?.session.conditionOrigins;

  it("a chip named Hold Person raises the strip; «Other» (no origin) raises none", () => {
    useCharacterStore.getState().addCondition("paralyzed", { origin: "hold-person" });
    raiseSoloRepeatSaves();
    expect(useSoloRepeatSaveStore.getState().saves).toHaveLength(1);
    useCharacterStore.getState().removeConditionSilent("paralyzed");
    useCharacterStore.getState().addCondition("paralyzed");
    raiseSoloRepeatSaves();
    expect(useSoloRepeatSaveStore.getState().saves).toEqual([]);
  });

  it("«Saved» clears the origin; one undo restores it", () => {
    useCharacterStore.getState().addCondition("paralyzed", { origin: "hold-person" });
    raiseSoloRepeatSaves();
    const [save] = useSoloRepeatSaveStore.getState().saves;
    if (!save) throw new Error("no strip");
    answerSoloRepeatSaveSaved(save, { message: "x" });
    expect(origins()?.paralyzed).toBeUndefined();
    useUndoStore.getState().undo();
    expect(origins()).toEqual({ paralyzed: "hold-person" });
  });

  it("removing the condition clears the origin; one undo restores it", () => {
    useCharacterStore.getState().addCondition("paralyzed", { origin: "hold-person" });
    useUndoStore.getState().clear(null);
    useCharacterStore.getState().removeCondition("paralyzed");
    expect(origins()?.paralyzed).toBeUndefined();
    expect(useUndoStore.getState().past).toHaveLength(1);
    useUndoStore.getState().undo();
    expect(origins()).toEqual({ paralyzed: "hold-person" });
  });
});
