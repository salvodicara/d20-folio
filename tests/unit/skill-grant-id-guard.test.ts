/**
 * Regression guard — every `skill-proficiency` / `expertise` grant id in the
 * SRD data must be a canonical lowercase `ALL_SKILLS` id.
 *
 * **The bug this prevents:** `character.skills` is a structured record keyed
 * by the lowercase SRD skill id (`"insight"`, `"sleight-of-hand"`), and the
 * consumer (`mergeSkillProficiencies`) merges grant ids verbatim — it does NOT
 * normalise casing. A capitalised grant id (`skill: "Insight"`) therefore lands
 * as a SEPARATE, non-canonical key that the abilities render and every skill
 * lookup miss, silently dropping the proficiency.
 *
 * This guard statically walks every grant-bearing SRD source (class features,
 * feats, race traits, backgrounds, magic items — including grants nested inside
 * `while-active` and `choice-grant-bundle` options) and asserts each
 * skill/expertise grant id is a member of `ALL_SKILLS`. A future capitalised or
 * mistyped id fails CI here, before it can corrupt a character sheet.
 *
 * Mirrors the existing pure-module guards (`pure-modules-guard.test.ts`): this
 * test imports only pure SRD data + `ALL_SKILLS`, so it runs in CI without any
 * Firebase env vars.
 */
import { describe, expect, it } from "vitest";
import { ALL_SKILLS } from "@/lib/compute";
import type { Grant } from "@/lib/grants";
import { classFeatures } from "@/data/classes";
import { SRD_FEATS } from "@/data/feats";
import { SRD_RACES } from "@/data/races";
import { SRD_BACKGROUNDS } from "@/data/backgrounds";
import { SRD_MAGIC_ITEMS } from "@/data/magic-items";

const SKILL_IDS = new Set(ALL_SKILLS.map((s) => s.id));

/**
 * A grant + the human-readable source label, so a failure points at the
 * offending row rather than just the bad id.
 */
interface LabeledGrant {
  source: string;
  grant: Grant;
}

/**
 * Flatten a grants array, recursing one level into the two grant kinds that
 * nest further grants (`while-active`, `choice-grant-bundle`). The evaluator
 * itself ignores deeper nesting, so matching its depth is sufficient.
 */
function flatten(grants: ReadonlyArray<Grant>, source: string): LabeledGrant[] {
  const out: LabeledGrant[] = [];
  for (const grant of grants) {
    out.push({ source, grant });
    if (grant.type === "while-active") {
      out.push(...flatten(grant.grants, `${source} › ${grant.activeKey}`));
    } else if (grant.type === "choice-grant-bundle") {
      for (const option of grant.options) {
        out.push(...flatten(option.grants, `${source} › ${option.id}`));
      }
    }
  }
  return out;
}

function collectAllGrants(): LabeledGrant[] {
  const all: LabeledGrant[] = [];
  for (const f of classFeatures) {
    if (f.grants) all.push(...flatten(f.grants, `class-feature:${f.id}`));
  }
  for (const f of SRD_FEATS) {
    if (f.grants) all.push(...flatten(f.grants, `feat:${f.id}`));
  }
  for (const race of SRD_RACES) {
    for (const trait of race.traits) {
      if (trait.grants) {
        all.push(...flatten(trait.grants, `race:${race.id}/${trait.id}`));
      }
    }
  }
  for (const b of SRD_BACKGROUNDS) {
    if (b.grants) all.push(...flatten(b.grants, `background:${b.id}`));
  }
  for (const item of SRD_MAGIC_ITEMS) {
    if (item.grants) all.push(...flatten(item.grants, `magic-item:${item.id}`));
  }
  return all;
}

describe("skill-proficiency / expertise grant ids are canonical ALL_SKILLS ids", () => {
  const labeled = collectAllGrants();
  const skillGrants = labeled.filter(
    (l) => l.grant.type === "skill-proficiency" || l.grant.type === "expertise"
  );

  it("finds at least one skill/expertise grant to validate (guard is wired up)", () => {
    expect(skillGrants.length).toBeGreaterThan(0);
  });

  it.each(skillGrants)(
    "$source → $grant.skill is a lowercase ALL_SKILLS id",
    ({ grant }) => {
      // Narrowed by the filter above; both kinds carry a `skill` field.
      const skill =
        grant.type === "skill-proficiency" || grant.type === "expertise"
          ? grant.skill
          : "";
      expect(skill).toBe(skill.toLowerCase());
      expect(SKILL_IDS).toContain(skill);
    }
  );
});
