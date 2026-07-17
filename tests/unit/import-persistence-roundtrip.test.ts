/**
 * FULL persistence round-trip: minimal export → import → unified-codec Firestore
 * WRITE (`serializeCharacterEnvelope` + `buildCharacterCache`) → SRD-free roster
 * READ (`cacheToRosterDoc`).
 *
 * Regression for the import breakage (2026-06-08): an imported character rendered
 * with "AC 0", NO class label, no HP bar, and a `NaN:NaN` action log. The unified
 * codec stores `{ schema, build, state }` + a top-level SRD-free `cache`, so:
 *   - the import must compute the real `effectiveAC` (rehydrate leaves `ac = 0`);
 *   - the WRITE stamps the denormalized roster `cache` (effective ac + hp.max +
 *     speed + race id + classes[]) so the SRD-free roster never rehydrates;
 *   - the roster READ (`cacheToRosterDoc`) materializes the class/AC/HP/speed from
 *     the cache; and
 *   - the session READ (`sanitizeSession`) must normalize legacy `{msg,t}` log
 *     entries to the current `{text,ts}` shape.
 */
import { describe, it, expect } from "vitest";
import {
  primaryClassId,
  primarySubclassId,
  primaryClassName,
  primarySubclassName,
} from "@/lib/classes";
import { MOCK_CHARACTER } from "@/lib/mock";
import { serializeCharacter, importCharacter } from "@/lib/character-io";
import { serializeCharacterEnvelope } from "@/lib/character-codec";
import { buildCharacterCache, cacheToRosterDoc } from "@/lib/character-cache";
import { sanitizeCharacter } from "@/lib/sanitize-character";
import { sanitizeSession } from "@/lib/sanitize-session";
import type { CharacterDoc, SessionState } from "@/types/character";

/** A REAL v2 export of the canonical mock, with a LEGACY-shape log entry in state. */
function v2JsonWithLegacyLog(): string {
  const parsed = JSON.parse(serializeCharacter(MOCK_CHARACTER)) as {
    state: { log?: unknown[] };
  };
  parsed.state.log = [{ msg: "🌀 spent 1 ki", type: "log-damage", t: 1778434170975 }];
  return JSON.stringify(parsed);
}

describe("import → unified-codec write → SRD-free roster read (full persistence path)", () => {
  it("the roster sees class, subclass, a real AC, a real HP max, and a readable log", () => {
    const res = importCharacter(v2JsonWithLegacyLog());
    expect(res.success).toBe(true);
    if (!res.success) return;

    // FIX A — import computed the real effectiveAC (NOT rehydrate's 0 placeholder).
    expect(res.doc.character.ac).toBeGreaterThan(0);

    // The unified-codec WRITE: the `{ build, state }` envelope + the SRD-free roster
    // `cache`. The envelope stores classes by id only (no flat `class` projection);
    // the cache carries the denormalized roster fields (effective ac + hp.max + …).
    const envelope = serializeCharacterEnvelope({
      character: res.doc.character,
      session: res.doc.session,
    } as CharacterDoc);
    expect("class" in envelope.build).toBe(false);
    const cache = buildCharacterCache(res.doc.character, res.doc.session);
    expect(cache.hpMax).toBeGreaterThan(0);
    expect(cache.ac).toBeGreaterThan(0);

    // The SRD-free roster READ materializes the doc from the cache + state ALONE
    // (never parsing the build). The class/subclass LABELS derive from the cached
    // `classes[]` ids via the SRD-free helpers.
    const persisted = {
      cache,
      state: envelope.state,
    } as unknown as Record<string, unknown>;
    const rosterDoc = cacheToRosterDoc("x", persisted, {
      createdAt: new Date(0),
      updatedAt: new Date(0),
      portraitUrl: null,
      portraitCrop: null,
      shareId: null,
      status: "active",
    });
    // A valid cache (non-empty name) always yields a doc — narrow off `null`.
    if (!rosterDoc) throw new Error("expected a roster doc for a valid cache");
    const roster = rosterDoc.character;
    expect(primaryClassName(roster)).toBe("Bard");
    expect(primaryClassId(roster)).toBe("bard");
    // The subclass renders from its id via the SRD-free helper (store id, derive label).
    expect(primarySubclassId(roster)).toBeTruthy();
    expect(roster.ac).toBeGreaterThan(0);
    expect(roster.hp.max).toBeGreaterThan(0);

    // FIX C — the session READ normalizes the legacy `{msg,t}` log entry into a
    // `legacy` event (the bounded one-way read-normalization boundary): its frozen
    // text renders verbatim, so a pre-events-as-data user's history stays visible.
    const sess = sanitizeSession(res.doc.session);
    expect(sess.logEntries).toHaveLength(1);
    const ev = sess.logEntries[0]?.event;
    expect(ev?.kind).toBe("legacy");
    expect(ev?.kind === "legacy" && ev.text).toBe("🌀 spent 1 ki");
    expect(sess.logEntries[0]?.ts).toBe(1778434170975);
  });
});

describe("sanitizeCharacter normalizes classes[]; labels derive from the entry ids", () => {
  it("keeps the class entry and derives its display label from the id", () => {
    const out = sanitizeCharacter({
      classes: [{ classId: "monk", level: 3 }],
    }) as unknown as { classes: Array<{ classId: string }> };
    expect(out.classes[0]?.classId).toBe("monk");
    // The display label is DERIVED from the id, not stored.
    expect(primaryClassName(out as never)).toBe("Monk");
  });
  it("carries the subclass id on the entry; the label derives from it", () => {
    const out = sanitizeCharacter({
      classes: [{ classId: "wizard", subclassId: "evoker", level: 3 }],
    }) as unknown as { classes: Array<{ subclassId?: string }> };
    expect(out.classes[0]?.subclassId).toBe("evoker");
    expect(primarySubclassName(out as never)).toBe("Evoker");
  });
});

describe("sanitizeSession normalizes legacy log entries (events-as-data boundary)", () => {
  it("read-normalizes pre-events rows to a `legacy` event; keeps current-shape rows", () => {
    const out = sanitizeSession({
      logEntries: [
        // Oldest `{ msg, t }` and the intermediate `{ text, type, slot }` rows are
        // pre-events: each becomes a `legacy` event (frozen text + glyph/hue hints).
        { msg: "old", type: "log", t: 123 },
        { text: "new", type: "attack", ts: 456, slot: "action" },
        // A current structured row passes through verbatim.
        {
          event: { kind: "hp-damage", amount: 5, current: 3, max: 10 },
          ts: 789,
          id: "keep-me",
        },
      ],
    } as unknown as Partial<SessionState>);
    const [a, b, c] = out.logEntries;
    expect(a?.event).toMatchObject({ kind: "legacy", text: "old", legacyType: "log" });
    expect(a?.ts).toBe(123);
    expect(typeof a?.id).toBe("string"); // a missing id is regenerated
    expect(b?.event).toMatchObject({
      kind: "legacy",
      text: "new",
      legacyType: "attack",
      slot: "action",
    });
    expect(b?.ts).toBe(456);
    expect(c?.event).toEqual({ kind: "hp-damage", amount: 5, current: 3, max: 10 });
    expect(c?.id).toBe("keep-me");
    expect(c?.ts).toBe(789);
  });
  it("drops unsalvageable entries (no text/msg, or non-objects)", () => {
    const out = sanitizeSession({
      logEntries: [{ type: "log", t: 1 }, "junk", null],
    } as unknown as Partial<SessionState>);
    expect(out.logEntries).toHaveLength(0);
  });
});

describe("buildCharacterCache stamps the SRD-free roster projection", () => {
  it("stamps ac + hp.max + speed + raceId + classes[] from the full character", () => {
    const cache = buildCharacterCache(MOCK_CHARACTER.character, MOCK_CHARACTER.session);
    expect(cache.ac).toBe(
      MOCK_CHARACTER.character.acOverride ?? MOCK_CHARACTER.character.ac
    );
    expect(cache.hpMax).toBe(MOCK_CHARACTER.character.hp.max);
    expect(cache.speed).toBe(MOCK_CHARACTER.character.speed);
    expect(cache.raceId).toBe(MOCK_CHARACTER.character.race);
    // R4 — the multiclass `classes[]` (ids + levels) is the roster source of truth.
    expect(cache.classes).toEqual([
      { classId: "bard", subclassId: "college-of-lore", level: 9 },
    ]);
  });
});
