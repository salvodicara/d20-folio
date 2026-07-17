/**
 * Currency vocabulary shared by the coin UIs (D52) — kept out of the
 * `CurrencyTokens` component file so that file only exports a component
 * (react-refresh friendly).
 */

import type { CurrencyUnit } from "@/data/types";

/** The coin metals (alias of the SRD `CurrencyUnit`). */
export type CurrencyMetal = CurrencyUnit;

/** Canonical high-to-low order (platinum → copper). */
export const CURRENCY_METALS: readonly CurrencyMetal[] = ["pp", "gp", "ep", "sp", "cp"];
