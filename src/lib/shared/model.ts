import {
  characterPath,
  identityId,
  type Assignment,
  type CharacterRef,
} from "../identity/model";
import type { IdentityScope } from "../identity/session";
export type NoteTarget =
  | { kind: "personal"; ownerUid: string; characterId: string }
  | { kind: "dm"; campaignId: string };
export interface Authority {
  characterRevision: number | null;
  assignment: Assignment | null;
  campaignRevision: number | null;
}
export interface NoteSnapshot {
  target: NoteTarget;
  text: string;
  revision: number;
  authority: Authority;
}
export interface Envelope {
  opId: string;
  uid: string;
  scope: IdentityScope;
  baseRevision: number;
  authority: Authority;
}
export interface NoteOperation extends Envelope {
  kind: "notes";
  target: NoteTarget;
  text: string;
}
export interface AssignmentOperation extends Envelope {
  kind: "assignment";
  target: CharacterRef;
  campaignId: string | null;
  campaignRevision: number | null;
}
export type Operation = NoteOperation | AssignmentOperation;
export interface Receipt {
  operation: Operation;
  revision: number;
}
export interface SharedRepository {
  readNotes(target: NoteTarget): Promise<NoteSnapshot>;
  noteIntent(base: NoteSnapshot, text: string): NoteOperation;
  assignmentIntent(
    target: CharacterRef,
    campaignId: string | null
  ): Promise<AssignmentOperation>;
  reconcile(operation: Operation): Promise<Receipt | null>;
  commit(operation: Operation, check?: () => void): Promise<Receipt>;
}
export function notePath(target: NoteTarget) {
  return target.kind === "personal"
    ? characterPath({ ownerUid: target.ownerUid, id: target.characterId }) +
        "/private/notes"
    : `folioCampaigns/${identityId(target.campaignId)}/dmNotes/main`;
}
export function receiptPath(operation: Pick<Operation, "uid" | "opId">) {
  return `folioAccounts/${identityId(operation.uid)}/operations/${identityId(operation.opId)}`;
}
export function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const x = a as Record<string, unknown>,
    y = b as Record<string, unknown>;
  return (
    Object.keys(x).length === Object.keys(y).length &&
    Object.keys(x).every((k) => Object.hasOwn(y, k) && equal(x[k], y[k]))
  );
}
export function validateOperation(value: unknown): asserts value is Operation {
  if (
    !value ||
    typeof value !== "object" ||
    !("kind" in value) ||
    !["notes", "assignment"].includes(String(value.kind))
  )
    throw new Error("invalid-operation");
  const op = value as Operation;
  identityId(op.uid);
  identityId(op.opId);
  if (
    op.scope.uid !== op.uid ||
    !Number.isSafeInteger(op.baseRevision) ||
    op.baseRevision < 0
  )
    throw new Error("invalid-operation");
  if (op.kind === "notes") {
    notePath(op.target);
    if (typeof op.text !== "string" || op.text.length > 100000)
      throw new Error("invalid-operation");
  } else {
    characterPath(op.target);
    if (op.campaignId !== null) identityId(op.campaignId);
  }
}
