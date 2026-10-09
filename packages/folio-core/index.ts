/**
 * @d20-folio/core — the Folio rules engine as a library (Folio Core API step 2).
 *
 * The same code the app runs, SRD-only (the private content pack is never bundled):
 *
 *   - **Characters** — `parseCharacter(json)` reads a Folio character export (schema 3),
 *     `deriveCharacter(doc)` computes its sheet (abilities, saves, skills, passives,
 *     AC, HP, initiative, speeds, senses, spell DC/attack, defenses),
 *     `serializeCharacter(doc)` writes it back.
 *   - **Rules grammar** — `compileGrant` turns a catalogue Grant into generic rules,
 *     `foldRules` folds them into plain values read with `ruleNumber` / `ruleFlag`.
 *   - **Session log** — `foldSession` applies corrections and retractions to a play
 *     log, `buildReport` turns it into a round-by-round report.
 *
 * The SRD catalogue itself ships as static JSON (`/srd/v1/*.json`, see
 * `scripts/export-srd-catalogue.ts`). Built by `pnpm core:build`.
 */

export { deriveCharacter, type CharacterSheet } from "@/lib/views/derive-character";
export {
  parseCharacter,
  serializeCharacter,
  SCHEMA_VERSION,
  type ImportResult,
  type ImportError,
} from "@/lib/character-codec";
export type { CharacterDoc, CharacterData, SessionState } from "@/types/character";

export {
  compileGrant,
  foldRules,
  ruleNumber,
  ruleValue,
  ruleFlag,
  ruleFlagIds,
  ruleNumberIds,
  type Rule,
  type RuleTarget,
  type RuleValues,
} from "@/lib/rules";
export type { Grant } from "@/lib/grant-schema";

export {
  foldSession,
  buildReport,
  type LogItem,
  type PlayEvent,
  type PlayEventKind,
  type SessionEntry,
  type ReportSection,
} from "@/lib/session-log";
