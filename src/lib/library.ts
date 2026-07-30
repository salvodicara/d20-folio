/**
 * library — the account-level homebrew library MODEL (pure).
 *
 * A player's homebrew has always lived INSIDE one character (`CustomSpell` /
 * `CustomFeature` / `CustomEquipment` / `CustomWeapon` on `CharacterData`), so the
 * same house rule had to be retyped for every new sheet. This module promotes those
 * four types to REUSABLE account entries: one `users/{uid}/library/index` doc holding
 * a flat `LibraryEntry[]` (the IO seam is `lib/library-io.ts`; the state seam is
 * `stores/libraryStore.ts`).
 *
 * THE ONE RULE THIS MODULE ENCODES: a library entry is a TEMPLATE, not a copy of a
 * sheet row. Saving strips every per-character PLAY value ({@link toLibraryEntry} —
 * prepared/equipped/quantity/attuned/notes/tags/overrides, charges wound back to
 * full) and landing re-seeds the SAME defaults the Custom creation forms produce
 * ({@link entryToCharacterItem}), so a template can never carry one character's
 * spent charges or personal notes into another's sheet.
 *
 * PURE — no Firebase, no i18n, no `Date.now()` (the caller stamps `savedAt`), so the
 * whole model is unit-testable with the API key unset (registered in
 * `tests/unit/pure-modules-guard.test.ts`).
 */
import type {
  CharacterData,
  CustomEquipment,
  CustomFeature,
  CustomSpell,
  CustomWeapon,
} from "@/types/character";

/** The four homebrew kinds, in display order — the union below derives from it. */
export const LIBRARY_KINDS = ["spell", "feature", "equipment", "weapon"] as const;

/** Which of the four homebrew types an entry carries. */
export type LibraryKind = (typeof LIBRARY_KINDS)[number];

/**
 * Each kind's section word as an i18n KEY (the sheet's existing labels, never a
 * new key) — localization stays at the render boundary; this module stays pure.
 */
export const LIBRARY_KIND_LABEL_KEY: Record<LibraryKind, string> = {
  spell: "nav.spells",
  feature: "nav.features",
  equipment: "equipment.title",
  weapon: "equipment.weapons",
};

/**
 * A kind→item pairing: what a SAVE carries before it gets its stored identity.
 * Discriminated on `kind`, so every consumer narrows `item` without a cast.
 */
export type LibraryDraft =
  | { kind: "spell"; item: CustomSpell }
  | { kind: "feature"; item: CustomFeature }
  | { kind: "equipment"; item: CustomEquipment }
  | { kind: "weapon"; item: CustomWeapon };

/** One stored library entry — a draft plus its stable id and save stamp. */
export type LibraryEntry = LibraryDraft & { id: string; savedAt: number };

/**
 * An entry's display name — `title` for a feature, `name` for the other three
 * (the stored user string; the ONE identity accessor, so the upsert key, the
 * picker row and the settings row can never disagree).
 */
export function libraryEntryName(entry: LibraryDraft): string {
  return entry.kind === "feature" ? entry.item.title : entry.item.name;
}

/**
 * The stored HOMEBREW item at `(kind, idx)` on a character, as a draft — or `null`
 * when that row is an SRD reference (or the index is gone). The one place the four
 * arrays are mapped to their kinds, so every auto-upsert seam (the create forms, the
 * sheet-side edit handlers) mirrors exactly what is stored, never a stale copy held
 * in a prop.
 */
export function customDraftAt(
  data: CharacterData,
  kind: LibraryKind,
  idx: number
): LibraryDraft | null {
  switch (kind) {
    case "spell": {
      const ref = data.spells[idx];
      return ref && "custom" in ref ? { kind: "spell", item: ref } : null;
    }
    case "feature": {
      const ref = data.features[idx];
      return ref && "custom" in ref ? { kind: "feature", item: ref } : null;
    }
    case "equipment": {
      const ref = data.equipment[idx];
      return ref && "custom" in ref ? { kind: "equipment", item: ref } : null;
    }
    case "weapon": {
      const ref = data.weapons[idx];
      return ref && "custom" in ref ? { kind: "weapon", item: ref } : null;
    }
  }
}

/** The (kind, name) identity two entries are "the same homebrew" by. */
function identityKey(entry: LibraryDraft): string {
  return `${entry.kind}:${libraryEntryName(entry).trim().toLowerCase()}`;
}

/**
 * Promote a character's custom item to a library entry: DEEP-COPY it, then strip
 * every per-character play value so the entry is a reusable template.
 *
 *  - spell — drops `prepared` / `notes` / `tags` (prep state + personal annotations).
 *  - equipment — drops `equipped` / `quantity` / `tracked` / `attuned` / `notes` and
 *    winds any charge pool back to full (a saved wand template is never half-spent).
 *  - weapon — resets `quantity` to 1 (the type requires it) and drops `notes` /
 *    `tags` / `attackBonusOverride` / `damageOverride` (this character's overrides).
 *  - feature — kept WHOLE: its contentBlocks / trackers / actions ARE the content,
 *    and its `tags` are authored by the same form that writes the feature.
 *
 * `now` is passed in (never read here) so the function stays pure; `id` is a fresh
 * UUID — {@link upsertEntry} restores the OLD id when it replaces an entry.
 */
export function toLibraryEntry(draft: LibraryDraft, now: number): LibraryEntry {
  const id = crypto.randomUUID();
  switch (draft.kind) {
    case "spell": {
      const item = structuredClone(draft.item);
      delete item.prepared;
      delete item.notes;
      delete item.tags;
      return { id, savedAt: now, kind: "spell", item };
    }
    case "equipment": {
      const item = structuredClone(draft.item);
      delete item.equipped;
      delete item.quantity;
      delete item.tracked;
      delete item.attuned;
      delete item.notes;
      if (item.charges) item.charges.current = item.charges.max;
      return { id, savedAt: now, kind: "equipment", item };
    }
    case "weapon": {
      const item = structuredClone(draft.item);
      item.quantity = 1;
      delete item.notes;
      delete item.tags;
      delete item.attackBonusOverride;
      delete item.damageOverride;
      return { id, savedAt: now, kind: "weapon", item };
    }
    case "feature":
      return { id, savedAt: now, kind: "feature", item: structuredClone(draft.item) };
  }
}

/**
 * Insert `entry`, or REPLACE the existing entry of the same (kind, name) in place —
 * keeping that entry's original `id` and list POSITION, so re-saving an edited
 * homebrew updates its template instead of growing a near-duplicate pile. `replaced`
 * tells the caller which happened (the UI picks its toast from it).
 */
export function upsertEntry(
  entries: readonly LibraryEntry[],
  entry: LibraryEntry
): { entries: LibraryEntry[]; replaced: boolean } {
  const key = identityKey(entry);
  const existing = entries.find((e) => identityKey(e) === key);
  if (!existing) return { entries: [...entries, entry], replaced: false };
  return {
    entries: entries.map((e) => (e === existing ? { ...entry, id: existing.id } : e)),
    replaced: true,
  };
}

/**
 * Materialize a library entry as the character item to append — a DEEP COPY (the
 * stored entry is never aliased into a sheet), re-seeded with the SAME landing
 * defaults the Custom creation forms produce, so an item added from the library
 * behaves exactly like one just authored: `prepared` for a spell, `equipped` +
 * `quantity: 1` for equipment, `quantity: 1` for a weapon (the type requires it),
 * a feature verbatim.
 *
 * Returns the kind-tagged {@link LibraryDraft} rather than a bare item so the
 * caller's `switch` narrows `item` to the exact type of the array it appends to —
 * one call site, zero casts.
 */
export function entryToCharacterItem(entry: LibraryEntry): LibraryDraft {
  switch (entry.kind) {
    case "spell":
      return { kind: "spell", item: { ...structuredClone(entry.item), prepared: true } };
    case "equipment":
      return {
        kind: "equipment",
        item: { ...structuredClone(entry.item), equipped: true, quantity: 1 },
      };
    case "weapon":
      return {
        kind: "weapon",
        item: { ...structuredClone(entry.item), quantity: 1 },
      };
    case "feature":
      return { kind: "feature", item: structuredClone(entry.item) };
  }
}
