/**
 * shortcuts — the declarative keyboard-shortcut registry + the pure helpers the
 * listeners and the shortcuts sheet share (one source of truth; the sheet can never
 * drift from what actually fires).
 *
 * Engine-layer clean: PURE + i18n-free (only `labelKey` strings; the sheet localizes
 * them). No React, no DOM state — `nextSeqState` is a pure reducer, unit-testable
 * without a DOM.
 *
 * ─── THE i18n RULE (FROZEN bindings) ───────────────────────────────────────────
 * Bindings are FROZEN — EN mnemonics (`g s` = Settings) and POSITIONAL realm digits
 * (`g 1/2/3` = the tabs' visual order) — in BOTH locales, per industry practice
 * (Gmail / GitHub / Linear do not localize keys; letter mnemonics collapse across
 * Characters/Campaigns/Compendium ↔ Personaggi/Campagne/Compendio anyway). ONLY the
 * `labelKey`-resolved LABELS localize. Never add a localized binding.
 *
 * ─── THE LIMITS (what deliberately gets NO shortcut, and why — FINAL) ───────────
 *  • NOTHING that mutates game state gets a global / single-key binding: End Turn,
 *    Rest, HP / resource changes, Level Up, Sign Out (palette-searchable only). A
 *    stray keypress must never alter a live character. TWO reasoned, route-scoped,
 *    empty-guarded exceptions have shipped: (1) the DM ←/→ turn keys; (2) ⌘Z / ⌘⇧Z
 *    (the session undo/redo stack). ⌘Z/⌘⇧Z earn the exception because they are
 *    chorded, route-scoped to the cockpit, and strictly REVERSAL — a stray press can
 *    only un-commit toward a prior state, never spend a resource; redo can only
 *    re-apply what an undo just reversed and re-validates every execute-side guard.
 *    Both step out of the way of native text-undo (the `isTypingTarget` guard) and
 *    an open dialog (`inDialog`), and never `preventDefault` an empty stack.
 *  • No ⌘1…⌘9 (browser tabs), no ⌘W/T/L/N/R, no bare arrows globally, no Alt+arrows
 *    (Windows history). Never `preventDefault` a key we did not handle.
 *  • No digits for cockpit tabs — the tab set varies per class (hidden Spells tab),
 *    so positions lie; the ARIA tablist arrows already cover it.
 *  • No `[` / `]` chords — unreachable without AltGr on Italian layouts.
 *  • No custom rebinding UI / per-user persistence — YAGNI at 6 users; this registry
 *    makes it cheap later if ever asked.
 */

/** The sections the registry + the shortcuts sheet are grouped by. */
export type ShortcutGroup = "global" | "sheet" | "encounter" | "palette" | "compendium";

/**
 * The display model for a row's keys. `combo` = a modifier chord (⌘/Ctrl + key,
 * rendered via `shortcutLabel`); `seq` = a two-step `g`-prefixed sequence (rendered
 * as two chips joined by "then"); `key` = a single named key from the fixed set.
 */
export type ShortcutKeys =
  | { kind: "combo"; mod: true; shift?: true; key: string }
  | { kind: "seq"; first: string; second: string }
  | { kind: "key"; key: "Esc" | "/" | "?" | "←/→" | "↑↓" | "↵" | "Home/End" };

export interface ShortcutRow {
  id: string;
  keys: ShortcutKeys;
  /** An ALIAS binding for the same action, rendered as a second chip after the primary
   *  (`⌘K · /`). Both keys stay live; the sheet shows ONE row per action (golden rule 6),
   *  never a duplicate row for the alias — e.g. the command palette opens on ⌘K OR `/`. */
  altKeys?: ShortcutKeys;
  labelKey: string;
  /** Registry rows shown only to admins (the `g a` → Admin sequence). */
  adminOnly?: boolean;
}

export interface ShortcutSection {
  group: ShortcutGroup;
  titleKey: string;
  rows: ShortcutRow[];
}

/**
 * The `g`-prefixed "go to" sequences: second key → destination path. Realm digits
 * are POSITIONAL (the tabs' visual order); `s`/`a` are frozen EN mnemonics. `a`
 * (Admin) is admin-gated by the listener — the sequence disarms silently for a
 * non-admin.
 */
export const GO_SEQUENCES: Record<string, string> = {
  "1": "/characters",
  "2": "/campaigns",
  "3": "/compendium",
  s: "/settings",
  a: "/admin",
};

/** True when the event originates from an editable text surface (never hijack it). */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  // `isContentEditable` is the canonical browser check; fall back to the attribute
  // (jsdom doesn't reflect the IDL property) and an editable ancestor.
  if (target.isContentEditable) return true;
  return target.closest('[contenteditable=""],[contenteditable="true"]') !== null;
}

/** True when the event target sits inside an open dialog (a layer owns its own keys). */
export function inDialog(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest('[role="dialog"]') !== null;
}

// ─── The `g`-prefix sequence stepper (pure) ──────────────────────────────────────

/** Whether a `g` prefix is armed + when. */
export interface SeqState {
  armed: boolean;
  armedAt: number;
}

/** The idle sequence state (nothing armed). */
export const IDLE_SEQ: SeqState = { armed: false, armedAt: 0 };

const SEQ_PREFIX = "g";
/** How long a `g`-armed sequence waits for its second key. */
export const SEQ_WINDOW_MS = 1500;

/**
 * Pure sequence reducer for the `g` prefix. Given the current state, the pressed
 * key, and `now` (ms), returns the next state + `fired`: the second key when a
 * complete `g <key>` sequence just landed (the caller navigates + preventDefaults),
 * else `null` (arm / re-arm / disarm / idle — all harmless, no preventDefault). An
 * armed sequence older than {@link SEQ_WINDOW_MS} is expired — the key is
 * re-evaluated fresh, so a late second key never fires. Idempotent + DOM-free.
 */
export function nextSeqState(
  state: SeqState,
  key: string,
  now: number
): { state: SeqState; fired: string | null } {
  const live = state.armed && now - state.armedAt <= SEQ_WINDOW_MS;
  if (live && key in GO_SEQUENCES) return { state: IDLE_SEQ, fired: key };
  // `g` (re)arms a fresh window; any other key idles/disarms. Either way, nothing
  // fired — the caller leaves the keypress alone.
  if (key === SEQ_PREFIX) return { state: { armed: true, armedAt: now }, fired: null };
  return { state: IDLE_SEQ, fired: null };
}
