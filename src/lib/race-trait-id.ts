/** Race-trait session ids: a leaf module, so catalogue readers need no engine. */
import type { SrdRaceTrait } from "@/data/types";

/**
 * The persisted runtime/session id for a race trait — `race:<raceId>:<trait.id>`
 * (live session data; pinned/spent tracker + action state key off it). `trait.id`
 * is the trait's STABLE catalogue-key slug (e.g. `relentless-endurance`) — a
 * locale-free handle, so the id NEVER embeds an English display name (golden rules
 * 12 + 22: the code speaks only ids). The single source of truth for this id
 * shape — every engine site that resolves a race trait's session id routes here.
 *
 * A doc written before this change stored the legacy `race:<raceId>:<EN name>`
 * form; it is conformed to this id form on read at the codec boundary (golden rule
 * 17 — see `conformRaceTraitSessionIds`), so no live user loses tracker state.
 */
export function raceTraitSessionId(raceId: string, trait: SrdRaceTrait): string {
  return `race:${raceId}:${trait.id}`;
}
