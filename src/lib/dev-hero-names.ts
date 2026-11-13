/**
 * The made-up name each role's sheet shows in dev. The fixtures are real players'
 * characters, and the dev screens reach every screenshot a session takes, so a live
 * character's name never shows (owner, 2026-11-12). The bard and the paladin keep the
 * names the dev campaign's member snapshots already use for them.
 */
export const DEV_HERO_NAMES: Readonly<Record<string, string>> = {
  barbarian: "Torva Rocciadura",
  bard: "Coralino di Sanvaldo",
  monk: "Kai Ventoquieto",
  paladin: "Bren Ironbeard of the Thunderhold",
  rogue: "Nessa Mezzanotte",
  wizard: "Ilario Lumevera",
};
