/**
 * member-snapshot — the ONE builder for the denormalized party-member snapshot
 * (`MemberCharacterSnapshot`) the campaign Party card reads.
 *
 * Why a seam (rule 6 — single source of truth): Firestore rules deny reading
 * another member's character doc, so the party renders a self-written SNAPSHOT
 * of each hero (name · classes · AC · HP · portrait). That snapshot's AC must be
 * the SAME effective AC the cockpit and roster show.
 *
 * TWO call shapes, distinguished AT THE TYPE LEVEL (Layer 2 — no runtime sniffing):
 *  • a FULL parsed {@link CharacterDoc} (the cockpit auto-save fan-out,
 *    `refreshAttachedSheets`) — we RE-DERIVE the AC via the grant-aware
 *    {@link effectiveAC}, so a stale stored `ac` can never leak (AC-ZERO, #58);
 *  • the SRD-free {@link RosterCharacterDoc} projection (the attach picker reads
 *    the roster list) — its `abilityScores`/`equipment` are absent, so
 *    `effectiveAC` is NOT EVEN CALLABLE on it (a compile error, by the distinct
 *    `RosterCharacter` type). We read its already-stamped `ac`. This is the
 *    structural cure for #115 ("can't attach my character"): the old code called
 *    `effectiveAC` over the omitted fields → it threw → the picker crashed. The
 *    type now makes that call impossible; the per-overload branch below is total.
 *
 * The hero NAME is a {@link NonEmptyString} on BOTH input shapes (the full
 * `CharacterData.name` and the projection's branded `name`), so the snapshot's
 * `name` is non-empty BY CONSTRUCTION — it passes straight through, never defaulted.
 * HP max + the `classes[]` breakdown are AUTHORITATIVE stored facts (the user's own
 * choices), so they pass through unchanged. A non-finite AC still shows as "—"
 * downstream (`displayAc`), never "CA 0".
 */
import type { CharacterDoc, ClassEntry } from "@/types/character";
import type { MemberCharacterSnapshot } from "@/types/campaign";
import type { RosterCharacterDoc } from "@/lib/character-cache";
import { effectiveAC, effectiveMaxHp } from "@/lib/aggregate-character";
import { asRaceId, resolveClassId, subclassIdByName } from "@/data/srd-names";

/**
 * Build the party snapshot from EITHER a FULL parsed character (the cockpit
 * auto-save fan-out — `effectiveAC` RE-DERIVES the AC, AC-ZERO seam #58) OR the
 * SRD-free roster PROJECTION (the attach picker — its already-stamped `ac` is read,
 * because `effectiveAC` can't aggregate over the omitted `abilityScores`/`equipment`
 * that crashed the picker, #115). The discriminated-union input makes that omission
 * a COMPILE constraint, not a runtime sniff; the branch below is total.
 */
export function buildMemberSnapshot(
  doc: CharacterDoc | RosterCharacterDoc
): MemberCharacterSnapshot {
  const c = doc.character;
  // The discriminant: the projection self-identifies (`projection: true`); a full
  // character has no such flag. Branch on the TYPE, never on a field's presence.
  const ac = "projection" in c ? c.ac : effectiveAC(c, doc.session);
  // D1 — like AC: the full-character path RE-DERIVES the effective max HP (stored base
  // + hp-flat boons + Aid); the projection reads its already-stamped `hp.max` (the
  // cache writer stamped `effectiveMaxHp`). Both paths yield the effective max — never
  // the understated stored base (rule 6).
  const hpMax = "projection" in c ? c.hp.max : effectiveMaxHp(c, doc.session);
  return {
    // The hero name is a `NonEmptyString` on both input shapes, so it slots straight
    // into the branded snapshot `name` — non-empty by construction, never defaulted.
    name: c.name,
    // Store the STABLE race ID (a RaceId, not a pre-localized name) so the party
    // identity line localizes reactively at render and follows a language flip. The
    // roster projection types `race` as a plain string; brand it at this boundary
    // (the minter, never a cast) so the snapshot is strictly a RaceId.
    race: asRaceId(c.race),
    // R4 — the `classes[]` breakdown is the source of truth for class + level.
    classes: c.classes,
    ac,
    hpMax,
    // The hero's face for the party card (Storage URL + crop live on the doc).
    portraitUrl: doc.portraitUrl,
    portraitCrop: doc.portraitCrop,
  };
}

/**
 * The `classes[]` for a party snapshot — the R4 source of truth when present, else
 * synthesized ONE-WAY from a pre-R4 snapshot's legacy `class`/`subclass`/`level`
 * (those denormalized caches refresh to `classes[]` on the member's next save). The
 * ONE reader every campaign surface (Party card, list-page level range) routes
 * through, so the identity line and the level total can never disagree (rule 6).
 */
export function snapshotClasses(snap: MemberCharacterSnapshot): ClassEntry[] {
  if (snap.classes?.length) return snap.classes;
  if (!snap.class) return [];
  const entry: ClassEntry = {
    classId: resolveClassId(snap.class),
    level: snap.level && snap.level >= 1 ? snap.level : 1,
  };
  const subId = snap.subclass ? subclassIdByName(snap.subclass) : "";
  if (subId) entry.subclassId = subId;
  return [entry];
}

/** A party snapshot's TOTAL level (sum of {@link snapshotClasses} levels, or the
 *  legacy `level` when even the synthesis yields nothing). */
export function snapshotTotalLevel(snap: MemberCharacterSnapshot): number {
  const classes = snapshotClasses(snap);
  if (classes.length) return classes.reduce((sum, e) => sum + e.level, 0);
  return snap.level ?? 0;
}
