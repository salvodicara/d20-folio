import type { Grant } from "@/lib/grants";

/**
 * The standing effect of Freedom of Movement (SRD 5.2.1): magic can't give you the
 * Paralyzed or Restrained condition, and you have a Swim Speed equal to your Speed
 * (the from-magic-only caveat and the Difficult Terrain clause stay descriptive).
 * Shared by the spell and the Oil of Slipperiness.
 */
export const FREEDOM_OF_MOVEMENT_GRANTS: ReadonlyArray<Grant> = [
  { type: "condition-immunity", condition: "paralyzed" },
  { type: "condition-immunity", condition: "restrained" },
  { type: "swim-speed", amount: "equal-to-walking" },
];
