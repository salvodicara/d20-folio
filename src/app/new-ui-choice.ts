/**
 * «Try the new interface» (#1233): which interface a page load shows.
 *
 * The choice is the player's opt-in, `users/{uid}.newUi`, read with the profile. The
 * protected screens wait for the profile anyway (`AuthGuard`), so nothing is cached on the
 * device and no automatic reload can loop (a blocked storage, a second tab, a second
 * account). Two overrides sit above it:
 *   - the `VITE_NEW_UI=1` build (the preview server, the rehearsal) forces the new UI;
 *   - `?ui=classic` decides for one page load, with no write and no storage, and beats
 *     everything: it is the way back when the new UI cannot render. `?ui=new` works only
 *     in development (players opt in from Settings).
 */
import { useAuthStore } from "@/stores/authStore";

export type UiOverride = "classic" | "new";

/** The `?ui=` override in a location's search string, or null. */
export function uiOverride(search: string): UiOverride | null {
  const value = new URLSearchParams(search).get("ui");
  return value === "classic" || value === "new" ? value : null;
}

export function chooseNewUi(input: {
  /** The `VITE_NEW_UI=1` build. */
  forced: boolean;
  override: UiOverride | null;
  /** The player's stored opt-in; undefined when signed out or not loaded. */
  optedIn: boolean | undefined;
}): boolean {
  if (input.override === "classic") return false;
  if (input.forced || input.override === "new") return true;
  return input.optedIn === true;
}

/** The override a build honours: `?ui=classic` always (the way back); `?ui=new` only in
 *  development, since players opt in from Settings. */
export function honouredOverride(
  override: UiOverride | null,
  dev: boolean
): UiOverride | null {
  return override === "new" && !dev ? null : override;
}

/** The address override, read once when the app starts: it holds for this page load. */
export const BOOT_UI_OVERRIDE: UiOverride | null =
  typeof window === "undefined"
    ? null
    : honouredOverride(uiOverride(window.location.search), import.meta.env.DEV);

/** Whether this page load shows the new interface (re-renders when the profile loads). */
export function useNewUi(): boolean {
  const optedIn = useAuthStore((s) => s.profile?.newUi);
  return chooseNewUi({
    forced: import.meta.env.VITE_NEW_UI === "1",
    override: BOOT_UI_OVERRIDE,
    optedIn,
  });
}

/** The same page, forced classic for one page load: the way back when a new screen fails. */
export function classicHref(href: string): string {
  const url = new URL(href);
  url.searchParams.set("ui", "classic");
  return url.toString();
}
