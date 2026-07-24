/**
 * play-reference — the two on-demand reference sections at the foot of the Play
 * (Combat) tab: the combat PLAYBOOK (`CombatAlgorithm`) and the SRD situational
 * RULES reference (`SituationalRules`). Both render collapsed (header only) and
 * bloom their full body on demand; their open/closed state persists per user in
 * `uiStore.playRefSections`, keyed by these stable ids.
 *
 * A pure constants module (no JSX, no React) so the sheet surfaces, the uiStore,
 * the cockpit deep-link consumer, AND the ⌘K palette all agree on ONE source of
 * truth for the section ids + their scroll anchors (golden rule 6).
 */

/** The stable id of each collapsible Play-tab reference section (persistence key). */
export const PLAY_REF_SECTIONS = ["playbook", "rules"] as const;

export type PlayRefSection = (typeof PLAY_REF_SECTIONS)[number];

/**
 * The DOM id of each section's folio header — the `aria-labelledby` target AND the
 * element the palette scrolls into view once the section blooms.
 */
export const PLAY_REF_ANCHOR: Record<PlayRefSection, string> = {
  playbook: "play-ref-playbook",
  rules: "play-ref-rules",
};
