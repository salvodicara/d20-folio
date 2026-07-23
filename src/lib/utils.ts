import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind classes with clsx and tailwind-merge.
 * Standard utility for shadcn/ui components.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Slugify a string for use as IDs.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Format a D&D modifier (e.g. +2, -1)
 */
export function formatModifier(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

/**
 * Format a (possibly-fractional) Challenge Rating for display: 0.125 → "1/8",
 * 0.25 → "1/4", 0.5 → "1/2", every other value verbatim. The ONE CR formatter —
 * shared by the Beast form picker, the monster spec, statblock card, and (later)
 * the encounter picker (golden rule 6).
 */
export function formatCr(cr: number): string {
  if (cr === 0.125) return "1/8";
  if (cr === 0.25) return "1/4";
  if (cr === 0.5) return "1/2";
  return String(cr);
}

/**
 * Append a signed flat modifier to a dice string for display ("1d6" + STR mod).
 * A positive modifier appends `+N`, a negative one `-N`, and a `+0` (or
 * `undefined`, i.e. no modifier) leaves the die bare — never a trailing `+0`.
 * This is the ONE composer for every "NdM+K" damage/heal formula the engine
 * surfaces, so "+0" is unrepresentable by construction (golden rule 6).
 */
export function appendAbilityModToDice(dice: string, mod: number | undefined): string {
  if (mod === undefined || mod === 0) return dice;
  return mod > 0 ? `${dice}+${mod}` : `${dice}${mod}`;
}

/**
 * Scale a cantrip's BASE damage dice by character level (2024 cantrip scaling:
 * the die count steps up at character levels 5/11/17 → ×1/×2/×3/×4). The stored
 * `damageDice` on a cantrip is its single-die base ("1d10" for Fire Bolt); this
 * resolves the count for the caster's level so the combat card shows the scaled
 * formula and the spell card shows the base. Pure helper — no rolls (golden rule
 * 10). The die FACE is preserved; only the count multiplies. A `dice` without a
 * `NdM` token (or `undefined`) is returned unchanged. Caller gates on level 0.
 */
export function scaleCantripDice(
  dice: string | undefined,
  charLevel: number
): string | undefined {
  if (dice == null) return dice;
  const m = dice.match(/^(\d+)d(\d+)$/);
  if (!m) return dice;
  const baseFace = m[2];
  const tier = charLevel >= 17 ? 4 : charLevel >= 11 ? 3 : charLevel >= 5 ? 2 : 1;
  return `${tier}d${baseFace}`;
}

/**
 * S12b — the dice from a level-keyed map at a given level: the highest threshold
 * ≤ `level` (the SAME "highest threshold ≤ level" rule `ActionAttack.diceByLevel`
 * / the cantrip `extraDamageByLevel` resolver uses). Returns `undefined` when the
 * map is absent OR `level` is below the first threshold, so the caller falls back
 * to its floor dice. Pure — no rolls (golden rule 21). The ONE shared helper the
 * aura-effect (`auraVMs`) AND form-attack (`resolveFormAttacks`) resolvers read,
 * so a Circle-of-Stars die scales 1d8→2d8 at L10 identically on both surfaces.
 */
export function pickDiceByLevel(
  byLevel: Readonly<Record<number, string>> | undefined,
  level: number
): string | undefined {
  if (!byLevel) return undefined;
  let bestThreshold = -Infinity;
  let best: string | undefined;
  for (const [thresholdStr, dice] of Object.entries(byLevel)) {
    const threshold = Number(thresholdStr);
    if (level >= threshold && threshold > bestThreshold) {
      bestThreshold = threshold;
      best = dice;
    }
  }
  return best;
}

/**
 * S12b — the number of separate damage INSTANCES a multi-instance spell creates
 * when cast at `castLevel` (Magic Missile's darts, Scorching Ray's rays): the
 * base `instances` plus one per spell-slot level above the spell's own level,
 * scaled by `instancesPerUpcast`. Returns `null` for a single-roll spell (no
 * `instances`), so the surfaces show the bare `damageDice`. Pure — the engine
 * rolls no dice; it only counts how many of the per-instance formula the player
 * rolls. `castLevel` defaults to `spellLevel` (cast at its own level → base
 * count) so the spell CARD (which has no chosen slot) shows the base.
 */
export function spellInstanceCount(
  spell: {
    level: number;
    instances?: number;
    instancesPerUpcast?: number;
  },
  castLevel: number = spell.level
): number | null {
  if (spell.instances == null) return null;
  const upcastSteps = Math.max(0, castLevel - spell.level);
  return spell.instances + upcastSteps * (spell.instancesPerUpcast ?? 0);
}

/**
 * S12c — a leveled DAMAGE spell's dice scaled to the chosen cast slot: the base
 * {@link import("@/data/types").SrdSpellData.damageDice} plus
 * {@link import("@/data/types").SrdSpellData.damageDicePerUpcast} added once per
 * slot level above the spell's own ("8d6" + "1d6"/level, cast at 5th → "10d6").
 * The die FACE is preserved and the increment's count adds to the base count; an
 * optional flat tail (`"10d6+40"` → keep `+40`) rides through unchanged. Pure —
 * no rolls (golden rule 21); it only resolves the formula the player rolls
 * externally. The SAME "steps above base, scale the count" rule as
 * {@link scaleCantripDice}/{@link spellInstanceCount}, so the cast modal's slot
 * rows preview the scaled dice and the spell card shows the bare base by
 * construction. `castLevel` defaults to `spellLevel` (no slot chosen → base
 * dice). Returns the base `dice` unchanged when there is no per-upcast increment,
 * the dice/increment can't be parsed, their faces differ, or the slot isn't
 * above the spell's own level.
 */
export function scaleUpcastDice(
  spell: {
    level: number;
    damageDice?: string;
    damageDicePerUpcast?: string;
  },
  castLevel: number = spell.level
): string | undefined {
  const dice = spell.damageDice;
  if (dice == null || spell.damageDicePerUpcast == null) return dice;
  const upcastSteps = Math.max(0, castLevel - spell.level);
  if (upcastSteps === 0) return dice;
  // Base "NdM" with an optional flat tail ("+K"/"-K") preserved verbatim.
  const base = dice.match(/^(\d+)d(\d+)((?:[+-]\d+)?)$/);
  const inc = spell.damageDicePerUpcast.match(/^(\d+)d(\d+)$/);
  if (!base || !inc || base[2] !== inc[2]) return dice;
  const scaledCount = Number(base[1]) + Number(inc[1]) * upcastSteps;
  return `${scaledCount}d${base[2]}${base[3]}`;
}

/**
 * Convert a distance in feet to a locale-appropriate string.
 *
 * Asmodee Italia standard: 1.5 m per 5 ft (i.e. ft × 0.3).
 * - EN: "30 ft"
 * - IT: "9 m" (integer) or "1,5 m" (one decimal, Italian comma separator)
 *
 * Use this for all distance/range values (weapon range, spell range, AoE, reach…).
 * For range pairs (e.g. "20/60"), use localeRangePair() instead so the unit
 * appears only once: "6/18 m" rather than "6 m/18 m".
 */
export function localeDistance(ft: number, locale: string): string {
  if (locale === "it") {
    const m = Math.round(ft * 0.3 * 10) / 10;
    const str = m % 1 === 0 ? String(m) : m.toFixed(1).replace(".", ",");
    return `${str} m`;
  }
  return `${ft} ft`;
}

/**
 * Format a near/far range pair with a single trailing unit.
 * - EN: "20/60 ft"
 * - IT: "6/18 m"
 *
 * Used by localizeWeaponProperty for "Thrown (Range X/Y)" and
 * "Ammunition (Range X/Y; Type)" so the unit is not repeated per number.
 */
export function localeRangePair(nearFt: number, farFt: number, locale: string): string {
  if (locale === "it") {
    const fmt = (ft: number) => {
      const m = Math.round(ft * 0.3 * 10) / 10;
      return m % 1 === 0 ? String(m) : m.toFixed(1).replace(".", ",");
    };
    return `${fmt(nearFt)}/${fmt(farFt)} m`;
  }
  return `${nearFt}/${farFt} ft`;
}

/**
 * Normalize a spell/feature range string to the folio display convention.
 *
 * The SRD stores ranges as bilingual prose (`{ en: "60 feet", it: "18 metri" }`).
 * The rest of the app abbreviates distances ("SPD 30 ft", "DARKVISION 60 ft"),
 * so the spelled-out "feet" in the spell list reads inconsistently and breaks
 * the numeric-register compact rhythm of the gloss line.
 *
 * This is a DISPLAY-ONLY normalizer (the stored data is untouched):
 *  - EN: "NN feet" / "NN foot" → "NN ft" (keeps "Self", "Touch", "Sight",
 *    "Unlimited", "Special" and any "(N-foot …)" qualifiers verbatim).
 *  - IT: returned as-is ("metri" stays — the IT conversion already lives in the
 *    stored string).
 *
 * Pass the locale-resolved string (e.g. `spell.range[locale]`).
 */
export function formatRange(range: string, locale: string): string {
  if (locale !== "en") return range;
  // Abbreviate a standalone trailing/leading "feet"/"foot" token to "ft" without
  // touching compound qualifiers like "(15-foot cube)" already hyphenated.
  return range.replace(/(\d)\s*(feet|foot)\b/gi, "$1 ft");
}

/**
 * Format a movement speed with locale-appropriate units.
 *
 * - EN: feet  (30 ft)
 * - IT: metres (9 m) — standard Italian D&D conversion: 1.5 m per 5 ft
 *
 * Accepts the speed value as a string (e.g. "30") or number.
 * Non-numeric strings are returned as-is.
 *
 * `exhaustionLevel` applies the 2024 exhaustion penalty (−5 ft per level,
 * floored at 0) to the base feet before locale conversion. `extraReductionFt`
 * applies any other flat reduction (e.g. heavy-armor Strength penalty, −10 ft).
 * `bonusFt` adds permanent feature-granted speed (e.g. Mobile feat +10,
 * Monk Unarmored Movement +10/+15/+20/+25/+30) before the penalties apply.
 */
export function formatSpeed(
  speed: string | number,
  locale: string,
  exhaustionLevel = 0,
  extraReductionFt = 0,
  bonusFt = 0
): string {
  const feet = typeof speed === "number" ? speed : parseInt(speed, 10);
  if (isNaN(feet)) return String(speed);
  const lvl = Math.max(0, Math.min(6, Math.floor(exhaustionLevel)));
  const effective = Math.max(
    0,
    feet + Math.max(0, bonusFt) - 5 * lvl - Math.max(0, extraReductionFt)
  );
  return localeDistance(effective, locale);
}

/**
 * Convert stored speed (feet) to locale-appropriate number string for editing.
 * EN: "30" stays "30". IT: "30" → "9" (feet → metres).
 */
export function speedToLocaleValue(speed: string | number, locale: string): string {
  const feet = typeof speed === "number" ? speed : parseInt(speed, 10);
  if (isNaN(feet)) return String(speed);
  if (locale === "it") {
    const m = Math.round(feet * 0.3 * 10) / 10;
    return m % 1 === 0 ? String(m) : m.toFixed(1).replace(".", ",");
  }
  return String(feet);
}

/**
 * Convert user-entered speed from locale units back to feet string for storage.
 * EN: "30" stays "30". IT: "9" → "30" (metres → feet, rounded to nearest 5).
 */
export function speedFromLocaleValue(input: string, locale: string): string {
  // Handle comma as decimal separator (Italian)
  const normalized = input.replace(",", ".");
  const num = parseFloat(normalized);
  if (isNaN(num)) return input;
  if (locale === "it") {
    // Convert metres → feet (divide by 0.3), round to nearest 5
    const feet = Math.round(num / 0.3 / 5) * 5;
    return String(feet);
  }
  return String(Math.round(num));
}

/**
 * Format a weight in pounds with locale-appropriate units.
 *
 * Asmodee Italia standard: 1 lb = 0.5 kg (divide by 2).
 * - EN: "2 lb"
 * - IT: "1 kg" or "2,5 kg" (Italian comma separator for decimals)
 *
 * Returns an empty string for falsy/zero weights (caller handles "—" if needed).
 */
export function formatWeight(lb: number, locale: string): string {
  if (!lb) return "";
  if (locale === "it") {
    const kg = lb / 2;
    const str = kg % 1 === 0 ? String(kg) : kg.toFixed(1).replace(".", ",");
    return `${str} kg`;
  }
  return `${lb} lb`;
}

/**
 * Normalize a raw castingTime string to a stable i18n lookup key.
 *
 * SRD data uses canonical values ("action", "bonus action", "reaction", …),
 * but some older entries may still carry "1 action" or full reaction trigger
 * strings. This helper collapses them all to the key present in srd.*
 * translations.
 */
export function castingTimeI18nKey(ct: string): string {
  const lower = ct.toLowerCase();
  // Full reaction strings (e.g. Counterspell) → canonical "reaction"
  if (lower.startsWith("reaction") || lower.startsWith("1 reaction")) return "reaction";
  // "bonus", "bonus action", "1 bonus action", "bonus-action" → space-key (has i18n entry)
  if (lower.includes("bonus")) return "bonus action";
  // "1 action" → "action" (already normalised in SRD data, but guard for safety)
  if (lower === "1 action") return "action";
  // Everything else passes through ("action", "1 minute", "10 minutes", "1 hour", etc.)
  return lower;
}

/**
 * Derive a stable hue (0–359) from an arbitrary string using the djb2 hash.
 * Pure and deterministic — same input always → same hue, no Math.random.
 * Used to give roster character cards a distinct per-character color tint when
 * no class-based pigment is defined (D6 fix).
 */
export function idToHue(id: string): number {
  let hash = 5381;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) + hash + id.charCodeAt(i)) >>> 0;
  }
  return hash % 360;
}

/**
 * Deterministic per-seed avatar tint (#45/#92): the inline style that feeds the
 * `--av-hue` CSS var the tinted-initial fallback (`.av-fallback`) consumes, so
 * every character / user WITHOUT a portrait gets a distinct-but-tasteful hue
 * instead of all-gold. Pure + stable (reuses the djb2 `idToHue`, never
 * `Math.random`), so the same seed always yields the same tint across sessions.
 */
export function avatarTint(seed: string): Record<"--av-hue", string> {
  return { "--av-hue": String(idToHue(seed || "?")) };
}

/**
 * Clamp a number into `[min, max]` — the ONE shared commit-time numeric validator
 * (#30). Non-finite input falls back to `min` so a NaN parse can never write a
 * broken value. Used by InlineEditable (every numeric inline-edit) so range
 * validation is consistent app-wide and never keystroke-blocking.
 */
export function clampNumber(n: number, min = -999, max = 9999): number {
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

/** The honest-blank glyph — an em dash for an unknown/missing scalar (never "0"). */
export const EM_DASH = "—";

/**
 * Render-ready display of a denormalized combat scalar (AC) read off a snapshot.
 * A real AC is always ≥ 1, so a `0` / `undefined` / non-finite value is an
 * un-stamped or stale snapshot — show the honest blank "—", never the lie "CA 0"
 * (owner, live data 2026-06-12). The value self-heals to the true AC on the
 * hero's next save (the auto-save + the party snapshot builder both DERIVE it).
 * One helper so the party card and roster card blank IDENTICALLY (rule 6).
 */
export function displayAc(ac: number | null | undefined): string {
  return typeof ac === "number" && Number.isFinite(ac) && ac > 0 ? String(ac) : EM_DASH;
}
