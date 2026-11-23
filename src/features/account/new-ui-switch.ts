/**
 * Saving «Try the new interface» (#1233): the player's opt-in on their own user document
 * (`users/{uid}.newUi`, a boolean the rules let them write and nothing else). The page
 * reloads into the chosen interface only once the server accepts the write, so the next
 * load reads the same value. Offline there is no write at all: a queued write would
 * leave the switch waiting, or be undone by the reload.
 */
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export type NewUiSave = "saved" | "offline" | "failed";

/** The current address without the one-page-load `?ui=` override. */
export function withoutUiOverride(href: string): string {
  const url = new URL(href);
  url.searchParams.delete("ui");
  return url.toString();
}

export async function saveNewUi(
  uid: string,
  on: boolean,
  reload: (href: string) => void = (href) => window.location.replace(href)
): Promise<NewUiSave> {
  if (!navigator.onLine) return "offline";
  try {
    await updateDoc(doc(db, "users", uid), { newUi: on });
  } catch {
    return "failed";
  }
  reload(withoutUiOverride(window.location.href));
  return "saved";
}
