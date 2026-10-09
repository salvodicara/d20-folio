import i18next from "i18next";
import { describe, expect, it } from "vitest";

import enChronicle from "@/i18n/en/ui/combatChronicle.json";
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
    names
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

  it("renders the same log in Italian", async () => {
    const text = await render("it");
    expect(text).toContain("## Scontro 1 — vittoria");
    expect(text).toContain("- Ana infligge 9 danni a Goblin");
    expect(text).toContain("- Qualcuno subisce 14 danni");
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
});
