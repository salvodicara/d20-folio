/**
 * «Ispirazione» on the Play header: what the character holds now. A Bardic Inspiration
 * die an ally gave them and Heroic Inspiration (2024 rules: one of each at a time),
 * counted for the chip like BG3's status icons.
 */
import type { CharacterDoc } from "@/types/character";

export const INSPIRATION_DICE = ["d6", "d8", "d10", "d12"] as const;
export type InspirationDie = (typeof INSPIRATION_DICE)[number];

export interface PlayInspirationView {
  heroic: boolean;
  die: InspirationDie | null;
  count: number;
}

export function playInspirationView(doc: CharacterDoc): PlayInspirationView {
  const raw = doc.session.bardicInspirationDie ?? "";
  const die = INSPIRATION_DICE.find((d) => d === raw) ?? null;
  const heroic = doc.session.inspiration === true;
  return { heroic, die, count: (heroic ? 1 : 0) + (die ? 1 : 0) };
}
