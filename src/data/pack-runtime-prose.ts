/**
 * The runtime `@pack/i18n-en-prose` resolution: the pack's English descriptions,
 * downloaded when the i18n layer first asks for them (it imports this module
 * lazily). Empty for accounts without the pack. See `pack-runtime.ts`.
 */
import type { SrdCataloguePatch } from "@/data/pack-types";
import { readPackFile, runtimePackCore } from "@/platform/pack-firebase";

export const packSrdEnProse: SrdCataloguePatch = (await runtimePackCore)
  ? ((await readPackFile("en-prose.json")) as SrdCataloguePatch)
  : {};
