/**
 * The combat playbook: what this character usually does on a turn, generated
 * from its resolved actions (docs/design/combat-playbook.md).
 *
 * Pure and deterministic: the same character, context and overrides give the
 * same playbook. Every step names the rule that made it, the rule's fixed
 * priority, the resource it spends and the reasons (ids and params, localized by
 * the view). No dice are rolled and no expected-value maths beyond a dice
 * average is used, so a beginner can follow every recommendation by hand.
 */
import { effectiveSessionConditions } from "@/lib/effective-conditions";
import { vitalSlotUsed } from "@/lib/character-vitals";
import { getSrdFeatureSource } from "@/lib/srd-feature-lookup";
import {
  attacksPerActionForCharacter,
  isBloodied,
  resolveActions,
  resolveTrackers,
  type RawResolvedAction,
  type RawResolvedTracker,
} from "@/lib/smart-tracker";
import type { ReactionTrigger } from "@/data/types";
import type { CharacterDoc } from "@/types/character";
import { applyOverrides } from "./apply-overrides";
import { planTurn } from "./plan-turn";
import {
  type EconomySlot,
  type Playbook,
  type PlaybookContext,
  type PlaybookLimit,
  type PlaybookOption,
  type PlaybookOverrides,
  type PlaybookRuleId,
  type PlaybookSource,
  type PlaybookStep,
  type PlaybookTrigger,
  type PlaybookWhy,
} from "./types";

/**
 * Each rule's fixed priority. A bonus-action step gets {@link BONUS_SLOT_BONUS}
 * on top (it keeps the action free); a player pin adds `PIN_BONUS`.
 */
export const RULE_PRIORITY: Readonly<Record<PlaybookRuleId, number>> = {
  "heal-ally-down": 900,
  "self-heal-bloodied": 800,
  "area-when-grouped": 700,
  "burst-tough-foe": 700,
  "control-tough-foe": 650,
  "concentration-opener": 550,
  "default-attack": 500,
  "set-up-advantage": 460,
  "disengage-when-adjacent": 450,
  "hide-when-possible": 440,
  "dash-when-far": 430,
  "reaction-defense": 400,
  "opportunity-attack": 300,
  position: 100,
};
export const BONUS_SLOT_BONUS = 50;

/** The smallest group one area spell is worth a slot for. */
const AREA_MIN_ENEMIES = 3;

/** Reaction triggers that mean "you are being hit": a defensive reaction. */
const DEFENSIVE_TRIGGERS: ReadonlySet<string> = new Set<ReactionTrigger>([
  "hitByAttack",
  "hitOrMagicMissileTarget",
  "takeDamage",
]);

/**
 * Once-per-turn riders whose rules condition the catalogue does not declare yet.
 * Sneak Attack needs Advantage or an ally next to the target (SRD 5.2.1). Move
 * this into the rider's grant data when the grant grows a `requires` field.
 */
const RIDER_WHEN: Readonly<Record<string, PlaybookTrigger>> = {
  "rogue-sneak-attack": { kind: "advantage-or-ally-adjacent" },
};

const TRACKER_SUFFIX = /-(action|bonus|reaction|free)$/;

interface Facts {
  doc: CharacterDoc;
  context: PlaybookContext;
  trackers: ReadonlyMap<string, RawResolvedTracker>;
  concentratingOn: string;
  incapacitated: boolean;
}

interface Draft {
  rule: PlaybookRuleId;
  slot: EconomySlot;
  actions: ReadonlyArray<RawResolvedAction>;
  when: PlaybookTrigger;
  why: PlaybookWhy[];
}

export function buildCombatPlaybook(
  character: CharacterDoc,
  context: PlaybookContext = {},
  overrides: PlaybookOverrides = {}
): Playbook {
  const actions = resolveActions(character);
  const facts: Facts = {
    doc: character,
    context,
    trackers: new Map(resolveTrackers(character).map((t) => [t.id, t])),
    concentratingOn: character.session.concentration,
    incapacitated: effectiveSessionConditions(character.session).includes(
      "incapacitated"
    ),
  };

  const drafts = draftSteps(actions, facts);
  const steps = drafts
    .filter((d) => d.slot === "movement" || d.actions.length > 0)
    .map((d) => finishStep(d, facts));

  const { kept, hidden } = applyOverrides(steps, overrides);
  return {
    version: 1,
    steps: kept,
    hidden,
    plan: planTurn(kept),
    authored: character.character.combatAlgorithm,
  };
}

// ── Rules ─────────────────────────────────────────────────────────────────────

function draftSteps(actions: ReadonlyArray<RawResolvedAction>, facts: Facts): Draft[] {
  const drafts: Draft[] = [];
  const attack = defaultAttack(actions, facts.doc);
  const ranged = attack.actions[0] ? isRanged(attack.actions[0]) : false;

  drafts.push({
    rule: "position",
    slot: "movement",
    actions: [],
    when: { kind: "always" },
    why: [{ key: ranged ? "keep-range" : "move-to-melee", source: rule("movement") }],
  });

  for (const slot of ["action", "bonus"] as const) {
    const inSlot = actions.filter((a) => a.type === slot);
    const slotSpells = inSlot.filter((a) => a.source === "spell" && a.costsSlot);

    const allyHeals = byCheapest(slotSpells.filter((a) => a.summary.healing));
    drafts.push({
      rule: "heal-ally-down",
      slot,
      actions: allyHeals,
      when: { kind: "ally-down" },
      why: [
        { key: "revives-ally", source: rule("zero-hit-points") },
        ...(slot === "bonus" ? [{ key: "keeps-action-free" as const }] : []),
        ...slotWhy(allyHeals),
      ],
    });

    const selfHeals = inSlot.filter(
      (a) =>
        a.source === "feature" &&
        a.summary.heal &&
        a.summary.targeting?.affinity === "self"
    );
    drafts.push({
      rule: "self-heal-bloodied",
      slot,
      actions: selfHeals,
      when: { kind: "self-bloodied" },
      why: [
        ...selfHeals.map((a) => ({
          key: "self-heal" as const,
          params: { dice: a.summary.heal?.dice ?? "", bonus: a.summary.heal?.bonus ?? 0 },
          source: featureSource(a),
        })),
        ...trackerWhy(selfHeals, facts),
      ],
    });

    const area = byCheapest(slotSpells.filter((a) => a.summary.area && a.summary.damage));
    drafts.push({
      rule: "area-when-grouped",
      slot,
      actions: area,
      when: { kind: "enemies-grouped", min: AREA_MIN_ENEMIES },
      why: [
        {
          key: "area-hits-many",
          params: { min: AREA_MIN_ENEMIES },
          source: spellSource(area),
        },
        ...slotWhy(area),
      ],
    });

    const control = byCheapest(
      slotSpells.filter((a) => a.summary.conditionApplication && !a.summary.area)
    );
    drafts.push({
      rule: "control-tough-foe",
      slot,
      actions: control,
      when: { kind: "tough-foe" },
      why: [
        { key: "controls-foe", source: spellSource(control) },
        ...concentrationWhy(control),
        ...slotWhy(control),
      ],
    });

    const openers = byCheapest(
      slotSpells.filter(
        (a) => a.concentration && !a.summary.conditionApplication && !a.summary.area
      )
    );
    drafts.push({
      rule: "concentration-opener",
      slot,
      actions: openers,
      when: { kind: "fight-start" },
      why: [
        ...concentrationWhy(openers),
        ...(slot === "bonus" ? [{ key: "keeps-action-free" as const }] : []),
        ...slotWhy(openers),
      ],
    });
  }

  for (const slot of ["action", "bonus", "free"] as const) {
    const bursts = actions.filter(
      (a) =>
        a.type === slot &&
        a.source === "feature" &&
        a.costTracker &&
        a.summary.targeting?.affinity !== "self" &&
        (a.summary.damage || grantsExtraAction(a))
    );
    drafts.push({
      rule: "burst-tough-foe",
      slot,
      actions: bursts,
      when: { kind: "tough-foe" },
      why: [
        ...bursts.filter(grantsExtraAction).map((a) => ({
          key: "extra-action" as const,
          source: featureSource(a),
        })),
        ...trackerWhy(bursts, facts),
      ],
    });
  }

  drafts.push(attack);

  const bonus = actions.filter((a) => a.type === "bonus");
  const steady = bonus.filter((a) => a.grantsNextAttackAdvantage);
  drafts.push({
    rule: "set-up-advantage",
    slot: "bonus",
    actions: steady,
    when: { kind: "not-moving" },
    why: steady.map((a) => ({ key: "advantage-next-attack", source: featureSource(a) })),
  });
  const mobility: Array<[PlaybookRuleId, string, PlaybookTrigger]> = [
    ["disengage-when-adjacent", "disengage", { kind: "enemy-adjacent" }],
    ["hide-when-possible", "hide", { kind: "can-hide" }],
    ["dash-when-far", "dash", { kind: "target-far" }],
  ];
  for (const [ruleId, category, when] of mobility) {
    const found = bonus.filter((a) => a.economyCategory === category);
    drafts.push({
      rule: ruleId,
      slot: "bonus",
      actions: found,
      when,
      why: found.map((a) => ({
        key: "bonus-mobility",
        params: { category },
        source: featureSource(a),
      })),
    });
  }

  const reactions = actions.filter((a) => a.type === "reaction");
  const defenses = reactions.filter((a) =>
    DEFENSIVE_TRIGGERS.has(reactionTriggerOf(a) ?? "")
  );
  const firstDefense = defenses[0];
  drafts.push({
    rule: "reaction-defense",
    slot: "reaction",
    actions: defenses,
    when: firstDefense
      ? { kind: "reaction", on: reactionTriggerOf(firstDefense) as ReactionTrigger }
      : { kind: "reaction", on: "hitByAttack" },
    why: [
      ...defenses.map((a) => ({
        key: "reaction-defense" as const,
        params: { trigger: reactionTriggerOf(a) ?? "" },
        source: a.source === "spell" ? spellSource([a]) : featureSource(a),
      })),
      ...slotWhy(defenses),
      ...trackerWhy(defenses, facts),
    ],
  });
  const opportunity = reactions.filter((a) => a.id === "base-opportunity-attack");
  drafts.push({
    rule: "opportunity-attack",
    slot: "reaction",
    actions: opportunity,
    when: { kind: "reaction", on: "creatureLeavesReach" },
    why: [{ key: "opportunity-attack", source: rule("opportunity-attack") }],
  });

  return drafts;
}

/** The usual Attack-action choice: the best weapon or damage cantrip. */
function defaultAttack(
  actions: ReadonlyArray<RawResolvedAction>,
  doc: CharacterDoc
): Draft {
  const attacks = attacksPerActionForCharacter(doc);
  const candidates = actions.filter(
    (a) =>
      a.type === "action" &&
      (a.source === "weapon" || (a.spellLevel === 0 && a.summary.damage !== undefined))
  );
  const real = candidates.filter((a) => a.id !== "unarmed-strike");
  const pool = real.length > 0 ? real : candidates;
  const value = (a: RawResolvedAction): number =>
    averageDamage(a.summary.damage) *
    (a.source === "weapon" ? attacks : (a.summary.instances ?? 1));
  // Stable sort: higher value, then ranged on a tie, then resolve order.
  const ranked = pool
    .map((a, index) => ({ a, index, v: value(a) }))
    .sort(
      (x, y) =>
        y.v - x.v || Number(isRanged(y.a)) - Number(isRanged(x.a)) || x.index - y.index
    )
    .map((x) => x.a);
  const best = ranked[0];
  const why: PlaybookWhy[] = [];
  if (best) {
    const source = best.source === "spell" ? spellSource([best]) : weaponSource(best);
    why.push({ key: "best-damage", params: { average: round1(value(best)) }, source });
    if (best.source === "spell") why.push({ key: "cantrip-no-cost", source });
    if (isRanged(best)) why.push({ key: "works-at-range", source });
    if (best.source === "weapon" && attacks > 1) {
      why.push({
        key: "extra-attack",
        params: { attacks },
        source: rule("extra-attack"),
      });
    }
    if (best.summary.weaponMastery) {
      why.push({
        key: "weapon-mastery",
        params: { mastery: best.summary.weaponMastery },
        source,
      });
    }
    for (const rider of best.summary.extraDamage ?? []) {
      const featureId = "srd" in rider.source ? rider.source.srd.key : undefined;
      const when = featureId ? RIDER_WHEN[featureId] : undefined;
      if (featureId && when) {
        why.push({
          key: "sneak-attack",
          params: { dice: rider.dice },
          source: { kind: "feature", id: featureId },
          when,
        });
      }
    }
  }
  return {
    rule: "default-attack",
    slot: "action",
    actions: ranked,
    when: { kind: "always" },
    why,
  };
}

// ── Status, options, triggers ─────────────────────────────────────────────────

function finishStep(draft: Draft, facts: Facts): PlaybookStep {
  const why = [...draft.why];
  const options: PlaybookOption[] = draft.actions.map((a) => toOption(a, facts));
  let status: PlaybookStep["status"] = "ready";
  if (draft.slot !== "movement" && facts.incapacitated) {
    status = "blocked";
    why.push({ key: "cannot-act", params: { condition: "incapacitated" } });
    for (const o of options) o.available = false;
  } else if (options.length > 0 && !options.some((o) => o.available)) {
    const concentrationBlocked = options.some(
      (o) => o.limits?.includes("one-concentration") && facts.concentratingOn !== ""
    );
    if (concentrationBlocked) {
      status = "blocked";
      why.push({
        key: "already-concentrating",
        params: { spell: facts.concentratingOn },
      });
    } else {
      status = "spent";
      why.push({
        key: options.some((o) => o.spend?.kind === "slot")
          ? "no-slot-left"
          : "no-uses-left",
      });
    }
  }
  return {
    id: `${draft.slot}:${draft.rule}`,
    slot: draft.slot,
    rule: draft.rule,
    options,
    when: draft.when,
    applies: triggerApplies(draft.when, facts),
    status,
    priority: RULE_PRIORITY[draft.rule] + (draft.slot === "bonus" ? BONUS_SLOT_BONUS : 0),
    why,
    origin: "generated",
  };
}

function toOption(a: RawResolvedAction, facts: Facts): PlaybookOption {
  const limits: PlaybookLimit[] = [];
  if (a.concentration) limits.push("one-concentration");
  if (a.source === "spell" && a.costsSlot) limits.push("one-slot-spell");
  let available = !(a.concentration && facts.concentratingOn !== "");
  let spend: PlaybookOption["spend"];
  if (a.costsSlot) {
    const level = a.slotLevel ?? a.spellLevel ?? 1;
    spend = { kind: "slot", level };
    available &&= hasSlot(facts.doc, level);
  } else if (a.costTracker) {
    const tracker = facts.trackers.get(a.costTracker);
    const amount = a.trackerCost ?? 1;
    spend = {
      kind: "tracker",
      trackerId: a.costTracker,
      amount,
      ...(tracker ? { recovery: tracker.recovery } : {}),
    };
    if (tracker) available &&= tracker.total - tracker.used >= amount;
  }
  return {
    actionId: a.id,
    ...(spend ? { spend } : {}),
    ...(limits.length > 0 ? { limits } : {}),
    available,
  };
}

function triggerApplies(when: PlaybookTrigger, facts: Facts): boolean | "unknown" {
  const c = facts.context;
  const known = (v: boolean | undefined): boolean | "unknown" => v ?? "unknown";
  switch (when.kind) {
    case "always":
      return true;
    case "fight-start":
      return c.round === undefined ? "unknown" : c.round === 1;
    case "self-bloodied":
      return c.selfBloodied ?? isBloodied(facts.doc);
    case "ally-down":
      return known(c.allyDown);
    case "enemies-grouped":
      return c.enemiesGrouped === undefined ? "unknown" : c.enemiesGrouped >= when.min;
    case "tough-foe":
      return known(c.toughFoe);
    case "enemy-adjacent":
      return known(c.enemyAdjacent);
    case "can-hide":
      return known(c.canHide);
    case "target-far":
      return known(c.targetFar);
    case "not-moving":
      return known(c.notMoving);
    case "advantage-or-ally-adjacent":
    case "reaction":
      return "unknown";
  }
}

// ── Small reads ───────────────────────────────────────────────────────────────

function hasSlot(doc: CharacterDoc, level: number): boolean {
  return doc.character.spellSlots.some(
    (pool) => pool.level >= level && vitalSlotUsed(doc.session, pool) < pool.total
  );
}

function byCheapest(list: ReadonlyArray<RawResolvedAction>): RawResolvedAction[] {
  return list
    .map((a, index) => ({ a, index }))
    .sort((x, y) => (x.a.spellLevel ?? 0) - (y.a.spellLevel ?? 0) || x.index - y.index)
    .map((x) => x.a);
}

function slotWhy(list: ReadonlyArray<RawResolvedAction>): PlaybookWhy[] {
  const first = list.find((a) => a.costsSlot);
  if (!first) return [];
  return [
    { key: "costs-slot", params: { level: first.slotLevel ?? first.spellLevel ?? 1 } },
  ];
}

function concentrationWhy(list: ReadonlyArray<RawResolvedAction>): PlaybookWhy[] {
  return list.some((a) => a.concentration)
    ? [{ key: "one-concentration", source: rule("concentration") }]
    : [];
}

function trackerWhy(list: ReadonlyArray<RawResolvedAction>, facts: Facts): PlaybookWhy[] {
  const first = list.find((a) => a.costTracker);
  const tracker = first?.costTracker ? facts.trackers.get(first.costTracker) : undefined;
  if (!first?.costTracker || !tracker) return [];
  const source: PlaybookSource = { kind: "feature", id: first.costTracker };
  return [
    {
      key: "limited-use",
      params: { left: Math.max(0, tracker.total - tracker.used), total: tracker.total },
      source,
    },
    { key: "recharges", params: { recovery: tracker.recovery }, source },
  ];
}

/** An activated feature whose state grants an extra action (Action Surge). */
function grantsExtraAction(a: RawResolvedAction): boolean {
  if (!a.activatesKey) return false;
  const feature = getSrdFeatureSource(featureIdOf(a));
  return (feature?.grants ?? []).some(
    (g) =>
      g.type === "while-active" &&
      g.activeKey === a.activatesKey &&
      g.grants.some((inner) => inner.type === "extra-action")
  );
}

/** The reaction trigger token the engine stamped as `combat.reactionTrigger_<token>`. */
function reactionTriggerOf(a: RawResolvedAction): string | undefined {
  const t = a.summary.trigger;
  if (!t || !("ui" in t)) return undefined;
  const prefix = "combat.reactionTrigger_";
  return t.ui.startsWith(prefix) ? t.ui.slice(prefix.length) : undefined;
}

function isRanged(a: RawResolvedAction): boolean {
  if (a.source === "spell") return a.summary.attackMode !== "melee";
  return a.summary.weaponRange?.kind === "ranged";
}

/** The average of a dice formula ("2d8", "1d8+3", "3×(1d4+1)"); 0 when absent. */
export function averageDamage(formula: string | undefined): number {
  if (!formula) return 0;
  const times = /^(\d+)\s*[×x]\s*\((.*)\)$/.exec(formula.trim());
  if (times) return Number(times[1]) * averageDamage(times[2]);
  let total = 0;
  for (const term of formula.replace(/\s+/g, "").split(/(?=[+-])/)) {
    const dice = /^([+-]?)(\d*)d(\d+)$/.exec(term);
    if (dice) {
      const sign = dice[1] === "-" ? -1 : 1;
      total += sign * Number(dice[2] || 1) * ((Number(dice[3]) + 1) / 2);
    } else if (/^[+-]?\d+$/.test(term)) {
      total += Number(term);
    }
  }
  return total;
}

function featureIdOf(a: RawResolvedAction): string {
  return a.id.replace(TRACKER_SUFFIX, "");
}

const round1 = (n: number): number => Math.round(n * 10) / 10;
const rule = (id: string): PlaybookSource => ({ kind: "rule", id });
const featureSource = (a: RawResolvedAction): PlaybookSource => ({
  kind: "feature",
  id: featureIdOf(a),
});
const weaponSource = (a: RawResolvedAction): PlaybookSource => ({
  kind: "weapon",
  id: a.weaponId ?? a.id,
});
const spellSource = (
  list: ReadonlyArray<RawResolvedAction>
): PlaybookSource | undefined =>
  list[0]?.spellId ? { kind: "spell", id: list[0].spellId } : undefined;
