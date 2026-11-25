/**
 * Saving «Try the new interface» (#1233): the player's opt-in on their own user document
 * (`users/{uid}.newUi`, a boolean the rules let them write and nothing else). The page
 * reloads into the chosen interface only once the server accepts the write, so the next
 * load reads the same value. Offline there is no write at all: a queued write would
 * leave the switch waiting, or be undone by the reload. A connection that looks up but
 * never answers (`navigator.onLine` is true on a dead Wi-Fi) counts as offline after
 * `SAVE_TIMEOUT_MS`; the queued write may still land later, and the next load follows it.
 */
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export type NewUiSave = "saved" | "offline" | "failed";

/** How long the switch waits for the server before it says there is no connection. */
export const SAVE_TIMEOUT_MS = 8_000;

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
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<"offline">((resolve) => {
    timer = setTimeout(() => resolve("offline"), SAVE_TIMEOUT_MS);
  });
  try {
    const written = updateDoc(doc(db, "users", uid), { newUi: on }).then(
      () => "written" as const
    );
    if ((await Promise.race([written, timedOut])) === "offline") return "offline";
  } catch {
    return "failed";
  } finally {
    clearTimeout(timer);
  }
  reload(withoutUiOverride(window.location.href));
  return "saved";
}
