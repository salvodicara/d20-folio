import { Bytes, DocumentReference, GeoPoint, Timestamp } from "firebase/firestore";
/** A typed snapshot export, not the unavailable original Firestore wire bytes. */
export function serializeLibraryRecovery(value: unknown): string {
  function encode(v: unknown): unknown {
    if (v instanceof Timestamp)
      return {
        $type: "firestore/timestamp",
        seconds: v.seconds,
        nanoseconds: v.nanoseconds,
      };
    if (v instanceof GeoPoint)
      return {
        $type: "firestore/geopoint",
        latitude: v.latitude,
        longitude: v.longitude,
      };
    if (v instanceof Bytes) return { $type: "firestore/bytes", base64: v.toBase64() };
    if (v instanceof DocumentReference)
      return {
        $type: "firestore/reference",
        path: v.path,
        projectId: v.firestore.app.options.projectId,
      };
    if (v instanceof Date)
      return {
        $type: "date",
        value: Number.isNaN(v.valueOf()) ? "Invalid Date" : v.toISOString(),
      };
    if (typeof v === "number" && (!Number.isFinite(v) || Object.is(v, -0)))
      return { $type: "number", value: Object.is(v, -0) ? "-0" : String(v) };
    if (v === undefined) return { $type: "undefined" };
    if (Array.isArray(v)) return { $type: "array", value: v.map(encode) };
    if (v && typeof v === "object")
      return {
        $type: "map",
        value: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)])),
      };
    return v;
  }
  return JSON.stringify(
    { format: "folio-library-recovery", schema: 1, snapshot: encode(value) },
    null,
    2
  );
}
