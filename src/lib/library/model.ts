import type { Envelope } from "../shared/model";
import { frozen, identityId } from "../identity/model";
export const LIBRARY_FAMILIES = [
  "weapon",
  "equipment",
  "spell",
  "feature",
  "monster",
  "campaign-rule",
  "species",
  "feat",
  "background",
  "class",
  "subclass",
] as const;
export type LibraryFamily = (typeof LIBRARY_FAMILIES)[number];
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };
export interface LibraryDefinition {
  schema: 1;
  family: LibraryFamily;
  name: string;
  description: string;
  tags: string[];
  payload: { schema: 1; data: { [key: string]: JsonValue } };
}
export interface LibraryRef {
  ownerUid: string;
  id: string;
}
export interface Provenance {
  source: LibraryRef;
  sourceVersion: number;
  senderUid: string;
  offerId: string;
  grantId: string;
}
export interface LibraryEntry extends LibraryRef {
  schema: 1;
  revision: number;
  draft: LibraryDefinition;
  stableVersion: number;
  provenance: Provenance | null;
  lastOperation: { uid: string; opId: string };
}
export interface LibraryVersion {
  schema: 1;
  ownerUid: string;
  entryId: string;
  version: number;
  definition: LibraryDefinition;
  provenance: Provenance | null;
  operationId: string;
}
export interface LibraryOffer {
  schema: 2;
  senderUid: string;
  id: string;
  recipientUid: string;
  sourceId: string;
  sourceVersion: number;
  definition: LibraryDefinition;
  revoked: boolean;
  revision: number;
  lastOperation: { uid: string; opId: string };
}
export interface GrantReceipt {
  schema: 2;
  senderUid: string;
  offerId: string;
  recipientUid: string;
  sourceId: string;
  sourceVersion: number;
  entryId: string;
  version: number;
  operationId: string;
}
export interface LibraryInstance {
  id: string;
  definition: LibraryRef & { version: number };
  quantity: number;
  remainingCharges: number | null;
  prepared: boolean;
}
export interface LibraryOperation extends Envelope {
  kind:
    | "library-save"
    | "library-publish"
    | "library-offer"
    | "library-accept"
    | "library-revoke";
  entry: LibraryEntry | null;
  definition: LibraryDefinition | null;
  offer: LibraryOffer | null;
  targetId: string;
}
export interface LibraryReceipt {
  operation: LibraryOperation;
  revision: number;
}
function keys(v: Record<string, unknown>, names: string[]) {
  if (Object.keys(v).length !== names.length || !names.every((k) => Object.hasOwn(v, k)))
    throw new Error("incompatible-library");
}
function object(v: unknown): Record<string, unknown> {
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(v) as object | null)
  )
    throw new Error("incompatible-library");
  return v as Record<string, unknown>;
}
function json(v: unknown, depth = 0): void {
  if (depth > 20) throw new Error("incompatible-library");
  if (v === null || typeof v === "boolean" || typeof v === "string") return;
  if (typeof v === "number" && Number.isFinite(v)) return;
  if (Array.isArray(v)) {
    v.forEach((x) => json(x, depth + 1));
    return;
  }
  const o = object(v);
  for (const [k, x] of Object.entries(o)) {
    if (["__proto__", "prototype", "constructor", "attachments"].includes(k))
      throw new Error("incompatible-library");
    json(x, depth + 1);
  }
}
export function parseDefinition(value: unknown): LibraryDefinition {
  const v = object(value);
  keys(v, ["schema", "family", "name", "description", "tags", "payload"]);
  if (
    v.schema !== 1 ||
    !LIBRARY_FAMILIES.includes(v.family as LibraryFamily) ||
    typeof v.name !== "string" ||
    v.name.length > 200 ||
    typeof v.description !== "string" ||
    v.description.length > 100000 ||
    !Array.isArray(v.tags) ||
    v.tags.length > 30 ||
    v.tags.some((t) => typeof t !== "string" || t.length > 80)
  )
    throw new Error("incompatible-library");
  const p = object(v.payload);
  keys(p, ["schema", "data"]);
  if (p.schema !== 1) throw new Error("incompatible-library");
  object(p.data);
  json(v);
  if (JSON.stringify(v).length > 200000) throw new Error("incompatible-library");
  return frozen(structuredClone(v)) as unknown as LibraryDefinition;
}
export function decodeLibraryDefinition(
  original: string
):
  | { ok: true; value: LibraryDefinition }
  | { ok: false; original: string; error: string } {
  try {
    return { ok: true, value: parseDefinition(JSON.parse(original)) };
  } catch {
    return { ok: false, original, error: "incompatible-library" };
  }
}
export function encodeLibraryDefinition(value: LibraryDefinition): string {
  return JSON.stringify(parseDefinition(value));
}
export function blankDefinition(family: LibraryFamily): LibraryDefinition {
  return {
    schema: 1,
    family,
    name: "",
    description: "",
    tags: [],
    payload: { schema: 1, data: {} },
  };
}
export function libraryId(id: string) {
  if (!/^[A-Za-z0-9_~-]{1,260}$/.test(id)) throw new Error("invalid-operation");
  return id;
}
export function libraryPath(ref: LibraryRef) {
  return "folioAccounts/" + identityId(ref.ownerUid) + "/library/" + libraryId(ref.id);
}
export function offerPath(offer: Pick<LibraryOffer, "senderUid" | "id">) {
  identityId(offer.senderUid);
  return "folioLibraryOffers/" + identityId(offer.id);
}
export function grantId(offer: Pick<LibraryOffer, "senderUid" | "id">) {
  return identityId(offer.senderUid) + "~" + identityId(offer.id);
}
export function updateLibraryInstance(
  instance: LibraryInstance,
  definition: LibraryInstance["definition"]
): LibraryInstance {
  identityId(instance.id);
  libraryPath(definition);
  if (
    !Number.isSafeInteger(definition.version) ||
    definition.version < 1 ||
    !Number.isSafeInteger(instance.quantity) ||
    instance.quantity < 0 ||
    (instance.remainingCharges !== null &&
      (!Number.isSafeInteger(instance.remainingCharges) ||
        instance.remainingCharges < 0)) ||
    typeof instance.prepared !== "boolean"
  )
    throw new Error("incompatible-instance");
  return frozen(structuredClone({ ...instance, definition }));
}
export function parseEntry(value: unknown): LibraryEntry {
  const v = object(value);
  keys(v, [
    "schema",
    "ownerUid",
    "id",
    "revision",
    "draft",
    "stableVersion",
    "provenance",
    "lastOperation",
  ]);
  libraryPath(v as unknown as LibraryRef);
  if (
    v.schema !== 1 ||
    !Number.isSafeInteger(v.revision) ||
    Number(v.revision) < 1 ||
    !Number.isSafeInteger(v.stableVersion) ||
    Number(v.stableVersion) < 0
  )
    throw new Error("incompatible-library");
  parseDefinition(v.draft);
  const last = object(v.lastOperation);
  keys(last, ["uid", "opId"]);
  identityId(String(last.uid));
  identityId(String(last.opId));
  if (v.provenance !== null) {
    const p = object(v.provenance);
    keys(p, ["source", "sourceVersion", "senderUid", "offerId", "grantId"]);
    libraryPath(p.source as LibraryRef);
    identityId(String(p.senderUid));
    identityId(String(p.offerId));
    if (
      p.grantId !== String(p.senderUid) + "~" + String(p.offerId) ||
      !Number.isSafeInteger(p.sourceVersion) ||
      Number(p.sourceVersion) < 1
    )
      throw new Error("incompatible-library");
  }
  return frozen(structuredClone(v)) as unknown as LibraryEntry;
}
