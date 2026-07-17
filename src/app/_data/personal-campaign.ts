/**
 * personal-campaign — the VIRTUAL "not in a shared campaign" sentinel.
 *
 * A character's campaign membership lives ENTIRELY on the campaign doc
 * (`campaigns/{id}.memberDetails[uid].characterId`), keyed by character id — the
 * character document itself carries NO campaign reference. A character that no
 * campaign points at is "solo"; that is the permanent, normal state for most
 * heroes (a character can now belong to more than one campaign at once).
 *
 * {@link PERSONAL_CAMPAIGN_ID} is the id the CAMPAIGN-LIST UI uses to represent that
 * solo state as one selectable, hidden "Personal Campaign" row, and which the hub /
 * member / command-palette surfaces guard against (it has no real Firestore document).
 * It is a UI sentinel only — never persisted to any Firestore document.
 */

/** The hidden, auto, solo "campaign" a character with no shared campaign lives in. */
export const PERSONAL_CAMPAIGN_ID = "personal";
