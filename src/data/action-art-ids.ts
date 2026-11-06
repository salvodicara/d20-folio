/**
 * The actions every character has that carry a painted icon of the `action` kind: the base
 * actions (Dash, Dodge…) by their id without `base-`, and the unarmed strike. Kept equal
 * to the rules' list by tests/unit/action-art-ids.test.ts.
 */
export const ACTION_ART_IDS: readonly string[] = [
  "dash",
  "dodge",
  "disengage",
  "help",
  "hide",
  "influence",
  "magic",
  "ready",
  "search",
  "study",
  "utilize",
  "object-interaction",
  "grapple",
  "shove",
  "escape-grapple",
  "opportunity-attack",
  "unarmed-strike",
];
