/** A weapon's reach and range in feet, read from its property tokens. A leaf module:
 * the action resolver and the weapon Activity translator share it. */

/**
 * A weapon's range as locale-FREE structured DATA (feet numbers, never a
 * formatted string). The engine emits this; `lib/views/weapon-facts-view.
 * formatWeaponRange` turns it into the localized "5 ft", "30/120", "1,5 m"
 * display string at the presenter edge (docs/ARCHITECTURE.md, domain rule D3
 * — unit formatting is a view concern). One shape for every weapon resolver
 * (carried, manifested, pact, unarmed) so the formatting lives in ONE place.
 */
export type WeaponRangeSpec =
  | {
      /** Melee weapon: a single reach (5 / 10 / + reach-bonus), with an optional
       *  thrown near/far pair appended (" / 20/60"). */
      kind: "melee";
      reachFt: number;
      thrown?: { nearFt: number; farFt: number };
    }
  | {
      /** Ranged weapon: a near/far pair ("80/320"). */
      kind: "ranged";
      nearFt: number;
      farFt: number;
    };

/**
 * Build a weapon's structured range from its property tokens — PURE + locale-FREE
 * (no formatting, just feet numbers). Mirrors the three weapon resolvers' inline
 * logic verbatim so they share ONE source of truth: ranged weapons read a
 * `range N/M` property (default 80/320); melee weapons are 5 ft (10 with Reach)
 * plus `reachBonusFt`, with an optional thrown `N/M` pair appended.
 */
export function buildWeaponRange(
  properties: ReadonlyArray<string>,
  opts: { isRanged: boolean; reachBonusFt?: number }
): WeaponRangeSpec {
  if (opts.isRanged) {
    const rangeProp = properties.find((p) => /range\s+\d+\/\d+/i.test(p));
    const m = rangeProp?.match(/(\d+)\/(\d+)/);
    return {
      kind: "ranged",
      nearFt: m ? parseInt(m[1] ?? "0", 10) : 80,
      farFt: m ? parseInt(m[2] ?? "0", 10) : 320,
    };
  }
  const reachFt =
    (properties.some((p) => /\breach\b/i.test(p)) ? 10 : 5) + (opts.reachBonusFt ?? 0);
  const thrownProp = properties.find((p) => /\bthrown\b/i.test(p));
  const tm = thrownProp?.match(/(\d+)\/(\d+)/);
  return {
    kind: "melee",
    reachFt,
    ...(tm
      ? {
          thrown: {
            nearFt: parseInt(tm[1] ?? "0", 10),
            farFt: parseInt(tm[2] ?? "0", 10),
          },
        }
      : {}),
  };
}
