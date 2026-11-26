/**
 * «Your data» (#1341): the player's own copy of everything, and the erasure of the
 * account, from the new settings. The seams already exist — the account export
 * (`account-export-io`) and the `deleteUser` function, which lets a player erase only
 * their own account and asks for its email (the typed confirmation is checked again
 * on the server). This module is the order of the steps, so it can be tested:
 *   - erase on the server FIRST; only then clear this device's drafts and rescue
 *     copies, and sign out. A failure keeps everything and the player signed in.
 */
import { exportMyAccount } from "@/features/account/account-export-io";
import type { AccountProfile } from "@/features/account/account-export";
import { signOut } from "@/lib/auth";
import { deleteUserAccount } from "@/lib/firestore";
import { clearAccountDrafts } from "@/lib/local-draft";

/** The typed confirmation matches the account's email (case and spaces ignored). */
export function emailConfirms(typed: string, email: string): boolean {
  const norm = (value: string) => value.trim().toLowerCase();
  return norm(typed) !== "" && norm(typed) === norm(email);
}

export type DeleteOutcome = "deleted" | "mismatch" | "failed";

export async function deleteMyAccount(
  uid: string,
  email: string,
  typed: string
): Promise<DeleteOutcome> {
  if (!emailConfirms(typed, email)) return "mismatch";
  try {
    await deleteUserAccount(uid, email);
  } catch {
    return "failed";
  }
  clearAccountDrafts(uid);
  await signOut();
  return "deleted";
}

export type DownloadOutcome =
  | { ok: true; characters: number; charactersSkipped: number }
  | { ok: false };

/** Download the account's export; a character that could not be read is counted. */
export async function downloadMyData(profile: AccountProfile): Promise<DownloadOutcome> {
  try {
    const { characters, charactersSkipped } = await exportMyAccount(profile);
    return { ok: true, characters, charactersSkipped };
  } catch {
    return { ok: false };
  }
}
