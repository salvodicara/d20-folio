/**
 * combat-chronicle presenter (`lib/views/combat-chronicle-view.ts`) — the localization
 * seam for the campaign combat chronicle. The DM's tracker emits structured
 * {@link CombatChronicleEvent}s (ids + numbers); this presenter maps each `kind` to
 * its prose template and resolves combatant / condition ids via injected resolvers.
 * Pure: `t` + resolvers are fakes, so no i18n runtime, no React.
 *
 * Pins: every kind localizes (a new kind is a COMPILE error via the exhaustive
 * switch + this table); the SAME event renders differently per locale (mixed-language
 * regression); attributed vs unattributed damage take different templates; the
 * markdown chapter builder groups by round, honors the title + note, and appends the
 * outcome.
 */
import { describe, it, expect } from "vitest";
import {
  localizeChronicleEvent,
  chronicleNeedsAttribution,
  buildChronicleChapter,
} from "@/lib/views/combat-chronicle-view";
import type {
  CombatChronicleEvent,
  CombatChronicleEventKind,
} from "@/types/combat-chronicle";

/** Fake translator: echoes the key + args so routing + interpolation are assertable. */
const t = (key: string, args?: Record<string, string | number>): string =>
  args ? `${key} ${JSON.stringify(args)}` : key;
/** An EN-ish and IT-ish fake to prove per-locale re-localization from one event. */
const tEn = (k: string, a?: Record<string, string | number>): string =>
  k === "combatChronicle.down" ? `${a?.target} falls` : t(k, a);
const tIt = (k: string, a?: Record<string, string | number>): string =>
  k === "combatChronicle.down" ? `${a?.target} cade` : t(k, a);

const resolveName = (id: string): string => `«${id}»`;
const resolveCondition = (id: string): string => `⟨${id}⟩`;

const localize = (e: CombatChronicleEvent): string =>
  localizeChronicleEvent(e, t, resolveName, resolveCondition);

const base = { id: "0", round: 1 } as const;

const SAMPLES: Record<CombatChronicleEventKind, CombatChronicleEvent> = {
  "hp-damage": {
    ...base,
    kind: "hp-damage",
    targetId: "monster-1",
    amount: 8,
    current: 4,
    max: 12,
  },
  "hp-heal": {
    ...base,
    kind: "hp-heal",
    targetId: "pc-mara",
    amount: 5,
    current: 9,
    max: 22,
  },
  down: { ...base, kind: "down", targetId: "monster-1" },
  "condition-gain": {
    ...base,
    kind: "condition-gain",
    targetId: "pc-mara",
    conditionId: "frightened",
  },
  "condition-loss": {
    ...base,
    kind: "condition-loss",
    targetId: "pc-mara",
    conditionId: "frightened",
  },
  "attack-miss": {
    ...base,
    kind: "attack-miss",
    attackerId: "pc-mara",
    targetId: "monster-1",
  },
  "turn-pass": { ...base, kind: "turn-pass", actorId: "monster-1" },
};

describe("localizeChronicleEvent — every kind routes to a distinct non-empty line", () => {
  it.each(Object.entries(SAMPLES))("%s localizes", (_kind, event) => {
    const line = localize(event);
    expect(line).toBeTruthy();
    expect(line).toContain("combatChronicle.");
  });

  it("attributed damage uses damageBy; unattributed uses damage", () => {
    expect(localize(SAMPLES["hp-damage"])).toContain("combatChronicle.damage ");
    const attributed: CombatChronicleEvent = {
      ...base,
      kind: "hp-damage",
      targetId: "monster-1",
      amount: 8,
      current: 4,
      max: 12,
      attackerId: "pc-mara",
    };
    expect(localize(attributed)).toContain("combatChronicle.damageBy");
  });

  it("the SAME event renders per the injected locale", () => {
    const en = localizeChronicleEvent(SAMPLES.down, tEn, resolveName, resolveCondition);
    const it = localizeChronicleEvent(SAMPLES.down, tIt, resolveName, resolveCondition);
    expect(en).toBe("«monster-1» falls");
    expect(it).toBe("«monster-1» cade");
    expect(en).not.toBe(it);
  });
});

describe("chronicleNeedsAttribution — pending damage only", () => {
  it("true for an unattributed, un-skipped damage event", () => {
    expect(chronicleNeedsAttribution(SAMPLES["hp-damage"])).toBe(true);
  });
  it("false once attributed or skipped, and false for non-damage", () => {
    const dmg = {
      ...base,
      kind: "hp-damage",
      targetId: "monster-1",
      amount: 8,
      current: 4,
      max: 12,
    } as const;
    expect(chronicleNeedsAttribution({ ...dmg, attackerId: "pc-mara" })).toBe(false);
    expect(chronicleNeedsAttribution({ ...dmg, attackerSkipped: true })).toBe(false);
    expect(chronicleNeedsAttribution(SAMPLES.down)).toBe(false);
  });
});

describe("buildChronicleChapter — round-grouped markdown", () => {
  const events: CombatChronicleEvent[] = [
    {
      id: "0",
      round: 1,
      kind: "hp-damage",
      targetId: "monster-1",
      amount: 8,
      current: 0,
      max: 8,
    },
    { id: "1", round: 1, kind: "down", targetId: "monster-1" },
    {
      id: "2",
      round: 2,
      kind: "condition-gain",
      targetId: "pc-mara",
      conditionId: "frightened",
    },
  ];

  it("starts with the ## title, includes the note, groups rounds, appends outcome", () => {
    const md = buildChronicleChapter(
      {
        title: "Goblin Ambush",
        note: "A tense scrap by the river.",
        events,
        outcome: "victory",
      },
      t,
      resolveName,
      resolveCondition
    );
    expect(md.startsWith("## Goblin Ambush")).toBe(true);
    expect(md).toContain("A tense scrap by the river.");
    expect(md).toContain('combatChronicle.round {"n":1}');
    expect(md).toContain('combatChronicle.round {"n":2}');
    // Exactly two round markers for two distinct rounds.
    expect(md.match(/combatChronicle\.round/g)).toHaveLength(2);
    expect(md).toContain("combatChronicle.outcomeVictory");
    // Each kept event became a bullet.
    expect(md.match(/^- /gm)).toHaveLength(3);
  });

  it("honors deletions — only the passed (kept) events appear", () => {
    const md = buildChronicleChapter(
      {
        title: "T",
        note: "",
        events: [events[0] as CombatChronicleEvent],
        outcome: "ended",
      },
      t,
      resolveName,
      resolveCondition
    );
    expect(md.match(/^- /gm)).toHaveLength(1);
    expect(md).toContain("combatChronicle.outcomeEnded");
  });

  it("an empty kept set still yields a titled chapter + outcome (no round markers)", () => {
    const md = buildChronicleChapter(
      { title: "Quiet", note: "Nothing happened.", events: [], outcome: "ended" },
      t,
      resolveName,
      resolveCondition
    );
    expect(md).toContain("## Quiet");
    expect(md).toContain("Nothing happened.");
    expect(md).not.toContain("combatChronicle.round");
  });
});
