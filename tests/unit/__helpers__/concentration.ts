/**
 * Test helper — mint a {@link ConcentrationRef} for a fixture via the REAL minters, so
 * tests construct concentration values exactly as production does (no raw
 * `as ConcentrationRef` casts that would sidestep the brand, and NO hardcoded SRD
 * display names — golden rule 7). Pass an SRD spell id (`conc("bless")`) or a
 * `custom:`-marked custom name (`conc("custom:My Hex")`).
 */
import { concentrationValue, customConcentrationValue } from "@/lib/concentration";
import type { ConcentrationRef } from "@/types/ids";

export function conc(idOrCustom: string): ConcentrationRef {
  return idOrCustom.startsWith("custom:")
    ? customConcentrationValue(idOrCustom.slice("custom:".length))
    : concentrationValue(idOrCustom);
}
