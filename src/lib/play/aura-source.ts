/**
 * The Aura of Protection a party paladin grants an ally, as the grant source the
 * ally's saves read (kept apart from `aura-of-protection.ts`, which reads the
 * aggregate, so the aggregate can import this without a cycle).
 */
import type { GrantSource } from "@/lib/grants";

/** The received aura as the grant source an ally's saves read, named for its paladin
 *  («Aura di Aldric»). */
export function partyAuraSource(aura: {
  from: string;
  name: string;
  bonus: number;
}): GrantSource {
  return {
    id: `aura-of-protection:${aura.from}`,
    label: { ui: "play.aura.source", params: { name: aura.name } },
    grants: [{ type: "save-bonus", amount: aura.bonus }],
  };
}

/** The prefix of the state that says the player stands outside a paladin's aura. */
export const OUT_OF_AURA_PREFIX = "out-of-aura:";
