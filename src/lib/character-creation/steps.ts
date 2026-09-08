export const CREATION_STEPS = [
  "identity",
  "origins",
  "class",
  "abilities",
  "equipment",
  "review",
] as const;
export type CreationStep = (typeof CREATION_STEPS)[number];
