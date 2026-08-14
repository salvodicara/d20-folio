import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { classFeatureIndex } from "@/data/classes";
import { FEATS_BY_ID } from "@/data/feats";
import { raceFeatureIndex, SRD_RACES } from "@/data/races";
import { spells } from "@/data/spells";
import {
  transcribeFeatureAction,
  transcribeSpell,
  transcribeWeaponAttack,
  type FeatureActionContext,
} from "@/lib/mechanics-transcription";
import type { SrdActionDef } from "@/data/types";

/** One feature-action census subject, derived entirely from the catalogue. */
interface FeatureActionSubject {
  readonly action: Readonly<SrdActionDef>;
  readonly context: FeatureActionContext;
  readonly featureId: string;
  readonly ordinal: number;
  readonly srd: boolean;
}

/**
 * Enumerate every action of every composed feature source (class features,
 * feats, race traits) with the context the CATALOGUE alone derives: the
 * feature's tracker identity, its while-active buffs, and the payment pool's
 * unit/die. Session facts (scaling level, chosen ancestry) stay absent here —
 * an action needing them honestly reports its boundary in this census even
 * though the runtime capability resolves it.
 */
function featureActionSubjects(): readonly FeatureActionSubject[] {
  const raceSourceById = new Map(SRD_RACES.map((race) => [race.id, race.source]));
  const sources = [
    ...classFeatureIndex.values(),
    ...FEATS_BY_ID.values(),
    ...raceFeatureIndex.values(),
  ];
  const trackerSpecFor = (
    feature: (typeof sources)[number],
    action: Readonly<SrdActionDef>
  ) => {
    if (action.costTrackerOverride !== undefined && "mechanics" in feature) {
      const mechanics = feature.mechanics as
        | {
            extraTrackers?: readonly {
              id: string;
              die?: string;
              isPool?: boolean;
              unit?: string;
            }[];
          }
        | undefined;
      const extra = mechanics?.extraTrackers?.find(
        (candidate) => candidate.id === action.costTrackerOverride
      );
      if (extra) return extra;
    }
    if (action.costTracker !== undefined) {
      const crossFeature =
        classFeatureIndex.get(action.costTracker) ??
        FEATS_BY_ID.get(action.costTracker) ??
        raceFeatureIndex.get(action.costTracker);
      return crossFeature?.mechanics?.tracker ?? feature.mechanics?.tracker;
    }
    return feature.mechanics?.tracker;
  };
  return sources.flatMap((feature) => {
    const actions = feature.mechanics?.actions ?? [];
    const whileActive =
      "grants" in feature
        ? (feature.grants ?? []).flatMap((grant) =>
            grant.type === "while-active"
              ? [
                  {
                    activeKey: grant.activeKey,
                    maintained: grant.duration?.kind === "maintained",
                  },
                ]
              : []
          )
        : [];
    const srd =
      "raceId" in feature
        ? raceSourceById.get(feature.raceId) === "SRD"
        : "source" in feature
          ? feature.source === "SRD"
          : false;
    return actions.map((action, ordinal) => {
      const tracker = trackerSpecFor(feature, action);
      // A payment POOL that declares its own die is a dice pool (Warrior of
      // the Gods' d12s); a die-less pool holds points (Lay on Hands).
      const poolDie =
        tracker &&
        "die" in tracker &&
        tracker.die !== undefined &&
        "isPool" in tracker &&
        tracker.isPool === true
          ? tracker.die
          : undefined;
      // A granted die's BASE face comes off the owning feature's own tracker
      // declaration (Bardic Inspiration's d6; level tiers refine it at
      // runtime through the session-resolved `classDie`).
      const grantDieBase =
        action.grantDie !== undefined &&
        feature.mechanics?.tracker !== undefined &&
        "die" in feature.mechanics.tracker
          ? feature.mechanics.tracker.die
          : undefined;
      // A top-up target tracker's full-recovery rest is a catalogue fact of
      // the TARGET feature (Uncanny Metabolism refills Focus as its short
      // rest would).
      const topUpTarget =
        action.trackerTopUp !== undefined
          ? (classFeatureIndex.get(action.trackerTopUp.trackerId) ??
            FEATS_BY_ID.get(action.trackerTopUp.trackerId) ??
            raceFeatureIndex.get(action.trackerTopUp.trackerId))
          : undefined;
      const topUpRecovery =
        topUpTarget?.mechanics?.tracker?.recovery === "short-rest" ||
        topUpTarget?.mechanics?.tracker?.recovery === "long-rest"
          ? topUpTarget.mechanics.tracker.recovery
          : undefined;
      const context: FeatureActionContext = {
        ...(feature.mechanics?.tracker ? { trackerId: feature.id } : {}),
        ...(whileActive.length > 0 ? { whileActive } : {}),
        ...(poolDie !== undefined ? { poolDie } : {}),
        ...(grantDieBase !== undefined ? { classDie: grantDieBase } : {}),
        ...(topUpRecovery !== undefined ? { topUpRecovery } : {}),
      };
      return { action, context, featureId: feature.id, ordinal, srd };
    });
  });
}

/**
 * The corpus-wide transcription guard. Its subjects are DERIVED from the
 * composed catalogues themselves, so a new or renamed entity can never fall out
 * of the sweep. What it cannot see: whether a clause SHOULD carry a different
 * classification than the transcriber assigned — that judgment lives in the
 * per-entity conformance tests and the generated coverage report.
 */
describe("corpus transcription", () => {
  it("classifies every composed spell without gaps", () => {
    expect(spells.length).toBeGreaterThan(0);
    const breakdown = new Map<string, number>();
    for (const spell of spells) {
      const transcription = transcribeSpell(spell);
      expect(transcription.entityId).toBe(spell.id);
      expect(transcription.clauses.length).toBeGreaterThan(0);
      for (const entry of transcription.clauses) {
        breakdown.set(entry.status, (breakdown.get(entry.status) ?? 0) + 1);
      }
      if (transcription.program) {
        expect(transcription.program.id).toBe(`spell:${spell.id}`);
        expect(
          transcription.clauses.some((entry) => entry.status === "unsupported")
        ).toBe(false);
      }
    }
    const automated = breakdown.get("automated") ?? 0;
    expect(automated).toBeGreaterThan(0);

    if (process.env.WRITE_AUTOMATION_COVERAGE === "1") {
      const entities = spells.flatMap((spell) => {
        if (spell.source !== "SRD") return [];
        const transcription = transcribeSpell(spell);
        return [
          {
            clauses: transcription.clauses,
            executable: transcription.program !== null,
            id: spell.id,
          },
        ];
      });
      const executable = spells.filter(
        (spell) => transcribeSpell(spell).program !== null
      ).length;
      writeFileSync(
        resolve(process.cwd(), "docs/automation-coverage.generated.json"),
        `${JSON.stringify(
          {
            entities,
            executablePrograms: executable,
            family: "spells",
            totalEntities: spells.length,
            totals: Object.fromEntries(breakdown),
          },
          null,
          2
        )}\n`
      );
    }
  });

  it("classifies every composed feature action without gaps", () => {
    const subjects = featureActionSubjects();
    expect(subjects.length).toBeGreaterThan(0);
    const breakdown = new Map<string, number>();
    let executable = 0;
    for (const subject of subjects) {
      const transcription = transcribeFeatureAction(
        subject.featureId,
        subject.action,
        subject.ordinal,
        subject.context
      );
      expect(transcription.actionId).toBe(
        `action:${subject.featureId}:${subject.action.id ?? String(subject.ordinal)}`
      );
      expect(transcription.clauses.length).toBeGreaterThan(0);
      for (const entry of transcription.clauses) {
        breakdown.set(entry.status, (breakdown.get(entry.status) ?? 0) + 1);
      }
      if (transcription.program) {
        executable += 1;
        expect(
          transcription.clauses.some((entry) => entry.status === "unsupported")
        ).toBe(false);
      }
      // The honest ledger never silently converts an emission into a
      // conformance mystery: a failed conformance is a bug, not a boundary.
      expect(
        transcription.clauses.some((entry) => entry.detail === "program-conformance")
      ).toBe(false);
    }
    expect(executable).toBeGreaterThan(0);

    if (process.env.WRITE_AUTOMATION_COVERAGE === "1") {
      const entities = subjects.flatMap((subject) => {
        if (!subject.srd) return [];
        const transcription = transcribeFeatureAction(
          subject.featureId,
          subject.action,
          subject.ordinal,
          subject.context
        );
        return [
          {
            clauses: transcription.clauses,
            executable: transcription.program !== null,
            id: transcription.actionId,
          },
        ];
      });
      writeFileSync(
        resolve(process.cwd(), "docs/automation-coverage.feature-actions.generated.json"),
        `${JSON.stringify(
          {
            entities,
            executablePrograms: executable,
            family: "feature-actions",
            totalEntities: subjects.length,
            totals: Object.fromEntries(breakdown),
          },
          null,
          2
        )}\n`
      );
    }
  });

  it("emits an executable fireball program with save, half damage and upcast", () => {
    const fireball = spells.find((spell) => spell.id === "fireball");
    expect(fireball).toBeDefined();
    if (!fireball) return;
    const transcription = transcribeSpell(fireball);
    expect(transcription.program).not.toBeNull();
    expect(
      transcription.clauses.map(({ clauseId, status }) => [clauseId, status])
    ).toEqual(
      expect.arrayContaining([
        ["slot-payment", "automated"],
        ["targeting", "automated"],
        ["area-selection", "spatial"],
        ["saving-throw", "physical-input"],
        ["damage-roll", "physical-input"],
        ["damage-roll-on-save", "automated"],
        ["damage-roll-application", "automated"],
      ])
    );
    const phase = transcription.program?.phases[0];
    expect(phase?.inputs.map(({ inputId }) => inputId)).toEqual([
      "slot",
      "targets",
      "saves",
      "damage-roll",
    ]);
    expect(phase?.steps.map(({ stepId }) => stepId)).toEqual([
      "damage-roll-apply",
      "damage-roll-apply-half",
    ]);
  });

  it("emits divine spark as one roll gated by the heal-or-damage mode choice", () => {
    const feature = classFeatureIndex.get("cleric-divine-spark");
    expect(feature).toBeDefined();
    const action = feature?.mechanics?.actions?.[0];
    if (!feature || !action) return;
    const transcription = transcribeFeatureAction(feature.id, action, 0, {});
    expect(transcription.program).not.toBeNull();
    const phase = transcription.program?.phases[0];
    expect(phase?.inputs.map(({ inputId }) => inputId)).toEqual([
      "uses",
      "targets",
      "attack-mode",
      "attack-damage-type",
      "saves",
      "attack-damage-roll",
    ]);
    expect(phase?.steps.map(({ stepId }) => stepId)).toEqual([
      "attack-damage-necrotic-apply",
      "attack-damage-necrotic-apply-half",
      "attack-damage-radiant-apply",
      "attack-damage-radiant-apply-half",
      "attack-heal-apply",
    ]);
    expect(
      transcription.clauses.map(({ clauseId, status }) => [clauseId, status])
    ).toEqual(
      expect.arrayContaining([
        ["tracker-payment", "automated"],
        ["attack-mode-choice", "automated"],
        ["attack-damage-type-choice", "automated"],
        ["saving-throw", "physical-input"],
        ["attack-dice-scaling", "automated"],
        ["attack-bonus-term", "automated"],
        ["attack-heal", "automated"],
      ])
    );
  });

  it("transcribes a versatile topple weapon into the full attack program", () => {
    const transcription = transcribeWeaponAttack({
      actionId: "weapon-warhammer",
      attackBonus: 7,
      damage: "1d8+3",
      damageType: "bludgeoning",
      mastery: "topple",
      toppleDc: 15,
      versatileDamage: "1d10+3",
    });
    expect(transcription.actionId).toBe("weapon:weapon-warhammer");
    expect(transcription.program).not.toBeNull();
    const phase = transcription.program?.phases[0];
    expect(phase?.inputs.map(({ inputId }) => inputId)).toEqual([
      "targets",
      "grip",
      "attack",
      "damage-roll",
      "damage-roll-crit",
      "damage-roll-two-handed",
      "damage-roll-two-handed-crit",
      "use-topple",
      "topple-save",
    ]);
    expect(phase?.steps.map(({ stepId }) => stepId)).toEqual([
      "damage-roll-apply",
      "damage-roll-crit-apply",
      "damage-roll-two-handed-apply",
      "damage-roll-two-handed-crit-apply",
      "topple-prone",
    ]);
    expect(
      transcription.clauses.map(({ clauseId, status }) => [clauseId, status])
    ).toEqual(
      expect.arrayContaining([
        ["versatile-grip", "automated"],
        ["attack-roll", "physical-input"],
        ["attack-adjudication", "automated"],
        ["damage-crit-dice", "automated"],
        ["mastery-topple-choice", "automated"],
        ["mastery-topple-save", "physical-input"],
        ["mastery-topple-prone", "automated"],
        ["mastery-topple-lifetime", "table"],
      ])
    );
  });

  it("adds graze damage on a miss and keeps enemy-side masteries at the table", () => {
    const graze = transcribeWeaponAttack({
      actionId: "weapon-greatsword",
      attackBonus: 8,
      damage: "2d6+4",
      damageType: "slashing",
      grazeDamage: 4,
      mastery: "graze",
    });
    expect(graze.program).not.toBeNull();
    expect(graze.program?.phases[0]?.steps.map(({ stepId }) => stepId)).toContain(
      "graze-apply"
    );
    expect(
      graze.clauses.find((entry) => entry.clauseId === "mastery-graze")?.status
    ).toBe("automated");
    const vex = transcribeWeaponAttack({
      actionId: "weapon-rapier",
      attackBonus: 7,
      damage: "1d8+3",
      damageType: "piercing",
      mastery: "vex",
    });
    expect(vex.program).not.toBeNull();
    expect(vex.clauses.find((entry) => entry.clauseId === "mastery-vex")?.status).toBe(
      "table"
    );
  });
});
