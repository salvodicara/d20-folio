export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };
export interface CharacterRef {
  ownerUid: string;
  id: string;
}
export interface Assignment {
  campaignId: string;
  assignmentId: string;
  version: number;
}
export interface AuthorizedSheet {
  build: JsonObject;
  state: JsonObject;
}
export interface FolioCharacter extends CharacterRef {
  schema: 1;
  name: string;
  speciesId: string;
  classId: string;
  level: number;
  revision: number;
  currentAssignment: Assignment | null;
  sheet: AuthorizedSheet;
  portraitPath: string | null;
}
export interface FolioCampaign {
  schema: 1;
  id: string;
  name: string;
  dmUid: string;
  members: string[];
  revision: number;
  archived: boolean;
  joinOpen: boolean;
}
export interface RosterEntry {
  ownerUid: string;
  characterId: string;
  assignmentId: string;
  version: number;
}
export type DiceMode = "digital" | "physical";
export interface FolioAccount {
  schema: 1;
  displayName: string;
  locale: "en" | "it";
  diceMode?: DiceMode;
}
export function parseAccount(value: unknown): Readonly<FolioAccount> {
  const a = object(value);
  if (
    a.schema !== 1 ||
    typeof a.displayName !== "string" ||
    a.displayName.length > 120 ||
    (a.locale !== "en" && a.locale !== "it") ||
    ("diceMode" in a && a.diceMode !== "digital" && a.diceMode !== "physical") ||
    Object.keys(a).some(
      (key) => !["schema", "displayName", "locale", "diceMode"].includes(key)
    )
  )
    throw new Error("invalid-account");
  return frozen({
    schema: 1,
    displayName: a.displayName,
    locale: a.locale,
    diceMode: a.diceMode ?? "digital",
  } as FolioAccount);
}
export function identityId(value: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new Error("invalid-id");
  return value;
}
export function characterPath(ref: CharacterRef): string {
  return `folioAccounts/${identityId(ref.ownerUid)}/characters/${identityId(ref.id)}`;
}
export function rosterId(ref: CharacterRef): string {
  return `${identityId(ref.ownerUid)}~${identityId(ref.id)}`;
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("invalid-document");
  return value as Record<string, unknown>;
}
export function frozen<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) frozen(child);
  }
  return value;
}
export function parseCharacter(value: unknown): Readonly<FolioCharacter> {
  const x = object(value);
  if (typeof x.ownerUid !== "string" || typeof x.id !== "string")
    throw new Error("invalid-character");
  identityId(x.ownerUid);
  identityId(x.id);
  if (
    x.schema !== 1 ||
    typeof x.name !== "string" ||
    !x.name.trim() ||
    typeof x.speciesId !== "string" ||
    typeof x.classId !== "string" ||
    !Number.isInteger(x.level) ||
    Number(x.level) < 1 ||
    Number(x.level) > 20 ||
    !Number.isInteger(x.revision) ||
    Number(x.revision) < 0
  )
    throw new Error("invalid-character");
  if (x.currentAssignment !== null) {
    const a = object(x.currentAssignment);
    if (typeof a.campaignId !== "string" || typeof a.assignmentId !== "string")
      throw new Error("invalid-assignment");
    identityId(a.campaignId);
    identityId(a.assignmentId);
    if (
      !Number.isInteger(a.version) ||
      Number(a.version) < 1 ||
      Object.keys(a).length !== 3
    )
      throw new Error("invalid-assignment");
  }
  const sheet = object(x.sheet);
  object(sheet.build);
  object(sheet.state);
  if (
    Object.keys(sheet).some((k) => !["build", "state"].includes(k)) ||
    Object.keys(x).some(
      (k) =>
        ![
          "schema",
          "ownerUid",
          "id",
          "name",
          "speciesId",
          "classId",
          "level",
          "revision",
          "currentAssignment",
          "sheet",
          "portraitPath",
        ].includes(k)
    )
  )
    throw new Error("invalid-character");
  if (
    x.portraitPath !== null &&
    (typeof x.portraitPath !== "string" ||
      !x.portraitPath.startsWith(
        `${characterPath({ ownerUid: x.ownerUid, id: x.id })}/portraits/`
      ))
  )
    throw new Error("invalid-portrait");
  return frozen(structuredClone(x) as unknown as FolioCharacter);
}
export function parseCampaign(value: unknown): FolioCampaign {
  const x = object(value);
  if (typeof x.id !== "string" || typeof x.dmUid !== "string")
    throw new Error("invalid-campaign");
  identityId(x.id);
  identityId(x.dmUid);
  if (
    x.schema !== 1 ||
    typeof x.name !== "string" ||
    !x.name.trim() ||
    !Array.isArray(x.members) ||
    !x.members.every((v) => typeof v === "string" && identityId(v)) ||
    !x.members.includes(x.dmUid) ||
    !Number.isInteger(x.revision) ||
    Number(x.revision) < 0 ||
    typeof x.archived !== "boolean" ||
    typeof x.joinOpen !== "boolean" ||
    Object.keys(x).length !== 8
  )
    throw new Error("invalid-campaign");
  return frozen(structuredClone(x) as unknown as FolioCampaign);
}
