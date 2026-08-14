import { describe, expect, it } from "vitest";

import { MOCK_CHARACTER } from "@/lib/mock";
import {
  characterSelfRef,
  characterSlotDefinitionFacts,
  characterSpellCapability,
  characterWorldState,
  commitCharacterAction,
} from "@/lib/mechanics-world-store";
import { runMechanicsCausalAction } from "@/lib/mechanics-coordinator";
import { mechanicsAuthorityDefinitionFingerprint } from "@/lib/mechanics-authority";
import {
  mechanicsDefinitionFactAddress,
  mechanicsInstallationFactAddress,
} from "@/lib/mechanics-authority-ref";
import { mechanicsCapabilitySnapshotFingerprint } from "@/lib/mechanics-capability";
import { beginMechanicsCausalState } from "@/lib/mechanics-world";
import type { MechanicsAuthorityDefinition } from "@/types/mechanics-authority";
import type { MechanicsProgramAuthorityReceipt } from "@/types/mechanics-program-receipt";
import type { MechanicsAnswer } from "@/types/mechanics-program";
import type { ResolvedActionFact } from "@/types/action-journal";

function authorityDefinition(
  authority: Readonly<MechanicsProgramAuthorityReceipt>
): MechanicsAuthorityDefinition {
  const definition: MechanicsAuthorityDefinition = {
    actorSpec: { kind: "role", role: "owner" },
    anchors: authority.anchors,
    definitionGuards: [
      {
        address: mechanicsDefinitionFactAddress(authority.snapshot.ref.definition),
        expected: {
          present: true,
          value: mechanicsCapabilitySnapshotFingerprint(authority.snapshot),
        },
        lifecycle: "commit",
        owner: authority.installation.owner,
      },
    ],
    installation: authority.installation,
    installationGuards: [],
    owner: authority.installation.owner,
    snapshot: authority.snapshot,
    source: authority.source,
    staticBindings: authority.staticBindings,
  };
  return {
    ...definition,
    installationGuards: [
      {
        address: mechanicsInstallationFactAddress(authority.installation),
        expected: {
          present: true,
          value: mechanicsAuthorityDefinitionFingerprint(definition),
        },
        lifecycle: "commit",
        owner: authority.installation.owner,
      },
    ],
  };
}

describe("mechanics world store", () => {
  it("derives the mock character's world once from the legacy session", () => {
    const world = characterWorldState(MOCK_CHARACTER, "test-uid", 60);
    expect(world).not.toBeNull();
    if (!world) return;
    expect(world.vitals.hitPoints.current).toBeLessThanOrEqual(60);
    expect(Object.keys(world.resources.standardSpellSlots).length).toBeGreaterThan(0);
    expect(world.resources.currency.gp.current).toBe(MOCK_CHARACTER.session.currency.gp);
  });

  it("casts a transcribed spell against the derived world and mirrors the slot", () => {
    const world = characterWorldState(MOCK_CHARACTER, "test-uid", 60);
    if (!world) throw new Error("world fixture");
    const capability = characterSpellCapability(
      MOCK_CHARACTER,
      "test-uid",
      "cure-wounds",
      {
        castingModifier: 0,
        maxHp: 60,
        saveDc: 15,
      }
    );
    expect(capability).not.toBeNull();
    if (!capability) return;

    const self = characterSelfRef(MOCK_CHARACTER, "test-uid");
    const begun = beginMechanicsCausalState({
      documents: [
        {
          kind: "character",
          material: self.material,
          state: world,
        },
      ],
      scope: self.material,
    });
    if (!begun.ok) throw new Error(`begin: ${begun.reason}`);

    const slotLevels = Object.keys(world.resources.standardSpellSlots)
      .map(Number)
      .sort((a, b) => a - b);
    const castLevel = slotLevels.find((level) => level >= 1);
    if (castLevel === undefined) throw new Error("no slot");
    const before = world.resources.standardSpellSlots[String(castLevel)]?.current ?? 0;
    expect(before).toBeGreaterThan(0);

    const answers: MechanicsAnswer[] = [];
    const run = () =>
      runMechanicsCausalAction({
        answers,
        authoritySnapshot: { definitions: [authorityDefinition(capability.authority)] },
        facts: [
          ...capability.facts,
          ...characterSlotDefinitionFacts(MOCK_CHARACTER, "test-uid", world),
        ],
        frameAnswers: [],
        intent: {
          actionId: "cast-cure-wounds",
          factGuards: [],
          frame: {
            authority: capability.authority,
            invocation: {
              installation: capability.authority.installation,
              kind: "installed-capability",
            },
            rootReceipt: {
              kind: "create",
              materialEpoch: 0,
              next: { execution: 1, phaseId: "resolve", triggerEventId: null },
              root: {
                occurrence: { material: self.material, occurrenceId: "cast-1" },
                ordinal: world.nextOccurrenceOrdinal,
              },
            },
            trigger: { kind: "invocation" },
          },
        },
        responses: [],
        state: begun.value,
        turnEconomy: [],
      });

    const trailIds = (value: unknown): string[] => [
      ...new Set(
        [...JSON.stringify(value).matchAll(/"trailId":"([^"]+)"/g)].map(
          (match) => match[1] ?? ""
        )
      ),
    ];
    let outcome = run();
    for (
      let remaining = 8;
      outcome.status === "needs-answer" && remaining > 0;
      remaining -= 1
    ) {
      const requirement = outcome.requirement;
      if (!requirement) throw new Error("missing requirement");
      if (requirement.kind === "resource") {
        answers.push({
          inputId: requirement.inputId,
          kind: "resource",
          resource: {
            character: self.material,
            kind: "standard-spell-slot",
            level: castLevel,
          },
        });
      } else if (requirement.kind === "entities") {
        answers.push({
          inputId: requirement.inputId,
          kind: "entities",
          targets: [self],
        });
      } else if (requirement.kind === "dice") {
        answers.push({
          inputId: requirement.inputId,
          kind: "dice",
          requests: requirement.requests.map(({ identity, roll }) => ({
            identity,
            observation: {
              aggregates: [],
              trails: trailIds(roll).map((trailId) => ({
                initialFace: 4,
                steps: [],
                trailId,
              })),
            },
            payments: [],
          })),
        });
      } else {
        throw new Error(`unexpected requirement: ${requirement.kind}`);
      }
      outcome = run();
    }
    if (outcome.status === "rejected") throw new Error(JSON.stringify(outcome));
    expect(outcome.status).toBe("complete");
    if (outcome.status !== "complete" || !outcome.action) return;

    const resolvedFacts: ResolvedActionFact[] = outcome.action.guards.facts.map(
      (fact) => ({
        actual: fact.expected,
        address: fact.address,
        owner: fact.owner,
      })
    );
    const committed = commitCharacterAction(
      MOCK_CHARACTER,
      "test-uid",
      world,
      outcome.action,
      resolvedFacts
    );
    expect(committed).not.toBeNull();
    if (!committed) return;
    expect(committed.world.resources.standardSpellSlots[String(castLevel)]?.current).toBe(
      before - 1
    );
    expect(committed.session.world).toBeDefined();
    const mirroredUsed =
      committed.session.spellSlots[`slot-${castLevel}`]?.used ??
      Object.entries(committed.session.spellSlots).find(([key]) =>
        key.includes(String(castLevel))
      )?.[1]?.used;
    expect(mirroredUsed).toBeGreaterThanOrEqual(1);
  });
});
