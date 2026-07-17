/**
 * Platform helpers for cross-platform keyboard-shortcut hints (#42).
 *
 * The command palette already opens on BOTH ⌘K and Ctrl-K (AppShell listens for
 * `metaKey || ctrlKey`); only the displayed `<kbd>` glyph was Mac-hardcoded. These
 * keep the hint honest on Windows/Linux. SSR-safe (guards `navigator`).
 */

/** True on macOS / iOS (the ⌘ modifier) vs other platforms (Ctrl). */
export function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  // Prefer the modern, high-entropy `userAgentData.platform` ("macOS" / "Windows" /
  // "Linux" …) where the browser exposes it — `navigator.platform` is deprecated.
  // Fall back to the legacy platform + UA probe (Firefox/Safari, older Chromium).
  const uaPlatform = (navigator as Navigator & { userAgentData?: { platform?: string } })
    .userAgentData?.platform;
  if (uaPlatform) return /mac/i.test(uaPlatform);
  const probe = `${navigator.platform} ${navigator.userAgent}`;
  return /Mac|iPhone|iPad|iPod/i.test(probe);
}

/**
 * Platform-correct shortcut label, e.g. `⌘K` on Mac, `Ctrl K` elsewhere. Pass
 * `shift` for a Shift-augmented chord: `⌘⇧Z` on Mac, `Ctrl Shift Z` elsewhere.
 */
export function shortcutLabel(key: string, shift = false): string {
  if (isMac()) return `⌘${shift ? "⇧" : ""}${key}`;
  return `Ctrl ${shift ? "Shift " : ""}${key}`;
}
