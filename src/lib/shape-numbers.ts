/**
 * The stored shape numbers this client reads and writes (#1320), in one tiny,
 * dependency-free module: the eager persistence layer checks them on every raw
 * snapshot BEFORE any parse, so it must not import the codecs.
 *
 * A migration raises a number; the rules refuse a write that lowers it (the shape
 * fence). A client that reads a number above its own stops writing and asks for a
 * reload, keeping its unsaved edits as a rescue copy.
 */

/** The character parent's `schema` (the codec's `SCHEMA_VERSION`). */
export const CHARACTER_SCHEMA = 3;
/** The play document's `playState.version`. */
export const PLAY_STATE_VERSION = 1;

const above = (value: unknown, known: number): boolean =>
  typeof value === "number" && Number.isFinite(value) && value > known;

/** A raw character parent written by a newer client (its `schema` is higher). */
export function characterShapeTooNew(data: Record<string, unknown>): boolean {
  return above(data.schema, CHARACTER_SCHEMA);
}

/** A raw play document written by a newer client (`playState.version` is higher). */
export function playShapeTooNew(data: Record<string, unknown>): boolean {
  const play = data.playState;
  return (
    typeof play === "object" &&
    play !== null &&
    above((play as Record<string, unknown>).version, PLAY_STATE_VERSION)
  );
}
