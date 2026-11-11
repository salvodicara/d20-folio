/**
 * The campaign document READ boundary, free of the Firebase client: the raw
 * `/campaigns/{id}` data becomes a `CampaignDoc`. `campaign-io` reads through it, and
 * so can a Node script (the v0.26 compatibility survey) on the Admin SDK's data.
 */
import type { CampaignDoc, EncounterState } from "@/types/campaign";
import { parseEncounterState } from "@/lib/play/encounter";
import { conformCombatEffectOps } from "@/lib/combat-effects";
import { nonEmptyString } from "@/lib/non-empty-string";
import { conformCampaignClock } from "@/lib/play/campaign-clock";
import { conformTableRules } from "@/lib/table-rules";
import { timestampsToDates } from "@/lib/timestamps-to-dates";

/**
 * Parse a campaign document off the wire. Every date-bearing field — top-level
 * `createdAt`/`updatedAt` AND the array-nested ones Firestore does NOT
 * auto-convert (`treasuryLog[].at`, …) — is normalized
 * in one pass by the generic `timestampsToDates` deep-walker, so a future nested
 * date field is covered by construction (no per-field shim to forget, no
 * `Timestamp` leaking into a `.getTime()` call).
 *
 * This is the SINGLE untrusted-input boundary for `/campaigns/{id}` — every
 * campaign surface (Party · DmTools · Chronicle · CampaignsList) reads the doc
 * this returns. The one rule-10-sanctioned ONE-WAY read-normalization lives here:
 * a member's attached-character snapshot with a CORRUPT (empty/whitespace/non-string)
 * name is REJECTED — its `character` is dropped to `null` (the member renders as
 * "no character attached", never with an invented "Unnamed" name and never crashing
 * a downstream `name.trim()`/`<Portrait>`). A stale nameless snapshot ALREADY in
 * Firestore self-heals on the member's next save (`buildMemberSnapshot` re-stamps a
 * guaranteed-non-empty name). We never write the dropped value back (read-only).
 */
export function toCampaignDoc(id: string, data: Record<string, unknown>): CampaignDoc {
  const doc = { ...timestampsToDates(data), id } as CampaignDoc;
  // Encounter state is fail-closed: reads and writes accept the current model exactly
  // and never repair persisted combatants into a different shape.
  const memberDetails = conformCampaignMembers(doc.memberDetails);
  // Table rules are read field by field: an invalid value falls back to RAW.
  if (doc.tableRules !== undefined) {
    const tableRules = conformTableRules(doc.tableRules);
    if (Object.keys(tableRules).length > 0) doc.tableRules = tableRules;
    else delete doc.tableRules;
  }
  if (doc.gameClock !== undefined) {
    const gameClock = conformCampaignClock(doc.gameClock);
    if (gameClock) doc.gameClock = gameClock;
    else delete doc.gameClock;
  }
  if (!doc.encounter) return { ...doc, memberDetails };
  const currentEncounter = parseEncounterState(doc.encounter);
  // A stored encounter written by the deleted effect-program runtime may still
  // carry `effectLifecycles`; drop the remnant at this read boundary.
  const { effectLifecycles: _legacyEffectLifecycles, ...encounter } =
    currentEncounter as EncounterState & { effectLifecycles?: unknown };
  void _legacyEffectLifecycles;
  return {
    ...doc,
    memberDetails,
    encounter: {
      ...encounter,
      ...(encounter.effectOps
        ? { effectOps: conformCombatEffectOps(encounter.effectOps) }
        : {}),
    },
  };
}

/**
 * Reject a member's attached-character snapshot whose `name` is NOT a non-empty
 * string (the reject-at-boundary half of non-nullability, owner directive
 * 2026-06-15). A corrupt snapshot's `character` is set to `null` — the member is
 * KEPT (a real party member) but rendered as "no character attached", never with a
 * placeholder name. A member with no character (`character == null`) or a valid
 * snapshot passes through untouched. Pure; never mutates the input. Exported so the
 * dev-bypass hub can route its in-memory fixture through the SAME boundary the real
 * Firestore read uses (so the corrupt-skip behaviour is identical in dev).
 */
export function conformCampaignMembers(raw: unknown): CampaignDoc["memberDetails"] {
  // `raw` is the off-the-wire value — a malformed/partial campaign doc may have no
  // `memberDetails` at all (or a non-object), so we narrow from `unknown` and default
  // to an empty map rather than crash (the whole point of a read-side conform:
  // tolerate adverse persisted shapes).
  if (typeof raw !== "object" || raw === null) return {};
  const memberDetails = raw as CampaignDoc["memberDetails"];
  const conformed: CampaignDoc["memberDetails"] = {};
  for (const [uid, member] of Object.entries(memberDetails)) {
    conformed[uid] =
      member.character && nonEmptyString(member.character.name) === null
        ? { ...member, character: null }
        : member;
  }
  return conformed;
}
