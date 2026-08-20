/** Pure conformance for durable program-root authority receipts. */

import {
  canonicalFingerprint,
  canonicalJson,
  type CanonicalFingerprint,
} from "@/lib/canonical-fingerprint";
import { exactConformer, type ExactSchemaContext } from "@/lib/exact-schema";
import { conformIntegerBindings } from "@/lib/integer-expression";
import { MECHANICS_AUTHORITY_REF_SCHEMA_REFS } from "@/lib/mechanics-authority-ref";
import {
  MECHANICS_CAPABILITY_SCHEMA_CUSTOMS,
  conformMechanicsCapabilitySnapshot,
} from "@/lib/mechanics-capability";
import {
  MECHANICS_PROGRAM_AUTHORITY_RECEIPT_SCHEMA,
  type MechanicsProgramAuthorityReceiptSchemaCustomTypes,
} from "@/lib/mechanics-program-receipt-schema";
import type { MechanicsProgramAuthorityReceipt } from "@/types/mechanics-program-receipt";

type MechanicsProgramAuthorityReceiptSchemaRefTypes = {
  readonly [Name in keyof typeof MECHANICS_AUTHORITY_REF_SCHEMA_REFS]: unknown;
};
type InstallationOwner = MechanicsProgramAuthorityReceipt["installation"]["owner"];
type EntityInstallationOwner = Extract<InstallationOwner, { readonly entityId: string }>;

const SCHEMA_CONTEXT: ExactSchemaContext<
  MechanicsProgramAuthorityReceiptSchemaCustomTypes,
  MechanicsProgramAuthorityReceiptSchemaRefTypes
> = {
  customs: {
    ...MECHANICS_CAPABILITY_SCHEMA_CUSTOMS,
    "integer-bindings": conformIntegerBindings,
  },
  refs: MECHANICS_AUTHORITY_REF_SCHEMA_REFS,
};

const conformMechanicsProgramAuthorityReceiptStructure = exactConformer(
  MECHANICS_PROGRAM_AUTHORITY_RECEIPT_SCHEMA,
  SCHEMA_CONTEXT
);

function sameCanonical(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function isEntityActor(owner: InstallationOwner): owner is EntityInstallationOwner {
  return !("kind" in owner);
}

function receiptSemantics(receipt: MechanicsProgramAuthorityReceipt): boolean {
  const snapshot = conformMechanicsCapabilitySnapshot(receipt.snapshot);
  if (
    !snapshot ||
    snapshot.program === null ||
    snapshot.program.id !== snapshot.ref.capabilityId ||
    !sameCanonical(receipt.installation.capability, snapshot.ref)
  ) {
    return false;
  }

  const installationOwner = receipt.installation.owner;
  if (!isEntityActor(installationOwner)) {
    const definition = snapshot.ref.definition;
    return (
      receipt.source.kind === "table-declaration" &&
      definition.kind === "table-declaration" &&
      sameCanonical(receipt.source, definition) &&
      sameCanonical(installationOwner.material, definition.material) &&
      installationOwner.authority === definition.authority
    );
  }

  return (
    receipt.source.kind !== "capability" ||
    (sameCanonical(receipt.source.capability, receipt.installation.capability) &&
      sameCanonical(receipt.source.owner, installationOwner))
  );
}

/**
 * Validate, clone and deeply freeze the executable closure persisted by a
 * program root. Invocation guards and actor selection are deliberately absent.
 */
export function conformMechanicsProgramAuthorityReceipt(
  value: unknown
): Readonly<MechanicsProgramAuthorityReceipt> | null {
  const receipt = conformMechanicsProgramAuthorityReceiptStructure(value);
  return receipt && receiptSemantics(receipt) ? receipt : null;
}

/** Stable identity of the complete frozen executable closure carried by a root. */
export function mechanicsProgramAuthorityReceiptFingerprint(
  value: MechanicsProgramAuthorityReceipt
): CanonicalFingerprint {
  const receipt = conformMechanicsProgramAuthorityReceipt(value);
  if (!receipt) throw new TypeError("Invalid mechanics program authority receipt");
  return canonicalFingerprint(receipt);
}
