/**
 * combat-chronicle presenter (`lib/views/combat-chronicle-view.ts`) — the feed's line
 * for each session-log event, and the chapter the DM saves at the end. Pure: `t` and the
 * resolvers are injected, so the same event renders in either language. The HP readout
 * is appended only when the caller passes it (the caller decides who may see it).
 */
import { describe, it, expect } from "vitest";
import i18next from "i18next";
import enChronicle from "@/i18n/en/ui/combatChronicle.json";
import enReport from "@/i18n/en/ui/sessionReport.json";
import itChronicle from "@/i18n/it/ui/combatChronicle.json";
import itReport from "@/i18n/it/ui/sessionReport.json";
import {
  buildEncounterChapter,
  localizeFeedEvent,
  type FeedNames,
} from "@/lib/views/combat-chronicle-view";
import type { PlayEvent, PlayEventKind } from "@/lib/session-log";

/** Fake translator: echoes the key + args so routing + interpolation are assertable. */
const t = (key: string, args?: Record<string, string | number>): string =>
  args ? `${key} ${JSON.stringify(args)}` : key;

const names: FeedNames = {
  name: (id) => `«${id}»`,
  condition: (id) => `⟨${id}⟩`,
  action: () => "Longsword",
  spell: (ref) => String(ref),
};
const line = (event: PlayEvent, hp?: { current: number; max: number }): string =>
  localizeFeedEvent(event, t, names, hp);

/** One sample per kind the feed can show (markers never reach it). */
const SAMPLES: Record<
  Exclude<PlayEventKind, "encounter-start" | "encounter-end" | "round-start">,
  PlayEvent
> = {
  action: { kind: "action", actor: "pc-mara", targets: ["monster-1"], outcome: "hit" },
  damage: { kind: "damage", amount: 8, target: "monster-1" },
  heal: { kind: "heal", amount: 5, target: "pc-mara" },
  "temp-hp": { kind: "temp-hp", amount: 5, target: "pc-mara" },
  condition: { kind: "condition", conditionId: "prone", gained: true, target: "pc-mara" },
  concentration: {
    kind: "concentration",
    spell: "bless" as never,
    started: true,
    actor: "pc-ivo",
  },
  down: { kind: "down", target: "monster-1" },
  stabilized: { kind: "stabilized", target: "pc-mara", actor: "pc-ivo" },
  "resource-grant": {
    kind: "resource-grant",
    resource: "bardic-inspiration-die",
    value: "d6",
    target: "pc-mara",
    actor: "pc-cat",
  },
  "death-save": { kind: "death-save", outcome: "success", actor: "pc-mara" },
  rest: { kind: "rest", rest: "short", actor: "pc-mara" },
  note: { kind: "note", text: "The bridge collapses." },
  status: { kind: "status", sourceId: "rage", started: false, actor: "pc-mara" },
};

describe("localizeFeedEvent", () => {
  it.each(Object.entries(SAMPLES))("%s renders a non-empty line", (_kind, event) => {
    expect(line(event).length).toBeGreaterThan(0);
  });

  it("attributed damage names the attacker and the action; unattributed does not", () => {
    expect(line(SAMPLES.damage)).toContain("combatChronicle.damage ");
    expect(
      line({ kind: "damage", amount: 8, target: "monster-1", actor: "pc-mara" })
    ).toContain("combatChronicle.damageBy ");
    expect(
      line({
        kind: "damage",
        amount: 8,
        target: "monster-1",
        actor: "pc-mara",
        source: { custom: "Longsword" },
      })
    ).toContain("combatChronicle.damageByAction");
  });

  it("shows the HP readout only when the caller passes it", () => {
    expect(line(SAMPLES.damage)).not.toContain("hpReadout");
    expect(line(SAMPLES.damage, { current: 4, max: 12 })).toContain(
      'combatChronicle.hpReadout {"current":4,"max":12}'
    );
    expect(line(SAMPLES.heal, { current: 9, max: 22 })).toContain("hpReadout");
  });

  it("a declared miss reads as the miss line", () => {
    expect(
      line({ kind: "action", actor: "pc-mara", targets: ["monster-1"], outcome: "miss" })
    ).toContain("combatChronicle.missBy ");
  });

  it("re-localizes the same event per language (real strings)", async () => {
    const i18n = i18next.createInstance();
    await i18n.init({
      lng: "en",
      resources: {
        en: { translation: { ...enReport, ...enChronicle } },
        it: { translation: { ...itReport, ...itChronicle } },
      },
      interpolation: { escapeValue: false },
    });
    const real = (lng: string) => (k: string, a?: Record<string, string | number>) =>
      i18n.t(k, { ...a, lng });
    const hit: PlayEvent = {
      kind: "damage",
      amount: 8,
      target: "monster-1",
      actor: "pc-mara",
    };
    const plain = {
      ...names,
      name: (id: string) => (id === "pc-mara" ? "Mara" : "Goblin"),
    };
    expect(localizeFeedEvent(hit, real("en"), plain, { current: 4, max: 12 })).toBe(
      "Mara hits Goblin for 8 (4/12 HP)"
    );
    expect(localizeFeedEvent(hit, real("it"), plain)).toBe("Mara colpisce Goblin per 8");
  });
});

describe("buildEncounterChapter — round-grouped markdown", () => {
  const lines = [
    { round: 1, text: "Goblin takes 8" },
    { round: 1, text: "Goblin falls" },
    { round: 2, text: "Mara is frightened" },
  ];

  it("starts with the ## title, includes the note, groups rounds, appends outcome", () => {
    const md = buildEncounterChapter(
      {
        title: "Goblin Ambush",
        note: "A tense scrap by the river.",
        lines,
        outcome: "victory",
      },
      t
    );
    expect(md.startsWith("## Goblin Ambush")).toBe(true);
    expect(md).toContain("A tense scrap by the river.");
    expect(md.match(/combatChronicle\.round/g)).toHaveLength(2);
    expect(md).toContain("combatChronicle.outcomeVictory");
    expect(md.match(/^- /gm)).toHaveLength(3);
  });

  it("an empty record still yields a titled chapter + outcome (no round markers)", () => {
    const md = buildEncounterChapter(
      { title: "Quiet", note: "Nothing happened.", lines: [], outcome: "ended" },
      t
    );
    expect(md).toContain("## Quiet");
    expect(md).toContain("Nothing happened.");
    expect(md).not.toContain("combatChronicle.round");
    expect(md).toContain("combatChronicle.outcomeEnded");
  });
});
