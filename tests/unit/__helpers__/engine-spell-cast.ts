/**
 * Engine spell casts for the world-store tests, built from spell programs
 * recorded once (2026-11-02) from the retired catalogue transcriber. The
 * programs are frozen test data: they drive the live kernel, commit, undo and
 * concentration readers exactly as an engine cast would.
 */
import { canonicalFingerprint } from "@/lib/canonical-fingerprint";
import { characterSelfRef } from "@/lib/mechanics-world-store";
import { conformMechanicsProgramAuthorityReceipt } from "@/lib/mechanics-program-receipt";
import type { ActionFactGuard } from "@/types/action-journal";
import type { CharacterDoc } from "@/types/character";
import type { CharacterMaterialState } from "@/types/material-state";
import type { MechanicsProgramAuthorityReceipt } from "@/types/mechanics-program-receipt";
import programs from "../__fixtures__/engine-spell-programs.json";

export type RecordedSpellId = keyof typeof programs;

export interface CharacterCastCapability {
  readonly authority: Readonly<MechanicsProgramAuthorityReceipt>;
  readonly facts: readonly Readonly<ActionFactGuard>[];
}

/** Build-derived numbers a recorded spell program binds at cast time. */
export interface CharacterCastDerived {
  readonly attackBonus: number;
  readonly castingModifier: number;
  readonly characterLevel: number;
  readonly maxHp: number;
  readonly saveDc: number;
}

/** The authority and guards to cast one recorded spell as the character. */
export function characterSpellCapability(
  doc: Readonly<CharacterDoc>,
  uid: string,
  spellId: RecordedSpellId,
  derived: Readonly<CharacterCastDerived>
): CharacterCastCapability | null {
  const program = programs[spellId];
  const self = characterSelfRef(doc, uid);
  const capability = {
    capabilityId: program.id,
    definition: {
      catalogueKind: "spell" as const,
      entityId: spellId,
      kind: "catalogue" as const,
      mechanicsRevision: canonicalFingerprint({ program }),
    },
    kind: "program" as const,
  };
  const authority = conformMechanicsProgramAuthorityReceipt({
    anchors: { activator: self, caster: self, owner: self, source: self, target: self },
    installation: {
      capability,
      generation: 1,
      installationId: `spell.${spellId}`,
      owner: self,
    },
    schema: 1,
    snapshot: { grantGroups: {}, program, ref: capability, resources: {}, schema: 1 },
    source: { capability, kind: "capability", owner: self },
    staticBindings: {
      "spell-attack-bonus": derived.attackBonus,
      "spellcasting-modifier": derived.castingModifier,
      "character-level": derived.characterLevel,
      "spell-save-dc": derived.saveDc,
    },
  });
  if (!authority) return null;
  const facts: ActionFactGuard[] = [
    {
      address: ["hit-point-maximum"],
      expected: { present: true, value: derived.maxHp },
      lifecycle: "commit-redo",
      owner: self,
    },
  ];
  return { authority, facts };
}

/** One resource-definition guard per spell-slot cell the world holds (each
 *  standard level, plus the pact pool when present). */
export function characterSlotDefinitionFacts(
  doc: Readonly<CharacterDoc>,
  uid: string,
  world: Readonly<CharacterMaterialState>
): readonly Readonly<ActionFactGuard>[] {
  const self = characterSelfRef(doc, uid);
  const spec = (id: string) => ({
    bindings: {},
    spec: {
      capacity: { kind: "unbounded" as const },
      id,
      initial: { kind: "empty" as const },
      kind: "count" as const,
      recoveries: [],
    },
  });
  const guard = (address: ActionFactGuard["address"], id: string): ActionFactGuard => ({
    address,
    expected: { present: true, value: spec(id) },
    lifecycle: "commit",
    owner: self,
  });
  return [
    ...Object.keys(world.resources.standardSpellSlots).map((level) =>
      guard(
        ["resource-definition", "resources", "standardSpellSlots", level],
        `standard-spell-slot-${level}`
      )
    ),
    ...(world.resources.pactSpellSlot !== null
      ? [guard(["resource-definition", "resources", "pactSpellSlot"], "pact-spell-slot")]
      : []),
  ];
}
