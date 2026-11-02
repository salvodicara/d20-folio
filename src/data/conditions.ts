/**
 * SRD Conditions — D&D 2024
 *
 * All 15 standard conditions from the 2024 rules.
 * Source: D&D 2024 SRD (Creative Commons)
 */

import type { SrdConditionData } from "./types";

export const SRD_CONDITIONS: SrdConditionData[] = [
  {
    id: "blinded",
  },
  {
    id: "charmed",
  },
  {
    id: "deafened",
  },
  {
    id: "exhaustion",
  },
  {
    id: "frightened",
  },
  {
    id: "grappled",
  },
  {
    id: "incapacitated",
  },
  {
    id: "invisible",
  },
  {
    id: "paralyzed",
  },
  {
    id: "petrified",
  },
  {
    id: "poisoned",
  },
  {
    id: "prone",
  },
  {
    id: "restrained",
  },
  {
    id: "stunned",
  },
  {
    id: "unconscious",
  },
];

/** Get all condition IDs */
export function getAllConditionIds(): string[] {
  return SRD_CONDITIONS.map((c) => c.id);
}
