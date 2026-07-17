/**
 * Rider presenter (`lib/views`) — the ONE recipe that turns an action's
 * engine-computed on-hit RIDERS into the render-ready tokens BOTH weapon
 * surfaces (the combat attack/action card and the inventory weapon card) show.
 *
 * The engine (`smart-tracker.resolveActions`) computes three kinds of rider on a
 * weapon/feature attack and emits them locale-FREE on the {@link RawActionSummary}:
 *  - `extraDamage[]` — self-contained extra damage on a hit (Berserker Frenzy
 *    +2d6, Psi Warrior Psionic Strike +1d8+INT Force, Lifedrinker +1d6 Necrotic);
 *  - `dieModifiers[]` — manipulations of the weapon's OWN dice when rolled (Great
 *    Weapon Fighting floor, Savage Attacker reroll-keep-higher);
 *  - `onHitHeal`     — an on-hit self-heal paid by expending a Hit Point Die
 *    (Lifedrinker).
 * Each carries a `source` NAME ref ({@link LocText}); this presenter resolves it
 * to the rider's PROVENANCE string and classifies the rider as CONSUMABLE (it has
 * a backing resource the combat UI debits — a tracker or a Hit Die) or
 * DISPLAY-ONLY (always-on while a state is up, or a pure roll annotation).
 *
 * The token's at-a-glance text keeps every KNOWN quantity evaluated (#80
 * chip-compact): "+1d8+3 Force", "+2d6", "heal 1d8 + 3, min 1", "reroll low dice".
 * The damage-type WORD and the provenance both ride the token; the longer
 * provenance/breakdown lives in the tooltip (progressive disclosure) — the
 * component composes the damage-type word from `damageTypeId` (a `t("srd.damage_*")`
 * lookup at the render edge), so the damage type stays a STABLE id here.
 *
 * Pure + framework-free: no React, no i18next — `source` resolves through the
 * injected-locale `localizeText` (the pure-modules contract; `lib/views/` is the
 * only engine-side layer permitted to localize).
 */

import type { Locale } from "@/lib/locale";
import type { RawActionSummary } from "@/lib/smart-tracker";
import type { LocText } from "@/lib/loc-text";
import { localizeText } from "@/lib/views/srd-i18n";

/** The kind of rider — drives the token's icon/colour register + composition. */
export type RiderKind = "damage" | "die-mod" | "heal";

/** A die-modifier rider's annotation mode (the player applies it when rolling). */
export type RiderDieMode = "floor" | "reroll-keep-higher";

/**
 * One render-ready rider token. Locale-resolved EXCEPT `damageTypeId` (a stable
 * id the component turns into the localized damage word at the edge). The shared
 * `ActionRiders` component renders each token; consumable tokens become tappable
 * on the combat surface (the debit), display-only tokens render static.
 */
export interface RiderVM {
  /** Stable token id — `${kind}:${source-or-index}` (React key + debit target). */
  id: string;
  kind: RiderKind;
  /** The rider's localized provenance ("Frenzy", "Psionic Strike", "Lifedrinker"). */
  source: string;
  /** The same provenance as the engine's localizable {@link LocText} reference — stored
   *  in the combat-log rider-use event so the row re-localizes (golden rule 7). */
  sourceLoc: LocText;
  /** Whether the rider applies at most once per turn (informational badge). */
  oncePerTurn: boolean;
  /**
   * The backing resource the combat UI debits on a tap, or null for a
   * display-only rider. `tracker` → debit one use of `trackerId`; `hit-die` →
   * expend one Hit Point Die. NEVER auto-spent (override-first) — the tap is the
   * explicit commit.
   */
  spend: { kind: "tracker"; trackerId: string } | { kind: "hit-die" } | null;

  // ── damage rider (`kind: "damage"`) ──────────────────────────────────────
  /** The extra dice rolled on a hit ("1d8+3", "2d6"). */
  dice?: string;
  /** Stable damage-type id ("force", "necrotic") — the edge localizes the word. */
  damageTypeId?: string;
  /**
   * G14 — `"attack-or-spell"` for a rider that rides ONE attack OR spell per turn
   * rather than this weapon (a species revelation's +PB). The component
   * adds an "on an attack or a spell" line to the tooltip so the self-side
   * reminder never reads as a weapon-only bonus. Absent → weapon-bound.
   */
  scope?: "attack-or-spell";
  /**
   * A per-hit "vs a specific marked/cursed creature" rider (Hunter's Mark /
   * Hex): the chip appends a "vs marked target" / "vs cursed target" label
   * (`combat.vsMarkedTarget_*`) so the player applies the die only when the hit
   * lands on that creature — never every attack (the app models no enemy). The
   * token picks the localized noun. Absent → an always-applies rider.
   */
  vsMarkedTarget?: "marked" | "cursed";
  /**
   * `true` when the rider rides a `while-active` toggle that is currently up
   * (Rage's Brutal Strike, Divine Favor). The chip appends a "· active" suffix
   * (`combat.whileActiveNote`) so it reads as conditional on the toggle —
   * mirrors the weapon-damage breakdown note. Absent → an unconditional rider.
   */
  whileActive?: boolean;

  // ── die-modifier rider (`kind: "die-mod"`) ───────────────────────────────
  /** The annotation mode (the component picks the plain-language phrasing). */
  dieMode?: RiderDieMode;
  /** "floor": the highest replaced face (2). */
  floorBelow?: number;
  /** "floor": the value it becomes (3). */
  floorTo?: number;

  // ── on-hit-heal rider (`kind: "heal"`) ───────────────────────────────────
  /** The locale-agnostic heal formula ("1d8 + 3, min 1"). */
  healFormula?: string;
}

/**
 * Build the render-ready rider tokens for an action summary. ONE seam both weapon
 * surfaces feed (combat presenter + inventory presenter), so a fix flows to both
 * by construction (golden rule 6). Order: extra-damage riders, then die
 * modifiers, then the on-hit heal — most decision-relevant first. Empty input →
 * empty output (the surface shows no rider strip).
 */
export function buildRiders(summary: RawActionSummary, locale: Locale): RiderVM[] {
  const out: RiderVM[] = [];

  for (const [i, r] of (summary.extraDamage ?? []).entries()) {
    out.push({
      id: `damage:${i}`,
      kind: "damage",
      source: localizeText(r.source, locale),
      sourceLoc: r.source,
      oncePerTurn: r.oncePerTurn,
      spend: r.resourceTrackerId
        ? { kind: "tracker", trackerId: r.resourceTrackerId }
        : null,
      dice: r.dice,
      damageTypeId: r.damageType,
      ...(r.scope ? { scope: r.scope } : {}),
      ...(r.vsMarkedTarget ? { vsMarkedTarget: r.vsMarkedTarget } : {}),
      ...(r.whileActive ? { whileActive: true } : {}),
    });
  }

  for (const [i, m] of (summary.dieModifiers ?? []).entries()) {
    out.push({
      id: `die-mod:${i}`,
      kind: "die-mod",
      source: localizeText(m.source, locale),
      sourceLoc: m.source,
      oncePerTurn: m.oncePerTurn ?? false,
      // A die manipulation is a pure roll annotation — never a spendable resource.
      spend: null,
      dieMode: m.mode,
      ...(m.floorBelow !== undefined ? { floorBelow: m.floorBelow } : {}),
      ...(m.floorTo !== undefined ? { floorTo: m.floorTo } : {}),
    });
  }

  if (summary.onHitHeal) {
    out.push({
      id: "heal:on-hit",
      kind: "heal",
      source: localizeText(summary.onHitHeal.source, locale),
      sourceLoc: summary.onHitHeal.source,
      oncePerTurn: false,
      // Lifedrinker's heal COSTS a Hit Point Die — the consumable spend.
      spend: summary.onHitHeal.spendsHitDie ? { kind: "hit-die" } : null,
      healFormula: summary.onHitHeal.formula,
    });
  }

  return out;
}

/**
 * The COLLAPSED-FACE rider summary (#87 rider-render, always-visible): the
 * at-a-glance "this hit also deals EXTRA damage" signal the combat/weapon card
 * shows on its closed row, in a DAMAGE CLUSTER right after the base-damage
 * verdict chip ([1d12+3 Slsh] [+3d6]) — so it reads unambiguously as bonus
 * on-hit damage grouped with the base, NEVER beside the to-hit gloss where a
 * bare "+3d6" / "+8" read as a duplicate of the to-hit bonus. The fuller
 * treatment (provenance popovers, spend buttons) stays in the expanded
 * {@link ActionRiders} strip (progressive disclosure). DRY: it summarizes the
 * SAME {@link RiderVM}[] `buildRiders` already produced — never a second renderer.
 *
 * The owner's hard readability gate (densest riders × Italian × mobile 390px):
 * a naive chip-per-rider blows up (the worst case is EIGHT riders on one
 * Greatsword). So the cluster is BOUNDED — at most {@link RIDER_CHIP_CAP} dice
 * chips, each `+Nd_` / `+N` chromatically keyed to its OWN damage type (the SAME
 * `.uc-verdict[data-o]` recipe the verdict chip uses), with any remainder folded
 * into a single trailing OVERFLOW chip (`+N` in the gold "more" register, a
 * stacked-extras glyph + an aria spelling "N more on a hit" so it can never read
 * as flat damage). Dice are NEVER summed into a flat number — each rider keeps
 * its `+Nd_` notation. die-modifier / on-hit-heal riders (roll annotations, not
 * extra dice) don't get a dice chip on the closed face; they count toward the
 * overflow so "expand for more" stays honest. A CONDITIONAL "vs marked/cursed
 * target" rider (Hunter's Mark / Hex) carries `vsMarkedTarget` onto its chip so the
 * closed face can append a compact crosshair MARKER (#26 marked-disambig): the bare
 * `+1d6` then reads as conditional-on-that-creature, not every attack (the full "vs
 * marked target" label stays in the cluster aria/title + the expanded strip). An
 * unconditional rider is NEVER tagged. Returns `null` when the action carries no
 * rider (no cluster renders).
 */

/** Max DICE chips shown inline before the rest fold into one overflow chip. The
 *  realistic case is 1–2 riders; the contrived worst case (6 damage riders) caps
 *  to 2 chips + a "+N more" overflow — clean even at mobile × IT. */
export const RIDER_CHIP_CAP = 2;

/** One render-ready collapsed-face rider chip — a bonus-damage dice token, or the
 *  trailing overflow marker that folds the remaining riders into a count. */
export interface RiderChipVM {
  /** Stable React key. */
  id: string;
  /** The dice token shown ("+3d6", "+1d6+1"), or null for the overflow chip. */
  text: string | null;
  /** Chromatic outcome ("fire"/"physical"/…) for a damage chip; "more" overflow. */
  outcome: string;
  /** Overflow chip: the count of folded-in riders (≥1); absent on a dice chip. */
  overflow?: number;
  /**
   * A per-hit "vs marked/cursed target" rider (Hunter's Mark / Hex): the collapsed
   * chip carries a compact crosshair MARKER (#26 marked-disambig) so the +die reads
   * as CONDITIONAL on hitting THAT creature, never every attack (the app models no
   * enemy). The full "vs marked target" label stays in the cluster's aria/title +
   * the expanded rider strip (progressive disclosure). Absent → an unconditional
   * rider, shown bare (a flat "+3d6" is NEVER tagged).
   */
  vsMarkedTarget?: "marked" | "cursed";
}

/** The collapsed-face damage-cluster summary — a bounded list of rider chips that
 *  render immediately after the base-damage verdict. */
export interface RiderSummaryVM {
  /** Total riders the action carries (≥1) — drives the accessible "N effects". */
  count: number;
  /** The bounded chip list: up to {@link RIDER_CHIP_CAP} dice chips + ≤1 overflow. */
  chips: RiderChipVM[];
}

/** Damage-type → the §11 chromatic outcome (the SAME mapper the chip uses). The
 *  presenter keeps it id-based; the resolver is injected so this stays pure. */
export function summarizeRiders(
  riders: ReadonlyArray<RiderVM>,
  damageOutcome: (damageTypeId: string | undefined) => string
): RiderSummaryVM | null {
  if (riders.length === 0) return null;

  // The dice chips come from DAMAGE riders only (they carry `+Nd_` extra damage).
  // die-mods / heal are roll annotations, not extra dice — they don't earn a dice
  // chip on the closed face (they live in the expanded strip), but they DO count
  // toward the overflow so "+N more, expand" stays honest.
  const damageRiders = riders.filter((r) => r.kind === "damage");
  const nonDamage = riders.length - damageRiders.length;

  const shown = damageRiders.slice(0, RIDER_CHIP_CAP);
  const chips: RiderChipVM[] = shown.map((r, i) => ({
    id: r.id || `damage:${i}`,
    // Just the dice ("+3d6", "+1d6+1") — the chromatic colour carries the type,
    // exactly as the base-damage verdict chip does; no damage WORD → always tiny.
    text: `+${r.dice ?? ""}`,
    outcome: damageOutcome(r.damageTypeId),
    // A conditional "vs marked/cursed target" rider carries the crosshair marker so
    // the bare +die can't read as unconditional; an always-applies rider stays bare.
    ...(r.vsMarkedTarget ? { vsMarkedTarget: r.vsMarkedTarget } : {}),
  }));

  // Everything not shown inline (extra damage riders past the cap + every die-mod
  // / heal) folds into ONE trailing overflow chip — a gold "more on a hit" count.
  const overflow = damageRiders.length - shown.length + nonDamage;
  if (overflow > 0) {
    chips.push({ id: "more", text: null, outcome: "more", overflow });
  }

  return { count: riders.length, chips };
}
