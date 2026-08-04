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
import i18n from "@/i18n";
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
  "attack-miss": {
    ...base,
    kind: "attack-miss",
    attackerId: "pc-mara",
    targetId: "monster-1",
  },
  "attack-multi": {
    ...base,
    kind: "attack-multi",
    attackerId: "pc-mara",
    targetIds: ["monster-1", "monster-2"],
    amounts: [
      { targetId: "monster-1", amount: 22 },
      { targetId: "monster-2", amount: 11 },
    ],
  },
  "attack-save": {
    ...base,
    kind: "attack-save",
    attackerId: "pc-mara",
    targetIds: ["monster-1", "monster-2", "monster-3"],
    amounts: [
      { targetId: "monster-1", amount: 22 },
      { targetId: "monster-2", amount: 11 },
    ],
    resisted: ["monster-3"],
  },
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
  "resource-grant": {
    ...base,
    kind: "resource-grant",
    targetId: "pc-mara",
    resource: "bardic-inspiration-die",
    value: "d6",
    actorId: "pc-catalion",
  },
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

  it("uses the Heroic Inspiration line for that resource grant", () => {
    expect(
      localize({
        ...base,
        kind: "resource-grant",
        targetId: "pc-mara",
        resource: "heroic-inspiration",
        actorId: "pc-catalion",
      })
    ).toContain("combatChronicle.heroicInspirationGrant");
  });

  it("a player-declared miss uses missBy with the attacker + target", () => {
    const line = localize(SAMPLES["attack-miss"]);
    expect(line).toContain("combatChronicle.missBy");
    expect(line).toContain("«pc-mara»");
    expect(line).toContain("«monster-1»");
  });

  it("a multi-target HIT uses multiHit; a fully-un-dropped set uses multiMiss", () => {
    expect(localize(SAMPLES["attack-multi"])).toContain("combatChronicle.multiHit");
    const missed: CombatChronicleEvent = {
      ...base,
      kind: "attack-multi",
      attackerId: "pc-mara",
      targetIds: ["monster-1", "monster-2"],
      amounts: [], // no drops ⇒ the MISS line over the full declared set
    };
    expect(localize(missed)).toContain("combatChronicle.multiMiss");
  });

  it("an area SAVE with damaged + resisted targets uses saveHitResisted", () => {
    const line = localize(SAMPLES["attack-save"]);
    expect(line).toContain("combatChronicle.saveHitResisted");
    // The damaged targets carry the DM's real numbers; the resisted target is named.
    expect(line).toContain("«monster-1»");
    expect(line).toContain("22");
    expect(line).toContain("«monster-3»");
  });

  it("an area SAVE with NO resisted targets uses the plain saveHit", () => {
    const allDamaged: CombatChronicleEvent = {
      ...base,
      kind: "attack-save",
      attackerId: "pc-mara",
      targetIds: ["monster-1", "monster-2"],
      amounts: [
        { targetId: "monster-1", amount: 20 },
        { targetId: "monster-2", amount: 18 },
      ],
      resisted: [],
    };
    const line = localize(allDamaged);
    expect(line).toContain("combatChronicle.saveHit ");
    expect(line).not.toContain("saveHitResisted");
  });

  it("a correlated condition uses conditionGainBy (crediting the attacker); a bare one uses conditionGain", () => {
    expect(localize(SAMPLES["condition-gain"])).toContain(
      "combatChronicle.conditionGain "
    );
    const credited: CombatChronicleEvent = {
      ...base,
      kind: "condition-gain",
      targetId: "monster-1",
      conditionId: "prone",
      attackerId: "pc-mara",
    };
    const line = localize(credited);
    expect(line).toContain("combatChronicle.conditionGainBy");
    expect(line).toContain("«pc-mara»");
  });

  it("keeps the exact action name in an attributed save and condition", () => {
    const action = {
      srd: { kind: "spell" as const, key: "vicious-mockery", field: "name" },
    };
    const resolveAction = () => "Beffa crudele";
    const save: CombatChronicleEvent = {
      ...base,
      kind: "attack-save",
      attackerId: "pc-lyra",
      targetIds: ["monster-specter"],
      amounts: [{ targetId: "monster-specter", amount: 4 }],
      resisted: [],
      action,
    };
    const condition: CombatChronicleEvent = {
      ...base,
      kind: "condition-gain",
      targetId: "monster-specter",
      conditionId: "frightened",
      attackerId: "pc-lyra",
      action,
    };
    expect(
      localizeChronicleEvent(save, t, resolveName, resolveCondition, resolveAction)
    ).toContain('"action":"Beffa crudele"');
    expect(
      localizeChronicleEvent(condition, t, resolveName, resolveCondition, resolveAction)
    ).toContain("conditionGainByAction");
  });

  it("the SAME event renders per the injected locale", () => {
    const en = localizeChronicleEvent(SAMPLES.down, tEn, resolveName, resolveCondition);
    const it = localizeChronicleEvent(SAMPLES.down, tIt, resolveName, resolveCondition);
    expect(en).toBe("«monster-1» falls");
    expect(it).toBe("«monster-1» cade");
    expect(en).not.toBe(it);
  });
});

describe("attack-multi prose — natural EN + IT for 2 / 3 / N targets (real i18n)", () => {
  // The REAL translator (setup.fast loads EN + IT eagerly), so the enumeration join +
  // per-target amounts read as real prose in both languages. Names resolve bare (no
  // article) — locale-correct for both EN and IT.
  const name = (id: string): string =>
    ({ "monster-1": "Goblin", "monster-2": "Chief", "monster-3": "Ogre" })[id] ?? id;
  const cond = (id: string): string => id;
  const multi = (
    amounts: Array<{ targetId: string; amount: number }>
  ): CombatChronicleEvent => ({
    ...base,
    kind: "attack-multi",
    attackerId: "pc-cor",
    targetIds: amounts.map((a) => a.targetId),
    amounts,
  });
  const proseFor = (
    locale: "en" | "it",
    amounts: Array<{ targetId: string; amount: number }>
  ) =>
    localizeChronicleEvent(
      multi(amounts),
      i18n.getFixedT(locale),
      (id) => (id === "pc-cor" ? "Coralino" : name(id)),
      cond
    );

  it("two targets: 'A (x) and B (y)' / 'A (x) e B (y)'", () => {
    const two = [
      { targetId: "monster-1", amount: 22 },
      { targetId: "monster-2", amount: 11 },
    ];
    expect(proseFor("en", two)).toBe("Coralino hits Goblin (22) and Chief (11)");
    expect(proseFor("it", two)).toBe("Coralino colpisce Goblin (22) e Chief (11)");
  });

  it("three targets: 'A (x), B (y) and C (z)' / 'A (x), B (y) e C (z)'", () => {
    const three = [
      { targetId: "monster-1", amount: 22 },
      { targetId: "monster-2", amount: 22 },
      { targetId: "monster-3", amount: 11 },
    ];
    expect(proseFor("en", three)).toBe(
      "Coralino hits Goblin (22), Chief (22) and Ogre (11)"
    );
    expect(proseFor("it", three)).toBe(
      "Coralino colpisce Goblin (22), Chief (22) e Ogre (11)"
    );
  });

  it("a single struck target reads as one clause (no conjunction)", () => {
    const one = [{ targetId: "monster-1", amount: 22 }];
    expect(proseFor("en", one)).toBe("Coralino hits Goblin (22)");
    expect(proseFor("it", one)).toBe("Coralino colpisce Goblin (22)");
  });

  it("a full MISS names every declared target with the locale conjunction", () => {
    const missed: CombatChronicleEvent = {
      ...base,
      kind: "attack-multi",
      attackerId: "pc-cor",
      targetIds: ["monster-1", "monster-2", "monster-3"],
      amounts: [],
    };
    const t = (locale: "en" | "it") =>
      localizeChronicleEvent(
        missed,
        i18n.getFixedT(locale),
        (id) => (id === "pc-cor" ? "Coralino" : name(id)),
        cond
      );
    expect(t("en")).toBe("Coralino misses Goblin, Chief and Ogre");
    expect(t("it")).toBe("Coralino manca Goblin, Chief e Ogre");
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
