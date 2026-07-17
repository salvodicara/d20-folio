/**
 * Combat-log events — the events-as-data contract (mirrors toasts-as-data §3.2).
 *
 * The action/combat log is a play NARRATIVE: it records the deterministic session
 * events (HP changes, conditions, concentration, rests, death saves, turn advance,
 * action/reaction commits), not just "used X". The store / engine NEVER stores a
 * pre-localized line — that was the mixed-language bug (a stored EN/IT string is
 * frozen in whatever language it was written in, so the same log read half in each
 * language). Instead it stores a STRUCTURED {@link CombatEvent}: a `kind`
 * discriminant plus raw args (numbers + STABLE ids / stored labels, never a
 * translatable display string). The presenter `lib/views/combat-log-view.ts`
 * localizes each event to its display line at render, so the SAME stored log
 * renders fully in the active language and a language switch re-localizes the
 * whole feed.
 *
 * Living in `types/` keeps the store (engine-core) free of any `lib/views`
 * dependency while the presenter that consumes this type lives in the views layer
 * (exactly the {@link import("./toast").ToastIntent} arrangement).
 *
 * NO event carries a frozen single-language display string (golden rule 7 — the
 * code speaks only ids / localizable references). An action AND a rider are each a
 * {@link LocText} (the engine's localizable reference — an `srd` catalogue id-ref, a
 * `custom` user string, or a `lit` bilingual engine constant), concentration a
 * {@link ConcentrationRef} (id / `custom:`), conditions/sources by id. The presenter
 * resolves every one at render, so the SAME stored event re-localizes on a language
 * switch. The only verbatim strings are genuinely user-authored (a `custom`
 * {@link LocText} — a homebrew name with no SRD id).
 */

import type { ActionType } from "@/data/types";
import type { ConcentrationRef } from "@/types/ids";
import type { LocText } from "@/lib/loc-text";

/**
 * The economy slot a committed action consumed — drives the log row's COLOUR
 * (`action`=green, `bonus`=blue, `reaction`=red, `free`=grey), the same family the
 * cockpit cards paint with. A subset of {@link ActionType}.
 */
export type LogSlot = ActionType;

/**
 * One structured combat-log event. Each variant carries ONLY ids/tokens + numbers
 * (and the documented free-text action/spell labels) — never a pre-localized
 * sentence. The presenter maps each `kind` to its i18n template + glyph + hue.
 */
export type CombatEvent =
  /** An action was committed into an economy slot (the play-time "used X"). */
  | {
      kind: "action-use";
      /** The action's NAME as the engine's localizable {@link LocText} reference
       *  (`srd` catalogue id-ref / `custom` user string / `lit` constant — golden
       *  rule 7; localized at render, re-localizes on a language switch). */
      action: LocText;
      /** Semantic effect kind → the row GLYPH (heal/damage/spell-cast/attack/…). */
      effect: ActionEffect;
      /** Economy slot consumed → the row COLOUR. */
      slot: LogSlot;
      /**
       * ATTACK-PIPS — the swing count within an Attack action ("attack 2 of 2"),
       * present only on a weapon/War-Magic swing of an Extra-Attack character
       * (`total > 1`); absent for every ordinary single-attack commit.
       */
      attackOf?: { n: number; total: number };
    }
  /** A reaction was used (always the reaction slot → red). */
  | {
      kind: "reaction-use";
      action: LocText;
      effect: ActionEffect;
    }
  /**
   * An on-hit RIDER was spent on an attack (Psi Warrior Psionic Strike → a
   * Psionic Energy Die; Lifedrinker → a Hit Point Die). Carries the rider's
   * provenance (`riderName`) + the attack it rode (`actionName`, both stored
   * user-facing labels — see the module note) so the play narrative reads "Spent
   * Psionic Strike on Longsword". The GLYPH follows the rider's semantic effect
   * (extra damage → red Sword, on-hit heal → green Heart); no economy slot (a
   * rider rides an attack already committed), so the row hue is its semantic hue.
   */
  | {
      kind: "rider-use";
      /** The attack the rider rode, as the engine's localizable {@link LocText}
       *  reference (re-localizes at render — golden rule 7). */
      action: LocText;
      /** The rider's provenance as the engine's localizable {@link LocText} reference
       *  (`srd` catalogue id / `custom` user string / `lit` constant) — re-localizes. */
      rider: LocText;
      effect: ActionEffect;
    }
  /** The character took damage (HP reduced). `amount` is the total incoming hit. */
  | { kind: "hp-damage"; amount: number; current: number; max: number }
  /** The character regained HP (a heal — NOT a rest, which has its own kind). */
  | { kind: "hp-heal"; amount: number; current: number; max: number }
  /** Temporary HP were gained (pool set to `amount`; temp HP don't stack). */
  | { kind: "temp-hp-gain"; amount: number }
  /** A condition was gained. */
  | { kind: "condition-gain"; conditionId: string }
  /** A condition was lost / removed. */
  | { kind: "condition-loss"; conditionId: string }
  /**
   * Concentration started — `spell` is the concentration VALUE (a stable srdId, or a
   * `custom:`-marked name), localized at render by `concentrationLabel`. The branded
   * `ConcentrationRef` makes a bare display name a compile error (golden rule 7).
   */
  | { kind: "concentration-start"; spell: ConcentrationRef }
  /** Concentration ended — `spell` as in `concentration-start` (id / `custom:` name). */
  | { kind: "concentration-end"; spell: ConcentrationRef }
  /** A death-saving-throw mark changed. */
  | {
      kind: "death-save";
      outcome: "success" | "failure";
      successes: number;
      failures: number;
    }
  /** A rest was taken. */
  | { kind: "rest"; restKind: "short" | "long" }
  /** A turn ended → a new round started (`round` = the new round number). */
  | { kind: "turn-end"; round: number }
  /**
   * FRONTIER-S3 — a timed `while-active` state's round countdown reached 0 and
   * AUTO-EXPIRED at End Turn (Rage after 100 rounds). `sourceId` is the granting
   * feature id; the presenter localizes its name (provenance), so the narrative
   * reads "Rage ended (duration elapsed)".
   */
  | { kind: "effect-expired"; sourceId: string }
  /**
   * Read-normalization ONLY (the bounded one-way boundary, golden rule 10): a
   * pre-events-as-data persisted entry that carried a frozen localized `text`.
   * Rendered verbatim so an existing user's history stays visible; the engine
   * NEVER emits this kind — every new event is structured. Carries the legacy
   * `type`/`slot` so its glyph/hue still resolve.
   */
  | { kind: "legacy"; text: string; legacyType?: string; slot?: LogSlot };

/** Every `CombatEvent.kind` discriminant (for the presenter's exhaustiveness). */
export type CombatEventKind = CombatEvent["kind"];

/**
 * The semantic EFFECT of a committed action — the GLYPH axis of an `action-use` /
 * `reaction-use` row (heal = green Heart, damage = red Sword, spell = Sparkles,
 * attack = Sword, feature = Diamond, generic = Dot). Computed by
 * `combat-action-view.logTypeForAction` at commit time.
 */
export type ActionEffect =
  | "heal"
  | "damage"
  | "spell-cast"
  | "attack"
  | "tracker-use"
  | "generic";
