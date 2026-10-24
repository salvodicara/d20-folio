/**
 * Combat-log presenter — the events-as-data localization seam (mirrors
 * `toast-intent.ts`, ARCHITECTURE §"Toasts-as-data").
 *
 * The store/engine emits structured {@link CombatEvent}s (ids + numbers, no
 * localization); this presenter resolves a log row's full display at render: the
 * i18n line via `kind`→template, and the row's GLYPH + HUE via
 * {@link resolveLogStyle} (the glyph follows the event's semantic effect, the hue
 * follows the economy slot). The SAME stored event therefore renders fully in the
 * active language and a language switch re-localizes the whole feed — the mixed-
 * language bug's root-cause fix.
 *
 * PURE presentation glue: the `t` function + a condition-name resolver are passed
 * in, so this module imports no React, no store, no i18next. `lib/views/` is the
 * ONLY engine-side layer permitted to localize — and even here `t`/`localizeSrd`
 * are injected, never imported.
 */

import type { ActionEffect, CombatEvent } from "@/types/combat-log";
import type { LocText } from "@/lib/loc-text";
import { resolveLogStyle, type LogStyle } from "@/lib/action-log-style";
import { SOURCE_LOCALE, type Locale } from "@/lib/locale";
import { riderEffectClause } from "@/lib/views/effect-rider-view";

/**
 * The minimal `t` shape this presenter needs — the i18next translator. Kept as a
 * structural type so the module does not import `react-i18next` (engine-side
 * layers stay framework-free; the hook injects the real `t`).
 */
export type TranslateFn = (key: string, args?: Record<string, string | number>) => string;

/**
 * Resolve a stable condition id to its localized display name. Injected by the UI
 * so this module never imports the SRD-name resolver or a store.
 */
export type ResolveConditionName = (conditionId: string) => string;

/**
 * Resolve a stable feature/source id to its localized display name — used for the
 * `effect-expired` row ("Rage ended (duration elapsed)"). Injected by the UI so
 * this module never imports the SRD-name resolver.
 */
export type ResolveSourceName = (sourceId: string) => string;

/**
 * Resolve a stored concentration value (a spell's stable srdId — or a custom
 * spell's name) to its localized display name — the `concentration-start` /
 * `concentration-end` rows. Concentration is stored as an id (golden rule 7),
 * so the `spell` field is an id; injected by the UI (the `concentrationLabel`
 * presenter) so this module never imports the SRD resolver.
 */
export type ResolveSpellName = (value: string) => string;

/**
 * Resolve a logged action's {@link LocText} reference to its localized name — the
 * `action-use` / `reaction-use` / `rider-use` rows. Injected by the UI (`localizeText`),
 * which resolves any variant (`srd` catalogue id-ref / `custom` user string / `lit`
 * constant), so this module never reads the active locale or the SRD resolver. Same
 * shape as {@link ResolveRiderRef} — both an action and a rider are a `LocText`.
 */
export type ResolveActionRef = (ref: LocText) => string;

/**
 * Resolve a logged rider's {@link LocText} provenance reference to its localized name
 * (the `rider-use` row). Injected by the UI (`localizeText`), so this module never reads
 * the active locale or the SRD resolver.
 */
export type ResolveRiderRef = (ref: LocText) => string;

/** A fully render-ready log row: its localized line + its glyph/hue style. */
export interface CombatLogRow {
  /** Localized display line for the event. */
  text: string;
  /** Glyph + colour style (same resolver the rows have always used). */
  style: LogStyle;
}

/**
 * The semantic effect of an action/reaction commit → the `LogType` that drives the
 * row glyph (the colour comes from the slot). `ActionEffect` is a strict subset of
 * the style resolver's `LogType`, so the glyph the player saw at commit time is the
 * glyph the log shows.
 */
const effectGlyphType = (effect: ActionEffect): string => effect;

/**
 * Map a `CombatEvent` to its full row STYLE (glyph + hue). The GLYPH follows the
 * event's semantics; the slot (when present) sets the row colour. Non-action events
 * carry no slot and fall back to their semantic hue.
 */
export function eventLogStyle(event: CombatEvent): LogStyle {
  switch (event.kind) {
    case "action-use":
      return resolveLogStyle(effectGlyphType(event.effect), event.slot);
    case "reaction-use":
      return resolveLogStyle(effectGlyphType(event.effect), "reaction");
    case "rider-use":
      // A rider rides an already-committed attack — no slot of its own; the row
      // takes its semantic hue (extra damage → red, on-hit heal → green).
      return resolveLogStyle(effectGlyphType(event.effect));
    case "hp-damage":
      return resolveLogStyle("damage");
    case "hp-heal":
      return resolveLogStyle("heal");
    case "temp-hp-gain":
      return resolveLogStyle("heal");
    case "hp-max-reduction":
      return resolveLogStyle(event.reduction > 0 ? "damage" : "heal");
    case "condition-gain":
      return resolveLogStyle("condition-add");
    case "rider-taken":
      return resolveLogStyle(
        event.rider.kind === "hp-max-reduction" ? "damage" : "condition-add"
      );
    case "condition-loss":
      return resolveLogStyle("condition-remove");
    case "concentration-start":
    case "concentration-end":
      return resolveLogStyle("spell-cast");
    case "death-save":
      return resolveLogStyle("death-save");
    case "rest":
    case "time-passes":
      return resolveLogStyle("rest");
    case "turn-end":
      return resolveLogStyle("turn-end");
    case "fading-penalty":
      return resolveLogStyle(event.amount > 0 ? "condition-add" : "condition-remove");
    case "effect-expired":
      return resolveLogStyle("effect-expired");
    case "tracker-regain":
      return resolveLogStyle("tracker-use");
    case "slot-regain":
      return resolveLogStyle("spell-cast");
    case "effect-given":
      return resolveLogStyle(
        event.effect === "damage"
          ? "damage"
          : event.effect === "condition"
            ? "condition-add"
            : "heal"
      );
    case "legacy":
      // A pre-events entry keeps the glyph/hue it was stored with.
      return resolveLogStyle(event.legacyType ?? "generic", event.slot);
  }
}

/** The attack results a line can say; another stored value is left out. */
const ATTACK_RESULTS = new Set(["hit", "miss", "critical"]);

/** A rider from the `weapon-mastery` catalogue (Topple, Vex, …): no resource. */
function isMasteryRef(rider: LocText): boolean {
  return "srd" in rider && rider.srd.kind === "weapon-mastery";
}

/**
 * Localize a `CombatEvent` to its display LINE. Pure: `t` + the condition-name
 * resolver are injected, so this is unit-testable with trivial fakes and carries
 * no framework import. Exhaustive over every `kind` (a new kind is a compile error
 * via the `never` default).
 */
export function localizeCombatEvent(
  event: CombatEvent,
  t: TranslateFn,
  resolveConditionName: ResolveConditionName,
  resolveSourceName: ResolveSourceName,
  resolveSpellName: ResolveSpellName,
  resolveActionRef: ResolveActionRef,
  resolveRiderRef: ResolveRiderRef,
  /** The reader's language: a rider's distance reads in its units (IT: metres). */
  locale: Locale = SOURCE_LOCALE
): string {
  // The attack's declared result, appended to its line ("Used Longsword — critical").
  const withOutcome = (line: string, outcome: string | undefined): string =>
    outcome && ATTACK_RESULTS.has(outcome)
      ? t("combatLog.withOutcome", {
          line,
          outcome: t(`sessionReport.outcome.${outcome}`),
        })
      : line;
  // The check entered with the use ("Used Search: Perception 17 vs DC 15, success").
  const withCheck = (
    line: string,
    check: { skill: string; total: number; dc?: number } | undefined
  ): string => {
    if (!check) return line;
    const skill = t(`skills.${check.skill}`);
    if (check.dc === undefined)
      return t("combatLog.withCheck", { line, skill, total: check.total });
    return t("combatLog.withCheckDc", {
      line,
      skill,
      total: check.total,
      dc: check.dc,
      verdict: t(
        check.total >= check.dc ? "combatLog.checkSuccess" : "combatLog.checkFailure"
      ),
    });
  };
  switch (event.kind) {
    case "action-use":
      // ATTACK-PIPS — an Extra-Attack swing appends its count ("… — attack 2 of 2").
      return withCheck(
        withOutcome(
          event.attackOf
            ? t("combatLog.actionUseAttackOf", {
                name: resolveActionRef(event.action),
                n: event.attackOf.n,
                total: event.attackOf.total,
              })
            : t(event.readied ? "combatLog.readiedSpell" : "combatLog.actionUse", {
                name: resolveActionRef(event.action),
              }),
          event.outcome
        ),
        event.check
      );
    case "reaction-use":
      return withOutcome(
        t(event.released ? "combatLog.releasedSpell" : "combatLog.actionUse", {
          name: resolveActionRef(event.action),
        }),
        event.outcome
      );
    case "rider-use":
      // A weapon mastery is declared, not spent ("Topple (Quarterstaff)"); a real
      // resource keeps the "spent" line ("Spent Sneak Attack on Goblin").
      return t(
        isMasteryRef(event.rider) ? "combatLog.masteryUse" : "combatLog.riderUse",
        {
          rider: resolveRiderRef(event.rider),
          name: resolveActionRef(event.action),
        }
      );
    case "hp-damage":
      return t("combatLog.hpDamage", {
        amount: event.amount,
        current: event.current,
        max: event.max,
      });
    case "hp-heal":
      return t("combatLog.hpHeal", {
        amount: event.amount,
        current: event.current,
        max: event.max,
      });
    case "temp-hp-gain":
      return t("combatLog.tempHpGain", { amount: event.amount });
    case "hp-max-reduction":
      return event.reduction > 0
        ? t("combatLog.hpMaxReduced", { reduction: event.reduction, max: event.max })
        : t("combatLog.hpMaxRestored", { max: event.max });
    case "condition-gain":
      return t("combatLog.conditionGain", {
        condition: resolveConditionName(event.conditionId),
      });
    case "rider-taken": {
      const effect = riderEffectClause(event.rider, t, locale);
      return event.source
        ? t("combatLog.riderTakenFrom", {
            effect,
            source: resolveActionRef(event.source),
          })
        : effect;
    }
    case "condition-loss":
      return t("combatLog.conditionLoss", {
        condition: resolveConditionName(event.conditionId),
      });
    case "concentration-start":
      return t("combatLog.concentrationStart", { spell: resolveSpellName(event.spell) });
    case "concentration-end":
      // Reuse the "stopped concentrating" toast key — same semantic unit (golden
      // rule 6), so the wording stays consistent between the toast and the log.
      return t("combat.stoppedConcentratingToast", {
        spell: resolveSpellName(event.spell),
      });
    case "death-save":
      return t(
        event.outcome === "success"
          ? "combatLog.deathSaveSuccess"
          : "combatLog.deathSaveFailure",
        { successes: event.successes, failures: event.failures }
      );
    case "rest":
      return t(event.restKind === "long" ? "combatLog.longRest" : "combatLog.shortRest");
    case "time-passes":
      return t("combatLog.timePasses", { count: event.minutes });
    case "turn-end":
      if (event.extraTurn) {
        // An extra turn in the same round — the extra-turn control's own key.
        return t("combat.extraTurnToast", {
          source: resolveSourceName(event.extraTurn.source),
          n: event.extraTurn.n,
          of: event.extraTurn.of,
          round: event.round,
        });
      }
      // Reuse the End-Turn toast's key — one semantic unit (a round advance) =
      // one i18n key (golden rule 6), so a wording fix propagates to both.
      return t("combat.endTurnToast", { round: event.round });
    case "fading-penalty":
      return event.amount > 0
        ? t("combatLog.fadingPenaltyStart", {
            name: resolveSpellName(event.penaltyId),
            amount: event.amount,
          })
        : t("combatLog.fadingPenaltyEnd", { name: resolveSpellName(event.penaltyId) });
    case "effect-expired":
      return t("combatLog.effectExpired", { name: resolveSourceName(event.sourceId) });
    case "tracker-regain":
      return t("combatLog.trackerRegain", {
        name: resolveSourceName(event.trackerId),
        amount: event.amount,
      });
    case "slot-regain":
      return t("combatLog.slotRegain", { level: event.level });
    case "effect-given":
      return event.effect === "condition"
        ? t("combatLog.givenCondition", {
            target: event.targetName,
            condition: resolveConditionName(event.conditionId ?? ""),
          })
        : event.effect === "damage" && event.outcome && ATTACK_RESULTS.has(event.outcome)
          ? t("combatLog.givenAttackDamage", {
              target: event.targetName,
              outcome: t(`sessionReport.outcome.${event.outcome}`),
              amount: event.amount ?? 0,
            })
          : t(
              event.effect === "heal"
                ? "combatLog.givenHeal"
                : event.effect === "damage"
                  ? "combatLog.givenDamage"
                  : "combatLog.givenTempHp",
              { target: event.targetName, amount: event.amount ?? 0 }
            );
    case "legacy":
      return event.text;
  }
}

/**
 * Resolve a full render-ready row (line + style) for a `CombatEvent`. The ONE
 * helper the log UI calls per entry.
 */
export function localizeCombatLogRow(
  event: CombatEvent,
  t: TranslateFn,
  resolveConditionName: ResolveConditionName,
  resolveSourceName: ResolveSourceName,
  resolveSpellName: ResolveSpellName,
  resolveActionRef: ResolveActionRef,
  resolveRiderRef: ResolveRiderRef,
  locale: Locale = SOURCE_LOCALE
): CombatLogRow {
  // Widened on purpose: the log travels through the character doc, so an entry a
  // NEWER app version appended can reach this one with a kind it has never seen.
  // Both switches then fall through to `undefined`; the row degrades to a neutral
  // line instead of throwing and taking the sheet down with it.
  const text = localizeCombatEvent(
    event,
    t,
    resolveConditionName,
    resolveSourceName,
    resolveSpellName,
    resolveActionRef,
    resolveRiderRef,
    locale
  ) as string | undefined;
  const style = eventLogStyle(event) as LogStyle | undefined;
  if (text === undefined || style === undefined) {
    return {
      text: t("combatLog.unknownEvent"),
      style: eventLogStyle({ kind: "legacy", text: "" }),
    };
  }
  return { text, style };
}
