/**
 * shortcuts-registry — the declarative shortcut INVENTORY (data only).
 *
 * Split out from `shortcuts.ts` on purpose: the runtime helpers there
 * (`isTypingTarget` / `inDialog` / `nextSeqState`) are pulled into the EAGER entry
 * bundle by `useGlobalShortcuts`, but this row table is only ever read by the LAZY
 * `ShortcutsSheet` — keeping it in its own module lets the bundler leave it out of
 * the entry chunk (the P3 eager budget). It is still the ONE source of truth the
 * sheet renders from, so the sheet can never drift from what fires.
 *
 * Bindings are FROZEN — EN mnemonics / positional realm digits in both locales;
 * only the `labelKey`-resolved labels localize (the i18n rule; see `shortcuts.ts`).
 */

import type { ShortcutSection } from "./shortcuts";

/** The single source of truth both the listeners and the shortcuts sheet read. */
export const SHORTCUTS: ShortcutSection[] = [
  {
    group: "global",
    titleKey: "shortcuts.groups.global",
    rows: [
      {
        id: "palette",
        keys: { kind: "combo", mod: true, key: "K" },
        // ⌘K and `/` are ALIASES for the SAME action (open the command palette), so they
        // share ONE row (golden rule 6) rendered as `⌘K · /`, never two rows for one
        // concept. Both stay bound by `useGlobalShortcuts`.
        altKeys: { kind: "key", key: "/" },
        labelKey: "shortcuts.rows.palette",
      },
      { id: "help", keys: { kind: "key", key: "?" }, labelKey: "shortcuts.rows.help" },
      {
        id: "go-characters",
        keys: { kind: "seq", first: "g", second: "1" },
        labelKey: "shortcuts.rows.goCharacters",
      },
      {
        id: "go-campaigns",
        keys: { kind: "seq", first: "g", second: "2" },
        labelKey: "shortcuts.rows.goCampaigns",
      },
      {
        id: "go-compendium",
        keys: { kind: "seq", first: "g", second: "3" },
        labelKey: "shortcuts.rows.goCompendium",
      },
      {
        id: "go-settings",
        keys: { kind: "seq", first: "g", second: "s" },
        labelKey: "shortcuts.rows.goSettings",
      },
      {
        id: "go-admin",
        keys: { kind: "seq", first: "g", second: "a" },
        labelKey: "shortcuts.rows.goAdmin",
        adminOnly: true,
      },
      {
        id: "dismiss",
        keys: { kind: "key", key: "Esc" },
        labelKey: "shortcuts.rows.dismiss",
      },
    ],
  },
  {
    group: "sheet",
    // Reuse the canonical "Character sheet" label (golden rule 6 — one key per
    // semantic unit). It happens to live in the report screen catalogue; the
    // registry only holds the key string, so this stays a pure data reference.
    titleKey: "report.screens.characterCockpit",
    rows: [
      {
        id: "edit",
        keys: { kind: "combo", mod: true, key: "E" },
        labelKey: "shortcuts.rows.edit",
      },
      {
        id: "undo",
        keys: { kind: "combo", mod: true, key: "Z" },
        labelKey: "shortcuts.rows.undo",
      },
      {
        id: "redo",
        keys: { kind: "combo", mod: true, shift: true, key: "Z" },
        labelKey: "shortcuts.rows.redo",
      },
      {
        id: "leave-edit",
        keys: { kind: "key", key: "Esc" },
        labelKey: "shortcuts.rows.leaveEdit",
      },
      {
        id: "sheet-tabs",
        keys: { kind: "key", key: "←/→" },
        labelKey: "shortcuts.rows.sheetTabs",
      },
      {
        id: "sheet-tabs-ends",
        keys: { kind: "key", key: "Home/End" },
        labelKey: "shortcuts.rows.sheetTabsEnds",
      },
    ],
  },
  {
    group: "encounter",
    titleKey: "shortcuts.groups.encounter",
    rows: [
      { id: "turn", keys: { kind: "key", key: "←/→" }, labelKey: "shortcuts.rows.turn" },
    ],
  },
  {
    group: "palette",
    titleKey: "shortcuts.groups.palette",
    rows: [
      {
        id: "palette-move",
        keys: { kind: "key", key: "↑↓" },
        labelKey: "shortcuts.rows.paletteMove",
      },
      {
        id: "palette-ends",
        keys: { kind: "key", key: "Home/End" },
        labelKey: "shortcuts.rows.paletteEnds",
      },
      {
        id: "palette-go",
        keys: { kind: "key", key: "↵" },
        labelKey: "shortcuts.rows.paletteGo",
      },
      {
        id: "palette-close",
        keys: { kind: "key", key: "Esc" },
        labelKey: "shortcuts.rows.paletteClose",
      },
    ],
  },
  {
    group: "compendium",
    // Reuse the realm's own name (golden rule 6) — the heading IS "Compendium".
    titleKey: "nav.compendium",
    rows: [
      {
        id: "compendium-close",
        keys: { kind: "key", key: "Esc" },
        labelKey: "shortcuts.rows.compendiumClose",
      },
    ],
  },
];
