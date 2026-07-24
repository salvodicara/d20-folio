/**
 * Dev-bypass campaign fixture (Phase 5 · Part 2b).
 *
 * Under `VITE_DEV_BYPASS_AUTH` the app never touches Firestore (`dev-bypass.ts`):
 * the campaign listener opens nothing and create/join persist nothing. This
 * module provides a deterministic in-memory campaign — the world-layer analogue
 * of `MOCK_CHARACTER` — so the campaign hub renders a populated surface for local
 * dev, the a11y / visual suite, and the create/join → hub e2e flow. It is pure
 * (type-only imports) and tree-shaken from production builds, where
 * `DEV_BYPASS_AUTH` is statically `false`.
 */

import type {
  CampaignDoc,
  ChronicleDoc,
  EncounterState,
  SessionLogDoc,
  SharedNote,
} from "@/types/campaign";
import type {
  GlobalCombat,
  PipModel,
  PipEntry,
  PipState,
  PendingTurn,
} from "@/features/campaigns/global-combat-context";
import { assertNonEmptyString } from "@/lib/non-empty-string";
import { asRaceId } from "@/data/srd-names";

/** The id `makeDevCampaign` seeds by default (also a sample invite code). */
export const DEV_CAMPAIGN_ID = "DEVCAMPAIGN24";

/**
 * `d20-dev-empty` — render the dev hub as a FRESH, just-created campaign: the DM is
 * the only member (no character attached), and the chronicle / sessions / notes /
 * treasury ledger are all empty. Lets the shot / a11y harness exercise every hub
 * EMPTY state (the teach-and-act blanks) without a second fixture. Dev-bypass only —
 * every caller is behind `DEV_BYPASS_AUTH`, so this is tree-shaken from production.
 */
function devEmpty(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem("d20-dev-empty") === "1";
}

/** A dev-only hero portrait (figure-on-gradient SVG data URI) so the party shows the
 *  Owner-7 character-portrait path in bypass — distinct from the tinted-initial. */
const DEV_HERO_PORTRAIT =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cdefs%3E%3ClinearGradient id='h' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%231f5a4f'/%3E%3Cstop offset='1' stop-color='%23a8d8b0'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='64' height='64' fill='url(%23h)'/%3E%3Ccircle cx='32' cy='24' r='11' fill='%23fff' opacity='0.9'/%3E%3Cpath d='M13 57c0-11 8-19 19-19s19 8 19 19z' fill='%23fff' opacity='0.9'/%3E%3C/svg%3E";

/**
 * Dev-bypass sessions (D28) — newest first, with a populated summary on the latest
 * (so the accordion's rendered read view is exercised), an empty one (the "no
 * summary yet" state), a VERY long one (the CAMPAIGN-NOTES-UX `NoteClamp` reading
 * cap), and enough rows (7 > 5) that the bounded list's "View all" engages. Fixed
 * dates keep screenshots + the a11y/visual suite stable.
 */
export function makeDevSessions(): SessionLogDoc[] {
  if (devEmpty()) return [];
  const base = {
    recapRequested: false,
    recapRequestedBy: null,
    recapRequestedAt: null,
    logs: {},
    generatedRecap: null,
    addedToChronicle: false,
  };
  // A summary FAR past the reading cap (min(420px,55vh)) at every viewport, so
  // the expanded row exercises the clamp in dev + e2e (desktop lines wrap little —
  // be generous, not borderline).
  const longRecap = `### Down the well

The party descended the dry well behind the shrine. ${"The passage twisted deeper than any torch could promise, and every turn repeated the same dripping dark. ".repeat(30)}

### The warden

${"An iron statue barred the vault door and asked its riddle three times before Bren answered with the hymn from the chapel wall. ".repeat(30)}

- The vault held the kobold ledger.
- Mara pocketed a wax seal nobody recognized.`;
  return [
    {
      ...base,
      id: "sess-7",
      date: new Date("2026-05-02T19:00:00Z"),
      label: "Session 7",
      notes:
        "### The bridge\n\nThe party crossed at dawn and met a **goblin scout**. Mara talked it down for the price of a torch.\n\n- Found a sealed door, dwarven make.\n- Bren sensed undeath below.",
    },
    {
      ...base,
      id: "sess-6",
      date: new Date("2026-04-25T19:00:00Z"),
      label: "Session 6",
      notes: "",
    },
    {
      ...base,
      id: "sess-5",
      date: new Date("2026-04-18T19:00:00Z"),
      label: "Session 5",
      notes: longRecap,
    },
    {
      ...base,
      id: "sess-4",
      date: new Date("2026-04-11T19:00:00Z"),
      label: "Session 4",
      notes: "Shopping day in Duskwell; sold the goblin blades.",
    },
    {
      ...base,
      id: "sess-3",
      date: new Date("2026-04-04T19:00:00Z"),
      label: "Session 3",
      notes: "Met Edran's sister at the inn; took the rescue job.",
    },
    {
      ...base,
      id: "sess-2",
      date: new Date("2026-03-28T19:00:00Z"),
      label: "Session 2",
      notes: "Mapped the ravine rim and marked the rope anchors.",
    },
    {
      ...base,
      id: "sess-1",
      date: new Date("2026-03-21T19:00:00Z"),
      label: "Session 1",
      notes: "Character introductions at the Grey Gable Inn.",
    },
  ];
}

/**
 * localStorage key an e2e spec can set (via `addInitScript`, before the app boots)
 * to seed the dev-bypass chronicle with EXACT text — no UI save round-trip. Read
 * ONLY inside the `DEV_BYPASS_AUTH` branch, so it is tree-shaken from production
 * (the whole dev-fixture module is). Lets the chronicle specs put their precise
 * chapter structure in place deterministically + instantly, instead of opening the
 * editor, filling 30+ lines, saving, and acknowledging the wipe-confirm dialog —
 * the slow multi-round-trip dance that, under full-matrix CPU contention, blew the
 * test's wall-clock budget (#84). Absent ⇒ the rich default fixture loads.
 */
export const DEV_CHRONICLE_OVERRIDE_KEY = "d20-folio-dev-chronicle";

/**
 * Read the optional e2e chronicle-text override from localStorage. Returns the
 * raw text if a non-empty override is set, else `null` (load the default fixture).
 * Dev-bypass only (its sole caller is gated by `DEV_BYPASS_AUTH`).
 */
function readDevChronicleOverride(): string | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(DEV_CHRONICLE_OVERRIDE_KEY);
  return raw && raw.length > 0 ? raw : null;
}

/**
 * A populated chronicle for the dev-bypass hub (D27). Exercises every block the
 * reader parses — `#`/`##` chapter splits, `###` scene sub-headings, `---` scene
 * rules, **bold**, and lists — plus a couple of restorable revisions, so the
 * reading view, the version history, and the visual/a11y suite all have real
 * structure to render. Pure + tree-shaken from production (DEV_BYPASS_AUTH false).
 *
 * An e2e spec may pre-seed EXACT text via {@link DEV_CHRONICLE_OVERRIDE_KEY}; when
 * present it replaces the default body (keeping the fixed byline + revision so the
 * reader, history, and "last edited" line still render) so the chronicle specs get
 * their precise chapter structure with zero UI round-trips.
 */
export function makeDevChronicle(): ChronicleDoc {
  if (devEmpty()) {
    // A never-written chronicle: no text, no byline, no history (the empty state).
    return { text: "", lastEditedBy: "", lastEditedAt: new Date(0), versions: [] };
  }
  const at = new Date("2026-05-02T19:30:00Z");
  // The first chapter carries the pasted-reference edge case (MOBILE-SWEEP): an
  // unbroken string longer than a phone viewport. Real campaigns paste long links
  // and references into the chronicle; without the body-level
  // `overflow-wrap: break-word` (index.css) this
  // widened the PAGE and forced a horizontal scroll on the campaign hub (the
  // owner's bug). It renders at rest on the hub, so the manifest-wide no-overflow
  // guard (tests/e2e/mobile-layout.spec.ts) pins the fix forever.
  // The first chapter ALSO runs long past the CAMPAIGN-NOTES-UX reading cap
  // (min(420px,55vh)) so the chronicle's NoteClamp renders engaged at rest on the
  // hub (dev + a11y/visual suites) — a heading-less wall of prose is exactly the
  // case the chapter clamp guards.
  const text = `# Session 1 — Into the Keep

The party gathered at the **Grey Gable Inn** and took the Fennicks' bargain: descend
the ravine, find the missing prospectors, and bring back *a single shard of star-iron*.
Abbey ledger: Harrowmere/Recordarium/VolumeXIX/TheKeepBeforeTheFall/ChapterFour/TheLowerVaultsAndTheBeaconRoot/FolioCXVIII

${"The road south ran empty and the beacon towers stood dark, and every farmhouse the party passed had shuttered its windows against more than the cold. ".repeat(30)}

## The Ravine

A rope bridge spanned the dark below. Mara crept ahead and found the first ward —
its rune read \`lux aeterna\`. ~~No traps~~ Two traps, actually.

### What we learned

- The keep sank centuries ago, towers and all.
- **Morweth the druid** tends a cold flame at its root.
- Two factions war in the ruins: goblins above, kobolds below.

---

### Where we left off

Camped on the bridge, torches low, the dripping growing louder beneath us.`;
  return {
    text: readDevChronicleOverride() ?? text,
    lastEditedBy: "member-mara",
    lastEditedAt: at,
    versions: [
      {
        timestamp: new Date("2026-04-25T21:00:00Z"),
        editedBy: "mock-uid",
        // B32 — a realistic display name, never the raw English "You" (Chronicle's
        // self-byline seam localizes the CURRENT viewer's own entries by uid at render
        // time regardless of this stored snapshot; this value is what a DIFFERENT
        // viewer, or an IT locale, would otherwise see verbatim).
        editedByName: "GM",
        textSnapshot: `# Session 1 — Into the Keep

The party took the Fennicks' bargain and set out for the ravine.`,
      },
    ],
  };
}

/** The dev encounter modes the Party section can seed (dev-bypass only). */
type EncounterDemoMode = "begun" | "gathering" | null;

/**
 * Which encounter the dev campaign should seed in the Party section. The DEFAULT is the
 * calm party OVERVIEW (no encounter, `null`); the screenshot / a11y harness sets
 * `d20-dev-encounter` before boot to shoot a combat state:
 *   • `"1"` → a mid-combat encounter with turns BEGUN (the frozen order + DM controls);
 *   • `"gathering"` → the GATHERING-initiative phase with one un-rolled monster, so the
 *     Begin-turns gate renders DISABLED with its "X/Y rolled" reason (C3 item 1).
 * Dev-bypass only (its sole caller is {@link makeDevCampaign}, gated by `DEV_BYPASS_AUTH`).
 */
function encounterDemo(): EncounterDemoMode {
  if (typeof window === "undefined") return null;
  const flag = window.localStorage.getItem("d20-dev-encounter");
  if (flag === "1") return "begun";
  if (flag === "gathering") return "gathering";
  return null;
}

/**
 * A fully-populated dev campaign for `id` (defaults to {@link DEV_CAMPAIGN_ID}).
 * Timestamps are a fixed epoch so screenshots + tests stay deterministic. The
 * roster is denormalized into `memberDetails` exactly as a real campaign is, so
 * the Party section renders without reading any member's character doc.
 */
/**
 * Dev-bypass shared notes — the `/campaigns/{id}/notes` subcollection in memory.
 * The pinned Morweth note + a LONG rumor note (the CAMPAIGN-NOTES-UX `NoteClamp`
 * case) are visible to all; a third note is `dmOnly: true` so the bypass DM sees
 * the soft-reveal "Hidden from players" badge + the reveal/hide toggle at rest (in
 * dev + the visual suite). Deterministic dates keep screenshots stable.
 */
export function makeDevNotes(): SharedNote[] {
  if (devEmpty()) return [];
  const at = new Date(0);
  return [
    {
      id: "note-morweth",
      title: "Morweth the druid",
      content: "Tends a cold flame below the keep; wants the star-iron left unmined.",
      pinned: true,
      createdBy: "mock-uid",
      updatedAt: at,
      dmOnly: false,
    },
    {
      // A note FAR past the CAMPAIGN-NOTES-UX clamp cap (10.5em) at every
      // viewport (desktop lines wrap little — be generous, not borderline), so
      // the bounded preview (fade + "Show more") renders at rest in dev + the
      // suites.
      id: "note-rumors",
      title: "Rumors heard in Duskwell",
      content:
        "Things the table has picked up around town, unsorted:\n\n" +
        "Star-iron surfaces at the spring and autumn thaws, one shard each — keeps a blade keen forever, they say, and the Fennick family pays in gold for a sliver.\n" +
        "A pale boy was seen on the ravine rim at dusk; the miller swears he cast no shadow.\n" +
        "The kobolds below trade fair if you bring polished copper; they call the dragon wyrmling 'Vexrix' and want it back.\n" +
        "Edran and Liss went down a month ago with the ranger Hale. None came back up.\n" +
        "The old druid grove south of town went silent in winter; the birds avoid it still.\n" +
        "Petra at the Grey Gable waters the ale on festival days but knows every traveler's business — worth a friendly coin.\n" +
        "Someone is buying torches in bulk. The chandler won't say who.\n" +
        "Grellak the kobold quartermaster owes Mara a favor after the copper trade; he marks safe tunnels with a smudge of chalk at knee height.\n" +
        "The Fennick signet rings are the proof the family wants — gold won't be paid without them, shard or no shard.\n" +
        "Bren's order keeps records of the keep from before it sank; a letter to the abbey at Harrowmere might take weeks but could name the lower vaults.\n" +
        "The thaw market is in five weeks. If the cold flame below is to be doused, the druid's buyers arrive before then.",
      pinned: false,
      createdBy: "member-mara",
      updatedAt: new Date("2026-05-01T20:00:00Z"),
      dmOnly: false,
    },
    {
      // Staged-but-hidden lore: the DM sees it (badge + toggle); a player never
      // does (server-gated in prod, render-filtered in dev).
      id: "note-traitor",
      title: "The pale boy is Morweth's thrall",
      content:
        "Not for the players yet: the shadowless boy on the ravine rim answers to " +
        "Morweth. Reveal once they meet him below.",
      pinned: false,
      createdBy: "mock-uid",
      updatedAt: new Date("2026-05-02T09:00:00Z"),
      dmOnly: true,
    },
  ];
}

/**
 * The dev `encounterInit` roll table for the BEGUN encounter demo (`d20-dev-encounter`
 * = `"1"`): with turns begun the order is FROZEN, a state production only reaches once
 * EVERY combatant has rolled (Begin-turns hard-gates on it) — so the dev campaign doc
 * must carry the members' rolls, or the demo shows an impossible mid-fight "INIT —" +
 * a misleading red needs-roll pip. Rides the campaign doc exactly like production (the
 * initiative SSOT); `{}` in every other mode (gathering keeps its un-rolled urgency
 * demo). Rolls sit under the monsters' 12–16 so the frozen order reads naturally.
 */
function devEncounterInitSeed(): Record<string, number> {
  if (encounterDemo() !== "begun") return {};
  return { "member-bren": 8, "member-mara": 6 };
}

export function makeDevCampaign(id: string = DEV_CAMPAIGN_ID): CampaignDoc {
  if (devEmpty()) {
    // A FRESH, just-created campaign — the create-flow shape: the creator is the DM
    // and only member, nothing attached, nothing logged, no encounter. Every hub
    // section renders its teach-and-act empty state.
    return {
      id,
      name: "The Starless Keep",
      createdAt: new Date("2026-05-02T18:00:00Z"),
      updatedAt: new Date("2026-05-02T18:00:00Z"),
      createdBy: "mock-uid",
      dmUid: "mock-uid",
      members: ["mock-uid"],
      memberDetails: {
        // B32 — a realistic display name, never the raw English "You" (which leaked
        // untranslated Italian-locale text via `campaignHub.narratedBy`).
        "mock-uid": { displayName: "GM", characterId: null, role: "dm" },
      },
      status: "active",
      inviteCode: id,
      treasury: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
      treasuryLog: [],
      encounter: null,
    };
  }
  return {
    id,
    name: "The Starless Keep",
    // CUSTOM-ART DEMO (dev-only, flag-gated): set the `d20-dev-banner` flag to give
    // the dev campaign a custom `bannerUrl` + an OFF-CENTRE 16:9 `bannerCrop`, so the
    // throwaway hub-shot harness can prove the CampaignHubPage backdrop renders the
    // DM's art positioned at the crop FOCAL (vs the bundled default's centre) — and
    // the realm-list card shows the SAME 16:9 region — without a real Firebase upload.
    // Points at a shipped candlelit splash. The crop centre is upper-right (focal
    // ≈ 66% / 23.75%), clearly off the centred default so the focal→backdrop wiring
    // is visible at a glance. The `d20-dev-banner-zoom` flag instead supplies a TIGHT
    // ~5× crop (`100/max(w,h)` = 5) so the harness can prove the backdrop honours the
    // crop ZOOM, not only its focal — the card and the scaled `cover` backdrop must
    // show the SAME tight framing.
    ...(typeof window !== "undefined" &&
    window.localStorage.getItem("d20-dev-banner-zoom") === "1"
      ? {
          bannerUrl: "/assets/backgrounds/login.webp",
          bannerCrop: { x: 40, y: 20, width: 20, height: 11.25 },
        }
      : typeof window !== "undefined" &&
          window.localStorage.getItem("d20-dev-banner") === "1"
        ? {
            bannerUrl: "/assets/backgrounds/login.webp",
            bannerCrop: { x: 38, y: 8, width: 56, height: 31.5 },
          }
        : {}),
    // Fixed, realistic dates (not the epoch) so the summary card's "Started" +
    // "Active" lines read naturally in dev + the visual suite, staying deterministic.
    createdAt: new Date("2026-03-14T18:00:00Z"),
    updatedAt: new Date("2026-05-02T22:30:00Z"),
    createdBy: "mock-uid",
    dmUid: "mock-uid",
    members: ["mock-uid", "member-mara", "member-bren"],
    memberDetails: {
      // The DM (you) hasn't attached a character — shows the "attach" state.
      // B32 — a realistic display name, never the raw English "You" (which leaked
      // untranslated Italian-locale text via `campaignHub.narratedBy`).
      "mock-uid": {
        displayName: "GM",
        characterId: null,
        role: "dm",
      },
      // D29 — Mara attached a character snapshot (the party card shows her hero);
      // Bren attached a character; the DM has none — every state is visible.
      "member-mara": {
        displayName: "Mara",
        // A real dev-fixture id so the DM read-only sheet view (T4) renders a
        // full character locally + in e2e (resolved via the dev fixture seam).
        characterId: "team-catalion-bard",
        role: "player",
        character: {
          // The owner's REAL party hero (AC-ZERO, 2026-06-12) — long enough to
          // exercise the CARD-NAMES wrap (it mid-truncated to "Coralino di
          // Sanval…" before the No-Truncation fix). Matches its `team-catalion`
          // id, so the DM read-only sheet shows the same hero.
          name: assertNonEmptyString("Coralino di Sanvaldo"),
          race: asRaceId("human"),
          class: "Bard",
          level: 8,
          ac: 15,
          hpMax: 52,
          // Owner-7 — a hero with a portrait shows the portrait (not an initial).
          portraitUrl: DEV_HERO_PORTRAIT,
        },
      },
      "member-bren": {
        displayName: "Bren",
        characterId: "team-mandorlino-paladin",
        role: "player",
        character: {
          // A deliberately long synthetic name (AC-ZERO) — stresses the
          // No-Truncation wrap at the card's real DESKTOP width, not just 390px.
          name: assertNonEmptyString("Bren Ironbeard of the Thunderhold"),
          race: asRaceId("dwarf"),
          class: "Cleric",
          level: 8,
          ac: 18,
          hpMax: 60,
        },
      },
      // NON-NULLABILITY DEMO (dev-only, flag-gated): a member whose STALE snapshot
      // carries a CORRUPT (whitespace) hero name — the exact shape an old persisted
      // doc can take. The dev hub routes `makeDevCampaign()` through the SAME read
      // boundary the real Firestore read uses (`conformCampaignMembers`), which
      // REJECTS this snapshot: its `character` drops to `null`, so the party renders
      // this member in the normal "no character attached" state — never crashed,
      // never shown with an invented "Unnamed" name. Gated so it only appears in the
      // throwaway screenshot run. The `as` cast injects the corrupt shape past the
      // branded `NonEmptyString` invariant (exactly what an untrusted read can hold).
      ...(typeof window !== "undefined" &&
      window.localStorage.getItem("d20-dev-corrupt-member") === "1"
        ? {
            "member-corrupt": {
              displayName: "Wren",
              characterId: "stale",
              role: "player" as const,
              character: {
                name: "   ",
                race: "Elf",
                class: "Ranger",
                level: 4,
                ac: 14,
                hpMax: 30,
              },
            } as CampaignDoc["memberDetails"][string],
          }
        : {}),
    },
    status: "active",
    inviteCode: id,
    // cp stays 0 (a dimmed honest-blank): bright copper (--cur-cp) on the dark
    // .info-card is a borderline 4.26:1, just under AA — a pre-existing
    // design-system token limit (InventoryTab hits it too), not fixable here under
    // the immutable-CSS rule.
    treasury: { pp: 2, gp: 145, ep: 0, sp: 30, cp: 0 },
    // TREASURY-UX — a realistic running ledger that SUMS to the totals above
    // (200−60+20−15−5+5 = 145 gp; 2 pp; 30 sp), long enough (8 entries) that the
    // bounded latest-5 + "View all (8)" renders at rest, with old entries from
    // every member so undo-an-old-transaction is drivable in dev + the suites.
    treasuryLog: [
      {
        amount: 200,
        currency: "gp",
        type: "add",
        note: "Goblin hoard",
        by: "mock-uid",
        at: new Date("2026-04-18T21:00:00Z"),
      },
      {
        amount: 2,
        currency: "pp",
        type: "add",
        note: "Sold the dragon statuette",
        by: "member-mara",
        at: new Date("2026-04-19T18:30:00Z"),
      },
      {
        amount: 60,
        currency: "gp",
        type: "remove",
        note: "Healing potions ×3",
        by: "member-bren",
        at: new Date("2026-04-25T20:10:00Z"),
      },
      {
        amount: 30,
        currency: "sp",
        type: "add",
        note: "Kobold toll, refunded",
        by: "member-mara",
        at: new Date("2026-04-26T19:00:00Z"),
      },
      {
        amount: 20,
        currency: "gp",
        type: "add",
        note: "Fennick advance",
        by: "mock-uid",
        at: new Date("2026-05-01T17:45:00Z"),
      },
      {
        amount: 15,
        currency: "gp",
        type: "remove",
        note: "Inn & stabling",
        by: "member-bren",
        at: new Date("2026-05-01T22:20:00Z"),
      },
      {
        amount: 5,
        currency: "gp",
        type: "remove",
        note: "Temple donation",
        by: "member-mara",
        at: new Date("2026-05-02T11:00:00Z"),
      },
      {
        amount: 5,
        currency: "gp",
        type: "add",
        note: "Won a wager",
        by: "mock-uid",
        at: new Date("2026-05-02T22:30:00Z"),
      },
    ],
    // By DEFAULT the dev campaign rests on the calm party OVERVIEW (no encounter); the
    // `d20-dev-encounter` flag seeds a combat layer (begun OR gathering) — see
    // {@link makeDevEncounter}.
    encounter: makeDevEncounter(encounterDemo()),
    encounterInit: devEncounterInitSeed(),
  };
}

// ─── Dev-bypass topbar-pip seed (C4) ────────────────────────────────────────

/** The pip states the screenshot / a11y harness can seed (dev-bypass only). */
export type DevPipMode =
  | "needsroll"
  | "yourturn"
  | "actorturn"
  | "gathering"
  | "dm"
  | "multi";

/**
 * Which pip state to seed, read from the `d20-dev-pip` localStorage flag (set by the C4
 * shot harness before boot). `null` = no seed (the real resolution runs). Dev-bypass only —
 * its sole caller ({@link "@/features/campaigns/global-combat".GlobalCombatMount}) is gated
 * by `DEV_BYPASS_AUTH`, so this is tree-shaken from production.
 */
export function devPipMode(): DevPipMode | null {
  if (typeof window === "undefined") return null;
  const flag = window.localStorage.getItem("d20-dev-pip");
  const modes: DevPipMode[] = [
    "needsroll",
    "yourturn",
    "actorturn",
    "gathering",
    "dm",
    "multi",
  ];
  return modes.find((m) => m === flag) ?? null;
}

/** A PC pip entry for the dev seed (campaign `mock-1`, so `/campaigns/mock-1` reads as the
 *  encounter surface → the pill flips its destination to the hero). */
function devPcEntry(state: PipState, round: number, actorName: string | null): PipEntry {
  return {
    campaignId: "mock-1",
    campaignName: "The Starless Keep",
    role: "pc",
    state,
    round,
    heroName: "Coralino di Sanvaldo",
    characterId: "team-catalion-bard",
    actorName,
  };
}

/**
 * The deterministic dev pip model for `mode` (or `null` when unset). Lets the C4 harness
 * shoot every pip STATE — needs-roll / your-turn / actor-turn / gathering, the PC-less DM
 * one-way pip, and the multi-encounter chooser — with NO live combat-state plumbing, since
 * the pip renders purely off this published model. Tree-shaken from production.
 */
export function makeDevPip(mode: DevPipMode | null): PipModel | null {
  switch (mode) {
    case null:
      return null;
    case "needsroll":
      return { entries: [devPcEntry("needs-roll", 1, null)], primaryId: "mock-1" };
    case "yourturn":
      return { entries: [devPcEntry("your-turn", 3, null)], primaryId: "mock-1" };
    case "actorturn":
      return { entries: [devPcEntry("actor-turn", 3, "Goblin")], primaryId: "mock-1" };
    case "gathering":
      return { entries: [devPcEntry("gathering", 1, null)], primaryId: "mock-1" };
    case "dm":
      return {
        entries: [
          {
            campaignId: "mock-1",
            campaignName: "The Starless Keep",
            role: "dm",
            state: "actor-turn",
            round: 3,
            heroName: null,
            characterId: null,
            actorName: "Goblin",
          },
        ],
        primaryId: "mock-1",
      };
    case "multi":
      return {
        entries: [
          devPcEntry("your-turn", 3, null),
          {
            campaignId: "mock-2",
            campaignName: "Shadows over Thornhollow",
            role: "pc",
            state: "actor-turn",
            round: 7,
            heroName: "Bren Ironbeard",
            characterId: "team-mandorlino-paladin",
            actorName: "Gorvek",
          },
        ],
        primaryId: "mock-1",
      };
  }
}

// ─── Dev-bypass TURN-FLICKER replay (the End-Turn `your turn` flash regression) ─────
//
// A single-frame flicker is a RENDER-TIMING artifact that jsdom can't show, so the
// permanent proof is a REAL-Chromium e2e (`turn-indicator-flicker.spec.ts`). Under dev
// bypass there are no live Firestore listeners, so this REPLAYS the exact sequence of
// reconcile INPUTS a real End Turn produces — the optimistic hand-off, then two lagging
// reconciles (the status-source advancing first with a STALE pip; a stale status echo while
// the write is still in flight) — and the producer publishes each step. In `raw` mode it
// publishes the OLD behaviour (`set(rawStatus, rawPip)` directly), reproducing the flash; in
// `fixed` mode it publishes through `reconcileCombatPublish`, proving it gone. Tree-shaken
// from production (`DEV_BYPASS_AUTH` statically false).

/** How the turn-flicker harness publishes its scripted steps: `raw` = the OLD direct
 *  `set(rawStatus, rawPip)` (reproduces the flash); `fixed` = through `reconcileCombatPublish`
 *  (the fix). `null` = the harness is off. Read from `d20-dev-turn-flicker` (set before boot). */
export function turnFlickerReplayMode(): "raw" | "fixed" | null {
  if (typeof window === "undefined") return null;
  const flag = window.localStorage.getItem("d20-dev-turn-flicker");
  return flag === "raw" || flag === "fixed" ? flag : null;
}

/** One scripted publish in the replay — a raw (status, pip) pair plus the in-flight
 *  hand-off marker the producer's reconcile consults. */
export interface TurnFlickerStep {
  rawStatus: GlobalCombat | null;
  rawPip: PipModel | null;
  pending: PendingTurn | null;
}

/**
 * The scripted End-Turn reconcile sequence: it is the viewer's PC turn (a begun encounter
 * whose FROZEN order runs the PC → a goblin), the player presses End Turn, and two lagging
 * listeners reconcile before the write echoes. The OLD publish shows "your turn" again at
 * steps 3–4 (the flash); the reconciled publish never does. Deterministic — no live plumbing.
 */
export function makeTurnFlickerSteps(): TurnFlickerStep[] {
  const myId = "pc-mock-uid";
  const round = 3;
  const encounter: EncounterState = {
    round,
    currentCombatantId: myId,
    order: [myId, "monster-1"],
    epoch: 1,
    status: "active",
    combatants: [
      { kind: "pc", id: myId, memberUid: "mock-uid", characterId: "team-catalion-bard" },
      {
        kind: "monster",
        id: "monster-1",
        name: "Goblin",
        ac: 13,
        initiative: 12,
        conditions: [],
        maxHp: 7,
        tokens: [7],
      },
    ],
  };
  const view = {
    rows: [
      { id: myId, kind: "pc", name: "Coralino di Sanvaldo" },
      { id: "monster-1", kind: "monster", name: "Goblin" },
    ] as GlobalCombat["view"]["rows"],
    turnOrderIds: [myId, "monster-1"],
    currentId: myId,
  };
  const yourStatus: GlobalCombat = {
    campaignId: "mock-1",
    encounter,
    view,
    myId,
    characterId: "team-catalion-bard",
    gathering: false,
    isMyTurn: true,
    initiativeBonus: 3,
    initiativeRoll: 15,
    round,
  };
  const yourPip: PipModel = {
    entries: [devPcEntry("your-turn", round, null)],
    primaryId: "mock-1",
  };
  // The optimistic hand-off the sheet would publish, mirrored here so the raw path's step 2
  // reads actor-turn before the flash reverts it (the same shape `advanceGlobalCombat` yields).
  const advanced: GlobalCombat = {
    ...yourStatus,
    encounter: { ...encounter, currentCombatantId: "monster-1" },
    view: { ...view, currentId: "monster-1" },
    isMyTurn: false,
  };
  const advancedPip: PipModel = {
    entries: [devPcEntry("actor-turn", round, "Goblin")],
    primaryId: "mock-1",
  };
  const pending: PendingTurn = {
    campaignId: "mock-1",
    epoch: 1,
    fromId: myId,
    fromRound: round,
  };
  return [
    // 1) your turn.
    { rawStatus: yourStatus, rawPip: yourPip, pending: null },
    // 2) optimistic End Turn hand-off → actor-turn.
    { rawStatus: advanced, rawPip: advancedPip, pending: null },
    // 3) RACE A — the status source advanced first, the pip source is STILL stale (your-turn).
    { rawStatus: advanced, rawPip: yourPip, pending },
    // 4) RACE B — a stale status echo re-runs while the write is in flight (both stale).
    { rawStatus: yourStatus, rawPip: yourPip, pending },
    // 5) both sources reconciled → actor-turn, marker retired.
    { rawStatus: advanced, rawPip: advancedPip, pending: null },
  ];
}

/** The dev needs-roll initiative BONUS — a realistic non-zero so the roller popover reads
 *  "d20 +3 = …" rather than a degenerate +0. */
const DEV_NEEDS_ROLL_BONUS = 3;

/**
 * The deterministic dev {@link GlobalCombat} status published alongside the seeded pip. It
 * BACKS the loud RED needs-roll pip's inline {@link "@/features/campaigns/init-vital".InitVital}
 * roller (the ONE pip state that reads the live status — every other state navigates and needs
 * none) AND, for the turn-phase modes, drives the COCKPIT TURN BAND when the dev hero
 * (`team-catalion-bard`) is open — so the solo↔encounter band precedence (gathering / your-turn
 * / not-your-turn) is shootable + e2e-drivable with NO live combat-state plumbing. All modes
 * name `team-catalion-bard` as the PC, so opening a DIFFERENT hero reads pure solo (the
 * character-scoping carve-out). Non-`null` for the four turn/phase modes; `null` for the PC-less
 * `"dm"` and the `"multi"` chooser (their sheets aren't this fight's PC). Tree-shaken from
 * production. Rows carry a named monster so a not-your-turn actor cue resolves.
 */
export function makeDevGlobalCombat(mode: DevPipMode | null): GlobalCombat | null {
  if (mode === null || mode === "dm" || mode === "multi") return null;
  // The pointer per phase: nobody (gathering), the viewer's PC (your-turn), or the Goblin
  // (not-your-turn / the needs-roll pre-begin gathering, whose pip is red not quiet).
  const gathering = mode === "gathering" || mode === "needsroll";
  const myId = "pc-mock-uid";
  const currentId = gathering ? null : mode === "yourturn" ? myId : "monster-1";
  const round = gathering ? 1 : 3;
  const encounter: EncounterState = {
    round,
    currentCombatantId: currentId,
    epoch: 1,
    status: "active",
    combatants: [
      { kind: "pc", id: myId, memberUid: "mock-uid", characterId: "team-catalion-bard" },
      {
        kind: "monster",
        id: "monster-1",
        name: "Goblin",
        ac: 13,
        initiative: 14,
        conditions: [],
        maxHp: 7,
        tokens: [7],
      },
    ],
  };
  return {
    campaignId: "mock-1",
    encounter,
    view: {
      rows: [
        { id: myId, kind: "pc", name: "Coralino di Sanvaldo" },
        { id: "monster-1", kind: "monster", name: "Goblin" },
      ] as GlobalCombat["view"]["rows"],
      turnOrderIds: gathering ? [] : [myId, "monster-1"],
      currentId,
    },
    myId,
    characterId: "team-catalion-bard",
    gathering,
    isMyTurn: currentId === myId,
    initiativeBonus: DEV_NEEDS_ROLL_BONUS,
    initiativeRoll: mode === "needsroll" ? null : 14,
    round,
  };
}

// ─── Dev-bypass PIP ROLL-STATE scenarios (drive the REAL producer end-to-end) ───────
//
// Unlike {@link makeDevPip} (which short-circuits the producer with a FINISHED PipModel —
// enough to SHOOT a single pip state, but it never exercises the resolution wiring), these
// scenarios seed the producer's INPUTS — shared campaigns where the bypass viewer `mock-uid`
// is a PC, with their roll (or its absence) in the doc's `encounterInit` table — so
// `subscribeToSharedCampaigns` → `viewerActiveEncounters` → `buildPipModel` all run for real. That
// lets the permanent `combat-pip-needs-roll` e2e assert the ACTUAL rendered pip's roll-state
// (fresh→red · rolled→quiet · multi-encounter no-bleed), so reverting the per-encounter
// producer default fails a real test. Tree-shaken from production (`DEV_BYPASS_AUTH` false).

/** The pip roll-state scenarios the e2e harness can seed via the `d20-dev-pip-scenario`
 *  flag (set before boot). `fresh` = one fight the viewer still owes a roll for (red);
 *  `rolled` = one fight already rolled (quiet gathering); `multi` = two fights, one of each,
 *  to prove a pin switch never bleeds one row's state into the other. */
export type DevPipScenario = "fresh" | "rolled" | "multi";

/** Read the seeded pip roll-state scenario (dev-bypass only; `null` = the normal resolution
 *  runs, i.e. the standard dev campaign where `mock-uid` is a PC-less DM → no needs-roll). */
export function devPipScenario(): DevPipScenario | null {
  if (typeof window === "undefined") return null;
  const flag = window.localStorage.getItem("d20-dev-pip-scenario");
  return flag === "fresh" || flag === "rolled" || flag === "multi" ? flag : null;
}

/** The fixed epochs per scenario campaign — the `combat/state` roll-state below either
 *  MATCHES one (already rolled → quiet) or is absent/mismatched (owes a roll → red). */
const DEV_PIP_EPOCHS = {
  "pip-fresh": 5000,
  "pip-rolled": 5000,
  "pip-multi-a": 5100, // the needs-roll fight — LOWER epoch, so it defaults to SECONDARY
  "pip-multi-b": 5200, // the rolled fight — higher epoch, so it defaults to PRIMARY
} as const;

/** A gathering-phase scenario campaign where `mock-uid` is a player with an attached hero,
 *  seeded from the standard dev campaign's valid shape (treasury/log/dates) then overridden. */
function pipScenarioCampaign(id: keyof typeof DEV_PIP_EPOCHS, name: string): CampaignDoc {
  return {
    ...makeDevCampaign(id),
    id,
    name,
    dmUid: "pip-dm", // mock-uid is a pure PLAYER here (its own roll to make)
    members: ["pip-dm", "mock-uid"],
    memberDetails: {
      "pip-dm": { displayName: "GM", characterId: null, role: "dm" },
      // B32 — a realistic display name, never the raw English "You" (which leaked
      // untranslated Italian-locale text via `campaignHub.narratedBy`).
      "mock-uid": {
        displayName: "Rin",
        characterId: "team-catalion-bard",
        role: "player",
        character: {
          name: assertNonEmptyString("Coralino di Sanvaldo"),
          race: asRaceId("human"),
          class: "Bard",
          level: 8,
          ac: 15,
          hpMax: 52,
          portraitUrl: DEV_HERO_PORTRAIT,
        },
      },
    },
    // GATHERING phase (no current turn) — the pip reads gathering-vs-needs-roll purely off
    // the viewer's row in the `encounterInit` table below, never a turn pointer.
    encounter: {
      round: 1,
      currentCombatantId: null,
      epoch: DEV_PIP_EPOCHS[id],
      status: "active",
      combatants: [
        {
          kind: "pc",
          id: "pc-mock-uid",
          memberUid: "mock-uid",
          characterId: "team-catalion-bard",
        },
      ],
    },
    encounterInit: DEV_PIP_INIT_TABLES[id] ?? {},
  };
}

/** The viewer's SEEDED `encounterInit` roll table per scenario campaign: an entry =
 *  already rolled (quiet); an empty table = still owes a roll (red). The SAME campaign
 *  doc production derives from (the initiative SSOT — no subdoc roll state at all). */
const DEV_PIP_INIT_TABLES: Record<string, Record<string, number>> = {
  "pip-fresh": {}, // never rolled → red
  "pip-rolled": { "mock-uid": 12 },
  "pip-multi-a": {}, // owes a roll → red (the secondary row that must NOT bleed to quiet)
  "pip-multi-b": { "mock-uid": 12 },
};

/** The pip-scenario shared campaigns (or `null` when no scenario is seeded). Consumed by
 *  {@link "@/features/campaigns/campaign-io".subscribeToSharedCampaigns} under bypass. */
export function makeDevPipCampaigns(
  scenario: DevPipScenario | null
): CampaignDoc[] | null {
  switch (scenario) {
    case null:
      return null;
    case "fresh":
      return [pipScenarioCampaign("pip-fresh", "The Starless Keep")];
    case "rolled":
      return [pipScenarioCampaign("pip-rolled", "The Starless Keep")];
    case "multi":
      return [
        pipScenarioCampaign("pip-multi-a", "The Starless Keep"),
        pipScenarioCampaign("pip-multi-b", "Shadows over Thornhollow"),
      ];
  }
}

/** Resolve ONE campaign for a live read (the pip roller's payload via `useLiveEncounter`):
 *  the pip-scenario campaign when one matches the seeded scenario, else the standard dev
 *  campaign. Keeps the roller's live status (init bonus / max HP) consistent with the pip. */
export function resolveDevCampaign(id: string): CampaignDoc {
  const scenario = devPipScenario();
  if (scenario) {
    const match = makeDevPipCampaigns(scenario)?.find((c) => c.id === id);
    if (match) return match;
  }
  return makeDevCampaign(id);
}

/**
 * Build the dev encounter for a Party combat demo (dev-bypass only; tree-shaken from
 * production). The PCs are PURE REFERENCES (single source — golden rule 6): their name /
 * AC / HP / conditions / initiative are read LIVE from the member's char doc + projected
 * `combat/state` (in dev, the team-fixture session), never copied here. The genuine
 * encounter-owned state is the monsters: a Goblin ×3 group with one downed token (one
 * prone), a single Goblin Chief, and a HIDDEN Shadow (DM ambush — the `hidden` flag demos
 * the filter). IDs only — names are user content.
 *
 *   • `"begun"` — turns have started: the FROZEN order is set and the current turn sits on
 *     Coralino's card. Matches the live initiative sort (Shadow 16 · Goblin 14 · Boss 12 ·
 *     then the rolled PCs), so the displayed frozen order reads naturally.
 *   • `"gathering"` — the initiative-gathering phase: no order, no current turn, and the
 *     Goblin Chief is left UN-ROLLED (`initiative: null`), so the Begin-turns gate renders
 *     DISABLED with its "X/Y rolled" reason (C3 item 1).
 */
function makeDevEncounter(mode: EncounterDemoMode): CampaignDoc["encounter"] {
  if (mode === null) return null;
  const gathering = mode === "gathering";
  return {
    round: gathering ? 1 : 2,
    // Gathering = no current turn yet (the DM presses Begin-turns); begun = mid-fight.
    currentCombatantId: gathering ? null : "pc-member-mara",
    // The FROZEN turn order is set ONLY once turns begin; gathering leaves it unset (Begin
    // sorts the live order fresh). Begun: Shadow(16) · Goblin(14) · Boss(12) · then the
    // rolled PCs by initiative, current on Coralino (last) so Next wraps the round.
    ...(gathering
      ? {}
      : {
          order: [
            "monster-3",
            "monster-1",
            "monster-2",
            "pc-member-bren",
            "pc-member-mara",
          ],
        }),
    // A FIXED epoch so the dev harness is deterministic (never Date.now()). The PC combat
    // fixtures carry the matching `initiativeEpoch` so they read as rolled.
    epoch: 1,
    status: "active",
    combatants: [
      {
        kind: "pc",
        id: "pc-member-mara",
        memberUid: "member-mara",
        characterId: "team-catalion-bard",
      },
      {
        kind: "monster",
        id: "monster-1",
        name: "Goblin",
        ac: 13,
        initiative: 14,
        conditions: ["prone"],
        maxHp: 7,
        tokens: [7, 3, 0],
      },
      {
        kind: "monster",
        id: "monster-2",
        // Ad-hoc demo combatant (carries its own ac/initiative — not a bestiary
        // reference); a non-SRD label so it never collides with a real monster
        // name (goblin-boss is now an authored statblock — GR7 name-literal guard).
        name: "Goblin Chief",
        ac: 17,
        // Gathering demo: the Boss is the one combatant still UN-ROLLED, so the Begin-turns
        // gate is DISABLED with its rolled/total reason; begun: typed initiative 12.
        initiative: gathering ? null : 12,
        conditions: [],
        maxHp: 21,
        tokens: [21],
      },
      {
        kind: "monster",
        id: "monster-3",
        name: "Shadow",
        ac: 12,
        initiative: 16,
        conditions: [],
        maxHp: 16,
        tokens: [16],
        hidden: true,
      },
      {
        kind: "pc",
        id: "pc-member-bren",
        memberUid: "member-bren",
        characterId: "team-mandorlino-paladin",
      },
    ],
  };
}
