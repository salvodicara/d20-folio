/**
 * The stored-character READ path, free of the Firebase client: a parent document and
 * its `combat/state` child become the in-memory `CharacterDoc`, or a thrown
 * `Invalid character document: <code>` quarantine. `@/lib/firestore` reads through
 * it, and so can a Node script (the v0.26 compatibility survey) on the Admin SDK's
 * data, so both take the one path.
 */
import type { CharacterDoc } from "@/types/character";
import type { CombatState } from "@/types/combat-state";
import { applyCombatToSession } from "@/lib/combat-state";
import { parseCombatState } from "@/lib/combat-state-codec";
import { mergeActiveCombatEffects } from "@/lib/combat-effects";
import { parsePersistedPlayStateV1 } from "@/lib/session-state-codec";
import type { SessionState } from "@/types/character";

/** A Firestore timestamp, from the web client or the Admin SDK alike. */
function isTimestamp(value: unknown): value is { toDate: () => Date } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  );
}

/** The Firestore-only metadata fields a character document carries ALONGSIDE the
 *  `{ schema, build, state }` codec envelope. Pulled off a raw doc on read. */
export function readDocMeta(
  id: string,
  data: Record<string, unknown>
): Pick<
  CharacterDoc,
  | "id"
  | "createdAt"
  | "updatedAt"
  | "portraitUrl"
  | "portraitCrop"
  | "shared"
  | "revision"
  | "status"
> {
  // The compare-and-set generation is REQUIRED (ADR-0009: the cutover migration
  // stamps `revision: 0` on every live parent before the deploy that needs it). A doc
  // without it cannot be safely written back, so it quarantines like any other codec
  // failure rather than silently defaulting into a clobbering write.
  if (
    typeof data.revision !== "number" ||
    !Number.isInteger(data.revision) ||
    data.revision < 0
  ) {
    throw new TypeError("Invalid character document: invalid-revision");
  }
  return {
    id,
    createdAt: isTimestamp(data.createdAt)
      ? data.createdAt.toDate()
      : (data.createdAt as Date),
    updatedAt: isTimestamp(data.updatedAt)
      ? data.updatedAt.toDate()
      : (data.updatedAt as Date),
    portraitUrl: typeof data.portraitUrl === "string" ? data.portraitUrl : null,
    portraitCrop: (data.portraitCrop as CharacterDoc["portraitCrop"]) ?? null,
    // A doc written before public share links carries no field → not shared.
    shared: data.shared === true,
    revision: data.revision,
    status:
      data.status === "retired" || data.status === "dead" || data.status === "archived"
        ? data.status
        : "active",
  };
}

/**
 * A stored character as its full in-memory sheet: the parent document parsed by the
 * shared codec, its `combat/state` child folded in (the same hydration the owner's load
 * runs). For a peer write that must run the target's own rules inside its transaction
 * (campaign-io `writeCampaignCombatEffect`). Throws on an invalid document.
 */
export async function hydrateStoredCharacter(
  id: string,
  parentData: Record<string, unknown>,
  rawCombat: unknown
): Promise<CharacterDoc> {
  return hydrateCompleteCharacter(await parseStoredCharacter(id, parentData), rawCombat);
}

export async function hydrateCompleteCharacter(
  parent: CharacterDoc,
  rawCombat: unknown
): Promise<CharacterDoc> {
  let combat: CombatState | null = null;
  if (rawCombat !== null) {
    const parsed = parseCombatState(rawCombat);
    if (!parsed.ok) throw new TypeError(`Invalid combat state: ${parsed.reason}`);
    combat = parsed.state;
  }
  const { effectiveAC, effectiveMaxHp } = await import("@/lib/aggregate-character");
  const activeEffects = mergeActiveCombatEffects(combat?.activeEffects ?? [], []);
  const hydrationBase = { ...parent.session };
  const attachEffects = (session: SessionState): void => {
    if (activeEffects.length === 0) return;
    Object.defineProperty(session, "encounterEffects", {
      configurable: true,
      enumerable: false,
      writable: true,
      value: activeEffects,
    });
  };
  attachEffects(hydrationBase);
  if (!combat) {
    throw new TypeError("Invalid character document: missing-combat-state");
  }
  const parsedPlayState = parsePersistedPlayStateV1(combat.playState);
  if (!parsedPlayState.ok) {
    throw new TypeError(`Invalid character document: ${parsedPlayState.reason}`);
  }
  const maxSession = parsedPlayState.session;
  attachEffects(maxSession);
  const max = effectiveMaxHp(parent.character, maxSession);
  const hydration = applyCombatToSession(hydrationBase, combat, max);
  if (!hydration.ok) {
    throw new TypeError(`Invalid character document: ${hydration.reason}`);
  }
  return {
    ...parent,
    character: {
      ...parent.character,
      ac: effectiveAC(parent.character, hydration.session),
    },
    session: hydration.session,
  };
}

/**
 * Parse one persisted character document into the full in-memory `CharacterDoc` via
 * the shared codec (lazy SRD). Reads the unified `{ build, state }` envelope. Throws
 * on a structurally invalid doc so the caller surfaces a clean error (never a stuck
 * spinner).
 */
export async function parseStoredCharacter(
  id: string,
  data: Record<string, unknown>
): Promise<CharacterDoc> {
  const meta = readDocMeta(id, data);
  const { parseCharacterEnvelope, stampEffectiveAc, ensureBuildNames } =
    await import("@/lib/character-codec");
  const { normalizeSessionActionIds } =
    await import("@/lib/normalize-session-action-ids");

  const build =
    typeof data.build === "object" && data.build !== null
      ? (data.build as Record<string, unknown>)
      : {};
  const state =
    typeof data.state === "object" && data.state !== null
      ? (data.state as Record<string, unknown>)
      : {};
  // The `combat/state` child owns every mutable play fact, so a parent that still
  // carries one is a corrupt/pre-cutover document: quarantine it rather than load a
  // second, stale copy of the session.
  if (Object.keys(state).length > 0) {
    throw new TypeError("Invalid character document: parent-state-not-empty");
  }
  await ensureBuildNames(build);

  const parsed = parseCharacterEnvelope(build, state);
  // A codec quarantine (`code:path`) must reach the subscription's `quarantine()`
  // verbatim: it is what the diagnostics report records, and the doc is left
  // untouched rather than repaired into a lossy write.
  if (!parsed.ok) throw new TypeError(`Invalid character document: ${parsed.error}`);
  const character = stampEffectiveAc(parsed.character, parsed.session);
  const session = normalizeSessionActionIds(character, parsed.session);
  // The combat-mutable trio (HP/temp · conditions · initiative · death saves) is NOT on
  // the parent doc — it lives in the `combat/state` subdoc, hydrated by the subscription
  // hooks (absent subdoc → the full-HP default for a fresh/undamaged character).
  return { ...meta, character, session };
}
