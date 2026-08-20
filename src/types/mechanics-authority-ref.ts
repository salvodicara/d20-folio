/** Public projections of the low-dependency mechanics authority identity grammar. */

import type {
  CatalogueKindSchemaShape,
  HomebrewDefinitionOwnerRefSchemaShape,
  MechanicsAuthorityAnchorsSchemaShape,
  MechanicsCapabilityInstallationRefSchemaShape,
  MechanicsCapabilityRefSchemaShape,
  MechanicsDefinitionRefSchemaShape,
  MechanicsInvocationRefSchemaShape,
  MechanicsRevisionSchemaShape,
  MechanicsSourceRefSchemaShape,
  TableDeclarationMechanicsDefinitionRefSchemaShape,
} from "@/lib/mechanics-authority-ref-schema";

export type CatalogueKind = CatalogueKindSchemaShape;
export type MechanicsRevision = MechanicsRevisionSchemaShape;
export type HomebrewDefinitionOwnerRef = HomebrewDefinitionOwnerRefSchemaShape;
export type TableDeclarationMechanicsDefinitionRef =
  TableDeclarationMechanicsDefinitionRefSchemaShape;
export type MechanicsDefinitionRef = MechanicsDefinitionRefSchemaShape;
export type MechanicsCapabilityRef = MechanicsCapabilityRefSchemaShape;
export type MechanicsSourceRef = MechanicsSourceRefSchemaShape;
export type MechanicsCapabilityInstallationRef =
  MechanicsCapabilityInstallationRefSchemaShape;
export type MechanicsInvocationRef = MechanicsInvocationRefSchemaShape;
export type MechanicsAuthorityAnchors = MechanicsAuthorityAnchorsSchemaShape;
