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
import type { CustomMonster } from "@/types/campaign";
import { createItemInstanceId } from "@/lib/item-resources";

/**
 * The homebrew kinds, in display order — the union below derives from it. The first
 * four are SHEET items (they land on a `CharacterData` array); `monster` is the odd
 * one — a reusable ENCOUNTER template that never touches a character sheet, so the
 * character-materialization helpers ({@link entryToCharacterItem}, {@link customDraftById})
 * exclude it by TYPE ({@link SheetLibraryKind}) and it materializes through the
 * campaigns-side `customMonsterToInput` instead.
 */
export const LIBRARY_KINDS = [
  "spell",
  "feature",
  "equipment",
  "weapon",
  "monster",
] as const;

/** Which homebrew type an entry carries. */
export type LibraryKind = (typeof LIBRARY_KINDS)[number];

/** The kinds that land on a character SHEET array (everything but `monster`) — the
 *  domain of {@link entryToCharacterItem} / {@link customDraftById} / the sheet edit seam. */
export type SheetLibraryKind = Exclude<LibraryKind, "monster">;

/**
 * Each kind's section word as an i18n KEY (the sheet's existing labels, never a
 * new key) — localization stays at the render boundary; this module stays pure.
 */
export const LIBRARY_KIND_LABEL_KEY: Record<LibraryKind, string> = {
  spell: "nav.spells",
  feature: "nav.features",
  equipment: "equipment.title",
  weapon: "equipment.weapons",
  monster: "compendium.monsters",
};

/**
 * A kind→item pairing: what a SAVE carries before it gets its stored identity.
 * Discriminated on `kind`, so every consumer narrows `item` without a cast.
 */
export type LibraryDraft =
  | { kind: "spell"; item: CustomSpell }
  | { kind: "feature"; item: CustomFeature }
  | { kind: "equipment"; item: CustomEquipment }
  | { kind: "weapon"; item: CustomWeapon }
  | { kind: "monster"; item: CustomMonster };

/** A draft/entry of a SHEET kind (never `monster`) — narrowed for the
 *  character-materialization helpers so `monster` is unrepresentable there. */
export type SheetLibraryDraft = Extract<LibraryDraft, { kind: SheetLibraryKind }>;
export type SheetLibraryEntry = LibraryEntry & SheetLibraryDraft;

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
 * The stored HOMEBREW item of `kind` whose `instanceId` is `instanceId`, as a draft —
 * or `null` when no such row exists (an SRD reference, a stale id, or the item is
 * gone). The one place the four arrays are mapped to their kinds, so every auto-upsert
 * seam (the create forms, the sheet-side edit handlers) mirrors exactly what is
 * stored, never a stale copy held in a prop. Id-keyed, not index-keyed, so it survives
 * whatever reordering happens between the read that captured the id and this lookup.
 */
export function customDraftById(
  data: CharacterData,
  kind: SheetLibraryKind,
  instanceId: string
): SheetLibraryDraft | null {
  switch (kind) {
    case "spell": {
      const ref = data.spells.find(
        (r): r is CustomSpell => "custom" in r && r.instanceId === instanceId
      );
      return ref ? { kind: "spell", item: ref } : null;
    }
    case "feature": {
      const ref = data.features.find(
        (r): r is CustomFeature => "custom" in r && r.instanceId === instanceId
      );
      return ref ? { kind: "feature", item: ref } : null;
    }
    case "equipment": {
      const ref = data.equipment.find(
        (r): r is CustomEquipment => "custom" in r && r.instanceId === instanceId
      );
      return ref ? { kind: "equipment", item: ref } : null;
    }
    case "weapon": {
      const ref = data.weapons.find(
        (r): r is CustomWeapon => "custom" in r && r.instanceId === instanceId
      );
      return ref ? { kind: "weapon", item: ref } : null;
    }
  }
}

/**
 * Promote a character's custom item to a library entry: DEEP-COPY it, then strip
 * every per-character play value so the entry is a reusable template.
 *
 *  - spell — drops `prepared` / `notes` / `tags` (prep state + personal annotations).
 *  - equipment — drops `equipped` / `quantity` / `attuned` / `notes` and winds any
 *    charge pool back to full (a saved wand template is never half-spent). `tracked`
 *    STAYS: it is the authored tracking MODE, the same tier as `isConsumable` /
 *    `isPotion` / `potionFormula` (all kept) — the play value is the `quantity` it
 *    counts, and that is stripped. Dropping it made the edit round-trip lossy (a
 *    "track uses" item reopened as untracked and silently lost the mode on save).
 *  - weapon — resets `quantity` to 1 (the type requires it) and drops `notes` /
 *    `tags` / `attackBonusOverride` / `damageOverride` (this character's overrides).
 *  - feature — kept WHOLE: its contentBlocks / trackers / actions ARE the content,
 *    and its `tags` are authored by the same form that writes the feature.
 *
 * `now` is passed in (never read here) so the function stays pure. `id` is the item's
 * own stable `instanceId` for a sheet kind (unchanged by a rename, so re-saving the
 * same item always produces the same id) and a fresh UUID for a monster template.
 */
export function toLibraryEntry(draft: SheetLibraryDraft, now: number): SheetLibraryEntry;
export function toLibraryEntry(draft: LibraryDraft, now: number): LibraryEntry;
export function toLibraryEntry(draft: LibraryDraft, now: number): LibraryEntry {
  // A sheet entry's id IS the item's own stable instanceId (so the library entry
  // and every character's copy of it share one identity); a monster template has
  // no per-item instanceId (that identity belongs to `CustomEquipment` et al, not
  // `CustomMonster`), so it alone still mints a fresh UUID.
  const id = draft.kind === "monster" ? crypto.randomUUID() : draft.item.instanceId;
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
    case "monster":
      // A monster template carries NO per-encounter play value by construction (the
      // encounter re-seeds tokens/initiative/conditions/count at add). Its portrait +
      // creatureType ARE identity, kept WHOLE — the feature-tier "kept verbatim" case.
      return { id, savedAt: now, kind: "monster", item: structuredClone(draft.item) };
  }
}

/**
 * Insert `entry`, or REPLACE the existing entry with the same `id` in place — keeping
 * that entry's list POSITION, so re-saving an edited homebrew updates its template
 * instead of growing a near-duplicate pile. `replaced` tells the caller which
 * happened (the UI picks its toast from it).
 *
 * `id` IS the identity: for a sheet kind it is the item's own stable `instanceId`
 * (unchanged by a rename), so a renamed row upserts as the SAME record with no
 * separate rename-move step. A monster template's id is a UUID minted once at save
 * and carried unchanged thereafter, same rule.
 */
export function upsertEntry(
  entries: readonly LibraryEntry[],
  entry: LibraryEntry
): { entries: LibraryEntry[]; replaced: boolean } {
  const existing = entries.find((e) => e.id === entry.id);
  if (!existing) return { entries: [...entries, entry], replaced: false };
  return {
    entries: entries.map((e) => (e === existing ? entry : e)),
    replaced: true,
  };
}

/**
 * Materialize a library entry as the character item to append — a DEEP COPY (the
 * stored entry is never aliased into a sheet), re-seeded with the SAME landing
 * defaults the Custom creation forms produce, so an item added from the library
 * behaves exactly like one just authored: `prepared` for a spell, `equipped` for
 * equipment, a feature verbatim.
 *
 * `quantity` is the count the picker's stepper offered (the SRD add-time convention,
 * D55) — honoured by the two quantity-bearing kinds, ignored by spells and features
 * exactly as their SRD legs ignore it.
 *
 * Returns the kind-tagged {@link LibraryDraft} rather than a bare item so the
 * caller's `switch` narrows `item` to the exact type of the array it appends to —
 * one call site, zero casts.
 *
 * The entry's `id` (the library item's own `instanceId`) lands UNCHANGED, so
 * every character that keeps its own untouched copy shares one identity with
 * the template — UNLESS `takenIds` already holds it (this character already
 * carries that instance, e.g. adding the same library entry a second time),
 * in which case a fresh id is minted so the two copies stay independently
 * addressable (session play-state, resource ledgers, …).
 */
export function entryToCharacterItem(
  entry: SheetLibraryEntry,
  quantity = 1,
  takenIds: ReadonlySet<string> = new Set()
): SheetLibraryDraft {
  switch (entry.kind) {
    case "spell": {
      const item = structuredClone(entry.item);
      if (takenIds.has(item.instanceId)) item.instanceId = createItemInstanceId();
      return { kind: "spell", item: { ...item, prepared: true } };
    }
    case "equipment": {
      const item = structuredClone(entry.item);
      if (takenIds.has(item.instanceId)) item.instanceId = createItemInstanceId();
      return { kind: "equipment", item: { ...item, equipped: true, quantity } };
    }
    case "weapon": {
      const item = structuredClone(entry.item);
      if (takenIds.has(item.instanceId)) item.instanceId = createItemInstanceId();
      return { kind: "weapon", item: { ...item, quantity } };
    }
    case "feature": {
      const item = structuredClone(entry.item);
      if (takenIds.has(item.instanceId)) item.instanceId = createItemInstanceId();
      return { kind: "feature", item };
    }
  }
}
