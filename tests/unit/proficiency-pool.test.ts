/**
 * proficiency-pool — the #68 / Owner-10 contract: the override add-pickers offer
 * the WHOLE pool of weapon/armor proficiency KINDS, never just the categories a
 * class happened to grant. Now id-based ({@link ProficiencyToken}). These guards
 * make that self-enforcing:
 *
 *  1. Every weapon/armor proficiency TOKEN that appears ANYWHERE in the SRD data
 *     (class tables + every grant on feats / races / invocations / magic items)
 *     must be covered by the pool — so a player can always re-add anything the
 *     game can grant. Add a new proficiency kind to the data and this fails until
 *     it's added to the pool. The few category/restriction tokens the data emits
 *     that are NOT à-la-carte picker options (the Monk's `martial-weapons-light`,
 *     the Artificer's `martial-ranged-weapons`) collapse to their base TIER.
 *  2. Every pool token localizes to BOTH locales from the catalogue (the i18n
 *     golden rule — no English may leak into the Italian rail), EN ≠ IT.
 *  3. The weapon pool is strictly broader than the two tiers (the original bug).
 */

import { describe, it, expect } from "vitest";
import { classTables } from "@/data/classes";
import { SRD_FEATS } from "@/data/feats";
import { SRD_RACES } from "@/data/races";
import { SRD_INVOCATIONS } from "@/data/invocations";
import { SRD_MAGIC_ITEMS } from "@/data/magic-items";
import {
  WEAPON_PROFICIENCY_POOL,
  WEAPON_PROFICIENCY_CATEGORIES,
  ARMOR_PROFICIENCY_POOL,
} from "@/lib/proficiency-tokens";
// The IT srd catalogue is eagerly loaded by the test setup (`ensureLocale("it")`),
// so the resolver returns IT synchronously here.
import { localizeSrd } from "@/i18n/resolver";

/** Recursively collect `{ type, proficiency }` grant tokens of one kind. */
function collectGrantTokens(
  node: unknown,
  grantType: "weapon-proficiency" | "armor-proficiency",
  out: Set<string>
): void {
  if (Array.isArray(node)) {
    for (const child of node) collectGrantTokens(child, grantType, out);
    return;
  }
  if (node && typeof node === "object") {
    const rec = node as Record<string, unknown>;
    if (rec.type === grantType && typeof rec.proficiency === "string") {
      out.add(rec.proficiency);
    }
    for (const value of Object.values(rec)) collectGrantTokens(value, grantType, out);
  }
}

const GRANT_SOURCES: unknown[] = [SRD_FEATS, SRD_RACES, SRD_INVOCATIONS, SRD_MAGIC_ITEMS];

function allWeaponTokens(): Set<string> {
  const tokens = new Set<string>();
  for (const table of classTables) {
    for (const p of table.weaponProficiencies) tokens.add(p);
  }
  for (const source of GRANT_SOURCES) {
    collectGrantTokens(source, "weapon-proficiency", tokens);
  }
  return tokens;
}

function allArmorTokens(): Set<string> {
  const tokens = new Set<string>();
  for (const table of classTables) {
    for (const p of table.armorProficiencies) tokens.add(p);
  }
  for (const source of GRANT_SOURCES) {
    collectGrantTokens(source, "armor-proficiency", tokens);
  }
  return tokens;
}

/** A data token is COVERED by the pool when it IS a pool member, or it is a
 * category/restriction variant that the picker subsumes under a tier already in
 * the pool: the Monk's `martial-weapons-finesse-or-light` / `-light`, the
 * Artificer's `martial-ranged-weapons`, and `improvised-weapons` (a tier-less
 * special) all resolve to the `martial-weapons` / `simple-weapons` tier. */
function makeCovers(pool: readonly string[]): (token: string) => boolean {
  const set = new Set<string>(pool);
  const TIER_VARIANTS: Readonly<Record<string, string>> = {
    "martial-weapons-finesse-or-light": "martial-weapons",
    "martial-weapons-light": "martial-weapons",
    "martial-ranged-weapons": "martial-weapons",
    "improvised-weapons": "simple-weapons",
    "medium-armor-non-metal": "medium-armor",
    "shields-non-metal": "shields",
  };
  return (token) => set.has(token) || set.has(TIER_VARIANTS[token] ?? "");
}

describe("proficiency override pool (Owner-10)", () => {
  it("covers every weapon proficiency the SRD data can grant", () => {
    const covers = makeCovers(WEAPON_PROFICIENCY_POOL);
    const missing = [...allWeaponTokens()].filter((t) => !covers(t));
    expect(missing).toEqual([]);
  });

  it("covers every armor proficiency the SRD data can grant", () => {
    const covers = makeCovers(ARMOR_PROFICIENCY_POOL);
    const missing = [...allArmorTokens()].filter((t) => !covers(t));
    expect(missing).toEqual([]);
  });

  it("offers far more than the two broad weapon tiers (the original bug)", () => {
    expect(WEAPON_PROFICIENCY_POOL.length).toBeGreaterThan(
      WEAPON_PROFICIENCY_CATEGORIES.length
    );
    // A representative weapon-type group must be addable à la carte.
    expect(WEAPON_PROFICIENCY_POOL).toContain("longswords");
  });

  it("has no duplicate tokens in the weapon pool", () => {
    expect(new Set(WEAPON_PROFICIENCY_POOL).size).toBe(WEAPON_PROFICIENCY_POOL.length);
  });
});

describe("proficiency catalogue localizes every pool + emitted token (no leak)", () => {
  // The pool tokens are the picker options; EVERY one must localize in both
  // locales and DIVERGE (an IT === EN render would be an unresolved leak).
  it("localizes every pool token EN ≠ IT", () => {
    const offenders = [...WEAPON_PROFICIENCY_POOL, ...ARMOR_PROFICIENCY_POOL].filter(
      (token) => {
        const en = localizeSrd("proficiency", token, "name", "en");
        const it = localizeSrd("proficiency", token, "name", "it");
        return en === it;
      }
    );
    expect(offenders).toEqual([]);
  });

  // The DISPLAY lock: every EXACT token the data emits (including the restricted
  // variants the cockpit rail renders straight through — `martial-weapons-light`,
  // `pact-weapon`) must localize EN ≠ IT, so a restricted kind can't leak.
  it("localizes every EXACT token the SRD data emits EN ≠ IT (display)", () => {
    const emitted = [...allWeaponTokens(), ...allArmorTokens(), "pact-weapon"];
    const offenders = emitted.filter((token) => {
      const en = localizeSrd("proficiency", token, "name", "en");
      const it = localizeSrd("proficiency", token, "name", "it");
      return en === it;
    });
    expect(offenders).toEqual([]);
  });
});
