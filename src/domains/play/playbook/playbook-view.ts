/**
 * The playbook as the Play screen reads it (board 01, "What you'd best do"): each
 * step is ONE line, an economy shape plus a short sentence with the action's name in
 * bold and its target or condition ("**Sacred Flame** on the nearest enemy."), then a
 * smaller "why" sentence with concrete numbers ("On average 9 damage, against 6.5 with
 * Mace, and it reaches 60 feet."). `plan` is the concrete turn (2–4 lines); `steps`
 * is every line, for the expanded block.
 *
 * Pure over the playbook ({@link buildCombatPlaybook}); the only additions are the
 * display numbers the engine leaves to the view: the runner-up option's average, a
 * reach, the walking speed, the heal a Short Rest would give.
 */
import type { Locale } from "@/lib/locale";
import { resolveActions, type RawResolvedAction } from "@/lib/smart-tracker";
import { localizeAction } from "@/lib/views/combat-action-view";
import { localizeText } from "@/lib/views/srd-i18n";
import { localizeSrd } from "@/i18n/resolver";
import { uiText } from "@/lib/loc-text";
import { localeDistance } from "@/lib/utils";
import { restPreview } from "@/lib/play/rest-preview";
import { hitDicePool } from "@/lib/play/hit-dice";
import { sheetNumbers } from "@/lib/views/sheet-numbers";
import { effectiveMaxHp } from "@/lib/aggregate-character";
import type { CharacterDoc } from "@/types/character";
import { averageDamage, buildCombatPlaybook } from "./build-combat-playbook";
import type {
  PlaybookContext,
  PlaybookOverrides,
  PlaybookSlot,
  PlaybookStatus,
  PlaybookStep,
  PlaybookWhy,
} from "./types";

export interface PlaybookLine {
  stepId: string;
  /** The economy shape the line starts with (movement, action, bonus, …). */
  shape: PlaybookSlot;
  status: PlaybookStatus;
  /** The sentence, split around the part shown in bold (the action's name). */
  before: string;
  strong: string;
  after: string;
  /** One sentence with numbers; null when the line explains itself. */
  why: string | null;
}

export interface PlaybookView {
  mode: "combat" | "exploration";
  /** The concrete turn: the plan's picks, in slot order. */
  plan: PlaybookLine[];
  /** Every step, for the expanded block. */
  steps: PlaybookLine[];
}

const t = (key: string, locale: Locale, params?: Record<string, string | number>) =>
  localizeText(uiText(`playbook.${key}`, params), locale);

/** "**X** rest." → before / strong / after. */
function split(sentence: string): Pick<PlaybookLine, "before" | "strong" | "after"> {
  const match = /^(.*?)\*\*(.+?)\*\*(.*)$/s.exec(sentence);
  return match
    ? { before: match[1] ?? "", strong: match[2] ?? "", after: match[3] ?? "" }
    : { before: sentence, strong: "", after: "" };
}

function number(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
}

/** What a reason costs or needs reads as its own clause, after ";" (board 01). */
const COST_KEYS = new Set([
  "costs-slot",
  "one-concentration",
  "limited-use",
  "recharges",
  "uses-item",
  "no-uses-left",
  "no-slot-left",
]);

function sentence(
  clauses: ReadonlyArray<{ text: string; key: string }>,
  locale: Locale
): string | null {
  const [first, second] = clauses;
  if (!first) return null;
  const joiner = !second
    ? ""
    : COST_KEYS.has(second.key)
      ? "; "
      : locale === "it"
        ? " e "
        : " and ";
  const joined = `${first.text}${joiner}${second?.text ?? ""}`;
  return `${joined.charAt(0).toUpperCase()}${joined.slice(1)}.`;
}

interface Facts {
  doc: CharacterDoc;
  locale: Locale;
  actions: ReadonlyMap<string, RawResolvedAction>;
}

function actionName(facts: Facts, id: string | undefined): string {
  const action = id ? facts.actions.get(id) : undefined;
  return action ? localizeAction(action, facts.locale).name : "";
}

/** A reach worth saying: a ranged weapon's normal range, or a spell's printed range. */
function reach(facts: Facts, id: string): string | null {
  const action = facts.actions.get(id);
  if (!action) return null;
  const range = action.summary.weaponRange;
  if (range?.kind === "ranged") return localeDistance(range.nearFt, facts.locale);
  if (action.source !== "spell") return null;
  // The short form the action table uses ("18 m"), from the printed feet.
  const feet = /(\d+)\s*(feet|foot|ft)/i.exec(
    localizeAction(action, "en").summary.range ?? ""
  );
  return feet ? localeDistance(Number(feet[1]), facts.locale) : null;
}

function averageOf(facts: Facts, id: string | undefined, perAction: number): number {
  const action = id ? facts.actions.get(id) : undefined;
  if (!action) return 0;
  return (
    averageDamage(action.summary.damage) *
    (action.source === "weapon" ? perAction : (action.summary.instances ?? 1))
  );
}

/** One "why" reason as a clause, or null when the line says it already. */
function clause(why: PlaybookWhy, step: PlaybookStep, facts: Facts): string | null {
  const { locale } = facts;
  const p = why.params ?? {};
  const first = step.options[0]?.actionId;
  switch (why.key) {
    case "best-damage": {
      const average = Number(p.average ?? 0);
      const runnerUp = step.options[1]?.actionId;
      // The engine's average already counts Extra Attack for a weapon.
      const perAction = first ? average / Math.max(averageOf(facts, first, 1), 1e-9) : 1;
      const other = runnerUp ? averageOf(facts, runnerUp, Math.round(perAction) || 1) : 0;
      return runnerUp && other > 0
        ? t("why.bestDamageVs", locale, {
            average: number(average, locale),
            otherAverage: number(other, locale),
            other: actionName(facts, runnerUp),
          })
        : t("why.bestDamage", locale, { average: number(average, locale) });
    }
    case "works-at-range": {
      const distance = first ? reach(facts, first) : null;
      return distance
        ? t("why.reaches", locale, { range: distance })
        : t("why.worksAtRange", locale);
    }
    case "cantrip-no-cost":
      return t("why.cantripNoCost", locale);
    case "extra-attack":
      return t("why.extraAttack", locale, { attacks: Number(p.attacks ?? 2) });
    case "weapon-mastery":
      return t("why.weaponMastery", locale, {
        mastery: localizeSrd("weapon-mastery", String(p.mastery ?? ""), "name", locale),
      });
    case "sneak-attack":
      return t("why.sneakAttack", locale, { dice: String(p.dice ?? "") });
    case "area-hits-many":
      return t("why.areaHitsMany", locale);
    case "extra-action":
      return t("why.extraAction", locale);
    case "limited-use":
      return t("why.limitedUse", locale, {
        count: Number(p.left ?? 0),
        total: Number(p.total ?? 0),
      });
    case "recharges": {
      const recovery = String(p.recovery ?? "");
      const known = ["short-rest", "long-rest", "short-or-long-rest", "dawn"];
      return t(`why.recharges.${known.includes(recovery) ? recovery : "other"}`, locale);
    }
    case "costs-slot":
      return t("why.costsSlot", locale, { level: Number(p.level ?? 1) });
    case "revives-ally":
      return t("why.revivesAlly", locale);
    case "self-heal": {
      const bonus = Number(p.bonus ?? 0);
      const dice = String(p.dice ?? "");
      return t("why.selfHeal", locale, { amount: bonus ? `${dice}+${bonus}` : dice });
    }
    case "keeps-action-free":
      return t("why.keepsActionFree", locale);
    case "one-concentration":
      return t("why.oneConcentration", locale);
    case "controls-foe":
      return t("why.controlsFoe", locale);
    case "advantage-next-attack":
      return t("why.advantageNextAttack", locale);
    case "bonus-mobility":
      return t("why.bonusMobility", locale);
    case "reaction-defense":
      return t("why.reactionDefense", locale);
    case "opportunity-attack":
      return t("why.opportunityAttack", locale);
    case "already-concentrating":
      return t("why.alreadyConcentrating", locale);
    case "no-uses-left":
      return t("why.noUsesLeft", locale);
    case "no-slot-left":
      return t("why.noSlotLeft", locale);
    case "cannot-act":
      return t("why.cannotAct", locale);
    case "player-pinned":
      return t("why.playerPinned", locale);
    case "ritual-no-slot":
      return t("why.ritualNoSlot", locale, { minutes: Number(p.minutes ?? 10) });
    case "exploration-check":
      return t("why.explorationCheck", locale);
    case "cheapest-first":
      return t("why.cheapestFirst", locale);
    case "uses-item":
      return t("why.usesItem", locale);
    case "recovers-on-short-rest":
      return t("why.recoversOnShortRest", locale, {
        count: Number(p.used ?? 0),
        total: Number(p.total ?? 0),
      });
    case "hit-dice-heal":
      return t("why.hitDiceHeal", locale, {
        count: Number(p.left ?? 0),
        total: Number(p.total ?? 0),
      });
    // The movement line says it itself; "heals at range" is not emitted today.
    case "move-to-melee":
    case "keep-range":
    case "heals-ally-at-range":
      return null;
  }
}

/** The reasons, blocking ones first when the step can't be done now. */
const BLOCKING = new Set([
  "already-concentrating",
  "no-uses-left",
  "no-slot-left",
  "cannot-act",
]);

function whySentence(step: PlaybookStep, facts: Facts): string | null {
  const ordered =
    step.status === "ready"
      ? step.why.filter((why) => !BLOCKING.has(why.key))
      : [...step.why.filter((why) => BLOCKING.has(why.key))];
  // The reach is the attack's second argument (board 01: "…, and it reaches 60 feet").
  const ranked = [...ordered].sort(
    (a, b) => Number(b.key === "works-at-range") - Number(a.key === "works-at-range")
  );
  const best = ranked.findIndex((why) => why.key === "best-damage");
  if (best > 0) ranked.unshift(...ranked.splice(best, 1));
  const seen = new Set<string>();
  const clauses = ranked.flatMap((why) => {
    const text = clause(why, step, facts);
    if (!text || seen.has(text)) return [];
    seen.add(text);
    return [{ text, key: why.key }];
  });
  return sentence(clauses, facts.locale);
}

const RULE_LINE: Partial<Record<PlaybookStep["rule"], string>> = {
  "heal-ally-down": "healAllyDown",
  "self-heal-bloodied": "selfHealBloodied",
  "area-when-grouped": "areaWhenGrouped",
  "burst-tough-foe": "burstToughFoe",
  "control-tough-foe": "controlToughFoe",
  "concentration-opener": "concentrationOpener",
  "default-attack": "defaultAttack",
  "set-up-advantage": "setUpAdvantage",
  "disengage-when-adjacent": "disengageWhenAdjacent",
  "hide-when-possible": "hideWhenPossible",
  "dash-when-far": "dashWhenFar",
  "opportunity-attack": "opportunityAttack",
  "recover-hp": "recoverHp",
  "ritual-no-slot": "ritualNoSlot",
  "utility-cantrip": "utilityCantrip",
};

function lineSentence(
  step: PlaybookStep,
  actionId: string | undefined,
  facts: Facts
): string {
  const { locale, doc } = facts;
  const action = actionName(facts, actionId);
  switch (step.rule) {
    case "position": {
      const speed = localeDistance(sheetNumbers(doc).speed.total, locale);
      const ranged = step.why.some((why) => why.key === "keep-range");
      return t(ranged ? "line.positionRange" : "line.position", locale, { speed });
    }
    case "reaction-defense": {
      const on = step.when.kind === "reaction" ? step.when.on : "";
      const known = ["hitByAttack", "hitOrMagicMissileTarget", "takeDamage"];
      return t(`line.reactionDefense.${known.includes(on) ? on : "other"}`, locale, {
        action,
      });
    }
    case "exploration-check": {
      const check = String(step.why[0]?.params?.check ?? "search");
      return t(`line.check.${check}`, locale, { action });
    }
    case "short-rest-recovery": {
      const current = doc.session.hp.current;
      const max = effectiveMaxHp(doc.character, doc.session);
      if (current >= max) return t("line.shortRest.uses", locale);
      const preview = restPreview(doc, "short");
      const counts = new Map(hitDicePool(doc.character).map((e) => [e.die, e.count]));
      // Spend the biggest dice first, as many as are left.
      let left = preview.hitDice.available;
      let heal = 0;
      for (const { die, average } of [...preview.perDieHeal].sort(
        (a, b) => b.die - a.die
      )) {
        const spend = Math.min(left, counts.get(die) ?? 0);
        heal += spend * average;
        left -= spend;
      }
      return heal >= max - current
        ? t("line.shortRest.toFull", locale, { current, max })
        : t("line.shortRest.some", locale, { current, max, heal });
    }
    case "area-when-grouped": {
      const min = Number(
        step.why.find((why) => why.key === "area-hits-many")?.params?.min ?? 3
      );
      return t("line.areaWhenGrouped", locale, { action, min });
    }
    default:
      return t(`line.${RULE_LINE[step.rule] ?? "utilityCantrip"}`, locale, { action });
  }
}

export function playbookView(
  doc: CharacterDoc,
  locale: Locale,
  context: PlaybookContext = {},
  overrides: PlaybookOverrides = {}
): PlaybookView {
  const playbook = buildCombatPlaybook(doc, context, overrides);
  const facts: Facts = {
    doc,
    locale,
    actions: new Map(resolveActions(doc).map((action) => [action.id, action])),
  };
  const picked = new Map(playbook.plan.picks.map((pick) => [pick.stepId, pick.actionId]));
  const line = (step: PlaybookStep): PlaybookLine => {
    const actionId =
      picked.get(step.id) ??
      step.options.find((option) => option.available)?.actionId ??
      step.options[0]?.actionId;
    return {
      stepId: step.id,
      shape: step.slot,
      status: step.status,
      ...split(lineSentence(step, actionId, facts)),
      why: step.rule === "position" ? null : whySentence(step, facts),
    };
  };
  const byId = new Map(playbook.steps.map((step) => [step.id, step]));
  return {
    mode: playbook.mode,
    plan: playbook.plan.picks.flatMap((pick) => {
      const step = byId.get(pick.stepId);
      return step ? [line(step)] : [];
    }),
    steps: playbook.steps.map(line),
  };
}
