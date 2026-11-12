/**
 * A plain object read from unknown input (a stored document, a command payload): an
 * object that is not null and not an array. The one copy for code off the save path;
 * the codecs keep their own until their pass (docs/architecture/2026-11-simplify-core.md,
 * item 10).
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
