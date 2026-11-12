/**
 * A class resource spent or regained by hand (Bardic Inspiration, Rage, Second Wind, a
 * Focus Point) writes its line, in the same style as a spell slot's: «Ana spende un uso
 * di Ispirazione bardica». The sheet's line keeps the tracker's id; the report names it
 * through the same resolver the sheet's log uses, so every catalogue resource must
 * have a name in both languages.
 */
import i18next from "i18next";
import { beforeEach, describe, expect, it } from "vitest";

import en from "@/i18n/en/ui/sessionReport.json";
import it_ from "@/i18n/it/ui/sessionReport.json";

import { classFeatures } from "@/data/classes";
import { SRD_FEATS } from "@/data/feats";
import { combatEventToPlayEvent } from "@/lib/session-log";
import { MOCK_CHARACTER } from "@/lib/mock";
import { resourceLogEvents } from "@/lib/play/resource-log";
import { localizePlayEvent } from "@/lib/views/session-report-view";
import { grantSourceLabel } from "@/lib/views/tracker-view";
import { useCharacterStore } from "@/stores/characterStore";

const store = () => useCharacterStore.getState();

beforeEach(() => {
  const doc = structuredClone(MOCK_CHARACTER);
  doc.session.logEntries = [];
  useCharacterStore.setState({
    character: doc,
    loading: false,
    error: null,
    readonly: false,
  });
});

describe("a class resource changed by hand", () => {
  it("spending a use writes «spent», and the undo takes it back", () => {
    const id = "fighter-action-surge";
    const undo = store().changeResourceByHand(
      () => store().useTracker(id),
      () => store().restoreTracker(id)
    );
    expect(store().character?.session.logEntries.at(-1)?.event).toEqual({
      kind: "tracker-spent",
      trackerId: id,
      amount: 1,
    });
    undo();
    expect(store().character?.session.logEntries).toEqual([]);
    expect(store().character?.session.trackers[id]?.used).toBe(0);
  });

  it("regaining uses writes the existing «regained» line", () => {
    const before = structuredClone(MOCK_CHARACTER);
    const after = structuredClone(MOCK_CHARACTER);
    after.session.trackers["bard-bardic-inspiration"] = { used: 0 };
    expect(resourceLogEvents(before, after)).toEqual([
      { kind: "tracker-regain", trackerId: "bard-bardic-inspiration", amount: 2 },
    ]);
  });

  it("reaches the session as a resource line, spent or regained", () => {
    expect(
      combatEventToPlayEvent(
        { kind: "tracker-spent", trackerId: "barbarian-rage", amount: 1 },
        "pc-a"
      )
    ).toEqual({
      kind: "resource",
      resource: "barbarian-rage",
      count: 1,
      spent: true,
      actor: "pc-a",
    });
    expect(
      combatEventToPlayEvent(
        { kind: "tracker-regain", trackerId: "monk-focus", amount: 2 },
        "pc-a"
      )
    ).toEqual({
      kind: "resource",
      resource: "monk-focus",
      count: 2,
      spent: false,
      actor: "pc-a",
    });
  });

  it("every catalogue resource has a name in English and Italian", () => {
    const ids = [
      ...classFeatures.flatMap((f) => [
        ...(f.mechanics?.tracker ? [f.id] : []),
        ...(f.mechanics?.extraTrackers ?? []).map((t) => t.id),
      ]),
      ...SRD_FEATS.flatMap((f) => (f.mechanics?.tracker ? [f.id] : [])),
    ];
    expect(ids.length).toBeGreaterThan(20);
    const unnamed = ids.filter(
      (id) => grantSourceLabel(id, "en") === id || grantSourceLabel(id, "it") === id
    );
    expect(unnamed).toEqual([]);
  });

  it("reads like the spell-slot line, in both languages", async () => {
    const i18n = i18next.createInstance();
    await i18n.init({
      resources: { en: { translation: en }, it: { translation: it_ } },
      interpolation: { escapeValue: false },
    });
    const line = (lng: "en" | "it", count: number, spent: boolean) =>
      localizePlayEvent(
        {
          kind: "resource",
          resource: "bard-bardic-inspiration",
          count,
          spent,
          actor: "pc-a",
        },
        (k, a) => i18n.getFixedT(lng)(k, a),
        () => "Ana",
        {
          pc: () => "Ana",
          condition: (id) => id,
          action: () => "?",
          spell: (ref) => ref,
          source: (id) => grantSourceLabel(id, lng),
          locale: lng,
        }
      );
    expect(line("it", 1, true)).toBe("Ana spende un uso di Ispirazione Bardica");
    expect(line("en", 2, false)).toBe("Ana regains 2 uses of Bardic Inspiration");
  });
});
