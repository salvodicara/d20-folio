/**
 * i18n no-redundant-(EN,IT)-pair guard (owner audit 2026-06-10, Part 2).
 *
 * The owner observed redundancy creeping into `common.json`: the SAME string
 * declared under multiple keys because it is referenced from different places.
 * Per the owner-approved SAFE-dedup rule: an identical **(EN value, IT value)
 * pair** under two keys ⇒ the same semantic unit ⇒ it should resolve through ONE
 * canonical key. (EN-identical-but-IT-different stays separate — context-dependent
 * translation.)
 *
 * This guard fails when a NEW duplicate (EN,IT) pair appears in `common.json` that
 * is not already in the FROZEN, justified baseline. The baseline
 * (`__fixtures__/i18n-known-duplicate-keys.json`) is the explicit
 * "legitimately-separate" inventory — the keys that share a value **by design**:
 *
 *   1. DYNAMIC / TOKEN-keyed lookups built at runtime from a stable token —
 *      `srd.castingTime_<token>`, `srd.armorCategory_<token>`, `srd.damageShort_*`,
 *      `srd.damage_*`, `srd.class_*`. The key is computed from data; it cannot
 *      collapse to a bare alias (golden rule 7: branch on ids/tokens, not labels).
 *   2. i18next PLURAL variants (`_one` / `_other`) whose singular/plural English
 *      happens to coincide — they are one logical key with two forms.
 *   3. CONTEXT-NAMESPACED labels whose translation may legitimately diverge per
 *      surface later (e.g. a nav item vs a creation-wizard step vs a sheet tab) —
 *      kept per-namespace so a future context-specific IT wording does not have to
 *      undo a merge.
 *
 * The genuinely-ACCIDENTAL duplicates (a string that already had a `common.*`
 * canonical home but was re-declared in a feature namespace) were merged in the
 * audit and rerouted to `common.*`; they are NOT in the baseline. To add a new
 * legitimate exception, MERGE first; only widen the baseline with a written reason
 * when the duplication is structural (dynamic/plural/namespaced) and un-mergeable.
 */
import { describe, it, expect } from "vitest";
// SLICE 8: `common.json` is split into per-domain `ui/<group>.json` shards;
// reconstruct the full catalogue from the shards (same merge the runtime does).
import { mergedUi } from "./__helpers__/ui-merged";
// DRY (golden rule 6): the catalogue flattener is the ONE shared with the
// build-time leak-lock detectors (`scripts/i18n/`), not a re-implementation.
import { flatEntries, type Json } from "../../scripts/i18n/leak-detectors";
import KNOWN_DUPLICATE_KEYS from "./__fixtures__/i18n-known-duplicate-keys.json";

const en = mergedUi("en") as Json;
const itLocale = mergedUi("it") as Json;

const enEntries = flatEntries(en);
const itEntries = flatEntries(itLocale);

/** Keys that share an identical (EN,IT) pair with at least one other key. */
function duplicateKeys(): string[] {
  const bySig = new Map<string, string[]>();
  for (const [k, ev] of enEntries) {
    const iv = itEntries.get(k);
    if (typeof ev !== "string" || typeof iv !== "string") continue;
    if (ev.trim() === "") continue;
    const sig = JSON.stringify([ev, iv]);
    const bucket = bySig.get(sig) ?? [];
    bucket.push(k);
    bySig.set(sig, bucket);
  }
  return [...bySig.values()]
    .filter((ks) => ks.length > 1)
    .flat()
    .sort();
}

describe("i18n no-redundant-(EN,IT)-pair guard (common.json)", () => {
  const known = new Set<string>(KNOWN_DUPLICATE_KEYS);

  it("introduces NO new duplicate (EN,IT) pair outside the justified baseline", () => {
    const dups = duplicateKeys();
    const unexpected = dups.filter((k) => !known.has(k));
    expect(
      unexpected,
      "these keys share an identical (EN,IT) pair with another key but are not in " +
        "the justified baseline — MERGE them to one canonical key (prefer common.*) " +
        "and reroute callers, or (if dynamic/plural/namespaced) add them to " +
        "tests/unit/__fixtures__/i18n-known-duplicate-keys.json WITH a reason:\n" +
        unexpected.join("\n")
    ).toEqual([]);
  });

  it("the baseline does not list a key that is no longer a duplicate (keep it lean)", () => {
    const dups = new Set(duplicateKeys());
    const stale = [...known].filter((k) => !dups.has(k)).sort();
    expect(
      stale,
      "these keys are in the duplicate baseline but no longer share a value — " +
        "remove them from i18n-known-duplicate-keys.json:\n" +
        stale.join("\n")
    ).toEqual([]);
  });

  it("the merged-away accidental duplicates are gone (rerouted to common.*)", () => {
    // The audit merged these feature-namespaced re-declarations into common.*.
    const merged = [
      "palette.hintClose",
      "campaignHub.add",
      "campaignHub.remove",
      "campaignHub.logShowLess",
      "combat.reset",
      "deathSaves.reset",
      "combat.use",
      "equipment.use",
      "character.editMode.label",
      "create.levelLabel",
      "report.removeScreenshot",
      "character.level", // dead key, removed
    ];
    const stillPresent = merged.filter((k) => enEntries.has(k));
    expect(
      stillPresent,
      `these redundant keys should have been deleted:\n${stillPresent.join("\n")}`
    ).toEqual([]);
  });
});
