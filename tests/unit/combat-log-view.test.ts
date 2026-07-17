/**
 * combat-log presenter (`lib/views/combat-log-view.ts`) — the events-as-data
 * localization seam (mirrors `toast-intent.test.ts`). The store emits structured
 * `CombatEvent`s (ids + numbers); this presenter maps each `kind` to its i18n
 * template + resolves the one id arg (a condition id → its localized name) via an
 * injected resolver, and maps the event to its glyph/hue. Pure: `t` + the name
 * resolver are passed in, so the test uses trivial fakes — no i18n runtime, no
 * React. Fast-lane (jsdom-free).
 *
 * The two locale-INDEPENDENCE invariants this pins:
 *  - EVERY `CombatEvent.kind` localizes (a new kind without a presenter branch is
 *    a COMPILE error via the exhaustive switch; this also asserts each routes to a
 *    distinct, non-empty template — so a kind can never silently render blank).
 *  - The SAME stored event renders in whatever locale the caller passes — proved
 *    by routing one event through an EN fake and an IT fake and getting different
 *    lines from the SAME structured input (the mixed-language bug's regression).
 */
import { describe, it, expect } from "vitest";
import {
  localizeCombatEvent,
  eventLogStyle,
  localizeCombatLogRow,
} from "@/lib/views/combat-log-view";
import type { CombatEvent, CombatEventKind } from "@/types/combat-log";
import type { LocText } from "@/lib/loc-text";
import { conc } from "./__helpers__/concentration";

/** Fake translator: echoes the key + interpolated args so we can assert routing. */
const t = (key: string, args?: Record<string, string | number>): string =>
  args ? `${key} ${JSON.stringify(args)}` : key;

const resolveConditionName = (id: string): string => `«${id}»`;
const resolveSourceName = (id: string): string => `‹${id}›`;
// Concentration is stored as a spell id (golden rule 7); the injected resolver
// localizes it (a marker so the test asserts it is consulted on the spell arg).
const resolveSpellName = (value: string): string => `⟨${value}⟩`;
// Resolve a logged action's LocText ref to its localized name (marker-wrapped like
// the rider resolver below): a custom ref shows its user-authored string, a lit
// constant its EN face, a ui ref its chrome key, an srd ref its stable key — so the
// test asserts the ref is consulted on the action arg.
const resolveLoc = (r: LocText): string =>
  `⟨${"custom" in r ? r.custom : "lit" in r ? r.lit.en : "ui" in r ? r.ui : r.srd.key}⟩`;
const resolveActionRef = resolveLoc;
// A rider's LocText provenance resolves the same way (action + rider are both LocText).
const resolveRiderRef = resolveLoc;

const localize = (event: CombatEvent): string =>
  localizeCombatEvent(
    event,
    t,
    resolveConditionName,
    resolveSourceName,
    resolveSpellName,
    resolveActionRef,
    resolveRiderRef
  );

// One representative event per kind — the table the presenter must fully cover.
const SAMPLES: Record<CombatEventKind, CombatEvent> = {
  "action-use": {
    kind: "action-use",
    action: { srd: { kind: "spell", key: "fireball", field: "name" } },
    effect: "damage",
    slot: "action",
  },
  "reaction-use": {
    kind: "reaction-use",
    action: { srd: { kind: "spell", key: "counterspell", field: "name" } },
    effect: "spell-cast",
  },
  "rider-use": {
    kind: "rider-use",
    action: { srd: { kind: "equipment", key: "longsword", field: "name" } },
    rider: { lit: { en: "Psionic Strike", it: "Colpo Psionico" } },
    effect: "damage",
  },
  "hp-damage": { kind: "hp-damage", amount: 8, current: 4, max: 30 },
  "hp-heal": { kind: "hp-heal", amount: 5, current: 9, max: 30 },
  "temp-hp-gain": { kind: "temp-hp-gain", amount: 7 },
  "condition-gain": { kind: "condition-gain", conditionId: "prone" },
  "condition-loss": { kind: "condition-loss", conditionId: "prone" },
  "concentration-start": { kind: "concentration-start", spell: conc("bless") },
  "concentration-end": { kind: "concentration-end", spell: conc("bless") },
  "death-save": {
    kind: "death-save",
    outcome: "failure",
    successes: 1,
    failures: 2,
  },
  rest: { kind: "rest", restKind: "long" },
  "turn-end": { kind: "turn-end", round: 3 },
  "effect-expired": { kind: "effect-expired", sourceId: "barbarian-rage" },
  legacy: { kind: "legacy", text: "Cast Hypnotic Pattern" },
};

describe("localizeCombatEvent — every kind routes to a non-empty template", () => {
  it.each(Object.keys(SAMPLES) as CombatEventKind[])(
    "%s localizes to a non-empty line",
    (kind) => {
      const line = localize(SAMPLES[kind]);
      expect(line.length).toBeGreaterThan(0);
    }
  );

  it("routes action-use / reaction-use through combatLog.actionUse with the name", () => {
    expect(localize(SAMPLES["action-use"])).toBe(
      'combatLog.actionUse {"name":"⟨fireball⟩"}'
    );
    expect(localize(SAMPLES["reaction-use"])).toBe(
      'combatLog.actionUse {"name":"⟨counterspell⟩"}'
    );
  });

  it("ATTACK-PIPS — an action-use with a swing count routes through actionUseAttackOf", () => {
    expect(
      localize({
        kind: "action-use",
        action: { srd: { kind: "equipment", key: "longsword", field: "name" } },
        effect: "attack",
        slot: "action",
        attackOf: { n: 2, total: 2 },
      })
    ).toBe('combatLog.actionUseAttackOf {"name":"⟨longsword⟩","n":2,"total":2}');
  });

  it("routes rider-use through combatLog.riderUse with the rider + attacked action names", () => {
    expect(localize(SAMPLES["rider-use"])).toBe(
      'combatLog.riderUse {"rider":"⟨Psionic Strike⟩","name":"⟨longsword⟩"}'
    );
  });

  it("routes hp-damage / hp-heal with amount + resulting current/max", () => {
    expect(localize(SAMPLES["hp-damage"])).toBe(
      'combatLog.hpDamage {"amount":8,"current":4,"max":30}'
    );
    expect(localize(SAMPLES["hp-heal"])).toBe(
      'combatLog.hpHeal {"amount":5,"current":9,"max":30}'
    );
  });

  it("routes temp-hp-gain with the amount", () => {
    expect(localize(SAMPLES["temp-hp-gain"])).toBe('combatLog.tempHpGain {"amount":7}');
  });

  it("resolves the condition id to a localized name for gain + loss", () => {
    expect(localize(SAMPLES["condition-gain"])).toBe(
      'combatLog.conditionGain {"condition":"«prone»"}'
    );
    expect(localize(SAMPLES["condition-loss"])).toBe(
      'combatLog.conditionLoss {"condition":"«prone»"}'
    );
  });

  it("resolves the concentration spell id for start (own key) + end (reuses the toast key)", () => {
    expect(localize(SAMPLES["concentration-start"])).toBe(
      'combatLog.concentrationStart {"spell":"⟨bless⟩"}'
    );
    expect(localize(SAMPLES["concentration-end"])).toBe(
      'combat.stoppedConcentratingToast {"spell":"⟨bless⟩"}'
    );
  });

  it("routes the death-save outcome to the right key with the tally", () => {
    expect(localize(SAMPLES["death-save"])).toBe(
      'combatLog.deathSaveFailure {"successes":1,"failures":2}'
    );
    expect(
      localize({ kind: "death-save", outcome: "success", successes: 3, failures: 0 })
    ).toBe('combatLog.deathSaveSuccess {"successes":3,"failures":0}');
  });

  it("routes rest by restKind and turn-end (reuses the End-Turn toast key)", () => {
    expect(localize(SAMPLES.rest)).toBe("combatLog.longRest");
    expect(localize({ kind: "rest", restKind: "short" })).toBe("combatLog.shortRest");
    expect(localize(SAMPLES["turn-end"])).toBe('combat.endTurnToast {"round":3}');
  });

  it("renders a legacy event's frozen text verbatim", () => {
    expect(localize(SAMPLES.legacy)).toBe("Cast Hypnotic Pattern");
  });
});

describe("locale-INDEPENDENCE — the same stored event re-localizes per locale", () => {
  // Two fakes standing in for EN + IT: each returns a locale-tagged line. The
  // SAME structured event must produce DIFFERENT lines — proving storage is
  // locale-free and the language is applied only at render (the mixed-language bug).
  const enT = (key: string, a?: Record<string, string | number>) =>
    `EN:${key}:${a?.amount ?? a?.name ?? ""}`;
  const itT = (key: string, a?: Record<string, string | number>) =>
    `IT:${key}:${a?.amount ?? a?.name ?? ""}`;
  const enName = () => "Prone";
  const itName = () => "Prono";
  const noSpell = (v: string) => v;
  const noLoc = (r: LocText) =>
    "custom" in r ? r.custom : "lit" in r ? r.lit.en : "ui" in r ? r.ui : r.srd.key;
  const noAction = noLoc;
  const noRider = noLoc;

  it("an hp-damage event renders EN then IT from ONE stored object", () => {
    const event = SAMPLES["hp-damage"];
    expect(
      localizeCombatEvent(event, enT, enName, enName, noSpell, noAction, noRider)
    ).toBe("EN:combatLog.hpDamage:8");
    expect(
      localizeCombatEvent(event, itT, itName, itName, noSpell, noAction, noRider)
    ).toBe("IT:combatLog.hpDamage:8");
  });

  it("a condition event resolves its NAME per locale (Prone vs Prono)", () => {
    const event = SAMPLES["condition-gain"];
    expect(
      localizeCombatEvent(event, enT, enName, enName, noSpell, noAction, noRider)
    ).toBe("EN:combatLog.conditionGain:");
    // The condition NAME resolver is locale-specific; assert it is consulted.
    expect(
      localizeCombatEvent(
        event,
        (_k, a) => String(a?.condition),
        enName,
        enName,
        noSpell,
        noAction,
        noRider
      )
    ).toBe("Prone");
    expect(
      localizeCombatEvent(
        event,
        (_k, a) => String(a?.condition),
        itName,
        itName,
        noSpell,
        noAction,
        noRider
      )
    ).toBe("Prono");
  });

  it("an effect-expired event resolves its SOURCE name (provenance) per locale", () => {
    const event = SAMPLES["effect-expired"];
    // The line passes the resolved source name into the template `name` arg.
    expect(
      localizeCombatEvent(
        event,
        (_k, a) => String(a?.name),
        () => "",
        () => "Rage",
        noSpell,
        noAction,
        noRider
      )
    ).toBe("Rage");
    expect(
      localizeCombatEvent(
        event,
        (_k, a) => String(a?.name),
        () => "",
        () => "Ira",
        noSpell,
        noAction,
        noRider
      )
    ).toBe("Ira");
  });

  it("a concentration event resolves its SPELL id per locale (the rail name)", () => {
    const event = SAMPLES["concentration-start"];
    // The line passes the resolved spell name into the template `spell` arg.
    expect(
      localizeCombatEvent(
        event,
        (_k, a) => String(a?.spell),
        () => "",
        () => "",
        () => "Hypnotic Pattern",
        noAction,
        noRider
      )
    ).toBe("Hypnotic Pattern");
    expect(
      localizeCombatEvent(
        event,
        (_k, a) => String(a?.spell),
        () => "",
        () => "",
        () => "Trama Ipnotica",
        noAction,
        noRider
      )
    ).toBe("Trama Ipnotica");
  });
});

describe("eventLogStyle — glyph (effect) + hue (slot) per event", () => {
  it("an action-use row's hue follows the economy SLOT (action → green family)", () => {
    expect(eventLogStyle(SAMPLES["action-use"]).hueFamily).toBe("action");
    expect(
      eventLogStyle({
        kind: "action-use",
        action: { custom: "x" },
        effect: "spell-cast",
        slot: "bonus",
      }).hueFamily
    ).toBe("bonus");
  });

  it("a reaction-use row is always the reaction (red) family", () => {
    expect(eventLogStyle(SAMPLES["reaction-use"]).hueFamily).toBe("reaction");
  });

  it("hp-damage is reaction-red, hp-heal/temp is action-green (semantic fallback)", () => {
    expect(eventLogStyle(SAMPLES["hp-damage"]).hueFamily).toBe("reaction");
    expect(eventLogStyle(SAMPLES["hp-heal"]).hueFamily).toBe("action");
    expect(eventLogStyle(SAMPLES["temp-hp-gain"]).hueFamily).toBe("action");
  });

  it("condition gain is warning, loss is action; death-save is reaction; rest is free", () => {
    expect(eventLogStyle(SAMPLES["condition-gain"]).hueFamily).toBe("warning");
    expect(eventLogStyle(SAMPLES["condition-loss"]).hueFamily).toBe("action");
    expect(eventLogStyle(SAMPLES["death-save"]).hueFamily).toBe("reaction");
    expect(eventLogStyle(SAMPLES.rest).hueFamily).toBe("free");
    expect(eventLogStyle(SAMPLES["turn-end"]).hueFamily).toBe("neutral");
  });

  it("a legacy event keeps the glyph/hue it was stored with", () => {
    const styled = eventLogStyle({
      kind: "legacy",
      text: "x",
      legacyType: "spell-cast",
      slot: "reaction",
    });
    expect(styled.hueFamily).toBe("reaction");
  });

  it("localizeCombatLogRow returns BOTH the line and the style", () => {
    const row = localizeCombatLogRow(
      SAMPLES["hp-heal"],
      t,
      resolveConditionName,
      resolveSourceName,
      resolveSpellName,
      resolveActionRef,
      resolveRiderRef
    );
    expect(row.text).toContain("combatLog.hpHeal");
    expect(row.style.hueFamily).toBe("action");
  });
});
