/**
 * proficiency-vocab — the legacy-English → {@link ProficiencyToken} resolver (the
 * authoring/migration vocabulary). Lives in the DATA layer (not `lib/`) because it is
 * a translation table of the old English authoring forms (short/long, singular/plural)
 * onto stable token ids — exactly the kind of SRD-name ↔ id mapping the data-authoring
 * layer owns, and the GR7 leak-guard excludes `src/data/**` for. The runtime code
 * (codec) calls {@link enToProficiencyToken} to CONFORM a stored override key written
 * before the migration; the token ids it returns are what the rest of the code speaks.
 *
 * One-way (golden rule 10): EN form → token, never the reverse. The display string is
 * resolved from the `proficiency` i18n catalogue, never reconstructed from this map.
 */

import type { ProficiencyToken } from "@/types/ids";
import { asProficiencyToken } from "@/lib/proficiency-tokens";

/**
 * Every English form the legacy code/data/grants emitted (the old in-code EN→IT map's
 * keys, the class tables, `multiclass` entry sets, the grant `proficiency` fields, and
 * the stored override keys), each collapsed to ONE token. Short ("Simple") and long
 * ("Simple weapons") forms, and singular ("Longsword") vs plural ("Longswords"),
 * resolve to the same id.
 */
const EN_TO_TOKEN: Readonly<Record<string, string>> = {
  // ── Weapon tiers ──────────────────────────────────────────────────────────
  Simple: "simple-weapons",
  "Simple weapons": "simple-weapons",
  Martial: "martial-weapons",
  "Martial weapons": "martial-weapons",
  "Martial weapons (Finesse or Light)": "martial-weapons-finesse-or-light",
  "Martial weapons (Light)": "martial-weapons-light",
  "Martial Ranged weapons": "martial-ranged-weapons",
  // ── Weapon-type groups (singular + plural collapse to one token) ───────────
  Clubs: "clubs",
  Club: "clubs",
  Daggers: "daggers",
  Dagger: "daggers",
  Darts: "darts",
  Dart: "darts",
  "Hand Crossbows": "hand-crossbows",
  "Hand crossbow": "hand-crossbows",
  "Hand Crossbow": "hand-crossbows",
  "Improvised weapons": "improvised-weapons",
  Javelins: "javelins",
  Javelin: "javelins",
  "Light Crossbows": "light-crossbows",
  "Light Crossbow": "light-crossbows",
  Longbows: "longbows",
  Longbow: "longbows",
  Longswords: "longswords",
  Longsword: "longswords",
  Maces: "maces",
  Mace: "maces",
  Quarterstaffs: "quarterstaffs",
  Quarterstaff: "quarterstaffs",
  Rapiers: "rapiers",
  Rapier: "rapiers",
  Scimitars: "scimitars",
  Scimitar: "scimitars",
  Shortbows: "shortbows",
  Shortbow: "shortbows",
  Shortswords: "shortswords",
  Shortsword: "shortswords",
  Sickles: "sickles",
  Sickle: "sickles",
  Slings: "slings",
  Sling: "slings",
  Spears: "spears",
  Spear: "spears",
  // ── Pact weapon ───────────────────────────────────────────────────────────
  "Pact weapon": "pact-weapon",
  // ── Armor categories ──────────────────────────────────────────────────────
  Light: "light-armor",
  "Light armor": "light-armor",
  Medium: "medium-armor",
  "Medium armor": "medium-armor",
  "Medium armor (non-metal)": "medium-armor-non-metal",
  Heavy: "heavy-armor",
  "Heavy armor": "heavy-armor",
  Shields: "shields",
  "Shields (non-metal)": "shields-non-metal",
};

/** Every token the resolver can yield — lets {@link enToProficiencyToken} accept an
 *  already-conformed token verbatim (idempotent re-read of a migrated document). */
const KNOWN_TOKENS: ReadonlySet<string> = new Set<string>(Object.values(EN_TO_TOKEN));

/**
 * Resolve a legacy English proficiency form to its {@link ProficiencyToken}, or
 * `undefined` when the string is not a known SRD proficiency form (the codec drops an
 * unrecognised legacy override key — it can no longer match anything). Idempotent on
 * tokens: a value that is ALREADY a known token (`light-armor`) resolves to itself, so
 * re-reading a conformed document is a no-op (golden rule 10).
 */
export function enToProficiencyToken(en: string): ProficiencyToken | undefined {
  const token = EN_TO_TOKEN[en];
  if (token) return asProficiencyToken(token);
  if (KNOWN_TOKENS.has(en)) return asProficiencyToken(en);
  return undefined;
}
