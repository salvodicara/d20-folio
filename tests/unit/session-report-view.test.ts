import i18next from "i18next";
import { describe, expect, it } from "vitest";

import enChronicle from "@/i18n/en/ui/combatChronicle.json";
import enCombatLog from "@/i18n/en/ui/combatLog.json";
import itCombatLog from "@/i18n/it/ui/combatLog.json";
import en from "@/i18n/en/ui/sessionReport.json";
import itChronicle from "@/i18n/it/ui/combatChronicle.json";
import it_ from "@/i18n/it/ui/sessionReport.json";
import { buildReport, foldSession } from "@/lib/session-log";
import type { LogItem, PlayEvent } from "@/lib/session-log";
import {
  localizePlayEvent,
  renderSessionReport,
  type SessionReportNames,
} from "@/lib/views/session-report-view";
import type { ConcentrationRef } from "@/types/ids";

let n = 0;
const ev = (by: string, event: PlayEvent): LogItem => ({
  type: "event",
  id: `i${++n}`,
  by,
  at: n,
  event,
});

const log: LogItem[] = [
  ev("ana", { kind: "damage", amount: 3, target: "pc-ana" }),
  ev("dm", {
    kind: "encounter-start",
    encounterId: "7",
    names: { "monster-1": "Goblin" },
  }),
  ev("dm", { kind: "round-start", round: 1 }),
  ev("ana", {
    kind: "action",
    actor: "pc-ana",
    source: { custom: "Longsword" },
    targets: ["monster-1"],
    outcome: "hit",
  }),
  ev("dm", { kind: "damage", amount: 9, actor: "pc-ana", target: "monster-1" }),
  ev("dm", { kind: "down", target: "monster-1" }),
  ev("ana", {
    kind: "concentration",
    spell: "bless" as ConcentrationRef,
    started: true,
    actor: "pc-ana",
  }),
  ev("dm", { kind: "encounter-end", encounterId: "7", outcome: "victory" }),
  ev("ana", { kind: "damage", amount: 14 }),
  ev("ana", { kind: "rest", rest: "short", actor: "pc-ana" }),
];

const names: SessionReportNames = {
  pc: (id) => (id === "pc-ana" ? "Ana" : undefined),
  condition: (id) => id,
  action: (text) => ("custom" in text ? text.custom : "?"),
  spell: (ref) => (ref === "bless" ? "Bless" : ref),
  source: (id) => (id === "rage" ? "Rage" : id),
  locale: "en",
};

async function render(lng: "en" | "it"): Promise<string> {
  const i18n = i18next.createInstance();
  await i18n.init({
    lng,
    resources: {
      en: { translation: { ...en, ...enChronicle } },
      it: { translation: { ...it_, ...itChronicle } },
    },
    interpolation: { escapeValue: false },
  });
  const report = buildReport(foldSession(log, { dmUid: "dm" }));
  return renderSessionReport(
    report,
    i18n.t("sessionReport.title", { date: "2026-10-08" }),
    (k, a) => i18n.t(k, a),
    { ...names, locale: lng }
  );
}

describe("renderSessionReport", () => {
  it("renders the session as a round-by-round markdown chronicle", async () => {
    expect(await render("en")).toBe(
      [
        "# Session 2026-10-08",
        "",
        "## Outside combat",
        "- Ana takes 3 damage",
        "",
        "## Encounter 1 — victory",
        "",
        "### Round 1",
        "- Ana uses Longsword on Goblin — hit",
        "- Ana deals 9 damage to Goblin",
        "- Goblin drops to 0 HP",
        "- Ana concentrates on Bless",
        "",
        "## Outside combat",
        "- Someone takes 14 damage",
        "- Ana takes a short rest",
      ].join("\n")
    );
  });

  it("puts the session page's notes first, so one copy carries notes and log together", () => {
    const report = buildReport(foldSession(log, { dmUid: "dm" }));
    const t = (k: string) => (k === "sessionReport.notes" ? "Session notes" : k);
    const text = renderSessionReport(report, "S", t, names, {
      notes: "  The party reached Phandalin.\nMara owes Ben 5 gp.  ",
    });
    expect(text.split("\n").slice(0, 6)).toEqual([
      "# S",
      "",
      "## Session notes",
      "",
      "The party reached Phandalin.",
      "Mara owes Ben 5 gp.",
    ]);
    // Empty notes add nothing.
    expect(renderSessionReport(report, "S", t, names, { notes: "  " })).toBe(
      renderSessionReport(report, "S", t, names)
    );
  });

  it("renders the same log in Italian", async () => {
    const text = await render("it");
    expect(text).toContain("## Scontro 1 — vittoria");
    expect(text).toContain("- Ana infligge 9 danni a Goblin");
    expect(text).toContain("- Qualcuno subisce 14 danni");
  });

  it("a player's note lands in its round, signed with the character's name", () => {
    const withNote: LogItem[] = [
      ev("dm", { kind: "encounter-start", encounterId: "8" }),
      ev("dm", { kind: "round-start", round: 2 }),
      ev("ana", { kind: "note", text: "I hide behind the pillar", actor: "pc-ana" }),
    ];
    const text = renderSessionReport(
      buildReport(foldSession(withNote, { dmUid: "dm" })),
      "S",
      (k, a) => (k === "sessionReport.round" ? `Round ${String(a?.round)}` : k),
      names
    );
    expect(text).toContain("- Ana: I hide behind the pillar");
  });

  it("names a status that ran out, in both languages", async () => {
    const line = (t: (k: string, a?: Record<string, unknown>) => string) =>
      localizePlayEvent(
        { kind: "status", sourceId: "rage", started: false, actor: "pc-ana" },
        t,
        (id) => (id === "pc-ana" ? "Ana" : "?"),
        names
      );
    for (const [lng, expected] of [
      ["en", "Ana's Rage ends"],
      ["it", "Termina Rage di Ana"],
    ] as const) {
      const i18n = i18next.createInstance();
      await i18n.init({
        lng,
        resources: {
          en: { translation: { ...en, ...enChronicle } },
          it: { translation: { ...it_, ...itChronicle } },
        },
        interpolation: { escapeValue: false },
      });
      expect(line((k, a) => i18n.t(k, a))).toBe(expected);
    }
  });

  it("an attack's damage says its roll: Spada lunga → Goblin: critico, 14", async () => {
    const strike: LogItem[] = [
      ev("dm", {
        kind: "encounter-start",
        encounterId: "9",
        names: { "monster-1": "Goblin", "monster-2": "Goblin Chief" },
      }),
      ev("dm", { kind: "round-start", round: 1 }),
      ev("ana", {
        kind: "action",
        actor: "pc-ana",
        source: { custom: "Spada lunga" },
        targets: ["monster-1"],
        outcome: "critical",
      }),
      ev("ana", {
        kind: "damage",
        amount: 14,
        actor: "pc-ana",
        target: "monster-1",
        source: { custom: "Spada lunga" },
        provenance: "manual",
        outcome: "critical",
      }),
      ev("ana", {
        kind: "action",
        actor: "pc-ana",
        source: { custom: "Spada lunga" },
        targets: ["monster-2"],
        outcome: "miss",
      }),
      // A value this reader does not know is left out, never printed raw.
      ev("ana", {
        kind: "action",
        actor: "pc-ana",
        source: { custom: "Spada lunga" },
        outcome: "fumble" as "hit",
      }),
    ];
    const i18n = i18next.createInstance();
    await i18n.init({
      lng: "it",
      resources: { it: { translation: { ...it_, ...itChronicle } } },
      interpolation: { escapeValue: false },
    });
    const text = renderSessionReport(
      buildReport(foldSession(strike, { dmUid: "dm" })),
      "S",
      (k, a) => i18n.t(k, a),
      names
    );
    expect(text).toContain("- Ana usa Spada lunga su Goblin — critico");
    expect(text).toContain("- Ana: Spada lunga → Goblin: critico, 14");
    expect(text).toContain("- Ana usa Spada lunga su Goblin Chief — mancato");
    expect(text).toMatch(/- Ana usa Spada lunga\n|- Ana usa Spada lunga$/);
  });
});

describe("localizePlayEvent: a monster's stat change", () => {
  async function translator(lng: "en" | "it") {
    const i18n = i18next.createInstance();
    await i18n.init({
      lng,
      resources: {
        en: { translation: { ...en, ...enChronicle, ...enCombatLog } },
        it: { translation: { ...it_, ...itChronicle, ...itCombatLog } },
      },
      interpolation: { escapeValue: false },
    });
    return (k: string, a?: Record<string, unknown>) => i18n.t(k, a);
  }
  const who = (id: string | undefined) => (id === "monster-1" ? "Goblin" : "?");

  it("reads Goblin: AC 15 → 13 / Goblin: CA 15 → 13", async () => {
    const event: PlayEvent = {
      kind: "stat-change",
      stat: "ac",
      from: 15,
      to: 13,
      target: "monster-1",
    };
    expect(localizePlayEvent(event, await translator("en"), who, names)).toBe(
      "Goblin: AC 15 → 13"
    );
    expect(localizePlayEvent(event, await translator("it"), who, names)).toBe(
      "Goblin: CA 15 → 13"
    );
  });

  it("stores feet, reads them in the reader's unit: 30 ft → 20 ft / 9 m → 6 m", async () => {
    const slowed: PlayEvent = {
      kind: "stat-change",
      stat: "speed",
      from: 30,
      to: 20,
      target: "monster-1",
    };
    const set: PlayEvent = {
      kind: "stat-change",
      stat: "speed",
      to: 25,
      target: "monster-1",
    };
    const en_ = await translator("en");
    const it = await translator("it");
    expect(localizePlayEvent(slowed, en_, who, names)).toBe(
      "Goblin: Speed 30 ft → 20 ft"
    );
    const itNames: SessionReportNames = { ...names, locale: "it" };
    expect(localizePlayEvent(slowed, it, who, itNames)).toBe(
      "Goblin: Velocità 9 m → 6 m"
    );
    expect(localizePlayEvent(set, en_, who, names)).toBe("Goblin: Speed 25 ft");
    // Italian never shows feet (owner rule: IT in metres), decimals with a comma.
    expect(localizePlayEvent(set, it, who, itNames)).toBe("Goblin: Velocità 7,5 m");
  });

  it("a kind or stat from a newer app version reads as a neutral line, never blank", async () => {
    const t = await translator("en");
    const newer = {
      kind: "from-the-future",
      target: "monster-1",
    } as unknown as PlayEvent;
    const newerStat = {
      kind: "stat-change",
      stat: "flight",
      from: 1,
      to: 2,
      target: "monster-1",
    } as unknown as PlayEvent;
    expect(localizePlayEvent(newer, t, who, names)).toBe(
      "An entry from a newer version of the app"
    );
    expect(localizePlayEvent(newerStat, t, who, names)).toBe(
      "An entry from a newer version of the app"
    );
  });
});
