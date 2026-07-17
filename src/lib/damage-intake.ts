/**
 * Damage intake — the character's OWN defenses applied to entered damage
 * (RA-05), plus the 0-HP crossing rules (RA-03).
 *
 * The player enters what their physical dice said (the ROLLED damage, and —
 * only when it matters — its type); THIS module computes the consequences
 * (golden rule 21: the app never rolls, it interprets entered values). Pure,
 * zero-IO, engine-core (no i18n, no React): the HP popover previews the math
 * live through these functions and the store applies the same numbers, so the
 * preview and the applied result can never disagree (golden rule 6).
 *
 * SRD 5.2.1 "Damage and Healing":
 *  - **Immunity** — no damage of that type.
 *  - **Resistance** — damage of that type is HALVED (round down).
 *  - **Vulnerability** — damage of that type is DOUBLED.
 *  - **Order of application** — all other modifiers first (the flat
 *    `flat-damage-reduction` grants — Heavy Armor Master's −PB), THEN
 *    Resistance, THEN Vulnerability.
 *  - **No stacking** — multiple instances of Resistance/Vulnerability to one
 *    type count once (sets make that true by construction).
 *
 * SRD 5.2.1 "Death Saving Throws — Damage at 0 Hit Points" + "Instant Death":
 *  - Any damage at 0 HP = one death-save failure; from a Critical Hit = two.
 *  - Damage at 0 HP ≥ your HP maximum = you die instantly.
 *  - Massive damage: when damage reduces you to 0 HP and damage remains, you
 *    die if the remainder ≥ your HP maximum.
 */

import type { DamageSource, DamageType } from "@/data/types";

/**
 * One damage instance as ENTERED by the player: the rolled amount plus, when
 * the character has a matching defense worth applying, its damage type and/or
 * source. An untyped instance (`type` absent) is applied verbatim — the
 * override-first fast path every character without typed defenses keeps.
 */
export interface DamageInstance {
  amount: number;
  type?: DamageType;
  /** Damage SOURCE (Abjurer Spell Resistance → `"spell"`); orthogonal to `type`. */
  source?: DamageSource;
}

/**
 * The character's EFFECTIVE damage defenses (grants + build overrides + the
 * session overlay already merged — `deriveDamageDefenses` in
 * `lib/views/sheet-view.ts` assembles this from the same seams the rail
 * renders, so the math can never disagree with the displayed chips).
 */
export interface DamageDefenses {
  resistances: ReadonlySet<DamageType>;
  immunities: ReadonlySet<DamageType>;
  vulnerabilities: ReadonlySet<DamageType>;
  /** Damage SOURCES the character resists (`"spell"`). */
  sourceResistances: ReadonlySet<DamageSource>;
  /** Already-resolved flat reductions (PB sentinel + armor gate resolved). */
  flatReductions: ReadonlyArray<{
    damageTypes: ReadonlyArray<DamageType>;
    amount: number;
  }>;
}

/** A `DamageDefenses` with nothing in it (the no-defense fast path). */
export const NO_DEFENSES: DamageDefenses = {
  resistances: new Set(),
  immunities: new Set(),
  vulnerabilities: new Set(),
  sourceResistances: new Set(),
  flatReductions: [],
};

/** One instance after the defense math — every step kept for the shown formula. */
export interface ResolvedDamagePart {
  amount: number;
  type?: DamageType;
  source?: DamageSource;
  /** Flat reduction actually subtracted (0 when none applied). */
  flatReduction: number;
  immune: boolean;
  /** Halved once — by a type resistance OR a source resistance (never both; no stacking). */
  resisted: boolean;
  doubled: boolean;
  /** The damage actually taken after the RAW order of application. */
  net: number;
}

/**
 * The damage types the entry UI offers as chips — exactly the types the
 * character has a type-keyed defense against (anything else applies verbatim,
 * so asking for its type would be work without information). Sorted for a
 * stable chip order.
 */
export function defendedDamageTypes(d: DamageDefenses): DamageType[] {
  const types = new Set<DamageType>([
    ...d.resistances,
    ...d.immunities,
    ...d.vulnerabilities,
  ]);
  for (const fr of d.flatReductions) for (const t of fr.damageTypes) types.add(t);
  return [...types].sort();
}

/** Resolve ONE entered instance against the defenses (RAW order, see header). */
export function resolveDamagePart(
  part: DamageInstance,
  defenses: DamageDefenses
): ResolvedDamagePart {
  const amount = Math.max(0, Math.floor(part.amount));
  const base: ResolvedDamagePart = {
    amount,
    ...(part.type ? { type: part.type } : {}),
    ...(part.source ? { source: part.source } : {}),
    flatReduction: 0,
    immune: false,
    resisted: false,
    doubled: false,
    net: amount,
  };
  if (part.type && defenses.immunities.has(part.type)) {
    return { ...base, immune: true, net: 0 };
  }
  // All other modifiers first — the flat reductions matching this type.
  let flat = 0;
  if (part.type) {
    for (const fr of defenses.flatReductions) {
      if (fr.damageTypes.includes(part.type)) flat += Math.max(0, fr.amount);
    }
  }
  flat = Math.min(flat, amount);
  let net = amount - flat;
  // Resistance halves ONCE — a type resistance and a source resistance never
  // stack (SRD: multiple instances count as one).
  const resisted =
    (part.type !== undefined && defenses.resistances.has(part.type)) ||
    (part.source !== undefined && defenses.sourceResistances.has(part.source));
  if (resisted) net = Math.floor(net / 2);
  const doubled = part.type !== undefined && defenses.vulnerabilities.has(part.type);
  if (doubled) net *= 2;
  return { ...base, flatReduction: flat, resisted, doubled, net };
}

/** The whole entered hit (one or more instances) resolved + totalled. */
export interface ResolvedDamageIntake {
  parts: ResolvedDamagePart[];
  /** Sum of the entered (rolled) amounts. */
  rawTotal: number;
  /** Sum of the per-part nets — what `applyDamage` receives. */
  netTotal: number;
}

/** Resolve every part of one hit. Zero/negative parts contribute nothing. */
export function resolveDamageIntake(
  parts: ReadonlyArray<DamageInstance>,
  defenses: DamageDefenses
): ResolvedDamageIntake {
  const resolved = parts
    .filter((p) => p.amount > 0)
    .map((p) => resolveDamagePart(p, defenses));
  return {
    parts: resolved,
    rawTotal: resolved.reduce((s, p) => s + p.amount, 0),
    netTotal: resolved.reduce((s, p) => s + p.net, 0),
  };
}

// ─── 0-HP rules (RA-03) — SRD "Death Saving Throws" + "Instant Death" ────────

/** Death-save failures suffered from damage taken WHILE at 0 HP (crit = two). */
export function deathSaveFailuresFromDamage(crit: boolean): number {
  return crit ? 2 : 1;
}

/**
 * Instant death from damage taken WHILE at 0 HP: "If the damage equals or
 * exceeds your Hit Point maximum, you die instantly." Compares the damage
 * TAKEN (post-defenses) against the effective max.
 */
export function isInstantDeathAtZero(netDamage: number, maxHp: number): boolean {
  return maxHp > 0 && netDamage >= maxHp;
}

/**
 * Massive-damage instant death on the hit that DROPS you to 0: "When damage
 * reduces you to 0 Hit Points and there is damage remaining, you die if the
 * remaining damage equals or exceeds your Hit Point maximum." Temp HP absorbs
 * first, so the remainder is what's left after both the temp pool and the
 * current HP are exhausted.
 */
export function isMassiveDamageDeath(
  netDamage: number,
  currentHp: number,
  tempHp: number,
  maxHp: number
): boolean {
  return maxHp > 0 && netDamage - tempHp - currentHp >= maxHp;
}
