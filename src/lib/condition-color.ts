/**
 * Maps a condition id to its `--cond-*` palette var (Conditions B "Individual
 * Hue"). Normalizes to lowercase at the boundary — session/mock data may store
 * "Frightened" (capital) while the token key is `--cond-frightened`; without
 * this the lookup silently falls back to neutral grey, killing the whole
 * per-hue system for any non-lowercase id.
 *
 * Pure (no React/Firebase) so it lives outside the component file and can be
 * unit-tested directly.
 */
export function condColor(id: string): string {
  return `var(--cond-${id.toLowerCase()}, var(--text-muted))`;
}

/**
 * AA-safe TEXT variant for a condition chip — the saturated `--cond-*` border
 * hue was tuned as a 3:1 graphic, not as ≥4.5:1 body text, so 8 of 15 dark-theme
 * hues failed AA when used directly as the chip label (a grappled / restrained /
 * unconscious player couldn't read their own high-stakes condition). Mirrors the
 * `.uc-verdict --oc-ink` split: the border keeps `--cond-*`, the label uses the
 * lightened `--cond-*-ink` (defined per-theme in index.css; falls back to the
 * base hue where no lift is needed, e.g. the light theme).
 */
export function condInkColor(id: string): string {
  const key = id.toLowerCase();
  return `var(--cond-${key}-ink, var(--cond-${key}, var(--text-secondary)))`;
}
