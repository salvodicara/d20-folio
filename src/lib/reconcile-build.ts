/**
 * Build-choice reconciliation — keep the WHOLE sheet consistent after an edit.
 *
 * The Bio tab edits a character's irreducible CHOICES (species · class · subclass
 * · level · background · feats). Many sheet values are pure functions of those
 * choices (saving throws, hit die, spell slots, the spellcasting block, the
 * class/subclass feature set, species Speed), and several PICKS are scoped to a
 * specific class/subclass/LEVEL (Fighter maneuvers, Warlock invocations,
 * Sorcerer metamagic, weapon masteries, fighting styles, Expertise, ASI-level
 * feats, the chosen spell list). When a choice changes the engine must RE-DERIVE
 * the dependent values and DROP the now-invalid picks — or the sheet silently
 * shows stale data (old saves, old features, ghost maneuvers, a maneuver Fighter
 * subclass on a level-2 Fighter, 5th-level spells on a level-4 Wizard).
 *
 * LEVEL DOWN (owner mandate 2026-06-12): a level decrease makes every choice
 * recorded ABOVE the new level STALE. The rules here are SHRINK-BOUNDED: a pick
 * family loses at most what the removed levels granted (entitlement(prev) −
 * entitlement(next)), dropped from the END (latest picks first), so a manual
 * deviation the player added on purpose survives (override-first, golden rule 8).
 * Absolute invalidity (a subclass below its gain level, a spell above the max
 * castable slot level, an invocation whose level prerequisite fails) is pruned
 * outright. Baked ability-score increases canNOT be auto-reverted (no record of
 * which ability each ASI raised) — the confirm dialog tells the player.
 *
 * R4 — `classes[]` is the source of truth. Per-class picks live ON the owning
 * entry, so the capability-scoped resets and the entitlement clamps read/write
 * through each entry (multiclass per-class level edits reconcile per entry).
 *
 * Pure + Firebase-free (composes the inference seam + the feature builders).
 */
import type {
  CharacterData,
  ClassEntry,
  SessionState,
  SrdFeatureRef,
  SrdSpellRef,
  CustomFeature,
  CustomSpell,
} from "@/types/character";
import { classTableIndex, classFeatures, getSubclassFeatures } from "@/data/classes";
import { FEATS_BY_ID } from "@/data/feats";
import { getSpellById } from "@/data/spells";
import {
  inferSavingThrows,
  inferHitDie,
  inferSpellcasting,
  inferSpeed,
  inferHpMax,
  inferFeatures,
} from "@/lib/character-infer";
import {
  getClasses,
  primaryClassEntry,
  totalLevel,
  classEntryLevel,
} from "@/lib/classes";
import { deriveSpellSlots, applySlotMaxOverrides } from "@/lib/multiclass-slots";
import { slotUsageKey } from "@/lib/cast-options";
import { subclassSpellcastingState } from "@/lib/subclass-spellcasting";
import { syncOriginFeats } from "@/lib/character-build";
import { maneuversKnownAt } from "@/lib/maneuver-pick";
import {
  invocationsKnownAt,
  minWarlockLevelFor,
  requiredInvocationIds,
  listInvocations,
} from "@/lib/invocation-pick";
import { metamagicKnownAt } from "@/lib/metamagic-pick";
import { weaponMasteryCount } from "@/lib/weapon-mastery-pick";
import { isExpertisePlaceholder, EXPERTISE_PICKS_PER_GRANT } from "@/lib/expertise-pick";
import { isFightingStylePlaceholder } from "@/lib/fighting-style";
import {
  effectiveAlwaysPreparedEntries,
  type AlwaysPreparedEntry,
} from "@/lib/expanded-spells";
import { widenedSpellListsAtLevel } from "@/lib/feat-spell-choices";
import { hpPerLevelGrantBonus } from "@/lib/level-up";

/** Every class/subclass FEATURE id across the SRD — used to drop the OLD class's
 *  features from `features[]` so the new class's set replaces them cleanly. */
const CLASS_FEATURE_IDS = new Set(classFeatures.map((f) => f.id));

/** The per-entry pick keys (all five ride the owning {@link ClassEntry}). */
const ENTRY_PICK_KEYS = [
  "weaponMasteries",
  "metamagicChoices",
  "invocationChoices",
  "maneuverChoices",
  "fightingStyles",
] as const;

/**
 * Rebuild `features[]` for the current classes/subclasses/levels: the freshly-
 * derived class+subclass feature set (across ALL entries) FIRST, then every
 * NON-class entry preserved verbatim (chosen feats, species traits, custom). Dropping
 * by `CLASS_FEATURE_IDS` removes a previous class's features so they can't linger.
 */
function rebuildClassFeatures(
  classes: ClassEntry[],
  features: ReadonlyArray<SrdFeatureRef | CustomFeature>
): Array<SrdFeatureRef | CustomFeature> {
  const derived = inferFeatures(classes);
  const derivedIds = new Set(derived.map((f) => f.srdId));
  const kept = features.filter((f) => {
    if ("custom" in f) return true; // custom — always keep
    if (CLASS_FEATURE_IDS.has(f.srdId)) return false; // a class feature — rebuilt below
    return !derivedIds.has(f.srdId); // feats / species traits — keep (no dup)
  });
  return [...derived, ...kept];
}

// ─── Entitlement counters (what the class tables grant AT a level) ───────────

/** ASI/feat slots earned: the count of `asi: true` table rows at/below each
 *  entry's level (2024: the L19 Epic Boon is modelled as an ASI level too). */
function asiEntitlement(classes: ReadonlyArray<ClassEntry>): number {
  let n = 0;
  for (const e of classes) {
    const table = classTableIndex.get(e.classId);
    if (!table) continue;
    n += table.levels.filter((l) => l.asi === true && l.level <= e.level).length;
  }
  return n;
}

/** Expertise picks earned: 2 per expertise-placeholder grant at/below each entry's
 *  level (Bard L2+L9, Rogue L1+L6) + any `choice-expertise` feat grants present. */
function expertiseEntitlement(
  classes: ReadonlyArray<ClassEntry>,
  features: ReadonlyArray<SrdFeatureRef | CustomFeature>
): number {
  let n = 0;
  for (const e of classes) {
    const table = classTableIndex.get(e.classId);
    if (!table) continue;
    for (const row of table.levels) {
      if (row.level > e.level) continue;
      n +=
        row.featureIds.filter((id) => isExpertisePlaceholder(id)).length *
        EXPERTISE_PICKS_PER_GRANT;
    }
  }
  for (const f of features) {
    if ("custom" in f) continue;
    for (const g of FEATS_BY_ID.get(f.srdId)?.grants ?? []) {
      if (g.type === "choice-expertise") n += g.amount;
    }
  }
  return n;
}

/**
 * Fighting-style slots an entry is granted at/below its level — the base class
 * table's placeholder rows (Fighter L1 / Paladin L2 / Ranger L2) PLUS any
 * subclass-feature placeholder it has reached. The Champion's "Additional Fighting
 * Style" (`fighter-champion-additional-fighting-style`, L7) is a SUBCLASS feature,
 * not a base-table row, so it must be counted off the entry's `subclassId` (golden
 * rule 7 — branch on the stable id, never a display string) or a Champion's 2nd
 * style would be entitlement-clamped away on a level edit.
 */
export function fightingStyleEntitlement(entry: ClassEntry): number {
  const table = classTableIndex.get(entry.classId);
  if (!table) return 0;
  let n = 0;
  for (const row of table.levels) {
    if (row.level > entry.level) continue;
    n += row.featureIds.filter((id) => isFightingStylePlaceholder(id)).length;
  }
  if (entry.subclassId) {
    for (const f of getSubclassFeatures(entry.classId, entry.subclassId)) {
      if (f.level <= entry.level && isFightingStylePlaceholder(f.id)) n += 1;
    }
  }
  return n;
}

/** Cantrip budget across all entries (class-table column, or the third-caster
 *  subclass progression for Eldritch Knight / Arcane Trickster). */
function cantripBudget(classes: ReadonlyArray<ClassEntry>): number {
  let n = 0;
  for (const e of classes) {
    const row = classTableIndex.get(e.classId)?.levels.find((l) => l.level === e.level);
    if (row?.cantripsKnown != null) {
      n += row.cantripsKnown;
      continue;
    }
    const sub = subclassSpellcastingState(e.classId, e.subclassId, e.level);
    if (sub) n += sub.cantripsMax;
  }
  return n;
}

/** The union of class-spell-list ids the build may legally draw from: each
 *  entry's own list, widened by any active pool-widener grant (Bard Magical
 *  Secrets at 10+), plus a third-caster subclass's list (EK/AT → wizard). */
function spellListUnion(classes: ReadonlyArray<ClassEntry>): Set<string> {
  const union = new Set<string>();
  for (const e of classes) {
    for (const id of widenedSpellListsAtLevel(e.classId, e.level, e.subclassId)) {
      union.add(id);
    }
    const sub = subclassSpellcastingState(e.classId, e.subclassId, e.level);
    if (sub) union.add(sub.spellList);
  }
  return union;
}

/** Ids of an always-prepared entry list. */
function alwaysPreparedIds(entries: ReadonlyArray<AlwaysPreparedEntry>): Set<string> {
  return new Set(entries.map((e) => (typeof e === "string" ? e : e.spellId)));
}

/**
 * SHRINK-BOUNDED tail clamp: drop from the END at most what the entitlement
 * shrink justifies — `min(over-budget, entitlement lost)`. A deliberate manual
 * deviation (more picks than the budget ever allowed) is preserved verbatim.
 */
function clampTail<T>(arr: ReadonlyArray<T>, entNext: number, entPrev: number): T[] {
  const drop = Math.min(
    Math.max(0, arr.length - entNext),
    Math.max(0, entPrev - entNext)
  );
  return drop > 0 ? arr.slice(0, arr.length - drop) : [...arr];
}

/** Write a (possibly clamped) pick array back onto an entry — empty deletes the key. */
function setPick(
  entry: ClassEntry,
  key: (typeof ENTRY_PICK_KEYS)[number],
  ids: string[]
): void {
  if (ids.length > 0) {
    entry[key] = ids;
    return;
  }
  // Static per-key deletes (the no-dynamic-delete lint rule).
  switch (key) {
    case "weaponMasteries":
      delete entry.weaponMasteries;
      break;
    case "metamagicChoices":
      delete entry.metamagicChoices;
      break;
    case "invocationChoices":
      delete entry.invocationChoices;
      break;
    case "maneuverChoices":
      delete entry.maneuverChoices;
      break;
    case "fightingStyles":
      delete entry.fightingStyles;
      break;
  }
}

/**
 * Reconcile a character after a build-choice edit. `prev` is the character before
 * the edit, `next` is `{ ...prev, ...partial }` (the edit already applied). Returns
 * a fresh, fully-consistent `CharacterData`; never mutates its inputs.
 */
export function reconcileBuildChoices(
  prev: CharacterData,
  next: CharacterData
): CharacterData {
  const c: CharacterData = { ...next, classes: getClasses(next).map((e) => ({ ...e })) };

  const prevClasses = getClasses(prev);
  const prevPrimary = primaryClassEntry(prev);
  const inputPrimary = primaryClassEntry(c);
  const classChanged = prevPrimary.classId !== inputPrimary.classId;
  const subclassChanged =
    (prevPrimary.subclassId ?? "") !== (inputPrimary.subclassId ?? "");
  const levelChanged = totalLevel(prev) !== totalLevel(c);
  const raceChanged = prev.race !== c.race;
  const scopeChanged = classChanged || subclassChanged || levelChanged;
  // True when a CLASS was genuinely added/removed/replaced (not a mere level edit
  // that flips which entry is "primary") — the gate for the hard resets.
  const classSetChanged =
    [...prevClasses.map((e) => e.classId)].sort().join("|") !==
    [...c.classes.map((e) => e.classId)].sort().join("|");

  // ── Subclass validity (LEVEL DOWN): an entry whose level fell below the class's
  //    subclass-gain level can no longer have one — clear it BEFORE features/slots
  //    derive so everything downstream sees the corrected build.
  if (scopeChanged) {
    for (const e of c.classes) {
      const table = classTableIndex.get(e.classId);
      if (e.subclassId && table && e.level < table.subclassLevel) {
        delete e.subclassId;
      }
    }
  }

  const primary = primaryClassEntry(c);
  const table = classTableIndex.get(primary.classId);

  // ── Class-fixed fields (re-derive only on a CLASS change; a homebrew class has
  //    no table → leave stored). Saving throws are class-fixed but ALSO manually
  //    toggleable, so they reset on a class change and persist otherwise.
  if (classChanged && table) {
    c.savingThrows = inferSavingThrows(primary);
    c.hitDieType = inferHitDie(primary);
  }
  // The chosen spell list belongs to a class that is GONE — clear it; the player
  // re-picks for the new class (subclass always-prepared spells re-infer at
  // render). A level edit that merely flips the primary entry never wipes.
  if (classSetChanged && c.spells.length > 0) c.spells = [];

  // ── Spell slots + spellcasting block — ONE derivation seam (`deriveSpellSlots`)
  //    for single-class, multiclass, Pact Magic and third-caster subclasses, so a
  //    Bio level edit can never drop the Warlock's `pactMagic` flag or keep an
  //    Eldritch Knight's slots below the subclass level.
  if (scopeChanged) {
    const derivedNext = deriveSpellSlots(c.classes);
    const derivedPrev = deriveSpellSlots(prevClasses);
    // RA-33 — re-apply the durable per-level count overrides onto the fresh
    // derivation, so a homebrew slot count survives a level-only Bio edit. The
    // override DROPS on a class change (stale — a new class casts differently),
    // mirroring the DC / attack / preparedMax overrides below.
    const slotOverrides = classChanged ? undefined : prev.spellcasting?.slotMaxOverrides;
    if (derivedNext.length > 0)
      c.spellSlots = applySlotMaxOverrides(derivedNext, slotOverrides);
    else if (classChanged || derivedPrev.length > 0) c.spellSlots = [];
    // else keep stored (manual slots on a build the engine derives none for)

    const inferredSc = inferSpellcasting(primary);
    const subSc = inferredSc
      ? null
      : subclassSpellcastingState(primary.classId, primary.subclassId, primary.level);
    if (inferredSc) {
      // Preserve the player's DC / attack / preparedMax OVERRIDES unless the class
      // itself changed (a new class casts differently — the old deltas are stale).
      const prevSc = classChanged ? null : prev.spellcasting;
      c.spellcasting = {
        ...inferredSc,
        saveDCOverride: prevSc ? prevSc.saveDCOverride : null,
        attackBonusOverride: prevSc ? prevSc.attackBonusOverride : null,
        ...(prevSc?.preparedMaxOverride != null
          ? { preparedMaxOverride: prevSc.preparedMaxOverride }
          : {}),
        ...(prevSc?.slotMaxOverrides && Object.keys(prevSc.slotMaxOverrides).length > 0
          ? { slotMaxOverrides: prevSc.slotMaxOverrides }
          : {}),
      };
    } else if (subSc) {
      // Third-caster subclass (Eldritch Knight / Arcane Trickster) — re-derive the
      // block at the entry's level, preserving the same overrides.
      const prevSc = classChanged ? null : prev.spellcasting;
      c.spellcasting = {
        ability: subSc.ability,
        preparedCaster: true,
        preparedMax: subSc.preparedMax,
        saveDCOverride: prevSc ? prevSc.saveDCOverride : null,
        attackBonusOverride: prevSc ? prevSc.attackBonusOverride : null,
        ...(prevSc?.preparedMaxOverride != null
          ? { preparedMaxOverride: prevSc.preparedMaxOverride }
          : {}),
        ...(prevSc?.slotMaxOverrides && Object.keys(prevSc.slotMaxOverrides).length > 0
          ? { slotMaxOverrides: prevSc.slotMaxOverrides }
          : {}),
      };
    } else if (
      classChanged ||
      subclassSpellcastingState(
        prevPrimary.classId,
        prevPrimary.subclassId,
        prevPrimary.level
      ) !== null
    ) {
      // The new build is not a caster: a class change, or a subclass-caster that
      // lost its casting (EK de-leveled below the subclass level) → no block.
      c.spellcasting = null;
    }
    // else keep stored (homebrew caster the engine can't derive)
  }

  // ── Feature set — rebuild the class/subclass features for the new class /
  //    subclass / level, preserving chosen feats + species traits + custom.
  if (scopeChanged) {
    c.features = rebuildClassFeatures(c.classes, c.features);

    // Jack of All Trades half-proficiency is DERIVED from the feature at render
    // (#57) — never stored — so there is nothing to re-derive on a build change.
    // Defensively strip any stray baked `halfProficiency` (a not-yet-migrated
    // doc) so stored `skills` stays choices-only.
    const skills: CharacterData["skills"] = {};
    for (const [id, prof] of Object.entries(c.skills)) {
      if (prof !== "halfProficiency") skills[id] = prof;
    }
    c.skills = skills;
  }

  // ── Capability-scoped picks (per entry): clear any pick the entry's build can no
  //    longer have at all. Idempotent — a build that still supports a pick keeps it.
  //    Operates directly on `c.classes` entries (the stored objects), never on the
  //    normalized copies `primaryClassEntry` returns.
  for (const e of c.classes) {
    if (classEntryLevel(prev, e.classId) === 0) {
      // A class this character did NOT have before — entry-scoped picks from the
      // replaced class can't carry over; the new class re-grants its own.
      for (const key of ENTRY_PICK_KEYS) setPick(e, key, []);
      continue;
    }
    if (e.subclassId !== "battle-master") delete e.maneuverChoices;
    if (e.classId !== "warlock") delete e.invocationChoices;
    if (e.classId !== "sorcerer") delete e.metamagicChoices;
  }

  // ── LEVEL-DOWN entitlement clamps (shrink-bounded, latest picks dropped first).
  //    Gated off a class-set change: replacing a class already hard-reset above,
  //    and the owner-pinned rule for class swaps is "explicit picks survive".
  const removedFeatIds = new Set<string>();
  if (scopeChanged && !classSetChanged) {
    for (const e of c.classes) {
      const prevLvl = classEntryLevel(prev, e.classId);

      if (e.subclassId === "battle-master" && e.maneuverChoices?.length) {
        setPick(
          e,
          "maneuverChoices",
          clampTail(
            e.maneuverChoices,
            maneuversKnownAt(e.level),
            maneuversKnownAt(prevLvl)
          )
        );
      }
      if (e.classId === "warlock" && e.invocationChoices?.length) {
        // Absolute level prerequisites first ("Level 5+ Warlock"), then the
        // shrink-bounded count clamp, then a fixpoint for named-invocation
        // prerequisites (dropping a prerequisite drops its dependents).
        const prereqById = new Map(
          listInvocations().map((inv) => [inv.id, inv.prerequisite])
        );
        let kept = e.invocationChoices.filter((id) => {
          const min = minWarlockLevelFor(prereqById.get(id) ?? "");
          return !(min > 0 && e.level < min);
        });
        kept = clampTail(kept, invocationsKnownAt(e.level), invocationsKnownAt(prevLvl));
        let changed = true;
        while (changed) {
          changed = false;
          const have = new Set(kept);
          kept = kept.filter((id) => {
            const ok = requiredInvocationIds(prereqById.get(id) ?? "").every((r) =>
              have.has(r)
            );
            if (!ok) changed = true;
            return ok;
          });
        }
        setPick(e, "invocationChoices", kept);
      }
      if (e.classId === "sorcerer" && e.metamagicChoices?.length) {
        setPick(
          e,
          "metamagicChoices",
          clampTail(
            e.metamagicChoices,
            metamagicKnownAt(e.level),
            metamagicKnownAt(prevLvl)
          )
        );
      }
      if (e.weaponMasteries?.length) {
        // The Weapon Master FEAT's +1 slot rides the PRIMARY entry, so the clamp
        // bound on that entry includes it (a feat-granted mastery is never clamped
        // away on level-down, since the feat — not the class level — grants it).
        const isPrimary = e.classId === primary.classId && e.level === primary.level;
        setPick(
          e,
          "weaponMasteries",
          clampTail(
            e.weaponMasteries,
            weaponMasteryCount(c, e.classId, e.level, { isPrimary }),
            weaponMasteryCount(c, e.classId, prevLvl, { isPrimary })
          )
        );
      }
      if (e.fightingStyles?.length) {
        setPick(
          e,
          "fightingStyles",
          clampTail(
            e.fightingStyles,
            fightingStyleEntitlement(e),
            fightingStyleEntitlement({ ...e, level: prevLvl })
          )
        );
      }
    }

    // ASI-level feats (general + epic-boon): the count of `asi` rows reached is
    // the slot budget; lost levels take their LAST-taken feats with them. A feat's
    // downstream picks fall too: its `choice-spell` refs are traced by
    // `freeCastSource.sourceId` (= the feat id) and pruned below; its inferable
    // always-prepared spells fall out of the grant diff below.
    const entNext = asiEntitlement(c.classes);
    const entPrev = asiEntitlement(prevClasses);
    const leveled = c.features.filter(
      (f): f is SrdFeatureRef =>
        !("custom" in f) &&
        ["general", "epic-boon"].includes(FEATS_BY_ID.get(f.srdId)?.category ?? "")
    );
    const keptFeats = new Set(clampTail(leveled, entNext, entPrev).map((f) => f.srdId));
    for (const f of leveled) {
      if (!keptFeats.has(f.srdId)) removedFeatIds.add(f.srdId);
    }
    if (removedFeatIds.size > 0) {
      c.features = c.features.filter(
        (f) => "custom" in f || !removedFeatIds.has(f.srdId)
      );
    }

    // Fighting-style FEAT refs in features[] mirror the per-entry pick — same budget.
    const fsEntNext = c.classes.reduce((n, e) => n + fightingStyleEntitlement(e), 0);
    const fsEntPrev = prevClasses.reduce((n, e) => n + fightingStyleEntitlement(e), 0);
    const fsRefs = c.features.filter(
      (f): f is SrdFeatureRef =>
        !("custom" in f) && FEATS_BY_ID.get(f.srdId)?.category === "fighting-style"
    );
    const keptStyles = new Set(
      clampTail(fsRefs, fsEntNext, fsEntPrev).map((f) => f.srdId)
    );
    if (keptStyles.size < fsRefs.length) {
      c.features = c.features.filter(
        (f) =>
          "custom" in f ||
          FEATS_BY_ID.get(f.srdId)?.category !== "fighting-style" ||
          keptStyles.has(f.srdId)
      );
    }

    // Expertise: demote the LAST expertise picks back to proficient when the
    // grant budget shrank (the proficiency itself was real — only the doubling
    // came from the lost level).
    const expNext = expertiseEntitlement(c.classes, c.features);
    const expPrev = expertiseEntitlement(prevClasses, prev.features);
    const expertiseKeys = Object.entries(c.skills)
      .filter(([, v]) => v === "expertise")
      .map(([k]) => k);
    const keptExpertise = new Set(clampTail(expertiseKeys, expNext, expPrev));
    if (keptExpertise.size < expertiseKeys.length) {
      const skills: CharacterData["skills"] = {};
      for (const [id, prof] of Object.entries(c.skills)) {
        skills[id] = prof === "expertise" && !keptExpertise.has(id) ? "proficient" : prof;
      }
      c.skills = skills;
    }
  }

  // ── Spell-list pruning (LEVEL DOWN / subclass loss). Ordered: feat-traced refs,
  //    stale granted always-prepared, above-max-slot, off-list (lost widening),
  //    cantrip budget, prepared budget, wizard L18/L20 flags.
  if (scopeChanged && !classSetChanged && c.spells.length > 0) {
    const prevAP = alwaysPreparedIds(effectiveAlwaysPreparedEntries(prev));
    const nextAP = alwaysPreparedIds(effectiveAlwaysPreparedEntries(c));
    const unionPrev = spellListUnion(prevClasses);
    const unionNext = spellListUnion(c.classes);
    const maxSlot = c.spellSlots.reduce((m, s) => Math.max(m, s.level), 0);

    const isPlain = (s: SrdSpellRef): boolean =>
      !s.alwaysPrepared && s.freeCastSource == null && !s.speciesSpellAbility;

    let spells: Array<SrdSpellRef | CustomSpell> = c.spells.filter((s) => {
      if ("custom" in s) return true; // homebrew — never pruned
      // 1. A removed feat takes its granted spells with it. The stamped
      //    `freeCastSource.sourceId` is now the PER-SPELL tracker key
      //    `${featId}:${spellId}`, so trace the feat by its prefix (the bare feat
      //    id `removedFeatIds` holds) up to the first `:`.
      if (
        s.freeCastSource &&
        removedFeatIds.has(
          s.freeCastSource.sourceId.split(":")[0] ?? s.freeCastSource.sourceId
        )
      ) {
        return false;
      }
      const data = getSpellById(s.srdId);
      // 2. A granted always-prepared spell the new build no longer grants.
      if (s.alwaysPrepared && prevAP.has(s.srdId) && !nextAP.has(s.srdId)) return false;
      if (!data || !isPlain(s)) return true; // unknown id / feat- or species-bound — keep
      // 3. Above the max castable slot level (RAW: unknowable, uncastable).
      if (data.level > maxSlot) return false;
      // 4. Off-list pick whose widening was LOST (Magical Secrets below Bard 10,
      //    a third-caster's wizard-list spells below the subclass level). Bounded:
      //    only spells the PREVIOUS build's lists allowed are touched — an off-list
      //    spell the player added as a deviation stays a deviation.
      const onNext = data.classes.some((cl) => unionNext.has(cl));
      const onPrev = data.classes.some((cl) => unionPrev.has(cl));
      if (!onNext && onPrev) return false;
      return true;
    });

    // 5. Cantrip budget (shrink-bounded, drop the LAST plain cantrips).
    const cantripsNext = cantripBudget(c.classes);
    const cantripsPrev = cantripBudget(prevClasses);
    const plainCantrips = spells.filter(
      (s): s is SrdSpellRef =>
        !("custom" in s) && isPlain(s) && getSpellById(s.srdId)?.level === 0
    );
    const keptCantrips = new Set(
      clampTail(plainCantrips, cantripsNext, cantripsPrev).map((s) => s.srdId)
    );
    if (keptCantrips.size < plainCantrips.length) {
      spells = spells.filter(
        (s) =>
          "custom" in s ||
          !isPlain(s) ||
          getSpellById(s.srdId)?.level !== 0 ||
          keptCantrips.has(s.srdId)
      );
    }

    // 6. Prepared budget (shrink-bounded): UNPREPARE the last over-budget prepared
    //    spells — they stay on the list (still legal to know), just not prepared.
    const effPrepared = (sc: CharacterData["spellcasting"]): number =>
      sc ? (sc.preparedMaxOverride ?? sc.preparedMax) : 0;
    const prepNext = effPrepared(c.spellcasting);
    const prepPrev = effPrepared(prev.spellcasting);
    const preparedCount = spells.filter(
      (s) => !("custom" in s) && s.prepared && !s.alwaysPrepared
    ).length;
    let toUnprepare = Math.min(
      Math.max(0, preparedCount - prepNext),
      Math.max(0, prepPrev - prepNext)
    );
    if (toUnprepare > 0) {
      for (let i = spells.length - 1; i >= 0 && toUnprepare > 0; i--) {
        const s = spells[i];
        if (s && !("custom" in s) && s.prepared && !s.alwaysPrepared) {
          spells[i] = { ...s, prepared: false };
          toUnprepare--;
        }
      }
    }

    // 7. Wizard Spell Mastery (L18) / Signature Spell (L20) flags below their levels.
    const wizardLevel = classEntryLevel(c, "wizard");
    spells = spells.map((s) => {
      if ("custom" in s) return s;
      if (
        (s.wizardSpellMastery && wizardLevel < 18) ||
        (s.wizardSignatureSpell && wizardLevel < 20)
      ) {
        const rest: SrdSpellRef = { ...s };
        if (wizardLevel < 18) delete rest.wizardSpellMastery;
        if (wizardLevel < 20) delete rest.wizardSignatureSpell;
        return rest;
      }
      return s;
    });

    c.spells = spells;
  }

  // ── Max HP — adjust by the INFERRED delta of the level change (symmetric: a Bio
  //    level edit up adds the same average the level-down subtracts, so a mistyped
  //    level round-trips losslessly). The player's deviation from the inferred
  //    average (rolled HP, manual edits) is preserved verbatim. Class swaps leave
  //    HP user-owned (unchanged — existing behavior).
  if (!classSetChanged && levelChanged) {
    const conScore = c.abilityScores.CON;
    const inferredDelta =
      inferHpMax(c.classes, conScore) - inferHpMax(prevClasses, conScore);
    const perLevel = hpPerLevelGrantBonus(c).bonus;
    const levelsDelta = totalLevel(c) - totalLevel(prev);
    c.hp = { max: Math.max(1, c.hp.max + inferredDelta + perLevel * levelsDelta) };
  }

  // ── A level DECREASE invalidates the level-up checklist (it described levels
  //    the character no longer has).
  if (totalLevel(c) < totalLevel(prev) && c.levelUpChecklist != null) {
    c.levelUpChecklist = null;
  }

  // ── Species Speed — re-derive on a species change (a manual Speed survives every
  //    other edit).
  if (raceChanged) {
    const speed = inferSpeed(c);
    if (speed) c.speed = speed;
  }

  // ── Origin feats projection (background / species-feat changes) — the existing
  //    single-source helper keeps `features[]` in sync with the build choices.
  return syncOriginFeats(c);
}

// ─── Session reconciliation ───────────────────────────────────────────────────

/**
 * Reconcile the PLAY state after a build edit: the session must never reference
 * capacity or content the new build lacks. Clamps current HP / hit-dice-used /
 * per-level slot uses to the new maxima, drops slot-use rows for slot levels that
 * no longer exist, clears Concentration when it names a spell the edit removed
 * (matched locale-free across every catalogue language), and prunes
 * active-feature toggles whose feature is gone. Pure — returns a new session.
 */
export function reconcileSessionAfterBuild(
  prev: CharacterData,
  next: CharacterData,
  session: SessionState
): SessionState {
  const out: SessionState = { ...session };

  out.hp = {
    ...session.hp,
    current: Math.max(0, Math.min(session.hp.current, next.hp.max)),
  };

  const hitDiceTotal = next.hitDiceTotalOverride ?? totalLevel(next);
  out.hitDice = { used: Math.max(0, Math.min(session.hitDice.used, hitDiceTotal)) };

  // Key by `slotUsageKey` (NOT bare level) so a Sorlock's Pact pool (`pact-1`)
  // survives a build edit — keying the totals map by `String(level)` would leave
  // `pact-1` absent and silently DROP the row, resetting the Pact pool's spend (B3).
  const slotTotals = new Map(next.spellSlots.map((s) => [slotUsageKey(s), s.total]));
  const slots: SessionState["spellSlots"] = {};
  for (const [key, row] of Object.entries(session.spellSlots)) {
    const total = slotTotals.get(key);
    if (total === undefined) continue; // slot level gone — drop the row
    slots[key] = { used: Math.max(0, Math.min(row.used, total)) };
  }
  out.spellSlots = slots;

  // Concentration — clear it when the edit REMOVED the spell it's on. The stored
  // value is the spell's stable srdId (golden rule 7), so this is a direct id
  // check; a `custom:`-marked value never matches an srdId, so a custom-spell
  // concentration is left intact.
  if (session.concentration) {
    const nextIds = new Set(next.spells.flatMap((s) => ("custom" in s ? [] : [s.srdId])));
    const removedIds = new Set(
      prev.spells.flatMap((s) => ("custom" in s || nextIds.has(s.srdId) ? [] : [s.srdId]))
    );
    if (removedIds.has(session.concentration)) out.concentration = "";
  }

  // Active while-active toggles — drop ids whose feature the edit removed.
  if (session.activeFeatures?.length) {
    const nextFeatureIds = new Set(
      next.features.flatMap((f) => ("srdId" in f ? [f.srdId] : []))
    );
    const prevFeatureIds = new Set(
      prev.features.flatMap((f) => ("srdId" in f ? [f.srdId] : []))
    );
    out.activeFeatures = session.activeFeatures.filter(
      (id) => !(prevFeatureIds.has(id) && !nextFeatureIds.has(id))
    );
  }

  return out;
}

// ─── Discard summary (the confirm dialog's "what you will lose") ─────────────

export interface BuildDiscardSummary {
  /** Subclass ids auto-cleared (level fell below the gain level / class change). */
  subclassesCleared: string[];
  /** Feat srd ids removed (lost ASI levels / origin re-projection). */
  featsRemoved: string[];
  /** Spell srd ids removed from the list. */
  spellsRemoved: string[];
  /** Class/subclass feature refs dropped. */
  classFeaturesRemoved: number;
  /** Per-entry picks dropped, summed across kinds (maneuvers, invocations, …). */
  picksRemoved: number;
  /** Skill ids demoted from expertise back to proficient. */
  expertiseDemoted: string[];
  /** `next.hp.max − prev.hp.max` (negative on a level-down). */
  hpMaxDelta: number;
  /** True when ASI levels were lost — baked ability-score increases canNOT be
   *  auto-reverted (no record of which ability each ASI raised); the player must
   *  review their scores. */
  abilityReviewNeeded: boolean;
}

/** True when the summary has nothing the player would care to read. */
export function isDiscardSummaryEmpty(s: BuildDiscardSummary): boolean {
  return (
    s.subclassesCleared.length === 0 &&
    s.featsRemoved.length === 0 &&
    s.spellsRemoved.length === 0 &&
    s.classFeaturesRemoved === 0 &&
    s.picksRemoved === 0 &&
    s.expertiseDemoted.length === 0 &&
    s.hpMaxDelta === 0 &&
    !s.abilityReviewNeeded
  );
}

/**
 * Diff a build edit's DISCARDS — what `reconcileBuildChoices(prev, …)` dropped or
 * reset — so the Bio tab's confirm modal can LIST the consequences instead of a
 * vague warning (impeccable rule: never silently destroy user choices). Pure,
 * id-based; the UI localizes the names.
 */
export function summarizeBuildDiscards(
  prev: CharacterData,
  next: CharacterData
): BuildDiscardSummary {
  const prevClasses = getClasses(prev);
  const nextClasses = getClasses(next);

  const subclassesCleared: string[] = [];
  for (const pe of prevClasses) {
    if (!pe.subclassId) continue;
    const ne = nextClasses.find((e) => e.classId === pe.classId);
    if (ne && !ne.subclassId) subclassesCleared.push(pe.subclassId);
  }

  const prevFeatureIds = prev.features.flatMap((f) => ("srdId" in f ? [f.srdId] : []));
  const nextFeatureIds = new Set(
    next.features.flatMap((f) => ("srdId" in f ? [f.srdId] : []))
  );
  const removedFeatureIds = prevFeatureIds.filter((id) => !nextFeatureIds.has(id));
  const featsRemoved = removedFeatureIds.filter((id) => FEATS_BY_ID.has(id));
  const classFeaturesRemoved = removedFeatureIds.filter((id) =>
    CLASS_FEATURE_IDS.has(id)
  ).length;

  const nextSpellIds = new Set(
    next.spells.flatMap((s) => ("custom" in s ? [] : [s.srdId]))
  );
  const spellsRemoved = prev.spells.flatMap((s) =>
    "custom" in s || nextSpellIds.has(s.srdId) ? [] : [s.srdId]
  );

  let picksRemoved = 0;
  for (const key of ENTRY_PICK_KEYS) {
    const prevCount = prevClasses.reduce((n, e) => n + (e[key]?.length ?? 0), 0);
    const nextCount = nextClasses.reduce((n, e) => n + (e[key]?.length ?? 0), 0);
    picksRemoved += Math.max(0, prevCount - nextCount);
  }

  const expertiseDemoted = Object.entries(prev.skills)
    .filter(([id, v]) => v === "expertise" && next.skills[id] !== "expertise")
    .map(([id]) => id);

  return {
    subclassesCleared,
    featsRemoved,
    spellsRemoved,
    classFeaturesRemoved,
    picksRemoved,
    expertiseDemoted,
    hpMaxDelta: next.hp.max - prev.hp.max,
    abilityReviewNeeded: asiEntitlement(nextClasses) < asiEntitlement(prevClasses),
  };
}
