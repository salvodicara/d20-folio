/**
 * A Speed loss that landed on the character (edge-case M10: a monster's "the
 * target's Speed is reduced by 10 feet until the end of its next turn"), held as a
 * lit state until that turn edge. The state's key names the loss and its source, so
 * the same source landing twice lights the same key (it doesn't stack, SRD 5.2.1
 * Combining Game Effects) while another source's loss adds.
 */
import type { GrantSource } from "@/lib/grants";
import type { LocText } from "@/lib/loc-text";

const PREFIX = "rider-speed-loss:";

/** The state key for `feet` of Speed lost to `source` (an unnamed source: "?"). */
export function riderSpeedLossKey(feet: number, source?: LocText): string {
  return `${PREFIX}${String(feet)}:${source ? sourceIdentity(source) : "?"}`;
}

function sourceIdentity(source: LocText): string {
  if ("srd" in source) return `${source.srd.kind}/${source.srd.key}`;
  if ("custom" in source) return `custom/${source.custom}`;
  if ("ui" in source) return `ui/${source.ui}`;
  return `lit/${JSON.stringify(source.lit)}`;
}

/** The Speed each lit loss takes off, as grant sources for the sheet's fold. */
export function resolveRiderSpeedLossSources(
  activeKeys: ReadonlySet<string>
): GrantSource[] {
  return [...activeKeys].flatMap((key) => {
    if (!key.startsWith(PREFIX)) return [];
    const feet = Number(key.slice(PREFIX.length).split(":")[0]);
    if (!Number.isFinite(feet) || feet <= 0) return [];
    return [{ id: key, grants: [{ type: "speed" as const, amount: -feet }] }];
  });
}
