/** Pure conformance and identity for immutable executable capability bodies. */

import {
  canonicalFingerprint,
  type CanonicalFingerprint,
} from "@/lib/canonical-fingerprint";
import {
  exactConformer,
  type ExactSchemaContext,
  type ExactSchemaCustomConformers,
} from "@/lib/exact-schema";
import { conformGrant } from "@/lib/grants";
import {
  MECHANICS_AUTHORITY_REF_SCHEMA_CUSTOMS,
  MECHANICS_AUTHORITY_REF_SCHEMA_REFS,
} from "@/lib/mechanics-authority-ref";
import {
  MECHANICS_CAPABILITY_SNAPSHOT_SCHEMA,
  type MechanicsCapabilitySchemaCustomTypes,
} from "@/lib/mechanics-capability-schema";
import { conformMechanicsProgram } from "@/lib/mechanics-program-authoring";
import {
  conformMechanicId,
  type MaterialRefSchemaShape,
} from "@/lib/mechanics-reference-schema";
import { conformResourceSpec } from "@/lib/resources";
import type { MechanicsCapabilitySnapshot } from "@/types/mechanics-capability";

type MechanicsCapabilitySchemaRefTypes = {
  readonly "material-ref": MaterialRefSchemaShape;
};

function conformBlueprintRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Shared custom bindings for schemas that embed a capability snapshot. */
export const MECHANICS_CAPABILITY_SCHEMA_CUSTOMS: ExactSchemaCustomConformers<MechanicsCapabilitySchemaCustomTypes> =
  {
    ...MECHANICS_AUTHORITY_REF_SCHEMA_CUSTOMS,
    "blueprint-record": conformBlueprintRecord,
    grant: conformGrant,
    "mechanics-program": conformMechanicsProgram,
    "resource-spec": conformResourceSpec,
  };

const SCHEMA_CONTEXT: ExactSchemaContext<
  MechanicsCapabilitySchemaCustomTypes,
  MechanicsCapabilitySchemaRefTypes
> = {
  customs: MECHANICS_CAPABILITY_SCHEMA_CUSTOMS,
  refs: MECHANICS_AUTHORITY_REF_SCHEMA_REFS,
};

const conformMechanicsCapabilitySnapshotStructure = exactConformer(
  MECHANICS_CAPABILITY_SNAPSHOT_SCHEMA,
  SCHEMA_CONTEXT
);

function snapshotSemantics(snapshot: MechanicsCapabilitySnapshot): boolean {
  const executable =
    snapshot.ref.kind === "program" ||
    snapshot.ref.kind === "cast" ||
    snapshot.ref.kind === "attack" ||
    snapshot.ref.kind === "system";
  if (
    executable !== (snapshot.program !== null) ||
    (snapshot.program !== null && snapshot.program.id !== snapshot.ref.capabilityId)
  ) {
    return false;
  }

  for (const [resourceId, spec] of Object.entries(snapshot.resources)) {
    if (conformMechanicId(resourceId) === null || spec.id !== resourceId) return false;
  }

  for (const key of [
    ...Object.keys(snapshot.blueprints?.entities ?? {}),
    ...Object.keys(snapshot.blueprints?.items ?? {}),
  ]) {
    if (conformMechanicId(key) === null) return false;
  }

  const allGrantIds = new Set<string>();
  for (const [groupId, entries] of Object.entries(snapshot.grantGroups)) {
    if (conformMechanicId(groupId) === null) return false;
    const groupGrantIds = new Set<string>();
    for (const entry of entries) {
      if (
        groupGrantIds.has(entry.grantId) ||
        allGrantIds.has(entry.grantId) ||
        conformMechanicId(entry.grantId) === null
      ) {
        return false;
      }
      groupGrantIds.add(entry.grantId);
      allGrantIds.add(entry.grantId);
    }
  }
  return true;
}

export function conformMechanicsCapabilitySnapshot(
  value: unknown
): Readonly<MechanicsCapabilitySnapshot> | null {
  const snapshot = conformMechanicsCapabilitySnapshotStructure(value);
  return snapshot && snapshotSemantics(snapshot) ? snapshot : null;
}

/** Stable digest of the complete executable body. */
export function mechanicsCapabilitySnapshotFingerprint(
  value: MechanicsCapabilitySnapshot
): CanonicalFingerprint {
  const snapshot = conformMechanicsCapabilitySnapshot(value);
  if (!snapshot) throw new TypeError("Invalid mechanics capability snapshot");
  return canonicalFingerprint(snapshot);
}

export function mechanicsCapabilitySnapshotKey(
  value: MechanicsCapabilitySnapshot
): CanonicalFingerprint {
  return mechanicsCapabilitySnapshotFingerprint(value);
}
