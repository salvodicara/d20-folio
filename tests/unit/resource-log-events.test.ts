/**
 * Exhaustion, spell-slot pips and Heroic Inspiration as play-log lines. A change to
 * any of the three becomes one structured line on the sheet's log (`CombatEvent`),
 * one event in the campaign's session log (`PlayEvent`), and reads in English and
 * Italian. The lines come from a before/after diff of the character, so the store
 * writes them in one place after the sheet event that changed it.
 */
import i18next from "i18next";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import enCombatLog from "@/i18n/en/ui/combatLog.json";
import itCombatLog from "@/i18n/it/ui/combatLog.json";
import enReport from "@/i18n/en/ui/sessionReport.json";
import itReport from "@/i18n/it/ui/sessionReport.json";
import { foldPlayLog, type PlayLogEntry } from "@/lib/play/play-log";
import { resourceLogEvents, sheetEventLogEvents } from "@/lib/play/resource-log";
import { applySheetEvent } from "@/lib/play/sheet-events";
import { combatEventToPlayEvent } from "@/lib/session-log";
import { localizeCombatEvent } from "@/lib/views/combat-log-view";
import {
  localizePlayEvent,
  type SessionReportNames,
} from "@/lib/views/session-report-view";
import type { CharacterDoc } from "@/types/character";
import type { CombatEvent } from "@/types/combat-log";
import { makeCharacterDoc } from "./_helpers";

const doc = makeCharacterDoc(
  {
    classId: "wizard",
    level: 5,
    spellSlots: [
      { level: 1, total: 4 },
      { level: 3, total: 2 },
      { level: 2, total: 2, pactMagic: true },
    ],
  },
  { exhaustion: 1, inspiration: false, spellSlots: { "1": { used: 1 } } }
);

const withSession = (patch: Partial<CharacterDoc["session"]>): CharacterDoc => ({
  ...doc,
  session: { ...doc.session, ...patch },
});

describe("the lines a change writes", () => {
  it("an Exhaustion change says the level it went from and to", () => {
    expect(resourceLogEvents(doc, withSession({ exhaustion: 3 }))).toEqual([
      { kind: "exhaustion-change", from: 1, to: 3 },
    ]);
    expect(resourceLogEvents(doc, withSession({ exhaustion: 0 }))).toEqual([
      { kind: "exhaustion-change", from: 1, to: 0 },
    ]);
  });

  it("spent and regained slot pips say the level and how many", () => {
    const after = withSession({
      spellSlots: { "1": { used: 0 }, "3": { used: 2 }, "pact-2": { used: 1 } },
    });
    expect(resourceLogEvents(doc, after)).toEqual([
      { kind: "slot-restored", level: 1, count: 1 },
      { kind: "slot-spent", level: 3, count: 2 },
      { kind: "slot-spent", level: 2, count: 1, pactMagic: true },
    ]);
  });

  it("Heroic Inspiration gained or spent", () => {
    const held = withSession({ inspiration: true });
    expect(resourceLogEvents(doc, held)).toEqual([
      { kind: "inspiration-change", gained: true },
    ]);
    expect(resourceLogEvents(held, doc)).toEqual([
      { kind: "inspiration-change", gained: false },
    ]);
  });

  it("the source that caused it rides every line", () => {
    const source = { custom: "Sickening Radiance" };
    expect(resourceLogEvents(doc, withSession({ exhaustion: 2 }), { source })).toEqual([
      { kind: "exhaustion-change", from: 1, to: 2, source },
    ]);
  });

  it("nothing changed, nothing written", () => {
    expect(resourceLogEvents(doc, doc)).toEqual([]);
    // A missing usage row reads as 0 used.
    expect(
      resourceLogEvents(
        doc,
        withSession({ spellSlots: { "1": { used: 1 }, "3": { used: 0 } } })
      )
    ).toEqual([]);
  });
});

describe("one place to write them: after the sheet event", () => {
  it("each of the three gestures writes its line", () => {
    const run = (event: Parameters<typeof applySheetEvent>[1]) => {
      const after = applySheetEvent(doc, event) ?? doc;
      return sheetEventLogEvents(event, doc, after);
    };
    expect(run({ kind: "set-exhaustion", level: 2 })).toEqual([
      { kind: "exhaustion-change", from: 1, to: 2 },
    ]);
    expect(run({ kind: "spend-slot", level: 3, pactMagic: false })).toEqual([
      { kind: "slot-spent", level: 3, count: 1 },
    ]);
    expect(run({ kind: "restore-slot", level: 1, pactMagic: false })).toEqual([
      { kind: "slot-restored", level: 1, count: 1 },
    ]);
    expect(run({ kind: "set-inspiration", held: true })).toEqual([
      { kind: "inspiration-change", gained: true },
    ]);
  });

  it("a rest writes its own line, not one per pip it refilled", () => {
    const spent = withSession({ exhaustion: 2, spellSlots: { "1": { used: 3 } } });
    const rested = applySheetEvent(spent, { kind: "long-rest" }) ?? spent;
    expect(resourceLogEvents(spent, rested).length).toBeGreaterThan(0);
    expect(sheetEventLogEvents({ kind: "long-rest" }, spent, rested)).toEqual([]);
  });
});

describe("Heroic Inspiration as a sheet event", () => {
  it("is held or not, and a no-change changes nothing", () => {
    expect(
      applySheetEvent(doc, { kind: "set-inspiration", held: true })?.session.inspiration
    ).toBe(true);
    expect(applySheetEvent(doc, { kind: "set-inspiration", held: false })).toBeNull();
  });

  it("an undo in the play log takes the change back", () => {
    const entries: PlayLogEntry[] = [
      { id: "a", seq: 1, actor: "me", event: { kind: "set-inspiration", held: true } },
      { id: "b", seq: 2, actor: "me", event: { kind: "set-exhaustion", level: 4 } },
      { id: "c", seq: 3, actor: "me", undo: "a" },
      { id: "d", seq: 4, actor: "me", undo: "b" },
    ];
    const folded = foldPlayLog(doc, entries);
    expect(folded.session.inspiration).toBe(false);
    expect(folded.session.exhaustion).toBe(1);
    expect(foldPlayLog(doc, entries.slice(0, 2)).session).toMatchObject({
      inspiration: true,
      exhaustion: 4,
    });
  });
});

describe("into the campaign's session log", () => {
  const ME = "pc-ana";
  it("each line becomes a play event about the character", () => {
    expect(
      combatEventToPlayEvent({ kind: "exhaustion-change", from: 1, to: 2 }, ME)
    ).toEqual({ kind: "exhaustion", from: 1, to: 2, target: ME });
    expect(
      combatEventToPlayEvent(
        { kind: "slot-spent", level: 2, count: 1, pactMagic: true },
        ME
      )
    ).toEqual({
      kind: "spell-slot",
      level: 2,
      count: 1,
      spent: true,
      pactMagic: true,
      actor: ME,
    });
    expect(
      combatEventToPlayEvent({ kind: "slot-restored", level: 1, count: 2 }, ME)
    ).toEqual({ kind: "spell-slot", level: 1, count: 2, spent: false, actor: ME });
    expect(
      combatEventToPlayEvent(
        { kind: "inspiration-change", gained: false, source: { custom: "Lucky roll" } },
        ME
      )
    ).toEqual({
      kind: "inspiration",
      gained: false,
      target: ME,
      source: { custom: "Lucky roll" },
    });
  });
});

async function translator(lng: "en" | "it") {
  const i18n = i18next.createInstance();
  await i18n.init({
    lng,
    resources: {
      en: { translation: { ...enCombatLog, ...enReport } },
      it: { translation: { ...itCombatLog, ...itReport } },
    },
    interpolation: { escapeValue: false },
  });
  return (key: string, args?: Record<string, string | number>) => i18n.t(key, args);
}

const sheetLine = async (lng: "en" | "it", event: CombatEvent) =>
  localizeCombatEvent(
    event,
    await translator(lng),
    (id) => id,
    (id) => id,
    (id) => id,
    (ref) => ("custom" in ref ? ref.custom : "?"),
    (ref) => ("custom" in ref ? ref.custom : "?"),
    lng
  );

describe("the sheet's log reads them in both languages", () => {
  it("English", async () => {
    expect(await sheetLine("en", { kind: "exhaustion-change", from: 1, to: 2 })).toBe(
      "Exhaustion level 2 (was 1)"
    );
    expect(await sheetLine("en", { kind: "exhaustion-change", from: 1, to: 0 })).toBe(
      "Exhaustion ended"
    );
    expect(await sheetLine("en", { kind: "slot-spent", level: 3, count: 1 })).toBe(
      "Spent a level 3 spell slot"
    );
    expect(await sheetLine("en", { kind: "slot-spent", level: 3, count: 2 })).toBe(
      "Spent 2 level 3 spell slots"
    );
    expect(
      await sheetLine("en", {
        kind: "slot-restored",
        level: 2,
        count: 1,
        pactMagic: true,
      })
    ).toBe("Regained a level 2 Pact Magic slot");
    expect(await sheetLine("en", { kind: "inspiration-change", gained: true })).toBe(
      "Gained Heroic Inspiration"
    );
    expect(
      await sheetLine("en", {
        kind: "inspiration-change",
        gained: false,
        source: { custom: "Reroll" },
      })
    ).toBe("Spent Heroic Inspiration (Reroll)");
  });

  it("Italian", async () => {
    expect(await sheetLine("it", { kind: "exhaustion-change", from: 1, to: 2 })).toBe(
      "Indebolimento livello 2 (era 1)"
    );
    expect(await sheetLine("it", { kind: "exhaustion-change", from: 1, to: 0 })).toBe(
      "Indebolimento terminato"
    );
    expect(await sheetLine("it", { kind: "slot-spent", level: 3, count: 1 })).toBe(
      "Speso uno slot incantesimo di livello 3"
    );
    expect(await sheetLine("it", { kind: "slot-spent", level: 3, count: 2 })).toBe(
      "Spesi 2 slot incantesimo di livello 3"
    );
    expect(
      await sheetLine("it", {
        kind: "slot-restored",
        level: 2,
        count: 1,
        pactMagic: true,
      })
    ).toBe("Recuperato uno slot di Magia del Patto di livello 2");
    expect(await sheetLine("it", { kind: "inspiration-change", gained: true })).toBe(
      "Ottenuta Ispirazione Eroica"
    );
  });
});

const names: SessionReportNames = {
  pc: (id) => (id === "pc-ana" ? "Ana" : undefined),
  condition: (id) => id,
  action: (text) => ("custom" in text ? text.custom : "?"),
  spell: (ref) => ref,
  locale: "en",
};
const who = (id: string | undefined) => (id === "pc-ana" ? "Ana" : "Someone");

describe("the session report reads them in both languages", () => {
  it("English", async () => {
    const t = await translator("en");
    expect(
      localizePlayEvent(
        { kind: "exhaustion", from: 1, to: 2, target: "pc-ana" },
        t,
        who,
        names
      )
    ).toBe("Ana: Exhaustion 1 → 2");
    expect(
      localizePlayEvent(
        { kind: "spell-slot", level: 3, count: 1, spent: true, actor: "pc-ana" },
        t,
        who,
        names
      )
    ).toBe("Ana spends a level 3 spell slot");
    expect(
      localizePlayEvent(
        { kind: "spell-slot", level: 1, count: 2, spent: false, actor: "pc-ana" },
        t,
        who,
        names
      )
    ).toBe("Ana regains 2 level 1 spell slots");
    expect(
      localizePlayEvent(
        { kind: "inspiration", gained: false, target: "pc-ana" },
        t,
        who,
        names
      )
    ).toBe("Ana spends Heroic Inspiration");
  });

  it("Italian", async () => {
    const t = await translator("it");
    expect(
      localizePlayEvent(
        { kind: "exhaustion", from: 1, to: 2, target: "pc-ana" },
        t,
        who,
        {
          ...names,
          locale: "it",
        }
      )
    ).toBe("Ana: Indebolimento 1 → 2");
    expect(
      localizePlayEvent(
        {
          kind: "spell-slot",
          level: 2,
          count: 1,
          spent: true,
          pactMagic: true,
          actor: "pc-ana",
        },
        t,
        who,
        { ...names, locale: "it" }
      )
    ).toBe("Ana spende uno slot di Magia del Patto di livello 2");
    expect(
      localizePlayEvent({ kind: "inspiration", gained: true, target: "pc-ana" }, t, who, {
        ...names,
        locale: "it",
      })
    ).toBe("Ana ottiene Ispirazione Eroica");
  });
});
