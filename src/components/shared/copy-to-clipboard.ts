/**
 * copyWithToast — the ONE copy-to-clipboard helper (golden rule 3).
 *
 * Behind `CopyButton`, and reused by surfaces that copy from a menu item (a
 * `CardMenuItem.onSelect`) rather than a button. i18n-agnostic: the caller passes
 * an already-localized `toastMessage` (rule 7).
 */

import { useToastStore } from "@/stores/toastStore";

/** Copy `value` to the clipboard and fire a (pre-localized) toast. */
export function copyWithToast(value: string, toastMessage: string): void {
  // `navigator.clipboard` is absent in insecure contexts / jsdom (the DOM lib types
  // it as always-present, so widen to acknowledge the real runtime).
  const clip = navigator.clipboard as Clipboard | undefined;
  if (clip) void clip.writeText(value).catch(() => {});
  useToastStore.getState().showToast({ message: toastMessage, duration: 2500 });
}

/**
 * shareOrCopy — open the OS share sheet when it exists, else copy + toast.
 *
 * Feature-detects `navigator.share` (present on mobile / installed PWAs, absent on
 * most desktops + jsdom). When present it opens the native share sheet; a user
 * dismissal (`AbortError`) is swallowed silently (no fallback, no error), while any
 * OTHER rejection falls through to the copy path. So {@link copyWithToast} stays the
 * single clipboard primitive (golden rule 3) and EVERY context ends with a working
 * share. i18n-agnostic: the caller passes already-localized `title` / `text` /
 * `copiedToast` (rule 7).
 */
export async function shareOrCopy(
  value: string,
  { title, text, copiedToast }: { title: string; text: string; copiedToast: string }
): Promise<void> {
  // The DOM lib types `share` as always-present; widen to acknowledge the runtime
  // (it is undefined on desktop Chrome/Firefox without the feature + in jsdom).
  const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
  if (typeof nav.share === "function") {
    try {
      await nav.share({ title, text, url: value });
      return;
    } catch (e) {
      // User dismissed the sheet — a normal outcome, NOT an error: don't also copy.
      if (e instanceof Error && e.name === "AbortError") return;
      // Any other failure (unsupported payload / permission) → fall back to copy.
    }
  }
  copyWithToast(value, copiedToast);
}
