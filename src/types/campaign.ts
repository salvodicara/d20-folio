/**
 * Campaign & Session Types
 *
 * Defines the shape of campaign documents and related data
 * stored in Firestore.
 */

import type { CurrencyUnit } from "@/data/types";
import type { PortraitCrop, ClassEntry } from "@/types/character";
import type { NonEmptyString } from "@/lib/non-empty-string";
import type { RaceId } from "@/types/ids";

// ============================================================
// Campaign Document
// ============================================================

/**
 * D29 — a DENORMALIZED snapshot of a member's attached character, written into
 * the campaign doc by that member (rules deny reading another member's character
 * doc). A snapshot, not live — refreshed when the member re-attaches.
 */
export interface MemberCharacterSnapshot {
  /** The hero's display name — a {@link NonEmptyString} (built through the snapshot
   *  builder, which derives it from the already-non-empty `character.name`), so a
   *  party-member snapshot can NEVER carry an empty name. */
  name: NonEmptyString;
  /**
   * LEGACY pre-localized identity line (e.g. "Elf · Bard 9"). It froze in whatever
   * language wrote it and never followed a language switch, so new writes store the
   * structured slugs below and localize at render via `CharacterIdentityLine`. Kept
   * only as a read-time fallback for snapshots written before that change.
   */
  summary?: string;
  /** Stable {@link RaceId} (e.g. "elf") — localized reactively at render via
   *  `localizeRaceName`. Never a display name (golden rule 7). */
  race?: RaceId;
  /**
   * R4 — the character's `classes[]` breakdown (ids + levels), the source of truth
   * for the party identity line + total level. New writes carry this; the legacy
   * `class`/`subclass`/`level` below are a read-fallback for OLD snapshots written
   * before R4 (a denormalized cross-doc cache, refreshed on the member's next save).
   */
  classes?: ClassEntry[];
  /** pre-R4 snapshot fallback — English class name (e.g. "Bard"). */
  class?: string;
  /** pre-R4 snapshot fallback — subclass srdId / English name. */
  subclass?: string;
  /** pre-R4 snapshot fallback — total level. Use classes[]. */
  level?: number;
  ac?: number;
  hpMax?: number;
  /** The character's portrait (Storage URL + CSS crop) so the party shows the HERO's
   *  face, not just an initial. Null/absent → the character's tinted-initial fallback. */
  portraitUrl?: string | null;
  portraitCrop?: PortraitCrop | null;
}

// ============================================================
// Encounter / group-initiative tracker (DM tool)
// ============================================================

/**
 * One combatant in the DM's encounter tracker — a discriminated union on `kind`.
 *
 * A `pc` is a PURE REFERENCE (uid + character id), NOT a copy of the hero's statline:
 * its name / AC / HP / conditions / initiative / identity are read LIVE from the
 * player's character doc + its `combat/state` subdoc at render time (single source of
 * truth — golden rule 6). A `monster` IS genuine encounter-owned state (the DM types
 * it; it lives nowhere else), so it carries its own facts. NO localized display
 * strings live here (golden rule 7): `conditions` is an array of stable
 * condition IDs. The ONLY free string is a monster's `name` (user content the DM
 * types) — a PC's name is resolved live from its doc, never stored here.
 */
export type EncounterCombatant = EncounterPc | EncounterMonster;

/** Fields shared by every combatant regardless of kind. */
interface EncounterCombatantBase {
  /** Stable per-encounter id (PC: `pc-<memberUid>`; monster: `monster-<n>`). */
  id: string;
  /**
   * DM-only "hidden combatant" flag — an ambush the DM stages before revealing it.
   * Filtered out of every non-DM view; absent/`false` = visible to all. Optional +
   * additive so a pre-feature encounter doc stays valid.
   */
  hidden?: boolean;
}

/**
 * A player character at the table — a PURE REFERENCE, never a copy. Every displayed
 * stat (name · AC · current/max HP · temp · conditions · initiative · race · classes ·
 * portrait) is derived LIVE from the member's character doc + `combat/state` subdoc by
 * the feature-layer view selector (`encounter-view.ts`), so the encounter never holds
 * a second, drifting copy of a fact the sheet already owns.
 */
export interface EncounterPc extends EncounterCombatantBase {
  kind: "pc";
  /** The owning member's uid (the combatant id stem + the live-read key). */
  memberUid: string;
  /** The attached character's id (the live-read key + sheet cross-reference). */
  characterId: string;
}

/**
 * A monster/NPC group the DM types. UNLIKE a PC, this IS genuine encounter-owned
 * state — it carries its own name / AC / initiative / conditions / maxHp. `tokens` is
 * the per-token current HP over the shared `maxHp`, so "Goblin ×3" is one combatant
 * with `tokens: [7, 7, 0]` (the third dead). A single monster is just a one-element
 * `tokens` array.
 */
export interface EncounterMonster extends EncounterCombatantBase {
  kind: "monster";
  /** User content — the monster/NPC name the DM types (never an SRD label). */
  name: string;
  /** Armor Class (informational; the DM may edit). */
  ac: number;
  /** Typed initiative (no dice — the DM enters it); `null` = not yet entered. */
  initiative: number | null;
  /** Active conditions as stable condition IDS (never localized names). */
  conditions: string[];
  /** Maximum hit points (the clamp ceiling for every token's HP edit). */
  maxHp: number;
  /** Per-token current HP; each clamped to `[0, maxHp]`. A token at 0 is dead. */
  tokens: number[];
  /**
   * DM-only "reveal exact HP" flag (CARD-5). By default players see only a qualitative
   * HP BAND (Healthy / Bloodied / Near Death) derived from current/max — never the
   * number. With `revealed` set, players read the EXACT current/max for this monster.
   * The DM/admin always sees the exact number regardless. Optional + additive so a
   * pre-feature encounter doc stays valid (absent/`false` = band-only for players).
   */
  revealed?: boolean;
  /**
   * DM-only free-text notes — tactics, legendary-resistance tally, spell list,
   * motivations, whatever the DM wants to jot. Plain text (no structure imposed).
   * Optional + additive so a pre-feature encounter doc stays valid (absent = no notes);
   * only ever written/read inside the DM disclosure, so no rules change is needed.
   */
  notes?: string;
}

/**
 * The live encounter on a campaign — null/absent when no encounter is running.
 * Persisted on the campaign doc so leaving + returning to the hub resumes mid-combat.
 * Round-based (a plain counter, never a Timestamp) so the read boundary needs no
 * date normalization.
 */
export interface EncounterState {
  /** Every combatant at the table (PC refs + monster groups), insertion order. */
  combatants: EncounterCombatant[];
  /** Combat round, starts at 1; increments when the turn order wraps. */
  round: number;
  /**
   * Whose turn it is — a STABLE combatant id (not a sort index). Initiative is read
   * LIVE for PCs, so the sorted order can reorder between renders; an id pointer keeps
   * "current turn" pinned to the SAME combatant regardless. `null` = no current turn:
   * either an empty table OR the "gathering initiative" phase at the start of a fresh
   * encounter (the DM presses "Begin turns" to point it at the top of the live order).
   */
  currentCombatantId: string | null;
  /**
   * The FROZEN turn order — combatant ids in the sequence turns proceed, snapshotted
   * ONCE when the DM presses "Begin turns" ({@link "@/features/campaigns/encounter".beginEncounterTurns}).
   *
   * This is the SINGLE HOME of "what order do turns take" (the disease it cures: the
   * order used to be recomputed LIVE at every caller from each member's
   * initiative-gated `combat/state` subdoc — which the sheet cannot even read for its
   * peers — so the order diverged per surface and the turn wrapped every advance).
   * Frozen on the encounter doc, every surface (sheet · hub · pip) and every advance
   * read the IDENTICAL order with NO cross-member reads. `advanceTurn`/`prevTurn` step
   * THIS array (never a fresh live sort), so a mid-fight PC initiative change can't
   * silently re-target the current turn (RAW: the order locks once combat starts; the
   * DM owns every reorder). Includes HIDDEN combatants — hidden is a DISPLAY filter,
   * never a turn-order filter, so a staged ambush still takes its turn.
   *
   * OPTIONAL + additive: absent or empty means "turns not begun yet" (the gathering
   * phase), so a fresh {@link "@/features/campaigns/encounter".startEncounter} (which
   * leaves it unset) and any pre-feature encounter doc stay valid. A member advancing
   * the turn writes ONLY `{currentCombatantId, round}` (never `order`), so the frozen
   * order stays DM-only by construction (firestore.rules `turnFieldsOnlyChanged`).
   */
  order?: string[];
  /**
   * The per-encounter identity STAMP, set once at {@link startEncounter} (a monotonic
   * `Date.now()`). Identifies ONE fight across surfaces — the pip's "most recently
   * started" default when the viewer is in several fights, and the debounced writer's
   * same-fight guard (B04). (It is no longer an initiative-invalidation gate: PC rolls
   * live in the campaign's `encounterInit` table, which the DM resets atomically with
   * starting a fight.) Required: every encounter is started through `startEncounter`.
   */
  epoch: number;
  /** Lifecycle marker (only "active" today; ending the encounter clears the field). */
  status: "active";
}

export interface CampaignDoc {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  dmUid: string;
  members: string[];
  memberDetails: Record<
    string,
    {
      displayName: string;
      /** The member's Google account photo (written at create/join). The party shows
       *  it for a member who has NOT attached a character; null/absent → their tinted
       *  initial. (When a character IS attached, the party shows the hero portrait.) */
      photoURL?: string | null;
      characterId: string | null;
      role: "dm" | "player";
      /** D29 — the attached character's denormalized snapshot (see
       *  {@link MemberCharacterSnapshot}); null/absent until one is attached. */
      character?: MemberCharacterSnapshot | null;
    }
  >;
  status: "active" | "archived";
  inviteCode: string;
  treasury: CampaignTreasury;
  treasuryLog: TreasuryLogEntry[];
  /**
   * LEGACY (transitional — rule 10). The pre-soft-reveal home of shared notes: an
   * inline array on the campaign doc. Shared notes now live as per-note documents in
   * the `/campaigns/{campId}/notes` (revealed) + `/campaigns/{campId}/dmNotes`
   * (hidden) subcollections (see {@link SharedNote}), so `firestore.rules` can
   * READ-gate each note's `dmOnly` — a flag on an array element of THIS doc could
   * never be read-gated (a rule grants a whole document, never one array element).
   *
   * This optional field survives ONLY as a transitional READ-FALLBACK so the live
   * users' EXISTING notes (still in the array at deploy, before the migration runs)
   * surface immediately with zero migration: {@link mergeSharedNotes} unions it with
   * the subcollection notes (the subcollection copy wins on an id collision). New
   * notes are NEVER written here. Removed once `scripts/migrate-shared-notes.ts` has
   * copied every array note into the `notes` subcollection and `deleteField`-ed this
   * array. Read live notes via `subscribeToCampaignNotes`.
   */
  sharedNotes?: SharedNote[];
  /**
   * N4 — a custom campaign banner any member can upload + crop. The original is
   * stored once at quality in Storage (`campaigns/{id}/banner.jpeg`); `bannerCrop`
   * is the % rectangle (`{x,y,width,height}` of the original) the cropper produces
   * at 16:9. Null/absent → the bundled default banner art. The crop is shown two
   * ways from that ONE rectangle: the 16:9 list card (`.cmp-banner`) renders it
   * EXACTLY via the cover-fit PortraitImg, while the immersive full-window backdrop
   * honours BOTH its focal (`cropToBackgroundPosition`) AND its zoom (`cropZoomFactor`
   * → a `scale()` around the focal), so a tight crop frames the backdrop the same way
   * it frames the card. LIVE pre-16:9 docs may still carry a ~3:1 `bannerCrop`;
   * cover-fit renders them undistorted (centred on the focal, at their implied zoom).
   */
  bannerUrl?: string | null;
  bannerCrop?: PortraitCrop | null;
  /**
   * The live encounter / group-initiative tracker, rendered INLINE in the hub Party
   * section (no overlay) — an optional combat LAYER over the resting party dashboard.
   * OPTIONAL + additive — absent/null means no encounter is running, so the 6 live
   * fixtures and every pre-feature campaign doc keep loading unchanged. Only the DM
   * (or admin) writes its STRUCTURE (firestore.rules); every member reads it live, and
   * each PC's live combat state comes from the player's own `combat/state` subdoc.
   */
  encounter?: EncounterState | null;
  /**
   * THE ENCOUNTER-INITIATIVE TABLE (the initiative single source of truth) — each
   * member's RAW d20 initiative roll for the CURRENT encounter, keyed by member uid
   * (`uid → raw roll`; never the total — every consumer derives `total = roll +
   * engine bonus` at the edge). An absent key = that member has not rolled THIS
   * fight. Lives on the CAMPAIGN doc — the one document both writers are already
   * authorized on — so setting a PC's initiative never crosses a user boundary:
   *   - the DM/admin writes ANY row (the unconstrained `isDm()` update branch);
   *   - a member writes ONLY their own row (`firestore.rules`
   *     `encounterInitOwnEntryOnly()` — a map-diff scoped to their uid).
   * Every write is a per-key field-path `updateDoc` (`setEncounterInitiative`), so
   * concurrent rolls COMPOSE (offline-queueable, never a whole-map clobber); the
   * DM's debounced whole-`encounter` structural writer never touches this SIBLING
   * field, so a mid-gathering monster edit can never wipe a player's roll. The DM
   * RESETS it to `{}` atomically with starting a fight (`persistStartEncounter`) —
   * the per-fight invalidation that replaced the old per-character
   * `initiativeEpoch` stamp. OPTIONAL + additive — absent means "nobody rolled",
   * so every pre-feature campaign doc keeps loading unchanged. Monsters are
   * unaffected: a monster's typed initiative stays on its combatant (DM-only
   * structure).
   */
  encounterInit?: Record<string, number>;
  /**
   * DM-only kill switch for the invite link. OPTIONAL + additive — absent/`false`
   * means joins are OPEN; `true` INVALIDATES the invite: the `firestore.rules`
   * self-join path requires `joinsLocked != true`, so a leaked link stops admitting
   * new members WITHOUT rotating the code (the invite code IS the doc id, so a true
   * rotation would need a migration — this is the no-migration answer). Current
   * members are unaffected; the DM re-opens joins by clearing it. Only the DM/admin
   * writes it (the unconstrained `isDm()` update branch).
   */
  joinsLocked?: boolean;
}

export interface CampaignTreasury {
  pp: number;
  gp: number;
  ep: number;
  sp: number;
  cp: number;
}

export interface TreasuryLogEntry {
  amount: number;
  currency: CurrencyUnit;
  type: "add" | "remove";
  note: string;
  by: string;
  at: Date;
}

/**
 * A shared campaign note — one document at `/campaigns/{campId}/notes/{noteId}`
 * (the doc id IS {@link SharedNote.id}). Stored per-note (NOT as an array on the
 * campaign doc) so the content-sharing soft-reveal can be enforced by
 * `firestore.rules` at the READ boundary: a non-DM member is served only notes
 * whose `dmOnly` is not `true`. Read via `subscribeToCampaignNotes`, written via
 * `setCampaignNote` / `deleteCampaignNote`.
 */
export interface SharedNote {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  createdBy: string;
  updatedAt: Date;
  /**
   * Content-sharing lens (SOFT model): when `true`, this note is HIDDEN from
   * players — `firestore.rules` denies a non-DM member the read entirely, so a
   * hidden note never reaches a player's client (server-enforced, not just a
   * render-level filter). Absent/`false` = visible to all members. Only the
   * DM/admin may set or clear it (the rules' write gate); a member may neither
   * author a hidden note nor reveal/hide one. The DM reveals on demand by clearing
   * the flag. Optional + additive: a note that omits it reads as visible.
   */
  dmOnly?: boolean;
}

// ============================================================
// Chronicle Document
// ============================================================

/** Single document at /campaigns/{campId}/chronicle/main */
export interface ChronicleDoc {
  /** Full markdown content (session-structured) */
  text: string;
  /** UID of last editor */
  lastEditedBy: string;
  /** Timestamp of last edit */
  lastEditedAt: Date;
  /** Version history (capped at ~50 entries) */
  versions: ChronicleVersion[];
}

export interface ChronicleVersion {
  timestamp: Date;
  editedBy: string;
  editedByName: string;
  textSnapshot: string;
}

// ============================================================
// Session Log Document
// ============================================================

/** /campaigns/{campId}/sessions/{sessId} */
export interface SessionLogDoc {
  id: string;
  /** Session date (for listing) */
  date: Date;
  /** Session label: "Session 1", "Session 2" */
  label: string;
  /**
   * Shared one-line-or-more summary of what happened this session (D28) — what
   * the party did / found / where they left off. Markdown welcome. Distinct from
   * the Phase-6 per-participant `logs`; this is the at-a-glance "what happened".
   */
  notes: string;
  /** Whether a recap has been requested */
  recapRequested: boolean;
  recapRequestedBy: string | null;
  recapRequestedAt: Date | null;
  /** Logs from each participant, keyed by UID */
  logs: Record<
    string,
    {
      displayName: string;
      characterName: string;
      entries: Array<{ text: string; type: string; ts: number }>;
      notes: string;
      syncedAt: Date;
    }
  >;
  /** AI-generated recap draft (markdown) */
  generatedRecap: string | null;
  /** Whether recap has been saved to chronicle */
  addedToChronicle: boolean;
}
