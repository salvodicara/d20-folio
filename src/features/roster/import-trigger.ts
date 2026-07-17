/**
 * import-trigger — a tiny registration bridge so a GLOBAL entry point (the "Ask the
 * Folio" command palette, OWN-28d) can launch the character-import file picker that
 * is HOSTED elsewhere (the shell-level `<ImportCharacterHost>`), without lifting the
 * import flow into a store or forking it.
 *
 * The host registers its `open` callback on mount; the palette calls
 * `triggerCharacterImport()` synchronously inside the user's click, so the OS file
 * picker still opens under a valid user gesture. Registration happens in an effect
 * (never during render), so this module-level handle is gesture-safe and tree-shake
 * friendly. No-ops if no host is mounted.
 */

let trigger: (() => void) | null = null;

/** The host registers (or clears, on unmount) its picker-opener here. */
export function registerImportTrigger(fn: (() => void) | null): void {
  trigger = fn;
}

/** Open the character-import picker if a host is mounted (else a no-op). */
export function triggerCharacterImport(): void {
  trigger?.();
}
